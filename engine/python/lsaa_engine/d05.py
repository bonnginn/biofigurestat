"""D05: complete independent two-factor designs."""

from __future__ import annotations

import math
from collections import defaultdict
from itertools import combinations
from typing import Any

import numpy as np
from scipy import stats

from .result_common import base_result, estimate


def _sum_contrast(level_index: int, level_count: int) -> list[float]:
    if level_index == level_count - 1:
        return [-1.0] * (level_count - 1)
    return [1.0 if column == level_index else 0.0 for column in range(level_count - 1)]


def _fit_sse(matrix: np.ndarray, outcome: np.ndarray) -> tuple[float, int]:
    rank = int(np.linalg.matrix_rank(matrix))
    if rank != matrix.shape[1]:
        raise ValueError("D05 factorial model matrix is not full rank")
    residual = outcome - matrix @ np.linalg.lstsq(matrix, outcome, rcond=None)[0]
    return float(np.dot(residual, residual)), len(outcome) - rank


def _holm_adjust(p_values: list[float]) -> list[float]:
    count = len(p_values)
    order = sorted(range(count), key=lambda index: p_values[index])
    adjusted = [0.0] * count
    running = 0.0
    for rank, index in enumerate(order):
        running = max(running, (count - rank) * p_values[index])
        adjusted[index] = min(running, 1.0)
    return adjusted


def _hedges_g(first: np.ndarray, second: np.ndarray) -> float | None:
    degrees_of_freedom = len(first) + len(second) - 2
    pooled_variance = (
        (len(first) - 1) * float(np.var(first, ddof=1))
        + (len(second) - 1) * float(np.var(second, ddof=1))
    ) / degrees_of_freedom
    if pooled_variance <= 0:
        return None
    correction = 1.0 - 3.0 / (4.0 * degrees_of_freedom - 1.0)
    return float((np.mean(first) - np.mean(second)) / math.sqrt(pooled_variance) * correction)


