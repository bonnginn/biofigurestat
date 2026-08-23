from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.import_literature_benchmark import DEFAULT_SOURCE, convert, install_generated_runtime


class LiteratureBenchmarkImportTests(unittest.TestCase):
    def test_runtime_install_replaces_files_without_deleting_live_tree(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            temporary = root / ".runtime.tmp"
            output = root / "runtime"
            temporary.mkdir()
            output.mkdir()
            (temporary / "manifest.json").write_text("new", encoding="utf-8")
            (output / "manifest.json").write_text("old", encoding="utf-8")
            install_generated_runtime(temporary, output)
            self.assertEqual((output / "manifest.json").read_text(encoding="utf-8"), "new")
            self.assertFalse(temporary.exists())

    def test_runtime_install_refuses_unexpected_stale_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            temporary = root / ".runtime.tmp"
            output = root / "runtime"
            temporary.mkdir()
            output.mkdir()
            (temporary / "manifest.json").write_text("new", encoding="utf-8")
            (output / "unexpected.json").write_text("preserve", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unexpected runtime files"):
                install_generated_runtime(temporary, output)
            self.assertEqual((output / "unexpected.json").read_text(), "preserve")

    def test_conversion_is_complete_deterministic_and_track_b_blind(self) -> None:
        with tempfile.TemporaryDirectory() as first_dir, tempfile.TemporaryDirectory() as second_dir:
            first = Path(first_dir) / "runtime"
            second = Path(second_dir) / "runtime"
            manifest = convert(DEFAULT_SOURCE, first)
            convert(DEFAULT_SOURCE, second)
            self.assertEqual(manifest["caseCount"], 50)
            self.assertEqual(manifest["syntheticRowCount"], 2691)
            first_files = sorted(path.relative_to(first) for path in first.rglob("*.json"))
            second_files = sorted(path.relative_to(second) for path in second.rglob("*.json"))
            self.assertEqual(first_files, second_files)
            for relative in first_files:
                self.assertEqual((first / relative).read_bytes(), (second / relative).read_bytes())

            track_b = json.loads((first / "cases/JCB003/experimenter_track_b.json").read_text())
            self.assertEqual(manifest["runtimeCorrectionVersion"], "LSA50_v1_1_runtime_hierarchy_1")
            self.assertEqual(manifest["correctedCases"], ["JCB003"])
            self.assertEqual(
                {row["parent_unit_id"] for row in track_b["syntheticData"]},
                {"Exp1", "Exp2", "Exp3"},
            )
            self.assertIn(
                "cell observations nested",
                track_b["researcherPacket"]["experimental_unit_description"],
            )
            serialized = json.dumps(track_b).lower()
            for forbidden in (
                "scope_expectation", "paperreference", "paper_reported", "gold", "recommended",
                "acceptable_graph", "acceptable_statistical", "preferred_app_route",
            ):
                self.assertNotIn(forbidden, serialized)
            track_a = json.loads((first / "cases/JCB003/experimenter_track_a.json").read_text())
            self.assertIn("paperReference", track_a)
            self.assertNotIn("goldMetadata", track_a)
            integrator = json.loads((first / "cases/JCB003/integrator.json").read_text())
            self.assertEqual(
                integrator["goldAnalysis"]["reference_method"],
                "Welch t test on experiment-session means",
            )
            self.assertAlmostEqual(
                integrator["goldAnalysis"]["reference_p_value"], 0.01370631241522072
            )


if __name__ == "__main__":
    unittest.main()
