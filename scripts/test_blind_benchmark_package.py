from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from blind_benchmark_package import CASE_KEYS, PACKET_KEYS, ROW_KEYS, RUNTIME, create_package, load_package, validate_hidden_reference_absence


class BlindBenchmarkPackageTests(unittest.TestCase):
    def test_allow_list_manifest_and_gold_absence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = create_package("JCB010", "fresh_blind_JCB010_001", root)
            payload = load_package(root, "JCB010", "fresh_blind_JCB010_001")
            self.assertEqual(set(payload), CASE_KEYS)
            self.assertEqual(set(payload["researcherPacket"]), PACKET_KEYS)
            self.assertTrue(all(set(row) == ROW_KEYS for row in payload["syntheticData"]))
            serialized = (target / "case.json").read_text(encoding="utf-8").lower()
            for forbidden in ("paperreference", "gold", "paper_reported", "doi", "recommended_graph"):
                self.assertNotIn(forbidden, serialized)
            manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["packageType"], "LSAA_TRACK_B_BLIND")
            self.assertEqual(len(manifest["payloadSha256"]), 64)
            self.assertEqual(manifest["benchmarkVersion"], "LSA50_v1_1_runtime_hierarchy_2")
            self.assertEqual(len(manifest["runtimeCorrectionSha256"]), 64)

    def test_manifest_detects_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = create_package("JCB010", "fresh_blind_JCB010_002", root)
            (target / "case.json").write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                load_package(root, "JCB010", "fresh_blind_JCB010_002")

    def test_public_compositional_context_is_not_misclassified_as_hidden_reference(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = create_package("JCB015", "fresh_blind_JCB015_001", root)
            payload = load_package(root, "JCB015", "fresh_blind_JCB015_001")
            self.assertEqual(payload["caseId"], "JCB015")
            serialized = (target / "case.json").read_text(encoding="utf-8").lower()
            for forbidden in ("reference_method", "mann-whitney", "paper", "gold"):
                self.assertNotIn(forbidden, serialized)

    def test_fresh_identity_cannot_overwrite_and_repo_root_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            create_package("JCB010", "fresh_blind_JCB010_003", root)
            with self.assertRaisesRegex(ValueError, "fresh run ID"):
                create_package("JCB010", "fresh_blind_JCB010_003", root)
        from blind_benchmark_package import ROOT
        with self.assertRaisesRegex(ValueError, "outside"):
            create_package("JCB010", "fresh_blind_JCB010_004", ROOT / "unsafe")
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, "safe identifiers"):
                create_package("JCB010", "../escape", Path(temporary))

    def test_hierarchy_excluded_case_cannot_be_packaged(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, "excluded from automated packaging"):
                create_package("JCB019", "excluded_JCB019_001", Path(temporary))

    def test_hidden_paper_title_value_is_rejected_inside_allow_listed_packet(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            create_package("JCB010", "hidden_value_JCB010_001", root)
            payload = load_package(root, "JCB010", "hidden_value_JCB010_001")
            hidden = json.loads((RUNTIME / "JCB010" / "integrator.json").read_text(encoding="utf-8"))
            payload["researcherPacket"]["blind_experiment_summary"] += " " + hidden["paperReference"]["title"]
            with self.assertRaisesRegex(ValueError, "hidden reference value"):
                validate_hidden_reference_absence(payload, hidden, "JCB010")


if __name__ == "__main__":
    unittest.main()
