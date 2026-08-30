from __future__ import annotations

import copy
import unittest

from lsaa_engine.d07 import run_independent_factorial


def request() -> dict:
    observations = []
    values = {
        ("A", "T0"): [1.0, 1.2, 0.9],
        ("A", "T1"): [2.0, 2.2, 1.8],
        ("A", "T2"): [2.8, 3.0, 2.7],
        ("B", "T0"): [1.1, 1.0, 1.2],
        ("B", "T1"): [2.8, 3.0, 2.7],
        ("B", "T2"): [4.6, 4.8, 4.5],
    }
    for (condition_id, level_id), cell_values in values.items():
        for index, value in enumerate(cell_values, 1):
            observations.append(
                {
                    "observationId": f"obs.{condition_id}.{level_id}.{index}",
                    "conditionId": condition_id,
                    "withinFactorLevelId": level_id,
                    "value": value,
                    "experimentalUnitId": f"unit.{condition_id}.{level_id}.{index}",
                }
            )
    return {
        "protocolVersion": "0.7.0",
        "requestId": "request.d07",
        "projectId": "project.d07",
        "analysisId": "analysis.d07",
        "templateId": "D07",
        "templateVersion": "0.1.0",
        "method": "two_way_anova",
        "conditionIds": ["A", "B"],
        "withinFactor": {
            "role": "time",
            "title": "Time",
            "unit": "h",
            "levels": [
                {"levelId": "T0", "value": 0},
                {"levelId": "T1", "value": 24},
                {"levelId": "T2", "value": 48},
            ],
        },
        "observations": observations,
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": None,
        },
    }


class D07Tests(unittest.TestCase):
    def test_balanced_independent_factorial_reports_generic_effects(self) -> None:
        result = run_independent_factorial(request())
        self.assertEqual(result["protocolVersion"], "0.7.0")
        self.assertEqual(
            [test["name"] for test in result["tests"]],
            [
                "condition_by_within_factor_interaction",
                "condition_main_effect",
                "within_factor_main_effect",
            ],
        )
        self.assertEqual(result["tests"][0]["degreesOfFreedom"], [2.0, 12.0])
        self.assertEqual(result["factorMetadata"]["withinFactor"]["title"], "Time")
        self.assertTrue(
            any(
                item["code"] == "independent_unit_identity_verified"
                for item in result["diagnostics"]
            )
        )

    def test_refuses_reused_unit_across_cells(self) -> None:
        broken = copy.deepcopy(request())
        broken["observations"][1]["experimentalUnitId"] = broken["observations"][0][
            "experimentalUnitId"
        ]
        with self.assertRaisesRegex(ValueError, "unique independent biological-unit"):
            run_independent_factorial(broken)

    def test_refuses_unbalanced_cells(self) -> None:
        broken = copy.deepcopy(request())
        broken["observations"] = broken["observations"][:-1]
        with self.assertRaisesRegex(ValueError, "complete balanced cells"):
            run_independent_factorial(broken)


if __name__ == "__main__":
    unittest.main()
