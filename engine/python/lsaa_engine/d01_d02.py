from __future__ import annotations

import math
import warnings
from collections import defaultdict
from typing import Any

import numpy as np
from scipy import stats
from scipy.special import gammaln

from .d03 import run_classical_one_way, run_kruskal_wallis, run_welch_anova
from .d04 import run_repeated_measures_anova
from .d05 import run_two_way_anova
from .d06 import run_mixed_anova
from .d07 import run_independent_factorial
from .result_common import base_result, estimate


def _critical_value(confidence_level: float, degrees_of_freedom: float) -> float:
    return float(stats.t.ppf(1.0 - (1.0 - confidence_level) / 2.0, degrees_of_freedom))


def run_welch(request: dict[str, Any]) -> dict[str, Any]:
    condition_a, condition_b = request["contrastConditionIds"]
    grouped: dict[str, list[float]] = defaultdict(list)
    seen_units: set[str] = set()
    for observation in request["observations"]:
        unit_id = observation["experimentalUnitId"]
        if unit_id in seen_units:
            raise ValueError("Each independent D01 unit can contribute only one analyzed value")
        seen_units.add(unit_id)
        grouped[observation["conditionId"]].append(float(observation["value"]))

    a = np.asarray(grouped[condition_a], dtype=float)
    b = np.asarray(grouped[condition_b], dtype=float)
    if len(a) < 2 or len(b) < 2:
        raise ValueError("Welch t-test requires at least two independent units per condition")
    if not np.all(np.isfinite(a)) or not np.all(np.isfinite(b)):
        raise ValueError("Analysis values must be finite numbers")

    variance_a = float(np.var(a, ddof=1))
    variance_b = float(np.var(b, ddof=1))
    component_a = variance_a / len(a)
    component_b = variance_b / len(b)
    standard_error = math.sqrt(component_a + component_b)
    if standard_error == 0:
        raise ValueError("Welch t-test is undefined when both conditions have zero variance")
    degrees_of_freedom = (component_a + component_b) ** 2 / (
        component_a**2 / (len(a) - 1) + component_b**2 / (len(b) - 1)
    )
    difference = float(np.mean(a) - np.mean(b))
    confidence_level = float(request["options"]["confidenceLevel"])
    critical = _critical_value(confidence_level, degrees_of_freedom)
    test = stats.ttest_ind(
        a,
        b,
        equal_var=False,
        alternative=request["options"]["alternative"].replace("two_sided", "two-sided"),
    )

    pooled_variance = ((len(a) - 1) * variance_a + (len(b) - 1) * variance_b) / (len(a) + len(b) - 2)
    cohen_d = difference / math.sqrt(pooled_variance) if pooled_variance > 0 else math.nan
    pooled_degrees_of_freedom = len(a) + len(b) - 2
    hedges_correction = math.exp(
        gammaln(pooled_degrees_of_freedom / 2.0)
        - 0.5 * math.log(pooled_degrees_of_freedom / 2.0)
        - gammaln((pooled_degrees_of_freedom - 1.0) / 2.0)
    )

    result = base_result(request)
    result["estimates"] = [
        estimate(
            "mean_difference",
            difference,
            standard_error,
            {
                "level": confidence_level,
                "lower": difference - critical * standard_error,
                "upper": difference + critical * standard_error,
            },
        )
    ]
    result["tests"] = [
        {
            "name": "welch_two_sample_t_test",
            "statisticName": "t",
            "statistic": float(test.statistic),
            "degreesOfFreedom": [float(degrees_of_freedom)],
            "pValue": float(test.pvalue),
            "adjustedPValue": None,
            "effectSizeName": "hedges_g",
            "effectSize": float(cohen_d * hedges_correction),
        }
    ]
    result["diagnostics"] = [
        {
            "code": "assumptions_not_fully_evaluated",
            "message": "The engine did not claim normality from a small-sample significance test; inspect the replicate distribution and study design.",
        }
    ]
    if len(a) < 3 or len(b) < 3:
        result["warnings"].append(
            {
                "code": "very_small_biological_n",
                "message": "At least one condition has fewer than three independent biological units; estimation and assumption assessment are especially uncertain.",
            }
        )
    return result


