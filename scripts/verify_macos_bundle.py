"""Verify the unsigned Internal Alpha macOS bundle before native review."""

from __future__ import annotations

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
    require_file(
        APP / "Contents/Resources/engine/lsaa-engine", "packaged statistical sidecar", True
    )

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

    print(f"macOS bundle verified: {APP}")
    print(f"executable={executable_name}; fileAssociation=.lsa; sidecar=engine/lsaa-engine")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