def run_two_way_anova(request: dict[str, Any]) -> dict[str, Any]:
    factors = request.get("factors")
    conditions = request.get("conditions")
    if not isinstance(factors, list) or len(factors) != 2:
        raise ValueError("D05 requires exactly two declared factors")
    if not isinstance(conditions, list):
        raise ValueError("D05 requires declared factorial conditions")
    if request.get("options", {}).get("multiplicityMethod") != "holm_all_cell_pairs":
        raise ValueError("D05 requires Holm-adjusted all-cell comparisons")
    levels_a = factors[0]["levelIds"]
    levels_b = factors[1]["levelIds"]
    if (
        len(levels_a) < 2
        or len(levels_b) < 2
        or len(set(levels_a)) != len(levels_a)
        or len(set(levels_b)) != len(levels_b)
    ):
        raise ValueError("D05 factor levels must be unique and contain at least two levels")
    for factor, declared_levels in zip(factors, (levels_a, levels_b), strict=True):
        grouped_levels: set[str] = set()
        for group in factor.get("levelGroups", []):
            member_ids = group.get("levelIds", [])
            if not member_ids or any(level_id not in declared_levels for level_id in member_ids):
                raise ValueError("D05 scientific level groups must contain declared factor levels")
            if any(level_id in grouped_levels for level_id in member_ids):
                raise ValueError("A D05 factor level cannot belong to multiple scientific groups")
            grouped_levels.update(member_ids)
    expected_cells = {(a, b) for a in levels_a for b in levels_b}
    condition_map: dict[str, tuple[str, str]] = {}
    for condition in conditions:
        condition_id = condition["conditionId"]
        if condition_id in condition_map:
            raise ValueError("D05 condition IDs must be unique")
        condition_map[condition_id] = (condition["factorALevelId"], condition["factorBLevelId"])
    if len(condition_map) != len(expected_cells) or set(condition_map.values()) != expected_cells:
        raise ValueError("D05 requires exactly one condition for every factorial cell")

    grouped: dict[str, list[float]] = defaultdict(list)
    seen_units: set[str] = set()
    rows: list[list[float]] = []
    outcome: list[float] = []
    a_column_count = len(levels_a) - 1
    b_column_count = len(levels_b) - 1
    for observation in request.get("observations", []):
        condition_id = observation["conditionId"]
        if condition_id not in condition_map:
            raise ValueError("D05 observations must belong to a declared factorial condition")
        unit_id = observation["experimentalUnitId"]
        if unit_id in seen_units:
            raise ValueError("Each independent D05 unit can contribute only one analyzed value")
        seen_units.add(unit_id)
        value = float(observation["value"])
        if not math.isfinite(value):
            raise ValueError("Analysis values must be finite numbers")
        level_a, level_b = condition_map[condition_id]
        contrast_a = _sum_contrast(levels_a.index(level_a), len(levels_a))
        contrast_b = _sum_contrast(levels_b.index(level_b), len(levels_b))
        interaction = [a * b for a in contrast_a for b in contrast_b]
        rows.append([1.0, *contrast_a, *contrast_b, *interaction])
        outcome.append(value)
        grouped[condition_id].append(value)
    if any(len(grouped[condition_id]) < 2 for condition_id in condition_map):
        raise ValueError("Every D05 factorial cell requires at least two biological units")

    design_matrix = np.asarray(rows, dtype=float)
    y = np.asarray(outcome, dtype=float)
    full_sse, residual_df = _fit_sse(design_matrix, y)
    if residual_df <= 0 or full_sse <= 0:
        raise ValueError("D05 requires positive residual degrees of freedom and variance")
    mse = full_sse / residual_df
    intercept_end = 1
    a_end = intercept_end + a_column_count
    b_end = a_end + b_column_count
    effect_columns = {
        "interaction": list(range(b_end, design_matrix.shape[1])),
        "factor_a": list(range(intercept_end, a_end)),
        "factor_b": list(range(a_end, b_end)),
    }

    result = base_result(request)
    for effect_name in ("interaction", "factor_a", "factor_b"):
        columns = effect_columns[effect_name]
        reduced = np.delete(design_matrix, columns, axis=1)
        reduced_sse, _ = _fit_sse(reduced, y)
        effect_df = len(columns)
        effect_ss = max(reduced_sse - full_sse, 0.0)
        statistic = (effect_ss / effect_df) / mse
        result["tests"].append(
            {
                "name": f"type3_{effect_name}",
                "statisticName": "F",
                "statistic": float(statistic),
                "degreesOfFreedom": [float(effect_df), float(residual_df)],
                "pValue": float(stats.f.sf(statistic, effect_df, residual_df)),
                "adjustedPValue": None,
                "effectSizeName": "partial_eta_squared",
                "effectSize": float(effect_ss / (effect_ss + full_sse)),
            }
        )

    condition_ids = [condition["conditionId"] for condition in conditions]
    comparisons = list(combinations(condition_ids, 2))
    confidence_level = float(request["options"]["confidenceLevel"])
    simultaneous_level = 1.0 - (1.0 - confidence_level) / len(comparisons)
    raw_p_values: list[float] = []
    pair_results: list[tuple[str, str, float, float, float, float, float | None]] = []
    for first_id, second_id in comparisons:
        first = np.asarray(grouped[first_id], dtype=float)
        second = np.asarray(grouped[second_id], dtype=float)
        first_component = float(np.var(first, ddof=1)) / len(first)
        second_component = float(np.var(second, ddof=1)) / len(second)
        standard_error = math.sqrt(first_component + second_component)
        if standard_error <= 0:
            raise ValueError("A D05 cell comparison is undefined when both cell variances are zero")
        degrees_of_freedom = (first_component + second_component) ** 2 / (
            first_component**2 / (len(first) - 1) + second_component**2 / (len(second) - 1)
        )
        difference = float(np.mean(first) - np.mean(second))
        test = stats.ttest_ind(first, second, equal_var=False)
        critical = float(stats.t.ppf((1.0 + simultaneous_level) / 2.0, degrees_of_freedom))
        raw_p_values.append(float(test.pvalue))
        pair_results.append(
            (
                first_id,
                second_id,
                difference,
                standard_error,
                degrees_of_freedom,
                critical,
                _hedges_g(first, second),
            )
        )
    adjusted = _holm_adjust(raw_p_values)
    for index, pair in enumerate(pair_results):
        first_id, second_id, difference, standard_error, degrees_of_freedom, critical, effect_size = pair
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
                "name": f"holm_welch:{first_id}:{second_id}",
                "statisticName": "t",
                "statistic": float(difference / standard_error),
                "degreesOfFreedom": [float(degrees_of_freedom)],
                "pValue": raw_p_values[index],
                "adjustedPValue": adjusted[index],
                "effectSizeName": "hedges_g",
                "effectSize": effect_size,
            }
        )

    result["diagnostics"] = [
        {
            "code": "sum_coded_type3_factorial_model",
            "message": "D05 used sum-to-zero contrasts and Type III tests; inspect the interaction before interpreting averaged main effects.",
        },
        {
            "code": "simultaneous_cell_intervals",
            "message": "All-cell confidence intervals use a Bonferroni simultaneous level while pairwise p-values use Holm adjustment.",
        },
    ]
    if any(factor.get("levelGroups") for factor in factors):
        result["diagnostics"].append(
            {
                "code": "scientific_level_groups_not_replicates",
                "message": "Related intervention levels were retained as separate model levels. Their scientific group membership did not pool siRNA sequences, constructs, or other reagents as biological replicates.",
            }
        )
    if any(len(grouped[condition_id]) < 3 for condition_id in condition_map):
        result["warnings"].append(
            {
                "code": "very_small_biological_n",
                "message": "At least one factorial cell has fewer than three biological units; interaction estimates are especially uncertain.",
            }
        )
    return result
