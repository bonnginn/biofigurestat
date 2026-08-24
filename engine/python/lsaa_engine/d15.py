"""D15: Friedman omnibus plus Holm-adjusted paired Wilcoxon comparisons."""

from __future__ import annotations

from itertools import combinations
from typing import Any

import numpy as np
from scipy import stats

from .result_common import base_result, estimate


def _holm(p_values: list[float]) -> list[float]:
    order = sorted(range(len(p_values)), key=p_values.__getitem__)
    adjusted = [0.0] * len(p_values)
    running = 0.0
    for rank, index in enumerate(order):
        running = max(running, min(1.0, (len(p_values) - rank) * p_values[index]))
        adjusted[index] = running
    return adjusted


def run_friedman(request: dict[str, Any]) -> dict[str, Any]:
    condition_ids = request["conditionIds"]
    by_pair: dict[str, dict[str, float]] = {}
    for observation in request["observations"]:
        pair_id = observation["pairId"]
        condition_id = observation["conditionId"]
        if condition_id in by_pair.setdefault(pair_id, {}):
            raise ValueError("Each matched unit can contribute only one value per condition")
        by_pair[pair_id][condition_id] = float(observation["value"])
    if len(by_pair) < 2 or any(set(values) != set(condition_ids) for values in by_pair.values()):
        raise ValueError("Friedman analysis requires complete matched units across every condition")
    arrays = [np.asarray([by_pair[pair][condition] for pair in sorted(by_pair)], dtype=float) for condition in condition_ids]
    omnibus = stats.friedmanchisquare(*arrays)
    pairs = list(combinations(range(len(condition_ids)), 2))
    pair_results = [stats.wilcoxon(arrays[first], arrays[second], alternative="two-sided", method="auto") for first, second in pairs]
    adjusted = _holm([float(test.pvalue) for test in pair_results])
    result = base_result(request)
    result["tests"] = [{"name": "friedman_test", "statisticName": "chi_square", "statistic": float(omnibus.statistic), "degreesOfFreedom": [float(len(condition_ids) - 1)], "pValue": float(omnibus.pvalue), "adjustedPValue": None, "effectSizeName": "kendalls_w", "effectSize": float(omnibus.statistic / (len(by_pair) * (len(condition_ids) - 1)))}]
    for ((first, second), test, adjusted_p) in zip(pairs, pair_results, adjusted, strict=True):
        difference = arrays[first] - arrays[second]
        result["estimates"].append(estimate(f"median_paired_difference:{condition_ids[first]}:{condition_ids[second]}", float(np.median(difference)), None, None))
        result["tests"].append({"name": f"holm_wilcoxon:{condition_ids[first]}:{condition_ids[second]}", "statisticName": "W", "statistic": float(test.statistic), "degreesOfFreedom": None, "pValue": float(test.pvalue), "adjustedPValue": adjusted_p, "effectSizeName": None, "effectSize": None})
    result["diagnostics"] = [{"code": "matched_identity_preserved", "message": f"{len(by_pair)} complete biological units were matched by pairId; observations were not flattened."}]
    return result
