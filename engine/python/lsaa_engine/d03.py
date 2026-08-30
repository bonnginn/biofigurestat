"""D03: 3+ independent groups under one factor."""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any

import numpy as np
import statsmodels
from scipy import stats
from scipy.special import gammaln
from statsmodels.stats.multitest import multipletests

from .result_common import base_result, estimate


def _welch_degrees_of_freedom(samples: list[np.ndarray]) -> tuple[float, float]:
    group_count = len(samples)
    sample_sizes = np.asarray([len(sample) for sample in samples], dtype=float)
    variances = np.asarray([np.var(sample, ddof=1) for sample in samples], dtype=float)
    weights = sample_sizes / variances
    relative_weights = weights / weights.sum()
    correction = np.sum((1.0 - relative_weights) ** 2 / (sample_sizes - 1.0))
    denominator_df = (group_count**2 - 1.0) / (3.0 * correction)
    return float(group_count - 1), float(denominator_df)


def _welch_effect_size(samples: list[np.ndarray]) -> float:
    sample_sizes = np.asarray([len(sample) for sample in samples], dtype=float)
    means = np.asarray([np.mean(sample) for sample in samples], dtype=float)
    variances = np.asarray([np.var(sample, ddof=1) for sample in samples], dtype=float)
    weights = sample_sizes / variances
    weighted_mean = float(np.dot(weights / weights.sum(), means))
    cohen_f_squared = float(np.dot(weights, (means - weighted_mean) ** 2) / sample_sizes.sum())
    return math.sqrt(max(cohen_f_squared, 0.0))


def _pairwise_hedges_g(first: np.ndarray, second: np.ndarray) -> float | None:
    first_variance = float(np.var(first, ddof=1))
    second_variance = float(np.var(second, ddof=1))
    pooled_df = len(first) + len(second) - 2
    pooled_variance = (
        (len(first) - 1) * first_variance + (len(second) - 1) * second_variance
    ) / pooled_df
    if pooled_variance <= 0:
        return None
    cohen_d = float(np.mean(first) - np.mean(second)) / math.sqrt(pooled_variance)
    correction = math.exp(
        gammaln(pooled_df / 2.0)
        - 0.5 * math.log(pooled_df / 2.0)
        - gammaln((pooled_df - 1.0) / 2.0)
    )
    return float(cohen_d * correction)


