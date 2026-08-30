#!/usr/bin/env python3
"""Build Round 3 from the immutable Round 2 synthetic values.

Only runtime_round_3 is written. Round 1/2 evidence and sealed literature pools
are never read or modified. Graph intent is metadata for human/evaluation setup;
product code contains no case-specific branch.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path

import build_personal_figure_round_2 as round_2


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "benchmark/personal_figure_v1/runtime_round_3"
VERSION = "LSA_PERSONAL_FIGURE_v1_0_ROUND_3_GRAPH_CORE_V1"

GRAPH_INTENTS = {
    "PFR002": {
        "factors": [
            {"id": "rescue_cell_line", "label": "Rescue cell line", "scientificRole": "rescue",
             "unitRole": "between_unit", "relationship": "independent", "visualRole": "x"},
            {"id": "dox", "label": "Dox / reference", "scientificRole": "intervention",
             "unitRole": "between_unit", "relationship": "independent", "visualRole": "series"},
        ],
        "conditionFactors": {
            "Ndel1-Myc; siNdel1; Dox−": {"rescue_cell_line": "Ndel1-Myc", "dox": "Dox−"},
            "Ndel1-Myc; siNdel1; Dox+": {"rescue_cell_line": "Ndel1-Myc", "dox": "Dox+"},
            "Ndel1-Myc; baseline reference": {"rescue_cell_line": "Ndel1-Myc", "dox": "Baseline"},
            "NDE1-Myc; siNdel1; Dox−": {"rescue_cell_line": "NDE1-Myc", "dox": "Dox−"},
            "NDE1-Myc; siNdel1; Dox+": {"rescue_cell_line": "NDE1-Myc", "dox": "Dox+"},
            "NDE1-Myc; baseline reference": {"rescue_cell_line": "NDE1-Myc", "dox": "Baseline"},
        },
        "conditionRoles": {
            "Ndel1-Myc; baseline reference": "auxiliary_reference",
            "NDE1-Myc; baseline reference": "auxiliary_reference",
        },
        "comparisons": [
            {"id": "ndel1_dox", "label": "Ndel1-Myc: Dox− vs Dox+", "role": "primary",
             "conditions": ["Ndel1-Myc; siNdel1; Dox−", "Ndel1-Myc; siNdel1; Dox+"]},
            {"id": "nde1_dox", "label": "NDE1-Myc: Dox− vs Dox+", "role": "primary",
             "conditions": ["NDE1-Myc; siNdel1; Dox−", "NDE1-Myc; siNdel1; Dox+"]},
        ],
    },
    "PFR004": {
        "factors": [
            {"id": "sirna", "label": "siRNA", "scientificRole": "intervention",
             "unitRole": "between_unit", "relationship": "independent", "visualRole": "x"},
        ],
        "conditionFactors": {
            "si control": {"sirna": "si control"}, "siNdel1 #1": {"sirna": "siNdel1 #1"},
            "siNdel1 #2": {"sirna": "siNdel1 #2"}, "siNDE1 #1": {"sirna": "siNDE1 #1"},
            "siNDE1 #2": {"sirna": "siNDE1 #2"},
        },
        "timeVisualRole": "series",
    },
    "PFR025": {
        "factors": [
            {"id": "roi", "label": "ROI", "scientificRole": "intervention",
             "unitRole": "within_unit", "relationship": "paired", "visualRole": "series"},
        ],
        "conditionFactors": {"Activated ROI": {"roi": "Activated ROI"},
                             "Control ROI": {"roi": "Control ROI"}},
        "timeVisualRole": "x",
    },
    "PFR046": {
        "factors": [
            {"id": "sirna", "label": "siRNA", "scientificRole": "intervention",
             "unitRole": "between_unit", "relationship": "independent", "visualRole": "x"},
        ],
        "conditionFactors": {"si control": {"sirna": "si control"},
                             "siPLCε sequence 1": {"sirna": "siPLCε sequence 1"},
                             "siPLCε sequence 3": {"sirna": "siPLCε sequence 3"}},
        "timeVisualRole": "series",
    },
    "PFR049": {
        "factors": [
            {"id": "genotype", "label": "Genotype", "scientificRole": "genotype",
             "unitRole": "between_unit", "relationship": "independent", "visualRole": "x"},
        ],
        "conditionFactors": {"AX2 (WT)": {"genotype": "AX2 (WT)"},
                             "gflB-KO": {"genotype": "gflB-KO"},
                             "AX2(GFP-GflB)": {"genotype": "AX2(GFP-GflB)"}},
    },
    "PFR069": {"timeVisualRole": "x"},
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    cases = [
        round_2.pfr002(),
        round_2.pfr004(),
        round_2.pfr025(),
        round_2.pfr046(),
        round_2.pfr049(),
        round_2.pfr069(),
    ]
    for original in cases:
        payload = copy.deepcopy(original)
        payload["benchmarkVersion"] = VERSION
        payload["graphIntent"] = GRAPH_INTENTS[payload["caseId"]]
        for index, observation in enumerate(payload["syntheticData"], 1):
            observation["observation_id"] = f"{payload['caseId']}_R3_O{index:06d}"
        target = args.output / "cases" / payload["caseId"] / "experimenter_track_a.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    manifest = {
        "schemaVersion": "1.0.0",
        "benchmarkVersion": VERSION,
        "sourceRuntime": "runtime_round_2",
        "syntheticValues": "byte-equivalent numeric values after identity-only copy",
        "seed": round_2.SEED,
        "goldBrief": "docs/alpha/PERSONAL_FIGURE_GOLD_BRIEFS_2026-08-25.md",
        "graphCoreAdr": "docs/adr/0047-graph-core-v1-visual-grammar.md",
        "caseIds": [payload["caseId"] for payload in cases],
    }
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


if __name__ == "__main__":
    main()
