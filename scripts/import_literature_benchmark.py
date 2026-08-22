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
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def convert(source: Path, output: Path) -> dict[str, Any]:
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    if source_hash != EXPECTED_SOURCE_SHA256:
        raise ValueError(f"Unexpected source workbook SHA-256: {source_hash}")
    tables = read_workbook(source)
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
        packet = select(indexed["Researcher_Packets"][case_id], TRACK_B_PACKET_FIELDS)
        paper = select(indexed["Paper_Reference"][case_id], TRACK_A_PAPER_FIELDS)
        synthetic = raw_by_case[case_id]
        public_cases.append({"caseId": case_id})
        case_dir = temporary / "cases" / case_id
        write_json(
            case_dir / "experimenter_track_b.json",
            {"benchmarkVersion": BENCHMARK_VERSION, "caseId": case_id, "researcherPacket": packet, "syntheticData": synthetic},
        )
        write_json(
            case_dir / "experimenter_track_a.json",
            {"benchmarkVersion": BENCHMARK_VERSION, "caseId": case_id, "researcherPacket": packet, "paperReference": paper, "syntheticData": synthetic},
        )
        write_json(
            case_dir / "reviewer.json",
            {"benchmarkVersion": BENCHMARK_VERSION, "caseId": case_id, "researcherPacket": packet, "paperReference": paper},
        )
        write_json(
            case_dir / "integrator.json",
            {
                "benchmarkVersion": BENCHMARK_VERSION,
                "caseId": case_id,
                "case": indexed["Cases"][case_id],
                "researcherPacketSource": indexed["Researcher_Packets"][case_id],
                "paperReference": indexed["Paper_Reference"][case_id],
                "goldAnalysis": indexed["Gold_Analysis"][case_id],
                "goldMetadata": indexed["Gold_Metadata"][case_id],
                "benchmarkIndex": indexed["Benchmark_Index_v1_1"][case_id],
                "syntheticData": synthetic,
            },
        )
    write_json(temporary / "public_index.json", {"benchmarkVersion": BENCHMARK_VERSION, "cases": public_cases})
    manifest = {
        "benchmarkVersion": BENCHMARK_VERSION,
        "caseCount": len(case_ids),
        "syntheticRowCount": len(tables["Synthetic_Raw"]),
        "sourceFile": source.name,
        "sourceSha256": source_hash,
        "trackBExcludedSourceFields": [
            "coverage_tier", "scope_expectation", "synthetic_seed", "synthetic_data_location", "blind_packet_rule",
        ],
    }
    write_json(temporary / "manifest.json", manifest)
    if output.exists():
        shutil.rmtree(output)
    temporary.replace(output)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    print(json.dumps(convert(args.source.resolve(), args.output.resolve()), indent=2))


if __name__ == "__main__":
    main()
