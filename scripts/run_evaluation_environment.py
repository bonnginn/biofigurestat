#!/usr/bin/env python3
"""Start the explicit synthetic-only browser evaluation environment."""

from __future__ import annotations

import os
import secrets
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BRIDGE_PORT = 43128
UI_PORT = 1420
EXPECTED_ENGINE_PACKAGES = {
    "lsaa-analysis-engine": "0.7.0",
    "numpy": "2.3.5",
    "scipy": "1.18.0",
    "statsmodels": "0.14.6",
}


def pinned_engine_status() -> str:
    installed: dict[str, str] = {}
    for package, expected in EXPECTED_ENGINE_PACKAGES.items():
        try:
            installed[package] = version(package)
        except PackageNotFoundError as error:
            raise SystemExit(f"Pinned engine package is missing: {package}=={expected}") from error
        if installed[package] != expected:
            raise SystemExit(
                f"Pinned engine mismatch: {package}=={installed[package]} (expected {expected})"
            )
    package_summary = ", ".join(
        f"{package} {installed[package]}" for package in EXPECTED_ENGINE_PACKAGES
    )
    return f"Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}; {package_summary}"


def create_evaluation_environment(base: dict[str, str], token: str) -> dict[str, str]:
    environment = base.copy()
    environment.update(
        {
            "VITE_LSAA_EVALUATION_MODE": "true",
            "VITE_LSAA_SOURCE_REVISION": source_revision(),
            "LSAA_EVALUATION_BRIDGE_TARGET": f"http://127.0.0.1:{BRIDGE_PORT}",
            "LSAA_EVALUATION_BRIDGE_TOKEN": token,
            "LSAA_EVALUATION_BRIDGE_ORIGIN": f"http://127.0.0.1:{UI_PORT}",
        }
    )
    return environment


def source_revision() -> str:
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError:
        return "uncommitted-working-tree"
    if completed.returncode != 0 or not completed.stdout.strip():
        return "uncommitted-working-tree"
    revision = completed.stdout.strip()
    try:
        dirty = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError:
        return f"{revision}-dirty-unknown"
    return f"{revision}-dirty" if dirty.stdout.strip() else revision


def wait_for_bridge(process: subprocess.Popen[bytes], token: str) -> None:
    deadline = time.monotonic() + 10
    health_url = f"http://127.0.0.1:{BRIDGE_PORT}/api/evaluation/health"
    while time.monotonic() < deadline:
        exit_code = process.poll()
        if exit_code is not None:
            raise RuntimeError(f"Evaluation bridge exited before readiness (code {exit_code})")
        request = urllib.request.Request(
            health_url,
            headers={
                "Authorization": f"Bearer {token}",
                "Origin": f"http://127.0.0.1:{UI_PORT}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=0.5) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.05)
    raise RuntimeError("Evaluation bridge did not become ready within 10 seconds")


def main() -> None:
    node_value = os.environ.get("LSAA_NODE_EXECUTABLE")
    node = Path(node_value).resolve() if node_value else None
    if node is None or not node.is_file():
        discovered_node = shutil.which("node.exe") if os.name == "nt" else shutil.which("node")
        node = Path(discovered_node).resolve() if discovered_node else None
    vite = ROOT / "apps/ui/node_modules/vite/bin/vite.js"
    if node is None or not node.is_file() or not vite.is_file():
        raise SystemExit("Node.js and the installed Vite dependency are required")
    blind_package_value = os.environ.get("LSAA_BLIND_PACKAGE_ROOT")
    if not blind_package_value:
        raise SystemExit("LSAA_BLIND_PACKAGE_ROOT is required and must point outside the source tree")
    blind_package_root = Path(blind_package_value).resolve()
    if blind_package_root == ROOT or ROOT in blind_package_root.parents:
        raise SystemExit("LSAA_BLIND_PACKAGE_ROOT must point outside the source tree")
    engine_status = pinned_engine_status()
    token = secrets.token_urlsafe(32)
    environment = create_evaluation_environment(dict(os.environ), token)
    bridge_command = [
            sys.executable,
            str(ROOT / "scripts/evaluation_bridge.py"),
            "--host",
            "127.0.0.1",
            "--port",
            str(BRIDGE_PORT),
            "--origin",
            f"http://127.0.0.1:{UI_PORT}",
            "--token",
            token,
            "--blind-package-root",
            str(blind_package_root),
        ]
    blind_batch_value = os.environ.get("LSAA_BLIND_BATCH_QUEUE")
    if blind_batch_value:
        bridge_command.extend(["--blind-batch-queue", str(Path(blind_batch_value).resolve())])
    bridge = subprocess.Popen(
        bridge_command,
        cwd=ROOT,
        env=environment,
    )
    try:
        wait_for_bridge(bridge, token)
    except Exception as error:
        bridge.terminate()
        bridge.wait(timeout=10)
        raise SystemExit(f"Evaluation environment could not start: {error}") from error
    ui = subprocess.Popen(
        [str(node), str(vite), "--host", "127.0.0.1", "--port", str(UI_PORT)],
        cwd=ROOT / "apps/ui",
        env=environment,
    )

    def stop(_signal: int, _frame: object) -> None:
        ui.terminate()
        bridge.terminate()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    print(f"Evaluation UI: http://127.0.0.1:{UI_PORT}")
    print(f"Pinned engine environment: ready ({engine_status})")
    print(f"Source revision: {environment['VITE_LSAA_SOURCE_REVISION']}")
    print(f"Benchmark artifact root: {ROOT / 'benchmark_runs'}")
    print(f"Track B blind package root: {blind_package_root}")
    if blind_batch_value:
        print(f"Blind batch queue: {Path(blind_batch_value).resolve()}")
    print("Stop UI, proxy and loopback bridge together with Ctrl+C.")
    print("External Work access: keep this process running, then run `pnpm evaluation:tunnel`.")
    print("Give Work only the HTTPS trycloudflare.com URL printed by that second process.")
    print("Synthetic benchmark data only. This mode is not part of production builds.")
    try:
        exit_code = ui.wait()
    finally:
        bridge.terminate()
        bridge.wait(timeout=10)
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
