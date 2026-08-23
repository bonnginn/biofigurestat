from __future__ import annotations

import unittest

from preflight_literature_pilot import EXPECTED_ORDER, run_preflight


class LiteraturePilotPreflightTests(unittest.TestCase):
    def test_frozen_15_case_preflight_blocks_remaining_hierarchy_conflict(self) -> None:
        report = run_preflight()
        self.assertEqual(report["overall"], "BLOCKED")
        self.assertEqual(tuple(case["caseId"] for case in report["cases"]), EXPECTED_ORDER)
        self.assertEqual(report["caseCount"], 15)
        self.assertEqual(report["supportedEngineCaseCount"], 12)
        self.assertEqual(report["expectedUnsupportedCaseCount"], 2)
        self.assertEqual(report["hierarchyBlockedCaseCount"], 1)
        self.assertEqual(len(report["queueTransitionMatrix"]), 5)
        blocked = [case for case in report["cases"] if case["status"] == "PREFLIGHT_BLOCKED_HIERARCHY"]
        self.assertEqual([case["caseId"] for case in blocked], ["JCB023"])
        jcb003 = next(case for case in report["cases"] if case["caseId"] == "JCB003")
        self.assertEqual(jcb003["loaderRequiredBiologicalN"], 3)
        self.assertEqual(jcb003["hierarchyStatus"], "HIERARCHY_PASS")


if __name__ == "__main__":
    unittest.main()
