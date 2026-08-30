from __future__ import annotations

import hashlib
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "benchmark/literature_v2_1/context_rich_graph_pilot_2026-08-25"
EXPECTED = {"LSA135", "LSA086", "LSA090", "LSA077", "LSA126", "LSA157", "LSA249", "LSA094", "LSA168", "LSA088", "LSA120", "LSA346"}


def load(path: Path): return json.loads(path.read_text(encoding="utf-8"))


class ContextRichPilotTests(unittest.TestCase):
    def test_allow_list_and_sealed_boundary(self):
        manifest=load(BASE/"pilot_manifest.json")
        self.assertEqual(set(manifest["caseIds"]),EXPECTED)
        self.assertFalse(manifest["poolDOpened"])
        source=(ROOT/"scripts/generate_context_rich_graph_pilot.py").read_text(encoding="utf-8")
        self.assertNotIn("runtime/cases",source)
        self.assertNotIn("iterdir(",source)
        self.assertNotIn("glob(",source)
        self.assertNotIn("rglob(",source)

    def test_complete_lineage_artifacts_and_roundtrip(self):
        for cid in EXPECTED:
            lineage=f"{cid}_context_rich_v2"; run=BASE/"runs"/lineage
            for name in ("default_graph.svg","default_graph.png","final_graph.svg","final_graph.png","statistics.json","methods.txt","graph_state.json","project_state.json","support_classification.json","run.json"):
                self.assertTrue((run/name).is_file(),f"{lineage}/{name}")
            project=load(run/"project_state.json")
            self.assertEqual(project["caseId"],lineage)
            self.assertEqual(json.loads(json.dumps(project)),project)
            recorded=load(run/"run.json")["finalGraphSha256"]
            self.assertEqual(recorded,hashlib.sha256((run/"final_graph.svg").read_bytes()).hexdigest())
            self.assertFalse(project["provenance"]["poolDOpened"])

    def test_pilot_stop_rule_and_authoritative_fits(self):
        audit=load(BASE/"pilot_method_audit.json")
        self.assertEqual(audit["verdict"],"READY_FOR_FAMILY_EXPANSION")
        self.assertTrue(audit["autonomousExpansionPerformed"])
        expansion=load(BASE/"autonomous_expansion_manifest.json")
        self.assertEqual(expansion["status"],"COMPLETED_BY_FAMILY_BATCH")
        self.assertEqual(load(BASE/"runs/LSA077_context_rich_v2/support_classification.json")["classification"],"READY_WITH_MINOR_SOURCE_UNCERTAINTY")
        self.assertEqual(load(BASE/"runs/LSA126_context_rich_v2/support_classification.json")["classification"],"CONTEXT_RICH_READY_SAFE_UNSUPPORTED")
        lsa086=load(BASE/"runs/LSA086_context_rich_v2/statistics.json")
        self.assertEqual(lsa086["results"][0]["result"]["nonlinearFit"]["modelId"],"one_phase_association")
        methods=(BASE/"runs/LSA086_context_rich_v2/methods.txt").read_text(encoding="utf-8")
        self.assertIn("saved local numerical-engine result",methods)


if __name__ == "__main__": unittest.main()
