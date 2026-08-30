#!/usr/bin/env python3
"""Build the expanded trusted runtime from repaired Master and verified Track B sources."""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
from typing import Any

from import_literature_benchmark import install_generated_runtime, read_workbook, write_json


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "benchmark/literature_v2_1/source"
DEFAULT_MASTER = SOURCE_ROOT / "LSA_Literature_Benchmark_495_v2_1_Repaired_Master.xlsx"
DEFAULT_TRACK_B = SOURCE_ROOT / "LSA_Literature_Benchmark_490_v2_1_TrackB.xlsx"
DEFAULT_TRACK_B_MANIFEST = SOURCE_ROOT / "LSA_Literature_Benchmark_490_v2_1_TrackB.sha256_manifest.json"
DEFAULT_OUTPUT = ROOT / "benchmark/literature_v2_1/runtime"
V1_RUNTIME = ROOT / "benchmark/literature_v1_1/runtime/cases"
BENCHMARK_VERSION = "LSA495_v2_1_repaired_1"
SOURCE_BENCHMARK_VERSION = "LSA495_v2_1"
MASTER_SHA256 = "e9c0fb3881191d450fdd04c13f7eb57c64448d3606c3c9024a71879b9bdb9dee"
TRACK_B_SHA256 = "99c20f4ceb30632a6b390e54cef7c154fae43788cd721420dd7a26be99322715"

MASTER_SHEETS = {
    "Cases",
    "Paper_Reference",
    "Expansion_Cases",
    "Expansion_Paper_Reference",
    "Expansion_Gold_Metadata",
    "Expansion_Gold_Analysis",
    "Benchmark_Index_All",
    "Hierarchy_QC_v2_1",
    "Correction_Provenance_v2_1",
}
TRACK_B_SHEETS = {"Researcher_Packets", "Synthetic_Raw", "Case_Index", "Leakage_QC"}
PACKET_FIELDS = (
    "case_id",
    "blind_experiment_summary",
    "measurement_context",
    "biological_question",
    "conditions",
    "timepoints",
    "readouts",
    "experimental_unit_description",
    "independent_session_count",
    "repeated_identity_note",
    "nested_observation_note",
    "missingness_note",
)
ROW_FIELDS = (
    "case_id",
    "experiment_id",
    "unit_id",
    "parent_unit_id",
    "observation_id",
    "condition",
    "time",
    "time_unit",
    "readout",
    "value",
    "numerator",
    "denominator",
    "x_value",
    "event",
    "missingness_state",
    "technical_replicate_id",
    "synthetic",
    "seed",
)


def indexed(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result = {str(record["case_id"]): record for record in records}
    if len(result) != len(records):
        raise ValueError("Case table contains duplicate identities")
    return result


def packet_from_safe(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "case_id": row["case_id"],
        "blind_experiment_summary": row["blind_experiment_summary"],
        "measurement_context": row["measurement_context"],
        "biological_question": row.get("biological_question"),
        "conditions": row["conditions"],
        "timepoints": row["time_structure"],
        "readouts": row["readouts"],
        "experimental_unit_description": row["experimental_unit_description"],
        "independent_session_count": row["independent_session_count"],
        "repeated_identity_note": row["repeated_identity_note"],
        "nested_observation_note": row["nested_observation_note"],
        "missingness_note": row.get("missingness_note"),
    }


def synthetic_from_safe(row: dict[str, Any]) -> dict[str, Any]:
    result = {
        "case_id": row["case_id"],
        "experiment_id": row["experiment_id"],
        "unit_id": row["biological_unit_id"],
        "parent_unit_id": row.get("parent_unit_id"),
        "observation_id": row.get("observation_id"),
        "condition": row["condition"],
        "time": row.get("time"),
        "time_unit": row.get("time_unit"),
        "readout": row["readout"],
        "value": row.get("value"),
        "numerator": row.get("numerator"),
        "denominator": row.get("denominator"),
        "x_value": row.get("x_value"),
        "event": row.get("event"),
        "missingness_state": row.get("missingness_state") or "observed",
        "technical_replicate_id": row.get("technical_replicate_id"),
        "synthetic": row["synthetic"],
        "seed": row["seed"],
    }
    if tuple(result) != ROW_FIELDS:
        raise AssertionError("Expanded runtime row ordering changed")
    return result


def source_hash(path: Path, expected: str, label: str) -> str:
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f"Unexpected {label} SHA-256: {actual}")
    return actual


