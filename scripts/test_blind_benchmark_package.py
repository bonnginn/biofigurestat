from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from blind_benchmark_package import CASE_KEYS, PACKET_KEYS, ROW_KEYS, create_package, load_package


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

    def test_manifest_detects_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = create_package("JCB010", "fresh_blind_JCB010_002", root)
            (target / "case.json").write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                load_package(root, "JCB010", "fresh_blind_JCB010_002")

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


if __name__ == "__main__":
    unittest.main()
