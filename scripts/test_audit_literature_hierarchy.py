from __future__ import annotations

import copy
import json
import unittest

from audit_literature_hierarchy import CONFLICT, PASS, RUNTIME, audit_all, audit_payload


def load(case_id: str) -> dict:
    return json.loads((RUNTIME / case_id / "integrator.json").read_text(encoding="utf-8"))


class LiteratureHierarchyAuditTests(unittest.TestCase):
    def test_jcb003_uses_three_session_parents(self) -> None:
        result = audit_payload(load("JCB003"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["hierarchyPath"], "parent_unit_id")
        self.assertEqual(result["loaderRequiredBiologicalN"], 3)

    def test_another_nested_observation_does_not_inflate_n(self) -> None:
        payload = load("JCB003")
        row = copy.deepcopy(payload["syntheticData"][0])
        row["unit_id"] += "-extra"
        payload["syntheticData"].append(row)
        self.assertEqual(audit_payload(payload)["loaderRequiredBiologicalN"], 3)

    def test_missing_nested_parent_fails(self) -> None:
        payload = load("JCB003")
        payload["syntheticData"][0]["parent_unit_id"] = None
        self.assertEqual(audit_payload(payload)["status"], CONFLICT)

    def test_paired_identity_count(self) -> None:
        result = audit_payload(load("JCB002"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["hierarchyPath"], "unit_id_across_conditions")
        self.assertEqual(result["loaderRequiredBiologicalN"], 10)

    def test_longitudinal_time_does_not_inflate_n(self) -> None:
        result = audit_payload(load("JCB011"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["hierarchyPath"], "unit_id_across_time")
        self.assertEqual(result["loaderRequiredBiologicalN"], 8)

    def test_cross_sectional_units_are_not_shared_over_time(self) -> None:
        result = audit_payload(load("NC027"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["hierarchyPath"], "unit_id_per_condition_time")
        self.assertEqual(result["loaderRequiredBiologicalN"], 4)

    def test_flat_one_row_per_unit_remains_valid(self) -> None:
        result = audit_payload(load("JCB001"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["hierarchyPath"], "unit_id")
        self.assertEqual(result["loaderRequiredBiologicalN"], 5)

    def test_full_audit_has_stable_review_set(self) -> None:
        report = audit_all()
        non_pass = {
            case["caseId"]: case["status"]
            for case in report["cases"]
            if case["status"] != PASS
        }
        self.assertEqual(
            non_pass,
            {
                "EL050": CONFLICT,
                "JCB008": CONFLICT,
                "JCB014": CONFLICT,
                "JCB019": "HIERARCHY_AMBIGUOUS",
                "JCB023": CONFLICT,
                "NC030": CONFLICT,
                "NC032": CONFLICT,
                "NC037": CONFLICT,
            },
        )


if __name__ == "__main__":
    unittest.main()
