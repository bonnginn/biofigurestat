#!/usr/bin/env python3
"""Audit packet -> synthetic hierarchy -> loader statistical-unit contracts."""

from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "benchmark/literature_v1_1/runtime/cases"
FROZEN = ROOT / "benchmark/literature_v1_1/preflight_15_fixtures.json"

PASS = "HIERARCHY_PASS"
AMBIGUOUS = "HIERARCHY_AMBIGUOUS"
CONFLICT = "HIERARCHY_CONFLICT"
NOT_APPLICABLE = "NOT_APPLICABLE"
EXCLUDED = "HIERARCHY_EXCLUDED"


def _group_counts(rows: list[dict[str, Any]], unit_field: str) -> dict[str, int]:
    grouped: dict[str, set[str]] = collections.defaultdict(set)
    for row in rows:
        key = " | ".join(
            str(value)
            for value in (row["condition"], row.get("time"), row["readout"])
        )
        if unit_field == "experiment_condition":
            unit = f'{row["condition"]}:{row["experiment_id"]}'
        else:
            unit = str(row[unit_field])
        grouped[key].add(unit)
    return dict(sorted((key, len(value)) for key, value in grouped.items()))


def _uniform_n(counts: dict[str, int]) -> int | dict[str, int]:
    values = set(counts.values())
    return next(iter(values)) if len(values) == 1 else counts


def audit_payload(payload: dict[str, Any]) -> dict[str, Any]:
    case_id = payload["caseId"]
    packet = payload["researcherPacketSource"]
    rows = payload["syntheticData"]
    design = payload["benchmarkIndex"]["design_class"]
    description = packet["experimental_unit_description"]
    nested_note = packet["nested_observation_note"]
    repeated_note = packet["repeated_identity_note"]
    conditions = {row["condition"] for row in rows}
    times = {row.get("time") for row in rows if row.get("time") is not None}
    readouts = {row["readout"] for row in rows}
    parents = {row.get("parent_unit_id") for row in rows if row.get("parent_unit_id")}
    experiment_ids = {row["experiment_id"] for row in rows}
    issues: list[str] = []
    excluded = bool(payload.get("excludedFromAutomatedScoring"))

    if re.search(r"(?:cell|lower-level)-level observations are nested", nested_note, re.I):
        path = "parent_unit_id"
        if any(not row.get("parent_unit_id") for row in rows):
            issues.append("packet declares nested observations but one or more rows lack parent_unit_id")
        counts = _group_counts(rows, path) if not issues else _group_counts(rows, "unit_id")
    elif design in {"paired", "friedman"} or re.search(
        r"matched.*across (?:paired|multiple) conditions", repeated_note, re.I
    ):
        path = "unit_id_across_conditions"
        counts = _group_counts(rows, "unit_id")
        appearances: dict[str, set[str]] = collections.defaultdict(set)
        for row in rows:
            appearances[row["unit_id"]].add(row["condition"])
        if any(seen != conditions for seen in appearances.values()):
            issues.append("paired identity is incomplete across conditions")
    elif design in {"longitudinal", "repeated_curve"}:
        path = "unit_id_across_time"
        counts = _group_counts(rows, "unit_id")
        appearances: dict[tuple[str, str], set[Any]] = collections.defaultdict(set)
        for row in rows:
            appearances[(row["condition"], row["unit_id"])].add(row.get("time"))
        if any(seen != times for seen in appearances.values()):
            issues.append("longitudinal identity is incomplete across time")
    elif design == "time_independent":
        path = "unit_id_per_condition_time"
        counts = _group_counts(rows, "unit_id")
        unit_times: dict[str, set[Any]] = collections.defaultdict(set)
        for row in rows:
            unit_times[row["unit_id"]].add(row.get("time"))
        if any(len(seen) != 1 for seen in unit_times.values()):
            issues.append("cross-sectional units are falsely shared across time")
    elif len(readouts) > 1:
        unit_readouts: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
        for row in rows:
            unit_readouts[(row["condition"], row["unit_id"])].add(row["readout"])
        if unit_readouts and all(seen == readouts for seen in unit_readouts.values()):
            path = "unit_id_across_readouts"
            counts = _group_counts(rows, "unit_id")
        else:
            path = "experiment_id+condition_across_readouts"
            counts = _group_counts(rows, "experiment_condition")
            completeness: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
            for row in rows:
                completeness[(row["condition"], row["experiment_id"])].add(row["readout"])
            if any(seen != readouts for seen in completeness.values()):
                issues.append("multi-readout biological identity is incomplete")
    else:
        path = "unit_id"
        counts = _group_counts(rows, "unit_id")

    loader_n = _uniform_n(counts)
    status = CONFLICT if issues else PASS
    if isinstance(loader_n, dict):
        issues.append("condition/time/readout cells resolve unequal biological-unit counts")
        status = CONFLICT
    if path == "parent_unit_id":
        orphan_parents = parents - experiment_ids
        if orphan_parents:
            issues.append(f"parent_unit_id values are not declared experiment_id values: {sorted(orphan_parents)}")
            status = CONFLICT
        seen_nested: set[tuple[str, Any, str, str]] = set()
        for row in rows:
            key = (row["condition"], row.get("time"), row["readout"], row["unit_id"])
            if key in seen_nested:
                issues.append("duplicate nested observation identity within an analysis cell")
                status = CONFLICT
                break
            seen_nested.add(key)

    explicit_biological = re.search(r"(?<![>=])\b(\d+) biological replicates", description, re.I)
    if explicit_biological and isinstance(loader_n, int):
        expected = int(explicit_biological.group(1))
        if expected != loader_n:
            issues.append(
                f"packet declares {expected} biological replicates but runtime/loader resolves {loader_n}"
            )
            status = CONFLICT
    if re.search(r"biological triplicates", description, re.I) and isinstance(loader_n, int):
        if loader_n != 3:
            issues.append(f"packet declares biological triplicates but runtime/loader resolves {loader_n}")
            status = CONFLICT
    explicit_independent = re.search(r"n\s*=\s*(\d+) independent", description, re.I)
    if explicit_independent and isinstance(loader_n, int):
        expected = int(explicit_independent.group(1))
        if expected != loader_n:
            issues.append(f"packet declares n={expected} but runtime/loader resolves {loader_n}")
            status = CONFLICT
    if re.search(r"cells?/(?:batch|replicate)|cells? per replicate", description, re.I) and not parents:
        issues.append("packet implies cells nested within batches/replicates but no parent hierarchy exists")
        status = CONFLICT
    if re.search(r"matched regions", description, re.I):
        appearances: dict[str, set[str]] = collections.defaultdict(set)
        for row in rows:
            appearances[row["unit_id"]].add(row["condition"])
        if not appearances or not all(seen == conditions for seen in appearances.values()):
            issues.append("packet declares matched regions but runtime identities are condition-specific")
            status = CONFLICT
    if design == "two_way" and times and "No repeated identity" in repeated_note:
        exp_cells: dict[str, set[tuple[str, Any]]] = collections.defaultdict(set)
        for row in rows:
            exp_cells[row["experiment_id"]].add((row["condition"], row.get("time")))
        if any(len(cells) > 1 for cells in exp_cells.values()):
            issues.append("experiment_id repeats across factor cells while packet disclaims repeated identity")
            status = CONFLICT
    if re.search(r"across biological replicates", description, re.I) and not parents:
        issues.append("packet does not say whether each row is a replicate summary or a nested observation")
        status = AMBIGUOUS

    if isinstance(loader_n, int):
        packet_n: int | str = loader_n
        gold_n: int | str = loader_n
    else:
        packet_n = "varies_by_analysis_cell"
        gold_n = "varies_by_analysis_cell"
    if excluded:
        correction = payload.get("runtimeHierarchyCorrection") or {}
        issues = [correction.get("exclusionReason", "case is excluded from automated scoring")]
        status = EXCLUDED
    return {
        "caseId": case_id,
        "benchmarkVersion": payload.get("benchmarkVersion", "LSA50_v1_1"),
        "designClass": design,
        "rowCount": len(rows),
        "packetIndependentSessionCount": packet["independent_session_count"],
        "packetExpectedBiologicalN": packet_n,
        "goldExpectedBiologicalN": gold_n,
        "runtimeDerivedBiologicalN": loader_n,
        "loaderRequiredBiologicalN": loader_n,
        "hierarchyPath": path,
        "experimentIdCount": len(experiment_ids),
        "parentUnitCount": len(parents),
        "status": status,
        "issues": issues,
        "excludedFromAutomatedScoring": excluded,
    }


