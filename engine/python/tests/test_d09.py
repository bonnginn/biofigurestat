from __future__ import annotations

import unittest

from lsaa_engine.d01_d02 import run_request


def d09_request(method: str = "pearson") -> dict:
    x = [1.0, 2.0, 3.0, 4.0, 5.0]
    y = [1.2, 1.9, 3.4, 3.7, 5.1]
    observations = []
    for index, (x_value, y_value) in enumerate(zip(x, y, strict=True), start=1):
        for condition_id, value in (("condition.x", x_value), ("condition.y", y_value)):
            observations.append(
                {
                    "observationId": f"observation.{index}.{condition_id}",
                    "conditionId": condition_id,
                    "value": value,
                    "experimentalUnitId": f"sample.{index}",
                    "pairId": f"sample.{index}",
                }
            )
    return {
        "protocolVersion": "0.5.0",
        "requestId": f"request.d09.{method}",
        "projectId": "project.d09",
        "analysisId": "analysis.d09",
        "templateId": "D09",
        "templateVersion": "0.1.0",
        "method": method,
        "variableConditionIds": ["condition.x", "condition.y"],
        "observations": observations,
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": None,
        },
    }


class D09EngineTests(unittest.TestCase):
    def test_pearson_correlation_and_interval(self) -> None:
        result = run_request(d09_request("pearson"))
        self.assertEqual(result["protocolVersion"], "0.5.0")
        self.assertAlmostEqual(result["estimates"][0]["value"], 0.985354, places=5)
        self.assertIsNotNone(result["estimates"][0]["confidenceInterval"])
        self.assertLess(result["tests"][0]["pValue"], 0.01)

    def test_spearman_correlation(self) -> None:
        result = run_request(d09_request("spearman"))
        self.assertAlmostEqual(result["estimates"][0]["value"], 1.0)
        self.assertIsNone(result["estimates"][0]["confidenceInterval"])
        self.assertTrue(any(warning["code"] == "spearman_ci_not_reported" for warning in result["warnings"]))

    def test_incomplete_or_duplicate_pairs_are_rejected(self) -> None:
        incomplete = d09_request()
        incomplete["observations"].pop()
        with self.assertRaisesRegex(ValueError, "incomplete units"):
            run_request(incomplete)
        duplicate = d09_request()
        duplicate["observations"].append(dict(duplicate["observations"][0], observationId="duplicate"))
        with self.assertRaisesRegex(ValueError, "only one value"):
            run_request(duplicate)


if __name__ == "__main__":
    unittest.main()
