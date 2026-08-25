#!/usr/bin/env python3
"""Build the six-case Round 4 remediation runtime from Round 3 values.

Round 4 validates the reusable graph/statistics fixes prompted by the saved
Round 3 personal-workflow review. It does not read the 495-case workbook or
any sealed literature pool.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path

import build_personal_figure_round_2 as round_2
from build_personal_figure_round_3 import GRAPH_INTENTS


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "benchmark/personal_figure_v1/runtime_round_4"
VERSION = "LSA_PERSONAL_FIGURE_v1_0_ROUND_4_REMEDIATION"


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
            observation["observation_id"] = f"{payload['caseId']}_R4_O{index:06d}"
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
        "sourceRuntime": "runtime_round_3",
        "purpose": "Round 3 saved-review remediation validation",
        "syntheticValues": "byte-equivalent numeric values after identity-only copy",
        "seed": round_2.SEED,
        "goldBrief": "docs/alpha/PERSONAL_FIGURE_GOLD_BRIEFS_2026-08-25.md",
        "round3Review": "benchmark/personal_figure_v1/review/review_round_3.json",
        "caseIds": [payload["caseId"] for payload in cases],
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


if __name__ == "__main__":
    main()
