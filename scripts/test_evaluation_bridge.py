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

from blind_benchmark_package import create_package

from evaluation_bridge import (
    ALLOWED_ARTIFACTS,
    ROOT,
    EvaluationServer,
    load_literature_experimenter_view,
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


def unicode_mixed_request() -> dict:
    values = {
        "control.1": [1.0, 2.0, 3.0],
        "control.2": [2.0, 2.8, 4.2],
        "control.3": [1.5, 2.7, 3.4],
        "treatment.1": [1.0, 2.4, 4.1],
        "treatment.2": [2.0, 3.6, 4.8],
        "treatment.3": [1.4, 3.1, 4.7],
    }
    observations = []
    for unit_name, unit_values in values.items():
        condition = f"condition.{unit_name.split('.')[0]}"
        unit_id = f"unit.{unit_name}"
        for radius_index, (radius, value) in enumerate(zip((0, 10, 20), unit_values)):
            observations.append(
                {
                    "observationId": f"observation.{unit_name}.{radius_index}",
                    "conditionId": condition,
                    "value": value,
                    "experimentalUnitId": unit_id,
                    "pairId": unit_id,
                    "timePointId": f"radius.{radius}",
                }
            )
    return {
        "protocolVersion": "0.6.0",
        "requestId": "request.bridge.unicode",
        "projectId": "project.bridge.unicode",
        "analysisId": "analysis.bridge.unicode",
        "templateId": "D06",
        "templateVersion": "0.1.0",
        "method": "mixed_anova",
        "withinFactor": {"role": "numeric_covariate", "title": "Radius", "unit": "µm"},
        "conditionIds": ["condition.control", "condition.treatment"],
        "timePoints": [
            {"timePointId": f"radius.{radius}", "value": radius} for radius in (0, 10, 20)
        ],
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
        self.blind_temporary = tempfile.TemporaryDirectory()
        create_package("JCB003", "fresh_B_JCB003_test", Path(self.blind_temporary.name))
        try:
            self.server = EvaluationServer(
                ("127.0.0.1", 0), TOKEN, ORIGIN, Path(self.temporary.name),
                Path(self.blind_temporary.name),
            )
        except PermissionError:
            self.temporary.cleanup()
            self.blind_temporary.cleanup()
            self.skipTest("Current sandbox does not permit loopback socket binding")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.temporary.cleanup()
        self.blind_temporary.cleanup()

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

    def get(self, path: str, token: str = TOKEN, origin: str = ORIGIN) -> dict:
        request = urllib.request.Request(
            self.base + path,
            headers={"Authorization": f"Bearer {token}", "Origin": origin},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())

    def test_literature_case_endpoint_enforces_track_specific_blinding(self) -> None:
        track_a = self.get("/api/evaluation/literature/case?caseId=JCB003&track=track_A&runId=fresh_A_JCB003_test")
        track_b = self.get("/api/evaluation/literature/case?caseId=JCB003&track=track_B&runId=fresh_B_JCB003_test")
        self.assertIn("paperReference", track_a)
        self.assertNotIn("paperReference", track_b)
        serialized_b = json.dumps(track_b).lower()
        for forbidden in ("scope_expectation", "paper_reported", "gold", "recommended"):
            self.assertNotIn(forbidden, serialized_b)
        self.assertEqual(track_a["syntheticData"], track_b["syntheticData"])
        self.assertEqual(track_b["role"], "track_B_experimenter")
        self.assertEqual(track_b["runId"], "fresh_B_JCB003_test")

    def test_track_b_never_falls_back_to_repository_runtime(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.get("/api/evaluation/literature/case?caseId=JCB003&track=track_B&runId=missing_fresh_run")
        self.assertEqual(context.exception.code, 400)

    def test_contaminated_run_is_invalid_and_read_only(self) -> None:
        for run_id in ("pilot15_B_JCB010_001", "external_blind_B_JCB010_001"):
            with self.subTest(run_id=run_id):
                with self.assertRaises(urllib.error.HTTPError) as context:
                    self.get(
                        "/api/evaluation/literature/case"
                        f"?caseId=JCB010&track=track_B&runId={run_id}"
                    )
                self.assertEqual(context.exception.code, 400)
                with self.assertRaises(urllib.error.HTTPError) as write_context:
                    self.post(
                        "/api/evaluation/artifacts",
                        {
                            "mode": "evaluation",
                            "syntheticOnly": True,
                            "benchmark": {
                                "caseId": "JCB010",
                                "track": "track_B",
                                "runId": run_id,
                            },
                            "artifacts": [{"name": "run.json", "content": "{}"}],
                        },
                    )
                self.assertEqual(write_context.exception.code, 400)

    def test_literature_case_endpoint_rejects_invalid_identity(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.get("/api/evaluation/literature/case?caseId=../escape&track=track_B&runId=fresh_B_JCB003_test")
        self.assertEqual(context.exception.code, 400)

    def test_browser_bridge_returns_same_engine_result_as_direct_protocol(self) -> None:
        request = welch_request()
        direct = run_engine(request)
        bridged = self.post(
            "/api/evaluation/analysis",
            {"mode": "evaluation", "syntheticOnly": True, "request": request},
        )["result"]
        direct_completed_at = direct.pop("completedAt")
        bridged_completed_at = bridged.pop("completedAt")
        self.assertRegex(direct_completed_at, r"^\d{4}-\d{2}-\d{2}T")
        self.assertRegex(bridged_completed_at, r"^\d{4}-\d{2}-\d{2}T")
        self.assertEqual(bridged, direct)
        self.assertEqual(bridged["engine"]["version"], "0.7.0")

    def test_browser_bridge_uses_utf8_for_unicode_factor_metadata(self) -> None:
        request = unicode_mixed_request()
        result = self.post(
            "/api/evaluation/analysis",
            {
                "mode": "evaluation",
                "syntheticOnly": True,
                "request": request,
            },
        )["result"]
        self.assertEqual(
            result["factorMetadata"]["withinFactor"]["unit"],
            request["withinFactor"]["unit"],
        )
        self.assertEqual(result["tests"][0]["name"], "condition_by_within_factor_interaction")

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

    def test_manual_track_a_explicit_unsupported_is_source_verified(self) -> None:
        run_id = "fresh_A_JCB017_bridge_001"
        source = self.get(
            f"/api/evaluation/literature/case?caseId=JCB017&track=track_A&runId={run_id}"
        )
        source_sha = source["sourceViewSha256"]
        events = [
            {"sequence": 1, "occurredAt": "2026-08-23T00:00:00Z", "type": "benchmark_run_started", "effect": "non_rendering_ui", "detail": {}},
            {"sequence": 2, "occurredAt": "2026-08-23T00:00:01Z", "type": "blind_case_delivered", "effect": "non_rendering_ui", "detail": {"caseId": "JCB017"}},
            {"sequence": 3, "occurredAt": "2026-08-23T00:01:00Z", "type": "explicit_unsupported_finalized", "effect": "non_rendering_ui", "detail": {"caseId": "JCB017", "runId": run_id, "sourceViewSha256": source_sha}},
            {"sequence": 4, "occurredAt": "2026-08-23T00:01:01Z", "type": "benchmark_metadata_only_outcome_recorded", "effect": "non_rendering_ui", "detail": {"outcome": "explicit_unsupported"}},
        ]
        run = {
            "benchmarkVersion": "LSA50_v1_1_runtime_hierarchy_2", "caseId": "JCB017",
            "track": "track_A", "runId": run_id, "appVersion": "0.1.0",
            "sourceRevision": "fixture", "productRevision": "fixture",
            "benchmarkInfrastructureRevision": "fixture", "startedAt": events[0]["occurredAt"],
            "completedAt": events[-1]["occurredAt"], "outcome": "explicit_unsupported",
            "supportStatus": "impossible", "artifactCompleteness": "metadata_only_explicit_unsupported",
            "trackASourceView": {"caseId": "JCB017", "runId": run_id, "sha256": source_sha},
            "evidenceProvenance": {"caseId": "JCB017", "runId": run_id, "sourceViewSha256": source_sha},
            "unsupportedEvidenceProvenanceVersion": "1.1.0", "scientificReason": "WB lineage cannot be loaded safely.",
            "experimentalUnit": "independent WB replicate", "biologicalN": 4,
            "attemptedRoutes": ["safe literature loader"],
            "scientificCompromiseReason": "Manual reconstruction would lose lineage.",
            "interactionCount": len(events),
        }
        result = self.post(
            "/api/evaluation/artifacts",
            {"mode": "evaluation", "syntheticOnly": True,
             "benchmark": {key: run[key] for key in ("benchmarkVersion", "caseId", "track", "runId")},
             "artifacts": [
                 {"name": "run.json", "content": json.dumps(run)},
                 {"name": "interaction_log.json", "content": json.dumps(events)},
             ],
             "requiredArtifacts": ["run.json", "interaction_log.json"]},
        )
        self.assertTrue(result["verified"])

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
    def test_track_a_view_has_a_deterministic_source_ownership_hash(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = load_literature_experimenter_view("JCB003", "track_A", "fresh_A_001", root)
            second = load_literature_experimenter_view("JCB003", "track_A", "fresh_A_002", root)
        self.assertRegex(first["sourceViewSha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(first["sourceViewSha256"], second["sourceViewSha256"])

    def test_direct_literature_views_do_not_leak_gold_to_track_b(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            create_package("JCB003", "fresh_boundary_001", root)
            track_b = load_literature_experimenter_view(
                "JCB003", "track_B", "fresh_boundary_001", root
            )
        self.assertNotIn("paperReference", track_b)
        self.assertNotIn("gold", json.dumps(track_b).lower())

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
            original_default = (target / "default_graph.svg").read_text()
            with self.assertRaisesRegex(ValueError, "Immutable benchmark artifact"):
                write_artifact_batch(
                    root,
                    benchmark,
                    [{"name": "default_graph.svg", "content": "replacement"}],
                    [],
                )
            self.assertEqual((target / "default_graph.svg").read_text(), original_default)

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
