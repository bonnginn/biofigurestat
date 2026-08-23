from __future__ import annotations

import unittest

from preflight_literature_pilot import EXPECTED_ORDER, run_preflight


class LiteraturePilotPreflightTests(unittest.TestCase):
    def test_frozen_15_case_preflight_passes_hierarchy_gate(self) -> None:
        report = run_preflight()
        self.assertEqual(report["overall"], "PASS")
        self.assertEqual(tuple(case["caseId"] for case in report["cases"]), EXPECTED_ORDER)
        self.assertEqual(report["caseCount"], 15)
        self.assertEqual(report["supportedEngineCaseCount"], 12)
        self.assertEqual(report["expectedUnsupportedCaseCount"], 3)
        self.assertEqual(report["hierarchyBlockedCaseCount"], 0)
        self.assertEqual(len(report["queueTransitionMatrix"]), 5)
        blocked = [case for case in report["cases"] if case["status"] == "PREFLIGHT_BLOCKED_HIERARCHY"]
        self.assertEqual(blocked, [])
        jcb023 = next(case for case in report["cases"] if case["caseId"] == "JCB023")
        self.assertEqual(jcb023["hierarchyStatus"], "HIERARCHY_PASS")
        self.assertEqual(jcb023["loaderRequiredBiologicalN"], 6)
        jcb003 = next(case for case in report["cases"] if case["caseId"] == "JCB003")
        self.assertEqual(jcb003["loaderRequiredBiologicalN"], 3)
        self.assertEqual(jcb003["hierarchyStatus"], "HIERARCHY_PASS")


if __name__ == "__main__":
    unittest.main()
