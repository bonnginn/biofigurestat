#!/usr/bin/env python3
"""Build the immutable-input Round 5 runtime for Graph Core semantic validation.

The builder reads only the six approved Round 4 runtime cases. It never opens
the sealed literature workbook or Pool D.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "benchmark/personal_figure_v1/runtime_round_4"
DEFAULT_OUTPUT = ROOT / "benchmark/personal_figure_v1/runtime_round_5"
VERSION = "LSA_PERSONAL_FIGURE_v1_0_ROUND_5_GRAPH_SEMANTICS"
CASE_IDS = ["PFR002", "PFR004", "PFR025", "PFR046", "PFR049", "PFR069"]


def round_5_intent(case_id: str, prior: dict) -> dict:
    intent = copy.deepcopy(prior)
    intent["dataSetSemantics"] = {
        "displaySet": "explicit Figure-visible factor combinations",
        "analysisSet": "biological-unit analysis rows only",
        "comparisonSet": "planned/selected contrasts only",
        "annotationSet": "selected visible comparisons; n.s. may be hidden",
    }
    if case_id == "PFR002":
        intent.update(
            {
                "factors": [
                    {
                        "id": "dox",
                        "label": "Dox",
                        "scientificRole": "intervention",
                        "unitRole": "between_unit",
                        "relationship": "independent",
                        "visualRole": "x",
                    },
                    {
                        "id": "si_ndel1",
                        "label": "si Ndel1",
                        "scientificRole": "intervention",
                        "unitRole": "between_unit",
                        "relationship": "independent",
                        "visualRole": "x",
                    },
                    {
                        "id": "rescue_cell_line",
                        "label": "Rescue cell line",
                        "scientificRole": "rescue",
                        "unitRole": "between_unit",
                        "relationship": "independent",
                        "visualRole": "series",
                    },
                ],
                "hierarchicalCategoryLabels": [
                    {"dox": "−", "si_ndel1": "−"},
                    {"dox": "−", "si_ndel1": "#1"},
                    {"dox": "+", "si_ndel1": "#1"},
                ],
                "conditionFactors": {
                    "Ndel1-Myc; baseline reference": {"dox": "−", "si_ndel1": "−", "rescue_cell_line": "Ndel1-Myc"},
                    "Ndel1-Myc; siNdel1; Dox−": {"dox": "−", "si_ndel1": "#1", "rescue_cell_line": "Ndel1-Myc"},
                    "Ndel1-Myc; siNdel1; Dox+": {"dox": "+", "si_ndel1": "#1", "rescue_cell_line": "Ndel1-Myc"},
                    "NDE1-Myc; baseline reference": {"dox": "−", "si_ndel1": "−", "rescue_cell_line": "NDE1-Myc"},
                    "NDE1-Myc; siNdel1; Dox−": {"dox": "−", "si_ndel1": "#1", "rescue_cell_line": "NDE1-Myc"},
                    "NDE1-Myc; siNdel1; Dox+": {"dox": "+", "si_ndel1": "#1", "rescue_cell_line": "NDE1-Myc"},
                },
                "displaySubset": "three treatment categories × two rescue-cell-line series",
            }
        )
    elif case_id == "PFR004":
        intent["factors"] = [
            {"id": "sirna_target", "label": "siRNA", "scientificRole": "intervention", "unitRole": "between_unit", "relationship": "independent", "visualRole": "x"},
            {"id": "sirna_sequence", "label": "", "scientificRole": "intervention", "unitRole": "between_unit", "relationship": "independent", "visualRole": "x"},
        ]
        intent["conditionFactors"] = {
            "si control": {"sirna_target": "control", "sirna_sequence": "−"},
            "siNdel1 #1": {"sirna_target": "Ndel1", "sirna_sequence": "#1"},
            "siNdel1 #2": {"sirna_target": "Ndel1", "sirna_sequence": "#2"},
            "siNDE1 #1": {"sirna_target": "NDE1", "sirna_sequence": "#1"},
            "siNDE1 #2": {"sirna_target": "NDE1", "sirna_sequence": "#2"},
        }
        intent["hierarchicalCategoryLabels"] = {
            "control": ["−"],
            "Ndel1": ["#1", "#2"],
            "NDE1": ["#1", "#2"],
        }
    elif case_id == "PFR046":
        intent["factors"] = [
            {"id": "sirna_target", "label": "siRNA", "scientificRole": "intervention", "unitRole": "between_unit", "relationship": "independent", "visualRole": "x"},
            {"id": "sirna_sequence", "label": "", "scientificRole": "intervention", "unitRole": "between_unit", "relationship": "independent", "visualRole": "x"},
        ]
        conditions = list(intent.get("conditionFactors", {}))
        if len(conditions) == 3:
            intent["conditionFactors"] = {
                conditions[0]: {"sirna_target": "control", "sirna_sequence": "−"},
                conditions[1]: {"sirna_target": "PLCε", "sirna_sequence": "#1"},
                conditions[2]: {"sirna_target": "PLCε", "sirna_sequence": "#3"},
            }
        intent["hierarchicalCategoryLabels"] = {"control": ["−"], "PLCε": ["#1", "#3"]}
        intent["seriesDisplayLabels"] = {"0": "Dark", "5": "Lit"}
        intent["pairingSource"] = "design metadata"
    elif case_id in {"PFR025", "PFR069"}:
        intent["continuousAxis"] = {
            "minorTicks": True,
            "gridLines": False,
            "clipRepresentationToMeasuredDomain": True,
        }
    if case_id == "PFR049":
        intent["boxWhisker"] = {"mode": "tukey_1_5_iqr", "showOutliers": True}
    if case_id == "PFR069":
        intent["uncertainty"] = {"representation": "ribbon", "quantity": "sd", "opacity": 0.18}
    return intent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    for case_id in CASE_IDS:
        source = SOURCE / "cases" / case_id / "experimenter_track_a.json"
        payload = json.loads(source.read_text(encoding="utf-8"))
        payload["benchmarkVersion"] = VERSION
        payload["graphIntent"] = round_5_intent(case_id, payload.get("graphIntent", {}))
        for index, observation in enumerate(payload["syntheticData"], 1):
            observation["observation_id"] = f"{case_id}_R5_O{index:06d}"
        target = args.output / "cases" / case_id / "experimenter_track_a.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    manifest = {
        "schemaVersion": "1.0.0",
        "benchmarkVersion": VERSION,
        "sourceRuntime": "runtime_round_4",
        "purpose": "Round 4 human-review Graph Core semantic corrections",
        "syntheticValues": "byte-equivalent numeric values after identity-only copy",
        "poolDOpened": False,
        "caseIds": CASE_IDS,
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


if __name__ == "__main__":
    main()
