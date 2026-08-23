from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

from blind_batch_queue import DEFAULT_CASES, BlindBatchQueue, prepare_batch
from evaluation_bridge import ALLOWED_ARTIFACTS, EvaluationServer


TOKEN = "batch-test-token"
ORIGIN = "http://127.0.0.1:1420"


class BlindBatchQueueTests(unittest.TestCase):
    def test_six_case_poc_order_is_exact_and_each_job_is_unique(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            queue_path = root / "queue.json"
            prepare_batch("batch_six_order", queue_path, root / "packages")
            value = json.loads(queue_path.read_text())
            self.assertEqual(tuple(job["caseId"] for job in value["jobs"]), DEFAULT_CASES)
            self.assertEqual([job["position"] for job in value["jobs"]], list(range(1, 7)))
            self.assertEqual(len({job["runId"] for job in value["jobs"]}), 6)
            self.assertEqual([job["status"] for job in value["jobs"]], ["active"] + ["queued"] * 5)

    def test_order_progress_restart_and_failure_pause_are_persistent(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            queue_path = root / "queue.json"
            snapshot = prepare_batch(
                "batch_queue_test", queue_path, root / "packages", ("JCB003", "JCB004")
            )
            self.assertEqual(snapshot["position"], 1)
            self.assertEqual(snapshot["current"]["caseId"], "JCB003")
            self.assertNotIn("JCB004", json.dumps(snapshot))

            queue = BlindBatchQueue(queue_path)
            first = queue.active_identity()
            queue.mark_completed(first)
            with self.assertRaisesRegex(ValueError, "no active job"):
                queue.assert_active(first)
            restarted = BlindBatchQueue(queue_path)
            second_snapshot = restarted.advance()
            self.assertEqual(second_snapshot["position"], 2)
            self.assertEqual(second_snapshot["current"]["caseId"], "JCB004")
            second = restarted.active_identity()
            restarted.pause(second, "fixture verification failure")
            paused = BlindBatchQueue(queue_path).snapshot()
            self.assertEqual(paused["status"], "paused")
            with self.assertRaisesRegex(ValueError, "no active job"):
                BlindBatchQueue(queue_path).active_identity()

    def test_retry_preserves_failed_attempt_identity_and_arms_only_the_new_run(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            queue_path = root / "queue.json"
            prepare_batch("batch_retry_test", queue_path, root / "packages", ("JCB003", "JCB004"))
            queue = BlindBatchQueue(queue_path)
            old_identity = queue.active_identity()
            queue.retry_active(old_identity, "batch_retry_test_01_JCB003_retry_01", "a" * 64,
                               "metadata persistence defect", "case_state_contamination")
            value = json.loads(queue_path.read_text())
            first = value["jobs"][0]
            self.assertEqual(first["runId"], "batch_retry_test_01_JCB003_retry_01")
            self.assertEqual(first["priorAttempts"][0]["runId"], old_identity[2])
            self.assertEqual(first["priorAttempts"][0]["status"], "case_state_contamination")
            with self.assertRaisesRegex(ValueError, "active blind batch job"):
                queue.assert_active(old_identity)


class BlindBatchBridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.output_root = root / "runs"
        self.package_root = root / "packages"
        self.queue_path = root / "queue.json"
        prepare_batch(
            "batch_bridge_test", self.queue_path, self.package_root,
            ("JCB003", "JCB004", "JCB005"),
        )
        try:
            self.server = EvaluationServer(
                ("127.0.0.1", 0), TOKEN, ORIGIN, self.output_root,
                self.package_root, self.queue_path,
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

    def get(self, path: str) -> dict:
        request = urllib.request.Request(
            self.base + path, headers={"Authorization": f"Bearer {TOKEN}", "Origin": ORIGIN}
        )
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())

    def post(self, path: str, value: dict) -> dict:
        request = urllib.request.Request(
            self.base + path, data=json.dumps(value).encode(), method="POST",
            headers={"Authorization": f"Bearer {TOKEN}", "Origin": ORIGIN,
                     "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())

    def explicit_unsupported_payload(self, current: dict, *, delivery_failed: bool = False) -> dict:
        job = current["current"]
        biological_n = 10 + job["position"]
        events = [
            {"sequence": 1, "occurredAt": "2026-08-23T00:00:00Z",
             "type": "benchmark_run_started", "effect": "non_rendering_ui", "detail": {}},
            {"sequence": 2, "occurredAt": "2026-08-23T00:00:01Z",
             "type": "blind_case_delivery_failed" if delivery_failed else "blind_case_delivered",
             "effect": "non_rendering_ui", "detail": {"caseId": job["caseId"]}},
            {"sequence": 3, "occurredAt": "2026-08-23T00:01:00Z",
             "type": "explicit_unsupported_finalized", "effect": "non_rendering_ui",
             "detail": {"caseId": job["caseId"], "runId": job["runId"],
                        "packageSha256": job["packageSha256"],
                        "scientificReason": "single group cannot be represented"}},
            {"sequence": 4, "occurredAt": "2026-08-23T00:01:01Z",
             "type": "benchmark_metadata_only_outcome_recorded", "effect": "non_rendering_ui",
             "detail": {"outcome": "explicit_unsupported"}},
        ]
        run = {
            "benchmarkVersion": current["benchmarkVersion"], "caseId": job["caseId"],
            "track": job["track"], "runId": job["runId"], "appVersion": "0.1.0",
            "sourceRevision": "fixture-product", "productRevision": "fixture-product",
            "benchmarkInfrastructureRevision": "fixture-infra",
            "startedAt": "2026-08-23T00:00:00Z", "completedAt": "2026-08-23T00:01:01Z",
            "outcome": "explicit_unsupported", "supportStatus": "impossible",
            "artifactCompleteness": "metadata_only_explicit_unsupported",
            "blindPackage": {"caseId": job["caseId"], "runId": job["runId"],
                             "sha256": job["packageSha256"]},
            "evidenceProvenance": {"caseId": job["caseId"], "runId": job["runId"],
                                   "packageSha256": job["packageSha256"]},
            "unsupportedEvidenceProvenanceVersion": "1.0.0",
            "scientificReason": f"{job['caseId']} cannot be represented without compromise.",
            "experimentalUnit": f"unit for {job['caseId']}", "biologicalN": biological_n,
            "attemptedRoutes": [f"route for {job['caseId']}"],
            "scientificCompromiseReason": f"workaround corrupts {job['caseId']}.",
            "interactionCount": len(events),
        }
        return {
            "mode": "evaluation", "syntheticOnly": True,
            "benchmark": {key: run[key] for key in ("benchmarkVersion", "caseId", "track", "runId")},
            "artifacts": [
                {"name": "run.json", "content": json.dumps(run)},
                {"name": "interaction_log.json", "content": json.dumps(events)},
            ],
            "requiredArtifacts": ["run.json", "interaction_log.json"],
        }

    def test_only_active_job_is_visible_writable_and_advanceable_after_verification(self) -> None:
        current = self.get("/api/evaluation/blind-batch/current")
        first = current["current"]
        queue_file = json.loads(self.queue_path.read_text())
        future = queue_file["jobs"][1]
        self.assertNotIn(future["runId"], json.dumps(current))
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.get(
                "/api/evaluation/literature/case?caseId=JCB004&track=track_B"
                f"&runId={future['runId']}"
            )
        self.assertEqual(context.exception.code, 400)
        delivered = self.get(
            "/api/evaluation/literature/case?caseId=JCB003&track=track_B"
            f"&runId={first['runId']}"
        )
        self.assertEqual(delivered["runId"], first["runId"])

        benchmark = {
            "benchmarkVersion": current["benchmarkVersion"], "caseId": first["caseId"],
            "track": first["track"], "runId": first["runId"],
        }
        base = {"mode": "evaluation", "syntheticOnly": True, "benchmark": benchmark}
        defaults = {"default_graph.png", "default_graph.svg"}
        self.post("/api/evaluation/artifacts", {
            **base, "artifacts": [{"name": name, "content": "fixture"} for name in defaults]
        })
        with patch("evaluation_bridge.verify_run_directory"):
            result = self.post("/api/evaluation/artifacts", {
                **base,
                "artifacts": [
                    {"name": name, "content": "{}" if name.endswith(".json") else "fixture"}
                    for name in ALLOWED_ARTIFACTS - defaults
                ],
                "requiredArtifacts": sorted(ALLOWED_ARTIFACTS),
            })
        self.assertTrue(result["verified"])
        advanced = self.post("/api/evaluation/blind-batch/next", {
            "mode": "evaluation", "syntheticOnly": True,
        })
        self.assertEqual(advanced["current"]["caseId"], "JCB004")
        with self.assertRaises(urllib.error.HTTPError) as completed_context:
            self.post("/api/evaluation/artifacts", {
                **base, "artifacts": [{"name": "methods.txt", "content": "overwrite"}]
            })
        self.assertEqual(completed_context.exception.code, 400)

    def test_verifier_failure_pauses_without_arming_the_next_job(self) -> None:
        current = self.get("/api/evaluation/blind-batch/current")
        first = current["current"]
        benchmark = {
            "benchmarkVersion": current["benchmarkVersion"], "caseId": first["caseId"],
            "track": first["track"], "runId": first["runId"],
        }
        base = {"mode": "evaluation", "syntheticOnly": True, "benchmark": benchmark}
        defaults = {"default_graph.png", "default_graph.svg"}
        self.post("/api/evaluation/artifacts", {
            **base, "artifacts": [{"name": name, "content": "fixture"} for name in defaults]
        })
        with patch("evaluation_bridge.verify_run_directory", side_effect=ValueError("bad provenance")):
            with self.assertRaises(urllib.error.HTTPError) as context:
                self.post("/api/evaluation/artifacts", {
                    **base,
                    "artifacts": [
                        {"name": name, "content": "{}" if name.endswith(".json") else "fixture"}
                        for name in ALLOWED_ARTIFACTS - defaults
                    ],
                    "requiredArtifacts": sorted(ALLOWED_ARTIFACTS),
                })
        self.assertEqual(context.exception.code, 400)
        paused = self.get("/api/evaluation/blind-batch/current")
        self.assertEqual(paused["status"], "paused")
        self.assertEqual(paused["current"]["caseId"], "JCB003")
        self.assertEqual(paused["current"]["status"], "infrastructure_failure")
        with self.assertRaises(urllib.error.HTTPError) as next_context:
            self.post("/api/evaluation/blind-batch/next", {
                "mode": "evaluation", "syntheticOnly": True,
            })
        self.assertEqual(next_context.exception.code, 400)

    def test_explicit_unsupported_persists_is_immutable_and_advances_after_restart(self) -> None:
        current = self.get("/api/evaluation/blind-batch/current")
        old_identity = current["current"]
        result = self.post(
            "/api/evaluation/artifacts", self.explicit_unsupported_payload(current)
        )
        self.assertTrue(result["verified"])
        self.assertEqual(set(result["present"]), {"run.json", "interaction_log.json"})
        persisted = self.get("/api/evaluation/blind-batch/current")
        self.assertEqual(persisted["status"], "ready_to_advance")
        self.assertEqual(persisted["current"]["status"], "explicit_unsupported")
        self.assertEqual(persisted["current"]["terminalEvidence"]["supportStatus"], "impossible")
        restarted = BlindBatchQueue(self.queue_path).snapshot()
        self.assertEqual(restarted["current"]["status"], "explicit_unsupported")
        with self.assertRaises(urllib.error.HTTPError) as immutable_context:
            self.post(
                "/api/evaluation/artifacts",
                {"mode": "evaluation", "syntheticOnly": True,
                 "benchmark": {"benchmarkVersion": current["benchmarkVersion"],
                               "caseId": old_identity["caseId"], "track": old_identity["track"],
                               "runId": old_identity["runId"]},
                 "artifacts": [{"name": "run.json", "content": "{}"}]},
            )
        self.assertEqual(immutable_context.exception.code, 400)
        advanced = self.post(
            "/api/evaluation/blind-batch/next",
            {"mode": "evaluation", "syntheticOnly": True},
        )
        self.assertEqual(advanced["position"], 2)
        self.assertEqual(advanced["current"]["caseId"], "JCB004")

    def test_packet_delivery_failure_cannot_finalize_as_explicit_unsupported(self) -> None:
        current = self.get("/api/evaluation/blind-batch/current")
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.post(
                "/api/evaluation/artifacts",
                self.explicit_unsupported_payload(current, delivery_failed=True),
            )
        self.assertEqual(context.exception.code, 400)
        paused = self.get("/api/evaluation/blind-batch/current")
        self.assertEqual(paused["status"], "paused")
        self.assertEqual(paused["current"]["status"], "infrastructure_failure")

    def test_three_unsupported_runs_keep_distinct_artifacts_and_provenance(self) -> None:
        recorded: list[tuple[str, str, int]] = []
        for expected_position in range(1, 4):
            current = self.get("/api/evaluation/blind-batch/current")
            job = current["current"]
            self.post("/api/evaluation/artifacts", self.explicit_unsupported_payload(current))
            run_path = self.output_root / job["caseId"] / job["track"] / job["runId"] / "run.json"
            run = json.loads(run_path.read_text())
            self.assertEqual(run["evidenceProvenance"], {
                "caseId": job["caseId"], "runId": job["runId"],
                "packageSha256": job["packageSha256"],
            })
            self.assertIn(job["caseId"], run["scientificReason"])
            recorded.append((run["caseId"], run["experimentalUnit"], run["biologicalN"]))
            advanced = self.post(
                "/api/evaluation/blind-batch/next",
                {"mode": "evaluation", "syntheticOnly": True},
            )
            self.assertEqual(advanced["completed"], expected_position)
        self.assertEqual(len({value for _, value, _ in recorded}), 3)
        self.assertEqual(len({value for _, _, value in recorded}), 3)
        self.assertEqual(advanced["status"], "completed")

    def test_foreign_unsupported_evidence_provenance_is_rejected(self) -> None:
        current = self.get("/api/evaluation/blind-batch/current")
        payload = self.explicit_unsupported_payload(current)
        run_artifact = next(
            artifact for artifact in payload["artifacts"] if artifact["name"] == "run.json"
        )
        run = json.loads(run_artifact["content"])
        run["evidenceProvenance"]["caseId"] = "NC033"
        run_artifact["content"] = json.dumps(run)
        with self.assertRaises(urllib.error.HTTPError) as context:
            self.post("/api/evaluation/artifacts", payload)
        self.assertEqual(context.exception.code, 400)
        paused = self.get("/api/evaluation/blind-batch/current")
        self.assertEqual(paused["status"], "paused")


if __name__ == "__main__":
    unittest.main()
