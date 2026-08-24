#!/usr/bin/env python3
"""Create a reproducible Track-A-informed review of completed expanded-benchmark evidence.

The review does not replay or rewrite Track B runs.  It combines their immutable artifacts
with the Track A/reviewer reference boundary and records scientific, comparison-completeness,
UX, and figure findings separately.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
VALID_OUTCOMES = {"completed", "explicit_unsupported"}
MULTI_GROUP_DESIGNS = {"multi_group", "multi_group_nonparam", "factorial"}
NO_CORRECTION = {"", "none", "not applicable", "n/a"}


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected an object: {path}")
    return value


def latest_valid_run(case_id: str) -> tuple[Path, dict[str, Any]]:
    root = ROOT / "benchmark_runs" / case_id / "track_B"
    candidates: list[tuple[Path, dict[str, Any]]] = []
    for directory in sorted(root.glob("*"), key=lambda item: item.stat().st_mtime_ns):
        run_path = directory / "run.json"
        if not run_path.is_file():
            continue
        run = load(run_path)
        if run.get("outcome") in VALID_OUTCOMES:
            candidates.append((directory, run))
    if not candidates:
        raise ValueError(f"No valid Track B evidence for {case_id}")
    return candidates[-1]


def tests_from_statistics(statistics: dict[str, Any]) -> list[dict[str, Any]]:
    result = statistics.get("result", {})
    if isinstance(result, dict):
        tests = result.get("tests", [])
    elif isinstance(result, list):
        tests = result
    else:
        tests = []
    return [test for test in tests if isinstance(test, dict)]


def expected_comparisons(gold: dict[str, Any], design_class: str) -> bool:
    correction = str(gold.get("multiple_comparison_correction") or "").strip().lower()
    scope = str(gold.get("analysis_scope_note") or "").lower()
    return design_class in MULTI_GROUP_DESIGNS and (
        correction not in NO_CORRECTION or "post hoc" in scope or "pair" in scope
    )


def comparison_review(
    design_class: str,
    gold: dict[str, Any],
    statistics: dict[str, Any],
    graph_state: dict[str, Any],
) -> dict[str, Any]:
    required = expected_comparisons(gold, design_class)
    tests = tests_from_statistics(statistics)
    pairwise = [
        test
        for test in tests
        if any(
            str(test.get("name", "")).startswith(prefix)
            for prefix in ("games_howell:", "tukey_hsd:", "dunnett:", "planned_holm:", "dunn_holm:")
        )
    ]
    adjusted_complete = bool(pairwise) and all(test.get("adjustedPValue") is not None for test in pairwise)
    selected_method = statistics.get("selectedMethod")
    rank_post_hoc_gap = (
        design_class == "multi_group_nonparam"
        and required
        and selected_method != "kruskal_wallis"
    )
    annotation = graph_state.get("statisticsAnnotation", {})
    test_index = annotation.get("testIndex") if isinstance(annotation, dict) else None
    annotation_name = (
        tests[test_index].get("name")
        if isinstance(test_index, int) and 0 <= test_index < len(tests)
        else None
    )
    graph_uses_pairwise = any(
        str(annotation_name or "").startswith(prefix)
        for prefix in ("games_howell:", "tukey_hsd:", "dunnett:", "planned_holm:", "dunn_holm:")
    )
    return {
        "multiGroup": design_class in MULTI_GROUP_DESIGNS,
        "comparisonRequired": required,
        "contrastIntent": (statistics.get("contrast") or {}).get("intent")
        if isinstance(statistics.get("contrast"), dict)
        else None,
        "pairwiseResultCount": len(pairwise),
        "adjustedResultsAvailable": adjusted_complete,
        "rankPostHocCapabilityGap": rank_post_hoc_gap,
        "workflowComplete": (not required) or (adjusted_complete and not rank_post_hoc_gap),
        "graphAnnotationTest": annotation_name,
        "graphAnnotationMatchesPairwiseComparison": (not required) or graph_uses_pairwise,
    }


def scientific_review(
    design_class: str,
    run: dict[str, Any],
    statistics: dict[str, Any],
    comparison: dict[str, Any],
) -> dict[str, Any]:
    outcome = run.get("outcome")
    if outcome == "explicit_unsupported":
        return {
            "scientificValidity": None,
            "statisticalAppropriateness": None,
            "informationFidelity": None,
            "scientificGate": "cannot_determine_explicit_unsupported",
            "calibratedSupport": "impossible",
        }
    factorial_flattened = design_class == "factorial" and statistics.get("selectedMethod") in {
        "welch_anova",
        "one_way_anova",
        "kruskal_wallis",
    }
    rank_gap = bool(comparison["rankPostHocCapabilityGap"])
    validity = 2 if factorial_flattened else 4 if rank_gap else 5
    appropriateness = 2 if factorial_flattened else 3 if rank_gap else 5
    fidelity = 2 if factorial_flattened else 4 if rank_gap else 5
    support = (
        "scientifically_compromising_workaround"
        if factorial_flattened
        else "reasonable_workaround"
        if rank_gap
        else run.get("supportStatus") or "direct"
    )
    return {
        "scientificValidity": validity,
        "statisticalAppropriateness": appropriateness,
        "informationFidelity": fidelity,
        "scientificGate": "concern" if min(validity, appropriateness, fidelity) < 4 else "pass",
        "calibratedSupport": support,
        "factorialStructureFlattened": factorial_flattened,
    }


def failure_cluster(design_class: str, outcome: str, scientific: dict[str, Any], comparison: dict[str, Any]) -> str | None:
    if scientific.get("factorialStructureFlattened"):
        return "factorial_structure_flattened_to_one_way"
    if comparison.get("rankPostHocCapabilityGap"):
        return "nonparametric_multi_group_posthoc_missing"
    if outcome != "explicit_unsupported":
        return None
    return {
        "correlation": "literature_loader_correlation_route_missing",
        "survival": "literature_loader_survival_route_missing",
        "multiple_testing": "high_dimensional_multiple_testing_unsupported",
        "western_blot": "western_blot_lineage_loader_missing",
        "factorial": "factorial_structure_loader_rejected",
    }.get(design_class, f"unsupported_{design_class}")


def review_round(round_name: str, update_ledger: bool) -> dict[str, Any]:
    allocation = load(ROOT / "benchmark" / "literature_v2_1" / "split" / f"{round_name}.json")
    preselected = set(allocation["trackAPreselectedCases"])
    track_b_cases = allocation["trackBCases"]
    evidence: dict[str, tuple[Path, dict[str, Any]]] = {
        case_id: latest_valid_run(case_id) for case_id in track_b_cases
    }
    escalations: set[str] = set()
    for case_id, (_, run) in evidence.items():
        design_class = load(
            ROOT / "benchmark" / "literature_v2_1" / "runtime" / "cases" / case_id / "integrator.json"
        )["benchmarkIndex"]["design_class"]
        if (
            run.get("outcome") == "explicit_unsupported"
            or run.get("supportStatus")
            in {"reasonable_workaround", "scientifically_compromising_workaround"}
            or design_class in {"factorial", "multi_group_nonparam"}
        ):
            escalations.add(case_id)
    reviewed_ids = sorted(preselected | escalations)
    reviews: list[dict[str, Any]] = []
    clusters: Counter[str] = Counter()
    comparison_counts: Counter[str] = Counter()
    for case_id in reviewed_ids:
        directory, run = evidence[case_id]
        integrator = load(ROOT / "benchmark" / "literature_v2_1" / "runtime" / "cases" / case_id / "integrator.json")
        design_class = integrator["benchmarkIndex"]["design_class"]
        statistics = load(directory / "statistics.json") if (directory / "statistics.json").is_file() else {}
        graph_state = load(directory / "graph_state.json") if (directory / "graph_state.json").is_file() else {}
        comparison = comparison_review(design_class, integrator["goldAnalysis"], statistics, graph_state)
        scientific = scientific_review(design_class, run, statistics, comparison)
        cluster = failure_cluster(design_class, str(run.get("outcome")), scientific, comparison)
        if cluster:
            clusters[cluster] += 1
        if comparison["multiGroup"]:
            comparison_counts["multiGroupCases"] += 1
        if comparison["comparisonRequired"]:
            comparison_counts["comparisonRequired"] += 1
            comparison_counts[
                "comparisonComplete" if comparison["workflowComplete"] else "comparisonIncomplete"
            ] += 1
        if comparison["comparisonRequired"] and not comparison["graphAnnotationMatchesPairwiseComparison"]:
            comparison_counts["graphAnnotationMismatchOrOmnibusOnly"] += 1
        reviews.append(
            {
                "caseId": case_id,
                "selectionReason": [
                    reason
                    for condition, reason in (
                        (case_id in preselected, "stratified_preselection"),
                        (case_id in escalations, "track_b_escalation"),
                    )
                    if condition
                ],
                "trackBRunId": run["runId"],
                "trackBOutcome": run["outcome"],
                "trackBReportedSupport": run.get("supportStatus"),
                "designClass": design_class,
                "referenceMethod": integrator["goldAnalysis"].get("reference_method"),
                "selectedMethod": statistics.get("selectedMethod"),
                "comparisonCompleteness": comparison,
                "scientificReviewer": scientific,
                "uxReviewer": {
                    "comparisonDiscoverabilityConcern": comparison["comparisonRequired"] and not comparison["workflowComplete"],
                    "systematicCommercialUxAuditDeferred": True,
                },
                "figureReviewer": {
                    "defaultAndFinalPresent": run["outcome"] == "completed" and run.get("artifactCompleteness") == "complete",
                    "annotationSemanticConcern": comparison["comparisonRequired"] and not comparison["graphAnnotationMatchesPairwiseComparison"],
                    "humanVisualPreferenceNotScored": True,
                },
                "integrator": {
                    "scientificGate": scientific["scientificGate"],
                    "calibratedSupport": scientific["calibratedSupport"],
                    "failureCluster": cluster,
                },
            }
        )

    outcome_counts = Counter(run.get("outcome") for _, run in evidence.values())
    support_counts = Counter(run.get("supportStatus") or "not_applicable" for _, run in evidence.values())
    report = {
        "schemaVersion": "1.0.0",
        "benchmarkVersion": allocation["benchmarkVersion"],
        "round": round_name,
        "reviewMode": "track_A_reference_review_of_immutable_track_B_product_evidence",
        "protocolNote": "No Track B run was reset, replayed, or rewritten. Track A/reviewer references were used only after Track B discovery completed.",
        "trackB": {
            "cases": len(track_b_cases),
            "outcomes": dict(sorted(outcome_counts.items())),
            "reportedSupport": dict(sorted(support_counts.items())),
        },
        "trackAReview": {
            "stratifiedPreselected": len(preselected),
            "escalationCases": len(escalations),
            "uniqueReviewed": len(reviewed_ids),
        },
        "comparisonCompleteness": dict(sorted(comparison_counts.items())),
        "failureClusters": dict(clusters.most_common()),
        "cases": reviews,
    }
    output_dir = ROOT / "benchmark" / "literature_v2_1" / "reviews"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{round_name}.json"
    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if update_ledger:
        ledger_path = ROOT / "benchmark" / "literature_v2_1" / "split" / "coverage_ledger.json"
        ledger = load(ledger_path)
        review_by_id = {review["caseId"]: review for review in reviews}
        for entry in ledger["cases"]:
            case_id = entry["caseId"]
            if case_id in evidence:
                _, run = evidence[case_id]
                entry["trackBSeen"] = True
                entry["lastTrackBResult"] = run["outcome"]
                entry["supportClassification"] = run.get("supportStatus")
                entry["latestEvaluatedProductRevision"] = run.get("sourceRevision")
            review = review_by_id.get(case_id)
            if review:
                entry["trackASeen"] = True
                entry["lastTrackAResult"] = "reference_review_completed"
                entry["scientificGate"] = review["integrator"]["scientificGate"]
                entry["failureCluster"] = review["integrator"]["failureCluster"]
        ledger_path.write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", choices=("round_1", "round_2", "round_3"), required=True)
    parser.add_argument("--update-ledger", action="store_true")
    args = parser.parse_args()
    report = review_round(args.round, args.update_ledger)
    print(json.dumps({key: report[key] for key in ("round", "trackB", "trackAReview", "comparisonCompleteness", "failureClusters")}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
