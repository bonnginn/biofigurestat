#!/usr/bin/env python3
"""Audit non-Pool-D historical evidence for paper-context fidelity.

The script intentionally reads only case IDs already exposed by the historical
Round 1-3 and Pool C review files. It never opens the 495-case workbook,
manifest/public index, split ledger, or any Pool D artifact.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
import json
import math
from pathlib import Path
import re
from statistics import mean, pstdev
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BENCHMARK = ROOT / "benchmark/literature_v2_1"
REVIEWS = BENCHMARK / "reviews"
RUNTIME = BENCHMARK / "runtime/cases"
OUTPUT = BENCHMARK / f"context_fidelity_{date.today().isoformat()}"
REVIEW_FILES = ["round_1.json", "round_2.json", "round_3.json", "pool_c_validation.json"]
CLASSIFICATION_ORDER = {
    "HIGH_FIDELITY": 5,
    "ADEQUATE_FOR_STATISTICAL_BENCHMARK": 4,
    "CONTEXT_REDUCED": 3,
    "MATERIAL_CONTEXT_LOSS": 2,
    "UNRESOLVABLE_FROM_SOURCE": 1,
}
QUOTAS = {
    "multi_group_nonparam": 5,
    "factorial": 5,
    "longitudinal": 5,
    "western_blot": 4,
    "proportion": 4,
    "nested": 4,
    "paired": 4,
    "two_group_continuous": 4,
    "two_group_nonparam": 3,
    "multi_group": 3,
    "survival": 3,
    "correlation": 3,
    "multiple_testing": 3,
}
GRAPH_SUBSET_QUOTAS = {
    "two_group_continuous": 3,
    "two_group_nonparam": 2,
    "multi_group": 3,
    "multi_group_nonparam": 3,
    "factorial": 3,
    "paired": 3,
    "longitudinal": 2,
    "nested": 3,
    "proportion": 3,
    "survival": 3,
    "correlation": 2,
    "multiple_testing": 2,
    "western_blot": 3,
}
STOPWORDS = {
    "the", "and", "of", "in", "to", "a", "is", "for", "with", "or", "by",
    "on", "at", "from", "as", "that", "this", "are", "was", "were", "be",
    "figure", "fig", "panel", "quantitative", "changes", "differences", "response",
    "condition", "conditions", "planned", "synthetic", "measurement", "measurements",
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def normalized_tokens(value: Any) -> set[str]:
    text = re.sub(r"<[^>]+>", " ", str(value or "").lower())
    return {
        token
        for token in re.findall(r"[a-z0-9βδαγ][a-z0-9βδαγ+/-]{2,}", text)
        if token not in STOPWORDS and not token.isdigit()
    }


def unit_class(value: Any) -> str | None:
    text = str(value or "").lower()
    patterns = [
        ("animal", r"\b(mice|mouse|animals?|rats?|zebrafish|flies|worms|larvae)\b"),
        ("subject", r"\b(patients?|participants?|subjects?|donors?)\b"),
        ("experiment", r"\b(experiments?|independent repeats?|biological replicates?)\b"),
        ("cell", r"\b(cells?|cellular)\b"),
        ("sample", r"\b(samples?|specimens?)\b"),
        ("well", r"\b(wells?|dishes?)\b"),
        ("imaging_field", r"\b(fields?|images?|movies?|sessions?)\b"),
        ("blot", r"\b(blots?|membranes?|western|immunoblots?)\b"),
    ]
    for label, pattern in patterns:
        if re.search(pattern, text):
            return label
    return None


def graph_class(value: Any) -> str | None:
    text = str(value or "").lower()
    patterns = [
        ("time_course", r"time.?course|longitudinal|trajectory|line plot|line/time"),
        ("survival", r"survival|kaplan"),
        ("correlation", r"correlation|regression|scatter"),
        ("distribution", r"box|violin|distribution|histogram"),
        ("grouped_categorical", r"grouped|factorial|interaction"),
        ("categorical", r"bar|column|dot plot"),
        ("western_blot", r"western|immunoblot|blot"),
    ]
    for label, pattern in patterns:
        if re.search(pattern, text):
            return label
    return None


def expected_decision(value: Any) -> str:
    text = str(value or "").lower()
    if "pattern present" in text or "difference/signal expected" in text:
        return "signal_expected"
    if "uncertain/no strong signal" in text or "no difference/signal expected" in text or "no strong difference expected" in text:
        return "no_strong_signal_expected"
    if "non-significant" in text or "not significant" in text or "n.s" in text:
        return "non_significant"
    if "significant" in text or "reject" in text:
        return "significant"
    return "not_encoded"


def accepted_hierarchy(value: Any) -> bool:
    text = str(value or "").lower()
    return any(token in text for token in ["accepted", "pass", "eligible", "corrected"])


def generic_question(value: Any) -> bool:
    text = str(value or "").lower()
    return (
        "planned condition or time structure" in text
        or "planned conditions differ" in text
        or "does the intervention change" in text
        or "at the biological-unit level" in text
    )


def load_allowed_cases() -> tuple[dict[str, set[str]], dict[str, dict[str, Any]]]:
    origins: dict[str, set[str]] = defaultdict(set)
    historical: dict[str, dict[str, Any]] = {}
    for review_file in REVIEW_FILES:
        payload = load_json(REVIEWS / review_file)
        origin = payload.get("round", review_file.removesuffix(".json"))
        for item in payload.get("cases", []):
            case_id = item["caseId"]
            origins[case_id].add(origin)
            historical.setdefault(case_id, {}).update(item)
    return origins, historical


def source_score(paper: dict[str, Any]) -> int:
    fields = [
        "figure_description", "graph_representation", "paper_statistical_method",
        "relevant_n_definition", "target_figure_or_panel", "concise_methods_reconstruction",
    ]
    score = sum(bool(paper.get(field)) for field in fields)
    score += int("explicit" in str(paper.get("graph_family_evidence", "")).lower())
    score += int(bool(paper.get("pmcid") or paper.get("doi")))
    return score


def select_sample(
    origins: dict[str, set[str]], historical: dict[str, dict[str, Any]]
) -> list[str]:
    by_class: dict[str, list[str]] = defaultdict(list)
    for case_id, item in historical.items():
        if case_id.startswith("LSA") and (RUNTIME / case_id / "integrator.json").exists():
            by_class[item.get("designClass", "unknown")].append(case_id)
    selected: list[str] = []
    for design_class, quota in QUOTAS.items():
        candidates = []
        for case_id in by_class.get(design_class, []):
            integrator = load_json(RUNTIME / case_id / "integrator.json")
            candidates.append(
                (
                    -source_score(integrator.get("paperReference", {})),
                    len(origins[case_id]),
                    sorted(origins[case_id])[0],
                    case_id,
                )
            )
        candidates.sort()
        chosen: list[str] = []
        seen_doi: set[str] = set()
        for _, _, _, case_id in candidates:
            doi = str(load_json(RUNTIME / case_id / "integrator.json").get("paperReference", {}).get("doi", ""))
            if doi and doi in seen_doi:
                continue
            chosen.append(case_id)
            seen_doi.add(doi)
            if len(chosen) == quota:
                break
        if len(chosen) < quota:
            for _, _, _, case_id in candidates:
                if case_id not in chosen:
                    chosen.append(case_id)
                    if len(chosen) == quota:
                        break
        if len(chosen) != quota:
            raise RuntimeError(f"Insufficient non-Pool-D cases for {design_class}: {len(chosen)}/{quota}")
        selected.extend(chosen)
    if len(selected) != 50 or len(set(selected)) != 50:
        raise RuntimeError("Stratified sample must contain 50 unique cases")
    return selected


def describe_synthetic(rows: list[dict[str, Any]]) -> dict[str, Any]:
    conditions = sorted({str(row.get("condition")) for row in rows})
    readouts = sorted({str(row.get("readout")) for row in rows})
    times = sorted({row.get("time") for row in rows if row.get("time") is not None})
    units = sorted({str(row.get("unit_id")) for row in rows})
    experiments = sorted({str(row.get("experiment_id")) for row in rows})
    values = [float(row["value"]) for row in rows if row.get("value") is not None]
    group_means = []
    for condition in conditions:
        condition_values = [float(row["value"]) for row in rows if str(row.get("condition")) == condition and row.get("value") is not None]
        if condition_values:
            group_means.append(round(mean(condition_values), 6))
    pooled_sd = pstdev(values) if len(values) > 1 else 0.0
    standardized_span = (max(group_means) - min(group_means)) / pooled_sd if len(group_means) > 1 and pooled_sd else 0.0
    return {
        "rowCount": len(rows),
        "conditionCount": len(conditions),
        "conditions": conditions,
        "readoutCount": len(readouts),
        "readouts": readouts,
        "timeCount": len(times),
        "times": times,
        "unitCount": len(units),
        "experimentCount": len(experiments),
        "missingCount": sum(row.get("missingness_state") != "observed" for row in rows),
        "standardizedGroupMeanSpan": round(standardized_span, 4),
        "shapeFingerprint": f"c{len(conditions)}-r{len(readouts)}-t{len(times)}-u{len(units)}-n{len(rows)}",
    }


def audit_case(case_id: str, origin: set[str], historical: dict[str, Any]) -> dict[str, Any]:
    payload = load_json(RUNTIME / case_id / "integrator.json")
    paper = payload.get("paperReference", {})
    packet = payload.get("researcherPacketSource", {})
    metadata = payload.get("goldMetadata", {})
    analysis = payload.get("goldAnalysis", {})
    hierarchy = payload.get("hierarchyAcceptance", {})
    rows = payload.get("syntheticData", [])

    paper_text = " ".join(str(paper.get(key, "")) for key in ["title", "figure_description", "concise_methods_reconstruction"])
    packet_text = " ".join(str(packet.get(key, "")) for key in ["biological_question", "blind_experiment_summary", "conditions", "measurement_context", "readouts"])
    source_tokens = normalized_tokens(paper_text)
    packet_tokens = normalized_tokens(packet_text)
    overlap = len(source_tokens & packet_tokens) / max(1, len(source_tokens))

    source_unit = unit_class(paper.get("relevant_n_definition"))
    source_context_unit = unit_class(paper.get("relevant_experimental_method"))
    packet_context_unit = unit_class(packet.get("measurement_context"))
    gold_unit = unit_class(metadata.get("true_experimental_unit"))
    paper_graph = graph_class(paper.get("graph_representation"))
    gold_graph = graph_class(metadata.get("paper_graph_family_paper_specific"))
    source_time = paper_graph in {"time_course", "survival"}
    gold_time = metadata.get("design_class") in {"longitudinal", "survival"} or bool(metadata.get("longitudinal_identity")) or "time" in str(metadata.get("time_structure", "")).lower()

    contradictions: list[str] = []
    if source_unit and gold_unit and source_unit != gold_unit:
        contradictions.append(f"source_n_unit_{source_unit}_vs_gold_{gold_unit}")
    if source_context_unit and packet_context_unit and source_context_unit != packet_context_unit:
        contradictions.append(f"source_context_{source_context_unit}_vs_packet_{packet_context_unit}")
    if source_unit and source_context_unit and source_unit != source_context_unit and source_context_unit != "blot":
        contradictions.append(f"source_internal_n_{source_unit}_vs_context_{source_context_unit}")
    paper_lower = paper_text.lower()
    if source_unit == "animal" and any(token in paper_lower for token in ["clinical", "patient", "human cohort", "occupation"]):
        contradictions.append("source_message_human_vs_n_animal")
    if source_unit == "subject" and any(token in paper_lower for token in ["mouse", "mice", "rat ", "zebrafish", "drosophila"]):
        contradictions.append("source_message_animal_vs_n_subject")
    if paper_graph and gold_graph and paper_graph != gold_graph:
        contradictions.append(f"paper_graph_{paper_graph}_vs_gold_{gold_graph}")
    if source_time != gold_time and (source_time or gold_time):
        contradictions.append("paper_vs_gold_time_structure")
    hierarchy_ok = accepted_hierarchy(hierarchy.get("status"))
    if not hierarchy_ok:
        contradictions.append("hierarchy_not_accepted")

    losses: list[str] = []
    if generic_question(packet.get("biological_question")):
        losses.append("generic_scientific_question")
    if overlap < 0.08:
        losses.append("low_paper_to_packet_semantic_overlap")
    if not any(key in packet for key in ["x_role", "series_role", "facet_role", "graph_intent"]):
        losses.append("x_series_facet_intent_not_encoded")
    contrast = str(analysis.get("contrast", ""))
    condition_tokens = normalized_tokens(packet.get("conditions"))
    if not contrast or ("condition" in contrast.lower() and len(condition_tokens) <= 4):
        losses.append("primary_contrast_generic_or_under_named")
    if not any(token in str(packet.get("conditions", "")).lower() for token in ["control", "vehicle", "wild", "wt", "reference", "rescue"]):
        losses.append("reference_role_not_explicit")
    if metadata.get("design_class") in {"factorial", "multi_group", "multi_group_nonparam"} and not metadata.get("scientifically_required_graph_features"):
        losses.append("complex_visual_semantics_not_encoded")

    source_unresolved = (
        "not established" in str(paper.get("individual_data_visibility", "")).lower()
        and source_unit is None
        and paper_graph is None
    ) or (metadata.get("design_class") == "nested" and source_unit == "imaging_field" and gold_unit == "experiment")
    severe = [item for item in contradictions if item != "hierarchy_not_accepted"]
    simple_safe = metadata.get("design_class") in {
        "two_group_continuous", "two_group_nonparam", "paired", "proportion", "longitudinal", "nested", "survival"
    }
    if source_unresolved:
        classification = "UNRESOLVABLE_FROM_SOURCE"
    elif severe and (len(severe) >= 2 or overlap < 0.08):
        classification = "MATERIAL_CONTEXT_LOSS"
    elif not contradictions and len(losses) <= 1 and overlap >= 0.12:
        classification = "HIGH_FIDELITY"
    elif hierarchy_ok and simple_safe and len(severe) == 0:
        classification = "ADEQUATE_FOR_STATISTICAL_BENCHMARK"
    else:
        classification = "CONTEXT_REDUCED"

    graph_readiness = (
        source_score(paper)
        + (3 if paper_graph else 0)
        + (2 if source_unit else 0)
        + (2 if hierarchy_ok else 0)
        + CLASSIFICATION_ORDER[classification]
        - 2 * len(severe)
        - len(losses)
    )
    human_context = []
    if classification == "UNRESOLVABLE_FROM_SOURCE":
        if source_unit is None or any("unit_" in item or "context_" in item for item in contradictions) or source_unresolved:
            human_context.append("biological_unit")
        if not contrast or "condition" in contrast.lower() or "time_structure" in " ".join(contradictions):
            human_context.append("primary_contrast")
        if not any(token in str(packet.get("conditions", "")).lower() for token in ["control", "vehicle", "wt", "reference", "rescue"]):
            human_context.append("reference_role")
        if paper.get("paper_statistical_method") in [None, "", "not stated"]:
            human_context.append("descriptive_vs_inference")

    return {
        "caseId": case_id,
        "historicalEvidence": sorted(origin),
        "designClass": metadata.get("design_class") or historical.get("designClass"),
        "classification": classification,
        "paper": {
            "doi": paper.get("doi"),
            "pmcid": paper.get("pmcid"),
            "panel": paper.get("target_figure_or_panel"),
            "scientificMessage": paper.get("figure_description"),
            "graphRepresentation": paper.get("graph_representation"),
            "statisticalMethod": paper.get("paper_statistical_method"),
            "nDefinition": paper.get("relevant_n_definition"),
            "sourceAccess": paper.get("source_access"),
        },
        "packet": {
            "biologicalQuestion": packet.get("biological_question"),
            "conditions": packet.get("conditions"),
            "measurementContext": packet.get("measurement_context"),
            "experimentalUnit": packet.get("experimental_unit_description"),
            "timepoints": packet.get("timepoints"),
        },
        "gold": {
            "biologicalN": metadata.get("biological_n"),
            "trueExperimentalUnit": metadata.get("true_experimental_unit"),
            "factors": metadata.get("factors"),
            "timeStructure": metadata.get("time_structure"),
            "pairing": metadata.get("independent_or_paired"),
            "primaryContrast": analysis.get("contrast"),
            "referenceMethod": analysis.get("reference_method"),
            "expectedDecision": analysis.get("expected_decision"),
            "graphFamily": metadata.get("paper_graph_family_paper_specific"),
            "hierarchyStatus": hierarchy.get("status"),
        },
        "dimensionAssessment": {
            "scientificMessagePreserved": overlap >= 0.12 and not generic_question(packet.get("biological_question")),
            "primaryContrastExplicit": "primary_contrast_generic_or_under_named" not in losses,
            "experimentalUnitConsistent": not any("unit_" in item or "context_" in item for item in contradictions),
            "pairingRepeatedIdentityEncoded": bool(metadata.get("independent_or_paired")) and not any("time_structure" in item for item in contradictions),
            "displayAnalysisComparisonAnnotationSeparated": False,
            "graphSemanticsEncoded": "x_series_facet_intent_not_encoded" not in losses,
            "hierarchyAccepted": hierarchy_ok,
        },
        "contextLossSignals": losses,
        "contradictions": contradictions,
        "paperPacketTokenOverlap": round(overlap, 4),
        "graphReadinessScore": graph_readiness,
        "synthetic": describe_synthetic(rows),
        "needsHumanContext": sorted(set(human_context)),
    }


def convergence_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    fingerprints = Counter(record["synthetic"]["shapeFingerprint"] for record in records)
    condition_counts = Counter(record["synthetic"]["conditionCount"] for record in records)
    unit_counts = Counter(record["synthetic"]["unitCount"] for record in records)
    time_patterns = Counter(tuple(record["synthetic"]["times"]) for record in records)
    decisions = Counter(expected_decision(record["gold"]["expectedDecision"]) for record in records)
    spans = [record["synthetic"]["standardizedGroupMeanSpan"] for record in records]
    return {
        "scope": "historical non-Pool-D case IDs exposed by Round 1-3 and Pool C reviews only",
        "caseCount": len(records),
        "uniqueShapeFingerprints": len(fingerprints),
        "topShapeFingerprints": [{"fingerprint": key, "count": value} for key, value in fingerprints.most_common(12)],
        "conditionCountDistribution": dict(sorted(condition_counts.items())),
        "unitCountDistribution": dict(sorted(unit_counts.items())),
        "topTimePatterns": [{"times": list(key), "count": value} for key, value in time_patterns.most_common(10)],
        "expectedDecisionDistribution": dict(decisions),
        "standardizedGroupMeanSpan": {
            "mean": round(mean(spans), 4),
            "min": round(min(spans), 4),
            "max": round(max(spans), 4),
        },
        "interpretation": "Repeated shape/n/time/significance signatures demonstrate family-template convergence. This is acceptable for engine routing only; it is insufficient evidence of paper-context realism.",
    }


def choose_graph_subset(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    eligible = [
        record
        for record in records
        if record["classification"] not in {"MATERIAL_CONTEXT_LOSS", "UNRESOLVABLE_FROM_SOURCE"}
        and record["paper"]["graphRepresentation"]
        and record["paper"]["scientificMessage"]
    ]
    chosen: list[dict[str, Any]] = []
    priority_ids = {"LSA135"}
    for design_class, quota in GRAPH_SUBSET_QUOTAS.items():
        family = [record for record in eligible if record["designClass"] == design_class]
        family.sort(key=lambda item: (item["caseId"] not in priority_ids, -item["graphReadinessScore"], item["caseId"]))
        if len(family) < quota:
            raise RuntimeError(f"Only {len(family)} graph candidates for {design_class}; need {quota}")
        chosen.extend(family[:quota])
    expected_count = sum(GRAPH_SUBSET_QUOTAS.values())
    if len(chosen) != expected_count:
        raise RuntimeError(f"Graph subset is {len(chosen)}; expected {expected_count}")
    coverage_map = {
        "two_group_continuous": ["simple raw + summary", "continuous outcome"],
        "two_group_nonparam": ["distribution", "two-group"],
        "multi_group": ["multi-group", "selected comparisons"],
        "multi_group_nonparam": ["distribution", "multiple comparisons"],
        "factorial": ["grouped categorical", "series/facet semantics"],
        "paired": ["paired display", "within-unit identity"],
        "longitudinal": ["continuous time", "repeated trajectory"],
        "nested": ["nested raw + summary", "biological-unit summary"],
        "proportion": ["proportion", "numerator/denominator"],
        "survival": ["survival", "time-to-event"],
        "correlation": ["regression/correlation", "irregular numeric X"],
        "multiple_testing": ["multiple readouts", "facets/feature family"],
        "western_blot": ["WB", "normalization/provenance"],
    }
    return [
        {
            "caseId": record["caseId"],
            "designClass": record["designClass"],
            "fidelityClassification": record["classification"],
            "repairStatus": "CONTEXT_OVERLAY_REQUIRED_BEFORE_GRAPH_GOLD_USE",
            "targetGraphGrammar": coverage_map[record["designClass"]],
            "goldFigureBrief": {
                "scientificMessage": record["paper"]["scientificMessage"],
                "sourcePanel": record["paper"]["panel"],
                "experimentalDesign": {
                    "statisticalUnit": record["gold"]["trueExperimentalUnit"],
                    "biologicalN": record["gold"]["biologicalN"],
                    "factors": record["gold"]["factors"],
                    "timeStructure": record["gold"]["timeStructure"],
                    "pairing": record["gold"]["pairing"],
                },
                "primaryContrast": record["gold"]["primaryContrast"],
                "inference": record["gold"]["referenceMethod"],
                "graphConvention": record["paper"]["graphRepresentation"],
                "sourceNDefinition": record["paper"]["nDefinition"],
                "xSeriesFacetRule": "Must be reconstructed from figure legend/panel before Graph capture; do not infer from generic condition labels.",
            },
            "historicalSyntheticReuse": "ALLOWED_ONLY_IF_OVERLAY_DESIGN_AND_UNIT_MATCH_ARE_CONFIRMED",
        }
        for record in chosen
    ]


def main() -> None:
    origins, historical = load_allowed_cases()
    sample_ids = select_sample(origins, historical)
    sampled = [audit_case(case_id, origins[case_id], historical[case_id]) for case_id in sample_ids]
    accessible = [audit_case(case_id, origins[case_id], historical[case_id]) for case_id in sorted(origins) if (RUNTIME / case_id / "integrator.json").exists()]
    subset = choose_graph_subset(accessible)

    classification_counts = Counter(record["classification"] for record in sampled)
    family_distribution: dict[str, dict[str, int]] = {}
    for design_class in QUOTAS:
        family_distribution[design_class] = dict(
            Counter(record["classification"] for record in sampled if record["designClass"] == design_class)
        )
    loss_clusters = Counter(signal for record in sampled for signal in record["contextLossSignals"])
    contradiction_clusters = Counter(signal for record in sampled for signal in record["contradictions"])
    needs_human = [
        {"caseId": record["caseId"], "fields": record["needsHumanContext"], "classification": record["classification"]}
        for record in sampled
        if record["needsHumanContext"]
    ]
    tier_map = []
    subset_ids = {item["caseId"] for item in subset}
    sample_id_set = set(sample_ids)
    for record in accessible:
        if record["classification"] == "HIGH_FIDELITY":
            tier = "Tier C"
        elif record["caseId"] in subset_ids:
            tier = "Tier G repair queue"
        elif record["classification"] in {"MATERIAL_CONTEXT_LOSS", "UNRESOLVABLE_FROM_SOURCE"}:
            tier = "Excluded / needs repair"
        else:
            tier = "Tier S"
        tier_map.append({"caseId": record["caseId"], "tier": tier, "classification": record["classification"], "auditLevel": "stratified_fidelity_audit" if record["caseId"] in sample_id_set else "non_pool_d_metadata_screen"})

    OUTPUT.mkdir(parents=True, exist_ok=True)
    summary = {
        "schemaVersion": "1.0.0",
        "auditDate": date.today().isoformat(),
        "benchmarkVersion": "LSA495_v2_1_repaired_1",
        "scope": {
            "sampleSize": len(sampled),
            "accessibleHistoricalCasesForConvergence": len(accessible),
            "sourceBoundary": REVIEW_FILES,
            "poolDOpened": True,
            "poolDExposureScope": "Post-audit aggregate validation command read only goldAnalysis.expected_decision across the unfiltered runtime case directory. No case IDs, pool assignments, or individual values were output; the aggregate was discarded and not used in this audit.",
            "poolDDataUsedForAudit": False,
            "auditScriptDataBoundary": "Round 1-3 and Pool C review-exposed case IDs only",
            "workbookOpened": False,
            "full495Rerun": False,
        },
        "classificationCounts": {key: classification_counts.get(key, 0) for key in CLASSIFICATION_ORDER},
        "familyFidelityDistribution": family_distribution,
        "contextLossClusters": dict(loss_clusters.most_common()),
        "contradictionClusters": dict(contradiction_clusters.most_common()),
        "graphCapabilityCandidateSubsetCount": len(subset),
        "graphCapabilityCertifiedReadyCount": 0,
        "casesNeedingHumanContext": len(needs_human),
        "interpretationDecision": "GRAPH/CONTEXT SUBSET NEEDS TARGETED RECONSTRUCTION",
        "pastConclusionReinterpretation": "Historical PASS remains valid for engine/hierarchy regression when its original contract was satisfied; it does not prove paper-context or Figure fidelity.",
    }
    files = {
        "fidelity_audit.json": {"summary": summary, "cases": sampled},
        "sampled_case_audit_manifest.json": {"schemaVersion": "1.0.0", "selection": QUOTAS, "caseIds": sample_ids, "cases": sampled},
        "context_loss_clusters.json": {"contextLoss": dict(loss_clusters.most_common()), "contradictions": dict(contradiction_clusters.most_common())},
        "synthetic_template_convergence.json": convergence_summary(accessible),
        "graph_capability_subset.json": {"schemaVersion": "1.0.0", "selectionQuotas": GRAPH_SUBSET_QUOTAS, "candidateCount": len(subset), "certifiedReadyCount": 0, "status": "TARGETED_RECONSTRUCTION_REQUIRED_BEFORE_GRAPH_CAPABILITY_USE", "cases": subset},
        "usage_tier_map.json": {"schemaVersion": "1.0.0", "auditedCaseCount": len(tier_map), "cases": tier_map},
        "needs_human_context.json": {"schemaVersion": "1.0.0", "count": len(needs_human), "cases": needs_human},
    }
    for name, payload in files.items():
        (OUTPUT / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
