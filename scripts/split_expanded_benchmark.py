#!/usr/bin/env python3
"""Create the frozen deterministic split for the expanded literature benchmark."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

from import_literature_benchmark import read_workbook, write_json


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = (
    ROOT
    / "benchmark/literature_v2_1/source/LSA_Literature_Benchmark_495_v2_1_Repaired_Master.xlsx"
)
DEFAULT_OUTPUT = ROOT / "benchmark/literature_v2_1/split"
SOURCE_SHA256 = "e9c0fb3881191d450fdd04c13f7eb57c64448d3606c3c9024a71879b9bdb9dee"
BENCHMARK_VERSION = "LSA495_v2_1_repaired_1"
SPLIT_VERSION = "expanded_generalization_split_v1"
DEFAULT_SEED = f"{BENCHMARK_VERSION}|{SPLIT_VERSION}|2026-08-24"
REQUIRED_SHEETS = {"Benchmark_Index_All", "Hierarchy_QC_v2_1"}
FEATURES = (
    "design_class",
    "difficulty",
    "paper_graph_family",
    "acceptable_statistical_families",
    "batch_id",
    "scope_expectation",
)


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def stable_hash(seed: str, *parts: str) -> str:
    return hashlib.sha256("|".join((seed, *parts)).encode("utf-8")).hexdigest()


def _feature_value(record: dict[str, Any], feature: str) -> str:
    value = record.get(feature)
    return "(missing)" if value in (None, "") else str(value)


def balanced_assign(
    records: Iterable[dict[str, Any]],
    capacities: dict[str, int],
    *,
    features: tuple[str, ...] = FEATURES,
    seed: str,
) -> dict[str, str]:
    """Greedily minimize marginal imbalance with deterministic rare-first ordering."""
    materialized = list(records)
    if sum(capacities.values()) != len(materialized):
        raise ValueError("Assignment capacity does not match record count")
    category_totals = {
        feature: Counter(_feature_value(record, feature) for record in materialized)
        for feature in features
    }
    total = len(materialized)
    targets = {
        pool: {
            feature: {
                category: count * capacity / total
                for category, count in category_totals[feature].items()
            }
            for feature in features
        }
        for pool, capacity in capacities.items()
    }
    assigned_counts: dict[str, dict[str, Counter[str]]] = {
        pool: {feature: Counter() for feature in features} for pool in capacities
    }
    remaining = dict(capacities)

    def rarity(record: dict[str, Any]) -> float:
        return sum(
            1.0 / category_totals[feature][_feature_value(record, feature)]
            for feature in features
        )

    ordered = sorted(
        materialized,
        key=lambda record: (
            -rarity(record),
            stable_hash(seed, "order", str(record["case_id"])),
        ),
    )
    result: dict[str, str] = {}
    for record in ordered:
        case_id = str(record["case_id"])
        candidates = [pool for pool, count in remaining.items() if count > 0]
        if not candidates:
            raise AssertionError("Assignment exhausted every pool too early")

        def score(pool: str) -> tuple[float, str]:
            delta = 0.0
            for feature in features:
                category = _feature_value(record, feature)
                current = assigned_counts[pool][feature][category]
                target = targets[pool][feature][category]
                delta += (current + 1 - target) ** 2 - (current - target) ** 2
            fill = (capacities[pool] - remaining[pool]) / capacities[pool]
            delta += fill * 0.01
            return delta, stable_hash(seed, "tie", case_id, pool)

        chosen = min(candidates, key=score)
        result[case_id] = chosen
        remaining[chosen] -= 1
        for feature in features:
            assigned_counts[chosen][feature][_feature_value(record, feature)] += 1
    if any(remaining.values()):
        raise AssertionError(f"Unfilled assignment capacity: {remaining}")
    return result


def distribution(
    records_by_id: dict[str, dict[str, Any]], assignments: dict[str, str]
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for group in sorted(set(assignments.values())):
        ids = [case_id for case_id, assigned in assignments.items() if assigned == group]
        result[group] = {
            "count": len(ids),
            "caseSetSha256": canonical_hash(sorted(ids)),
            "features": {
                feature: dict(
                    sorted(
                        Counter(
                            _feature_value(records_by_id[case_id], feature)
                            for case_id in ids
                        ).items()
                    )
                )
                for feature in FEATURES
            },
        }
    return result


def create_split(source: Path, output: Path, seed: str = DEFAULT_SEED) -> dict[str, Any]:
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    if source_hash != SOURCE_SHA256:
        raise ValueError(f"Unexpected repaired-master SHA-256: {source_hash}")
    tables = read_workbook(source, REQUIRED_SHEETS)
    index = tables["Benchmark_Index_All"]
    hierarchy = tables["Hierarchy_QC_v2_1"]
    if len(index) != 495 or len(hierarchy) != 495:
        raise ValueError("Expanded benchmark must contain 495 indexed hierarchy rows")
    records_by_id = {str(record["case_id"]): record for record in index}
    hierarchy_by_id = {str(record["case_id"]): record for record in hierarchy}
    if len(records_by_id) != 495 or set(records_by_id) != set(hierarchy_by_id):
        raise ValueError("Expanded benchmark case identities are not one-to-one")

    scorable = {
        case_id
        for case_id, record in hierarchy_by_id.items()
        if record["status"] == "HIERARCHY_PASS"
        and record["scoring_eligibility"] == "scorable"
    }
    excluded = set(records_by_id) - scorable
    original = {
        case_id
        for case_id in scorable
        if records_by_id[case_id]["set_origin"] == "original_v1_1_reference"
    }
    new = scorable - original
    if (len(scorable), len(excluded), len(original), len(new)) != (490, 5, 49, 441):
        raise ValueError("Expanded benchmark acceptance counts changed")

    new_records = [records_by_id[case_id] for case_id in sorted(new)]
    pool_assignment = balanced_assign(
        new_records,
        {"B": 265, "C": 88, "D": 88},
        seed=f"{seed}|pools",
    )
    pool_assignment.update({case_id: "A" for case_id in original})
    pool_assignment.update({case_id: "EXCLUDED" for case_id in excluded})

    pool_b_records = [
        records_by_id[case_id]
        for case_id, pool in pool_assignment.items()
        if pool == "B"
    ]
    round_assignment = balanced_assign(
        pool_b_records,
        {"round_1": 89, "round_2": 88, "round_3": 88},
        seed=f"{seed}|rounds",
    )

    track_a_selected: set[str] = set()
    for round_name in ("round_1", "round_2", "round_3"):
        round_records = [
            records_by_id[case_id]
            for case_id, assigned_round in round_assignment.items()
            if assigned_round == round_name
        ]
        selected = balanced_assign(
            round_records,
            {"selected": 30, "not_selected": len(round_records) - 30},
            seed=f"{seed}|track_a|{round_name}",
        )
        track_a_selected.update(
            case_id for case_id, status in selected.items() if status == "selected"
        )

    pool_a_selection = balanced_assign(
        [records_by_id[case_id] for case_id in sorted(original)],
        {"selected": 15, "not_selected": len(original) - 15},
        seed=f"{seed}|pool_a_regression",
    )
    pool_a_regression = {
        case_id for case_id, status in pool_a_selection.items() if status == "selected"
    }
    pool_c_selection = balanced_assign(
        [
            records_by_id[case_id]
            for case_id, pool in pool_assignment.items()
            if pool == "C"
        ],
        {"selected": 30, "not_selected": 58},
        seed=f"{seed}|pool_c_track_a",
    )
    pool_c_track_a = {
        case_id for case_id, status in pool_c_selection.items() if status == "selected"
    }

    ledger = []
    for case_id in sorted(records_by_id):
        source_record = records_by_id[case_id]
        hierarchy_record = hierarchy_by_id[case_id]
        pool = pool_assignment[case_id]
        ledger.append(
            {
                "caseId": case_id,
                "pool": pool,
                "developmentRound": round_assignment.get(case_id),
                "trackAPreselected": case_id in track_a_selected,
                "poolARegression": case_id in pool_a_regression,
                "poolCTrackAPreselected": case_id in pool_c_track_a,
                "scoringEligibility": hierarchy_record["scoring_eligibility"],
                "datasetStatus": (
                    "DATASET_PASS"
                    if hierarchy_record["scoring_eligibility"] == "scorable"
                    else "DATASET_EXCLUDED"
                ),
                "datasetIssue": hierarchy_record.get("issues") or None,
                "setOrigin": source_record.get("set_origin"),
                "batchId": source_record.get("batch_id"),
                "coverageTier": source_record.get("coverage_tier"),
                "scopeExpectation": source_record.get("scope_expectation"),
                "difficulty": source_record.get("difficulty"),
                "designClass": source_record.get("design_class"),
                "paperGraphFamily": source_record.get("paper_graph_family"),
                "acceptableGraphFamilies": source_record.get("acceptable_graph_families"),
                "acceptableStatisticalFamilies": source_record.get(
                    "acceptable_statistical_families"
                ),
                "trackBSeen": False,
                "trackASeen": False,
                "lastTrackBResult": None,
                "lastTrackAResult": None,
                "supportClassification": None,
                "scientificGate": None,
                "failureCluster": None,
                "usedForFix": False,
                "validationOnly": pool == "C",
            }
        )

    assignment_payload = [
        {
            "caseId": record["caseId"],
            "pool": record["pool"],
            "developmentRound": record["developmentRound"],
            "trackAPreselected": record["trackAPreselected"],
            "poolARegression": record["poolARegression"],
            "poolCTrackAPreselected": record["poolCTrackAPreselected"],
            "scoringEligibility": record["scoringEligibility"],
        }
        for record in ledger
    ]
    split_sha = canonical_hash(assignment_payload)
    pool_summary = distribution(records_by_id, pool_assignment)
    round_summary = distribution(records_by_id, round_assignment)
    manifest = {
        "schemaVersion": "1.0.0",
        "benchmarkVersion": BENCHMARK_VERSION,
        "splitVersion": SPLIT_VERSION,
        "seed": seed,
        "sourceFile": source.name,
        "sourceSha256": source_hash,
        "splitSha256": split_sha,
        "counts": {
            "indexed": 495,
            "scorable": 490,
            "excluded": 5,
            "poolA": 49,
            "poolB": 265,
            "poolC": 88,
            "poolD": 88,
            "round1": 89,
            "round2": 88,
            "round3": 88,
            "trackAPreselectedPerRound": 30,
            "poolARegression": 15,
            "poolCTrackAPreselected": 30,
        },
        "poolSummary": pool_summary,
        "roundSummary": round_summary,
        "sealedPoolD": {
            "status": "sealed",
            "caseCount": 88,
            "caseSetSha256": pool_summary["D"]["caseSetSha256"],
            "opened": False,
        },
    }
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "coverage_ledger.json", {"manifest": manifest, "cases": ledger})
    write_json(output / "split_manifest.json", manifest)
    # The sealed membership file is trusted-side only. Round runners consume development files,
    # never this file, until a separately authorized Alpha-gate operation.
    write_json(
        output / "sealed_pool_d.json",
        {
            "schemaVersion": "1.0.0",
            "benchmarkVersion": BENCHMARK_VERSION,
            "splitSha256": split_sha,
            "status": "sealed",
            "cases": sorted(
                case_id for case_id, pool in pool_assignment.items() if pool == "D"
            ),
        },
    )
    for round_name in ("round_1", "round_2", "round_3"):
        write_json(
            output / f"{round_name}.json",
            {
                "schemaVersion": "1.0.0",
                "benchmarkVersion": BENCHMARK_VERSION,
                "splitSha256": split_sha,
                "round": round_name,
                "trackBCases": sorted(
                    case_id
                    for case_id, assigned_round in round_assignment.items()
                    if assigned_round == round_name
                ),
                "trackAPreselectedCases": sorted(
                    case_id
                    for case_id, assigned_round in round_assignment.items()
                    if assigned_round == round_name and case_id in track_a_selected
                ),
            },
        )
    write_json(
        output / "pool_a_regression.json",
        {
            "schemaVersion": "1.0.0",
            "benchmarkVersion": BENCHMARK_VERSION,
            "splitSha256": split_sha,
            "trackBCases": sorted(pool_a_regression),
        },
    )
    write_json(
        output / "pool_c_validation_sealed.json",
        {
            "schemaVersion": "1.0.0",
            "benchmarkVersion": BENCHMARK_VERSION,
            "splitSha256": split_sha,
            "status": "sealed_until_round_3_complete",
            "trackBCases": sorted(
                case_id for case_id, pool in pool_assignment.items() if pool == "C"
            ),
            "trackAPreselectedCases": sorted(pool_c_track_a),
        },
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--seed", default=DEFAULT_SEED)
    args = parser.parse_args()
    manifest = create_split(args.source.resolve(), args.output.resolve(), args.seed)
    print(json.dumps(manifest["counts"], indent=2))
    print(f"splitSha256={manifest['splitSha256']}")
    print(f"sealedPoolDCaseSetSha256={manifest['sealedPoolD']['caseSetSha256']}")


if __name__ == "__main__":
    main()
