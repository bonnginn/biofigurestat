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


class BlindBatchBridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.output_root = root / "runs"
        self.package_root = root / "packages"
        self.queue_path = root / "queue.json"
        prepare_batch("batch_bridge_test", self.queue_path, self.package_root, ("JCB003", "JCB004"))
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


if __name__ == "__main__":
    unittest.main()
