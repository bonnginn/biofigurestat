"""D16: ordinary least-squares simple linear regression."""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy import stats

from .result_common import base_result, estimate


def run_simple_regression(request: dict[str, Any]) -> dict[str, Any]:
    points = request["points"]
    unit_ids = [point["experimentalUnitId"] for point in points]
    if len(unit_ids) != len(set(unit_ids)):
        raise ValueError("Simple regression requires one independent X/Y point per experimental unit")
    x = np.asarray([point["x"] for point in points], dtype=float)
    y = np.asarray([point["y"] for point in points], dtype=float)
    n = len(x)
    include_intercept = bool(request["includeIntercept"])
    if np.ptp(x) == 0:
        raise ValueError("Regression requires variation in X")
    if include_intercept:
        design = np.column_stack([np.ones(n), x])
        df = n - 2
    else:
        design = x[:, None]
        df = n - 1
    if df < 1:
        raise ValueError("Regression has insufficient residual degrees of freedom")
    coefficients, _, _, _ = np.linalg.lstsq(design, y, rcond=None)
    intercept = float(coefficients[0]) if include_intercept else 0.0
    slope = float(coefficients[1] if include_intercept else coefficients[0])
    fitted = intercept + slope * x
    residuals = y - fitted
    mse = float(np.sum(residuals**2) / df)
    covariance = mse * np.linalg.inv(design.T @ design)
    slope_se = float(np.sqrt(covariance[-1, -1]))
    if slope_se == 0:
        raise ValueError("Slope test is undefined with zero residual variance")
    confidence_level = float(request["options"]["confidenceLevel"])
    critical = float(stats.t.ppf(1 - (1 - confidence_level) / 2, df))
    t_value = slope / slope_se
    alternative = request["options"]["alternative"]
    if alternative == "two_sided":
        p_value = float(2 * stats.t.sf(abs(t_value), df))
    elif alternative == "greater":
        p_value = float(stats.t.sf(t_value, df))
    else:
        p_value = float(stats.t.cdf(t_value, df))
    total = float(np.sum((y - np.mean(y)) ** 2)) if include_intercept else float(np.sum(y**2))
    r_squared = 1 - float(np.sum(residuals**2)) / total if total > 0 else 1.0
    x_line = np.linspace(float(np.min(x)), float(np.max(x)), 80)
    fitted_line = []
    inverse = np.linalg.inv(design.T @ design)
    for value in x_line:
        row = np.asarray([1.0, value] if include_intercept else [value])
        predicted = intercept + slope * value
        prediction_se = float(np.sqrt(mse * (row @ inverse @ row)))
        fitted_line.append({"x": float(value), "y": float(predicted), "lower": float(predicted - critical * prediction_se), "upper": float(predicted + critical * prediction_se)})
    result = base_result(request)
    result["estimates"] = [estimate("slope", slope, slope_se, {"level": confidence_level, "lower": slope - critical * slope_se, "upper": slope + critical * slope_se}), estimate("intercept", intercept, float(np.sqrt(covariance[0, 0])) if include_intercept else None, None)]
    result["tests"] = [{"name": "slope_hypothesis_test", "statisticName": "t", "statistic": t_value, "degreesOfFreedom": [float(df)], "pValue": p_value, "adjustedPValue": None, "effectSizeName": "r_squared", "effectSize": r_squared}]
    result["regression"] = {"slope": slope, "intercept": intercept, "rSquared": r_squared, "xRange": [float(np.min(x)), float(np.max(x))], "confidenceLevel": confidence_level, "fittedLine": fitted_line}
    result["diagnostics"] = [{"code": "regression_model", "message": f"OLS with {'an estimated intercept' if include_intercept else 'intercept explicitly fixed at zero'}; X={request['xLabel']} ({request['xUnit']}); Y={request['yLabel']} ({request['yUnit']})."}]
    return result
