"""Run every implemented protocol through a frozen local-engine executable."""

from __future__ import annotations

import json
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any

from lsaa_engine import ENGINE_VERSION

APP_VERSION = "0.1.0"

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "tests"))

from test_d01_d02 import request as two_condition_request  # noqa: E402
from test_d03 import d03_request  # noqa: E402
from test_d04 import d04_request  # noqa: E402
from test_d05 import d05_request  # noqa: E402
from test_d09 import d09_request  # noqa: E402
from test_d11_d12 import survival_request  # noqa: E402
from test_d17 import request as d17_request, series as d17_series  # noqa: E402


def default_executable() -> Path:
    system = platform.system().lower()
    machine = platform.machine().lower()
    normalized_machine = "arm64" if machine in {"arm64", "aarch64"} else machine
    name = "lsaa-engine.exe" if platform.system() == "Windows" else "lsaa-engine"
    return ROOT / "dist" / f"{system}-{normalized_machine}" / name / name


def d01_request() -> dict[str, Any]:
    observations = []
    for condition, values in (
        ("condition.control", [1.2, 1.5, 1.7, 2.0]),
        ("condition.treatment", [2.1, 2.4, 2.8, 3.0]),
    ):
        observations.extend(
            {
                "observationId": f"observation.{condition}.{index}",
                "conditionId": condition,
                "value": value,
                "experimentalUnitId": f"unit.{condition}.{index}",
            }
            for index, value in enumerate(values)
        )
    return two_condition_request("D01", "welch_t", observations)


def d02_request() -> dict[str, Any]:
    observations = []
    for index, (control, treatment) in enumerate(((10, 12), (13, 15), (9, 14), (15, 18))):
        observations.extend(
            {
                "observationId": f"observation.{condition}.{index}",
                "conditionId": condition,
                "value": value,
                "experimentalUnitId": f"unit.{index}",
                "pairId": f"pair.{index}",
            }
            for condition, value in (
                ("condition.control", control),
                ("condition.treatment", treatment),
            )
        )
    return two_condition_request("D02", "paired_t", observations)


def d01_equivalence_request() -> dict[str, Any]:
    observations = []
    for condition, values in (
        ("condition.control", [1.00, 1.02, 0.98, 1.01, 0.99]),
        ("condition.treatment", [1.01, 1.03, 0.99, 1.02, 1.00]),
    ):
        observations.extend(
            {
                "observationId": f"observation.{condition}.{index}",
                "conditionId": condition,
                "value": value,
                "experimentalUnitId": f"unit.{condition}.{index}",
            }
            for index, value in enumerate(values)
        )
    comparison_id = "equivalence:condition.control:condition.treatment"
    return {
        "protocolVersion": "0.15.0",
        "requestId": "request.d01.welch-tost",
        "projectId": "project.smoke",
        "analysisId": "analysis.d01.welch-tost",
        "templateId": "D01",
        "templateVersion": "0.2.0",
        "method": "welch_tost",
        "comparisonId": comparison_id,
        "contrastConditionIds": ["condition.control", "condition.treatment"],
        "equivalencePlan": {
            "schemaVersion": "0.1.0",
            "margin": {
                "scale": "raw_difference",
                "lowerBound": -0.1,
                "upperBound": 0.1,
                "unit": "Relative activity",
                "declaredAsPrespecified": True,
            },
            "alpha": 0.05,
            "claimMode": "single_primary_comparison",
            "primaryComparisonId": comparison_id,
        },
        "observations": observations,
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.9,
            "multiplicityMethod": None,
        },
    }


def execute(executable: Path, request: dict[str, Any]) -> dict[str, Any]:
    completed = subprocess.run(
        [str(executable)],
        input=json.dumps(request),
        text=True,
        capture_output=True,
        check=False,
        timeout=60,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"{request['templateId']} sidecar failed ({completed.returncode}): {completed.stderr}"
        )
    return json.loads(completed.stdout)


def smoke_requests() -> list[dict[str, Any]]:
    independent = d01_request()
    paired = d02_request()
    return [
        independent,
        {**independent, "requestId": "request.d01.student", "method": "student_t"},
        {**independent, "requestId": "request.d01.mann-whitney", "method": "mann_whitney"},
        d01_equivalence_request(),
        paired,
        {**paired, "requestId": "request.d02.wilcoxon", "method": "wilcoxon_signed_rank"},
        d03_request(),
        d03_request(
            method="one_way_anova",
            contrast_intent="all_pairs",
            multiplicity="tukey_hsd_all_pairs",
        ),
        d03_request(
            method="one_way_anova",
            contrast_intent="control_vs_many",
            multiplicity="dunnett_control_vs_many",
        ),
        d03_request(
            method="one_way_anova",
            contrast_intent="planned_comparisons",
            multiplicity="holm_planned_comparisons",
            planned_pairs=[
                ["condition.control", "condition.low"],
                ["condition.control", "condition.high"],
            ],
        ),
        d03_request(
            method="kruskal_wallis",
            contrast_intent="omnibus_only",
            multiplicity=None,
        ),
        d04_request(),
        d05_request(),
        d09_request("pearson"),
        d09_request("spearman"),
        survival_request(),
        d17_request(d17_series("WT") + d17_series("Mutant")),
    ]


def main() -> int:
    executable = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else default_executable()
    if not executable.is_file():
        raise FileNotFoundError(f"Sidecar executable not found: {executable}")
    cases = smoke_requests()
    for request in cases:
        result = execute(executable, request)
        if result.get("status") != "ok":
            raise RuntimeError(f"{request['templateId']} returned {result.get('status')}")
        if result.get("protocolVersion") != request["protocolVersion"]:
            raise RuntimeError(f"{request['templateId']} changed protocol version")
        if result.get("engine", {}).get("version") != ENGINE_VERSION:
            raise RuntimeError(f"{request['templateId']} sidecar has a stale engine version")
        if request["protocolVersion"] == "0.15.0":
            comparison = (result.get("equivalence") or {}).get("comparisons", [{}])[0]
            if comparison.get("conclusion") != "equivalence_supported":
                raise RuntimeError("D01 Welch TOST smoke did not preserve its expected conclusion")
        engine = result.get("engine", {})
        units = {item.get("experimentalUnitId") for item in request.get("observations", [])}
        pairs = {item.get("pairId") for item in request.get("observations", []) if item.get("pairId")}
        tests = ", ".join(
            f"{item.get('name')} p={item.get('adjustedPValue') if item.get('adjustedPValue') is not None else item.get('pValue')}"
            for item in result.get("tests", [])
        )
        packages = ", ".join(
            f"{name}={version}" for name, version in engine.get("packages", {}).items()
        )
        print(
            f"{request['templateId']} {request['protocolVersion']} {request['method']}: ok; "
            f"app={APP_VERSION}; engine={engine.get('name')} {engine.get('version')}; "
            f"packages=[{packages}]; observations={len(request.get('observations', []))}; "
            f"units={len(units)}; pairs={len(pairs)}; tests=[{tests}]"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
