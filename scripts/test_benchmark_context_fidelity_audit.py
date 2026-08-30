from __future__ import annotations

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "benchmark/literature_v2_1/context_fidelity_2026-08-25"
REVIEWS = ROOT / "benchmark/literature_v2_1/reviews"
REVIEW_FILES = ["round_1.json", "round_2.json", "round_3.json", "pool_c_validation.json"]


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class ContextFidelityAuditTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.allowed = {
            item["caseId"]
            for review_file in REVIEW_FILES
            for item in load(REVIEWS / review_file).get("cases", [])
        }

    def test_sample_and_summary_contract(self) -> None:
        payload = load(OUTPUT / "fidelity_audit.json")
        summary = payload["summary"]
        cases = payload["cases"]
        self.assertEqual(len(cases), 50)
        self.assertEqual(len({item["caseId"] for item in cases}), 50)
        self.assertTrue({item["caseId"] for item in cases}.issubset(self.allowed))
        self.assertEqual(sum(summary["classificationCounts"].values()), 50)
        self.assertEqual(summary["classificationCounts"]["HIGH_FIDELITY"], 0)
        self.assertFalse(summary["scope"]["poolDDataUsedForAudit"])
        self.assertTrue(summary["scope"]["poolDOpened"])
        self.assertFalse(summary["scope"]["workbookOpened"])
        self.assertFalse(summary["scope"]["full495Rerun"])

    def test_graph_subset_and_tier_map_contract(self) -> None:
        subset = load(OUTPUT / "graph_capability_subset.json")
        cases = subset["cases"]
        self.assertEqual(subset["candidateCount"], 35)
        self.assertEqual(subset["certifiedReadyCount"], 0)
        self.assertEqual(len(cases), 35)
        self.assertEqual(len({item["caseId"] for item in cases}), 35)
        self.assertTrue({item["caseId"] for item in cases}.issubset(self.allowed))
        tier_map = load(OUTPUT / "usage_tier_map.json")
        self.assertEqual(tier_map["auditedCaseCount"], 184)
        self.assertTrue({item["caseId"] for item in tier_map["cases"]}.issubset(self.allowed))

    def test_human_context_and_convergence_contract(self) -> None:
        human = load(OUTPUT / "needs_human_context.json")
        self.assertEqual(human["count"], 2)
        self.assertEqual({item["caseId"] for item in human["cases"]}, {"LSA156", "LSA390"})
        convergence = load(OUTPUT / "synthetic_template_convergence.json")
        self.assertEqual(convergence["caseCount"], 184)
        self.assertEqual(sum(convergence["expectedDecisionDistribution"].values()), 184)
        self.assertTrue((OUTPUT / "PROTOCOL_INCIDENT.md").is_file())


if __name__ == "__main__":
    unittest.main()
