#!/usr/bin/env python3
"""Create and validate filesystem-isolated Track B literature packages."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "benchmark/literature_v1_1/runtime/cases"
RUNTIME_MANIFEST = ROOT / "benchmark/literature_v1_1/runtime/manifest.json"
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
CASE_KEYS = {
    "schemaVersion",
    "benchmarkVersion",
    "caseId",
    "runId",
    "role",
    "researcherPacket",
    "syntheticData",
}
PACKET_KEYS = {
    "case_id",
    "blind_experiment_summary",
    "measurement_context",
    "conditions",
    "timepoints",
    "readouts",
    "experimental_unit_description",
    "independent_session_count",
    "repeated_identity_note",
    "nested_observation_note",
}
ROW_KEYS = {
    "case_id",
    "experiment_id",
    "unit_id",
    "parent_unit_id",
    "condition",
    "time",
    "readout",
    "value",
    "numerator",
    "denominator",
    "x_value",
    "event",
    "synthetic",
    "seed",
}
FORBIDDEN_TERMS = {
    "paperreference",
    "gold",
    "acceptable_statistical",
    "acceptable_graph",
    "paper_reported",
    "recommended_graph",
    "reference_p_value",
    "reference_statistic",
    "scope_expectation",
    "doi",
    "article_url",
    "paper_title",
}
# These are researcher-visible measurement-structure descriptors, not reference results or
# method recommendations. JCB015 uses them inside an allow-listed packet sentence while its
# trusted integrator also stores the same words as taxonomy labels.
PUBLIC_CONTEXT_TERMS = {"multivariate", "compositional"}


def canonical_bytes(value: Any) -> bytes:
    serialized = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return f"{serialized}\n".encode("utf-8")


def _strings(value: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(value, str) and len(value.strip()) >= 12:
        found.add(value.strip())
    elif isinstance(value, dict):
        for child in value.values():
            found.update(_strings(child))
    elif isinstance(value, list):
        for child in value:
            found.update(_strings(child))
    return found


def validate_case(payload: dict[str, Any], case_id: str, run_id: str) -> None:
    if set(payload) != CASE_KEYS:
        unexpected = sorted(set(payload) ^ CASE_KEYS)
        raise ValueError(f"Blind package top-level keys are not allow-listed: {unexpected}")
    if (
        payload["caseId"] != case_id
        or payload["runId"] != run_id
        or payload["role"] != "track_B_experimenter"
    ):
        raise ValueError("Blind package identity mismatch")
    packet = payload.get("researcherPacket")
    rows = payload.get("syntheticData")
    if not isinstance(packet, dict) or set(packet) != PACKET_KEYS:
        raise ValueError("Researcher packet keys are not exactly allow-listed")
    if not isinstance(rows, list) or not rows:
        raise ValueError("Synthetic data is missing")
    for row in rows:
        if not isinstance(row, dict) or set(row) != ROW_KEYS:
            raise ValueError("Synthetic row keys are not exactly allow-listed")
        if row.get("case_id") != case_id or row.get("synthetic") is not True:
            raise ValueError("Synthetic row identity mismatch")
    serialized = canonical_bytes(payload).decode("utf-8").lower()
    leaked_terms = sorted(term for term in FORBIDDEN_TERMS if term in serialized)
    if leaked_terms:
        raise ValueError(f"Blind package leakage scanner rejected terms: {', '.join(leaked_terms)}")


def validate_hidden_reference_absence(
    payload: dict[str, Any], hidden: dict[str, Any], case_id: str
) -> None:
    paper = hidden.get("paperReference") or {}
    gold_analysis = hidden.get("goldAnalysis") or {}
    gold_metadata = hidden.get("goldMetadata") or {}
    hidden_reference = {
        "paper": {key: paper.get(key) for key in ("title", "doi", "article_url", "paper_reported_analysis", "curated_graph_reference")},
        "goldAnalysis": {key: gold_analysis.get(key) for key in ("expected_decision", "paper_reported_method", "reference_method", "acceptable_graph_families", "acceptable_statistical_families")},
        "goldMetadata": {key: gold_metadata.get(key) for key in ("expected_decision", "paper_method_preassessment", "paper_reported_method", "reference_method", "acceptable_graph_families", "acceptable_statistical_families", "scope_expectation")},
    }
    hidden_only = _strings(hidden_reference) - PUBLIC_CONTEXT_TERMS
    serialized = canonical_bytes(payload).decode("utf-8")
    if any(value in serialized for value in hidden_only):
        raise ValueError(f"{case_id}: blind package contains a hidden reference value")


def create_package(case_id: str, run_id: str, output_root: Path) -> Path:
    if not SAFE_ID.fullmatch(case_id) or not SAFE_ID.fullmatch(run_id):
        raise ValueError("Blind package case and run IDs must be safe identifiers")
    output_root = output_root.resolve()
    if output_root == ROOT or ROOT in output_root.parents:
        raise ValueError("Blind package root must be outside the full source tree")
    source_path = RUNTIME / case_id / "experimenter_track_b.json"
    hidden_path = RUNTIME / case_id / "integrator.json"
    if not source_path.is_file() or not hidden_path.is_file():
        raise ValueError("Literature benchmark case is not available")
    source = json.loads(source_path.read_text(encoding="utf-8"))
    payload = {
        "schemaVersion": "1.0.0",
        "benchmarkVersion": source["benchmarkVersion"],
        "caseId": case_id,
        "runId": run_id,
        "role": "track_B_experimenter",
        "researcherPacket": {
            key: source["researcherPacket"][key] for key in sorted(PACKET_KEYS)
        },
        "syntheticData": [
            {key: row[key] for key in sorted(ROW_KEYS)} for row in source["syntheticData"]
        ],
    }
    validate_case(payload, case_id, run_id)
    hidden = json.loads(hidden_path.read_text(encoding="utf-8"))
    if hidden.get("excludedFromAutomatedScoring"):
        raise ValueError(f"{case_id}: case is excluded from automated packaging and scoring")
    validate_hidden_reference_absence(payload, hidden, case_id)
    target = output_root / run_id
    if target.exists():
        raise ValueError("Blind package run identity already exists; use a fresh run ID")
    target.mkdir(parents=True)
    case_bytes = canonical_bytes(payload)
    (target / "case.json").write_bytes(case_bytes)
    runtime_manifest = json.loads(RUNTIME_MANIFEST.read_text(encoding="utf-8"))
    manifest = {
        "schemaVersion": "1.0.0",
        "packageType": "LSAA_TRACK_B_BLIND",
        "benchmarkVersion": payload["benchmarkVersion"],
        "sourceBenchmarkVersion": runtime_manifest["sourceBenchmarkVersion"],
        "runtimeCorrectionSha256": runtime_manifest["runtimeCorrectionSha256"],
        "caseId": case_id,
        "runId": run_id,
        "payload": "case.json",
        "payloadSha256": hashlib.sha256(case_bytes).hexdigest(),
    }
    (target / "manifest.json").write_bytes(canonical_bytes(manifest))
    return target


def load_package(output_root: Path, case_id: str, run_id: str) -> dict[str, Any]:
    if not SAFE_ID.fullmatch(case_id) or not SAFE_ID.fullmatch(run_id):
        raise ValueError("Blind package case and run IDs must be safe identifiers")
    target = output_root.resolve() / run_id
    manifest_path = target / "manifest.json"
    case_path = target / "case.json"
    if not manifest_path.is_file() or not case_path.is_file():
        raise ValueError("Blind Track B package is not available for this run")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    case_bytes = case_path.read_bytes()
    manifest_keys = {
        "schemaVersion",
        "packageType",
        "benchmarkVersion",
        "sourceBenchmarkVersion",
        "runtimeCorrectionSha256",
        "caseId",
        "runId",
        "payload",
        "payloadSha256",
    }
    if set(manifest) != manifest_keys:
        raise ValueError("Blind package manifest schema mismatch")
    if (
        manifest["packageType"] != "LSAA_TRACK_B_BLIND"
        or manifest["caseId"] != case_id
        or manifest["runId"] != run_id
    ):
        raise ValueError("Blind package manifest identity mismatch")
    runtime_manifest = json.loads(RUNTIME_MANIFEST.read_text(encoding="utf-8"))
    if (
        manifest["benchmarkVersion"] != runtime_manifest["benchmarkVersion"]
        or manifest["sourceBenchmarkVersion"] != runtime_manifest["sourceBenchmarkVersion"]
        or manifest["runtimeCorrectionSha256"] != runtime_manifest["runtimeCorrectionSha256"]
    ):
        raise ValueError("Blind package runtime correction provenance mismatch")
    expected_hash = hashlib.sha256(case_bytes).hexdigest()
    if manifest["payload"] != "case.json" or manifest["payloadSha256"] != expected_hash:
        raise ValueError("Blind package hash mismatch")
    payload = json.loads(case_bytes)
    validate_case(payload, case_id, run_id)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--case-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()
    print(create_package(args.case_id, args.run_id, args.output_root))


if __name__ == "__main__":
    main()
