from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from scripts.import_personal_figure_benchmark import DEFAULT_MASTER, DEFAULT_TRACK_B, convert


class PersonalFigureBenchmarkImportTest(unittest.TestCase):
    def test_comparison_manifest_documents_method_changes(self) -> None:
        manifest_path = Path("benchmark/personal_figure_v1/comparison_manifest.json")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        required = {
            "paperGraph",
            "appGraph",
            "graphChangeReason",
            "paperStatistics",
            "appStatistics",
            "statisticsChangeReason",
        }

        self.assertEqual(len(manifest["cases"]), 6)
        for case in manifest["cases"]:
            self.assertTrue(required.issubset(case), case["caseId"])
            for field in required:
                self.assertTrue(case[field].strip(), f'{case["caseId"]}: {field}')

    def test_builds_separated_personal_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "runtime"
            manifest = convert(DEFAULT_MASTER, DEFAULT_TRACK_B, output)

            self.assertEqual(manifest["caseCount"], 69)
            self.assertEqual(manifest["rawRowCount"], 6810)
            track_b = json.loads(
                (output / "cases/PFR046/experimenter_track_b.json").read_text(encoding="utf-8")
            )
            self.assertNotIn("paperReference", track_b)
            self.assertEqual(len(track_b["syntheticData"]), 354)
            stable_units = {row["unit_id"] for row in track_b["syntheticData"]}
            self.assertLess(len(stable_units), len(track_b["syntheticData"]))

            track_a = json.loads(
                (output / "cases/PFR002/experimenter_track_a.json").read_text(encoding="utf-8")
            )
            self.assertEqual(track_a["paperReference"]["target_figure_or_panel"], "Fig. 1F")
            self.assertTrue(all(row["synthetic"] is True for row in track_a["syntheticData"]))

            cross_time = json.loads(
                (output / "cases/PFR004/experimenter_track_b.json").read_text(encoding="utf-8")
            )
            units_by_condition = {
                condition: {
                    row["unit_id"]
                    for row in cross_time["syntheticData"]
                    if row["condition"] == condition
                }
                for condition in {row["condition"] for row in cross_time["syntheticData"]}
            }
            first, second = units_by_condition.values()
            self.assertTrue(first.isdisjoint(second))

            times_by_unit: dict[str, set[float]] = {}
            for row in track_b["syntheticData"]:
                times_by_unit.setdefault(row["unit_id"], set()).add(row["time"])
            self.assertTrue(any(len(times) > 1 for times in times_by_unit.values()))


if __name__ == "__main__":
    unittest.main()
