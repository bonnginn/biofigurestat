from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from verify_benchmark_runs import REQUIRED_ARTIFACTS, VerificationError, verify_run_directory


class BenchmarkRunVerifierTests(unittest.TestCase):
    def make_complete_run(self, root: Path) -> Path:
        path = root / "pilot_independent_2group" / "track_A" / "run_001"
        path.mkdir(parents=True)
        events = [
            {"sequence": 1, "type": "benchmark_run_started"},
            {"sequence": 2, "type": "benchmark_pilot_data_loaded"},
            {"sequence": 3, "type": "statistics_executed"},
            {"sequence": 4, "type": "default_graph_captured"},
            {"sequence": 5, "type": "graph_configuration_changed"},
            {"sequence": 6, "type": "benchmark_run_finalized"},
        ]
        run = {
            "caseId": "pilot_independent_2group",
            "track": "track_A",
            "runId": "run_001",
            "artifactCompleteness": "complete",
            "defaultGraphCaptured": True,
            "supportStatus": "direct",
            "appVersion": "0.1.0",
            "benchmarkVersion": "LSA50_v1_1",
            "engineVersion": "0.7.0",
            "sourceRevision": "0123456789ab",
            "interactionCount": len(events),
            "graphEditCount": 1,
        }
        values = {
            "run.json": json.dumps(run),
            "statistics.json": json.dumps({"state": "current", "result": {"status": "ok"}}),
            "graph_state.json": "{}",
            "interaction_log.json": json.dumps(events),
            "methods.txt": "Welch test; engine 0.7.0",
            "default_graph.svg": "<svg></svg>",
            "final_graph.svg": "<svg></svg>",
        }
        for name, content in values.items():
            (path / name).write_text(content, encoding="utf-8")
        for name in ("default_graph.png", "final_graph.png"):
            (path / name).write_bytes(b"\x89PNG\r\n\x1a\nfixture")
        self.assertEqual({item.name for item in path.iterdir()}, REQUIRED_ARTIFACTS)
        return path

    def test_complete_run_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_literature_data_loaded_event_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = self.make_complete_run(root)
            literature_path = root / "JCB003" / "track_A" / "run_001"
            literature_path.parent.mkdir(parents=True)
            path.rename(literature_path)
            run_path = literature_path / "run.json"
            run = json.loads(run_path.read_text())
            run["caseId"] = "JCB003"
            run_path.write_text(json.dumps(run), encoding="utf-8")
            events_path = literature_path / "interaction_log.json"
            events = json.loads(events_path.read_text())
            events[1]["type"] = "literature_benchmark_data_loaded"
            events_path.write_text(json.dumps(events), encoding="utf-8")
            verify_run_directory(literature_path, "JCB003", "track_A", "run_001")

    def test_missing_artifact_and_inconsistent_count_fail(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            (path / "methods.txt").unlink()
            with self.assertRaisesRegex(VerificationError, "methods.txt"):
                verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            run_path = path / "run.json"
            run = json.loads(run_path.read_text())
            run["interactionCount"] = 99
            run_path.write_text(json.dumps(run))
            with self.assertRaisesRegex(VerificationError, "interactionCount"):
                verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_missing_source_revision_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            run_path = path / "run.json"
            run = json.loads(run_path.read_text())
            del run["sourceRevision"]
            run_path.write_text(json.dumps(run), encoding="utf-8")
            with self.assertRaisesRegex(VerificationError, "source revision"):
                verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_unexpected_artifact_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            (path / "debug.txt").write_text("not part of the artifact contract", encoding="utf-8")
            with self.assertRaisesRegex(VerificationError, "unexpected artifacts: debug.txt"):
                verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_visible_final_annotation_requires_a_distinct_default_graph(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            (path / "graph_state.json").write_text(
                json.dumps({"statisticsAnnotation": {"mode": "exact_p", "testIndex": 0}}),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(VerificationError, "visible final statistics annotation"):
                verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")


if __name__ == "__main__":
    unittest.main()
