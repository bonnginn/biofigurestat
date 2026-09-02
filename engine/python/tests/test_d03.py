import unittest

import numpy as np
from scipy import stats

from lsaa_engine.d01_d02 import run_request
from lsaa_engine.d03 import _games_howell_upper_triangle


CONDITIONS = ["condition.control", "condition.low", "condition.high"]
VALUES = [[1.0, 2.0, 3.0], [2.0, 4.0, 6.0], [5.0, 6.0, 8.0, 9.0]]


def d03_request(
    values=VALUES,
    method="welch_anova",
    contrast_intent="all_pairs",
    multiplicity="games_howell_all_pairs",
    planned_pairs=None,
):
    observations = []
    for condition_index, (condition_id, group) in enumerate(zip(CONDITIONS, values)):
        for replicate, value in enumerate(group):
            observations.append(
                {
                    "observationId": f"observation.{condition_index}.{replicate}",
                    "conditionId": condition_id,
                    "value": value,
                    "experimentalUnitId": f"unit.{condition_index}.{replicate}",
                }
            )
    request = {
        "protocolVersion": "0.2.0",
        "requestId": "request.d03",
        "projectId": "project.d03",
        "analysisId": "analysis.d03",
        "templateId": "D03",
        "templateVersion": "0.1.0",
        "method": method,
        "conditionIds": CONDITIONS,
        "controlConditionId": CONDITIONS[0],
        "contrastIntent": contrast_intent,
        "primaryContrastConditionIds": [CONDITIONS[0], CONDITIONS[-1]],
        "observations": observations,
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": multiplicity,
        },
    }
    if planned_pairs is not None:
        request["plannedContrastConditionIds"] = planned_pairs
    return request


