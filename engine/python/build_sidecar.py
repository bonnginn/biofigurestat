from __future__ import annotations

import platform
import shutil
from pathlib import Path

import PyInstaller.__main__


ROOT = Path(__file__).resolve().parent


def platform_tag() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    normalized_machine = "arm64" if machine in {"arm64", "aarch64"} else machine
    return f"{system}-{normalized_machine}"


def main() -> int:
    tag = platform_tag()
    name = "lsaa-engine.exe" if platform.system() == "Windows" else "lsaa-engine"
    dist_dir = ROOT / "dist" / tag
    work_dir = ROOT / "build" / tag
    spec_dir = ROOT / "build" / "spec"
    shutil.rmtree(dist_dir, ignore_errors=True)
    PyInstaller.__main__.run(
        [
            "--onedir",
            "--clean",
            "--noconfirm",
            "--name",
            name,
            "--distpath",
            str(dist_dir),
            "--workpath",
            str(work_dir),
            "--specpath",
            str(spec_dir),
            str(ROOT / "lsaa_engine_entry.py"),
        ]
    )
    executable = dist_dir / name / name
    if not executable.is_file():
        raise RuntimeError(f"Sidecar build did not create {executable}")
    print(executable)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
