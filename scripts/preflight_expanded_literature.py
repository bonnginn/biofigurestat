#!/usr/bin/env python3
"""Deterministic code-only preflight for one expanded benchmark allocation."""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from blind_batch_queue import BlindBatchQueue, prepare_batch
from blind_benchmark_package import create_package, load_package


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "benchmark/literature_v2_1/runtime"
DEFAULT_ALLOCATION = ROOT / "benchmark/literature_v2_1/split/round_1.json"
DEFAULT_OUTPUT = ROOT / "benchmark/literature_v2_1/preflight/round_1.json"
EXPECTED_VERSION = "LSA495_v2_1_repaired_1"


def canonical_sha(value: Any) -> str:
    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def unique(values: list[Any]) -> list[Any]:
    return list(dict.fromkeys(values))


def source_unit(row: dict[str, Any]) -> str:
    return str(row.get("parent_unit_id") or row["unit_id"])


def assess_loader_contract(payload: dict[str, Any]) -> dict[str, Any]:
    """Classify deterministic loader compatibility without making scientific choices."""
    rows = payload["syntheticData"]
    packet = payload["researcherPacket"]
    conditions = unique([row["condition"] for row in rows])
    times = unique([row["time"] for row in rows if row["time"] is not None])
    readouts = unique([row["readout"] for row in rows])
    missing = [
        row
        for row in rows
        if row["value"] is None or row.get("missingness_state", "observed") != "observed"
    ]
    has_ratios = any(
        row["numerator"] is not None or row["denominator"] is not None for row in rows
    )
    has_wb = any(
        any(token in str(readout) for token in ("target_raw", "reference_raw", "target_ratio"))
        for readout in readouts
    )
    nested_declared = bool(
        packet.get("nested_observation_note")
        and any(
            phrase in packet["nested_observation_note"].lower()
            for phrase in ("cell-level observations are nested", "lower-level observations are nested")
        )
    )
    if nested_declared and any(not row.get("parent_unit_id") for row in rows):
        return {
            "status": "critical_contract_failure",
            "reason": "declared_nesting_without_parent_identity",
        }
    if missing:
        return {
            "status": "safe_refusal",
            "reason": "missingness_identity_not_supported",
            "missingRows": len(missing),
        }
    if has_wb:
        return {"status": "safe_refusal", "reason": "wb_lineage_not_supported"}
    linked_multi_readout = len(readouts) > 1
    if linked_multi_readout:
        if has_ratios:
            return {
                "status": "safe_refusal",
                "reason": "ambiguous_multi_readout_proportion_structure",
                "readoutCount": len(readouts),
            }
        rows_by_unit_axis: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            rows_by_unit_axis[
                (row["condition"], row["time"], row.get("x_value"), source_unit(row))
            ].append(row)
        for unit_rows in rows_by_unit_axis.values():
            observed = [row["readout"] for row in unit_rows]
            if (
                len(observed) != len(readouts)
                or len(set(observed)) != len(observed)
                or set(observed) != set(readouts)
            ):
                return {
                    "status": "safe_refusal",
                    "reason": "incomplete_or_ambiguous_linked_readouts",
                    "readoutCount": len(readouts),
                }

    groups: dict[tuple[Any, ...], set[str]] = defaultdict(set)
    for row in rows:
        groups[(row["condition"], row["time"], row["readout"])].add(source_unit(row))
    experiment_count = max(len(units) for units in groups.values())
    unit_times: dict[tuple[str, str], set[float]] = defaultdict(set)
    for row in rows:
        if row["time"] is not None:
            unit_times[(row["condition"], source_unit(row))].add(float(row["time"]))
    sampling = (
        "none"
        if not times
        else "longitudinal"
        if any(len(values) > 1 for values in unit_times.values())
        else "cross_sectional"
    )
    return {
        "status": "compatible",
        "reason": "deterministic_loader_contract_representable",
        "shape": (
            "proportion"
            if has_ratios
            else "linked_nested_continuous"
            if linked_multi_readout
            else "nested_continuous"
        ),
        "conditionCount": len(conditions),
        "timeCount": len(times),
        "readoutCount": len(readouts),
        "experimentCount": experiment_count,
        "sampling": sampling,
        "numericCovariate": any(row.get("x_value") is not None for row in rows),
    }


def verify_runtime_case(case_id: str) -> dict[str, Any]:
    case_root = RUNTIME / "cases" / case_id
    public = json.loads((case_root / "experimenter_track_b.json").read_text(encoding="utf-8"))
    hidden = json.loads((case_root / "integrator.json").read_text(encoding="utf-8"))
    acceptance = hidden["hierarchyAcceptance"]
    rows = public["syntheticData"]
    if public["caseId"] != case_id or any(row["case_id"] != case_id for row in rows):
        raise ValueError(f"{case_id}: runtime identity mismatch")
    if acceptance["status"] != "HIERARCHY_PASS" or acceptance["scoring_eligibility"] != "scorable":
        raise ValueError(f"{case_id}: non-scorable hierarchy entered allocation")
    if not rows or any(row["synthetic"] is not True for row in rows):
        raise ValueError(f"{case_id}: missing or non-synthetic observations")
    seeds = unique([row["seed"] for row in rows])
    if len(seeds) != 1:
        raise ValueError(f"{case_id}: synthetic seed is not stable within case")
    observation_ids = [row.get("observation_id") for row in rows if row.get("observation_id")]
    if len(observation_ids) != len(set(observation_ids)):
        raise ValueError(f"{case_id}: duplicate observation identity")
    for row in rows:
        denominator = row.get("denominator")
        numerator = row.get("numerator")
        if denominator is not None and denominator <= 0:
            raise ValueError(f"{case_id}: non-positive denominator")
        if numerator is not None and denominator is not None and numerator > denominator:
            raise ValueError(f"{case_id}: numerator exceeds denominator")
    return {
        "rows": len(rows),
        "seed": seeds[0],
        "runtimeSha256": canonical_sha(public),
        "loader": assess_loader_contract(public),
    }


