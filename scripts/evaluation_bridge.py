#!/usr/bin/env python3
"""Loopback-only evaluation bridge to the pinned LSAA statistical sidecar protocol.

This server is development infrastructure. It accepts synthetic benchmark requests only and
must never be bundled into the production desktop application.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from blind_benchmark_package import load_package


ROOT = Path(__file__).resolve().parents[1]
# Do not resolve this path: Unix virtual-environment launchers are commonly symlinks, and
# resolving one to the base interpreter discards the venv's scientific packages.
ENGINE_PYTHON = Path(sys.executable).absolute()
ENGINE_SOURCE = ROOT / "engine/python"
LITERATURE_RUNTIME = ROOT / "benchmark/literature_v1_1/runtime"
DEFAULT_EXCLUSIONS = ROOT / "benchmark/literature_v1_1/excluded_runs.json"
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
ALLOWED_ARTIFACTS = {
    "run.json",
    "default_graph.png",
    "default_graph.svg",
    "final_graph.png",
    "final_graph.svg",
    "statistics.json",
    "methods.txt",
    "graph_state.json",
    "interaction_log.json",
}
IMMUTABLE_ARTIFACTS = {"default_graph.png", "default_graph.svg"}
MAX_REQUEST_BYTES = 16 * 1024 * 1024


def load_literature_experimenter_view(
    case_id: str, track: str, run_id: str, blind_package_root: Path
) -> dict[str, Any]:
    if not SAFE_ID.fullmatch(case_id):
        raise ValueError("Invalid literature benchmark case ID")
    if track not in {"track_A", "track_B"}:
        raise ValueError("Invalid literature benchmark track")
    if not SAFE_ID.fullmatch(run_id):
        raise ValueError("Invalid literature benchmark run ID")
    if track == "track_B":
        return load_package(blind_package_root, case_id, run_id)
    suffix = "experimenter_track_a.json"
    path = LITERATURE_RUNTIME / "cases" / case_id / suffix
    if not path.is_file():
        raise ValueError("Literature benchmark case is not available")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("caseId") != case_id:
        raise RuntimeError("Literature benchmark runtime identity mismatch")
    return payload


def load_excluded_runs(path: Path) -> set[tuple[str, str, str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("schemaVersion") != "1.0.0":
        raise RuntimeError("Excluded-run ledger schema mismatch")
    runs = payload.get("runs")
    if not isinstance(runs, list):
        raise RuntimeError("Excluded-run ledger has no runs")
    result: set[tuple[str, str, str]] = set()
    for run in runs:
        if not isinstance(run, dict) or run.get("validity") != "invalid":
            raise RuntimeError("Excluded-run ledger entry is invalid")
        identity = (run.get("caseId"), run.get("track"), run.get("runId"))
        if not all(isinstance(value, str) and SAFE_ID.fullmatch(value) for value in identity):
            raise RuntimeError("Excluded-run ledger identity is invalid")
        result.add(identity)  # type: ignore[arg-type]
    return result


def benchmark_identity(benchmark: dict[str, Any]) -> tuple[str, str, str]:
    safe_run_directory(Path("."), benchmark)
    return benchmark["caseId"], benchmark["track"], benchmark["runId"]


def run_engine(request: dict[str, Any]) -> dict[str, Any]:
    if not ENGINE_PYTHON.is_file():
        raise RuntimeError(f"Pinned engine Python is missing: {ENGINE_PYTHON}")
    environment = os.environ.copy()
    existing = environment.get("PYTHONPATH")
    environment["PYTHONPATH"] = f"{ENGINE_SOURCE}{os.pathsep}{existing}" if existing else str(ENGINE_SOURCE)
    completed = subprocess.run(
        [str(ENGINE_PYTHON), "-m", "lsaa_engine.cli"],
        input=json.dumps(request, ensure_ascii=False) + "\n",
        text=True,
        capture_output=True,
        timeout=30,
        check=False,
        env=environment,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "Statistical engine failed")
    output = completed.stdout.strip().splitlines()
    if len(output) != 1:
        raise RuntimeError("Statistical engine did not return exactly one JSON result")
    parsed = json.loads(output[0])
    if not isinstance(parsed, dict):
        raise RuntimeError("Statistical engine returned a non-object result")
    return parsed


def safe_run_directory(output_root: Path, benchmark: dict[str, Any]) -> Path:
    values = {
        "caseId": benchmark.get("caseId"),
        "track": benchmark.get("track"),
        "runId": benchmark.get("runId"),
    }
    for label, value in values.items():
        if not isinstance(value, str) or not SAFE_ID.fullmatch(value):
            raise ValueError(f"Invalid benchmark {label}")
    if values["track"] not in {"track_A", "track_B"}:
        raise ValueError("Benchmark track must be track_A or track_B")
    return output_root / values["caseId"] / values["track"] / values["runId"]


def atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def write_artifact_batch(
    output_root: Path,
    benchmark: dict[str, Any],
    artifacts: list[Any],
    required_artifacts: list[Any],
) -> tuple[Path, list[str], list[str]]:
    if any(
        not isinstance(name, str) or name not in ALLOWED_ARTIFACTS
        for name in required_artifacts
    ):
        raise ValueError("Required artifact names are not allowed")
    if len(set(required_artifacts)) != len(required_artifacts):
        raise ValueError("Required artifact names must be unique")
    target = safe_run_directory(output_root, benchmark)
    requested_names = [
        artifact.get("name") if isinstance(artifact, dict) else None for artifact in artifacts
    ]
    if len(set(requested_names)) != len(requested_names):
        raise ValueError("Artifact names must be unique within one request")
    immutable_overwrites = sorted(
        name
        for name in requested_names
        if name in IMMUTABLE_ARTIFACTS and (target / name).exists()
    )
    if immutable_overwrites:
        raise ValueError(
            f"Immutable benchmark artifact already exists: {', '.join(immutable_overwrites)}"
        )
    written: list[str] = []
    artifact_names: set[str] = set()
    for artifact in artifacts:
        if not isinstance(artifact, dict) or artifact.get("name") not in ALLOWED_ARTIFACTS:
            raise ValueError("Artifact name is not allowed")
        name = artifact["name"]
        artifact_names.add(name)
        content = artifact.get("content")
        if not isinstance(content, str):
            raise ValueError(f"Artifact {name} has no string content")
        encoding = artifact.get("encoding", "text")
        if encoding not in {"text", "base64"}:
            raise ValueError(f"Artifact {name} uses an unsupported encoding")
        payload = (
            base64.b64decode(content, validate=True)
            if encoding == "base64"
            else content.encode("utf-8")
        )
        atomic_write(target / name, payload)
        written.append(name)
    present = sorted(
        path.name
        for path in target.iterdir()
        if path.is_file() and path.name in ALLOWED_ARTIFACTS
    )
    missing = sorted(set(required_artifacts) - set(present))
    if missing:
        raise ValueError(f"Benchmark artifact set is incomplete: {', '.join(missing)}")
    return target, written, present


class EvaluationHandler(BaseHTTPRequestHandler):
    server_version = "LSAAEvaluationBridge/0.1"

    @property
    def config(self) -> "EvaluationServer":
        return self.server  # type: ignore[return-value]

    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin == self.config.allowed_origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        return secrets.compare_digest(
            self.headers.get("Authorization", ""), f"Bearer {self.config.token}"
        )

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_REQUEST_BYTES:
            raise ValueError("Request size is invalid")
        parsed = json.loads(self.rfile.read(length))
        if not isinstance(parsed, dict):
            raise ValueError("JSON body must be an object")
        return parsed

    def do_OPTIONS(self) -> None:  # noqa: N802
        if self.headers.get("Origin") != self.config.allowed_origin:
            self._json(HTTPStatus.FORBIDDEN, {"error": "Origin is not allowed"})
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if not self._authorized():
            self._json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        if self.headers.get("Origin") != self.config.allowed_origin:
            self._json(HTTPStatus.FORBIDDEN, {"error": "Origin is not allowed"})
            return
        if parsed.path == "/api/evaluation/health":
            self._json(
                HTTPStatus.OK,
                {
                    "mode": "evaluation",
                    "syntheticOnly": True,
                    "bridgeVersion": "0.1.0",
                    "production": False,
                },
            )
            return
        if parsed.path == "/api/evaluation/literature/case":
            try:
                query = parse_qs(parsed.query, strict_parsing=True)
                case_id = query.get("caseId", [""])[0]
                track = query.get("track", [""])[0]
                run_id = query.get("runId", [""])[0]
                identity = (case_id, track, run_id)
                if identity in self.config.excluded_runs:
                    raise ValueError("Benchmark run is excluded because Track B was contaminated")
                self._json(
                    HTTPStatus.OK,
                    load_literature_experimenter_view(
                        case_id, track, run_id, self.config.blind_package_root
                    ),
                )
            except ValueError as error:
                self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        self._json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._authorized():
            self._json(HTTPStatus.UNAUTHORIZED, {"error": "Evaluation token is invalid"})
            return
        if self.headers.get("Origin") != self.config.allowed_origin:
            self._json(HTTPStatus.FORBIDDEN, {"error": "Origin is not allowed"})
            return
        try:
            body = self._read_json()
            if body.get("mode") != "evaluation" or body.get("syntheticOnly") is not True:
                raise ValueError("Evaluation requests must explicitly declare synthetic-only mode")
            if self.path == "/api/evaluation/analysis":
                request = body.get("request")
                if not isinstance(request, dict):
                    raise ValueError("Analysis request is missing")
                result = run_engine(request)
                self._json(
                    HTTPStatus.OK,
                    {
                        "result": result,
                        "evaluation": {
                            "syntheticOnly": True,
                            "bridgeVersion": "0.1.0",
                        },
                    },
                )
                return
            if self.path == "/api/evaluation/artifacts":
                benchmark = body.get("benchmark")
                artifacts = body.get("artifacts")
                required_artifacts = body.get("requiredArtifacts", [])
                if not isinstance(benchmark, dict) or not isinstance(artifacts, list):
                    raise ValueError("Benchmark identity and artifacts are required")
                if not isinstance(required_artifacts, list):
                    raise ValueError("Required artifact names are not allowed")
                identity = benchmark_identity(benchmark)
                if identity in self.config.excluded_runs:
                    raise ValueError("Excluded contaminated benchmark evidence is read-only")
                if identity[1] == "track_B":
                    load_package(self.config.blind_package_root, identity[0], identity[2])
                target, written, present = write_artifact_batch(
                    self.config.output_root,
                    benchmark,
                    artifacts,
                    required_artifacts,
                )
                self._json(
                    HTTPStatus.OK,
                    {"written": written, "present": present, "directory": str(target)},
                )
                return
            self._json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
        except (ValueError, json.JSONDecodeError) as error:
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except Exception as error:  # pragma: no cover - defensive bridge boundary
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})

    def log_message(self, format: str, *args: object) -> None:
        print(f"[evaluation-bridge] {self.address_string()} {format % args}")


class EvaluationServer(ThreadingHTTPServer):
    def __init__(
        self,
        address: tuple[str, int],
        token: str,
        allowed_origin: str,
        output_root: Path,
        blind_package_root: Path,
        exclusions_path: Path = DEFAULT_EXCLUSIONS,
    ) -> None:
        super().__init__(address, EvaluationHandler)
        self.token = token
        self.allowed_origin = allowed_origin
        self.output_root = output_root
        self.blind_package_root = blind_package_root.resolve()
        if self.blind_package_root == ROOT or ROOT in self.blind_package_root.parents:
            raise ValueError("Blind package root must be outside the full source tree")
        self.excluded_runs = load_excluded_runs(exclusions_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1", choices=["127.0.0.1", "localhost"])
    parser.add_argument("--port", type=int, default=43128)
    parser.add_argument("--origin", default="http://127.0.0.1:1420")
    parser.add_argument("--token", default=os.environ.get("LSAA_EVALUATION_TOKEN") or secrets.token_urlsafe(32))
    parser.add_argument("--output-root", type=Path, default=ROOT / "benchmark_runs")
    parser.add_argument("--blind-package-root", type=Path, required=True)
    args = parser.parse_args()
    server = EvaluationServer(
        (args.host, args.port), args.token, args.origin, args.output_root.resolve(),
        args.blind_package_root.resolve(),
    )
    print("LSAA evaluation bridge (synthetic benchmark data only)", flush=True)
    print(f"URL=http://{args.host}:{args.port}", flush=True)
    print(f"TOKEN={args.token}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
