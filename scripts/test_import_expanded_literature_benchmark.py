from __future__ import annotations

import json
from pathlib import Path
import unittest

from import_expanded_literature_benchmark import BENCHMARK_VERSION, ROOT


RUNTIME = ROOT / "benchmark/literature_v2_1/runtime"
FORBIDDEN_KEYS = {
    "paperReference",
    "goldAnalysis",
    "goldMetadata",
    "paper_graph_family",
    "paper_statistical_method",
    "reference_p_value",
    "expected_decision",
    "acceptable_graph_families",
    "acceptable_statistical_families",
}


class ExpandedLiteratureImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = json.loads((RUNTIME / "manifest.json").read_text(encoding="utf-8"))
        cls.index = json.loads((RUNTIME / "public_index.json").read_text(encoding="utf-8"))

    def test_manifest_and_public_index_have_accepted_counts(self) -> None:
        self.assertEqual(self.manifest["benchmarkVersion"], BENCHMARK_VERSION)
        self.assertEqual(self.manifest["caseCount"], 495)
        self.assertEqual(self.manifest["scorableCaseCount"], 490)
        self.assertEqual(self.manifest["syntheticRowCount"], 28015)
        self.assertEqual(len(self.index["cases"]), 490)

    def test_dataset_exclusions_have_integrator_evidence_but_no_experimenter_payload(self) -> None:
        for case_id in self.manifest["excludedCases"]:
            case_dir = RUNTIME / "cases" / case_id
            integrator = json.loads((case_dir / "integrator.json").read_text(encoding="utf-8"))
            self.assertTrue(integrator["excludedFromAutomatedScoring"])
            self.assertFalse((case_dir / "experimenter_track_b.json").exists())
            self.assertFalse((case_dir / "experimenter_track_a.json").exists())

    def test_repaired_packet_and_exact_proportion_are_preserved(self) -> None:
        lsa052 = json.loads(
            (RUNTIME / "cases/LSA052/experimenter_track_b.json").read_text(encoding="utf-8")
        )
        lsa054 = json.loads(
            (RUNTIME / "cases/LSA054/experimenter_track_b.json").read_text(encoding="utf-8")
        )
        lsa346 = json.loads(
            (RUNTIME / "cases/LSA346/experimenter_track_b.json").read_text(encoding="utf-8")
        )
        self.assertEqual(lsa052["researcherPacket"]["independent_session_count"], 3)
        self.assertEqual(lsa054["researcherPacket"]["readouts"], "response_score")
        self.assertIn(0.2890625, [row["value"] for row in lsa346["syntheticData"]])

    def test_missingness_rows_are_preserved_not_coerced_to_zero(self) -> None:
        missing = []
        for item in self.index["cases"]:
            payload = json.loads(
                (RUNTIME / "cases" / item["caseId"] / "experimenter_track_b.json").read_text(
                    encoding="utf-8"
                )
            )
            missing.extend(
                row for row in payload["syntheticData"] if row["missingness_state"] == "missing"
            )
        self.assertEqual(len(missing), 8)
        self.assertTrue(all(row["value"] is None for row in missing))

    def test_every_track_b_payload_has_only_blind_top_level_layers(self) -> None:
        for item in self.index["cases"]:
            case_id = item["caseId"]
            payload = json.loads(
                (RUNTIME / "cases" / case_id / "experimenter_track_b.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(
                set(payload),
                {
                    "benchmarkVersion",
                    "sourceBenchmarkVersion",
                    "caseId",
                    "researcherPacket",
                    "syntheticData",
                },
            )
            self.assertFalse(FORBIDDEN_KEYS & set(payload["researcherPacket"]), case_id)
            self.assertTrue(all(not (FORBIDDEN_KEYS & set(row)) for row in payload["syntheticData"]))


if __name__ == "__main__":
    unittest.main()
