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
    def paired_equivalence_request(self):
        differences = [0.10, -0.05, 0.05, 0.00, 0.08, -0.02]
        observations = []
        for index, difference in enumerate(differences):
            pair_id = f"pair.{index + 1}"
            observations.extend(
                [
                    {
                        "observationId": f"{pair_id}.first",
                        "conditionId": "condition.first",
                        "value": 1.0,
                        "experimentalUnitId": pair_id,
                        "pairId": pair_id,
                    },
                    {
                        "observationId": f"{pair_id}.second",
                        "conditionId": "condition.second",
                        "value": 1.0 + difference,
                        "experimentalUnitId": pair_id,
                        "pairId": pair_id,
                    },
                ]
            )
        return {
            "protocolVersion": "0.16.0",
            "requestId": "request.paired-equivalence",
            "projectId": "project.paired-equivalence",
            "analysisId": "analysis.paired-equivalence",
            "templateId": "D02",
            "templateVersion": "0.2.0",
            "method": "paired_tost",
            "comparisonId": "first:second",
            "contrastConditionIds": ["condition.first", "condition.second"],
            "equivalencePlan": {
                "schemaVersion": "0.1.0",
                "margin": {
                    "scale": "raw_difference",
                    "lowerBound": -0.20,
                    "upperBound": 0.20,
                    "unit": "AU",
                    "declaredAsPrespecified": True,
                },
                "alpha": 0.05,
                "claimMode": "single_primary_comparison",
                "primaryComparisonId": "first:second",
            },
            "observations": observations,
            "options": {
                "alternative": "two_sided",
                "confidenceLevel": 0.9,
                "multiplicityMethod": None,
            },
        }

    def test_paired_tost_matches_frozen_second_minus_first_reference(self):
        result = run_request(self.paired_equivalence_request())
        comparison = result["equivalence"]["comparisons"][0]

        self.assertAlmostEqual(comparison["estimate"], 0.02666666666666667, places=14)
        self.assertAlmostEqual(comparison["standardError"], 0.024175285819291664, places=14)
        self.assertAlmostEqual(comparison["lowerConfidenceBound"], -0.022047703698357905, places=14)
        self.assertAlmostEqual(comparison["upperConfidenceBound"], 0.07538103703169124, places=14)
        self.assertAlmostEqual(comparison["lowerOneSidedPValue"], 0.00011632342948540773, places=14)
        self.assertAlmostEqual(comparison["upperOneSidedPValue"], 0.00041040541050611746, places=14)
        self.assertEqual(comparison["conclusion"], "equivalence_supported")
        self.assertEqual(
            comparison["analysisSet"],
            {"completePairCount": 6, "excludedIncompletePairIds": []},
        )

    def test_paired_tost_excludes_and_reports_each_incomplete_pair(self):
        paired_request = self.paired_equivalence_request()
        paired_request["observations"].extend(
            [
                {
                    "observationId": "pair.incomplete-first.first",
                    "conditionId": "condition.first",
                    "value": 1.2,
                    "experimentalUnitId": "pair.incomplete-first",
                    "pairId": "pair.incomplete-first",
                },
                {
                    "observationId": "pair.incomplete-second.second",
                    "conditionId": "condition.second",
                    "value": 1.2,
                    "experimentalUnitId": "pair.incomplete-second",
                    "pairId": "pair.incomplete-second",
                },
            ]
        )

        result = run_request(paired_request)
        analysis_set = result["equivalence"]["comparisons"][0]["analysisSet"]
        self.assertEqual(analysis_set["completePairCount"], 6)
        self.assertEqual(
            analysis_set["excludedIncompletePairIds"],
            ["pair.incomplete-first", "pair.incomplete-second"],
        )
        diagnostic = next(
            item for item in result["diagnostics"]
            if item["code"] == "paired_tost_incomplete_pairs_excluded"
        )
        self.assertIn("pair.incomplete-first", diagnostic["message"])
        self.assertIn("pair.incomplete-second", diagnostic["message"])

    def test_paired_tost_reversal_negates_estimate_with_transformed_bounds(self):
        forward = self.paired_equivalence_request()
        forward["equivalencePlan"]["margin"]["lowerBound"] = -0.15
        forward["equivalencePlan"]["margin"]["upperBound"] = 0.20
        reverse = self.paired_equivalence_request()
        reverse["contrastConditionIds"] = ["condition.second", "condition.first"]
        reverse["comparisonId"] = "second:first"
        reverse["equivalencePlan"]["primaryComparisonId"] = "second:first"
        reverse["equivalencePlan"]["margin"]["lowerBound"] = -0.20
        reverse["equivalencePlan"]["margin"]["upperBound"] = 0.15

        forward_comparison = run_request(forward)["equivalence"]["comparisons"][0]
        reverse_comparison = run_request(reverse)["equivalence"]["comparisons"][0]
        self.assertAlmostEqual(reverse_comparison["estimate"], -forward_comparison["estimate"], places=14)
        self.assertAlmostEqual(
            reverse_comparison["lowerConfidenceBound"],
            -forward_comparison["upperConfidenceBound"],
            places=14,
        )
        self.assertAlmostEqual(
            reverse_comparison["tostPValue"], forward_comparison["tostPValue"], places=14
        )

    def test_paired_tost_is_invariant_to_observation_order(self):
        ordered = self.paired_equivalence_request()
        shuffled = self.paired_equivalence_request()
        shuffled["observations"] = list(reversed(shuffled["observations"]))
        ordered_comparison = run_request(ordered)["equivalence"]["comparisons"][0]
        shuffled_comparison = run_request(shuffled)["equivalence"]["comparisons"][0]
        self.assertEqual(shuffled_comparison, ordered_comparison)

    def test_paired_tost_rejects_duplicate_pair_condition_and_zero_variance(self):
        duplicate = self.paired_equivalence_request()
        duplicate["observations"].append(dict(duplicate["observations"][0]))
        duplicate["observations"][-1]["observationId"] = "duplicate"
        with self.assertRaisesRegex(ValueError, "duplicate observations"):
            run_request(duplicate)

        zero_variance = self.paired_equivalence_request()
        for observation in zero_variance["observations"]:
            observation["value"] = 1.0
        with self.assertRaisesRegex(ValueError, "zero variance"):
            run_request(zero_variance)

        missing_pair_id = self.paired_equivalence_request()
        del missing_pair_id["observations"][0]["pairId"]
        with self.assertRaisesRegex(ValueError, "stable pairId"):
            run_request(missing_pair_id)

        too_few = self.paired_equivalence_request()
        too_few["observations"] = too_few["observations"][:2]
        with self.assertRaisesRegex(ValueError, "at least two complete pairs"):
            run_request(too_few)

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
