from __future__ import annotations

import hashlib
import json
from pathlib import Path
import unittest


ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"benchmark/literature_v2_1/context_rich_graph_expansion_2026-08-25"


def load(path: Path): return json.loads(path.read_text(encoding="utf-8"))


class ContextRichGraphExpansionTests(unittest.TestCase):
    def test_fixed_non_pool_d_boundary_and_family_count(self):
        manifest=load(BASE/"expansion_manifest.json")
        self.assertEqual(manifest["caseCount"],35)
        self.assertEqual(len(set(manifest["caseIds"])),35)
        self.assertFalse(manifest["poolDOpened"])
        self.assertFalse(manifest["workbookOpened"])
        source=(ROOT/"scripts/expand_context_rich_graph_subset.py").read_text(encoding="utf-8")
        self.assertNotIn("rglob(",source); self.assertNotIn("iterdir(",source)

    def test_artifacts_roundtrip_and_hashes(self):
        for item in load(BASE/"expansion_manifest.json")["cases"]:
            run=BASE/item["runRoot"]
            for name in ("final_graph.svg","final_graph.png","project_state.json","graph_state.json","statistics.json","methods.txt","support_classification.json","run.json"):
                self.assertTrue((run/name).is_file(),f"{item['caseId']}/{name}")
            project=load(run/"project_state.json")
            self.assertEqual(json.loads(json.dumps(project)),project)
            self.assertFalse(project["provenance"]["poolDOpened"])
            self.assertEqual(load(run/"run.json")["finalGraphSha256"],hashlib.sha256((run/"final_graph.svg").read_bytes()).hexdigest())

    def test_methodology_corrections_and_safe_unsupported(self):
        audit=load(BASE/"family_batch_audit.json")
        self.assertEqual(audit["verdict"],"READY_WITH_BOUNDED_EXCEPTIONS")
        corrections={x["caseId"] for x in audit["correctedHistoricalFamilies"]}
        self.assertEqual(corrections,{"LSA127","LSA233","LSA257"})
        lsa108=load(BASE/"runs/LSA108_context_rich_v2/support_classification.json")
        self.assertEqual(lsa108["classification"],"CONTEXT_RICH_READY_SAFE_UNSUPPORTED")
        lsa126=load(BASE/"runs/LSA126_context_rich_v2/statistics.json")
        self.assertIn("SAFE_UNSUPPORTED_FOR_ALPHA",lsa126["reason"])


if __name__ == "__main__": unittest.main()
