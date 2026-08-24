#!/usr/bin/env python3
"""Convert the personal published-Figure benchmark workbooks to runtime JSON."""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
from pathlib import Path
import shutil
from typing import Any

try:
    from .import_literature_benchmark import install_generated_runtime, read_workbook, write_json
except ImportError:  # Direct script execution.
    from import_literature_benchmark import install_generated_runtime, read_workbook, write_json


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "benchmark/personal_figure_v1/source"
DEFAULT_MASTER = SOURCE_ROOT / "LSA_Personal_Figure_Benchmark_v1_Master.xlsx"
DEFAULT_TRACK_B = SOURCE_ROOT / "LSA_Personal_Figure_Benchmark_v1_TrackB.xlsx"
DEFAULT_OUTPUT = ROOT / "benchmark/personal_figure_v1/runtime"
BENCHMARK_VERSION = "LSA_PERSONAL_FIGURE_v1_0"
MASTER_SHA256 = "d2b1c3ca48e9d9a38ac5e81e98fb1b2052bb924b3dccac254737f1e62090b760"
TRACK_B_SHA256 = "c4da43b97c76b8e91e14b09f6f1abf7e743f562a3820904cafd86757b6ff1846"
MASTER_SHEETS = {
    "Case_Inventory",
    "Researcher_Packets",
    "Paper_Reference",
    "Gold_Metadata",
    "Raw_Data",
    "Gold_Analysis",
    "Gold_Comparisons",
    "Gold_Figure_Metadata",
    "Source_Asset_Index",
    "Excluded_Panels",
    "QC",
}
TRACK_B_SHEETS = {"Researcher_Packets", "Raw_Data", "Case_Index", "Leakage_QC"}


def indexed(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result = {str(record["case_id"]): record for record in records}
    if len(result) != len(records):
        raise ValueError("Personal benchmark contains duplicate case identities")
    return result


def source_hash(path: Path, expected: str, label: str) -> str:
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f"Unexpected {label} SHA-256: {actual}")
    return actual


def packet_from_track_b(row: dict[str, Any]) -> dict[str, Any]:
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
        "missingness_note": None,
    }


def synthetic_from_track_b(row: dict[str, Any]) -> dict[str, Any]:
    return {
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
        "x_value": None,
        "event": None,
        "missingness_state": row.get("missingness_state") or "observed",
        "technical_replicate_id": row.get("technical_replicate_id"),
        "synthetic": row["synthetic"],
        "seed": row["seed"],
    }


def normalize_independent_unit_identity(
    rows: list[dict[str, Any]], packet: dict[str, Any]
) -> list[dict[str, Any]]:
    """Prevent workbook-local row labels from implying cross-condition pairing."""
    if not str(packet["repeated_identity_note"]).lower().startswith(
        "no repeated identity"
    ):
        return rows
    normalized_rows: list[dict[str, Any]] = []
    for row in rows:
        condition = str(row["condition"])
        condition_token = hashlib.sha256(condition.encode("utf-8")).hexdigest()[:12]
        normalized = {
            **row,
            "unit_id": f"condition.{condition_token}:{row['unit_id']}",
        }
        if row.get("parent_unit_id") is not None:
            normalized["parent_unit_id"] = (
                f"condition.{condition_token}:{row['parent_unit_id']}"
            )
        normalized_rows.append(normalized)
    return normalized_rows


def paper_reference(row: dict[str, Any]) -> dict[str, Any]:
    graph_reference = (
        f'{row["paper_graph_family"]}; {row["comparison_structure"]}; '
        f'{row["relevant_n_definition"]}'
    )
    return {
        "title": row["publication"],
        "doi": row["doi"],
        "article_url": row["article_url"],
        "target_figure_or_panel": row["figure_panel"],
        "paper_reported_analysis": row["paper_statistical_method"],
        "curated_graph_reference": graph_reference,
    }


