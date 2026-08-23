from __future__ import annotations

import unittest

from preflight_literature_pilot import EXPECTED_ORDER, run_preflight


class LiteraturePilotPreflightTests(unittest.TestCase):
    def test_frozen_15_case_preflight_passes(self) -> None:
        report = run_preflight()
        self.assertEqual(report["overall"], "PASS")
        self.assertEqual(tuple(case["caseId"] for case in report["cases"]), EXPECTED_ORDER)
        self.assertEqual(report["caseCount"], 15)
        self.assertEqual(report["supportedEngineCaseCount"], 12)
        self.assertEqual(report["expectedUnsupportedCaseCount"], 3)
        self.assertEqual(len(report["queueTransitionMatrix"]), 5)


if __name__ == "__main__":
    unittest.main()
