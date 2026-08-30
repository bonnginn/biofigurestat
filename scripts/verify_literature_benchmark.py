#!/usr/bin/env python3
"""Verify runtime integrity and representative statistical gold for literature benchmark v1.1."""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from scipy import stats


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "benchmark/literature_v1_1/runtime"
FORBIDDEN_TRACK_B_TERMS = (
    "scope_expectation",
    "paperreference",
    "paper_reported",
    "gold",
    "recommended",
    "acceptable_graph",
    "acceptable_statistical",
    "preferred_app_route",
)


def load(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise AssertionError(f"Expected object: {path}")
    return payload


def rows(case_id: str) -> list[dict[str, Any]]:
    return load(RUNTIME / "cases" / case_id / "integrator.json")["syntheticData"]


def gold(case_id: str) -> dict[str, Any]:
    return load(RUNTIME / "cases" / case_id / "integrator.json")["goldMetadata"]


def grouped_values(case_id: str, condition: str) -> np.ndarray:
    return np.array([row["value"] for row in rows(case_id) if row["condition"] == condition])


def check_gold(case_id: str, label: str, statistic: float, p_value: float) -> dict[str, Any]:
    target = gold(case_id)
    target_statistic = float(target["reference_statistic"])
    target_p_value = float(target["reference_p_value"])
    if not math.isclose(statistic, target_statistic, rel_tol=2e-5, abs_tol=5e-5):
        raise AssertionError(f"{case_id} {label} statistic mismatch: {statistic} != {target_statistic}")
    if not math.isclose(p_value, target_p_value, rel_tol=2e-4, abs_tol=5e-7):
        raise AssertionError(f"{case_id} {label} p-value mismatch: {p_value} != {target_p_value}")
    return {"caseId": case_id, "analysis": label, "statistic": statistic, "pValue": p_value}


def representative_gold_checks() -> list[dict[str, Any]]:
    checks = []
    jcb003_sessions: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in rows("JCB003"):
        jcb003_sessions[row["condition"]][row["parent_unit_id"]].append(row["value"])
    jcb003_means = {
        condition: [float(np.mean(values)) for values in sessions.values()]
        for condition, sessions in jcb003_sessions.items()
    }
    result = stats.ttest_ind(
        jcb003_means["Control"], jcb003_means["Treatment"], equal_var=False
    )
    checks.append(
        check_gold(
            "JCB003",
            "session-summary Welch independent t",
            float(result.statistic),
            float(result.pvalue),
        )
    )

    by_unit: dict[str, dict[str, float]] = defaultdict(dict)
    for row in rows("JCB002"):
        by_unit[row["unit_id"]][row["condition"]] = row["value"]
    result = stats.ttest_rel([value["Pre"] for value in by_unit.values()], [value["Post"] for value in by_unit.values()])
    checks.append(check_gold("JCB002", "paired t preserving unit", float(result.statistic), float(result.pvalue)))

    case_rows = rows("JCB005")
    conditions = sorted({row["condition"] for row in case_rows})
    result = stats.f_oneway(*(grouped_values("JCB005", condition) for condition in conditions))
    checks.append(check_gold("JCB005", "one-way ANOVA", float(result.statistic), float(result.pvalue)))

    parent_values: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in rows("JCB004"):
        parent_values[row["condition"]][row["parent_unit_id"]].append(row["value"])
    summaries = {
        condition: [float(np.mean(values)) for values in parents.values()]
        for condition, parents in parent_values.items()
    }
    result = stats.ttest_ind(summaries["Control"], summaries["Treatment"], equal_var=False)
    checks.append(check_gold("JCB004", "nested parent-summary Welch t", float(result.statistic), float(result.pvalue)))

    trajectories: dict[str, dict[str, list[tuple[float, float]]]] = defaultdict(lambda: defaultdict(list))
    for row in rows("JCB011"):
        trajectories[row["condition"]][row["unit_id"]].append((row["time"], row["value"]))
    aucs = {
        condition: [
            float(np.trapezoid([value for _, value in sorted(points)], [time for time, _ in sorted(points)]))
            for points in units.values()
        ]
        for condition, units in trajectories.items()
    }
    result = stats.ttest_ind(aucs["Control"], aucs["Treatment"], equal_var=False)
    checks.append(check_gold("JCB011", "unit-level AUC Welch t", float(result.statistic), float(result.pvalue)))

    result = stats.mannwhitneyu(grouped_values("JCB010", "Control"), grouped_values("JCB010", "Treatment"), alternative="two-sided")
    checks.append(check_gold("JCB010", "Mann-Whitney U", float(result.statistic), float(result.pvalue)))

    cells: dict[str, dict[tuple[str, str], float]] = defaultdict(dict)
    for row in rows("JCB023"):
        cells[row["experiment_id"]][(row["condition"], row["time"])] = row["value"]
    wt_change = [values[("WT", "Challenge")] - values[("WT", "Baseline")] for values in cells.values()]
    ko_change = [values[("KO", "Challenge")] - values[("KO", "Baseline")] for values in cells.values()]
    result = stats.ttest_ind(wt_change, ko_change, equal_var=False)
    checks.append(check_gold("JCB023", "Welch interaction contrast", float(result.statistic), float(result.pvalue)))

    blocks: dict[str, dict[str, float]] = defaultdict(dict)
    for row in rows("JCB024"):
        blocks[row["unit_id"]][row["condition"]] = row["value"]
    conditions = sorted(next(iter(blocks.values())))
    result = stats.friedmanchisquare(*[[values[condition] for values in blocks.values()] for condition in conditions])
    checks.append(check_gold("JCB024", "Friedman repeated blocks", float(result.statistic), float(result.pvalue)))
    return checks


def main() -> None:
    manifest = load(RUNTIME / "manifest.json")
    index = load(RUNTIME / "public_index.json")
    case_ids = [case["caseId"] for case in index["cases"]]
    if manifest["caseCount"] != 50 or len(case_ids) != 50 or len(set(case_ids)) != 50:
        raise AssertionError("Expected exactly 50 unique literature cases")
    all_rows = []
    for case_id in case_ids:
        case_dir = RUNTIME / "cases" / case_id
        expected = {"experimenter_track_a.json", "experimenter_track_b.json", "reviewer.json", "integrator.json"}
        if {path.name for path in case_dir.glob("*.json")} != expected:
            raise AssertionError(f"Unexpected runtime files for {case_id}")
        track_a = load(case_dir / "experimenter_track_a.json")
        track_b = load(case_dir / "experimenter_track_b.json")
        if "paperReference" not in track_a or "paperReference" in track_b:
            raise AssertionError(f"Track paper boundary failed for {case_id}")
        serialized_b = json.dumps(track_b).lower()
        leaked = [term for term in FORBIDDEN_TRACK_B_TERMS if term in serialized_b]
        if leaked:
            raise AssertionError(f"Track B leakage for {case_id}: {', '.join(leaked)}")
        if track_a["syntheticData"] != track_b["syntheticData"]:
            raise AssertionError(f"Track A/B synthetic rows differ for {case_id}")
        all_rows.extend(track_b["syntheticData"])
    if len(all_rows) != manifest["syntheticRowCount"] or len(all_rows) != 2691:
        raise AssertionError("Synthetic row count mismatch")
    if any(not row["synthetic"] for row in all_rows):
        raise AssertionError("Non-synthetic row found")
    required = ("case_id", "experiment_id", "unit_id", "condition", "readout", "value", "seed")
    if any(any(row[field] is None for field in required) for row in all_rows):
        raise AssertionError("Required synthetic field is missing")
    key = lambda row: (
        row["case_id"], row["experiment_id"], row["unit_id"], row["parent_unit_id"],
        row["condition"], row["time"], row["readout"], row["event"], row["x_value"],
    )
    if any(count > 1 for count in Counter(map(key, all_rows)).values()):
        raise AssertionError("Duplicate synthetic observation identity")
    for row in all_rows:
        numerator, denominator = row["numerator"], row["denominator"]
        if numerator is None and denominator is None:
            continue
        if numerator is None or denominator is None or denominator <= 0 or not 0 <= numerator <= denominator:
            raise AssertionError(f"Invalid numerator/denominator row: {key(row)}")
        if not math.isclose(row["value"], numerator / denominator, abs_tol=5e-7):
            raise AssertionError(f"Derived proportion mismatch: {key(row)}")
    checks = representative_gold_checks()
    print(f"PASS 50 unique cases; {len(all_rows)} synthetic rows; Track B blind for all cases")
    for check in checks:
        print(f"PASS {check['caseId']} {check['analysis']}: statistic={check['statistic']:.8g}, p={check['pValue']:.8g}")
    print(f"All {len(checks)} representative gold analyses reproduced.")


if __name__ == "__main__":
    main()
