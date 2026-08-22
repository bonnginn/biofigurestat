from __future__ import annotations

import json
import platform
import subprocess
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from evaluation_bridge import (
    ALLOWED_ARTIFACTS,
    ROOT,
    EvaluationServer,
    run_engine,
    safe_run_directory,
    write_artifact_batch,
)


TOKEN = "test-token"
ORIGIN = "http://127.0.0.1:1420"


def welch_request() -> dict:
    observations = []
    for condition, values in (
        ("condition.control", [1.2, 1.5, 1.7, 2.0]),
        ("condition.treatment", [2.1, 2.4, 2.8, 3.0, 3.2]),
    ):
        for index, value in enumerate(values):
            observations.append(
                {
                    "observationId": f"observation.{condition}.{index}",
                    "conditionId": condition,
                    "value": value,
                    "experimentalUnitId": f"unit.{condition}.{index}",
                }
            )
    return {
        "protocolVersion": "0.1.0",
        "requestId": "request.bridge.fixture",
        "projectId": "project.bridge.fixture",
        "analysisId": "analysis.bridge.fixture",
        "templateId": "D01",
        "templateVersion": "0.1.0",
        "method": "welch_t",
        "contrastConditionIds": ["condition.control", "condition.treatment"],
        "observations": observations,
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": None,
        },
    }


class EvaluationBridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        try:
            self.server = EvaluationServer(
                ("127.0.0.1", 0), TOKEN, ORIGIN, Path(self.temporary.name)
            )
        except PermissionError:
            self.temporary.cleanup()
            self.skipTest("Current sandbox does not permit loopback socket binding")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temporary.cleanup()

    def post(
        self, path: str, payload: dict, token: str = TOKEN, origin: str = ORIGIN
    ) -> dict:
        request = urllib.request.Request(
            self.base + path,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Origin": origin,
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())

    def test_browser_bridge_returns_same_engine_result_as_direct_protocol(self) -> None:
        request = welch_request()
        direct = run_engine(request)
        bridged = self.post(
            "/api/evaluation/analysis",
            {"mode": "evaluation", "syntheticOnly": True, "request": request},
        )["result"]
        self.assertEqual(bridged, direct)
        self.assertEqual(bridged["engine"]["version"], "0.7.0")

    def test_bridge_rejects_missing_synthetic_only_declaration(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.post(
                "/api/evaluation/analysis",
                {"mode": "evaluation", "syntheticOnly": False, "request": welch_request()},
            )
        self.assertEqual(context.exception.code, 400)

    def test_bridge_rejects_a_different_or_missing_browser_origin(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.post(
                "/api/evaluation/analysis",
                {"mode": "evaluation", "syntheticOnly": True, "request": welch_request()},
                origin="http://127.0.0.1:9999",
            )
        self.assertEqual(context.exception.code, 403)

    def test_artifacts_use_deterministic_validated_run_directory(self) -> None:
        result = self.post(
            "/api/evaluation/artifacts",
            {
                "mode": "evaluation",
                "syntheticOnly": True,
                "benchmark": {
                    "benchmarkVersion": "LSA50_v1_1",
                    "caseId": "case_001",
                    "track": "track_A",
                    "runId": "run_001",
                },
                "artifacts": [
                    {"name": "methods.txt", "content": "fixture methods"},
                    {"name": "run.json", "content": "{}"},
                ],
            },
        )
        target = Path(result["directory"])
        self.assertEqual(target.relative_to(self.temporary.name).as_posix(), "case_001/track_A/run_001")
        self.assertEqual((target / "methods.txt").read_text(), "fixture methods")

    def test_artifact_path_traversal_is_rejected(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.post(
                "/api/evaluation/artifacts",
                {
                    "mode": "evaluation",
                    "syntheticOnly": True,
                    "benchmark": {
                        "benchmarkVersion": "LSA50_v1_1",
                        "caseId": "../escape",
                        "track": "track_A",
                        "runId": "run_001",
                    },
                    "artifacts": [{"name": "run.json", "content": "{}"}],
                },
            )
        self.assertEqual(context.exception.code, 400)

    def test_duplicate_artifact_names_and_unknown_encoding_are_rejected(self) -> None:
        base = {
            "mode": "evaluation",
            "syntheticOnly": True,
            "benchmark": {
                "benchmarkVersion": "LSA50_v1_1",
                "caseId": "case_001",
                "track": "track_A",
                "runId": "run_001",
            },
        }
        with self.assertRaises(urllib.error.HTTPError) as duplicate_context:
            self.post(
                "/api/evaluation/artifacts",
                {
                    **base,
                    "artifacts": [
                        {"name": "run.json", "content": "{}"},
                        {"name": "run.json", "content": "{}"},
                    ],
                },
            )
        self.assertEqual(duplicate_context.exception.code, 400)
        with self.assertRaises(urllib.error.HTTPError) as encoding_context:
            self.post(
                "/api/evaluation/artifacts",
                {
                    **base,
                    "artifacts": [
                        {"name": "run.json", "content": "{}", "encoding": "gzip"}
                    ],
                },
            )
        self.assertEqual(encoding_context.exception.code, 400)


class EvaluationBoundaryTests(unittest.TestCase):
    def test_pinned_cli_boundary_executes_canonical_request(self) -> None:
        result = run_engine(welch_request())
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["protocolVersion"], "0.1.0")
        self.assertEqual(result["engine"]["version"], "0.7.0")
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.004002714883968111, places=12)

    def test_run_directory_validation_is_deterministic_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = safe_run_directory(
                root,
                {"caseId": "case_001", "track": "track_B", "runId": "run_007"},
            )
            self.assertEqual(target.relative_to(root).as_posix(), "case_001/track_B/run_007")
            with self.assertRaisesRegex(ValueError, "Invalid benchmark caseId"):
                safe_run_directory(
                    root,
                    {"caseId": "../escape", "track": "track_B", "runId": "run_007"},
                )

    def test_complete_artifact_manifest_is_verified_without_network(self) -> None:
        benchmark = {"caseId": "case_001", "track": "track_A", "runId": "run_001"}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            default_names = ["default_graph.png", "default_graph.svg"]
            write_artifact_batch(
                root,
                benchmark,
                [{"name": name, "content": "fixture"} for name in default_names],
                [],
            )
            final_names = sorted(ALLOWED_ARTIFACTS - set(default_names))
            target, written, present = write_artifact_batch(
                root,
                benchmark,
                [{"name": name, "content": "fixture"} for name in final_names],
                sorted(ALLOWED_ARTIFACTS),
            )
            self.assertEqual(written, final_names)
            self.assertEqual(present, sorted(ALLOWED_ARTIFACTS))
            self.assertEqual(
                sorted(path.name for path in target.iterdir()), sorted(ALLOWED_ARTIFACTS)
            )

        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, "default_graph.png"):
                write_artifact_batch(
                    Path(temporary),
                    benchmark,
                    [{"name": "run.json", "content": "{}"}],
                    sorted(ALLOWED_ARTIFACTS),
                )

    def test_evaluation_cli_and_frozen_native_sidecar_return_equivalent_results(self) -> None:
        machine = platform.machine().lower()
        normalized_machine = "arm64" if machine in {"arm64", "aarch64"} else machine
        system = platform.system().lower()
        executable_name = "lsaa-engine.exe" if system == "windows" else "lsaa-engine"
        executable = (
            ROOT
            / "engine/python/dist"
            / f"{system}-{normalized_machine}"
            / executable_name
            / executable_name
        )
        if not executable.is_file():
            self.skipTest("Frozen native statistical sidecar has not been built on this platform")
        request = welch_request()
        completed = subprocess.run(
            [str(executable)],
            input=json.dumps(request),
            text=True,
            capture_output=True,
            check=True,
            timeout=30,
        )
        native = json.loads(completed.stdout)
        evaluation = run_engine(request)
        native.pop("completedAt", None)
        evaluation.pop("completedAt", None)
        self.assertEqual(native, evaluation)


if __name__ == "__main__":
    unittest.main()
