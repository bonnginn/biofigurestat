#!/usr/bin/env python3
"""Deterministically convert the authoritative literature benchmark workbook to runtime JSON."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "benchmark/literature_v1_1/source/LSA_Literature_Benchmark_50_v1_1.xlsx"
DEFAULT_OUTPUT = ROOT / "benchmark/literature_v1_1/runtime"
DEFAULT_CORRECTIONS = ROOT / "benchmark/literature_v1_1/runtime_corrections_v1_1_1.json"
BENCHMARK_VERSION = "LSA50_v1_1"
EXPECTED_SOURCE_SHA256 = "028c6f5639c98bf50e4a6a87c25b04defa1c89ddda8b063624d6746188aa5bf5"
REQUIRED_SHEETS = {
    "Cases",
    "Synthetic_Raw",
    "Gold_Analysis",
    "Researcher_Packets",
    "Paper_Reference",
    "Gold_Metadata",
    "Benchmark_Index_v1_1",
}
TRACK_B_PACKET_FIELDS = (
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
)
TRACK_A_PAPER_FIELDS = (
    "case_id",
    "title",
    "year",
    "journal",
    "doi",
    "article_url",
    "target_figure_or_panel",
    "main_or_supplementary",
    "assay_context",
    "paper_reported_analysis",
    "curated_graph_reference",
    "source_access",
)

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CELL_REF = re.compile(r"([A-Z]+)([0-9]+)")


def column_index(reference: str) -> int:
    match = CELL_REF.fullmatch(reference)
    if not match:
        raise ValueError(f"Invalid cell reference: {reference}")
    result = 0
    for character in match.group(1):
        result = result * 26 + ord(character) - ord("A") + 1
    return result - 1


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")) for item in root]


def cell_value(cell: ET.Element, strings: list[str]) -> Any:
    cell_type = cell.get("t")
    value_node = cell.find(f"{{{MAIN_NS}}}v")
    inline = cell.find(f"{{{MAIN_NS}}}is")
    if inline is not None:
        return "".join(node.text or "" for node in inline.iter(f"{{{MAIN_NS}}}t"))
    if value_node is None or value_node.text is None:
        return None
    raw = value_node.text
    if cell_type == "s":
        return strings[int(raw)]
    if cell_type == "b":
        return raw == "1"
    if cell_type in {"str", "e"}:
        return raw
    number = float(raw)
    return int(number) if number.is_integer() else number


def read_workbook(path: Path) -> dict[str, list[dict[str, Any]]]:
    with zipfile.ZipFile(path) as archive:
        strings = shared_strings(archive)
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            relationship.get("Id"): relationship.get("Target")
            for relationship in relationships.findall(f"{{{PKG_REL_NS}}}Relationship")
        }
        tables: dict[str, list[dict[str, Any]]] = {}
        sheet_nodes = workbook.find(f"{{{MAIN_NS}}}sheets")
        for sheet in sheet_nodes if sheet_nodes is not None else []:
            name = sheet.get("name")
            relationship_id = sheet.get(f"{{{REL_NS}}}id")
            target = targets.get(relationship_id)
            if not name or not target:
                continue
            normalized_target = target.lstrip("/")
            sheet_path = normalized_target if normalized_target.startswith("xl/") else "xl/" + normalized_target
            root = ET.fromstring(archive.read(sheet_path))
            rows: list[list[Any]] = []
            for row in root.findall(f".//{{{MAIN_NS}}}sheetData/{{{MAIN_NS}}}row"):
                values: list[Any] = []
                for cell in row.findall(f"{{{MAIN_NS}}}c"):
                    reference = cell.get("r") or ""
                    index = column_index(reference)
                    values.extend([None] * (index + 1 - len(values)))
                    values[index] = cell_value(cell, strings)
                rows.append(values)
            if not rows or name not in REQUIRED_SHEETS:
                continue
            headers = [str(value) if value is not None else "" for value in rows[0]]
            tables[name] = [
                dict(zip(headers, values + [None] * (len(headers) - len(values)), strict=False))
                for values in rows[1:]
                if values and values[0] is not None
            ]
    missing = REQUIRED_SHEETS - tables.keys()
    if missing:
        raise ValueError(f"Workbook is missing required sheets: {', '.join(sorted(missing))}")
    return tables


def select(record: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    return {field: record.get(field) for field in fields}


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Runtime JSON is historically CRLF in this Windows-authored benchmark tree.
    with path.open("w", encoding="utf-8", newline="\r\n") as handle:
        handle.write(json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True) + "\n")


def install_generated_runtime(temporary: Path, output: Path) -> None:
    """Install generated files without deleting the live runtime tree first."""
    generated = {
        path.relative_to(temporary)
        for path in temporary.rglob("*")
        if path.is_file()
    }
    existing = (
        {
            path.relative_to(output)
            for path in output.rglob("*")
            if path.is_file()
        }
        if output.exists()
        else set()
    )
    unexpected = existing - generated
    if unexpected:
        names = ", ".join(str(path) for path in sorted(unexpected))
        raise ValueError(f"Refusing to remove unexpected runtime files: {names}")

    output.mkdir(parents=True, exist_ok=True)
    for relative_path in sorted(generated):
        source_path = temporary / relative_path
        destination_path = output / relative_path
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, destination_path)

    shutil.rmtree(temporary)


def load_corrections(path: Path, source_hash: str) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if (
        not isinstance(payload, dict)
        or payload.get("schemaVersion") != "1.0.0"
        or payload.get("sourceSha256") != source_hash
        or not isinstance(payload.get("cases"), dict)
    ):
        raise ValueError("Literature runtime correction metadata is invalid")
    required_provenance = {
        "originalStructure", "correctedRuntimeStructure", "scientificReason",
        "sourceEvidence", "sourceFields", "oldBiologicalN", "correctedBiologicalN",
        "oldAnalysisLevel", "correctedAnalysisLevel", "goldAnalysisChanges",
        "correctionVersion",
    }
    for case_id, correction in payload["cases"].items():
        missing = required_provenance - correction.keys()
        if missing or correction.get("correctionVersion") != payload.get("correctionVersion"):
            raise ValueError(f"{case_id}: incomplete runtime correction provenance: {sorted(missing)}")
    return payload


def apply_case_correction(
    case_id: str,
    correction: dict[str, Any] | None,
    *,
    case: dict[str, Any],
    packet: dict[str, Any],
    gold_analysis: dict[str, Any],
    gold_metadata: dict[str, Any],
    benchmark_index: dict[str, Any],
    synthetic: list[dict[str, Any]],
) -> None:
    if correction is None:
        return
    retain = correction.get("retainExperimentIds")
    if retain is not None:
        if not isinstance(retain, list) or not retain or not all(isinstance(value, str) for value in retain):
            raise ValueError(f"{case_id}: invalid retained experiment IDs")
        synthetic[:] = [row for row in synthetic if row.get("experiment_id") in retain]
        if not synthetic:
            raise ValueError(f"{case_id}: hierarchy correction removed every synthetic row")
    parent_source = correction.get("rowParentFrom")
    if parent_source is not None:
        if parent_source not in {"experiment_id", "unit_id"}:
            raise ValueError(f"{case_id}: unsupported hierarchy correction source")
        for row in synthetic:
            parent = row.get(parent_source)
            if not isinstance(parent, str) or not parent:
                raise ValueError(f"{case_id}: hierarchy correction parent is missing")
            row["parent_unit_id"] = parent
    unit_source = correction.get("rowUnitFrom")
    if unit_source is not None:
        if unit_source not in {"experiment_id"}:
            raise ValueError(f"{case_id}: unsupported unit identity correction source")
        for row in synthetic:
            row["unit_id"] = row[unit_source]
    experiment_template = correction.get("rewriteExperimentIdTemplate")
    if experiment_template is not None:
        if not isinstance(experiment_template, str):
            raise ValueError(f"{case_id}: invalid experiment identity template")
        for row in synthetic:
            try:
                row["experiment_id"] = experiment_template.format(**row)
            except KeyError as error:
                raise ValueError(f"{case_id}: experiment identity template field is missing") from error
    for target, key in (
        (case, "caseOverrides"),
        (packet, "researcherPacketOverrides"),
        (gold_analysis, "goldAnalysisOverrides"),
        (gold_metadata, "goldMetadataOverrides"),
        (benchmark_index, "benchmarkIndexOverrides"),
    ):
        overrides = correction.get(key, {})
        if not isinstance(overrides, dict) or any(field not in target for field in overrides):
            raise ValueError(f"{case_id}: correction contains an unknown {key} field")
        target.update(overrides)


def convert(
    source: Path, output: Path, corrections_path: Path = DEFAULT_CORRECTIONS
) -> dict[str, Any]:
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    if source_hash != EXPECTED_SOURCE_SHA256:
        raise ValueError(f"Unexpected source workbook SHA-256: {source_hash}")
    tables = read_workbook(source)
    corrections = load_corrections(corrections_path, source_hash)
    cases = tables["Cases"]
    case_ids = [record["case_id"] for record in cases]
    if len(case_ids) != 50 or len(set(case_ids)) != 50:
        raise ValueError("Literature benchmark must contain exactly 50 unique case IDs")

    indexed = {
        name: {record["case_id"]: record for record in records}
        for name, records in tables.items()
        if name != "Synthetic_Raw"
    }
    raw_by_case: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in tables["Synthetic_Raw"]:
        raw_by_case[record["case_id"]].append(record)
    for name, records in indexed.items():
        if set(records) != set(case_ids):
            raise ValueError(f"Case IDs in {name} do not match Cases")
    if set(raw_by_case) != set(case_ids):
        raise ValueError("Case IDs in Synthetic_Raw do not match Cases")

    temporary = output.with_name(f".{output.name}.tmp")
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir(parents=True)
    public_cases = []
    for case_id in sorted(case_ids):
        case = dict(indexed["Cases"][case_id])
        packet_source = dict(indexed["Researcher_Packets"][case_id])
        gold_analysis = dict(indexed["Gold_Analysis"][case_id])
        gold_metadata = dict(indexed["Gold_Metadata"][case_id])
        benchmark_index = dict(indexed["Benchmark_Index_v1_1"][case_id])
        synthetic = [dict(row) for row in raw_by_case[case_id]]
        correction = corrections["cases"].get(case_id)
        apply_case_correction(
            case_id,
            correction,
            case=case,
            packet=packet_source,
            gold_analysis=gold_analysis,
            gold_metadata=gold_metadata,
            benchmark_index=benchmark_index,
            synthetic=synthetic,
        )
        packet = select(packet_source, TRACK_B_PACKET_FIELDS)
        paper = select(indexed["Paper_Reference"][case_id], TRACK_A_PAPER_FIELDS)
        excluded = bool(correction and correction.get("excludeFromAutomatedScoring"))
        if not excluded:
            public_cases.append({"caseId": case_id})
        case_dir = temporary / "cases" / case_id
        write_json(
            case_dir / "experimenter_track_b.json",
            {"benchmarkVersion": corrections["correctionVersion"], "sourceBenchmarkVersion": BENCHMARK_VERSION, "caseId": case_id, "researcherPacket": packet, "syntheticData": synthetic},
        )
        write_json(
            case_dir / "experimenter_track_a.json",
            {"benchmarkVersion": corrections["correctionVersion"], "sourceBenchmarkVersion": BENCHMARK_VERSION, "caseId": case_id, "researcherPacket": packet, "paperReference": paper, "syntheticData": synthetic},
        )
        write_json(
            case_dir / "reviewer.json",
            {"benchmarkVersion": corrections["correctionVersion"], "sourceBenchmarkVersion": BENCHMARK_VERSION, "caseId": case_id, "researcherPacket": packet, "paperReference": paper},
        )
        write_json(
            case_dir / "integrator.json",
            {
                "benchmarkVersion": corrections["correctionVersion"],
                "sourceBenchmarkVersion": BENCHMARK_VERSION,
                "caseId": case_id,
                "case": case,
                "researcherPacketSource": packet_source,
                "paperReference": indexed["Paper_Reference"][case_id],
                "goldAnalysis": gold_analysis,
                "goldMetadata": gold_metadata,
                "benchmarkIndex": benchmark_index,
                "syntheticData": synthetic,
                "runtimeHierarchyCorrection": correction,
                "excludedFromAutomatedScoring": excluded,
            },
        )
    runtime_row_count = sum(
        len(json.loads((temporary / "cases" / case_id / "integrator.json").read_text(encoding="utf-8"))["syntheticData"])
        for case_id in case_ids
    )
    excluded_cases = sorted(
        case_id for case_id, correction in corrections["cases"].items()
        if correction.get("excludeFromAutomatedScoring")
    )
    write_json(temporary / "public_index.json", {"benchmarkVersion": corrections["correctionVersion"], "sourceBenchmarkVersion": BENCHMARK_VERSION, "cases": public_cases})
    manifest = {
        "benchmarkVersion": corrections["correctionVersion"],
        "sourceBenchmarkVersion": BENCHMARK_VERSION,
        "caseCount": len(case_ids),
        "scorableCaseCount": len(case_ids) - len(excluded_cases),
        "syntheticRowCount": runtime_row_count,
        "sourceSyntheticRowCount": len(tables["Synthetic_Raw"]),
        "runtimeSyntheticRowCount": runtime_row_count,
        "sourceFile": source.name,
        "sourceSha256": source_hash,
        "runtimeCorrectionFile": corrections_path.name,
        "runtimeCorrectionSha256": hashlib.sha256(corrections_path.read_bytes()).hexdigest(),
        "runtimeCorrectionVersion": corrections["correctionVersion"],
        "correctedCases": sorted(corrections["cases"]),
        "excludedCases": excluded_cases,
        "trackBExcludedSourceFields": [
            "coverage_tier", "scope_expectation", "synthetic_seed", "synthetic_data_location", "blind_packet_rule",
        ],
    }
    write_json(temporary / "manifest.json", manifest)
    install_generated_runtime(temporary, output)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--corrections", type=Path, default=DEFAULT_CORRECTIONS)
    args = parser.parse_args()
    print(
        json.dumps(
            convert(args.source.resolve(), args.output.resolve(), args.corrections.resolve()),
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
