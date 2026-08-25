"""D17: deterministic basic nonlinear XY fitting for kinetic series."""

from __future__ import annotations

from math import isfinite
from typing import Any, Callable

import numpy as np
from scipy import stats
from scipy.optimize import OptimizeWarning, curve_fit
import warnings

from .result_common import base_result, estimate


def _association(x: np.ndarray, baseline: float, plateau: float, rate: float) -> np.ndarray:
    return baseline + (plateau - baseline) * (1.0 - np.exp(-rate * x))


def _zero_baseline_association(x: np.ndarray, plateau: float, rate: float) -> np.ndarray:
    return plateau * (1.0 - np.exp(-rate * x))


MODELS: dict[str, tuple[Callable[..., np.ndarray], tuple[str, ...]]] = {
    "one_phase_association": (_association, ("baseline", "plateau", "rate")),
    "zero_baseline_association": (_zero_baseline_association, ("plateau", "rate")),
}


def _defaults(model_id: str, x: np.ndarray, y: np.ndarray) -> tuple[list[float], list[float], list[float]]:
    span = max(float(np.ptp(y)), max(abs(float(np.mean(y))), 1.0) * 0.05)
    x_span = float(np.ptp(x))
    rate = 2.0 / x_span
    if model_id == "one_phase_association":
        return (
            [float(np.min(y)), float(np.max(y)), rate],
            [float(np.min(y) - 2 * span), float(np.min(y) - span), 1e-12],
            [float(np.max(y) + span), float(np.max(y) + 3 * span), 100.0 / x_span],
        )
    return (
        [max(float(np.max(y)), span), rate],
        [0.0, 1e-12],
        [float(np.max(y) + 3 * span), 100.0 / x_span],
    )


