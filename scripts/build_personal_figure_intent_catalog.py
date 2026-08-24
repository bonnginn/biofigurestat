#!/usr/bin/env python3
"""Build a source-traceable intent catalog from the existing personal benchmark.

This script is deliberately read-only with respect to benchmark evidence.  It does
not create synthetic observations, execute the app, or render graphs.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median


ROOT = Path(__file__).resolve().parents[1]
CASES = ROOT / "benchmark" / "personal_figure_v1" / "runtime" / "cases"
OUT_DIR = ROOT / "docs" / "alpha" / "nightly"
JSON_OUT = OUT_DIR / "PERSONAL_PUBLISHED_FIGURE_INTENT_CATALOG_2026-08-25.json"
MD_OUT = OUT_DIR / "PERSONAL_PUBLISHED_FIGURE_INTENT_CATALOG_2026-08-25.md"

CONFIRMED_PAPER = "CONFIRMED_FROM_PAPER"
CONFIRMED_METHODS = "CONFIRMED_FROM_METHODS"
INFERRED = "INFERRED_HIGH_CONFIDENCE"
UNCERTAIN = "UNCERTAIN"

PRIMARY_URL_OVERRIDES = {
    "CRYO": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12136925/",
}

CAPABILITY_DIMENSIONS = [
    "grouped categorical",
    "multiple series",
    "paired series",
    "independent visual series",
    "nested raw + summary",
    "continuous time",
    "irregular X",
    "distribution",
    "control-vs-many",
    "all-pairs annotation",
    "rescue",
    "auxiliary reference",
    "log axis",
    "survival",
    "regression",
    "descriptive-only",
    "multiple readouts",
]


def unique(values):
    return list(dict.fromkeys(value for value in values if value is not None))


def packet_conditions(packet):
    return [value.strip() for value in packet["conditions"].split("|") if value.strip()]


def packet_time_values(packet):
    text = packet.get("timepoints") or ""
    return [float(value) for value in re.findall(r"(?<![A-Za-z])[-−]?\d+(?:\.\d+)?", text.replace("−", "-"))]


def packet_time_unit(packet):
    text = packet.get("timepoints") or ""
    matches = re.findall(r"(?<![A-Za-z])(ms|s|min|h)(?![A-Za-z])", text)
    return matches[-1] if matches else None


def factor_records(case_id, metadata, packet):
    names = [part.strip() for part in metadata["factors"].split(";") if part.strip()]
    conditions = packet_conditions(packet)
    times = packet_time_values(packet)
    time_unit = packet_time_unit(packet)
    factors = []
    for name in names:
        if name == "time":
            levels = [f"{value:g} {time_unit}" if time_unit else f"{value:g}" for value in times]
            factors.append(
                {
                    "id": "time",
                    "label": "Time",
                    "levels": levels,
                    "scientificRole": "time",
                    "relationship": "within-unit" if metadata["repeated_measures"] else "between-unit/cross-sectional",
                    "confidence": INFERRED,
                }
            )
        else:
            factors.append(
                {
                    "id": name.lower().replace(" ", "_"),
                    "label": name.title(),
                    "levels": conditions,
                    "scientificRole": "other",
                    "relationship": (
                        "within-unit/repeated; exact factor assignment needs confirmation"
                        if metadata["repeated_measures"]
                        else "between-unit unless separately stated"
                    ),
                    "confidence": INFERRED,
                }
            )

    # User-approved Round-2 briefs resolve these especially important visual
    # decompositions, but the catalog retains INFERRED rather than Gold confidence.
    if case_id == "PFR002":
        factors = [
            {
                "id": "rescue_cell_line",
                "label": "Rescue cell line",
                "levels": ["Ndel1-Myc", "NDE1-Myc"],
                "scientificRole": "rescue",
                "relationship": "between-unit",
                "confidence": INFERRED,
            },
            {
                "id": "dox",
                "label": "Dox",
                "levels": ["Dox−", "Dox+"],
                "scientificRole": "intervention",
                "relationship": "between-unit",
                "confidence": INFERRED,
            },
            {
                "id": "baseline_reference",
                "label": "Baseline",
                "levels": ["baseline"],
                "scientificRole": "auxiliary_reference",
                "relationship": "display-only reference outside the primary contrast family",
                "confidence": INFERRED,
            },
        ]
    elif case_id in {"PFR046", "PFR047"}:
        factors = [
            {
                "id": "intervention",
                "label": "Intervention",
                "levels": conditions,
                "scientificRole": "intervention",
                "relationship": "between-cell groups",
                "confidence": INFERRED,
            },
            {
                "id": "illumination_state",
                "label": "Illumination state",
                "levels": ["Dark", "Lit"],
                "scientificRole": "state",
                "relationship": "within-cell paired",
                "confidence": INFERRED,
            },
        ]
    elif case_id == "PFR069":
        factors = [
            {
                "id": "condition",
                "label": "Condition",
                "levels": ["PA-Rac1 photoactivation"],
                "scientificRole": "intervention",
                "relationship": "single cohort",
                "confidence": INFERRED,
            },
            {
                "id": "time",
                "label": "Time",
                "levels": ["−5 to 10 min, every 10 s"],
                "scientificRole": "time",
                "relationship": "within-cell repeated",
                "confidence": INFERRED,
            },
        ]
    return factors


def visual_semantics(case_id, figure, metadata, factors):
    x = figure["x_axis"]
    series = None
    facet = None
    if case_id == "PFR002":
        x, series = "rescue_cell_line", "dox"
    elif case_id == "PFR004":
        x, series = "condition", "time"
    elif case_id in {"PFR046", "PFR047"}:
        x, series = "intervention", "illumination_state"
    elif x == "time" and any(
        factor["id"] != "time" and len(factor["levels"]) > 1 for factor in factors
    ):
        series = next(
            factor["id"]
            for factor in factors
            if factor["id"] != "time" and len(factor["levels"]) > 1
        )
    elif (
        x != "time"
        and "×" in figure["grouping_structure"]
        and any(factor["id"] == "time" for factor in factors)
    ):
        series = "time"
    return {
        "x": x,
        "series": series,
        "facet": facet,
        "confidence": INFERRED,
        "warning": "Visual series does not imply pairing; pairing is taken only from design metadata.",
    }


def capabilities(case_id, case, paper, metadata, figure, packet, visual):
    caps = set()
    design = case["design_class"]
    contrast = metadata["required_comparison_structure"].lower()
    method = paper["paper_statistical_method"].lower()
    graph = figure["paper_graph_family"].lower()
    readouts = [value.strip() for value in packet["readouts"].split("|") if value.strip()]
    x_values = packet_time_values(packet)

    if graph in {"bar", "box", "violin"}:
        caps.add("grouped categorical")
    if visual["series"]:
        caps.add("multiple series")
    if (visual["series"] and metadata["pairing"] != "independent") or design == "paired_cells":
        caps.add("paired series")
    if design == "cross_time":
        caps.add("independent visual series")
    if design in {"nested", "paired_cells"}:
        caps.add("nested raw + summary")
    if design in {"longitudinal", "cross_time", "wb"}:
        caps.add("continuous time")
    if len(x_values) >= 3:
        differences = [float(b) - float(a) for a, b in zip(x_values, x_values[1:])]
        typical = abs(median(differences))
        tolerance = max(1e-6, typical * 0.01)
        if case_id != "PFR069" and max(differences) - min(differences) > tolerance:
            caps.add("irregular X")
    if graph in {"box", "violin"}:
        caps.add("distribution")
    if any(token in contrast for token in ("versus control", "versus ax2", "versus wt", "each depletion versus control")):
        caps.add("control-vs-many")
    if "all-pairs" in contrast or "tukey" in method:
        caps.add("all-pairs annotation")
    if "rescue" in contrast or "rescue" in paper["biological_question"].lower():
        caps.add("rescue")
    if case_id == "PFR002":
        caps.add("auxiliary reference")
    if figure["log_axis"] != "none reported":
        caps.add("log axis")
    if method.startswith("descriptive") or case_id in {"PFR025", "PFR069"}:
        caps.add("descriptive-only")
    if len(readouts) > 1 or design == "wb":
        caps.add("multiple readouts")
    return sorted(caps)


def overall_confidence(paper):
    if paper["source_panel_certainty"] != "EXACT":
        return UNCERTAIN
    if paper["unresolved_ambiguity"] != "none":
        return INFERRED
    return CONFIRMED_PAPER


def control_reference_roles(case_id, factors, contrast):
    labels = [level for factor in factors for level in factor["levels"]]
    controls = [
        label
        for label in labels
        if any(token in str(label).lower() for token in ("control", "ctrl", "ax2", "wild type", "wt"))
    ]
    rescue = [label for label in labels if "rescue" in str(label).lower()]
    return {
        "controlOrWtCandidates": unique(controls),
        "rescueCandidates": unique(rescue),
        "auxiliaryReferenceCandidates": ["baseline"] if case_id == "PFR002" else [],
        "roleDefiningContrast": contrast,
        "confidence": INFERRED,
        "warning": "Candidate roles are not promoted to Gold without panel-level legend/Methods confirmation.",
    }


def make_entry(reviewer, experimenter):
    case = reviewer["case"]
    paper = reviewer["paperReference"]
    metadata = reviewer["goldMetadata"]
    figure = reviewer["goldFigureMetadata"]
    packet = experimenter["researcherPacket"]
    factors = factor_records(reviewer["caseId"], metadata, packet)
    visual = visual_semantics(reviewer["caseId"], figure, metadata, factors)
    method_known = paper["paper_statistical_method"] != "UNCERTAIN_FROM_PUBLICATION"
    descriptive = paper["paper_statistical_method"].lower().startswith("descriptive") or reviewer["caseId"] in {
        "PFR025",
        "PFR069",
    }
    factor_levels = {factor["id"]: factor["levels"] for factor in factors}
    return {
        "entryId": reviewer["caseId"],
        "paper": {
            "code": case["paper_code"],
            "title": paper["publication"],
            "doi": paper["doi"],
            "year": paper["year"],
            "journal": paper["journal"],
            "url": PRIMARY_URL_OVERRIDES.get(case["paper_code"], paper["article_url"]),
        },
        "figurePanel": paper["figure_panel"],
        "mainOrSupplementary": paper["main_or_supplementary"],
        "scientificMessage": paper["biological_question"],
        "experimentalDesign": {
            "designClass": case["design_class"],
            "description": paper["methods_reconstruction"],
            "factors": factors,
            "factorLevels": factor_levels,
            "primaryContrast": metadata["required_comparison_structure"],
            "statisticalUnit": metadata["experimental_unit"],
            "nesting": metadata["nested_structure"],
            "pairing": metadata["pairing"],
            "repeatedMeasures": metadata["repeated_measures"],
            "inference": "descriptive_only" if descriptive else "inferential_result_reported_or_required",
            "reportedMethod": paper["paper_statistical_method"],
            "controlWtRescueRoles": control_reference_roles(
                reviewer["caseId"], factors, metadata["required_comparison_structure"]
            ),
            "sampleSizeStructure": {
                "reportedBiologicalN": metadata["biological_n"],
                "definition": paper["relevant_n_definition"],
                "sessionStructure": metadata["session_structure"],
            },
        },
        "graphIntent": {
            "graphConvention": figure["paper_graph_family"],
            "acceptableGraphFamilies": figure["acceptable_graph_families"],
            "xSemantics": visual["x"],
            "seriesSemantics": visual["series"],
            "facetSemantics": visual["facet"],
            "yReadout": figure["y_axis"],
            "axisMeaning": {"x": figure["x_axis"], "y": figure["y_axis"], "logAxis": figure["log_axis"]},
            "summaryStatistic": figure["summary_statistic"],
            "errorRepresentation": figure["error_representation"],
            "individualPoints": figure["individual_points_visibility"],
            "repeatedTraces": figure["repeated_traces"],
            "colorMeaning": figure["color_symbol_semantics"],
            "legendMeaning": "Legend identifies the rendered condition/series semantics; exact published color mapping was not independently encoded.",
            "statisticalAnnotationMeaning": {
                "publishedConvention": figure["statistical_annotation"],
                "contrastIdentity": metadata["required_comparison_structure"],
                "confidence": CONFIRMED_PAPER,
            },
            "unusualPublicationConvention": (
                "Numerator/denominator must remain linked." if case["design_class"] == "proportion" else
                "Lower-level observations and biological-unit summaries must remain distinct." if case["design_class"] in {"nested", "paired_cells"} else
                "Cross-sectional time points must not be presented as repeated identities." if case["design_class"] == "cross_time" else
                "Repeated identity must be preserved across the numeric X axis." if case["design_class"] == "longitudinal" else
                "None identified from the catalog source."
            ),
            "visualRelationshipWarning": visual["warning"],
        },
        "candidateGraphCapabilities": capabilities(
            reviewer["caseId"], case, paper, metadata, figure, packet, visual
        ),
        "confidence": {
            "overall": overall_confidence(paper),
            "panelAndScientificMessage": CONFIRMED_PAPER if paper["source_panel_certainty"] == "EXACT" else UNCERTAIN,
            "methodsAndStatisticalUnit": CONFIRMED_METHODS if method_known else UNCERTAIN,
            "factorDecomposition": INFERRED,
            "visualRoleMapping": INFERRED,
            "exactColorAndLegendEncoding": UNCERTAIN,
            "sourceData": "UNCERTAIN",
            "sourcePanelCertaintyRaw": paper["source_panel_certainty"],
            "unresolvedAmbiguity": paper["unresolved_ambiguity"],
        },
        "provenance": {
            "publicationSourceAccess": paper["source_access"],
            "personalBenchmarkSource": f"benchmark/personal_figure_v1/runtime/cases/{reviewer['caseId']}/reviewer.json",
            "sourceDataUse": "No published numeric source data were used to create this intent-catalog entry.",
            "syntheticObservationUse": "The catalog builder does not read syntheticData values; it uses the source-summary packet and reviewer metadata only.",
            "catalogScope": "Intent only; no new synthetic data, app run, or graph generation.",
        },
    }


def build():
    entries = []
    for case_dir in sorted(CASES.iterdir()):
        if not case_dir.is_dir():
            continue
        with (case_dir / "reviewer.json").open(encoding="utf-8") as handle:
            reviewer = json.load(handle)
        with (case_dir / "experimenter_track_a.json").open(encoding="utf-8") as handle:
            experimenter = json.load(handle)
        entries.append(make_entry(reviewer, experimenter))

    papers = {}
    capability_map = defaultdict(list)
    for entry in entries:
        papers[entry["paper"]["code"]] = entry["paper"]
        for capability in entry["candidateGraphCapabilities"]:
            capability_map[capability].append(entry["entryId"])
    for capability in CAPABILITY_DIMENSIONS:
        capability_map.setdefault(capability, [])

    confidence_counts = Counter(entry["confidence"]["overall"] for entry in entries)
    placement_counts = Counter(entry["mainOrSupplementary"] for entry in entries)
    catalog = {
        "schemaVersion": "1.0.0",
        "catalogVersion": "PERSONAL_PUBLISHED_FIGURE_INTENT_2026-08-25",
        "generatedFrom": "Existing source-grounded personal benchmark metadata; no workbook opened.",
        "scope": {
            "papers": len(papers),
            "panelsOrScientificQuestions": len(entries),
            "mainEntries": placement_counts["Main"],
            "supplementaryEntries": placement_counts["Supplementary"],
            "existingRound2Cases": ["PFR002", "PFR004", "PFR025", "PFR046", "PFR049", "PFR069"],
            "newSyntheticDataCreated": False,
            "appRunsCreated": False,
            "graphsGenerated": False,
            "poolDOpened": False,
        },
        "confidenceVocabulary": [CONFIRMED_PAPER, CONFIRMED_METHODS, "CONFIRMED_FROM_SOURCE_DATA", INFERRED, UNCERTAIN],
        "confidenceDistributionForScientificIntentAnchor": dict(sorted(confidence_counts.items())),
        "papers": sorted(papers.values(), key=lambda item: item["code"]),
        "graphCapabilityCandidateMap": dict(sorted(capability_map.items())),
        "entries": entries,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_OUT.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    paper_counts = Counter(entry["paper"]["code"] for entry in entries)
    lines = [
        "# Personal Published Figure Intent Catalog",
        "",
        "Date: 2026-08-25  ",
        "Status: intent catalog only; human confirmation remains required before promoting inferred fields to Gold",
        "",
        "## 結論",
        "",
        f"既存の personal benchmark が参照する実在5論文から、{len(entries)}件の Figure/panel-level scientific question を catalog 化した。既存6ケースだけに限定せず、main figure と supplementary figure を含む。新しい synthetic data、app run、Graph artifact は作成していない。Pool D と benchmark workbook は開いていない。",
        f"内訳は main {placement_counts['Main']}件、supplementary {placement_counts['Supplementary']}件。",
        "",
        "この catalog は published Figure の意図を次の Graph capability audit 候補へ接続するための索引であり、推測を Gold に昇格させるものではない。特に factor 分解、visual-role mapping、色・凡例の厳密な意味は `INFERRED_HIGH_CONFIDENCE` または `UNCERTAIN` として明示した。",
        "",
        "## Coverage",
        "",
        "| Paper | DOI | Entries | Primary source |",
        "| --- | --- | ---: | --- |",
    ]
    for paper in sorted(papers.values(), key=lambda item: item["code"]):
        lines.append(f"| {paper['code']} — {paper['title']} | `{paper['doi']}` | {paper_counts[paper['code']]} | {paper['url']} |")
    lines.extend([
        "",
        "## Scientific-intent anchor confidence",
        "",
        "| Anchor confidence | Entries | Meaning |",
        "| --- | ---: | --- |",
        f"| `{CONFIRMED_PAPER}` | {confidence_counts[CONFIRMED_PAPER]} | Figure/panel and scientific question are directly identified in the paper record. |",
        f"| `{INFERRED}` | {confidence_counts[INFERRED]} | Figure is identifiable, but at least one method/panel-detail field remains reconstructed. |",
        f"| `{UNCERTAIN}` | {confidence_counts[UNCERTAIN]} | Figure is known but exact subpanel assignment is not secure. |",
        "",
        "No entry is marked `CONFIRMED_FROM_SOURCE_DATA`: published numeric source data were not used in this catalog pass.",
        "Condition/time labels and factor candidates retained from the existing source-grounded personal benchmark are not treated as direct source-data evidence; their field-level confidence remains `INFERRED_HIGH_CONFIDENCE` until panel-level re-check.",
        "",
        "## Graph Capability Audit candidate mapping",
        "",
        "The mapping is candidate routing, not a pass/fail benchmark and not a claim that the current app supports the dimension.",
        "",
        "| Capability dimension | Candidate entries |",
        "| --- | --- |",
    ])
    for capability, case_ids in sorted(capability_map.items()):
        lines.append(f"| {capability} | {', '.join(case_ids)} |")
    lines.extend([
        "",
        "Dimensions with no secure personal candidate in the current source set: survival, regression, and a confirmed log-axis panel. These should remain explicitly uncovered rather than be inferred from an unrelated panel.",
        "",
        "## Panel inventory",
        "",
        "| ID | Paper | Figure/panel | Scientific question | Design / visual candidate | Confidence |",
        "| --- | --- | --- | --- | --- | --- |",
    ])
    for entry in entries:
        question = entry["scientificMessage"].replace("|", "\\|")
        caps = ", ".join(entry["candidateGraphCapabilities"][:4]) or "basic categorical"
        lines.append(
            f"| {entry['entryId']} | {entry['paper']['code']} | {entry['figurePanel']} | {question} | "
            f"{entry['experimentalDesign']['designClass']}; {caps} | `{entry['confidence']['overall']}` |"
        )
    lines.extend([
        "",
        "## Interpretation guardrails",
        "",
        "- Visual proximity or a shared series color never establishes pairing. Pairing/repeated identity comes only from the experiment-design metadata.",
        "- `biologicalN` is retained together with its definition; nested cells, cilia, events, lanes, and technical observations are not silently promoted to biological n.",
        "- Published statistical-method text is recorded separately from any future app recommendation. An uncertain paper method remains `UNCERTAIN`.",
        "- Exact published color/legend semantics are not generally encoded in the existing benchmark metadata and therefore remain `UNCERTAIN` unless later checked panel-by-panel.",
        "- The four GFLB morphology entries PFR049–PFR052 have exact-Figure but uncertain-subpanel provenance; they are useful for capability exploration but should not be Gold panel-level regression cases yet.",
        "- PFR002, PFR004, PFR025, PFR046, PFR049, and PFR069 retain the separately approved Round-2 brief as the human-reviewed interpretation layer; this catalog does not overwrite it.",
        "",
        "## Recommended first candidate subset",
        "",
        "A compact feature-scoped set that extends beyond the existing six without generating new data yet:",
        "",
        "- grouped/independent time series: PFR001, PFR007, PFR012, PFR057;",
        "- rescue and auxiliary-reference pressure: PFR002, PFR008, PFR015, PFR016;",
        "- nested raw plus biological-unit summary: PFR005, PFR011, PFR018, PFR021, PFR054;",
        "- longitudinal and irregular numeric X: PFR025, PFR030, PFR035, PFR045, PFR069;",
        "- within-cell paired series: PFR046 and PFR047;",
        "- descriptive-only: PFR009, PFR010, PFR025, PFR034, PFR035, PFR045, PFR048, PFR057, PFR058, PFR060, PFR062, PFR066, PFR069;",
        "- multiple linked readouts: PFR009 and PFR010;",
        "- supplementary-figure coverage: PFR060 and PFR068.",
        "",
        "Before any candidate becomes a Gold Graph regression case, re-check its legend and Methods in the primary article and resolve every `UNCERTAIN` field relevant to the asserted capability.",
        "",
        "## Machine-readable companion",
        "",
        f"`{JSON_OUT.relative_to(ROOT).as_posix()}` contains all {len(entries)} entries with factors/levels, contrasts, unit identity, nesting/pairing, graph semantics, confidence by field, provenance, and candidate capability tags.",
    ])
    MD_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