class D03EngineTests(unittest.TestCase):
    def test_upper_triangle_games_howell_matches_full_scipy_matrices(self):
        samples = [
            np.asarray([1.0, 1.04, 0.98]),
            np.asarray([1.15, 1.21, 1.26, 1.18]),
            np.asarray([1.37, 1.43, 1.49]),
            np.asarray([0.72, 0.81, 0.76, 0.88, 0.79]),
            np.asarray([1.55, 1.63, 1.71]),
        ]
        expected = stats.tukey_hsd(*samples, equal_var=False)
        expected_interval = expected.confidence_interval(confidence_level=0.95)
        actual = _games_howell_upper_triangle(samples, 0.95)

        self.assertEqual(len(actual), 10)
        for comparison in actual:
            first_index = comparison.first_index
            second_index = comparison.second_index
            self.assertAlmostEqual(
                comparison.adjusted_p_value,
                float(expected.pvalue[first_index, second_index]),
                places=14,
            )
            self.assertAlmostEqual(
                comparison.confidence_lower,
                float(expected_interval.low[first_index, second_index]),
                places=14,
            )
            self.assertAlmostEqual(
                comparison.confidence_upper,
                float(expected_interval.high[first_index, second_index]),
                places=14,
            )

    def test_welch_anova_and_games_howell_fixture(self):
        result = run_request(d03_request())

        self.assertEqual(result["protocolVersion"], "0.2.0")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(len(result["estimates"]), 3)
        self.assertEqual(len(result["tests"]), 4)
        self.assertAlmostEqual(result["tests"][0]["statistic"], 9.348454289965282, places=12)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.02789952270433744, places=12)
        self.assertEqual(result["tests"][0]["degreesOfFreedom"][0], 2.0)
        self.assertAlmostEqual(
            result["tests"][0]["degreesOfFreedom"][1], 4.240447797517644, places=12
        )
        self.assertEqual(result["tests"][1]["name"], "games_howell:condition.control:condition.low")
        self.assertAlmostEqual(result["tests"][1]["adjustedPValue"], 0.3903529, places=7)
        self.assertAlmostEqual(result["tests"][2]["adjustedPValue"], 0.01467458, places=8)
        self.assertAlmostEqual(result["tests"][3]["adjustedPValue"], 0.21416053, places=8)

    def test_duplicate_experimental_unit_is_rejected(self):
        request = d03_request()
        request["observations"][1]["experimentalUnitId"] = request["observations"][0][
            "experimentalUnitId"
        ]

        with self.assertRaisesRegex(ValueError, "only one analyzed value"):
            run_request(request)

    def test_zero_within_group_variance_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "within-group variance"):
            run_request(d03_request([[1.0, 1.0, 1.0], VALUES[1], VALUES[2]]))

    def test_explicit_control_must_be_declared(self):
        request = d03_request()
        request["controlConditionId"] = "condition.not-declared"
        with self.assertRaisesRegex(ValueError, "control condition"):
            run_request(request)

    def test_classical_anova_and_tukey_fixture(self):
        result = run_request(
            d03_request(
                method="one_way_anova",
                contrast_intent="all_pairs",
                multiplicity="tukey_hsd_all_pairs",
            )
        )
        self.assertEqual(result["tests"][0]["name"], "classical_one_way_anova")
        self.assertAlmostEqual(result["tests"][0]["statistic"], 7.770000000000002, places=12)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.016691849068375467, places=12)
        self.assertEqual(result["tests"][1]["name"], "tukey_hsd:condition.control:condition.low")
        self.assertAlmostEqual(result["tests"][1]["adjustedPValue"], 0.3691313698337263, places=12)
        self.assertEqual(result["diagnostics"][0]["code"], "equal_variance_assumption_selected")

    def test_classical_anova_and_dunnett_uses_stable_control_id(self):
        result = run_request(
            d03_request(
                method="one_way_anova",
                contrast_intent="control_vs_many",
                multiplicity="dunnett_control_vs_many",
            )
        )
        self.assertEqual(len(result["tests"]), 3)
        self.assertEqual(
            result["tests"][1]["name"],
            "dunnett:condition.low:condition.control",
        )
        self.assertEqual(
            result["tests"][2]["name"],
            "dunnett:condition.high:condition.control",
        )
        self.assertAlmostEqual(result["tests"][1]["adjustedPValue"], 0.30617527, places=7)
        self.assertAlmostEqual(result["tests"][2]["adjustedPValue"], 0.01109724, places=7)

    def test_dunnett_requires_declared_control(self):
        request = d03_request(
            method="one_way_anova",
            contrast_intent="control_vs_many",
            multiplicity="dunnett_control_vs_many",
        )
        request.pop("controlConditionId")
        with self.assertRaisesRegex(ValueError, "explicit declared control"):
            run_request(request)

    def test_d03_explicitly_rejects_unimplemented_one_sided_inference(self):
        request = d03_request(
            method="one_way_anova",
            contrast_intent="control_vs_many",
            multiplicity="dunnett_control_vs_many",
        )
        request["options"]["alternative"] = "greater"
        with self.assertRaisesRegex(ValueError, "two-sided"):
            run_request(request)

    def test_kruskal_wallis_is_omnibus_only(self):
        result = run_request(
            d03_request(
                method="kruskal_wallis",
                contrast_intent="omnibus_only",
                multiplicity=None,
            )
        )
        self.assertEqual(len(result["tests"]), 1)
        self.assertEqual(result["tests"][0]["name"], "kruskal_wallis_test")
        self.assertAlmostEqual(result["tests"][0]["statistic"], 6.108128834355825, places=12)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.047166828608461144, places=12)
        self.assertEqual(result["diagnostics"][0]["code"], "omnibus_only_no_posthoc")

    def test_kruskal_wallis_all_pairs_uses_dunn_with_holm_adjustment(self):
        result = run_request(
            d03_request(
                method="kruskal_wallis",
                contrast_intent="all_pairs",
                multiplicity="dunn_holm_all_pairs",
            )
        )
        self.assertEqual(len(result["tests"]), 4)
        self.assertEqual(
            result["tests"][1]["name"],
            "dunn_holm:condition.control:condition.low",
        )
        self.assertTrue(all(test["adjustedPValue"] is not None for test in result["tests"][1:]))
        self.assertTrue(
            all(test["adjustedPValue"] >= test["pValue"] for test in result["tests"][1:])
        )
        self.assertEqual(result["diagnostics"][0]["code"], "dunn_holm_posthoc")

    def test_selected_planned_pairs_use_pooled_variance_and_holm_adjustment(self):
        result = run_request(
            d03_request(
                method="one_way_anova",
                contrast_intent="planned_comparisons",
                multiplicity="holm_planned_comparisons",
                planned_pairs=[
                    ["condition.control", "condition.low"],
                    ["condition.control", "condition.high"],
                ],
            )
        )
        self.assertEqual(len(result["tests"]), 3)
        self.assertEqual(
            result["tests"][1]["name"],
            "planned_holm:condition.control:condition.low",
        )
        self.assertEqual(
            result["tests"][2]["name"],
            "planned_holm:condition.control:condition.high",
        )
        self.assertGreaterEqual(
            result["tests"][1]["adjustedPValue"], result["tests"][1]["pValue"]
        )
        self.assertGreaterEqual(
            result["tests"][2]["adjustedPValue"], result["tests"][2]["pValue"]
        )
        self.assertAlmostEqual(result["tests"][1]["statistic"], -1.4491376746189437, places=12)
        self.assertAlmostEqual(result["tests"][1]["pValue"], 0.19057315090779597, places=12)
        self.assertAlmostEqual(
            result["tests"][1]["adjustedPValue"], 0.19057315090779597, places=12
        )
        self.assertAlmostEqual(result["tests"][2]["statistic"], -3.872983346207417, places=12)
        self.assertAlmostEqual(result["tests"][2]["pValue"], 0.006108090476886746, places=12)
        self.assertAlmostEqual(
            result["tests"][2]["adjustedPValue"], 0.012216180953773493, places=12
        )
        self.assertIsNone(result["estimates"][0]["confidenceInterval"])
        self.assertEqual(
            result["diagnostics"][1]["code"], "planned_pairwise_no_simultaneous_ci"
        )
        self.assertIn("statsmodels", result["engine"]["packages"])

    def test_planned_pairs_require_unique_declared_condition_pairs(self):
        request = d03_request(
            method="one_way_anova",
            contrast_intent="planned_comparisons",
            multiplicity="holm_planned_comparisons",
            planned_pairs=[
                ["condition.control", "condition.low"],
                ["condition.low", "condition.control"],
            ],
        )
        with self.assertRaisesRegex(ValueError, "duplicate"):
            run_request(request)


if __name__ == "__main__":
    unittest.main()