def run_welch_anova(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("options", {}).get("alternative", "two_sided") != "two_sided":
        raise ValueError("D03 currently supports two-sided inference only")
    condition_ids = request.get("conditionIds")
    if not isinstance(condition_ids, list) or len(condition_ids) < 3:
        raise ValueError("D03 Welch ANOVA requires at least three declared conditions")
    if len(set(condition_ids)) != len(condition_ids):
        raise ValueError("D03 condition IDs must be unique")
    control_condition_id = request.get("controlConditionId")
    if control_condition_id is not None and control_condition_id not in condition_ids:
        raise ValueError("D03 control condition must be one of the declared conditions")
    if request.get("options", {}).get("multiplicityMethod") != "games_howell_all_pairs":
        raise ValueError("D03 requires the declared Games-Howell all-pairs multiplicity method")
    if request.get("contrastIntent", "all_pairs") != "all_pairs":
        raise ValueError("Welch ANOVA with Games-Howell currently supports all-pairs intent")

    grouped: dict[str, list[float]] = defaultdict(list)
    declared = set(condition_ids)
    seen_units: set[str] = set()
    for observation in request.get("observations", []):
        condition_id = observation["conditionId"]
        if condition_id not in declared:
            raise ValueError("D03 observations must belong to a declared condition")
        unit_id = observation["experimentalUnitId"]
        if unit_id in seen_units:
            raise ValueError("Each independent D03 unit can contribute only one analyzed value")
        seen_units.add(unit_id)
        grouped[condition_id].append(float(observation["value"]))

    samples = [np.asarray(grouped[condition_id], dtype=float) for condition_id in condition_ids]
    if any(len(sample) < 2 for sample in samples):
        raise ValueError("Welch ANOVA requires at least two independent units per condition")
    if any(not np.all(np.isfinite(sample)) for sample in samples):
        raise ValueError("Analysis values must be finite numbers")
    if any(float(np.var(sample, ddof=1)) <= 0 for sample in samples):
        raise ValueError("Welch ANOVA and Games-Howell require within-group variance")

    omnibus = stats.f_oneway(*samples, equal_var=False)
    numerator_df, denominator_df = _welch_degrees_of_freedom(samples)
    confidence_level = float(request["options"]["confidenceLevel"])
    posthoc = stats.tukey_hsd(*samples, equal_var=False)
    posthoc_interval = posthoc.confidence_interval(confidence_level=confidence_level)

    result = base_result(request)
    result["tests"].append(
        {
            "name": "welch_one_way_anova",
            "statisticName": "F",
            "statistic": float(omnibus.statistic),
            "degreesOfFreedom": [numerator_df, denominator_df],
            "pValue": float(omnibus.pvalue),
            "adjustedPValue": None,
            "effectSizeName": "cohen_f_welch",
            "effectSize": _welch_effect_size(samples),
        }
    )

    for first_index, first_id in enumerate(condition_ids):
        for second_index in range(first_index + 1, len(condition_ids)):
            second_id = condition_ids[second_index]
            first = samples[first_index]
            second = samples[second_index]
            difference = float(np.mean(first) - np.mean(second))
            first_component = float(np.var(first, ddof=1)) / len(first)
            second_component = float(np.var(second, ddof=1)) / len(second)
            standard_error = math.sqrt(first_component + second_component)
            degrees_of_freedom = (first_component + second_component) ** 2 / (
                first_component**2 / (len(first) - 1)
                + second_component**2 / (len(second) - 1)
            )
            welch_test = stats.ttest_ind(first, second, equal_var=False)
            comparison_name = f"{first_id}_minus_{second_id}"
            result["estimates"].append(
                estimate(
                    comparison_name,
                    difference,
                    standard_error,
                    {
                        "level": confidence_level,
                        "lower": float(posthoc_interval.low[first_index, second_index]),
                        "upper": float(posthoc_interval.high[first_index, second_index]),
                    },
                )
            )
            result["tests"].append(
                {
                    "name": f"games_howell:{first_id}:{second_id}",
                    "statisticName": "t",
                    "statistic": float(welch_test.statistic),
                    "degreesOfFreedom": [float(degrees_of_freedom)],
                    "pValue": float(welch_test.pvalue),
                    "adjustedPValue": float(posthoc.pvalue[first_index, second_index]),
                    "effectSizeName": "hedges_g",
                    "effectSize": _pairwise_hedges_g(first, second),
                }
            )

    result["diagnostics"] = [
        {
            "code": "variance_robust_multi_group_default",
            "message": "Welch ANOVA and Games-Howell comparisons do not assume equal group variances; biological-unit independence remains a design requirement.",
        }
    ]
    if any(len(sample) < 3 for sample in samples):
        result["warnings"].append(
            {
                "code": "very_small_biological_n",
                "message": "At least one group has fewer than three independent biological units; Welch ANOVA and Games-Howell estimates are especially uncertain.",
            }
        )
    return result


def _validated_groups(request: dict[str, Any]) -> tuple[list[str], list[np.ndarray]]:
    if request.get("options", {}).get("alternative", "two_sided") != "two_sided":
        raise ValueError("D03 currently supports two-sided inference only")
    condition_ids = request.get("conditionIds")
    if not isinstance(condition_ids, list) or len(condition_ids) < 3:
        raise ValueError("D03 analysis requires at least three declared conditions")
    if len(set(condition_ids)) != len(condition_ids):
        raise ValueError("D03 condition IDs must be unique")
    grouped: dict[str, list[float]] = defaultdict(list)
    declared = set(condition_ids)
    seen_units: set[str] = set()
    for observation in request.get("observations", []):
        condition_id = observation["conditionId"]
        if condition_id not in declared:
            raise ValueError("D03 observations must belong to a declared condition")
        unit_id = observation["experimentalUnitId"]
        if unit_id in seen_units:
            raise ValueError("Each independent D03 unit can contribute only one analyzed value")
        seen_units.add(unit_id)
        grouped[condition_id].append(float(observation["value"]))
    samples = [np.asarray(grouped[condition_id], dtype=float) for condition_id in condition_ids]
    if any(len(sample) < 2 for sample in samples):
        raise ValueError("D03 analysis requires at least two independent units per condition")
    if any(not np.all(np.isfinite(sample)) for sample in samples):
        raise ValueError("Analysis values must be finite numbers")
    return condition_ids, samples


def _append_tukey_pairs(
    result: dict[str, Any],
    condition_ids: list[str],
    samples: list[np.ndarray],
    confidence_level: float,
) -> None:
    posthoc = stats.tukey_hsd(*samples, equal_var=True)
    interval = posthoc.confidence_interval(confidence_level=confidence_level)
    pooled_df = sum(len(sample) for sample in samples) - len(samples)
    pooled_variance = sum(
        (len(sample) - 1) * float(np.var(sample, ddof=1)) for sample in samples
    ) / pooled_df
    for first_index, first_id in enumerate(condition_ids):
        for second_index in range(first_index + 1, len(condition_ids)):
            second_id = condition_ids[second_index]
            difference = float(np.mean(samples[first_index]) - np.mean(samples[second_index]))
            standard_error = math.sqrt(
                pooled_variance * (1 / len(samples[first_index]) + 1 / len(samples[second_index]))
            )
            result["estimates"].append(
                estimate(
                    f"{first_id}_minus_{second_id}",
                    difference,
                    standard_error,
                    {
                        "level": confidence_level,
                        "lower": float(interval.low[first_index, second_index]),
                        "upper": float(interval.high[first_index, second_index]),
                    },
                )
            )
            result["tests"].append(
                {
                    "name": f"tukey_hsd:{first_id}:{second_id}",
                    "statisticName": "q",
                    "statistic": float(posthoc.statistic[first_index, second_index]),
                    "degreesOfFreedom": [float(pooled_df)],
                    "pValue": float(posthoc.pvalue[first_index, second_index]),
                    "adjustedPValue": float(posthoc.pvalue[first_index, second_index]),
                    "effectSizeName": "hedges_g",
                    "effectSize": _pairwise_hedges_g(samples[first_index], samples[second_index]),
                }
            )


def _append_dunnett_pairs(
    request: dict[str, Any],
    result: dict[str, Any],
    condition_ids: list[str],
    samples: list[np.ndarray],
    confidence_level: float,
) -> None:
    control_id = request.get("controlConditionId")
    if not control_id or control_id not in condition_ids:
        raise ValueError("Dunnett control-vs-many requires an explicit declared control condition ID")
    control_index = condition_ids.index(control_id)
    treatment_indexes = [index for index in range(len(condition_ids)) if index != control_index]
    alternative = request["options"]["alternative"].replace("two_sided", "two-sided")
    comparison = stats.dunnett(
        *(samples[index] for index in treatment_indexes),
        control=samples[control_index],
        alternative=alternative,
        rng=0,
    )
    interval = comparison.confidence_interval(confidence_level=confidence_level)
    for result_index, treatment_index in enumerate(treatment_indexes):
        treatment_id = condition_ids[treatment_index]
        treatment = samples[treatment_index]
        control = samples[control_index]
        difference = float(np.mean(treatment) - np.mean(control))
        result["estimates"].append(
            estimate(
                f"{treatment_id}_minus_{control_id}",
                difference,
                None,
                {
                    "level": confidence_level,
                    "lower": float(interval.low[result_index]),
                    "upper": float(interval.high[result_index]),
                },
            )
        )
        result["tests"].append(
            {
                "name": f"dunnett:{treatment_id}:{control_id}",
                "statisticName": "t",
                "statistic": float(comparison.statistic[result_index]),
                "degreesOfFreedom": [float(sum(len(sample) for sample in samples) - len(samples))],
                "pValue": float(comparison.pvalue[result_index]),
                "adjustedPValue": float(comparison.pvalue[result_index]),
                "effectSizeName": "hedges_g",
                "effectSize": _pairwise_hedges_g(treatment, control),
            }
        )


def _append_planned_pairs(
    request: dict[str, Any],
    result: dict[str, Any],
    condition_ids: list[str],
    samples: list[np.ndarray],
) -> None:
    planned_pairs = request.get("plannedContrastConditionIds")
    if not isinstance(planned_pairs, list) or not planned_pairs:
        raise ValueError("Planned comparisons require at least one explicit condition pair")
    condition_index = {condition_id: index for index, condition_id in enumerate(condition_ids)}
    normalized_pairs: list[tuple[str, str]] = []
    seen_pairs: set[tuple[str, str]] = set()
    for pair in planned_pairs:
        if not isinstance(pair, list) or len(pair) != 2:
            raise ValueError("Each planned comparison must contain exactly two condition IDs")
        first_id, second_id = pair
        if first_id not in condition_index or second_id not in condition_index:
            raise ValueError("Every planned comparison must use a declared condition ID")
        if first_id == second_id:
            raise ValueError("A planned comparison must contain two different conditions")
        canonical_pair = tuple(sorted((first_id, second_id)))
        if canonical_pair in seen_pairs:
            raise ValueError("Planned comparisons must not contain duplicate condition pairs")
        seen_pairs.add(canonical_pair)
        normalized_pairs.append((first_id, second_id))

    pooled_df = sum(len(sample) for sample in samples) - len(samples)
    pooled_variance = sum(
        (len(sample) - 1) * float(np.var(sample, ddof=1)) for sample in samples
    ) / pooled_df
    if pooled_variance <= 0:
        raise ValueError("Planned pooled-variance comparisons require within-group variance")

    pair_results: list[dict[str, Any]] = []
    raw_p_values: list[float] = []
    for first_id, second_id in normalized_pairs:
        first = samples[condition_index[first_id]]
        second = samples[condition_index[second_id]]
        difference = float(np.mean(first) - np.mean(second))
        standard_error = math.sqrt(pooled_variance * (1 / len(first) + 1 / len(second)))
        statistic = difference / standard_error
        p_value = float(2.0 * stats.t.sf(abs(statistic), pooled_df))
        pair_results.append(
            {
                "firstId": first_id,
                "secondId": second_id,
                "first": first,
                "second": second,
                "difference": difference,
                "standardError": standard_error,
                "statistic": statistic,
                "pValue": p_value,
            }
        )
        raw_p_values.append(p_value)

    adjusted_p_values = multipletests(raw_p_values, method="holm")[1]
    result["engine"]["packages"]["statsmodels"] = statsmodels.__version__
    for pair_result, adjusted_p_value in zip(pair_results, adjusted_p_values, strict=True):
        first_id = pair_result["firstId"]
        second_id = pair_result["secondId"]
        result["estimates"].append(
            estimate(
                f"{first_id}_minus_{second_id}",
                pair_result["difference"],
                pair_result["standardError"],
                None,
            )
        )
        result["tests"].append(
            {
                "name": f"planned_holm:{first_id}:{second_id}",
                "statisticName": "t",
                "statistic": pair_result["statistic"],
                "degreesOfFreedom": [float(pooled_df)],
                "pValue": pair_result["pValue"],
                "adjustedPValue": float(adjusted_p_value),
                "effectSizeName": "hedges_g",
                "effectSize": _pairwise_hedges_g(pair_result["first"], pair_result["second"]),
            }
        )


def run_classical_one_way(request: dict[str, Any]) -> dict[str, Any]:
    condition_ids, samples = _validated_groups(request)
    if all(float(np.var(sample, ddof=1)) == 0 for sample in samples):
        raise ValueError("One-way ANOVA is undefined when all groups have zero variance")
    contrast_intent = request.get("contrastIntent", "all_pairs")
    multiplicity = request.get("options", {}).get("multiplicityMethod")
    if contrast_intent == "all_pairs" and multiplicity != "tukey_hsd_all_pairs":
        raise ValueError("Conventional one-way ANOVA all-pairs requires Tukey HSD")
    if contrast_intent == "control_vs_many" and multiplicity != "dunnett_control_vs_many":
        raise ValueError("Control-vs-many one-way ANOVA requires Dunnett adjustment")
    if contrast_intent == "omnibus_only" and multiplicity is not None:
        raise ValueError("Omnibus-only one-way ANOVA must not declare a post-hoc adjustment")
    if (
        contrast_intent == "planned_comparisons"
        and multiplicity != "holm_planned_comparisons"
    ):
        raise ValueError("Planned one-way comparisons require Holm adjustment")
    omnibus = stats.f_oneway(*samples, equal_var=True)
    confidence_level = float(request["options"]["confidenceLevel"])
    result = base_result(request)
    result["tests"].append(
        {
            "name": "classical_one_way_anova",
            "statisticName": "F",
            "statistic": float(omnibus.statistic),
            "degreesOfFreedom": [
                float(len(samples) - 1),
                float(sum(len(sample) for sample in samples) - len(samples)),
            ],
            "pValue": float(omnibus.pvalue),
            "adjustedPValue": None,
            "effectSizeName": None,
            "effectSize": None,
        }
    )
    if contrast_intent == "all_pairs":
        _append_tukey_pairs(result, condition_ids, samples, confidence_level)
    elif contrast_intent == "control_vs_many":
        _append_dunnett_pairs(request, result, condition_ids, samples, confidence_level)
    elif contrast_intent == "planned_comparisons":
        _append_planned_pairs(request, result, condition_ids, samples)
    result["diagnostics"] = [
        {
            "code": "equal_variance_assumption_selected",
            "message": "Conventional one-way ANOVA and its pooled-variance comparisons assume equal population variances.",
        }
    ]
    if contrast_intent == "planned_comparisons":
        result["diagnostics"].append(
            {
                "code": "planned_pairwise_no_simultaneous_ci",
                "message": "Only the explicitly selected pairwise comparisons were tested with Holm-adjusted p-values. Simultaneous confidence intervals are not reported for this workflow.",
            }
        )
    return result


def run_kruskal_wallis(request: dict[str, Any]) -> dict[str, Any]:
    condition_ids, samples = _validated_groups(request)
    contrast_intent = request.get("contrastIntent", "omnibus_only")
    multiplicity = request.get("options", {}).get("multiplicityMethod")
    if contrast_intent not in {"omnibus_only", "all_pairs"}:
        raise ValueError("Kruskal-Wallis supports omnibus-only or Dunn-Holm all-pairs workflows")
    if contrast_intent == "omnibus_only" and multiplicity is not None:
        raise ValueError("Kruskal-Wallis omnibus-only workflow must not declare post-hoc adjustment")
    if contrast_intent == "all_pairs" and multiplicity != "dunn_holm_all_pairs":
        raise ValueError("Kruskal-Wallis all-pairs workflow requires Dunn comparisons with Holm adjustment")
    if np.unique(np.concatenate(samples)).size == 1:
        raise ValueError(
            "Kruskal-Wallis is undefined when every analyzed value is identical"
        )
    try:
        test = stats.kruskal(*samples)
    except ValueError as error:
        raise ValueError(f"Kruskal-Wallis is undefined for these values: {error}") from error
    result = base_result(request)
    result["tests"] = [
        {
            "name": "kruskal_wallis_test",
            "statisticName": "H",
            "statistic": float(test.statistic),
            "degreesOfFreedom": [float(len(condition_ids) - 1)],
            "pValue": float(test.pvalue),
            "adjustedPValue": None,
            "effectSizeName": None,
            "effectSize": None,
        }
    ]
    if contrast_intent == "all_pairs":
        pooled = np.concatenate(samples)
        ranks = stats.rankdata(pooled)
        _, tie_counts = np.unique(pooled, return_counts=True)
        total_n = len(pooled)
        rank_variance = total_n * (total_n + 1.0) / 12.0
        if total_n > 1:
            rank_variance -= float(np.sum(tie_counts**3 - tie_counts)) / (
                12.0 * (total_n - 1.0)
            )
        mean_ranks: list[float] = []
        cursor = 0
        for sample in samples:
            mean_ranks.append(float(np.mean(ranks[cursor : cursor + len(sample)])))
            cursor += len(sample)
        pair_results: list[tuple[str, str, float, float]] = []
        raw_p_values: list[float] = []
        for first_index, first_id in enumerate(condition_ids):
            for second_index in range(first_index + 1, len(condition_ids)):
                second_id = condition_ids[second_index]
                standard_error = math.sqrt(
                    rank_variance
                    * (1.0 / len(samples[first_index]) + 1.0 / len(samples[second_index]))
                )
                if not math.isfinite(standard_error) or standard_error <= 0:
                    raise ValueError(
                        "Dunn comparisons are undefined when pooled rank variance is zero"
                    )
                statistic = (mean_ranks[first_index] - mean_ranks[second_index]) / standard_error
                p_value = float(2.0 * stats.norm.sf(abs(statistic)))
                pair_results.append((first_id, second_id, float(statistic), p_value))
                raw_p_values.append(p_value)
        adjusted = multipletests(raw_p_values, method="holm")[1]
        result["engine"]["packages"]["statsmodels"] = statsmodels.__version__
        for pair, adjusted_p_value in zip(pair_results, adjusted, strict=True):
            first_id, second_id, statistic, p_value = pair
            result["tests"].append(
                {
                    "name": f"dunn_holm:{first_id}:{second_id}",
                    "statisticName": "z",
                    "statistic": statistic,
                    "degreesOfFreedom": None,
                    "pValue": p_value,
                    "adjustedPValue": float(adjusted_p_value),
                    "effectSizeName": None,
                    "effectSize": None,
                }
            )
        result["diagnostics"] = [
            {
                "code": "dunn_holm_posthoc",
                "message": "All condition pairs were compared using pooled-rank Dunn tests with Holm-adjusted p-values after the Kruskal-Wallis omnibus test.",
            }
        ]
    else:
        result["diagnostics"] = [
            {
                "code": "omnibus_only_no_posthoc",
                "message": "Kruskal-Wallis is reported as an omnibus rank test only because no pairwise comparison question was selected.",
            }
        ]
    return result