def convert(
    master_path: Path,
    track_b_path: Path,
    track_b_manifest_path: Path,
    output: Path,
) -> dict[str, Any]:
    master_hash = source_hash(master_path, MASTER_SHA256, "repaired Master")
    track_b_hash = source_hash(track_b_path, TRACK_B_SHA256, "Track B workbook")
    track_b_manifest = json.loads(track_b_manifest_path.read_text(encoding="utf-8"))
    if (
        track_b_manifest.get("output", {}).get("sha256") != track_b_hash
        or track_b_manifest.get("authoritative_source", {}).get("sha256") != master_hash
        or any(value != "PASS" for value in track_b_manifest.get("checks", {}).values())
    ):
        raise ValueError("Track B workbook validation manifest is invalid")

    master = read_workbook(master_path, MASTER_SHEETS)
    safe = read_workbook(track_b_path, TRACK_B_SHEETS)
    hierarchy = indexed(master["Hierarchy_QC_v2_1"])
    index_all = indexed(master["Benchmark_Index_All"])
    safe_index = indexed(safe["Case_Index"])
    safe_packets = indexed(safe["Researcher_Packets"])
    safe_leakage = indexed(safe["Leakage_QC"])
    all_ids = set(index_all)
    if set(hierarchy) != all_ids or set(safe_index) != all_ids or set(safe_leakage) != all_ids:
        raise ValueError("Expanded Master and Track B identities differ")
    scorable = {
        case_id
        for case_id, row in hierarchy.items()
        if row["status"] == "HIERARCHY_PASS" and row["scoring_eligibility"] == "scorable"
    }
    excluded = all_ids - scorable
    if set(safe_packets) != scorable or (len(scorable), len(excluded)) != (490, 5):
        raise ValueError("Track B package availability does not match hierarchy acceptance")
    for case_id, row in safe_leakage.items():
        if row["overall"] != "PASS" or row["scoring_eligibility"] != safe_index[case_id]["scoring_eligibility"]:
            raise ValueError(f"{case_id}: Track B leakage/scoring status mismatch")

    raw_by_case: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in safe["Synthetic_Raw"]:
        raw_by_case[str(row["case_id"])].append(synthetic_from_safe(row))
    if set(raw_by_case) != scorable:
        raise ValueError("Track B synthetic identities do not match scorable cases")
    for case_id in scorable:
        if len(raw_by_case[case_id]) != int(safe_index[case_id]["synthetic_rows"]):
            raise ValueError(f"{case_id}: Track B synthetic row count mismatch")

    original_cases = indexed(master["Cases"])
    expansion_cases = indexed(master["Expansion_Cases"])
    original_paper = indexed(master["Paper_Reference"])
    expansion_paper = indexed(master["Expansion_Paper_Reference"])
    expansion_gold_metadata = indexed(master["Expansion_Gold_Metadata"])
    expansion_gold_analysis = indexed(master["Expansion_Gold_Analysis"])
    corrections = master["Correction_Provenance_v2_1"]

    temporary = output.with_name(f".{output.name}.tmp")
    if temporary.exists():
        import shutil

        shutil.rmtree(temporary)
    temporary.mkdir(parents=True)
    public_cases = []
    for case_id in sorted(all_ids):
        case_dir = temporary / "cases" / case_id
        case_dir.mkdir(parents=True)
        excluded_case = case_id in excluded
        packet = packet_from_safe(safe_packets[case_id]) if not excluded_case else None
        synthetic = raw_by_case.get(case_id, [])
        if case_id in expansion_cases:
            case = expansion_cases[case_id]
            paper = expansion_paper[case_id]
            gold_analysis = expansion_gold_analysis[case_id]
            gold_metadata = expansion_gold_metadata[case_id]
            prior_integrator = None
        else:
            case = original_cases[case_id]
            paper = original_paper[case_id]
            prior_path = V1_RUNTIME / case_id / "integrator.json"
            if not prior_path.is_file():
                raise ValueError(f"{case_id}: corrected v1.1 integrator source is missing")
            prior_integrator = json.loads(prior_path.read_text(encoding="utf-8"))
            gold_analysis = prior_integrator["goldAnalysis"]
            gold_metadata = prior_integrator["goldMetadata"]

        integrator = {
            "benchmarkVersion": BENCHMARK_VERSION,
            "sourceBenchmarkVersion": SOURCE_BENCHMARK_VERSION,
            "caseId": case_id,
            "case": case,
            "researcherPacketSource": packet,
            "paperReference": paper,
            "goldAnalysis": gold_analysis,
            "goldMetadata": gold_metadata,
            "benchmarkIndex": index_all[case_id],
            "syntheticData": synthetic,
            "hierarchyAcceptance": hierarchy[case_id],
            "runtimeHierarchyCorrection": (
                prior_integrator.get("runtimeHierarchyCorrection") if prior_integrator else None
            ),
            "excludedFromAutomatedScoring": excluded_case,
            "expandedCorrectionVersion": BENCHMARK_VERSION,
        }
        write_json(case_dir / "integrator.json", integrator)
        if excluded_case:
            continue
        public_cases.append({"caseId": case_id})
        write_json(
            case_dir / "experimenter_track_b.json",
            {
                "benchmarkVersion": BENCHMARK_VERSION,
                "sourceBenchmarkVersion": SOURCE_BENCHMARK_VERSION,
                "caseId": case_id,
                "researcherPacket": packet,
                "syntheticData": synthetic,
            },
        )
        write_json(
            case_dir / "experimenter_track_a.json",
            {
                "benchmarkVersion": BENCHMARK_VERSION,
                "sourceBenchmarkVersion": SOURCE_BENCHMARK_VERSION,
                "caseId": case_id,
                "researcherPacket": packet,
                "paperReference": paper,
                "syntheticData": synthetic,
            },
        )
        write_json(
            case_dir / "reviewer.json",
            {
                "benchmarkVersion": BENCHMARK_VERSION,
                "sourceBenchmarkVersion": SOURCE_BENCHMARK_VERSION,
                "caseId": case_id,
                "researcherPacket": packet,
                "paperReference": paper,
            },
        )

    runtime_synthetic_rows = sum(len(rows) for rows in raw_by_case.values())
    if runtime_synthetic_rows != 28015:
        raise ValueError("Expanded runtime synthetic row total changed")
    write_json(
        temporary / "public_index.json",
        {"benchmarkVersion": BENCHMARK_VERSION, "cases": public_cases},
    )
    manifest = {
        "schemaVersion": "2.0.0",
        "benchmarkVersion": BENCHMARK_VERSION,
        "sourceBenchmarkVersion": SOURCE_BENCHMARK_VERSION,
        "caseCount": 495,
        "scorableCaseCount": 490,
        "syntheticRowCount": runtime_synthetic_rows,
        "sourceFile": master_path.name,
        "sourceSha256": master_hash,
        "trackBSourceFile": track_b_path.name,
        "trackBSourceSha256": track_b_hash,
        "trackBValidationManifest": track_b_manifest_path.name,
        "trackBValidationManifestSha256": hashlib.sha256(
            track_b_manifest_path.read_bytes()
        ).hexdigest(),
        "packetSchemaVersion": "2.0.0",
        "rowSchemaVersion": "2.0.0",
        "packetFields": list(PACKET_FIELDS),
        "rowFields": list(ROW_FIELDS),
        "excludedCases": sorted(excluded),
        "expandedCorrectionProvenanceCount": len(corrections),
        "trackBExcludedSourceFields": [
            "Paper_Reference",
            "Gold_Metadata",
            "Gold_Analysis",
            "paper_graph_family",
            "paper_statistical_method",
            "expected_decision",
            "reference_p_value",
            "acceptable_graph_families",
            "acceptable_statistical_families",
        ],
    }
    write_json(temporary / "manifest.json", manifest)
    install_generated_runtime(temporary, output)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", type=Path, default=DEFAULT_MASTER)
    parser.add_argument("--track-b", type=Path, default=DEFAULT_TRACK_B)
    parser.add_argument("--track-b-manifest", type=Path, default=DEFAULT_TRACK_B_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    manifest = convert(
        args.master.resolve(),
        args.track_b.resolve(),
        args.track_b_manifest.resolve(),
        args.output.resolve(),
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
