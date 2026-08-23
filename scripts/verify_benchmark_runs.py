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
EXPLICIT_UNSUPPORTED_ARTIFACTS = {"run.json", "interaction_log.json"}
EXPLICIT_UNSUPPORTED_DEFAULT_GRAPH_ARTIFACTS = {
    *EXPLICIT_UNSUPPORTED_ARTIFACTS,
    "default_graph.png",
    "default_graph.svg",
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


def verify_explicit_unsupported_run_directory(
    path: Path, case_id: str, track: str, run_id: str,
    package_sha256: str | None = None,
    source_view_sha256: str | None = None,
    require_evidence_provenance: bool = False,
) -> dict[str, Any]:
    """Validate a deliberate scientific unsupported decision without fabricated analysis files."""
    if not path.is_dir():
        raise VerificationError(f"run folder is missing: {path}")
    present = {item.name for item in path.iterdir() if item.is_file()}
    if frozenset(present) not in {
        frozenset(EXPLICIT_UNSUPPORTED_ARTIFACTS),
        frozenset(EXPLICIT_UNSUPPORTED_DEFAULT_GRAPH_ARTIFACTS),
    }:
        raise VerificationError(
            "explicit unsupported run must contain terminal metadata and, if captured, the complete default Graph pair"
        )
    run = read_json_object(path / "run.json")
    for key, expected in {"caseId": case_id, "track": track, "runId": run_id}.items():
        if run.get(key) != expected:
            raise VerificationError(f"run.json {key} must be {expected!r}")
    required_values = {
        "benchmarkVersion": "benchmark version",
        "appVersion": "app version",
        "sourceRevision": "product revision",
        "productRevision": "explicit product revision",
        "benchmarkInfrastructureRevision": "benchmark infrastructure revision",
        "startedAt": "start timestamp",
        "completedAt": "completion timestamp",
        "scientificReason": "scientific reason",
        "experimentalUnit": "experimental unit",
        "scientificCompromiseReason": "scientific compromise reason",
    }
    for key, label in required_values.items():
        if not isinstance(run.get(key), str) or not run[key].strip():
            raise VerificationError(f"explicit unsupported run has no {label}")
    if run.get("outcome") != "explicit_unsupported":
        raise VerificationError("explicit unsupported run has the wrong benchmark outcome")
    if run.get("supportStatus") != "impossible":
        raise VerificationError("explicit unsupported run must classify scientific support as impossible")
    has_default_graph = "default_graph.svg" in present
    expected_completeness = (
        "metadata_only_explicit_unsupported_with_default_graph"
        if has_default_graph
        else "metadata_only_explicit_unsupported"
    )
    if run.get("artifactCompleteness") != expected_completeness:
        raise VerificationError("explicit unsupported artifact contract is not declared")
    if has_default_graph and run.get("defaultGraphCaptured") is not True:
        raise VerificationError("explicit unsupported default Graph declaration is inconsistent")
    if not has_default_graph and run.get("defaultGraphCaptured") not in {None, False}:
        raise VerificationError("explicit unsupported default Graph declaration is inconsistent")
    routes = run.get("attemptedRoutes")
    if not isinstance(routes, list) or not routes or any(
        not isinstance(route, str) or not route.strip() for route in routes
    ):
        raise VerificationError("explicit unsupported run has no attempted routes")
    biological_n = run.get("biologicalN")
    if biological_n is not None and (
        isinstance(biological_n, bool) or not isinstance(biological_n, (int, float)) or biological_n <= 0
    ):
        raise VerificationError("explicit unsupported run has an invalid biological n")
    if track == "track_B":
        source = run.get("blindPackage")
        source_label = "blind package"
        provenance_key = "packageSha256"
        expected_sha = package_sha256
        expected_version = "1.0.0"
    elif track == "track_A":
        source = run.get("trackASourceView")
        source_label = "Track A source view"
        provenance_key = "sourceViewSha256"
        expected_sha = source_view_sha256
        expected_version = "1.1.0"
    else:
        raise VerificationError("explicit unsupported run has an invalid track")
    if not isinstance(source, dict) or any(
        source.get(key) != expected
        for key, expected in {"caseId": case_id, "runId": run_id}.items()
    ):
        raise VerificationError(f"explicit unsupported run has the wrong {source_label} identity")
    actual_source_sha = source.get("sha256")
    if not isinstance(actual_source_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", actual_source_sha):
        raise VerificationError(f"explicit unsupported run has no valid {source_label} hash")
    if expected_sha is not None and actual_source_sha != expected_sha:
        raise VerificationError(f"explicit unsupported run {source_label} hash does not match source")
    expected_provenance = {
        "caseId": case_id,
        "runId": run_id,
        provenance_key: actual_source_sha,
    }
    provenance_version = run.get("unsupportedEvidenceProvenanceVersion")
    if require_evidence_provenance or provenance_version is not None or "evidenceProvenance" in run:
        if provenance_version != expected_version:
            raise VerificationError("explicit unsupported evidence provenance version is invalid")
        if run.get("evidenceProvenance") != expected_provenance:
            raise VerificationError("explicit unsupported evidence provenance belongs to another run")
    try:
        events = json.loads((path / "interaction_log.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise VerificationError(f"interaction_log.json is invalid: {error}") from error
    if not isinstance(events, list) or [
        event.get("sequence") for event in events if isinstance(event, dict)
    ] != list(range(1, len(events) + 1)):
        raise VerificationError("explicit unsupported interaction log is incomplete or unordered")
    event_types = [event.get("type") for event in events if isinstance(event, dict)]
    for required_event in (
        "benchmark_run_started", "blind_case_delivered", "explicit_unsupported_finalized",
        "benchmark_metadata_only_outcome_recorded",
    ):
        if required_event not in event_types:
            raise VerificationError(f"explicit unsupported interaction log is missing {required_event}")
    if "blind_case_delivery_failed" in event_types:
        raise VerificationError("packet delivery failure cannot be scientific unsupported")
    if event_types.index("blind_case_delivered") > event_types.index("explicit_unsupported_finalized"):
        raise VerificationError("explicit unsupported was finalized before blind case delivery")
    if not (
        event_types.index("explicit_unsupported_finalized")
        < event_types.index("benchmark_metadata_only_outcome_recorded")
    ):
        raise VerificationError("explicit unsupported terminal event ordering is invalid")
    started_event = events[event_types.index("benchmark_run_started")]
    finalized_event = events[event_types.index("explicit_unsupported_finalized")]
    if require_evidence_provenance or provenance_version is not None:
        finalized_detail = finalized_event.get("detail")
        if not isinstance(finalized_detail, dict) or any(
            finalized_detail.get(key) != expected
            for key, expected in expected_provenance.items()
        ):
            raise VerificationError("explicit unsupported terminal event has foreign run provenance")
    if started_event.get("occurredAt") != run["startedAt"]:
        raise VerificationError("explicit unsupported start timestamp is inconsistent")
    if not isinstance(finalized_event.get("occurredAt"), str) or not (
        run["startedAt"] <= finalized_event["occurredAt"] <= run["completedAt"]
    ):
        raise VerificationError("explicit unsupported completion timestamp ordering is invalid")
    if run.get("interactionCount") != len(events):
        raise VerificationError("run.json interactionCount does not match interaction_log.json")
    if has_default_graph:
        if "default_graph_captured" not in event_types:
            raise VerificationError("explicit unsupported default Graph has no capture event")
        captured = events[event_types.index("default_graph_captured")]
        detail = captured.get("detail")
        if not isinstance(detail, dict):
            raise VerificationError("explicit unsupported default Graph capture has no provenance")
        if sha256(path / "default_graph.svg") != detail.get("svgSha256"):
            raise VerificationError("explicit unsupported default SVG hash does not match capture")
        if sha256(path / "default_graph.png") != detail.get("pngSha256"):
            raise VerificationError("explicit unsupported default PNG hash does not match capture")
        if event_types.index("blind_case_delivered") > event_types.index("default_graph_captured"):
            raise VerificationError("explicit unsupported default Graph was captured before case delivery")
        if "<svg" not in (path / "default_graph.svg").read_text(encoding="utf-8")[:500]:
            raise VerificationError("explicit unsupported default_graph.svg is not an SVG document")
        if (path / "default_graph.png").read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
            raise VerificationError("explicit unsupported default_graph.png is not a PNG document")
    return run


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
    if isinstance(annotation, dict) and annotation.get("mode") == "exact_p":
        test_index = annotation.get("testIndex")
        tests = result.get("tests")
        if (
            isinstance(test_index, int)
            and isinstance(tests, list)
            and 0 <= test_index < len(tests)
            and isinstance(tests[test_index], dict)
        ):
            test = tests[test_index]
            stored_p = test.get("adjustedPValue")
            if stored_p is None:
                stored_p = test.get("pValue")
            final_svg = (path / "final_graph.svg").read_text(encoding="utf-8")
            if (
                isinstance(stored_p, (int, float))
                and not isinstance(stored_p, bool)
                and 0 < stored_p < float("inf")
                and re.search(r"p\s*=\s*0(?=[^\.\d]|$)", final_svg)
            ):
                raise VerificationError(
                    "final Graph renders a finite positive exact p-value as zero"
                )
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
    if re.fullmatch(r"(?:JCB|NC|SA|EL)\d{3}", case_id):
        ordered_event_types = [event.get("type") for event in events if isinstance(event, dict)]
        if "default_graph_capture_started" in ordered_event_types:
            if "blind_case_delivered" not in ordered_event_types:
                raise VerificationError("interaction log is missing blind_case_delivered")
            if (
                ordered_event_types.index("default_graph_capture_started")
                < ordered_event_types.index("blind_case_delivered")
            ):
                raise VerificationError("default Graph capture started before current case delivery")
        literature_loads = [
            event for event in events
            if isinstance(event, dict) and event.get("type") == "literature_benchmark_data_loaded"
        ]
        if not any(
            isinstance(event.get("detail"), dict) and event["detail"].get("caseId") == case_id
            for event in literature_loads
        ):
            raise VerificationError("literature data-loaded event does not match the run case")
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


def verify_run_sequence(run_paths: list[Path]) -> None:
    """Reject a previous case's final Graph reused as the next case's default Graph."""
    for previous, current in zip(run_paths, run_paths[1:]):
        for extension in ("svg", "png"):
            previous_final = previous / f"final_graph.{extension}"
            current_default = current / f"default_graph.{extension}"
            if previous_final.is_file() and current_default.is_file() and (
                sha256(previous_final) == sha256(current_default)
            ):
                raise VerificationError(
                    f"cross-case Graph contamination: {previous.name} final {extension} "
                    f"matches {current.name} default {extension}"
                )


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
