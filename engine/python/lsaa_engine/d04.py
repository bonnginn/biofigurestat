"""D04: complete one-factor repeated measurements."""

from __future__ import annotations

import math
from collections import defaultdict
from itertools import combinations
from typing import Any

import numpy as np
from scipy import stats

from .result_common import base_result, estimate


def _holm_adjust(p_values: list[float]) -> list[float]:
    count = len(p_values)
    order = sorted(range(count), key=lambda index: p_values[index])
    adjusted = [0.0] * count
    running = 0.0
    for rank, index in enumerate(order):
        running = max(running, (count - rank) * p_values[index])
        adjusted[index] = min(running, 1.0)
    return adjusted


def run_repeated_measures_anova(request: dict[str, Any]) -> dict[str, Any]:
    condition_ids = request.get("conditionIds")
    if not isinstance(condition_ids, list) or len(condition_ids) < 3:
        raise ValueError("D04 repeated-measures ANOVA requires at least three conditions")
    if len(set(condition_ids)) != len(condition_ids):
        raise ValueError("D04 condition IDs must be unique")
    if request.get("options", {}).get("multiplicityMethod") != "holm_paired_all_pairs":
        raise ValueError("D04 requires Holm-adjusted all-pairs comparisons")

    declared = set(condition_ids)
    pairs: dict[str, dict[str, float]] = defaultdict(dict)
    for observation in request.get("observations", []):
        condition_id = observation["conditionId"]
        pair_id = observation.get("pairId")
        if condition_id not in declared:
            raise ValueError("D04 observations must belong to a declared condition")
        if not pair_id:
            raise ValueError("Every D04 observation requires an explicit pair ID")
        if condition_id in pairs[pair_id]:
            raise ValueError("Each D04 pair requires exactly one analyzed value per condition")
        pairs[pair_id][condition_id] = float(observation["value"])

    if len(pairs) < 2:
        raise ValueError("D04 requires at least two complete matched units")
    incomplete = [pair_id for pair_id, values in pairs.items() if set(values) != declared]
    if incomplete:
        raise ValueError("Every D04 matched unit must contain all declared conditions")

    ordered_pairs = sorted(pairs)
    matrix = np.asarray(
        [[pairs[pair_id][condition_id] for condition_id in condition_ids] for pair_id in ordered_pairs],
        dtype=float,
    )
    if not np.all(np.isfinite(matrix)):
        raise ValueError("Analysis values must be finite numbers")

    unit_count, condition_count = matrix.shape
    grand_mean = float(np.mean(matrix))
    condition_means = np.mean(matrix, axis=0)
    unit_means = np.mean(matrix, axis=1)
    ss_total = float(np.sum((matrix - grand_mean) ** 2))
    ss_condition = float(unit_count * np.sum((condition_means - grand_mean) ** 2))
    ss_unit = float(condition_count * np.sum((unit_means - grand_mean) ** 2))
    ss_error = max(ss_total - ss_condition - ss_unit, 0.0)
    numerator_df = condition_count - 1
    denominator_df = (condition_count - 1) * (unit_count - 1)
    if ss_error <= 0:
        raise ValueError("Repeated-measures ANOVA is undefined when residual variance is zero")
    statistic = (ss_condition / numerator_df) / (ss_error / denominator_df)

    result = base_result(request)
    result["tests"].append(
        {
            "name": "one_way_repeated_measures_anova",
            "statisticName": "F",
            "statistic": float(statistic),
            "degreesOfFreedom": [float(numerator_df), float(denominator_df)],
            "pValue": float(stats.f.sf(statistic, numerator_df, denominator_df)),
            "adjustedPValue": None,
            "effectSizeName": "partial_eta_squared",
            "effectSize": float(ss_condition / (ss_condition + ss_error)),
        }
    )

    comparisons = list(combinations(range(condition_count), 2))
    raw_p_values: list[float] = []
    comparison_values: list[tuple[int, int, float, float, float, float]] = []
    confidence_level = float(request["options"]["confidenceLevel"])
    simultaneous_level = 1.0 - (1.0 - confidence_level) / len(comparisons)
    for first_index, second_index in comparisons:
        differences = matrix[:, first_index] - matrix[:, second_index]
        standard_deviation = float(np.std(differences, ddof=1))
        if standard_deviation <= 0:
            raise ValueError("A D04 paired comparison is undefined when all differences are identical")
        difference = float(np.mean(differences))
        standard_error = standard_deviation / math.sqrt(unit_count)
        degrees_of_freedom = unit_count - 1
        paired_test = stats.ttest_rel(matrix[:, first_index], matrix[:, second_index])
        critical = float(stats.t.ppf((1.0 + simultaneous_level) / 2.0, degrees_of_freedom))
        raw_p_values.append(float(paired_test.pvalue))
        comparison_values.append(
            (first_index, second_index, difference, standard_error, degrees_of_freedom, critical)
        )

    adjusted_p_values = _holm_adjust(raw_p_values)
    for comparison_index, values in enumerate(comparison_values):
        first_index, second_index, difference, standard_error, degrees_of_freedom, critical = values
        first_id = condition_ids[first_index]
        second_id = condition_ids[second_index]
        result["estimates"].append(
            estimate(
                f"{first_id}_minus_{second_id}",
                difference,
                standard_error,
                {
                    "level": simultaneous_level,
                    "lower": difference - critical * standard_error,
                    "upper": difference + critical * standard_error,
                },
            )
        )
        result["tests"].append(
            {
                "name": f"holm_paired:{first_id}:{second_id}",
                "statisticName": "t",
                "statistic": float(difference / standard_error),
                "degreesOfFreedom": [float(degrees_of_freedom)],
                "pValue": raw_p_values[comparison_index],
                "adjustedPValue": adjusted_p_values[comparison_index],
                "effectSizeName": "cohen_dz",
                "effectSize": float(difference / (standard_error * math.sqrt(unit_count))),
            }
        )

    result["diagnostics"] = [
        {
            "code": "complete_case_repeated_design",
            "message": "D04 used complete matched units only; row order was not used to infer correspondence.",
        },
        {
            "code": "sphericity_not_estimated",
            "message": "The initial repeated-measures ANOVA does not estimate a sphericity correction; use a mixed model when this assumption is not defensible.",
        },
        {
            "code": "simultaneous_pairwise_intervals",
            "message": "Pairwise confidence intervals use a Bonferroni simultaneous level while pairwise p-values use Holm adjustment.",
        },
    ]
    if unit_count < 3:
        result["warnings"].append(
            {
                "code": "very_small_biological_n",
                "message": "Fewer than three complete matched units are available; repeated-measures estimates are especially uncertain.",
            }
        )
    return result
