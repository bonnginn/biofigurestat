"""D09: correlation of two complete measurements from the same unit."""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy import stats

from .result_common import base_result, estimate


def run_correlation(request: dict[str, Any]) -> dict[str, Any]:
    method = request.get("method")
    if method not in {"pearson", "spearman"}:
        raise ValueError("D09 supports Pearson or Spearman correlation")
    condition_ids = request.get("variableConditionIds")
    if not isinstance(condition_ids, list) or len(condition_ids) != 2:
        raise ValueError("D09 requires exactly two declared variables")

    pairs: dict[str, dict[str, float]] = {}
    seen_observations: set[str] = set()
    for observation in request.get("observations", []):
        observation_id = observation.get("observationId")
        pair_id = observation.get("pairId")
        condition_id = observation.get("conditionId")
        if not isinstance(observation_id, str) or observation_id in seen_observations:
            raise ValueError("D09 observation IDs must be unique")
        seen_observations.add(observation_id)
        if not isinstance(pair_id, str) or condition_id not in condition_ids:
            raise ValueError("Every D09 observation must identify a declared variable and pair")
        pair = pairs.setdefault(pair_id, {})
        if condition_id in pair:
            raise ValueError("Each D09 unit can contribute only one value per variable")
        pair[condition_id] = float(observation["value"])

    if len(pairs) < 3:
        raise ValueError("D09 requires at least three complete units")
    incomplete = [pair_id for pair_id, values in pairs.items() if set(values) != set(condition_ids)]
    if incomplete:
        raise ValueError(f"D09 contains incomplete units: {', '.join(sorted(incomplete))}")
    ordered = sorted(pairs)
    x = np.asarray([pairs[pair_id][condition_ids[0]] for pair_id in ordered], dtype=float)
    y = np.asarray([pairs[pair_id][condition_ids[1]] for pair_id in ordered], dtype=float)
    if not np.all(np.isfinite(x)) or not np.all(np.isfinite(y)):
        raise ValueError("D09 values must be finite")
    if np.std(x, ddof=1) == 0 or np.std(y, ddof=1) == 0:
        raise ValueError("Correlation is undefined when either variable has zero variance")

    result = base_result(request)
    confidence_level = float(request.get("options", {}).get("confidenceLevel", 0.95))
    if method == "pearson":
        correlation = stats.pearsonr(x, y)
        coefficient = float(correlation.statistic)
        interval = correlation.confidence_interval(confidence_level=confidence_level)
        confidence_interval = {
            "level": confidence_level,
            "lower": float(interval.low),
            "upper": float(interval.high),
        }
        statistic_name = "r"
    else:
        correlation = stats.spearmanr(x, y)
        coefficient = float(correlation.statistic)
        confidence_interval = None
        statistic_name = "rho"

    result["estimates"] = [
        estimate(
            "correlation_coefficient",
            coefficient,
            None,
            confidence_interval,
        )
    ]
    result["tests"] = [
        {
            "name": f"{method}_correlation",
            "statisticName": statistic_name,
            "statistic": coefficient,
            "degreesOfFreedom": [float(len(ordered) - 2)],
            "pValue": float(correlation.pvalue),
            "adjustedPValue": None,
            "effectSizeName": statistic_name,
            "effectSize": coefficient,
        }
    ]
    result["diagnostics"] = [
        {
            "code": "association_not_causation",
            "message": "Correlation describes association and does not establish causation.",
        }
    ]
    if method == "spearman":
        result["warnings"].append(
            {
                "code": "spearman_ci_not_reported",
                "message": "The first Core Spearman implementation does not report a confidence interval.",
            }
        )
    if len(ordered) < 5:
        result["warnings"].append(
            {
                "code": "very_small_biological_n",
                "message": "Fewer than five complete units are available; the correlation estimate is highly uncertain.",
            }
        )
    return result
