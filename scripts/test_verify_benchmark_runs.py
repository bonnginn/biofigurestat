from __future__ import annotations

import json
import hashlib
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
            "outcome": "completed",
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

    def add_capture_provenance(
        self,
        path: Path,
        *,
        annotation: str = "hidden",
        rendered_edit: bool = False,
        analysis_change: str | None = None,
        mixed_edit: bool = False,
    ) -> None:
        default_svg = "<svg><text>default</text></svg>"
        final_svg = (
            "<svg><text>final p = 0.001</text></svg>"
            if annotation != "hidden" or rendered_edit
            else default_svg
        )
        default_png = b"\x89PNG\r\n\x1a\ndefault"
        final_png = (
            b"\x89PNG\r\n\x1a\nfinal"
            if annotation != "hidden" or rendered_edit
            else default_png
        )
        (path / "default_graph.svg").write_text(default_svg, encoding="utf-8")
        (path / "final_graph.svg").write_text(final_svg, encoding="utf-8")
        (path / "default_graph.png").write_bytes(default_png)
        (path / "final_graph.png").write_bytes(final_png)
        (path / "graph_state.json").write_text(
            json.dumps({"statisticsAnnotation": {"mode": annotation, "testIndex": 0}}),
            encoding="utf-8",
        )
        digest = lambda payload: hashlib.sha256(payload).hexdigest()
        default_analysis = digest(b"analysis-default")
        final_analysis = digest(b"analysis-final")
        events = [
            {
                "sequence": 1,
                "occurredAt": "2026-08-23T00:00:00.000Z",
                "type": "benchmark_run_started",
                "effect": "non_rendering_ui",
            },
            {
                "sequence": 2,
                "occurredAt": "2026-08-23T00:00:01.000Z",
                "type": "benchmark_pilot_data_loaded",
                "effect": "non_rendering_ui",
            },
            {
                "sequence": 3,
                "occurredAt": "2026-08-23T00:00:02.000Z",
                "type": "default_graph_capture_started",
                "effect": "non_rendering_ui",
            },
            {
                "sequence": 4,
                "occurredAt": "2026-08-23T00:00:03.000Z",
                "type": "default_graph_captured",
                "effect": "non_rendering_ui",
                "detail": {"analysisStateFingerprint": default_analysis},
            },
            {
                "sequence": 5,
                "occurredAt": "2026-08-23T00:00:04.000Z",
                "type": "statistics_executed",
                "effect": "analysis_only",
            },
        ]
        if analysis_change:
            events.append(
                {
                    "sequence": len(events) + 1,
                    "occurredAt": "2026-08-23T00:00:04.500Z",
                    "type": "analysis_configuration_changed",
                    "effect": "analysis_only",
                    "detail": {"change": analysis_change},
                }
            )
        if mixed_edit:
            events.append(
                {
                    "sequence": len(events) + 1,
                    "occurredAt": "2026-08-23T00:00:05.000Z",
                    "type": "graph_configuration_changed",
                    "effect": "both",
                }
            )
        elif rendered_edit or annotation != "hidden":
            events.append(
                {
                    "sequence": len(events) + 1,
                    "occurredAt": "2026-08-23T00:00:05.000Z",
                    "type": "graph_configuration_changed",
                    "effect": "rendered_graph",
                }
            )
        final_index = len(events) + 1
        events.extend(
            [
                {
                    "sequence": final_index,
                    "occurredAt": "2026-08-23T00:01:00.000Z",
                    "type": "final_graph_captured",
                    "effect": "non_rendering_ui",
                    "detail": {"analysisStateFingerprint": final_analysis},
                },
                {
                    "sequence": final_index + 1,
                    "occurredAt": "2026-08-23T00:01:01.000Z",
                    "type": "benchmark_run_finalized",
                    "effect": "non_rendering_ui",
                },
            ]
        )
        (path / "interaction_log.json").write_text(json.dumps(events), encoding="utf-8")
        run_path = path / "run.json"
        run = json.loads(run_path.read_text())
        run.update(
            {
                "captureProvenanceVersion": "1.1.0",
                "defaultCapturedAt": "2026-08-23T00:00:02.000Z",
                "defaultCapturedEventIndex": 3,
                "finalCapturedAt": "2026-08-23T00:01:00.000Z",
                "finalCapturedEventIndex": final_index,
                "defaultGraphStateFingerprint": digest(default_svg.encode()),
                "finalGraphStateFingerprint": digest(final_svg.encode()),
                "defaultAnalysisStateFingerprint": default_analysis,
                "finalAnalysisStateFingerprint": final_analysis,
                "defaultSvgSha256": digest(default_svg.encode()),
                "defaultPngSha256": digest(default_png),
                "finalSvgSha256": digest(final_svg.encode()),
                "finalPngSha256": digest(final_png),
                "interactionCount": len(events),
                "graphEditCount": sum(
                    event["type"] == "graph_configuration_changed" for event in events
                ),
                "renderedGraphEditCount": sum(
                    event["effect"] in {"rendered_graph", "both"} for event in events
                ),
                "analysisEditCount": sum(
                    event["effect"] in {"analysis_only", "both"} for event in events
                ),
            }
        )
        run_path.write_text(json.dumps(run), encoding="utf-8")

    def make_final_graph_identical(self, path: Path) -> None:
        (path / "final_graph.svg").write_bytes((path / "default_graph.svg").read_bytes())
        (path / "final_graph.png").write_bytes((path / "default_graph.png").read_bytes())
        run_path = path / "run.json"
        run = json.loads(run_path.read_text())
        run["finalGraphStateFingerprint"] = run["defaultGraphStateFingerprint"]
        run["finalSvgSha256"] = run["defaultSvgSha256"]
        run["finalPngSha256"] = run["defaultPngSha256"]
        run_path.write_text(json.dumps(run), encoding="utf-8")

    def make_final_analysis_identical(self, path: Path) -> None:
        run_path = path / "run.json"
        run = json.loads(run_path.read_text())
        run["finalAnalysisStateFingerprint"] = run["defaultAnalysisStateFingerprint"]
        run_path.write_text(json.dumps(run), encoding="utf-8")
        events_path = path / "interaction_log.json"
        events = json.loads(events_path.read_text())
        final_capture = next(event for event in events if event["type"] == "final_graph_captured")
        final_capture["detail"]["analysisStateFingerprint"] = run[
            "defaultAnalysisStateFingerprint"
        ]
        events_path.write_text(json.dumps(events), encoding="utf-8")

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

    def test_non_completed_benchmark_outcome_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            run_path = path / "run.json"
            run = json.loads(run_path.read_text())
            run["outcome"] = "infrastructure_failure"
            run_path.write_text(json.dumps(run), encoding="utf-8")
            with self.assertRaisesRegex(VerificationError, "outcome is not completed"):
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

    def test_provenance_allows_annotation_and_multiple_visible_edits(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            self.add_capture_provenance(path, annotation="exact_p", rendered_edit=True)
            verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_a_auc_analysis_only_allows_identical_rendered_graphs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            self.add_capture_provenance(path, analysis_change="auc")
            verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_b_endpoint_analysis_only_allows_identical_rendered_graphs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            self.add_capture_provenance(path, analysis_change="endpoint")
            verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_c_statistics_method_only_allows_identical_rendered_graphs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            self.add_capture_provenance(path, analysis_change="statistics_method")
            verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_d_visible_p_value_with_identical_rendered_graphs_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            self.add_capture_provenance(path, annotation="exact_p")
            self.make_final_graph_identical(path)
            with self.assertRaisesRegex(VerificationError, "visible final statistics annotation"):
                verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_e_rendered_edit_with_identical_rendered_graphs_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            self.add_capture_provenance(path, rendered_edit=True)
            self.make_final_graph_identical(path)
            with self.assertRaisesRegex(VerificationError, "rendered Graph edits"):
                verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_f_mixed_edit_requires_both_fingerprints_to_change(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            self.add_capture_provenance(path, rendered_edit=True, mixed_edit=True)
            verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")
            self.make_final_analysis_identical(path)
            with self.assertRaisesRegex(VerificationError, "analysis-state edits"):
                verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_provenance_ignores_initial_graph_sync_while_persistence_finishes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            self.add_capture_provenance(path)
            events_path = path / "interaction_log.json"
            events = json.loads(events_path.read_text())
            events.insert(
                3,
                {
                    "occurredAt": "2026-08-23T00:00:02.500Z",
                    "type": "graph_configuration_changed",
                    "effect": "rendered_graph",
                },
            )
            for sequence, event in enumerate(events, start=1):
                event["sequence"] = sequence
            events_path.write_text(json.dumps(events), encoding="utf-8")
            run_path = path / "run.json"
            run = json.loads(run_path.read_text())
            run["finalCapturedEventIndex"] = 7
            run["interactionCount"] = len(events)
            run["graphEditCount"] = 1
            run["renderedGraphEditCount"] = 1
            run_path.write_text(json.dumps(run), encoding="utf-8")
            verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

    def test_provenance_rejects_cross_pair_png_or_impossible_ordering(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            self.add_capture_provenance(path, annotation="exact_p")
            (path / "default_graph.png").write_bytes((path / "final_graph.png").read_bytes())
            with self.assertRaisesRegex(VerificationError, "defaultPngSha256"):
                verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")

        with tempfile.TemporaryDirectory() as temporary:
            path = self.make_complete_run(Path(temporary))
            self.add_capture_provenance(path, rendered_edit=True)
            events_path = path / "interaction_log.json"
            events = json.loads(events_path.read_text())
            events = [events[0], events[1], events[5], events[2], events[3], events[4], *events[6:]]
            for sequence, event in enumerate(events, start=1):
                event["sequence"] = sequence
            events_path.write_text(json.dumps(events), encoding="utf-8")
            run_path = path / "run.json"
            run = json.loads(run_path.read_text())
            run["defaultCapturedEventIndex"] = 4
            run_path.write_text(json.dumps(run), encoding="utf-8")
            with self.assertRaisesRegex(VerificationError, "not captured before"):
                verify_run_directory(path, "pilot_independent_2group", "track_A", "run_001")


if __name__ == "__main__":
    unittest.main()
