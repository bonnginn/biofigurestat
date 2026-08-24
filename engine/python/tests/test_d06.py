from __future__ import annotations

import unittest

from lsaa_engine.d06 import run_mixed_anova


def request() -> dict:
    values = {
        "A1": [1.0, 2.0, 3.0],
        "A2": [2.0, 2.8, 4.2],
        "A3": [1.5, 2.7, 3.4],
        "B1": [1.0, 2.4, 4.1],
        "B2": [2.0, 3.6, 4.8],
        "B3": [1.4, 3.1, 4.7],
    }
    observations = []
    for unit_id, unit_values in values.items():
        condition_id = unit_id[0]
        for index, value in enumerate(unit_values):
            observations.append(
                {
                    "observationId": f"obs.{unit_id}.{index + 1}",
                    "conditionId": condition_id,
                    "value": value,
                    "experimentalUnitId": unit_id,
                    "pairId": unit_id,
                    "timePointId": f"T{index + 1}",
                }
            )
    return {
        "protocolVersion": "0.6.0",
        "requestId": "request.d06",
        "projectId": "project.d06",
        "analysisId": "analysis.d06",
        "templateId": "D06",
        "templateVersion": "0.1.0",
        "method": "mixed_anova",
        "conditionIds": ["A", "B"],
        "timePoints": [
            {"timePointId": "T1", "value": 0},
            {"timePointId": "T2", "value": 24},
            {"timePointId": "T3", "value": 48},
        ],
        "observations": observations,
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": None,
        },
    }


class D06Tests(unittest.TestCase):
    def test_balanced_mixed_anova_preserves_error_strata(self) -> None:
        result = run_mixed_anova(request())
        self.assertEqual(result["protocolVersion"], "0.6.0")
        self.assertEqual(
            [test["name"] for test in result["tests"]],
            [
                "condition_by_time_interaction",
                "condition_between_units",
                "time_within_units",
            ],
        )
        self.assertEqual(result["tests"][0]["degreesOfFreedom"], [2.0, 8.0])
        self.assertEqual(result["tests"][1]["degreesOfFreedom"], [1.0, 4.0])
        self.assertEqual(result["tests"][2]["degreesOfFreedom"], [2.0, 8.0])
        self.assertEqual(len(result["estimates"]), 6)
        self.assertTrue(
            any(item["code"] == "stable_unit_identity_preserved" for item in result["diagnostics"])
        )

    def test_refuses_incomplete_repeated_units(self) -> None:
        broken = request()
        broken["observations"] = broken["observations"][:-1]
        with self.assertRaisesRegex(ValueError, "complete repeated measurements"):
            run_mixed_anova(broken)

    def test_emits_generic_factor_provenance_when_metadata_is_explicit(self) -> None:
        explicit = request()
        explicit["withinFactor"] = {
            "role": "numeric_covariate",
            "title": "Radius",
            "unit": "µm",
        }
        result = run_mixed_anova(explicit)
        self.assertEqual(
            [test["name"] for test in result["tests"]],
            [
                "condition_by_within_factor_interaction",
                "condition_main_effect",
                "within_factor_main_effect",
            ],
        )
        self.assertEqual(result["factorMetadata"]["withinFactor"]["title"], "Radius")
        self.assertEqual(result["factorMetadata"]["legacyEffectAliases"], {})
        provenance = str(result["factorMetadata"]) + str(result["diagnostics"])
        self.assertIn("Radius", provenance)
        self.assertNotIn("time", provenance.lower())

    def test_refuses_stable_unit_crossing_conditions(self) -> None:
        broken = request()
        broken["observations"][-1]["pairId"] = "A1"
        broken["observations"][-1]["experimentalUnitId"] = "A1"
        with self.assertRaisesRegex(ValueError, "cannot cross independent conditions"):
            run_mixed_anova(broken)

    def test_refuses_conflicting_unit_identity_fields(self) -> None:
        broken = request()
        broken["observations"][0]["experimentalUnitId"] = "different-unit"
        with self.assertRaisesRegex(ValueError, "same stable unit"):
            run_mixed_anova(broken)


if __name__ == "__main__":
    unittest.main()
