from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.import_literature_benchmark import DEFAULT_SOURCE, convert


class LiteratureBenchmarkImportTests(unittest.TestCase):
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
            serialized = json.dumps(track_b).lower()
            for forbidden in (
                "scope_expectation", "paperreference", "paper_reported", "gold", "recommended",
                "acceptable_graph", "acceptable_statistical", "preferred_app_route",
            ):
                self.assertNotIn(forbidden, serialized)
            track_a = json.loads((first / "cases/JCB003/experimenter_track_a.json").read_text())
            self.assertIn("paperReference", track_a)
            self.assertNotIn("goldMetadata", track_a)


if __name__ == "__main__":
    unittest.main()
