#!/usr/bin/env python3
"""Verify complete benchmark pilot output folders without interpreting scientific results."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


PILOT_CASE_IDS = (
    "pilot_independent_2group",
    "pilot_independent_3group",
    "pilot_paired_2condition",
    "pilot_nested_microscopy",
    "pilot_longitudinal_endpoint",
)
REQUIRED_ARTIFACTS = {
    "run.json",
    "default_graph.png",
    "default_graph.svg",
    "final_graph.png",
    "final_graph.svg",
    "statistics.json",
    "methods.txt",
    "graph_state.json",
    "interaction_log.json",
}
SUPPORT_STATUSES = {
    "direct",
    "reasonable_workaround",
    "scientifically_compromising",
    "impossible",
}
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


class VerificationError(ValueError):
    pass


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def event_at(events: list[Any], sequence: int, expected_type: str) -> dict[str, Any]:
    if sequence < 1 or sequence > len(events):
        raise VerificationError(f"{expected_type} event index is outside the interaction log")
    event = events[sequence - 1]
    if not isinstance(event, dict) or event.get("type") != expected_type:
        raise VerificationError(f"event {sequence} must be {expected_type}")
    return event


def read_json_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise VerificationError(f"{path.name} is not valid JSON: {error}") from error
    if not isinstance(value, dict):
        raise VerificationError(f"{path.name} must contain a JSON object")
    return value


def verify_run_directory(path: Path, case_id: str, track: str, run_id: str) -> None:
    if not path.is_dir():
        raise VerificationError(f"run folder is missing: {path}")
    present = {item.name for item in path.iterdir() if item.is_file()}
    missing = sorted(REQUIRED_ARTIFACTS - present)
    if missing:
        raise VerificationError(f"{path}: missing artifacts: {', '.join(missing)}")
    unexpected = sorted(present - REQUIRED_ARTIFACTS)
    if unexpected:
        raise VerificationError(f"{path}: unexpected artifacts: {', '.join(unexpected)}")

    run = read_json_object(path / "run.json")
    expected_identity = {"caseId": case_id, "track": track, "runId": run_id}
    for key, expected in expected_identity.items():
        if run.get(key) != expected:
            raise VerificationError(f"run.json {key} must be {expected!r}")
    if run.get("artifactCompleteness") != "complete":
        raise VerificationError("run.json must declare artifactCompleteness=complete")
    if run.get("outcome") not in {None, "completed"}:
        raise VerificationError("run.json benchmark outcome is not completed")
    if run.get("defaultGraphCaptured") is not True:
        raise VerificationError("run.json must confirm the default Graph capture")
    if run.get("supportStatus") not in SUPPORT_STATUSES:
        raise VerificationError("run.json has no valid support status")
    required_versions = {
        "appVersion": "app version",
        "benchmarkVersion": "benchmark version",
        "engineVersion": "engine version",
        "sourceRevision": "source revision",
    }
    for key, label in required_versions.items():
        if not isinstance(run.get(key), str) or not run[key].strip():
            raise VerificationError(f"run.json has no {label}")

    statistics = read_json_object(path / "statistics.json")
    if statistics.get("state") != "current":
        raise VerificationError("statistics.json must contain a current result")
    result = statistics.get("result")
    if not isinstance(result, dict) or result.get("status") != "ok":
        raise VerificationError("statistics.json must contain a successful engine result")
    graph_state = read_json_object(path / "graph_state.json")
    annotation = graph_state.get("statisticsAnnotation")
    if (
        isinstance(annotation, dict)
        and annotation.get("mode") not in {None, "hidden"}
        and (path / "default_graph.svg").read_bytes() == (path / "final_graph.svg").read_bytes()
    ):
        raise VerificationError(
            "default_graph.svg matches final_graph.svg despite a visible final statistics annotation"
        )

    try:
        events = json.loads((path / "interaction_log.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise VerificationError(f"interaction_log.json is invalid: {error}") from error
    if not isinstance(events, list) or not events:
        raise VerificationError("interaction_log.json must contain an event list")
    if [event.get("sequence") for event in events if isinstance(event, dict)] != list(
        range(1, len(events) + 1)
    ):
        raise VerificationError("interaction log sequence is incomplete or unordered")
    event_types = {event.get("type") for event in events if isinstance(event, dict)}
    required_events = {
        "benchmark_run_started",
        "statistics_executed",
        "default_graph_captured",
        "benchmark_run_finalized",
    }
    missing_events = sorted(required_events - event_types)
    if missing_events:
        raise VerificationError(f"interaction log is missing: {', '.join(missing_events)}")
    if not {
        "benchmark_pilot_data_loaded",
        "literature_benchmark_data_loaded",
    }.intersection(event_types):
        raise VerificationError("interaction log is missing a benchmark data-loaded event")
    if run.get("interactionCount") != len(events):
        raise VerificationError("run.json interactionCount does not match interaction_log.json")
    graph_edit_count = sum(event.get("type") == "graph_configuration_changed" for event in events)
    if run.get("graphEditCount") != graph_edit_count:
        raise VerificationError("run.json graphEditCount does not match interaction_log.json")

    provenance_version = run.get("captureProvenanceVersion")
    if provenance_version in {"1.0.0", "1.1.0"}:
        capture_fields = {
            "defaultCapturedAt": str,
            "defaultCapturedEventIndex": int,
            "finalCapturedAt": str,
            "finalCapturedEventIndex": int,
            "defaultGraphStateFingerprint": str,
            "finalGraphStateFingerprint": str,
            "defaultSvgSha256": str,
            "defaultPngSha256": str,
            "finalSvgSha256": str,
            "finalPngSha256": str,
        }
        if provenance_version == "1.1.0":
            capture_fields.update(
                {
                    "defaultAnalysisStateFingerprint": str,
                    "finalAnalysisStateFingerprint": str,
                    "renderedGraphEditCount": int,
                    "analysisEditCount": int,
                }
            )
        for key, expected_type in capture_fields.items():
            if not isinstance(run.get(key), expected_type):
                raise VerificationError(f"run.json has no valid {key}")

        default_index = run["defaultCapturedEventIndex"]
        final_index = run["finalCapturedEventIndex"]
        default_started = event_at(events, default_index, "default_graph_capture_started")
        final_captured = event_at(events, final_index, "final_graph_captured")
        default_completed = next(
            (
                event
                for event in events
                if isinstance(event, dict) and event.get("type") == "default_graph_captured"
            ),
            None,
        )
        finalized = next(
            (
                event
                for event in events
                if isinstance(event, dict) and event.get("type") == "benchmark_run_finalized"
            ),
            None,
        )
        if not isinstance(default_completed, dict) or not isinstance(finalized, dict):
            raise VerificationError("capture completion/finalization events are missing")
        if not (
            default_index
            < default_completed["sequence"]
            < final_index
            < finalized["sequence"]
        ):
            raise VerificationError("default/final capture event ordering is invalid")
        if default_started.get("occurredAt") != run["defaultCapturedAt"]:
            raise VerificationError("defaultCapturedAt does not match its capture event")
        if final_captured.get("occurredAt") != run["finalCapturedAt"]:
            raise VerificationError("finalCapturedAt does not match its capture event")

        allowed_effects = {"analysis_only", "rendered_graph", "both", "non_rendering_ui"}
        if provenance_version == "1.1.0":
            for event in events:
                if not isinstance(event, dict) or event.get("effect") not in allowed_effects:
                    raise VerificationError("interaction event has no valid effect classification")
            rendered_graph_edit_count = sum(
                event.get("effect") in {"rendered_graph", "both"} for event in events
            )
            analysis_edit_count = sum(
                event.get("effect") in {"analysis_only", "both"} for event in events
            )
            if run["renderedGraphEditCount"] != rendered_graph_edit_count:
                raise VerificationError("run.json renderedGraphEditCount does not match events")
            if run["analysisEditCount"] != analysis_edit_count:
                raise VerificationError("run.json analysisEditCount does not match events")

        first_rendered_edit = next(
            (
                event
                for event in events
                if isinstance(event, dict)
                and (
                    event.get("effect") in {"rendered_graph", "both"}
                    if provenance_version == "1.1.0"
                    else event.get("type") == "graph_configuration_changed"
                )
            ),
            None,
        )
        if (
            isinstance(first_rendered_edit, dict)
            and default_index >= first_rendered_edit["sequence"]
        ):
            raise VerificationError(
                "immutable default Graph state was not captured before the first rendered edit"
            )

        expected_hashes = {
            "defaultSvgSha256": "default_graph.svg",
            "defaultPngSha256": "default_graph.png",
            "finalSvgSha256": "final_graph.svg",
            "finalPngSha256": "final_graph.png",
        }
        for field, name in expected_hashes.items():
            if run[field] != sha256(path / name):
                raise VerificationError(f"{field} does not match {name}")
        if run["defaultGraphStateFingerprint"] != run["defaultSvgSha256"]:
            raise VerificationError("default Graph-state fingerprint does not match default SVG")
        if run["finalGraphStateFingerprint"] != run["finalSvgSha256"]:
            raise VerificationError("final Graph-state fingerprint does not match final SVG")

        if provenance_version == "1.1.0":
            if (
                default_completed.get("detail", {}).get("analysisStateFingerprint")
                != run["defaultAnalysisStateFingerprint"]
            ):
                raise VerificationError(
                    "default analysis-state fingerprint does not match capture event"
                )
            if (
                final_captured.get("detail", {}).get("analysisStateFingerprint")
                != run["finalAnalysisStateFingerprint"]
            ):
                raise VerificationError(
                    "final analysis-state fingerprint does not match capture event"
                )

        visible_annotation = isinstance(annotation, dict) and annotation.get("mode") not in {
            None,
            "hidden",
        }
        rendered_edit_after_default = any(
            isinstance(event, dict)
            and event.get("sequence", 0) > default_completed["sequence"]
            and (
                event.get("effect") in {"rendered_graph", "both"}
                if provenance_version == "1.1.0"
                else event.get("type") == "graph_configuration_changed"
            )
            for event in events
        )
        meaningful_rendered_edit = rendered_edit_after_default or visible_annotation
        if (
            meaningful_rendered_edit
            and run["defaultGraphStateFingerprint"] == run["finalGraphStateFingerprint"]
        ):
            raise VerificationError(
                "rendered Graph edits occurred but default/final fingerprints are identical"
            )
        if provenance_version == "1.1.0":
            analysis_edit_after_default = any(
                isinstance(event, dict)
                and event.get("sequence", 0) > default_completed["sequence"]
                and event.get("effect") in {"analysis_only", "both"}
                for event in events
            )
            if (
                analysis_edit_after_default
                and run["defaultAnalysisStateFingerprint"]
                == run["finalAnalysisStateFingerprint"]
            ):
                raise VerificationError(
                    "analysis-state edits occurred but default/final analysis fingerprints are identical"
                )

    methods = (path / "methods.txt").read_text(encoding="utf-8").strip()
    if not methods:
        raise VerificationError("methods.txt is empty")
    for name in ("default_graph.svg", "final_graph.svg"):
        if "<svg" not in (path / name).read_text(encoding="utf-8")[:500]:
            raise VerificationError(f"{name} is not an SVG document")
    for name in ("default_graph.png", "final_graph.png"):
        if (path / name).read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
            raise VerificationError(f"{name} is not a PNG document")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-root", type=Path, default=Path("benchmark_runs"))
    parser.add_argument("--track", choices=("track_A", "track_B"), default="track_A")
    parser.add_argument("--run-id", default="run_001")
    parser.add_argument("--case", dest="case_ids", action="append")
    args = parser.parse_args()
    case_ids = tuple(args.case_ids or PILOT_CASE_IDS)
    invalid_case_ids = [case_id for case_id in case_ids if not SAFE_ID.fullmatch(case_id)]
    if invalid_case_ids:
        parser.error(f"invalid case ID: {invalid_case_ids[0]}")
    failures: list[str] = []
    for case_id in case_ids:
        path = args.output_root / case_id / args.track / args.run_id
        try:
            verify_run_directory(path, case_id, args.track, args.run_id)
            print(f"PASS {case_id} / {args.track} / {args.run_id}")
        except VerificationError as error:
            failures.append(str(error))
            print(f"FAIL {case_id}: {error}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
