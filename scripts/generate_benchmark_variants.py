"""Deterministic, provenance-rich synthetic variants of immutable benchmark anchors."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import random
from collections import defaultdict
from pathlib import Path
from typing import Any

GENERATOR_VERSION = "0.1.0"


def _canonical_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _observed(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in rows if row.get("missingState", "observed") == "observed"]


def _assert_invariants(anchor: dict[str, Any], variant: dict[str, Any], intentional_zero_variance: bool) -> list[dict[str, Any]]:
    rows = variant.get("rows", [])
    if not isinstance(rows, list) or not rows:
        raise ValueError("Variant must retain at least one row")
    checks: list[dict[str, Any]] = []
    for row in _observed(rows):
        value = row.get("value")
        if not isinstance(value, (int, float)) or not math.isfinite(float(value)):
            raise ValueError("Observed variant values must be finite")
    checks.append({"name": "finite_observed_values", "passed": True})

    unit_conditions: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        unit_conditions[str(row["biologicalUnitId"])].add(str(row["conditionId"]))
    if anchor.get("designKind") == "independent" and any(len(values) > 1 for values in unit_conditions.values()):
        raise ValueError("Independent biological units cannot cross conditions")
    checks.append({"name": "cross_sectional_identity", "passed": True})

    if anchor.get("designKind") == "paired":
        conditions = {str(row["conditionId"]) for row in anchor.get("rows", [])}
        pair_conditions: dict[str, set[str]] = defaultdict(set)
        for row in rows:
            if row.get("missingState", "observed") != "not_planned":
                pair_conditions[str(row.get("pairId", ""))].add(str(row["conditionId"]))
        if "" in pair_conditions or any(values != conditions for values in pair_conditions.values()):
            raise ValueError("Paired variant broke declared pair integrity")
    checks.append({"name": "pair_integrity", "passed": True})

    parent_by_unit: dict[str, str | None] = {}
    for row in rows:
        unit_id = str(row["biologicalUnitId"])
        parent = row.get("parentUnitId")
        if unit_id in parent_by_unit and parent_by_unit[unit_id] != parent:
            raise ValueError("Nested unit changed parent identity")
        parent_by_unit[unit_id] = parent
    checks.append({"name": "nested_hierarchy", "passed": True})

    if not intentional_zero_variance:
        grouped: dict[str, list[float]] = defaultdict(list)
        for row in _observed(rows):
            grouped[str(row["conditionId"])].append(float(row["value"]))
        for values in grouped.values():
            if len(values) >= 2 and max(values) == min(values):
                raise ValueError("Variant accidentally created zero within-condition variance")
    checks.append({"name": "non_pathological_variance", "passed": True})

    counts = defaultdict(set)
    for row in rows:
        counts[str(row["conditionId"])].add(str(row["biologicalUnitId"]))
    checks.append({"name": "biological_n", "passed": True, "nByCondition": {key: len(value) for key, value in sorted(counts.items())}})
    return checks


def generate_variant(anchor: dict[str, Any], spec: dict[str, Any], seed: int) -> dict[str, Any]:
    original_hash = _canonical_hash(anchor)
    variant = copy.deepcopy(anchor)
    rows: list[dict[str, Any]] = variant["rows"]
    rng = random.Random(seed)
    changes = copy.deepcopy(spec.get("changes", []))
    intentional_zero_variance = False

    for change in changes:
        kind = change["kind"]
        if kind == "effect_scale":
            condition = str(change["conditionId"])
            factor = float(change["factor"])
            control = [float(row["value"]) for row in _observed(rows) if row["conditionId"] != condition]
            if not control:
                raise ValueError("Effect scaling requires an unchanged reference condition")
            reference = sum(control) / len(control)
            for row in rows:
                if row["conditionId"] == condition and row.get("missingState", "observed") == "observed":
                    row["value"] = reference + (float(row["value"]) - reference) * factor
        elif kind == "variance_scale":
            factor = float(change["factor"])
            if factor < 0:
                raise ValueError("Variance factor cannot be negative")
            intentional_zero_variance = factor == 0 and bool(change.get("intentionalEdgeCase"))
            for condition in {str(row["conditionId"]) for row in rows}:
                selected = [row for row in _observed(rows) if row["conditionId"] == condition]
                mean = sum(float(row["value"]) for row in selected) / len(selected)
                for row in selected:
                    row["value"] = mean + (float(row["value"]) - mean) * factor
        elif kind == "sample_size":
            target = {str(key): int(value) for key, value in change["nByCondition"].items()}
            if anchor.get("designKind") == "paired":
                pair_ids = sorted({str(row["pairId"]) for row in rows})
                requested = set(target.values())
                if len(requested) != 1 or next(iter(requested)) > len(pair_ids):
                    raise ValueError("Paired sample-size variants require one feasible shared n")
                keep_pairs = set(rng.sample(pair_ids, next(iter(requested))))
                rows[:] = [row for row in rows if str(row["pairId"]) in keep_pairs]
            else:
                keep_units: set[str] = set()
                for condition, n in sorted(target.items()):
                    units = sorted({str(row["biologicalUnitId"]) for row in rows if row["conditionId"] == condition})
                    if n < 1 or n > len(units):
                        raise ValueError("Core sample-size variants downsample existing units only")
                    keep_units.update(rng.sample(units, n))
                rows[:] = [row for row in rows if str(row["biologicalUnitId"]) in keep_units]
        elif kind == "missingness":
            targets = set(map(str, change["rowIds"]))
            for row in rows:
                if str(row["rowId"]) in targets:
                    row["value"] = None
                    row["missingState"] = "missing"
        elif kind == "axis_subset":
            keep = set(change["axisValues"])
            rows[:] = [row for row in rows if row.get("axisValue") in keep]
        elif kind == "nested_observation_limit":
            limit = int(change["maxRowsPerBiologicalUnit"])
            selected: list[dict[str, Any]] = []
            for unit_id in sorted({str(row["biologicalUnitId"]) for row in rows}):
                unit_rows = [row for row in rows if str(row["biologicalUnitId"]) == unit_id]
                selected.extend(rng.sample(unit_rows, min(limit, len(unit_rows))))
            rows[:] = selected
        elif kind == "relabel":
            labels = {str(key): str(value) for key, value in change["conditionLabels"].items()}
            variant["conditionLabels"] = {**variant.get("conditionLabels", {}), **labels}
        else:
            raise ValueError(f"Unsupported variant change: {kind}")

    checks = _assert_invariants(anchor, variant, intentional_zero_variance)
    if _canonical_hash(anchor) != original_hash:
        raise AssertionError("Authoritative anchor was mutated")
    variant_id = str(spec["variantId"])
    variant["variantProvenance"] = {
        "literatureAnchorCaseId": anchor["caseId"],
        "variantId": variant_id,
        "generationSeed": seed,
        "variantGenerationVersion": GENERATOR_VERSION,
        "changesApplied": changes,
        "invariantChecks": checks,
    }
    variant["variantProvenance"]["syntheticDataHash"] = _canonical_hash({"rows": variant["rows"], "conditionLabels": variant.get("conditionLabels", {})})
    return variant


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("anchor", type=Path)
    parser.add_argument("spec", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--seed", type=int, required=True)
    args = parser.parse_args()
    anchor = json.loads(args.anchor.read_text(encoding="utf-8"))
    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    args.output.write_text(json.dumps(generate_variant(anchor, spec, args.seed), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

