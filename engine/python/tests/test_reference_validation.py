import unittest

import numpy as np
import pandas as pd
from statsmodels.stats.anova import AnovaRM
from statsmodels.formula.api import ols
from statsmodels.stats.anova import anova_lm
from statsmodels.stats.weightstats import CompareMeans, DescrStatsW
from statsmodels.stats.oneway import anova_oneway, effectsize_oneway
from statsmodels.stats.libqsturng import psturng, qsturng

from lsaa_engine.d01_d02 import run_request
from test_d01_d02 import request
from test_d03 import VALUES, d03_request
from test_d04 import CONDITIONS as D04_CONDITIONS, VALUES as D04_VALUES, d04_request
from test_d05 import CONDITIONS as D05_CONDITIONS, VALUES as D05_VALUES, d05_request
from test_d09 import d09_request


class IndependentReferenceValidationTests(unittest.TestCase):
    def test_d09_correlations_match_standardized_statsmodels_regression(self):
        for method in ("pearson", "spearman"):
            request = d09_request(method)
            production = run_request(request)
            by_pair = {}
            for observation in request["observations"]:
                by_pair.setdefault(observation["pairId"], {})[observation["conditionId"]] = observation["value"]
            frame = pd.DataFrame(
                [
                    {"x": values["condition.x"], "y": values["condition.y"]}
                    for _, values in sorted(by_pair.items())
                ]
            )
            if method == "spearman":
                frame = frame.rank(method="average")
            frame["x_z"] = (frame["x"] - frame["x"].mean()) / frame["x"].std(ddof=1)
            frame["y_z"] = (frame["y"] - frame["y"].mean()) / frame["y"].std(ddof=1)
            reference = ols("y_z ~ x_z", data=frame).fit()
            self.assertAlmostEqual(production["estimates"][0]["value"], reference.params["x_z"], places=12)
            self.assertAlmostEqual(production["tests"][0]["pValue"], reference.pvalues["x_z"], places=12)

    def test_d05_four_by_two_type3_tests_match_statsmodels(self):
        levels_a = ["control", "seq1", "seq2", "seq3"]
        levels_b = ["drug_minus", "drug_plus"]
        values = {
            (level_a, level_b): [
                1.0 + a_index * 0.35 + b_index * 0.2 + replicate * 0.17
                + (0.45 if a_index >= 2 and b_index == 1 else 0.0)
                for replicate in range(3)
            ]
            for a_index, level_a in enumerate(levels_a)
            for b_index, level_b in enumerate(levels_b)
        }
        conditions = [
            (f"condition.{level_a}.{level_b}", level_a, level_b)
            for level_a in levels_a
            for level_b in levels_b
        ]
        observations = [
            {
                "observationId": f"observation.{condition_index}.{replicate}",
                "conditionId": condition_id,
                "value": value,
                "experimentalUnitId": f"unit.{condition_index}.{replicate}",
            }
            for condition_index, (condition_id, level_a, level_b) in enumerate(conditions)
            for replicate, value in enumerate(values[(level_a, level_b)])
        ]
        request = {
            "protocolVersion": "0.4.0",
            "requestId": "request.d05.4x2",
            "projectId": "project.d05.4x2",
            "analysisId": "analysis.d05.4x2",
            "templateId": "D05",
            "templateVersion": "0.1.0",
            "method": "two_way_anova",
            "factors": [
                {
                    "factorId": "factor.a",
                    "levelIds": levels_a,
                    "levelGroups": [
                        {"groupId": "group.control", "levelIds": ["control"]},
                        {"groupId": "group.target", "levelIds": ["seq1", "seq2", "seq3"]},
                    ],
                },
                {"factorId": "factor.b", "levelIds": levels_b},
            ],
            "conditions": [
                {
                    "conditionId": condition_id,
                    "factorALevelId": level_a,
                    "factorBLevelId": level_b,
                }
                for condition_id, level_a, level_b in conditions
            ],
            "primaryContrastConditionIds": [conditions[0][0], conditions[-1][0]],
            "observations": observations,
            "options": {
                "alternative": "two_sided",
                "confidenceLevel": 0.95,
                "multiplicityMethod": "holm_all_cell_pairs",
            },
        }

        production = run_request(request)
        frame = pd.DataFrame(
            [
                {"A": level_a, "B": level_b, "value": value}
                for level_a in levels_a
                for level_b in levels_b
                for value in values[(level_a, level_b)]
            ]
        )
        reference = anova_lm(ols("value ~ C(A, Sum) * C(B, Sum)", data=frame).fit(), typ=3)
        expected_rows = ["C(A, Sum):C(B, Sum)", "C(A, Sum)", "C(B, Sum)"]
        for production_test, row_name in zip(production["tests"][:3], expected_rows):
            self.assertAlmostEqual(production_test["statistic"], reference.loc[row_name, "F"], places=10)
            self.assertAlmostEqual(production_test["pValue"], reference.loc[row_name, "PR(>F)"], places=10)

    def test_d05_type3_factorial_tests_match_statsmodels(self):
        production = run_request(d05_request())
        frame = pd.DataFrame(
            [
                {"A": level_a, "B": level_b, "value": value}
                for condition_index, (_, level_a, level_b) in enumerate(D05_CONDITIONS)
                for value in D05_VALUES[condition_index]
            ]
        )
        fitted = ols("value ~ C(A, Sum) * C(B, Sum)", data=frame).fit()
        reference = anova_lm(fitted, typ=3)
        expected_rows = ["C(A, Sum):C(B, Sum)", "C(A, Sum)", "C(B, Sum)"]
        for production_test, row_name in zip(production["tests"][:3], expected_rows):
            self.assertAlmostEqual(production_test["statistic"], reference.loc[row_name, "F"], places=12)
            self.assertAlmostEqual(production_test["pValue"], reference.loc[row_name, "PR(>F)"], places=12)

    def test_d05_unbalanced_type3_tests_match_statsmodels(self):
        values = [
            [1.0, 1.4, 1.8],
            [2.0, 2.5, 3.0, 3.4],
            [1.5, 2.1, 2.4, 2.8, 3.1],
            [5.0, 6.2, 7.1],
        ]
        production = run_request(d05_request(values))
        frame = pd.DataFrame(
            [
                {"A": level_a, "B": level_b, "value": value}
                for condition_index, (_, level_a, level_b) in enumerate(D05_CONDITIONS)
                for value in values[condition_index]
            ]
        )
        reference = anova_lm(ols("value ~ C(A, Sum) * C(B, Sum)", data=frame).fit(), typ=3)
        expected_rows = ["C(A, Sum):C(B, Sum)", "C(A, Sum)", "C(B, Sum)"]
        for production_test, row_name in zip(production["tests"][:3], expected_rows):
            self.assertAlmostEqual(production_test["statistic"], reference.loc[row_name, "F"], places=12)
            self.assertAlmostEqual(production_test["pValue"], reference.loc[row_name, "PR(>F)"], places=12)

    def test_d04_repeated_omnibus_matches_statsmodels(self):
        production = run_request(d04_request())
        frame = pd.DataFrame(
            [
                {"unit": unit_index, "condition": condition, "value": row[condition_index]}
                for unit_index, row in enumerate(D04_VALUES)
                for condition_index, condition in enumerate(D04_CONDITIONS)
            ]
        )
        reference = AnovaRM(frame, "value", "unit", within=["condition"]).fit().anova_table
        row = reference.loc["condition"]

        self.assertAlmostEqual(production["tests"][0]["statistic"], row["F Value"], places=12)
        self.assertAlmostEqual(production["tests"][0]["pValue"], row["Pr > F"], places=12)
        self.assertAlmostEqual(production["tests"][0]["degreesOfFreedom"][0], row["Num DF"], places=12)
        self.assertAlmostEqual(production["tests"][0]["degreesOfFreedom"][1], row["Den DF"], places=12)

    def test_d03_welch_omnibus_matches_statsmodels(self):
        groups = [np.asarray(values, dtype=float) for values in VALUES]
        production = run_request(d03_request())
        reference = anova_oneway(groups, use_var="unequal", welch_correction=True)
        reference_f_squared = effectsize_oneway(
            np.asarray([group.mean() for group in groups]),
            np.asarray([group.var(ddof=1) for group in groups]),
            np.asarray([len(group) for group in groups]),
            use_var="unequal",
        )

        self.assertAlmostEqual(production["tests"][0]["statistic"], reference.statistic, places=12)
        self.assertAlmostEqual(production["tests"][0]["pValue"], reference.pvalue, places=12)
        self.assertAlmostEqual(production["tests"][0]["degreesOfFreedom"][0], reference.df[0], places=12)
        self.assertAlmostEqual(production["tests"][0]["degreesOfFreedom"][1], reference.df[1], places=12)
        self.assertAlmostEqual(
            production["tests"][0]["effectSize"], np.sqrt(reference_f_squared), places=12
        )

    def test_d03_games_howell_matches_statsmodels_studentized_range(self):
        groups = [np.asarray(values, dtype=float) for values in VALUES]
        production = run_request(d03_request())
        pair_index = 0
        for first_index, first in enumerate(groups):
            for second_index in range(first_index + 1, len(groups)):
                second = groups[second_index]
                first_component = first.var(ddof=1) / len(first)
                second_component = second.var(ddof=1) / len(second)
                degrees_of_freedom = (first_component + second_component) ** 2 / (
                    first_component**2 / (len(first) - 1)
                    + second_component**2 / (len(second) - 1)
                )
                q_statistic = abs(first.mean() - second.mean()) / np.sqrt(
                    0.5 * (first_component + second_component)
                )
                reference_p = float(psturng(q_statistic, len(groups), degrees_of_freedom)[0])
                reference_half_width = float(
                    qsturng(0.95, len(groups), degrees_of_freedom)
                    * np.sqrt(0.5 * (first_component + second_component))
                )
                production_test = production["tests"][pair_index + 1]
                production_estimate = production["estimates"][pair_index]
                self.assertAlmostEqual(
                    production_test["adjustedPValue"], reference_p, delta=0.001
                )
                self.assertAlmostEqual(
                    production_estimate["confidenceInterval"]["lower"],
                    production_estimate["value"] - reference_half_width,
                    delta=0.01,
                )
                self.assertAlmostEqual(
                    production_estimate["confidenceInterval"]["upper"],
                    production_estimate["value"] + reference_half_width,
                    delta=0.01,
                )
                pair_index += 1

    def test_welch_result_matches_statsmodels(self):
        control = np.asarray([1.2, 1.5, 1.7, 2.0])
        treatment = np.asarray([2.1, 2.4, 2.8, 3.0, 3.2])
        observations = []
        for condition, values in (
            ("condition.control", control),
            ("condition.treatment", treatment),
        ):
            for index, value in enumerate(values):
                observations.append(
                    {
                        "observationId": f"observation.{condition}.{index}",
                        "conditionId": condition,
                        "value": float(value),
                        "experimentalUnitId": f"unit.{condition}.{index}",
                    }
                )

        production = run_request(request("D01", "welch_t", observations))
        reference = CompareMeans(DescrStatsW(control), DescrStatsW(treatment))
        statistic, p_value, degrees_of_freedom = reference.ttest_ind(usevar="unequal")
        lower, upper = reference.tconfint_diff(usevar="unequal")

        self.assertAlmostEqual(production["tests"][0]["statistic"], statistic, places=12)
        self.assertAlmostEqual(production["tests"][0]["pValue"], p_value, places=12)
        self.assertAlmostEqual(
            production["tests"][0]["degreesOfFreedom"][0], degrees_of_freedom, places=12
        )
        self.assertAlmostEqual(
            production["estimates"][0]["confidenceInterval"]["lower"], lower, places=12
        )
        self.assertAlmostEqual(
            production["estimates"][0]["confidenceInterval"]["upper"], upper, places=12
        )

    def test_welch_tost_matches_statsmodels_unequal_variance_reference(self):
        control = np.asarray([1.2, 1.5, 1.7, 2.0])
        treatment = np.asarray([2.1, 2.4, 2.8, 3.0, 3.2])
        observations = []
        for condition, values in (
            ("condition.control", control),
            ("condition.treatment", treatment),
        ):
            for index, value in enumerate(values):
                observations.append(
                    {
                        "observationId": f"observation.{condition}.{index}",
                        "conditionId": condition,
                        "value": float(value),
                        "experimentalUnitId": f"unit.{condition}.{index}",
                    }
                )
        production = run_request(
            {
                "protocolVersion": "0.15.0",
                "requestId": "request.equivalence.reference",
                "projectId": "project.reference",
                "analysisId": "analysis.equivalence.reference",
                "templateId": "D01",
                "templateVersion": "0.2.0",
                "method": "welch_tost",
                "comparisonId": "control:treatment",
                "contrastConditionIds": ["condition.control", "condition.treatment"],
                "equivalencePlan": {
                    "schemaVersion": "0.1.0",
                    "margin": {
                        "scale": "raw_difference",
                        "lowerBound": -2.0,
                        "upperBound": 0.2,
                        "unit": "AU",
                        "declaredAsPrespecified": True,
                    },
                    "alpha": 0.05,
                    "claimMode": "single_primary_comparison",
                    "primaryComparisonId": "control:treatment",
                },
                "observations": observations,
                "options": {
                    "alternative": "two_sided",
                    "confidenceLevel": 0.9,
                    "multiplicityMethod": None,
                },
            }
        )
        reference = CompareMeans(DescrStatsW(control), DescrStatsW(treatment))
        tost_p, (lower_test, upper_test) = reference.ttost_ind(-2.0, 0.2, usevar="unequal")
        lower_ci, upper_ci = reference.tconfint_diff(alpha=0.1, usevar="unequal")
        comparison = production["equivalence"]["comparisons"][0]

        self.assertAlmostEqual(comparison["tostPValue"], tost_p, places=12)
        self.assertAlmostEqual(comparison["lowerOneSidedPValue"], lower_test[1], places=12)
        self.assertAlmostEqual(comparison["upperOneSidedPValue"], upper_test[1], places=12)
        self.assertAlmostEqual(production["tests"][0]["statistic"], lower_test[0], places=12)
        self.assertAlmostEqual(production["tests"][1]["statistic"], upper_test[0], places=12)
        self.assertAlmostEqual(comparison["lowerConfidenceBound"], lower_ci, places=12)
        self.assertAlmostEqual(comparison["upperConfidenceBound"], upper_ci, places=12)

    def test_paired_difference_result_matches_statsmodels(self):
        control = np.asarray([10.0, 13.0, 9.0, 15.0, 11.0])
        treatment = np.asarray([12.0, 15.0, 14.0, 18.0, 13.0])
        observations = []
        for index, (control_value, treatment_value) in enumerate(zip(control, treatment)):
            for condition, value in (
                ("condition.control", control_value),
                ("condition.treatment", treatment_value),
            ):
                observations.append(
                    {
                        "observationId": f"observation.{condition}.{index}",
                        "conditionId": condition,
                        "value": float(value),
                        "experimentalUnitId": f"unit.{index}",
                        "pairId": f"pair.{index}",
                    }
                )

        production = run_request(request("D02", "paired_t", observations))
        reference = DescrStatsW(control - treatment)
        statistic, p_value, degrees_of_freedom = reference.ttest_mean(0)
        lower, upper = reference.tconfint_mean()

        self.assertAlmostEqual(production["tests"][0]["statistic"], statistic, places=12)
        self.assertAlmostEqual(production["tests"][0]["pValue"], p_value, places=12)
        self.assertAlmostEqual(
            production["tests"][0]["degreesOfFreedom"][0], degrees_of_freedom, places=12
        )
        self.assertAlmostEqual(
            production["estimates"][0]["confidenceInterval"]["lower"], lower, places=12
        )
        self.assertAlmostEqual(
            production["estimates"][0]["confidenceInterval"]["upper"], upper, places=12
        )


if __name__ == "__main__":
    unittest.main()
