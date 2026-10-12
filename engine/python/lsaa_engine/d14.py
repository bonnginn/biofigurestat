"""D14: explicit independent contingency or paired-binary analysis."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy import stats

from .result_common import base_result, estimate


def _table(request: dict[str, Any]) -> np.ndarray:
    rows = request["rowCategoryIds"]
    columns = request["columnCategoryIds"]
    if len(set(rows)) != len(rows) or len(set(columns)) != len(columns):
        raise ValueError("Row and column category IDs must be unique")
    lookup = {(cell["rowCategoryId"], cell["columnCategoryId"]): cell["count"] for cell in request["cells"]}
    expected = {(row, column) for row in rows for column in columns}
    if set(lookup) != expected or len(lookup) != len(request["cells"]):
        raise ValueError("Every contingency cell must be supplied exactly once")
    counts = [[lookup[(row, column)] for column in columns] for row in rows]
    integer_limit = np.iinfo(np.dtype(int)).max
    for row in counts:
        for count in row:
            if (
                isinstance(count, bool)
                or not isinstance(count, (int, float))
                or count < 0
                or count > integer_limit
                or not math.isfinite(count)
                or count != math.floor(count)
            ):
                raise ValueError("Contingency counts must be finite non-negative integers")
    total = sum(int(count) for row in counts for count in row)
    if total > integer_limit:
        raise ValueError("Contingency total exceeds the supported integer range")
    values = np.asarray(counts, dtype=int)
    if total == 0:
        raise ValueError("A contingency table cannot have total n=0")
    return values


def _ratio_estimates(table: np.ndarray, confidence_level: float) -> list[dict[str, Any]]:
    if table.shape != (2, 2):
        return []
    a, b, c, d = (float(value) for value in table.ravel())
    corrected = [value + 0.5 if 0 in (a, b, c, d) else value for value in (a, b, c, d)]
    aa, bb, cc, dd = corrected
    z = float(stats.norm.ppf(1 - (1 - confidence_level) / 2))
    odds_ratio = aa * dd / (bb * cc)
    odds_se = math.sqrt(1 / aa + 1 / bb + 1 / cc + 1 / dd)
    risk_a = aa / (aa + bb)
    risk_c = cc / (cc + dd)
    risk_ratio = risk_a / risk_c
    risk_se = math.sqrt(1 / aa - 1 / (aa + bb) + 1 / cc - 1 / (cc + dd))
    return [
        estimate("odds_ratio", odds_ratio, odds_se, {"level": confidence_level, "lower": math.exp(math.log(odds_ratio) - z * odds_se), "upper": math.exp(math.log(odds_ratio) + z * odds_se)}),
        estimate("risk_ratio", risk_ratio, risk_se, {"level": confidence_level, "lower": math.exp(math.log(risk_ratio) - z * risk_se), "upper": math.exp(math.log(risk_ratio) + z * risk_se)}),
    ]


def run_contingency(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("options", {}).get("alternative", "two_sided") != "two_sided":
        raise ValueError("D14 currently supports only two_sided; directional inference is not implemented")
    table = _table(request)
    method = request["method"]
    structure = request["structure"]
    if method == "mcnemar_exact":
        if structure != "paired_binary" or table.shape != (2, 2):
            raise ValueError("McNemar requires paired binary outcomes in a 2 by 2 table")
        discordant_a, discordant_b = int(table[0, 1]), int(table[1, 0])
        discordant = discordant_a + discordant_b
        p_value = 1.0 if discordant == 0 else float(stats.binomtest(min(discordant_a, discordant_b), discordant, 0.5, alternative="two-sided").pvalue)
        statistic = float(min(discordant_a, discordant_b))
        statistic_name = "discordant_min"
        test_name = "exact_mcnemar_test"
    elif structure != "independent":
        raise ValueError("Fisher and Pearson Chi-square require independent groups")
    elif method == "fisher_exact":
        if table.shape != (2, 2):
            raise ValueError("Fisher's exact test requires a 2 by 2 table")
        fisher = stats.fisher_exact(table, alternative="two-sided")
        statistic, p_value = float(fisher.statistic), float(fisher.pvalue)
        if not math.isfinite(statistic):
            raise ValueError("Fisher sample odds ratio is infinite or undefined for these raw counts; the existing finite result contract cannot report it. No corrected OR was substituted for the Fisher statistic.")
        statistic_name, test_name = "odds_ratio", "fisher_exact_test"
    elif method == "pearson_chi_square":
        chi = stats.chi2_contingency(table, correction=False)
        if np.any(chi.expected_freq < 5):
            raise ValueError("Pearson Chi-square expected counts are below 5; choose an exact supported route or collect more data")
        statistic, p_value = float(chi.statistic), float(chi.pvalue)
        statistic_name, test_name = "chi_square", "pearson_chi_square_test"
    else:
        raise ValueError(f"Unsupported D14 method: {method}")

    result = base_result(request)
    if structure == "independent":
        result["estimates"] = _ratio_estimates(table, float(request["options"]["confidenceLevel"]))
    result["tests"] = [{"name": test_name, "statisticName": statistic_name, "statistic": statistic, "degreesOfFreedom": [float((table.shape[0] - 1) * (table.shape[1] - 1))] if method == "pearson_chi_square" else None, "pValue": p_value, "adjustedPValue": None, "effectSizeName": None, "effectSize": None}]
    result["diagnostics"] = [{"code": "categorical_structure_recorded", "message": f"{structure}; experimental unit={request['experimentalUnit']}; total n={int(table.sum())}; counts={table.tolist()}"}]
    if structure == "independent" and table.shape == (2, 2):
        correction = "0.5 added to all four cells because at least one raw cell is zero" if np.any(table == 0) else "no zero-cell correction"
        result["diagnostics"].append({"code": "ratio_estimation_contract", "message": f"OR and RR estimates and central two-sided log-Wald confidence intervals use {correction}; standardError is on the log-ratio scale. RR compares row 0 to row 1 with column 0 as the event. Fisher's statistic, when present, is the uncorrected sample OR and its p-value uses the original counts; these intervals are not Fisher exact intervals."})
    return result
