import unittest

from lsaa_engine.d01_d02 import run_request


CONDITIONS = ["condition.before", "condition.middle", "condition.after"]
VALUES = [
    [1.0, 2.0, 5.0],
    [2.0, 4.0, 5.5],
    [4.0, 3.0, 7.0],
    [3.0, 6.0, 8.0],
]


def d04_request(values=VALUES):
    observations = []
    for pair_index, row in enumerate(values):
        for condition_index, value in enumerate(row):
            observations.append(
                {
                    "observationId": f"observation.{pair_index}.{condition_index}",
                    "conditionId": CONDITIONS[condition_index],
                    "value": value,
                    "experimentalUnitId": f"unit.{pair_index}",
                    "pairId": f"pair.{pair_index}",
                }
            )
    return {
        "protocolVersion": "0.3.0",
        "requestId": "request.d04",
        "projectId": "project.d04",
        "analysisId": "analysis.d04",
        "templateId": "D04",
        "templateVersion": "0.1.0",
        "method": "repeated_measures_anova",
        "conditionIds": CONDITIONS,
        "primaryContrastConditionIds": [CONDITIONS[0], CONDITIONS[-1]],
        "observations": observations,
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": "holm_paired_all_pairs",
        },
    }


class D04EngineTests(unittest.TestCase):
    def test_repeated_anova_and_holm_pairwise_fixture(self):
        result = run_request(d04_request())
        self.assertEqual(result["protocolVersion"], "0.3.0")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(len(result["estimates"]), 3)
        self.assertEqual(len(result["tests"]), 4)
        self.assertEqual(result["tests"][0]["name"], "one_way_repeated_measures_anova")
        self.assertTrue(all(test["adjustedPValue"] is not None for test in result["tests"][1:]))
        self.assertTrue(
            all(
                test["adjustedPValue"] >= test["pValue"]
                for test in result["tests"][1:]
            )
        )

    def test_incomplete_pair_is_rejected(self):
        request = d04_request()
        request["observations"].pop()
        with self.assertRaisesRegex(ValueError, "must contain all declared conditions"):
            run_request(request)

    def test_duplicate_pair_condition_is_rejected(self):
        request = d04_request()
        request["observations"].append(dict(request["observations"][0]))
        with self.assertRaisesRegex(ValueError, "exactly one analyzed value"):
            run_request(request)


if __name__ == "__main__":
    unittest.main()
