"""Verify the unsigned Internal Alpha macOS bundle before native review."""

from __future__ import annotations

import json
import os
import plistlib
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = (
    ROOT
    / "apps/desktop/src-tauri/target/release/bundle/macos/Life Science Analysis.app"
)


def require_file(path: Path, label: str, executable: bool = False) -> None:
    if not path.is_file():
        raise RuntimeError(f"{label} is missing: {path}")
    if executable and not os.access(path, os.X_OK):
        raise RuntimeError(f"{label} is not executable: {path}")


def main() -> int:
    plist_path = APP / "Contents/Info.plist"
    require_file(plist_path, "Info.plist")
    with plist_path.open("rb") as stream:
        plist = plistlib.load(stream)

    executable_name = plist.get("CFBundleExecutable")
    if not isinstance(executable_name, str) or not executable_name:
        raise RuntimeError("CFBundleExecutable is missing from Info.plist")
    require_file(APP / "Contents/MacOS" / executable_name, "application executable", True)
    sidecar = APP / "Contents/Resources/engine/lsaa-engine"
    require_file(sidecar, "packaged statistical sidecar", True)

    document_types = plist.get("CFBundleDocumentTypes", [])
    extensions = {
        extension
        for document_type in document_types
        for extension in document_type.get("CFBundleTypeExtensions", [])
    }
    if "lsa" not in extensions:
        raise RuntimeError("The .lsa file association is missing")

    completed = subprocess.run(
        ["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(APP)],
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"Bundle signature verification failed: {completed.stderr.strip()}")

    d17_request = {
        "protocolVersion": "0.14.0",
        "requestId": "request.bundle-d17",
        "projectId": "project.bundle-d17",
        "analysisId": "analysis.bundle-d17",
        "templateId": "D17",
        "templateVersion": "0.1.0",
        "method": "nonlinear_xy_fit",
        "modelId": "zero_baseline_association",
        "modelSelectionRationale": "Bundle capability verification",
        "xLabel": "Time",
        "yLabel": "Product",
        "xUnit": "min",
        "yUnit": "a.u.",
        "seriesIds": ["WT"],
        "points": [
            {
                "observationId": f"WT.{index}",
                "experimentalUnitId": "WT.r1",
                "seriesId": "WT",
                "x": x,
                "y": y,
            }
            for index, (x, y) in enumerate(
                [(0, 0), (10, 0.38), (20, 0.68), (40, 1.02), (80, 1.31)]
            )
        ],
        "initialValues": {},
        "bounds": {},
        "observations": [],
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": None,
        },
    }
    engine_check = subprocess.run(
        [str(sidecar)],
        input=json.dumps(d17_request),
        text=True,
        capture_output=True,
        check=False,
        timeout=60,
    )
    if engine_check.returncode != 0:
        raise RuntimeError(
            f"Packaged D17 engine verification failed: {engine_check.stderr.strip()}"
        )
    engine_result = json.loads(engine_check.stdout)
    if engine_result.get("status") != "ok" or not engine_result.get("nonlinearFit"):
        raise RuntimeError("Packaged engine does not provide the required D17 result contract")

    print(f"macOS bundle verified: {APP}")
    print(
        f"executable={executable_name}; fileAssociation=.lsa; "
        "sidecar=engine/lsaa-engine; D17=ok"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