def exercise_queue(case_ids: list[str], package_root: Path, queue_path: Path) -> dict[str, Any]:
    sample = case_ids[: min(5, len(case_ids))]
    prepare_batch(
        "expanded_preflight_queue",
        queue_path,
        package_root,
        tuple(sample),
    )
    queue = BlindBatchQueue(queue_path)
    transitions = 0
    while True:
        snapshot = queue.snapshot()
        active = snapshot.get("current")
        if not active or active["status"] != "active":
            break
        identity = (active["caseId"], active["track"], active["runId"])
        queue.assert_active(identity)
        queue.mark_completed(identity)
        transitions += 1
        if transitions == len(sample):
            break
        queue.advance()
    final = BlindBatchQueue(queue_path).snapshot()
    if transitions != len(sample) or final["completed"] != len(sample):
        raise ValueError("Blind batch queue transition smoke did not complete")
    return {"sampleCases": sample, "completedTransitions": transitions, "final": final}


def run(allocation_path: Path, output_path: Path) -> dict[str, Any]:
    allocation = json.loads(allocation_path.read_text(encoding="utf-8"))
    case_ids = allocation["trackBCases"]
    if allocation["benchmarkVersion"] != EXPECTED_VERSION or len(case_ids) != len(set(case_ids)):
        raise ValueError("Allocation benchmark version or case identity is invalid")
    manifest = json.loads((RUNTIME / "manifest.json").read_text(encoding="utf-8"))
    if manifest["benchmarkVersion"] != EXPECTED_VERSION:
        raise ValueError("Expanded runtime version mismatch")

    results: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="lsaa-expanded-preflight-") as temporary:
        temporary_root = Path(temporary)
        package_root = temporary_root / "packages"
        duplicate_root = temporary_root / "packages-duplicate"
        package_root.mkdir()
        duplicate_root.mkdir()
        for position, case_id in enumerate(case_ids, 1):
            runtime = verify_runtime_case(case_id)
            run_id = f"preflight_r{allocation['round'].split('_')[-1]}_{position:03d}_{case_id}"
            package_path = create_package(case_id, run_id, package_root)
            first_bytes = (package_path / "case.json").read_bytes()
            duplicate_path = create_package(case_id, run_id, duplicate_root)
            if first_bytes != (duplicate_path / "case.json").read_bytes():
                raise ValueError(f"{case_id}: blind package is not deterministic")
            loaded = load_package(package_root, case_id, run_id)
            package_sha = json.loads(
                (package_path / "manifest.json").read_text(encoding="utf-8")
            )["payloadSha256"]
            if loaded["caseId"] != case_id or loaded["runId"] != run_id:
                raise ValueError(f"{case_id}: blind package identity mismatch")
            if hashlib.sha256(first_bytes).hexdigest() != package_sha:
                raise ValueError(f"{case_id}: blind package manifest mismatch")
            results.append(
                {
                    "position": position,
                    "caseId": case_id,
                    "runId": run_id,
                    "packageSha256": package_sha,
                    **runtime,
                }
            )
        queue = exercise_queue(
            case_ids,
            temporary_root / "queue-packages",
            temporary_root / "queue.json",
        )

    loader_counts = Counter(item["loader"]["status"] for item in results)
    refusal_reasons = Counter(
        item["loader"]["reason"]
        for item in results
        if item["loader"]["status"] != "compatible"
    )
    critical = [item for item in results if item["loader"]["status"] == "critical_contract_failure"]
    report = {
        "schemaVersion": "1.0.0",
        "benchmarkVersion": EXPECTED_VERSION,
        "allocation": allocation["round"],
        "allocationSha256": canonical_sha(allocation),
        "caseCount": len(case_ids),
        "checks": {
            "runtimeIdentity": "PASS",
            "hierarchyAcceptance": "PASS",
            "syntheticIdentity": "PASS",
            "blindPackageAllowList": "PASS",
            "blindLeakageScan": "PASS",
            "packageManifest": "PASS",
            "packageDeterminism": "PASS",
            "queueTransition": "PASS",
            "loaderCriticalContract": "PASS" if not critical else "FAIL",
        },
        "loaderSummary": {
            "statusCounts": dict(sorted(loader_counts.items())),
            "safeRefusalReasons": dict(sorted(refusal_reasons.items())),
        },
        "queueSmoke": queue,
        "cases": results,
        "overall": "PASS" if not critical else "FAIL",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--allocation", type=Path, default=DEFAULT_ALLOCATION)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = run(args.allocation.resolve(), args.output.resolve())
    print(json.dumps({key: report[key] for key in ("allocation", "caseCount", "loaderSummary", "overall")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
