#!/usr/bin/env python3
"""Build the approved Personal Figure Round 2 synthetic runtime.

The generator is deterministic and writes only to runtime_round_2. It never
modifies the workbook-derived v1 runtime or either sealed benchmark source.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import random
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "benchmark/personal_figure_v1/runtime_round_2"
SEED = 20260825

PAPERS = {
    "NDEL1": {
        "title": "Ndel1 suppresses ciliogenesis in proliferating cells by regulating the trichoplein-Aurora A pathway",
        "doi": "10.1083/jcb.201507046",
        "article_url": "https://rupress.org/jcb/article/212/4/409/38478/Ndel1-suppresses-ciliogenesis-in-proliferating",
    },
    "OPTO": {
        "title": "Optogenetic control of small GTPases reveals RhoA mediates intracellular calcium signaling",
        "doi": "10.1016/j.jbc.2021.100290",
        "article_url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC7949103/",
    },
    "GFLB": {
        "title": "The F-actin-binding RapGEF GflB is required for efficient macropinocytosis in Dictyostelium",
        "doi": "10.1242/jcs.194126",
        "article_url": "https://journals.biologists.com/jcs/article/130/18/3158/56373/The-F-actin-binding-RapGEF-GflB-is-required-for",
    },
    "CRYO": {
        "title": "Cryo-ET of actin cytoskeleton and membrane structure in lamellipodia formation using optogenetics",
        "doi": "10.1016/j.isci.2025.112529",
        "article_url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12136925/",
    },
}


def row(case: str, index: int, *, condition: str, unit: str, experiment: str,
        value: float, readout: str, time: float | None = None,
        time_unit: str | None = None, parent: str | None = None,
        numerator: int | None = None, denominator: int | None = None) -> dict[str, Any]:
    return {
        "case_id": case, "condition": condition, "denominator": denominator,
        "event": None, "experiment_id": experiment, "missingness_state": "observed",
        "numerator": numerator, "observation_id": f"{case}_R2_O{index:06d}",
        "parent_unit_id": parent, "readout": readout, "seed": SEED,
        "synthetic": True, "technical_replicate_id": None, "time": time,
        "time_unit": time_unit, "unit_id": unit, "value": round(value, 6), "x_value": None,
    }


def case(case_id: str, paper: str, panel: str, analysis: str, question: str,
         conditions: list[str], unit: str, context: str, rows: list[dict[str, Any]],
         timepoints: str = "none", repeated: str = "No repeated identity is implied across conditions or time.",
         nesting: str = "No lower-level nesting.", control: str | None = None,
         descriptive_only: bool = False) -> dict[str, Any]:
    return {
        "benchmarkVersion": "LSA_PERSONAL_FIGURE_v1_0_ROUND_2",
        "caseId": case_id,
        "paperReference": {**PAPERS[paper], "target_figure_or_panel": panel,
            "curated_graph_reference": context, "paper_reported_analysis": analysis},
        "researcherPacket": {
            "biological_question": question, "blind_experiment_summary": question,
            "case_id": case_id, "conditions": " | ".join(conditions),
            "experimental_unit_description": unit, "independent_session_count": 3,
            "measurement_context": context, "missingness_note": None,
            "nested_observation_note": nesting, "readouts": rows[0]["readout"],
            "repeated_identity_note": repeated, "timepoints": timepoints,
            "control_condition": control,
            "descriptive_only": descriptive_only,
        },
        "syntheticData": rows,
    }


def pfr002() -> dict[str, Any]:
    specs = [
        ("Ndel1-Myc; siNdel1; Dox−", [46, 52, 49]),
        ("Ndel1-Myc; siNdel1; Dox+", [15, 13, 17]),
        ("Ndel1-Myc; baseline reference", [12, 11, 14]),
        ("NDE1-Myc; siNdel1; Dox−", [45, 50, 48]),
        ("NDE1-Myc; siNdel1; Dox+", [39, 42, 37]),
        ("NDE1-Myc; baseline reference", [11, 13, 12]),
    ]
    rows, i = [], 0
    for cidx, (condition, percents) in enumerate(specs, 1):
        for eidx, percent in enumerate(percents, 1):
            i += 1; denominator = 120 + 7 * eidx + 3 * cidx
            numerator = round(denominator * percent / 100)
            rows.append(row("PFR002", i, condition=condition,
                unit=f"PFR002_C{cidx}_E{eidx}", experiment=f"PFR002_E{eidx}",
                value=numerator / denominator, readout="ciliated_fraction",
                numerator=numerator, denominator=denominator))
    return case("PFR002", "NDEL1", "Fig. 1F", "two-tailed unpaired Student's t-test",
        "Within each rescue cell line, does Dox rescue siNdel1-induced ciliation?",
        [x[0] for x in specs], "independent experiment", "ciliated fraction; bar plus points; mean ± SEM",
        rows)


def pfr004() -> dict[str, Any]:
    conditions = ["si control", "siNdel1 #1", "siNdel1 #2", "siNDE1 #1", "siNDE1 #2"]
    targets = {0: [64, 66, 63, 65, 64], 24: [10, 71, 62, 34, 41]}
    offsets = [-3, 1, 2]
    rows, i = [], 0
    for time in (0, 24):
        for cidx, condition in enumerate(conditions):
            for eidx, offset in enumerate(offsets, 1):
                i += 1; denominator = 124 + 5 * eidx + 2 * cidx
                percent = targets[time][cidx] + offset
                numerator = round(denominator * percent / 100)
                rows.append(row("PFR004", i, condition=condition,
                    unit=f"PFR004_{time}H_C{cidx + 1}_E{eidx}", experiment=f"PFR004_{time}H_E{eidx}",
                    value=numerator / denominator, readout="ciliated_fraction", time=time,
                    time_unit="h", numerator=numerator, denominator=denominator))
    return case("PFR004", "NDEL1", "Fig. 2A", "publication method not stated clearly",
        "At 0 h and 24 h separately, which knockdowns differ from si control?", conditions,
        "independent fixed-cell dish/experiment", "fixed-cell ciliated fraction; grouped bars plus points; mean ± SEM",
        rows, "0 h and 24 h; separate dishes", "No repeated identity is implied across conditions or time.",
        control="si control")


def pfr025() -> dict[str, Any]:
    conditions = ["Activated ROI", "Control ROI"]
    rows, i = [], 0
    for time in range(0, 901, 20):
        phase = max(0.0, min(1.0, (time - 300) / 170))
        decay = max(0.0, (time - 600) / 300)
        activated = 1.0 + 0.30 * phase - 0.43 * decay + 0.012 * math.sin(time / 45)
        control = 1.0 + 0.08 * phase - 0.04 * decay + 0.008 * math.sin(time / 55 + 0.5)
        for condition, value in zip(conditions, (activated, control)):
            i += 1
            rows.append(row("PFR025", i, condition=condition, unit="PFR025_CELL01",
                experiment="PFR025_CELL01", value=value, readout="normalized_fluorescence",
                time=time, time_unit="s"))
    return case("PFR025", "OPTO", "Fig. 1D top", "descriptive; repeated seven times",
        "How do activated and control ROIs in one representative cell change during local activation?",
        conditions, "representative cell", "normalized fluorescence; overlaid trajectories; activation 300–600 s",
        rows, "0–900 s", "The same cell is measured across both ROI conditions and all time points.",
        descriptive_only=True)


def pfr046() -> dict[str, Any]:
    rng = random.Random(SEED + 46)
    specs = [("si control", 61, 0.43, 0.76), ("siPLCε sequence 1", 58, 0.45, 0.48),
             ("siPLCε sequence 3", 72, 0.44, 0.60)]
    rows, i = [], 0
    for cidx, (condition, count, dark_mean, lit_mean) in enumerate(specs, 1):
        for cell_index in range(count):
            exp = 1 + (cell_index % 3)
            cell = f"PFR046_C{cidx}_CELL{cell_index + 1:03d}"
            dark = max(0.18, rng.gauss(dark_mean + (exp - 2) * 0.018, 0.085))
            lit = max(0.2, dark * rng.gauss(lit_mean / dark_mean, 0.18))
            for time, value in ((0, dark), (5, lit)):
                i += 1
                rows.append(row("PFR046", i, condition=condition, unit=cell,
                    experiment=f"PFR046_E{exp}", parent=f"PFR046_E{exp}", value=value,
                    readout="nuclear_to_cytosol_ratio", time=time, time_unit="min"))
    return case("PFR046", "OPTO", "Fig. 7C,D",
        "paired t-test within groups; one-way ANOVA with Tukey comparisons for fold change",
        "How does light change nuclear translocation in each siRNA group, and do Lit/dark fold changes differ among groups?",
        [x[0] for x in specs], "independent experiment", "dark versus Lit nuclear/cytosol ratio; raw cells plus mean ± SD",
        rows, "dark (0 min) and Lit (5 min)", "Cells are repeated across dark and Lit within condition.",
        "Cell-level observations are nested within three independent experiments.")


def pfr049() -> dict[str, Any]:
    rng = random.Random(SEED + 49)
    specs = [("AX2 (WT)", 75, 0.72), ("gflB-KO", 75, 0.57), ("AX2(GFP-GflB)", 75, 0.84)]
    rows, i = [], 0
    for cidx, (condition, count, mean) in enumerate(specs, 1):
        for cell_index in range(count):
            exp = 1 + (cell_index % 3); i += 1
            value = min(0.98, max(0.25, rng.gauss(mean + (exp - 2) * 0.012, 0.075)))
            rows.append(row("PFR049", i, condition=condition,
                unit=f"PFR049_C{cidx}_CELL{cell_index + 1:03d}", experiment=f"PFR049_E{exp}",
                parent=f"PFR049_E{exp}", value=value, readout="circularity"))
    return case("PFR049", "GFLB", "Fig. 1C", "two-tailed unpaired Student's t-test",
        "How do gflB loss and GFP-GflB expression change circularity relative to AX2 WT?",
        [x[0] for x in specs], "independent imaging session", "cell circularity; unfilled distribution with raw cells and session summaries",
        rows, nesting="Cell-level observations are nested within three independent imaging sessions.", control="AX2 (WT)")


def pfr069() -> dict[str, Any]:
    rng = random.Random(SEED + 69)
    rows, i = [], 0
    cell_offsets = [rng.gauss(0, 0.012) for _ in range(6)]
    for cell_index, offset in enumerate(cell_offsets, 1):
        for step in range(91):
            time = -5 + step / 6
            response = 0 if time < 0 else 0.075 * (1 - math.exp(-time / 1.4))
            value = 1 + offset + response + 0.007 * math.sin(time * 1.3 + cell_index)
            i += 1
            rows.append(row("PFR069", i, condition="Photoactivation", unit=f"PFR069_CELL{cell_index:02d}",
                experiment=f"PFR069_CELL{cell_index:02d}", value=value, readout="normalized_cell_area",
                time=time, time_unit="min"))
    return case("PFR069", "CRYO", "Fig. 1F", "descriptive; no inferential test",
        "How does normalized cell area change during photoactivation?", ["Photoactivation"],
        "cell", "normalized cell area; mean ± SD; activation 0–10 min; freezing near 2 min",
        rows, "−5 to 10 min every 10 s", "The same six cells are followed across all time points.",
        descriptive_only=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    cases = [pfr002(), pfr004(), pfr025(), pfr046(), pfr049(), pfr069()]
    for payload in cases:
        target = args.output / "cases" / payload["caseId"] / "experimenter_track_a.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    manifest = {"schemaVersion": "1.0.0", "benchmarkVersion": "LSA_PERSONAL_FIGURE_v1_0_ROUND_2",
                "seed": SEED, "goldBrief": "docs/alpha/PERSONAL_FIGURE_GOLD_BRIEFS_2026-08-25.md",
                "caseIds": [payload["caseId"] for payload in cases]}
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


if __name__ == "__main__":
    main()
