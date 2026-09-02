#!/usr/bin/env python3
"""Compare the current pinned engine with the committed macOS reference using numeric tolerances."""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
ENGINE_ROOT = ROOT / "engine/python"
REFERENCE = ENGINE_ROOT / "reference/macos-arm64-engine-0.13.0.json"
sys.path.insert(0, str(ENGINE_ROOT))

from smoke_sidecar import smoke_requests  # noqa: E402


NON_NUMERIC_PRESENTATION_PATH = re.compile(
    r"(?:^|\.)engine\.version$|(?:^|\.)diagnostics\[\d+\]\.message$"
)


def reference_source_platform(system: str, machine: str) -> str:
    normalized_machine = "arm64" if machine.lower() in {"arm64", "aarch64"} else machine
    return f"{system}-{normalized_machine}"


def require_reference_writer_platform(system: str, machine: str) -> None:
    source_platform = reference_source_platform(system, machine)
    if source_platform != "Darwin-arm64":
        raise SystemExit(
            "Reference writing is restricted to the reviewed Darwin-arm64 authority; "
            f"current platform is {source_platform}."
        )


def reference_case_id(request: dict[str, Any]) -> str:
    return ":".join(
        str(value)
        for value in (
            request["templateId"],
            request["method"],
            request.get("contrastIntent", "default"),
            request["requestId"],
        )
    )


def reference_coverage(
    reference: dict[str, Any], requests: list[dict[str, Any]]
) -> tuple[list[str], list[str]]:
    reference_ids = {case["caseId"] for case in reference.get("cases", [])}
    implemented_ids = {reference_case_id(request) for request in requests}
    return sorted(implemented_ids - reference_ids), sorted(reference_ids - implemented_ids)


def append_missing_reference_cases(
    reference: dict[str, Any],
    requests: list[dict[str, Any]],
    executor: Callable[[dict[str, Any]], dict[str, Any]],
) -> tuple[dict[str, Any], list[str]]:
    missing, _ = reference_coverage(reference, requests)
    missing_ids = set(missing)
    appended = [
        {
            "caseId": reference_case_id(request),
            "request": request,
            "result": executor(request),
        }
        for request in requests
        if reference_case_id(request) in missing_ids
    ]
    return {**reference, "cases": [*reference.get("cases", []), *appended]}, [
        case["caseId"] for case in appended
    ]


def execute(request: dict[str, Any]) -> dict[str, Any]:
    environment = os.environ.copy()
    existing = environment.get("PYTHONPATH")
    environment["PYTHONPATH"] = (
        f"{ENGINE_ROOT}{os.pathsep}{existing}" if existing else str(ENGINE_ROOT)
    )
    completed = subprocess.run(
        [sys.executable, "-m", "lsaa_engine.cli"],
        input=json.dumps(request, ensure_ascii=False),
        text=True,
        capture_output=True,
        check=True,
        timeout=60,
        env=environment,
    )
    result = json.loads(completed.stdout)
    result.pop("completedAt", None)
    return result


def compare(actual: Any, expected: Any, path: str = "result") -> list[str]:
    # The cross-platform reference is numerical and structural. Engine version is
    # checked by the sidecar smoke gate, while diagnostic copy may be clarified
    # without changing its exact code/severity or any calculation.
    if NON_NUMERIC_PRESENTATION_PATH.search(path):
        return []
    if isinstance(expected, bool) or expected is None or isinstance(expected, str):
        return [] if actual == expected else [f"{path}: {actual!r} != {expected!r}"]
    if isinstance(expected, (int, float)):
        if not isinstance(actual, (int, float)) or isinstance(actual, bool):
            return [f"{path}: expected numeric value, got {actual!r}"]
        return (
            []
            if math.isclose(float(actual), float(expected), rel_tol=1e-10, abs_tol=1e-12)
            else [f"{path}: {actual!r} != {expected!r} within tolerance"]
        )
    if isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            return [f"{path}: list shape differs"]
        differences: list[str] = []
        for index, expected_item in enumerate(expected):
            differences.extend(compare(actual[index], expected_item, f"{path}[{index}]"))
        return differences
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return [f"{path}: expected object, got {type(actual).__name__}"]
        if set(actual) != set(expected):
            return [
                f"{path}: object keys differ; missing={sorted(set(expected) - set(actual))}; "
                f"extra={sorted(set(actual) - set(expected))}"
            ]
        differences = []
        for key, expected_item in expected.items():
            differences.extend(compare(actual[key], expected_item, f"{path}.{key}"))
        return differences
    return [] if actual == expected else [f"{path}: {actual!r} != {expected!r}"]


def create_reference() -> dict[str, Any]:
    cases = []
    for request in smoke_requests():
        cases.append(
            {
                "caseId": reference_case_id(request),
                "request": request,
                "result": execute(request),
            }
        )
    return {
        "referenceVersion": "1.0.0",
        "sourcePlatform": reference_source_platform(platform.system(), platform.machine()),
        "pythonVersion": platform.python_version(),
        "numericTolerance": {"relative": 1e-10, "absolute": 1e-12},
        "cases": cases,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    write_group = parser.add_mutually_exclusive_group()
    write_group.add_argument(
        "--write-reference",
        action="store_true",
        help="Replace the committed reference intentionally on the known-good reference platform.",
    )
    write_group.add_argument(
        "--append-missing-reference",
        action="store_true",
        help="Append only implemented cases missing from the reviewed Darwin-arm64 reference.",
    )
    parser.add_argument(
        "--require-complete-coverage",
        action="store_true",
        help="Fail when an implemented smoke protocol has no committed reference case.",
    )
    args = parser.parse_args()
    if args.write_reference:
        require_reference_writer_platform(platform.system(), platform.machine())
        payload = create_reference()
        REFERENCE.parent.mkdir(parents=True, exist_ok=True)
        REFERENCE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"WROTE {REFERENCE}")
        return
    if not REFERENCE.is_file():
        raise SystemExit(f"Reference file is missing: {REFERENCE}")
    reference = json.loads(REFERENCE.read_text(encoding="utf-8"))
    if args.append_missing_reference:
        require_reference_writer_platform(platform.system(), platform.machine())
        payload, appended = append_missing_reference_cases(reference, smoke_requests(), execute)
        if not appended:
            print("Reference already covers every implemented smoke protocol.")
            return
        REFERENCE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for case_id in appended:
            print(f"APPENDED {case_id}")
        print(f"WROTE {REFERENCE} with {len(appended)} new cases; existing cases were preserved.")
        return
    if args.require_complete_coverage:
        missing, obsolete = reference_coverage(reference, smoke_requests())
        if missing:
            for case_id in missing:
                print(f"MISSING {case_id}")
        if obsolete:
            for case_id in obsolete:
                print(f"OBSOLETE {case_id}")
        if missing or obsolete:
            raise SystemExit(1)
        print(f"Reference coverage PASS ({len(reference['cases'])} implemented cases).")
    differences: list[str] = []
    for case in reference["cases"]:
        actual = execute(case["request"])
        case_differences = compare(actual, case["result"], case["caseId"])
        if case_differences:
            differences.extend(case_differences)
            print(f"FAIL {case['caseId']}")
        else:
            print(f"PASS {case['caseId']}")
    if differences:
        for difference in differences:
            print(difference)
        raise SystemExit(1)
    print(
        f"All {len(reference['cases'])} engine cases agree with "
        f"{reference['sourcePlatform']} within rtol=1e-10, atol=1e-12."
    )


if __name__ == "__main__":
    main()
