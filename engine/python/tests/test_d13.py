from __future__ import annotations

import unittest

from lsaa_engine.d01_d02 import run_request


class D13Tests(unittest.TestCase):
    def test_categorical_states_reuse_validated_repeated_factor_math(self) -> None:
        states = [
            {"levelId": "baseline", "label": "Baseline", "order": 0},
            {"levelId": "challenge", "label": "Challenge", "order": 1},
        ]
        observations = []
        values = {
            "A": [[1.0, 2.0], [1.4, 2.8], [0.8, 2.2]],
            "B": [[1.1, 4.1], [1.5, 4.8], [0.9, 3.9]],
        }
        for condition, units in values.items():
            for unit_index, row in enumerate(units):
                unit_id = f"{condition}.{unit_index}"
                for state_index, value in enumerate(row):
                    observations.append({
                        "observationId": f"o.{unit_id}.{state_index}",
                        "conditionId": condition,
                        "experimentalUnitId": unit_id,
                        "pairId": unit_id,
                        "stateLevelId": states[state_index]["levelId"],
                        "value": value,
                    })
        request = {
            "protocolVersion": "0.10.0", "requestId": "request.d13", "projectId": "project.1",
            "analysisId": "analysis.d13", "templateId": "D13", "templateVersion": "0.1.0",
            "method": "mixed_anova", "conditionIds": ["A", "B"],
            "withinFactor": {"role": "categorical", "title": "Experimental phase", "unit": ""},
            "stateLevels": states, "observations": observations,
            "options": {"alternative": "two_sided", "confidenceLevel": 0.95, "multiplicityMethod": None},
        }
        result = run_request(request)
        self.assertEqual(result["protocolVersion"], "0.10.0")
        self.assertEqual(result["factorMetadata"]["withinFactor"], request["withinFactor"])
        self.assertEqual(len(result["tests"]), 3)
        self.assertNotIn("time", str(result["factorMetadata"]).lower())


if __name__ == "__main__":
    unittest.main()
