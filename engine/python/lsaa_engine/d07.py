"""D07: balanced independent condition-by-within-factor ANOVA."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import numpy as np
from scipy import stats

from .result_common import base_result, estimate


def run_independent_factorial(request: dict[str, Any]) -> dict[str, Any]:
    condition_ids = request.get("conditionIds")
    within_factor = request.get("withinFactor")
    if not isinstance(condition_ids, list) or len(condition_ids) < 2:
        raise ValueError("D07 requires at least two conditions")
    if len(set(condition_ids)) != len(condition_ids):
        raise ValueError("D07 condition IDs must be unique")
    if not isinstance(within_factor, dict):
        raise ValueError("D07 requires explicit within-factor metadata")
    levels = within_factor.get("levels")
    if not isinstance(levels, list) or len(levels) < 2:
        raise ValueError("D07 requires at least two within-factor levels")
    level_ids = [level["levelId"] for level in levels]
    if len(set(level_ids)) != len(level_ids):
        raise ValueError("D07 within-factor level IDs must be unique")
    if request.get("options", {}).get("multiplicityMethod") is not None:
        raise ValueError("The initial D07 model reports omnibus effects only")

    declared_conditions = set(condition_ids)
    declared_levels = set(level_ids)
    cells: dict[tuple[str, str], list[float]] = defaultdict(list)
    seen_units: set[str] = set()
    for observation in request.get("observations", []):
        condition_id = observation.get("conditionId")
        level_id = observation.get("withinFactorLevelId")
        unit_id = observation.get("experimentalUnitId")
        if condition_id not in declared_conditions or level_id not in declared_levels:
            raise ValueError("D07 observations must belong to declared factor levels")
        if not unit_id or unit_id in seen_units:
            raise ValueError("D07 requires a unique independent biological-unit ID per observation")
        if observation.get("pairId") or observation.get("blockId"):
            raise ValueError("D07 does not accept paired or blocked observations")
        seen_units.add(unit_id)
        cells[(condition_id, level_id)].append(float(observation["value"]))

    counts = [len(cells[(condition_id, level_id)]) for condition_id in condition_ids for level_id in level_ids]
    if any(count < 2 for count in counts) or len(set(counts)) != 1:
        raise ValueError("D07 requires complete balanced cells with at least two independent units")
    replicate_count = counts[0]
    matrix = np.asarray(
        [[cells[(condition_id, level_id)] for level_id in level_ids] for condition_id in condition_ids],
        dtype=float,
    )
    if not np.all(np.isfinite(matrix)):
        raise ValueError("D07 analysis values must be finite")

    condition_count = len(condition_ids)
    level_count = len(level_ids)
    grand_mean = float(np.mean(matrix))
    condition_means = np.mean(matrix, axis=(1, 2))
    level_means = np.mean(matrix, axis=(0, 2))
    cell_means = np.mean(matrix, axis=2)
    ss_condition = float(level_count * replicate_count * np.sum((condition_means - grand_mean) ** 2))
    ss_within = float(condition_count * replicate_count * np.sum((level_means - grand_mean) ** 2))
    interaction_residual = cell_means - condition_means[:, None] - level_means[None, :] + grand_mean
    ss_interaction = float(replicate_count * np.sum(interaction_residual**2))
    ss_error = float(np.sum((matrix - cell_means[:, :, None]) ** 2))
    df_condition = condition_count - 1
    df_within = level_count - 1
    df_interaction = df_condition * df_within
    df_error = condition_count * level_count * (replicate_count - 1)
    if ss_error <= 0:
        raise ValueError("D07 ANOVA is undefined when within-cell variance is zero")

    tests = [
        ("condition_by_within_factor_interaction", ss_interaction, df_interaction),
        ("condition_main_effect", ss_condition, df_condition),
        ("within_factor_main_effect", ss_within, df_within),
    ]
    result = base_result(request)
    for name, effect_ss, numerator_df in tests:
        statistic = (effect_ss / numerator_df) / (ss_error / df_error)
        result["tests"].append(
            {
                "name": name,
                "statisticName": "F",
                "statistic": float(statistic),
                "degreesOfFreedom": [float(numerator_df), float(df_error)],
                "pValue": float(stats.f.sf(statistic, numerator_df, df_error)),
                "adjustedPValue": None,
                "effectSizeName": "partial_eta_squared",
                "effectSize": float(effect_ss / (effect_ss + ss_error)),
            }
        )
    for condition_index, condition_id in enumerate(condition_ids):
        for level_index, level_id in enumerate(level_ids):
            values = matrix[condition_index, level_index, :]
            result["estimates"].append(
                estimate(
                    f"cell_mean:{condition_id}:{level_id}",
                    float(np.mean(values)),
                    float(np.std(values, ddof=1) / np.sqrt(replicate_count)),
                    None,
                )
            )
    result["factorMetadata"] = {
        "withinFactor": {
            "role": within_factor["role"],
            "title": within_factor["title"],
            "unit": within_factor.get("unit", ""),
        },
        "effectIds": {
            "interaction": "condition_by_within_factor_interaction",
            "condition": "condition_main_effect",
            "withinFactor": "within_factor_main_effect",
        },
        "legacyEffectAliases": {
            "condition_by_time_interaction": "condition_by_within_factor_interaction",
            "time_main_effect": "within_factor_main_effect",
        },
    }
    result["diagnostics"] = [
        {
            "code": "independent_unit_identity_verified",
            "message": "D07 verified that every condition-by-factor cell uses distinct biological-unit IDs.",
        },
        {
            "code": "balanced_complete_independent_factorial",
            "message": "D07 used a balanced independent two-factor error model and reported omnibus effects only.",
        },
    ]
    return result