def _independent_samples(request: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    condition_a, condition_b = request["contrastConditionIds"]
    grouped: dict[str, list[float]] = defaultdict(list)
    seen_units: set[str] = set()
    for observation in request["observations"]:
        unit_id = observation["experimentalUnitId"]
        if unit_id in seen_units:
            raise ValueError("Each independent D01 unit can contribute only one analyzed value")
        seen_units.add(unit_id)
        grouped[observation["conditionId"]].append(float(observation["value"]))
    a = np.asarray(grouped[condition_a], dtype=float)
    b = np.asarray(grouped[condition_b], dtype=float)
    if len(a) < 2 or len(b) < 2:
        raise ValueError("Two-group analysis requires at least two independent units per condition")
    if not np.all(np.isfinite(a)) or not np.all(np.isfinite(b)):
        raise ValueError("Analysis values must be finite numbers")
    return a, b


def _pooled_hedges_g(a: np.ndarray, b: np.ndarray) -> float | None:
    variance_a = float(np.var(a, ddof=1))
    variance_b = float(np.var(b, ddof=1))
    pooled_df = len(a) + len(b) - 2
    pooled_variance = ((len(a) - 1) * variance_a + (len(b) - 1) * variance_b) / pooled_df
    if pooled_variance <= 0:
        return None
    cohen_d = float(np.mean(a) - np.mean(b)) / math.sqrt(pooled_variance)
    correction = math.exp(
        gammaln(pooled_df / 2.0)
        - 0.5 * math.log(pooled_df / 2.0)
        - gammaln((pooled_df - 1.0) / 2.0)
    )
    return float(cohen_d * correction)


def run_student(request: dict[str, Any]) -> dict[str, Any]:
    a, b = _independent_samples(request)
    pooled_df = len(a) + len(b) - 2
    pooled_variance = (
        (len(a) - 1) * float(np.var(a, ddof=1)) + (len(b) - 1) * float(np.var(b, ddof=1))
    ) / pooled_df
    if pooled_variance <= 0:
        raise ValueError("Student t-test is undefined when pooled variance is zero")
    standard_error = math.sqrt(pooled_variance * (1 / len(a) + 1 / len(b)))
    difference = float(np.mean(a) - np.mean(b))
    confidence_level = float(request["options"]["confidenceLevel"])
    critical = _critical_value(confidence_level, pooled_df)
    test = stats.ttest_ind(
        a,
        b,
        equal_var=True,
        alternative=request["options"]["alternative"].replace("two_sided", "two-sided"),
    )
    result = base_result(request)
    result["estimates"] = [
        estimate(
            "mean_difference",
            difference,
            standard_error,
            {
                "level": confidence_level,
                "lower": difference - critical * standard_error,
                "upper": difference + critical * standard_error,
            },
        )
    ]
    result["tests"] = [
        {
            "name": "student_two_sample_t_test",
            "statisticName": "t",
            "statistic": float(test.statistic),
            "degreesOfFreedom": [float(pooled_df)],
            "pValue": float(test.pvalue),
            "adjustedPValue": None,
            "effectSizeName": "hedges_g",
            "effectSize": _pooled_hedges_g(a, b),
        }
    ]
    result["diagnostics"] = [
        {
            "code": "equal_variance_assumption_selected",
            "message": "Student's t-test uses a pooled variance and therefore assumes equal population variances; selecting it records acceptance of that stronger assumption.",
        }
    ]
    return result


def run_mann_whitney(request: dict[str, Any]) -> dict[str, Any]:
    a, b = _independent_samples(request)
    alternative = request["options"]["alternative"].replace("two_sided", "two-sided")
    test = stats.mannwhitneyu(a, b, alternative=alternative, method="auto")
    rank_biserial = 2.0 * float(test.statistic) / (len(a) * len(b)) - 1.0
    result = base_result(request)
    result["estimates"] = [
        estimate("rank_biserial_correlation", rank_biserial, None, None)
    ]
    result["tests"] = [
        {
            "name": "mann_whitney_u_test",
            "statisticName": "U",
            "statistic": float(test.statistic),
            "degreesOfFreedom": None,
            "pValue": float(test.pvalue),
            "adjustedPValue": None,
            "effectSizeName": "rank_biserial_correlation",
            "effectSize": rank_biserial,
        }
    ]
    result["diagnostics"] = [
        {
            "code": "rank_distribution_test_semantics",
            "message": "Mann-Whitney U evaluates rank/distributional ordering under the selected alternative; it is not automatically a test of medians without additional distributional assumptions.",
        }
    ]
    return result


def run_paired(request: dict[str, Any]) -> dict[str, Any]:
    condition_a, condition_b = request["contrastConditionIds"]
    pairs: dict[str, dict[str, float]] = defaultdict(dict)
    for observation in request["observations"]:
        pair_id = observation.get("pairId") or observation["experimentalUnitId"]
        if observation["conditionId"] in pairs[pair_id]:
            raise ValueError("Each D02 pair requires exactly one analyzed value per condition")
        pairs[pair_id][observation["conditionId"]] = float(observation["value"])

    incomplete = [pair_id for pair_id, values in pairs.items() if condition_a not in values or condition_b not in values]
    if incomplete:
        raise ValueError("Paired t-test requires both conditions for every matched unit")
    if len(pairs) < 2:
        raise ValueError("Paired t-test requires at least two complete matched units")

    ordered = sorted(pairs)
    a = np.asarray([pairs[pair_id][condition_a] for pair_id in ordered], dtype=float)
    b = np.asarray([pairs[pair_id][condition_b] for pair_id in ordered], dtype=float)
    differences = a - b
    if not np.all(np.isfinite(differences)):
        raise ValueError("Analysis values must be finite numbers")
    degrees_of_freedom = len(differences) - 1
    standard_deviation = float(np.std(differences, ddof=1))
    if standard_deviation == 0:
        raise ValueError("Paired t-test is undefined when every paired difference is identical")
    standard_error = standard_deviation / math.sqrt(len(differences))
    difference = float(np.mean(differences))
    confidence_level = float(request["options"]["confidenceLevel"])
    critical = _critical_value(confidence_level, degrees_of_freedom)
    test = stats.ttest_rel(
        a,
        b,
        alternative=request["options"]["alternative"].replace("two_sided", "two-sided"),
    )

    result = base_result(request)
    result["estimates"] = [
        estimate(
            "mean_paired_difference",
            difference,
            standard_error,
            {
                "level": confidence_level,
                "lower": difference - critical * standard_error,
                "upper": difference + critical * standard_error,
            },
        )
    ]
    result["tests"] = [
        {
            "name": "paired_t_test",
            "statisticName": "t",
            "statistic": float(test.statistic),
            "degreesOfFreedom": [float(degrees_of_freedom)],
            "pValue": float(test.pvalue),
            "adjustedPValue": None,
            "effectSizeName": "cohen_dz",
            "effectSize": difference / standard_deviation if standard_deviation > 0 else None,
        }
    ]
    result["diagnostics"] = [
        {
            "code": "paired_difference_distribution",
            "message": "The paired t-test concerns the distribution of within-unit differences, not either condition separately.",
        }
    ]
    if len(pairs) < 3:
        result["warnings"].append(
            {
                "code": "very_small_biological_n",
                "message": "Fewer than three complete biological pairs are available; estimation and assumption assessment are especially uncertain.",
            }
        )
    return result


def run_wilcoxon(request: dict[str, Any]) -> dict[str, Any]:
    condition_a, condition_b = request["contrastConditionIds"]
    pairs: dict[str, dict[str, float]] = defaultdict(dict)
    for observation in request["observations"]:
        pair_id = observation.get("pairId") or observation["experimentalUnitId"]
        condition_id = observation["conditionId"]
        if condition_id in pairs[pair_id]:
            raise ValueError("Each D02 pair requires exactly one analyzed value per condition")
        pairs[pair_id][condition_id] = float(observation["value"])
    incomplete = [
        pair_id
        for pair_id, values in pairs.items()
        if condition_a not in values or condition_b not in values
    ]
    if incomplete:
        raise ValueError("Wilcoxon signed-rank requires both conditions for every matched unit")
    if len(pairs) < 2:
        raise ValueError("Wilcoxon signed-rank requires at least two complete matched units")
    ordered = sorted(pairs)
    a = np.asarray([pairs[pair_id][condition_a] for pair_id in ordered], dtype=float)
    b = np.asarray([pairs[pair_id][condition_b] for pair_id in ordered], dtype=float)
    differences = a - b
    if not np.all(np.isfinite(differences)):
        raise ValueError("Analysis values must be finite numbers")
    if np.all(differences == 0):
        raise ValueError("Wilcoxon signed-rank is undefined when every paired difference is zero")
    test = stats.wilcoxon(
        a,
        b,
        zero_method="wilcox",
        correction=False,
        alternative=request["options"]["alternative"].replace("two_sided", "two-sided"),
        method="auto",
    )
    median_difference = float(np.median(differences))
    result = base_result(request)
    result["estimates"] = [estimate("median_paired_difference", median_difference, None, None)]
    result["tests"] = [
        {
            "name": "wilcoxon_signed_rank_test",
            "statisticName": "W",
            "statistic": float(test.statistic),
            "degreesOfFreedom": None,
            "pValue": float(test.pvalue),
            "adjustedPValue": None,
            "effectSizeName": None,
            "effectSize": None,
        }
    ]
    result["diagnostics"] = [
        {
            "code": "paired_rank_test_semantics",
            "message": "Wilcoxon signed-rank evaluates the distribution of non-zero within-unit differences and requires valid stable-unit pairing.",
        }
    ]
    return result


def _dispatch_request(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("protocolVersion") == "0.14.0":
        from .d17 import run_nonlinear_xy
        if request.get("templateId") == "D17" and request.get("method") == "nonlinear_xy_fit":
            return run_nonlinear_xy(request)
        raise ValueError(f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}")
    if request.get("protocolVersion") == "0.13.0":
        from .d16 import run_simple_regression
        if request.get("templateId") == "D16" and request.get("method") == "simple_linear_regression":
            return run_simple_regression(request)
        raise ValueError(f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}")
    if request.get("protocolVersion") == "0.12.0":
        from .d15 import run_friedman
        if request.get("templateId") == "D15" and request.get("method") == "friedman":
            return run_friedman(request)
        raise ValueError(f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}")
    if request.get("protocolVersion") == "0.11.0":
        from .d14 import run_contingency
        if request.get("templateId") == "D14" and request.get("method") in {"fisher_exact", "pearson_chi_square", "mcnemar_exact"}:
            return run_contingency(request)
        raise ValueError(f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}")
    if request.get("protocolVersion") == "0.9.0":
        from .d12 import run_one_sample

        if request.get("templateId") == "D12" and request.get("method") == "one_sample_t":
            return run_one_sample(request)
        raise ValueError(
            f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}"
        )
    if request.get("protocolVersion") == "0.8.0":
        from .d11 import run_survival

        if request.get("templateId") == "D11" and request.get("method") == "log_rank":
            return run_survival(request)
        raise ValueError(
            f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}"
        )
    if request.get("protocolVersion") == "0.7.0":
        if request.get("templateId") == "D07" and request.get("method") == "two_way_anova":
            return run_independent_factorial(request)
        raise ValueError(
            f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}"
        )
    if request.get("protocolVersion") == "0.6.0":
        if request.get("templateId") == "D06" and request.get("method") == "mixed_anova":
            return run_mixed_anova(request)
        raise ValueError(
            f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}"
        )
    if request.get("protocolVersion") == "0.10.0":
        if request.get("templateId") == "D13" and request.get("method") == "mixed_anova":
            categorical_request = dict(request)
            categorical_request["timePoints"] = [
                {"timePointId": level["levelId"], "value": level["order"]}
                for level in request.get("stateLevels", [])
            ]
            categorical_request["observations"] = [
                {**observation, "timePointId": observation["stateLevelId"]}
                for observation in request.get("observations", [])
            ]
            return run_mixed_anova(categorical_request)
        raise ValueError(
            f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}"
        )
    if request.get("protocolVersion") == "0.5.0":
        from .d09 import run_correlation

        if request.get("templateId") == "D09" and request.get("method") in {"pearson", "spearman"}:
            return run_correlation(request)
        raise ValueError(
            f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}"
        )
    if request.get("protocolVersion") == "0.4.0":
        if request.get("templateId") == "D05" and request.get("method") == "two_way_anova":
            return run_two_way_anova(request)
        raise ValueError(
            f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}"
        )
    if request.get("protocolVersion") == "0.3.0":
        if request.get("templateId") == "D04" and request.get("method") == "repeated_measures_anova":
            return run_repeated_measures_anova(request)
        raise ValueError(
            f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}"
        )
    if request.get("protocolVersion") == "0.2.0":
        if request.get("templateId") == "D03":
            if request.get("method") == "welch_anova":
                return run_welch_anova(request)
            if request.get("method") == "one_way_anova":
                return run_classical_one_way(request)
            if request.get("method") == "kruskal_wallis":
                return run_kruskal_wallis(request)
        raise ValueError(
            f"Unsupported template/method combination: {request.get('templateId')}/{request.get('method')}"
        )
    if request.get("protocolVersion") != "0.1.0":
        raise ValueError("Unsupported analysis protocol version")
    method = request.get("method")
    if request.get("templateId") == "D01":
        if method == "welch_t":
            return run_welch(request)
        if method == "student_t":
            return run_student(request)
        if method == "mann_whitney":
            return run_mann_whitney(request)
    if request.get("templateId") == "D02":
        if method == "paired_t":
            return run_paired(request)
        if method == "wilcoxon_signed_rank":
            return run_wilcoxon(request)
    raise ValueError(f"Unsupported template/method combination: {request.get('templateId')}/{method}")


def run_request(request: dict[str, Any]) -> dict[str, Any]:
    """Run one request while retaining numerical-library reliability warnings."""
    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter("always")
        result = _dispatch_request(request)
    existing = {warning.get("message") for warning in result.get("warnings", [])}
    for captured_warning in captured:
        message = str(captured_warning.message).strip()
        if not message or message in existing:
            continue
        result.setdefault("warnings", []).append(
            {
                "code": "numerical_library_reliability_warning",
                "message": f"The numerical library reported a reliability warning: {message}",
            }
        )
        existing.add(message)
    return result