def _fit_series(request: dict[str, Any], series_id: str, points: list[dict[str, Any]]) -> dict[str, Any]:
    model_id = request["modelId"]
    function, parameter_names = MODELS[model_id]
    x = np.asarray([point["x"] for point in points], dtype=float)
    y = np.asarray([point["y"] for point in points], dtype=float)
    if np.any(x < 0):
        raise ValueError("D17 association models require non-negative X values")
    unique_x = np.unique(x)
    if len(unique_x) < len(parameter_names) + 1:
        raise ValueError(
            f"D17 {series_id} requires at least {len(parameter_names) + 1} distinct X values"
        )
    if float(np.ptp(y)) <= max(abs(float(np.mean(y))), 1.0) * 1e-10:
        raise ValueError(f"D17 {series_id} is flat; nonlinear parameters are not identifiable")
    initial, lower, upper = _defaults(model_id, x, y)
    supplied_initial = request.get("initialValues", {}).get(series_id, {})
    supplied_bounds = request.get("bounds", {}).get(series_id, {})
    for index, name in enumerate(parameter_names):
        if name in supplied_initial:
            initial[index] = float(supplied_initial[name])
        if name in supplied_bounds:
            lower[index] = float(supplied_bounds[name]["lower"])
            upper[index] = float(supplied_bounds[name]["upper"])
        if not lower[index] < upper[index]:
            raise ValueError(f"D17 {series_id} bound for {name} must have lower < upper")
        if not lower[index] <= initial[index] <= upper[index]:
            raise ValueError(f"D17 {series_id} initial {name} must be inside its bounds")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", OptimizeWarning)
            parameters, covariance = curve_fit(
                function,
                x,
                y,
                p0=initial,
                bounds=(lower, upper),
                method="trf",
                max_nfev=20_000,
            )
    except (RuntimeError, ValueError, OptimizeWarning) as exc:
        raise ValueError(f"D17 {series_id} fit failed: {exc}") from exc
    if not np.all(np.isfinite(parameters)) or not np.all(np.isfinite(covariance)):
        raise ValueError(f"D17 {series_id} fit is non-identifiable; covariance is not finite")
    if np.linalg.matrix_rank(covariance) < len(parameter_names):
        raise ValueError(f"D17 {series_id} fit is non-identifiable; covariance is singular")
    fitted = function(x, *parameters)
    residuals = y - fitted
    rss = float(np.sum(residuals**2))
    df = len(y) - len(parameter_names)
    if df < 1:
        raise ValueError(f"D17 {series_id} has insufficient residual degrees of freedom")
    tss = float(np.sum((y - np.mean(y)) ** 2))
    r_squared = 1.0 - rss / tss if tss > 0 else 0.0
    if model_id == "one_phase_association" and parameters[1] <= parameters[0]:
        raise ValueError(f"D17 {series_id} fitted plateau does not exceed baseline")
    standard_errors = np.sqrt(np.diag(covariance))
    if not np.all(np.isfinite(standard_errors)):
        raise ValueError(f"D17 {series_id} parameter uncertainty is not identifiable")
    confidence_level = float(request["options"]["confidenceLevel"])
    critical = float(stats.t.ppf(1 - (1 - confidence_level) / 2, df))
    x_line = np.linspace(float(np.min(x)), float(np.max(x)), 120)
    y_line = function(x_line, *parameters)
    if not np.all(np.isfinite(y_line)):
        raise ValueError(f"D17 {series_id} fitted curve contains non-finite values")
    parameter_results = []
    for index, name in enumerate(parameter_names):
        value = float(parameters[index])
        se = float(standard_errors[index])
        parameter_results.append(
            estimate(
                f"{series_id}.{name}",
                value,
                se,
                {
                    "level": confidence_level,
                    "lower": value - critical * se,
                    "upper": value + critical * se,
                },
            )
        )
    rmse = float(np.sqrt(rss / df))
    aic = float(len(y) * np.log(max(rss / len(y), np.finfo(float).tiny)) + 2 * len(parameter_names))
    if not all(isfinite(value) for value in (rss, rmse, r_squared, aic)):
        raise ValueError(f"D17 {series_id} diagnostics are not finite")
    return {
        "seriesId": series_id,
        "converged": True,
        "parameters": parameter_results,
        "diagnostics": {
            "n": len(y),
            "distinctX": len(unique_x),
            "residualDegreesOfFreedom": df,
            "rss": rss,
            "rmse": rmse,
            "rSquared": max(0.0, min(1.0, r_squared)),
            "aic": aic,
        },
        "initialValues": {name: float(initial[index]) for index, name in enumerate(parameter_names)},
        "bounds": {
            name: {"lower": float(lower[index]), "upper": float(upper[index])}
            for index, name in enumerate(parameter_names)
        },
        "fittedCurve": [
            {"x": float(x_value), "y": float(y_value)}
            for x_value, y_value in zip(x_line, y_line, strict=True)
        ],
    }


def run_nonlinear_xy(request: dict[str, Any]) -> dict[str, Any]:
    model_id = request["modelId"]
    if model_id not in MODELS:
        raise ValueError(f"Unsupported D17 model: {model_id}")
    declared = request["seriesIds"]
    if len(declared) != len(set(declared)):
        raise ValueError("D17 series IDs must be unique")
    points_by_series: dict[str, list[dict[str, Any]]] = {series_id: [] for series_id in declared}
    observation_ids: set[str] = set()
    for point in request["points"]:
        if point["observationId"] in observation_ids:
            raise ValueError("D17 observation IDs must be unique")
        observation_ids.add(point["observationId"])
        if point["seriesId"] not in points_by_series:
            raise ValueError("Every D17 point must belong to a declared series")
        points_by_series[point["seriesId"]].append(point)
    fits = [_fit_series(request, series_id, points_by_series[series_id]) for series_id in declared]
    result = base_result(request)
    result["estimates"] = [parameter for fit in fits for parameter in fit["parameters"]]
    result["nonlinearFit"] = {
        "modelId": model_id,
        "modelVersion": "0.1.0",
        "modelFormula": (
            "baseline + (plateau - baseline) * (1 - exp(-rate * x))"
            if model_id == "one_phase_association"
            else "plateau * (1 - exp(-rate * x))"
        ),
        "selectionRationale": request["modelSelectionRationale"],
        "series": fits,
    }
    result["diagnostics"] = [
        {
            "code": "nonlinear_fit_authority",
            "message": "Fitted curves and parameters were computed by the deterministic local SciPy engine and persisted as the authoritative analysis result.",
        }
    ]
    return result
