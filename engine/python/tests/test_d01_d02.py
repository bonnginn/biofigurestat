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
    def test_welch_tost_equivalent_fixture(self):
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
        equivalence_request = {
            "protocolVersion": "0.15.0",
            "requestId": "request.equivalence",
            "projectId": "project.equivalence",
            "analysisId": "analysis.equivalence",
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

        result = run_request(equivalence_request)

        comparison = result["equivalence"]["comparisons"][0]
        self.assertEqual(comparison["conclusion"], "equivalence_supported")
        self.assertAlmostEqual(comparison["estimate"], -1.1, places=12)
        self.assertAlmostEqual(comparison["standardError"], 0.2614064523559687, places=12)
        self.assertAlmostEqual(comparison["lowerConfidenceBound"], -1.5953141784852043, places=12)
        self.assertAlmostEqual(comparison["upperConfidenceBound"], -0.6046858215147959, places=12)
        self.assertAlmostEqual(comparison["lowerOneSidedPValue"], 0.005403898142320505, places=12)
        self.assertAlmostEqual(comparison["upperOneSidedPValue"], 0.0008086289057122471, places=12)
        self.assertAlmostEqual(comparison["tostPValue"], 0.005403898142320505, places=12)

    def test_welch_tost_reports_inconclusive_from_interval_overlap(self):
        observations = []
        for condition, values in (
            ("condition.control", [1.0, 2.0, 3.0]),
            ("condition.treatment", [1.0, 2.0, 3.0]),
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
        equivalence_request = {
            "protocolVersion": "0.15.0",
            "requestId": "request.inconclusive",
            "projectId": "project.equivalence",
            "analysisId": "analysis.inconclusive",
            "templateId": "D01",
            "templateVersion": "0.2.0",
            "method": "welch_tost",
            "comparisonId": "control:treatment",
            "contrastConditionIds": ["condition.control", "condition.treatment"],
            "equivalencePlan": {
                "schemaVersion": "0.1.0",
                "margin": {
                    "scale": "raw_difference",
                    "lowerBound": -0.5,
                    "upperBound": 0.5,
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
        result = run_request(equivalence_request)
        self.assertEqual(
            result["equivalence"]["comparisons"][0]["conclusion"],
            "inconclusive",
        )
        self.assertTrue(
            any(
                warning["code"] == "equivalence_interval_crosses_margin"
                for warning in result["warnings"]
            )
        )

    def test_welch_tost_rejects_pair_or_block_metadata(self):
        observations = [
            {"observationId": "a1", "conditionId": "a", "value": 1, "experimentalUnitId": "ua1", "blockId": "run.1"},
            {"observationId": "a2", "conditionId": "a", "value": 2, "experimentalUnitId": "ua2", "blockId": "run.2"},
            {"observationId": "b1", "conditionId": "b", "value": 1, "experimentalUnitId": "ub1", "blockId": "run.1"},
            {"observationId": "b2", "conditionId": "b", "value": 2, "experimentalUnitId": "ub2", "blockId": "run.2"},
        ]
        blocked_request = {
            "protocolVersion": "0.15.0",
            "requestId": "request.blocked",
            "projectId": "project.equivalence",
            "analysisId": "analysis.blocked",
            "templateId": "D01",
            "templateVersion": "0.2.0",
            "method": "welch_tost",
            "comparisonId": "a:b",
            "contrastConditionIds": ["a", "b"],
            "equivalencePlan": {
                "schemaVersion": "0.1.0",
                "margin": {"scale": "raw_difference", "lowerBound": -1, "upperBound": 1, "unit": "AU", "declaredAsPrespecified": True},
                "alpha": 0.05,
                "claimMode": "single_primary_comparison",
                "primaryComparisonId": "a:b",
            },
            "observations": observations,
            "options": {"alternative": "two_sided", "confidenceLevel": 0.9, "multiplicityMethod": None},
        }
        with self.assertRaisesRegex(ValueError, "independent units only"):
            run_request(blocked_request)

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
