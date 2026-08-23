#!/usr/bin/env python3
"""Code-only deterministic preflight for the frozen 15-case literature pilot."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
import sys
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

from blind_batch_queue import BlindBatchQueue, prepare_batch
from blind_benchmark_package import FORBIDDEN_TERMS, canonical_bytes, create_package, load_package
from verify_benchmark_runs import verify_explicit_unsupported_run_directory, verify_run_directory
from audit_literature_hierarchy import PASS as HIERARCHY_PASS, audit_all


ROOT = Path(__file__).resolve().parents[1]
ENGINE_ROOT = ROOT / "engine/python"
sys.path.insert(0, str(ENGINE_ROOT))
from lsaa_engine.d01_d02 import run_request  # noqa: E402

FIXTURES_PATH = ROOT / "benchmark/literature_v1_1/preflight_15_fixtures.json"
RUNTIME = ROOT / "benchmark/literature_v1_1/runtime/cases"
EXPECTED_ORDER = (
    "JCB001", "JCB003", "JCB005", "JCB002", "JCB004", "JCB017", "NC027",
    "JCB011", "JCB018", "JCB010", "NC033", "JCB023", "JCB024", "NC028", "NC031",
)


def _request_base(case_id: str, template: str, protocol: str, method: str) -> dict[str, Any]:
    return {
        "protocolVersion": protocol,
        "requestId": f"preflight.{case_id}",
        "projectId": f"preflight.{case_id}",
        "analysisId": f"preflight.{case_id}",
        "templateId": template,
        "templateVersion": "0.1.0",
        "method": method,
    }


def _rows(case_id: str) -> list[dict[str, Any]]:
    payload = json.loads(
        (RUNTIME / case_id / "experimenter_track_b.json").read_text(encoding="utf-8")
    )
    return payload["syntheticData"]


def _two_group_request(
    case_id: str, method: str, values: list[tuple[str, float, str]], paired: bool = False
) -> dict[str, Any]:
    conditions = list(dict.fromkeys(condition for condition, _, _ in values))
    observations = []
    for index, (condition, value, unit) in enumerate(values):
        observation = {
            "observationId": f"observation.{case_id}.{index + 1}",
            "conditionId": condition,
            "value": value,
            "experimentalUnitId": unit,
        }
        if paired:
            observation["pairId"] = unit
        observations.append(observation)
    request = _request_base(case_id, "D02" if paired else "D01", "0.1.0", method)
    request.update(
        {
            "contrastConditionIds": conditions,
            "observations": observations,
            "options": {
                "alternative": "two_sided",
                "confidenceLevel": 0.95,
                "multiplicityMethod": None,
            },
        }
    )
    return request


def build_request(fixture: dict[str, Any]) -> dict[str, Any] | None:
    case_id = fixture["caseId"]
    if fixture["method"] is None:
        return None
    rows = _rows(case_id)
    shape = fixture["shape"]
    if shape == "nested_parent_mean":
        groups: dict[tuple[str, str], list[float]] = collections.defaultdict(list)
        for row in rows:
            groups[(row["condition"], row["parent_unit_id"])].append(row["value"])
        values = [
            (condition, float(np.mean(group)), f"{condition}:{parent}")
            for (condition, parent), group in groups.items()
        ]
        return _two_group_request(case_id, fixture["method"], values)
    if shape == "auc":
        trajectories: dict[tuple[str, str], list[tuple[float, float]]] = collections.defaultdict(list)
        for row in rows:
            trajectories[(row["condition"], row["unit_id"])].append(
                (float(row["time"]), row["value"])
            )
        values = []
        for (condition, unit), points in trajectories.items():
            ordered = sorted(points)
            auc = float(np.trapezoid([value for _, value in ordered], [time for time, _ in ordered]))
            values.append((condition, auc, f"{condition}:{unit}"))
        return _two_group_request(case_id, fixture["method"], values)
    if shape.startswith("readout:"):
        readout = shape.split(":", 1)[1]
        rows = [row for row in rows if row["readout"] == readout]
    elif shape.startswith("time:"):
        time_value = float(shape.split(":", 1)[1])
        rows = [row for row in rows if float(row["time"]) == time_value]

    if fixture["template"] == "D03":
        conditions = list(dict.fromkeys(row["condition"] for row in rows))
        request = _request_base(case_id, "D03", "0.2.0", fixture["method"])
        request.update(
            {
                "conditionIds": conditions,
                "controlConditionId": conditions[0],
                "contrastIntent": "control_vs_many",
                "primaryContrastConditionIds": [conditions[0], conditions[-1]],
                "observations": [
                    {
                        "observationId": f"observation.{case_id}.{index + 1}",
                        "conditionId": row["condition"],
                        "value": row["value"],
                        "experimentalUnitId": f"{row['condition']}:{row['unit_id']}",
                    }
                    for index, row in enumerate(rows)
                ],
                "options": {
                    "alternative": "two_sided",
                    "confidenceLevel": 0.95,
                    "multiplicityMethod": "dunnett_control_vs_many",
                },
            }
        )
        return request
    if fixture["template"] == "D04":
        conditions = list(dict.fromkeys(row["condition"] for row in rows))
        request = _request_base(case_id, "D04", "0.3.0", fixture["method"])
        request.update(
            {
                "conditionIds": conditions,
                "primaryContrastConditionIds": [conditions[0], conditions[-1]],
                "observations": [
                    {
                        "observationId": f"observation.{case_id}.{index + 1}",
                        "conditionId": row["condition"],
                        "value": row["value"],
                        "experimentalUnitId": row["unit_id"],
                        "pairId": row["unit_id"],
                    }
                    for index, row in enumerate(rows)
                ],
                "options": {
                    "alternative": "two_sided",
                    "confidenceLevel": 0.95,
                    "multiplicityMethod": "holm_paired_all_pairs",
                },
            }
        )
        return request
    values = [(row["condition"], row["value"], row["unit_id"]) for row in rows]
    return _two_group_request(case_id, fixture["method"], values, shape == "paired")


def _format_exact_p(value: float) -> str:
    if value == 0:
        return "0"
    if 0 < value < 0.0001:
        return f"{value:.2e}".replace("e-0", "e-").replace("e+0", "e+")
    return f"{value:.6g}"


def _make_supported_artifacts(
    root: Path, case_id: str, run_id: str, result: dict[str, Any]
) -> None:
    path = root / case_id / "track_B" / run_id
    path.mkdir(parents=True)
    p_value = result["tests"][0]["adjustedPValue"] or result["tests"][0]["pValue"]
    p_label = _format_exact_p(p_value)
    events = [
        {"sequence": 1, "type": "benchmark_run_started"},
        {"sequence": 2, "type": "literature_benchmark_data_loaded", "detail": {"caseId": case_id}},
        {"sequence": 3, "type": "statistics_executed"},
        {"sequence": 4, "type": "default_graph_captured"},
        {"sequence": 5, "type": "graph_configuration_changed", "effect": "rendered_graph"},
        {"sequence": 6, "type": "benchmark_run_finalized"},
    ]
    run = {
        "caseId": case_id,
        "track": "track_B",
        "runId": run_id,
        "artifactCompleteness": "complete",
        "outcome": "completed",
        "defaultGraphCaptured": True,
        "supportStatus": "direct",
        "appVersion": "0.1.0",
        "benchmarkVersion": "LSA50_v1_1",
        "engineVersion": result["engine"]["version"],
        "sourceRevision": "code-only-preflight",
        "interactionCount": len(events),
        "graphEditCount": 1,
    }
    values = {
        "run.json": json.dumps(run),
        "statistics.json": json.dumps({"state": "current", "result": result}),
        "graph_state.json": json.dumps({"statisticsAnnotation": {"mode": "exact_p", "testIndex": 0}}),
        "interaction_log.json": json.dumps(events),
        "methods.txt": f"Code-only preflight: {result['tests'][0]['name']}",
        "default_graph.svg": f"<svg><text>{case_id}</text></svg>",
        "final_graph.svg": f"<svg><text>{case_id} p = {p_label}</text></svg>",
    }
    for name, content in values.items():
        (path / name).write_text(content, encoding="utf-8")
    for name, marker in (("default_graph.png", b"default"), ("final_graph.png", b"final")):
        (path / name).write_bytes(b"\x89PNG\r\n\x1a\n" + marker)


def _make_unsupported_artifacts(
    root: Path, case_id: str, run_id: str, package_sha: str, reason: str
) -> None:
    path = root / case_id / "track_B" / run_id
    path.mkdir(parents=True)
    started = "2026-08-23T00:00:00Z"
    completed = "2026-08-23T00:01:00Z"
    provenance = {"caseId": case_id, "runId": run_id, "packageSha256": package_sha}
    events = [
        {"sequence": 1, "type": "benchmark_run_started", "occurredAt": started},
        {"sequence": 2, "type": "blind_case_delivered", "occurredAt": started},
        {
            "sequence": 3,
            "type": "explicit_unsupported_finalized",
            "occurredAt": completed,
            "detail": provenance,
        },
        {"sequence": 4, "type": "benchmark_metadata_only_outcome_recorded", "occurredAt": completed},
    ]
    run = {
        "caseId": case_id,
        "track": "track_B",
        "runId": run_id,
        "benchmarkVersion": "LSA50_v1_1",
        "appVersion": "0.1.0",
        "sourceRevision": "code-only-preflight",
        "productRevision": "code-only-preflight",
        "benchmarkInfrastructureRevision": "code-only-preflight",
        "startedAt": started,
        "completedAt": completed,
        "scientificReason": reason,
        "experimentalUnit": "blind packet declared biological unit",
        "scientificCompromiseReason": reason,
        "attemptedRoutes": [f"case-specific-{case_id}-safe-route"],
        "biologicalN": None,
        "outcome": "explicit_unsupported",
        "supportStatus": "impossible",
        "artifactCompleteness": "metadata_only_explicit_unsupported",
        "blindPackage": {"caseId": case_id, "runId": run_id, "sha256": package_sha},
        "unsupportedEvidenceProvenanceVersion": "1.0.0",
        "evidenceProvenance": provenance,
        "interactionCount": len(events),
    }
    (path / "run.json").write_text(json.dumps(run), encoding="utf-8")
    (path / "interaction_log.json").write_text(json.dumps(events), encoding="utf-8")


def _exercise_queue_matrix(package_root: Path, queue_root: Path) -> list[str]:
    patterns = {
        "completed_to_completed": ("completed", "completed"),
        "completed_to_unsupported": ("completed", "explicit_unsupported"),
        "unsupported_to_completed": ("explicit_unsupported", "completed"),
        "unsupported_to_unsupported": ("explicit_unsupported", "explicit_unsupported"),
        "several_unsupported": ("explicit_unsupported",) * 4,
    }
    passed = []
    for matrix_name, outcomes in patterns.items():
        cases = tuple(EXPECTED_ORDER[: len(outcomes)])
        queue_path = queue_root / f"{matrix_name}.json"
        matrix_packages = package_root / matrix_name
        prepare_batch(f"preflight_{matrix_name}", queue_path, matrix_packages, cases)
        for index, outcome in enumerate(outcomes):
            queue = BlindBatchQueue(queue_path)  # restart/reload between every transition
            identity = queue.active_identity()
            snapshot = queue.snapshot()
            if set(snapshot) != {
                "batchId", "benchmarkVersion", "status", "position", "total", "completed", "current"
            }:
                raise AssertionError("queue snapshot leaked future job metadata")
            if outcome == "completed":
                queue.mark_completed(identity)
            else:
                evidence = {
                    "caseId": identity[0],
                    "runId": identity[2],
                    "packageSha256": snapshot["current"]["packageSha256"],
                    "scientificReason": f"case-specific evidence for {identity[0]}",
                }
                queue.mark_explicit_unsupported(identity, evidence)
                terminal = BlindBatchQueue(queue_path).snapshot()["current"]["terminalEvidence"]
                if terminal["caseId"] != identity[0] or terminal["runId"] != identity[2]:
                    raise AssertionError("unsupported evidence crossed case/run identity")
            queue = BlindBatchQueue(queue_path)
            if index + 1 < len(outcomes):
                queue.advance()
            else:
                final = queue.advance()
                if final["status"] != "completed" or final["completed"] != len(outcomes):
                    raise AssertionError("queue did not reach the expected terminal state")
        passed.append(matrix_name)
    return passed


def run_preflight() -> dict[str, Any]:
    definition = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))
    fixtures = definition["cases"]
    if tuple(item["caseId"] for item in fixtures) != EXPECTED_ORDER:
        raise AssertionError("frozen selection identity or order changed")
    hierarchy_by_case = {case["caseId"]: case for case in audit_all()["cases"]}
    results = []
    with tempfile.TemporaryDirectory() as temporary:
        temporary_root = Path(temporary)
        package_a = temporary_root / "packages-a"
        package_b = temporary_root / "packages-b"
        artifact_root = temporary_root / "artifacts"
        hashes: dict[str, str] = {}
        for fixture in fixtures:
            case_id = fixture["caseId"]
            run_id = f"preflight_{case_id}"
            first = create_package(case_id, run_id, package_a)
            second = create_package(case_id, run_id, package_b)
            first_payload = load_package(package_a, case_id, run_id)
            second_payload = load_package(package_b, case_id, run_id)
            first_bytes = (first / "case.json").read_bytes()
            if first_bytes != (second / "case.json").read_bytes() or first_payload != second_payload:
                raise AssertionError(f"{case_id}: blind package generation is not deterministic")
            serialized = first_bytes.decode("utf-8").lower()
            if any(term in serialized for term in FORBIDDEN_TERMS):
                raise AssertionError(f"{case_id}: forbidden blind package term")
            if len(first_payload["syntheticData"]) != fixture["rowCount"]:
                raise AssertionError(f"{case_id}: synthetic row count mismatch")
            package_sha = hashlib.sha256(first_bytes).hexdigest()
            hashes[case_id] = package_sha
            request = build_request(fixture)
            engine_status = "expected_unsupported"
            statistic = None
            p_value = None
            if request is not None:
                if len(request["observations"]) != fixture["analysisCount"]:
                    raise AssertionError(f"{case_id}: analyzed observation count mismatch")
                actual_n = collections.Counter(
                    observation["conditionId"] for observation in request["observations"]
                )
                if list(actual_n.values()) != fixture["nByCondition"]:
                    raise AssertionError(f"{case_id}: biological n mismatch: {actual_n}")
                round_trip = json.loads(canonical_bytes(request))
                if round_trip != request:
                    raise AssertionError(f"{case_id}: request save/reload corruption")
                result = run_request(round_trip)
                if result["status"] != "ok":
                    raise AssertionError(f"{case_id}: engine did not return ok")
                if not all(
                    math.isfinite(value)
                    for test in result["tests"]
                    for value in (test.get("statistic"), test.get("pValue"))
                    if value is not None
                ):
                    raise AssertionError(f"{case_id}: non-finite statistical output")
                statistic = result["tests"][0]["statistic"]
                p_value = result["tests"][0]["pValue"]
                if not math.isclose(statistic, fixture["referenceStatistic"], rel_tol=2e-5, abs_tol=1e-8):
                    raise AssertionError(f"{case_id}: statistic differs from deterministic reference")
                # Imported Gold values have case-dependent decimal truncation (notably 4.2e-9).
                if not math.isclose(p_value, fixture["referenceP"], rel_tol=1e-2, abs_tol=1e-12):
                    raise AssertionError(f"{case_id}: p-value differs from deterministic reference")
                p_label = _format_exact_p(p_value)
                if p_value > 0 and p_label == "0":
                    raise AssertionError(f"{case_id}: finite p-value serialized as zero")
                _make_supported_artifacts(artifact_root, case_id, run_id, result)
                verify_run_directory(artifact_root / case_id / "track_B" / run_id, case_id, "track_B", run_id)
                engine_status = "pass"
            else:
                _make_unsupported_artifacts(
                    artifact_root, case_id, run_id, package_sha, fixture["unsupportedReason"]
                )
                verify_explicit_unsupported_run_directory(
                    artifact_root / case_id / "track_B" / run_id,
                    case_id,
                    "track_B",
                    run_id,
                    package_sha,
                    require_evidence_provenance=True,
                )
            results.append(
                {
                    "caseId": case_id,
                    "packageSha256": package_sha,
                    "packageIntegrity": "pass",
                    "dataShapingIntegrity": "pass" if request is not None else "safe_refusal_pass",
                    "statisticalEngineIntegrity": engine_status,
                    "graphSerializationIntegrity": "pass" if request is not None else "not_applicable",
                    "artifactProvenanceIntegrity": "pass",
                    "persistenceQueueIntegrity": "pass",
                    "statistic": statistic,
                    "pValue": p_value,
                    "packetExpectedBiologicalN": hierarchy_by_case[case_id]["packetExpectedBiologicalN"],
                    "goldExpectedBiologicalN": hierarchy_by_case[case_id]["goldExpectedBiologicalN"],
                    "runtimeDerivedBiologicalN": hierarchy_by_case[case_id]["runtimeDerivedBiologicalN"],
                    "loaderRequiredBiologicalN": hierarchy_by_case[case_id]["loaderRequiredBiologicalN"],
                    "hierarchyPath": hierarchy_by_case[case_id]["hierarchyPath"],
                    "hierarchyStatus": hierarchy_by_case[case_id]["status"],
                    "hierarchyIssues": hierarchy_by_case[case_id]["issues"],
                    "status": (
                        fixture["status"]
                        if hierarchy_by_case[case_id]["status"] == HIERARCHY_PASS
                        else "PREFLIGHT_BLOCKED_HIERARCHY"
                    ),
                }
            )
        matrix = _exercise_queue_matrix(
            temporary_root / "matrix-packages", temporary_root / "matrix-queues"
        )
    return {
        "schemaVersion": "1.0.0",
        "selectionId": definition["selectionId"],
        "benchmarkVersion": definition["benchmarkVersion"],
        "caseCount": len(results),
        "supportedEngineCaseCount": sum(item["statisticalEngineIntegrity"] == "pass" for item in results),
        "expectedUnsupportedCaseCount": sum(item["status"] == "READY_EXPECTED_UNSUPPORTED" for item in results),
        "hierarchyBlockedCaseCount": sum(
            item["status"] == "PREFLIGHT_BLOCKED_HIERARCHY" for item in results
        ),
        "queueTransitionMatrix": matrix,
        "cases": results,
        "overall": (
            "PASS"
            if all(item["hierarchyStatus"] == HIERARCHY_PASS for item in results)
            else "BLOCKED"
        ),
        "certificationScope": "deterministic machinery only; not a human/Experimenter benchmark score",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = run_preflight()
    text = json.dumps(report, ensure_ascii=False, indent=None if args.compact else 2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
    print(text, end="")


if __name__ == "__main__":
    main()
