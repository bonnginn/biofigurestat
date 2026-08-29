"""Verify Windows artifacts that are easy to regress without a clean-machine smoke."""

from __future__ import annotations

import argparse
from pathlib import Path
import struct


IMAGE_SUBSYSTEM_WINDOWS_GUI = 2


def read_pe_subsystem(executable: Path) -> int:
    data = executable.read_bytes()
    if len(data) < 0x40 or data[:2] != b"MZ":
        raise ValueError("not a DOS/PE executable")
    pe_offset = struct.unpack_from("<I", data, 0x3C)[0]
    if pe_offset + 24 + 70 > len(data) or data[pe_offset : pe_offset + 4] != b"PE\0\0":
        raise ValueError("PE header is missing or truncated")
    return struct.unpack_from("<H", data, pe_offset + 24 + 68)[0]


def verify_windows_artifacts(executable: Path, installer: Path) -> list[str]:
    failures: list[str] = []
    if not executable.is_file():
        failures.append(f"application executable is missing: {executable}")
    else:
        try:
            subsystem = read_pe_subsystem(executable)
        except (OSError, ValueError, struct.error) as error:
            failures.append(f"application executable is not a readable PE file: {error}")
        else:
            if subsystem != IMAGE_SUBSYSTEM_WINDOWS_GUI:
                failures.append(
                    "application executable uses PE subsystem "
                    f"{subsystem}; expected Windows GUI subsystem {IMAGE_SUBSYSTEM_WINDOWS_GUI}"
                )
    if not installer.is_file() or installer.stat().st_size == 0:
        failures.append(f"NSIS installer is missing or empty: {installer}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--executable",
        type=Path,
        default=Path("apps/desktop/src-tauri/target/release/lifescience-analysis-app.exe"),
    )
    parser.add_argument(
        "--installer",
        type=Path,
        default=Path(
            "apps/desktop/src-tauri/target/release/bundle/nsis/"
            "BioFigureStat_0.1.0_x64-setup.exe"
        ),
    )
    args = parser.parse_args()
    failures = verify_windows_artifacts(args.executable, args.installer)
    if failures:
        print("Windows bundle verification FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Windows bundle verification PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