def convert(master_path: Path, track_b_path: Path, output: Path) -> dict[str, Any]:
    master_hash = source_hash(master_path, MASTER_SHA256, "personal Master")
    track_b_hash = source_hash(track_b_path, TRACK_B_SHA256, "personal Track B")
    master = read_workbook(master_path, MASTER_SHEETS)
    safe = read_workbook(track_b_path, TRACK_B_SHEETS)

    case_inventory = indexed(master["Case_Inventory"])
    case_ids = set(case_inventory)
    if len(case_ids) != 69 or case_ids != {f"PFR{index:03d}" for index in range(1, 70)}:
        raise ValueError("Personal benchmark must contain PFR001-PFR069 exactly once")

    master_indexed = {
        name: indexed(records)
        for name, records in master.items()
        if name
        not in {"Raw_Data", "Gold_Comparisons", "Source_Asset_Index", "Excluded_Panels"}
    }
    safe_indexed = {
        name: indexed(records) for name, records in safe.items() if name != "Raw_Data"
    }
    for name, records in {**master_indexed, **safe_indexed}.items():
        if set(records) != case_ids:
            raise ValueError(f"Case IDs in {name} do not match Case_Inventory")
    if any(row.get("overall") != "PASS" for row in master["QC"]):
        raise ValueError("Personal benchmark QC is not fully passing")
    if any(row.get("overall") != "PASS" for row in safe["Leakage_QC"]):
        raise ValueError("Personal Track B leakage QC is not fully passing")

    raw_by_case: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in safe["Raw_Data"]:
        raw_by_case[str(row["case_id"])].append(synthetic_from_track_b(row))
    if set(raw_by_case) != case_ids:
        raise ValueError("Track B raw-data identities do not match Case_Inventory")
    comparison_by_case: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in master["Gold_Comparisons"]:
        comparison_by_case[str(row["case_id"])].append(row)

    temporary = output.with_name(f".{output.name}.tmp")
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir(parents=True)

    public_cases = []
    for case_id in sorted(case_ids):
        packet_source = safe_indexed["Researcher_Packets"][case_id]
        packet = packet_from_track_b(packet_source)
        paper = paper_reference(master_indexed["Paper_Reference"][case_id])
        synthetic = normalize_independent_unit_identity(raw_by_case[case_id], packet)
        expected_rows = int(safe_indexed["Case_Index"][case_id]["raw_data_rows"])
        if len(synthetic) != expected_rows:
            raise ValueError(f"{case_id}: Track B row count differs from Case_Index")
        case_dir = temporary / "cases" / case_id
        track_b = {
            "benchmarkVersion": BENCHMARK_VERSION,
            "caseId": case_id,
            "researcherPacket": packet,
            "syntheticData": synthetic,
        }
        track_a = {**track_b, "paperReference": paper}
        write_json(case_dir / "experimenter_track_b.json", track_b)
        write_json(case_dir / "experimenter_track_a.json", track_a)
        write_json(
            case_dir / "reviewer.json",
            {
                "benchmarkVersion": BENCHMARK_VERSION,
                "caseId": case_id,
                "case": case_inventory[case_id],
                "paperReference": master_indexed["Paper_Reference"][case_id],
                "goldMetadata": master_indexed["Gold_Metadata"][case_id],
                "goldAnalysis": master_indexed["Gold_Analysis"][case_id],
                "goldComparisons": comparison_by_case[case_id],
                "goldFigureMetadata": master_indexed["Gold_Figure_Metadata"][case_id],
            },
        )
        write_json(
            case_dir / "integrator.json",
            {
                "benchmarkVersion": BENCHMARK_VERSION,
                "caseId": case_id,
                "case": case_inventory[case_id],
                "researcherPacketSource": packet_source,
                "researcherPacket": packet,
                "paperReference": master_indexed["Paper_Reference"][case_id],
                "goldMetadata": master_indexed["Gold_Metadata"][case_id],
                "goldAnalysis": master_indexed["Gold_Analysis"][case_id],
                "goldComparisons": comparison_by_case[case_id],
                "goldFigureMetadata": master_indexed["Gold_Figure_Metadata"][case_id],
                "syntheticData": synthetic,
            },
        )
        public_cases.append({"caseId": case_id})

    write_json(temporary / "index.json", {"cases": public_cases})
    manifest = {
        "benchmarkVersion": BENCHMARK_VERSION,
        "caseCount": len(case_ids),
        "rawRowCount": sum(len(rows) for rows in raw_by_case.values()),
        "masterSha256": master_hash,
        "trackBSha256": track_b_hash,
        "provenance": "SYNTHETIC_RECONSTRUCTION",
        "identityNormalization": (
            "Condition-qualified runtime unit IDs are used when the researcher packet explicitly "
            "states that no repeated identity is implied across conditions or time."
        ),
    }
    write_json(temporary / "manifest.json", manifest)
    install_generated_runtime(temporary, output)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", type=Path, default=DEFAULT_MASTER)
    parser.add_argument("--track-b", type=Path, default=DEFAULT_TRACK_B)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    print(convert(args.master.resolve(), args.track_b.resolve(), args.output.resolve()))


if __name__ == "__main__":
    main()
