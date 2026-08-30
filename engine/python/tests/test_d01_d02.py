import math
import unittest

from lsaa_engine.d01_d02 import run_request


def request(template_id, method, observations):
    return {
        "protocolVersion": "0.1.0",
        "requestId": "request.fixture",
        "projectId": "project.fixture",
        "analysisId": "analysis.fixture",
        "templateId": template_id,
        "templateVersion": "0.1.0",
        "method": method,
        "contrastConditionIds": ["condition.control", "condition.treatment"],
        "observations": observations,
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": None,
        },
    }


class D01D02EngineTests(unittest.TestCase):
    def test_duplicate_independent_unit_is_rejected(self):
        observations = [
            {
                "observationId": "a.1",
                "conditionId": "condition.a",
                "value": 1.0,
                "experimentalUnitId": "unit.shared",
            },
            {
                "observationId": "a.2",
                "conditionId": "condition.a",
                "value": 2.0,
                "experimentalUnitId": "unit.shared",
            },
            {
                "observationId": "b.1",
                "conditionId": "condition.b",
                "value": 3.0,
                "experimentalUnitId": "unit.b.1",
            },
            {
                "observationId": "b.2",
                "conditionId": "condition.b",
                "value": 4.0,
                "experimentalUnitId": "unit.b.2",
            },
        ]
        with self.assertRaisesRegex(ValueError, "only one analyzed value"):
            run_request(request("D01", "welch_t", observations))

    def test_welch_fixture(self):
        observations = []
        for condition, values in (
            ("condition.control", [1.2, 1.5, 1.7, 2.0]),
            ("condition.treatment", [2.1, 2.4, 2.8, 3.0, 3.2]),
        ):
            for index, value in enumerate(values):
                observations.append(
                    {
                        "observationId": f"observation.{condition}.{index}",
                        "conditionId": condition,
                        "value": value,
                        "experimentalUnitId": f"unit.{condition}.{index}",
                    }
                )
        result = run_request(request("D01", "welch_t", observations))
        self.assertEqual(result["status"], "ok")
        self.assertAlmostEqual(result["estimates"][0]["value"], -1.1, places=12)
        self.assertAlmostEqual(result["estimates"][0]["standardError"], 0.2614064523559687, places=12)
        self.assertAlmostEqual(result["tests"][0]["statistic"], -4.208006306218033, places=12)
        self.assertAlmostEqual(result["tests"][0]["degreesOfFreedom"][0], 6.994452149791955, places=12)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.004002714883968111, places=12)
        self.assertAlmostEqual(result["tests"][0]["effectSize"], -2.4210372418329253, places=12)

    def test_welch_retains_numerical_warning_for_one_zero_variance_condition(self):
        observations = []
        for condition, values in (
            ("condition.control", [1.0, 1.0, 1.0]),
            ("condition.treatment", [2.0, 3.0, 5.0]),
        ):
            for index, value in enumerate(values):
                observations.append(
                    {
                        "observationId": f"observation.{condition}.{index}",
                        "conditionId": condition,
                        "value": value,
                        "experimentalUnitId": f"unit.{condition}.{index}",
                    }
                )

        result = run_request(request("D01", "welch_t", observations))

        self.assertEqual(result["status"], "ok")
        self.assertTrue(
            any(
                warning["code"] == "numerical_library_reliability_warning"
                for warning in result["warnings"]
            )
        )

    def test_paired_fixture(self):
        observations = []
        for index, (control, treatment) in enumerate(((10, 12), (13, 15), (9, 14), (15, 18), (11, 13))):
            for condition, value in (("condition.control", control), ("condition.treatment", treatment)):
                observations.append(
                    {
                        "observationId": f"observation.{condition}.{index}",
                        "conditionId": condition,
                        "value": value,
                        "experimentalUnitId": f"unit.{index}",
                        "pairId": f"pair.{index}",
                    }
                )
        result = run_request(request("D02", "paired_t", observations))
        self.assertEqual(result["status"], "ok")
        self.assertAlmostEqual(result["estimates"][0]["value"], -2.8, places=12)
        self.assertAlmostEqual(result["tests"][0]["statistic"], -4.801960383990248, places=12)
        self.assertEqual(result["tests"][0]["degreesOfFreedom"], [4.0])
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.008635792607551535, places=12)
        self.assertAlmostEqual(result["tests"][0]["effectSize"], -2.147501968772637, places=12)

    def test_student_equal_variance_fixture(self):
        observations = []
        for condition, values in (
            ("condition.control", [1.2, 1.5, 1.7, 2.0]),
            ("condition.treatment", [2.1, 2.4, 2.8, 3.0, 3.2]),
        ):
            for index, value in enumerate(values):
                observations.append(
                    {
                        "observationId": f"observation.{condition}.{index}",
                        "conditionId": condition,
                        "value": value,
                        "experimentalUnitId": f"unit.{condition}.{index}",
                    }
                )
        result = run_request(request("D01", "student_t", observations))
        self.assertEqual(result["tests"][0]["name"], "student_two_sample_t_test")
        self.assertAlmostEqual(result["tests"][0]["statistic"], -4.0633386823600315, places=12)
        self.assertEqual(result["tests"][0]["degreesOfFreedom"], [7.0])
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.004789347003160528, places=12)

    def test_mann_whitney_fixture_and_semantics(self):
        observations = []
        for condition, values in (
            ("condition.control", [1, 2, 2, 4]),
            ("condition.treatment", [3, 5, 6, 7]),
        ):
            for index, value in enumerate(values):
                observations.append(
                    {
                        "observationId": f"observation.{condition}.{index}",
                        "conditionId": condition,
                        "value": value,
                        "experimentalUnitId": f"unit.{condition}.{index}",
                    }
                )
        result = run_request(request("D01", "mann_whitney", observations))
        self.assertEqual(result["tests"][0]["name"], "mann_whitney_u_test")
        self.assertAlmostEqual(result["tests"][0]["statistic"], 1.0, places=12)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.0590718680155165, places=12)
        self.assertAlmostEqual(result["tests"][0]["effectSize"], -0.875, places=12)
        self.assertEqual(result["diagnostics"][0]["code"], "rank_distribution_test_semantics")

    def test_mann_whitney_rejects_only_the_all_identical_boundary(self):
        def observations_for(groups):
            return [
                {
                    "observationId": f"observation.{condition}.{index}",
                    "conditionId": condition,
                    "value": value,
                    "experimentalUnitId": f"unit.{condition}.{index}",
                }
                for condition, values in zip(
                    ("condition.control", "condition.treatment"), groups, strict=True
                )
                for index, value in enumerate(values)
            ]

        with self.assertRaisesRegex(ValueError, "every analyzed value is identical"):
            run_request(
                request(
                    "D01",
                    "mann_whitney",
                    observations_for(([2, 2, 2], [2, 2, 2])),
                )
            )

        for groups in (
            ([1, 1, 1, 1, 1], [3, 3, 3, 3, 3]),
            ([1, 1, 1, 1, 1], [1, 2, 3, 4, 5]),
        ):
            result = run_request(
                request("D01", "mann_whitney", observations_for(groups))
            )
            self.assertEqual(result["status"], "ok")
            self.assertTrue(math.isfinite(result["tests"][0]["pValue"]))

    def test_wilcoxon_signed_rank_fixture(self):
        observations = []
        for index, (control, treatment) in enumerate(
            ((10, 12), (13, 15), (9, 14), (15, 18), (11, 13))
        ):
            for condition, value in (
                ("condition.control", control),
                ("condition.treatment", treatment),
            ):
                observations.append(
                    {
                        "observationId": f"observation.{condition}.{index}",
                        "conditionId": condition,
                        "value": value,
                        "experimentalUnitId": f"unit.{index}",
                        "pairId": f"pair.{index}",
                    }
                )
        result = run_request(request("D02", "wilcoxon_signed_rank", observations))
        self.assertEqual(result["tests"][0]["name"], "wilcoxon_signed_rank_test")
        self.assertAlmostEqual(result["estimates"][0]["value"], -2.0, places=12)
        self.assertAlmostEqual(result["tests"][0]["statistic"], 0.0, places=12)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.0625, places=12)

    def test_incomplete_pair_is_rejected(self):
        observations = [
            {
                "observationId": "observation.a",
                "conditionId": "condition.control",
                "value": 1,
                "experimentalUnitId": "unit.1",
                "pairId": "pair.1",
            },
            {
                "observationId": "observation.b",
                "conditionId": "condition.treatment",
                "value": 2,
                "experimentalUnitId": "unit.2",
                "pairId": "pair.2",
            },
        ]
        with self.assertRaisesRegex(ValueError, "both conditions"):
            run_request(request("D02", "paired_t", observations))


if __name__ == "__main__":
    unittest.main()
