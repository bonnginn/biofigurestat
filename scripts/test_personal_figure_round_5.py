from __future__ import annotations

import hashlib
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
ROUND_4_RUNTIME = ROOT / "benchmark/personal_figure_v1/runtime_round_4"
ROUND_5_RUNTIME = ROOT / "benchmark/personal_figure_v1/runtime_round_5"
ROUND_5_RUNS = ROOT / "benchmark/personal_figure_v1/runs_round_5"
CASE_IDS = ["PFR002", "PFR004", "PFR025", "PFR046", "PFR049", "PFR069"]


class PersonalFigureRound5ContractTest(unittest.TestCase):
    def payload(self, root: Path, case_id: str) -> dict:
        return json.loads(
            (root / "cases" / case_id / "experimenter_track_a.json").read_text(encoding="utf-8")
        )

    def test_round_5_preserves_approved_numeric_values(self) -> None:
        for case_id in CASE_IDS:
            round_4 = self.payload(ROUND_4_RUNTIME, case_id)["syntheticData"]
            round_5 = self.payload(ROUND_5_RUNTIME, case_id)["syntheticData"]
            self.assertEqual(
                [(row["condition"], row.get("time"), row["value"]) for row in round_4],
                [(row["condition"], row.get("time"), row["value"]) for row in round_5],
            )
            self.assertTrue(all("_R5_" in row["observation_id"] for row in round_5))

    def test_artifacts_are_complete_and_human_rating_is_empty(self) -> None:
        review = json.loads(
            (ROOT / "benchmark/personal_figure_v1/review/review_round_5.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(review["reviews"], {})
        for case_id in CASE_IDS:
            run_root = ROUND_5_RUNS / case_id
            for name in [
                "default_graph.svg",
                "default_graph.png",
                "final_graph.svg",
                "final_graph.png",
                "graph_state.json",
                "statistics.json",
                "methods.txt",
                "run.json",
            ]:
                self.assertGreater((run_root / name).stat().st_size, 0, f"{case_id}/{name}")
            run = json.loads((run_root / "run.json").read_text(encoding="utf-8"))
            self.assertEqual(run["artifactCompleteness"], "complete")
            self.assertFalse(run["humanRatingEntered"])
            self.assertEqual(
                run["finalPngSha256"], hashlib.sha256((run_root / "final_graph.png").read_bytes()).hexdigest()
            )

    def test_four_sets_and_round_5_acceptance_metadata_are_explicit(self) -> None:
        pfr002 = json.loads((ROUND_5_RUNS / "PFR002/graph_state.json").read_text(encoding="utf-8"))
        sets = pfr002["dataSets"]
        self.assertNotEqual(sets["displaySet"], sets["analysisSet"])
        self.assertEqual(len(sets["comparisonSet"]), 2)
        self.assertEqual(len(sets["annotationSet"]), 2)
        pfr049 = json.loads((ROUND_5_RUNS / "PFR049/graph_state.json").read_text(encoding="utf-8"))
        self.assertEqual(pfr049["appearance"]["boxWhiskerMode"], "tukey_1_5_iqr")
        pfr069 = json.loads((ROUND_5_RUNS / "PFR069/graph_state.json").read_text(encoding="utf-8"))
        self.assertEqual(pfr069["appearance"]["uncertaintyStyle"], "ribbon")
        self.assertTrue(pfr069["axes"]["showMinorTicks"])


if __name__ == "__main__":
    unittest.main()
