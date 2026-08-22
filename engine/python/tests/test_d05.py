import unittest

from lsaa_engine.d01_d02 import run_request


LEVELS_A = ["a.control", "a.target"]
LEVELS_B = ["b.dark", "b.lit"]
CONDITIONS = [
    ("condition.control-dark", LEVELS_A[0], LEVELS_B[0]),
    ("condition.control-lit", LEVELS_A[0], LEVELS_B[1]),
    ("condition.target-dark", LEVELS_A[1], LEVELS_B[0]),
    ("condition.target-lit", LEVELS_A[1], LEVELS_B[1]),
]
VALUES = [
    [1.0, 1.4, 1.8],
    [2.0, 2.5, 3.0],
    [1.5, 2.1, 2.4],
    [5.0, 6.2, 7.1],
]


def d05_request(values=VALUES):
    observations = []
    for condition_index, (condition_id, _, _) in enumerate(CONDITIONS):
        for replicate, value in enumerate(values[condition_index]):
            observations.append(
                {
                    "observationId": f"observation.{condition_index}.{replicate}",
                    "conditionId": condition_id,
                    "value": value,
                    "experimentalUnitId": f"unit.{condition_index}.{replicate}",
                }
            )
    return {
        "protocolVersion": "0.4.0",
        "requestId": "request.d05",
        "projectId": "project.d05",
        "analysisId": "analysis.d05",
        "templateId": "D05",
        "templateVersion": "0.1.0",
        "method": "two_way_anova",
        "factors": [
            {"factorId": "factor.a", "levelIds": LEVELS_A},
            {"factorId": "factor.b", "levelIds": LEVELS_B},
        ],
        "conditions": [
            {"conditionId": condition_id, "factorALevelId": level_a, "factorBLevelId": level_b}
            for condition_id, level_a, level_b in CONDITIONS
        ],
        "primaryContrastConditionIds": [CONDITIONS[0][0], CONDITIONS[-1][0]],
        "observations": observations,
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": "holm_all_cell_pairs",
        },
    }


class D05EngineTests(unittest.TestCase):
    def test_two_way_anova_and_adjusted_cell_comparisons(self):
        result = run_request(d05_request())
        self.assertEqual(result["protocolVersion"], "0.4.0")
        self.assertEqual(result["status"], "ok")
        self.assertEqual([test["name"] for test in result["tests"][:3]], ["type3_interaction", "type3_factor_a", "type3_factor_b"])
        self.assertEqual(len(result["estimates"]), 6)
        self.assertEqual(len(result["tests"]), 9)
        self.assertTrue(all(test["adjustedPValue"] >= test["pValue"] for test in result["tests"][3:]))

    def test_missing_factorial_cell_is_rejected(self):
        request = d05_request()
        request["conditions"].pop()
        with self.assertRaisesRegex(ValueError, "exactly one condition"):
            run_request(request)

    def test_duplicate_biological_unit_is_rejected(self):
        request = d05_request()
        request["observations"][1]["experimentalUnitId"] = request["observations"][0]["experimentalUnitId"]
        with self.assertRaisesRegex(ValueError, "only one analyzed value"):
            run_request(request)

    def test_scientific_level_groups_are_not_pooled_as_replicates(self):
        request = d05_request()
        request["factors"][0]["levelGroups"] = [
            {"groupId": "group.control", "levelIds": [LEVELS_A[0]]},
            {"groupId": "group.target", "levelIds": [LEVELS_A[1]]},
        ]
        result = run_request(request)
        self.assertIn(
            "scientific_level_groups_not_replicates",
            [diagnostic["code"] for diagnostic in result["diagnostics"]],
        )


if __name__ == "__main__":
    unittest.main()
