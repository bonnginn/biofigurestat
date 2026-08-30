"""D06: balanced condition-by-time mixed ANOVA with explicit stable-unit identity."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import numpy as np
from scipy import stats

from .result_common import base_result, estimate


def run_mixed_anova(request: dict[str, Any]) -> dict[str, Any]:
    condition_ids = request.get("conditionIds")
    time_points = request.get("timePoints")
    if not isinstance(condition_ids, list) or len(condition_ids) < 2:
        raise ValueError("D06 requires at least two conditions")
    if len(set(condition_ids)) != len(condition_ids):
        raise ValueError("D06 condition IDs must be unique")
    if not isinstance(time_points, list) or len(time_points) < 2:
        raise ValueError("D06 requires at least two repeated time points")
    time_ids = [point["timePointId"] for point in time_points]
    if len(set(time_ids)) != len(time_ids):
        raise ValueError("D06 time-point IDs must be unique")
    if request.get("options", {}).get("multiplicityMethod") is not None:
        raise ValueError("The initial D06 omnibus model does not perform post-hoc comparisons")

    declared_conditions = set(condition_ids)
    declared_times = set(time_ids)
    units: dict[tuple[str, str], dict[str, float]] = defaultdict(dict)
    unit_condition: dict[str, str] = {}
    for observation in request.get("observations", []):
        condition_id = observation.get("conditionId")
        time_id = observation.get("timePointId")
        unit_id = observation.get("pairId")
        if condition_id not in declared_conditions:
            raise ValueError("D06 observations must belong to a declared condition")
        if time_id not in declared_times:
            raise ValueError("D06 observations must belong to a declared time point")
        if not unit_id:
            raise ValueError("Every D06 observation requires explicit stable-unit identity")
        if observation.get("experimentalUnitId") != unit_id:
            raise ValueError("D06 pairId and experimentalUnitId must identify the same stable unit")
        previous_condition = unit_condition.setdefault(unit_id, condition_id)
        if previous_condition != condition_id:
            raise ValueError("A D06 stable unit cannot cross independent conditions")
        key = (condition_id, unit_id)
        if time_id in units[key]:
            raise ValueError("Each D06 stable unit requires exactly one value per time point")
        units[key][time_id] = float(observation["value"])

    units_by_condition: dict[str, list[str]] = {condition_id: [] for condition_id in condition_ids}
    for (condition_id, unit_id), values in units.items():
        if set(values) != declared_times:
            raise ValueError("D06 requires complete repeated measurements for every stable unit")
        units_by_condition[condition_id].append(unit_id)
    counts = [len(units_by_condition[condition_id]) for condition_id in condition_ids]
    if any(count < 2 for count in counts):
        raise ValueError("D06 requires at least two complete biological units per condition")
    if len(set(counts)) != 1:
        raise ValueError("The initial D06 contract requires balanced condition groups")

    condition_count = len(condition_ids)
    time_count = len(time_ids)
    unit_count = counts[0]
    matrix = np.asarray(
        [
            [
                [units[(condition_id, unit_id)][time_id] for time_id in time_ids]
                for unit_id in sorted(units_by_condition[condition_id])
            ]
            for condition_id in condition_ids
        ],
        dtype=float,
    )
    if not np.all(np.isfinite(matrix)):
        raise ValueError("D06 analysis values must be finite")

    grand_mean = float(np.mean(matrix))
    condition_means = np.mean(matrix, axis=(1, 2))
    unit_means = np.mean(matrix, axis=2)
    time_means = np.mean(matrix, axis=(0, 1))
    cell_means = np.mean(matrix, axis=1)
    ss_total = float(np.sum((matrix - grand_mean) ** 2))
    ss_condition = float(time_count * unit_count * np.sum((condition_means - grand_mean) ** 2))
    ss_unit_condition = float(
        time_count * np.sum((unit_means - condition_means[:, np.newaxis]) ** 2)
    )
    ss_time = float(condition_count * unit_count * np.sum((time_means - grand_mean) ** 2))
    interaction_residual = (
        cell_means
        - condition_means[:, np.newaxis]
        - time_means[np.newaxis, :]
        + grand_mean
    )
    ss_interaction = float(unit_count * np.sum(interaction_residual**2))
    ss_within_error = max(
        ss_total - ss_condition - ss_unit_condition - ss_time - ss_interaction,
        0.0,
    )

    df_condition = condition_count - 1
    df_unit_condition = condition_count * (unit_count - 1)
    df_time = time_count - 1
    df_interaction = df_condition * df_time
    df_within_error = condition_count * (unit_count - 1) * df_time
    if ss_unit_condition <= 0 or ss_within_error <= 0:
        raise ValueError("D06 mixed ANOVA is undefined when an error stratum has zero variance")

    f_condition = (ss_condition / df_condition) / (ss_unit_condition / df_unit_condition)
    f_time = (ss_time / df_time) / (ss_within_error / df_within_error)
    f_interaction = (ss_interaction / df_interaction) / (ss_within_error / df_within_error)

    result = base_result(request)
    within_factor = request.get("withinFactor")
    uses_generic_factor_ids = isinstance(within_factor, dict)
    tests = [
        (
            "condition_by_within_factor_interaction" if uses_generic_factor_ids else "condition_by_time_interaction",
            f_interaction,
            df_interaction,
            df_within_error,
            ss_interaction,
            ss_within_error,
        ),
        (
            "condition_main_effect" if uses_generic_factor_ids else "condition_between_units",
            f_condition,
            df_condition,
            df_unit_condition,
            ss_condition,
            ss_unit_condition,
        ),
        (
            "within_factor_main_effect" if uses_generic_factor_ids else "time_within_units",
            f_time,
            df_time,
            df_within_error,
            ss_time,
            ss_within_error,
        ),
    ]
    for name, statistic, numerator_df, denominator_df, effect_ss, error_ss in tests:
        result["tests"].append(
            {
                "name": name,
                "statisticName": "F",
                "statistic": float(statistic),
                "degreesOfFreedom": [float(numerator_df), float(denominator_df)],
                "pValue": float(stats.f.sf(statistic, numerator_df, denominator_df)),
                "adjustedPValue": None,
                "effectSizeName": "partial_eta_squared",
                "effectSize": float(effect_ss / (effect_ss + error_ss)),
            }
        )
    for condition_index, condition_id in enumerate(condition_ids):
        for time_index, time_id in enumerate(time_ids):
            values = matrix[condition_index, :, time_index]
            result["estimates"].append(
                estimate(
                    f"cell_mean:{condition_id}:{time_id}",
                    float(np.mean(values)),
                    float(np.std(values, ddof=1) / np.sqrt(unit_count)),
                    None,
                )
            )
    axis_title = within_factor.get("title", "Time") if isinstance(within_factor, dict) else "Time"
    result["diagnostics"] = [
        {
            "code": "stable_unit_identity_preserved",
            "message": "D06 used explicit stable-unit IDs and never inferred repeated identity from row order.",
        },
        {
            "code": "balanced_complete_split_plot",
            "message": f"Condition used the subject-within-condition error stratum; {axis_title} and interaction used the within-subject error stratum.",
        },
        {
            "code": "sphericity_not_estimated",
            "message": "The initial balanced D06 model does not estimate a sphericity correction; use a validated mixed-effects model when this assumption is not defensible.",
        },
    ]
    if uses_generic_factor_ids:
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
            "legacyEffectAliases": (
                {
                    "condition_by_time_interaction": "condition_by_within_factor_interaction",
                    "condition_between_units": "condition_main_effect",
                    "time_within_units": "within_factor_main_effect",
                }
                if within_factor["role"] == "time"
                else {}
            ),
        }
    if unit_count < 4:
        result["warnings"].append(
            {
                "code": "small_biological_n_per_condition",
                "message": "Fewer than four complete biological units are available per condition; interaction estimates are especially uncertain.",
            }
        )
    return result