def audit_all() -> dict[str, Any]:
    cases = [
        audit_payload(json.loads(path.read_text(encoding="utf-8")))
        for path in sorted(RUNTIME.glob("*/integrator.json"))
    ]
    counts = collections.Counter(case["status"] for case in cases)
    return {
        "schemaVersion": "1.0.0",
        "benchmarkVersion": cases[0].get("benchmarkVersion", "LSA50_v1_1") if cases else "LSA50_v1_1",
        "caseCount": len(cases),
        "counts": {status: counts[status] for status in (PASS, AMBIGUOUS, CONFLICT, EXCLUDED, NOT_APPLICABLE)},
        "cases": cases,
    }


def frozen_case_ids() -> tuple[str, ...]:
    data = json.loads(FROZEN.read_text(encoding="utf-8"))
    return tuple(item["caseId"] for item in data["cases"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frozen-15", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit_all()
    if args.frozen_15:
        selected = set(frozen_case_ids())
        report["cases"] = [case for case in report["cases"] if case["caseId"] in selected]
        counts = collections.Counter(case["status"] for case in report["cases"])
        report["caseCount"] = len(report["cases"])
        report["counts"] = {
            status: counts[status] for status in (PASS, AMBIGUOUS, CONFLICT, EXCLUDED, NOT_APPLICABLE)
        }
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
    print(text, end="")


if __name__ == "__main__":
    main()
