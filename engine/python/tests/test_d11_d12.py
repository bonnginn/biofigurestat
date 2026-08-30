from __future__ import annotations

import unittest

from lsaa_engine.d01_d02 import run_request


def survival_request() -> dict:
    observations = []
    for group, rows in {
        "control": [(2, True), (3, True), (5, False), (7, True)],
        "treatment": [(4, False), (6, True), (8, False), (9, True)],
    }.items():
        for index, (time, event) in enumerate(rows, start=1):
            observations.append(
                {
                    "observationId": f"obs.{group}.{index}",
                    "conditionId": group,
                    "experimentalUnitId": f"unit.{group}.{index}",
                    "followUpTime": time,
                    "eventObserved": event,
                }
            )
    return {
        "protocolVersion": "0.8.0",
        "requestId": "request.d11",
        "projectId": "project.d11",
        "analysisId": "analysis.d11",
        "templateId": "D11",
        "templateVersion": "0.1.0",
        "method": "log_rank",
        "conditionIds": ["control", "treatment"],
        "observations": observations,
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": None,
        },
    }


def one_sample_request() -> dict:
    values = [8.0, 9.0, 10.0, 12.0, 11.0]
    return {
        "protocolVersion": "0.9.0",
        "requestId": "request.d12",
        "projectId": "project.d12",
        "analysisId": "analysis.d12",
        "templateId": "D12",
        "templateVersion": "0.1.0",
        "method": "one_sample_t",
        "conditionId": "cohort",
        "nullValue": 7.0,
        "observations": [
            {
                "observationId": f"obs.{index}",
                "conditionId": "cohort",
                "experimentalUnitId": f"patient.{index}",
                "value": value,
            }
            for index, value in enumerate(values, start=1)
        ],
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": None,
        },
    }


class SurvivalAndOneSampleTests(unittest.TestCase):
    def test_kaplan_meier_preserves_censoring_and_log_rank(self) -> None:
        result = run_request(survival_request())
        self.assertEqual(result["protocolVersion"], "0.8.0")
        self.assertEqual(result["tests"][0]["name"], "log_rank_test")
        self.assertAlmostEqual(result["tests"][0]["statistic"], 2.447908507, places=8)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.117681575, places=8)
        control, treatment = result["survival"]["groups"]
        self.assertEqual((control["n"], control["events"], control["censored"]), (4, 3, 1))
        self.assertEqual((treatment["n"], treatment["events"], treatment["censored"]), (4, 2, 2))
        self.assertEqual(control["censorTimes"], [5.0])
        self.assertAlmostEqual(control["curve"][-1]["survival"], 0.0)

    def test_survival_rejects_duplicate_units_and_invalid_status(self) -> None:
        duplicate = survival_request()
        duplicate["observations"][1]["experimentalUnitId"] = duplicate["observations"][0][
            "experimentalUnitId"
        ]
        with self.assertRaisesRegex(ValueError, "exactly once"):
            run_request(duplicate)
        invalid = survival_request()
        invalid["observations"][0]["eventObserved"] = 1
        with self.assertRaisesRegex(ValueError, "explicitly Event or Censored"):
            run_request(invalid)

    def test_one_sample_t_uses_explicit_reference(self) -> None:
        result = run_request(one_sample_request())
        self.assertEqual(result["protocolVersion"], "0.9.0")
        self.assertAlmostEqual(result["estimates"][0]["value"], 3.0)
        self.assertAlmostEqual(result["tests"][0]["statistic"], 4.242640687, places=8)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.013235599, places=8)
        self.assertEqual(result["tests"][0]["degreesOfFreedom"], [4.0])

    def test_one_sample_rejects_duplicate_units_and_zero_variance(self) -> None:
        duplicate = one_sample_request()
        duplicate["observations"][1]["experimentalUnitId"] = duplicate["observations"][0][
            "experimentalUnitId"
        ]
        with self.assertRaisesRegex(ValueError, "only one value"):
            run_request(duplicate)
        constant = one_sample_request()
        for observation in constant["observations"]:
            observation["value"] = 5.0
        with self.assertRaisesRegex(ValueError, "identical"):
            run_request(constant)


if __name__ == "__main__":
    unittest.main()
