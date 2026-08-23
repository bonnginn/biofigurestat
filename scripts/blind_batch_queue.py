#!/usr/bin/env python3
"""Persistent trusted-side queue for external fresh-blind Track B batches."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Any

from blind_benchmark_package import ROOT, SAFE_ID, create_package, load_package


SCHEMA_VERSION = "1.0.0"
DEFAULT_CASES = ("JCB010", "NC033", "JCB023", "JCB024", "JCB015", "SA047")
EVALUATED_STATUSES = {"completed", "explicit_unsupported"}
FAILURE_STATUSES = {"infrastructure_failure", "contaminated", "aborted"}
TERMINAL_STATUSES = {*EVALUATED_STATUSES, *FAILURE_STATUSES}
JOB_STATUSES = {"queued", "active", *TERMINAL_STATUSES}
BATCH_STATUSES = {"running", "ready_to_advance", "paused", "completed"}


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


class BlindBatchQueue:
    """Read and atomically mutate one queue file. Future jobs are never in snapshots."""

    def __init__(self, path: Path) -> None:
        self.path = path.resolve()
        if self.path == ROOT or ROOT in self.path.parents:
            raise ValueError("Blind batch queue must be outside the full source tree")
        self._lock = threading.RLock()
        self._read()

    def _read(self) -> dict[str, Any]:
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError(f"Blind batch queue is unavailable: {error}") from error
        if not isinstance(value, dict) or value.get("schemaVersion") != SCHEMA_VERSION:
            raise ValueError("Blind batch queue schema mismatch")
        jobs = value.get("jobs")
        if not isinstance(jobs, list) or not jobs:
            raise ValueError("Blind batch queue contains no jobs")
        active_count = 0
        if value.get("status") not in BATCH_STATUSES:
            raise ValueError("Blind batch status is invalid")
        for index, job in enumerate(jobs, 1):
            if not isinstance(job, dict) or job.get("position") != index:
                raise ValueError("Blind batch queue order is invalid")
            if job.get("status") == "active":
                active_count += 1
            if job.get("status") not in JOB_STATUSES:
                raise ValueError("Blind batch job status is invalid")
            if any(not isinstance(job.get(key), str) or not SAFE_ID.fullmatch(job[key])
                   for key in ("caseId", "runId")):
                raise ValueError("Blind batch job identity is invalid")
            if job.get("track") != "track_B" or not isinstance(job.get("packageSha256"), str):
                raise ValueError("Blind batch job metadata is invalid")
        if value.get("status") == "running" and active_count != 1:
            raise ValueError("Running blind batch must have exactly one active job")
        if active_count > 1:
            raise ValueError("Blind batch has multiple active jobs")
        evaluated_positions = [job["position"] for job in jobs if job["status"] in EVALUATED_STATUSES]
        if evaluated_positions != list(range(1, len(evaluated_positions) + 1)):
            raise ValueError("Blind batch evaluated jobs are not a contiguous prefix")
        return value

    def _write(self, value: dict[str, Any]) -> None:
        _atomic_json(self.path, value)

    def active_identity(self) -> tuple[str, str, str]:
        with self._lock:
            value = self._read()
            active = next((job for job in value["jobs"] if job["status"] == "active"), None)
            if active is None:
                raise ValueError("Blind batch has no active job")
            return active["caseId"], active["track"], active["runId"]

    def assert_active(self, identity: tuple[str, str, str]) -> None:
        if identity != self.active_identity():
            raise ValueError("Benchmark identity is not the active blind batch job")

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            value = self._read()
            jobs = value["jobs"]
            current_job = next((job for job in jobs if job["status"] == "active"), None)
            if current_job is None and value["status"] == "ready_to_advance":
                current_job = next(
                    (job for job in reversed(jobs) if job["status"] in EVALUATED_STATUSES), None
                )
            if current_job is None and value["status"] == "paused":
                current_job = next((job for job in jobs if job["status"] in FAILURE_STATUSES), None)
            current = None if current_job is None else {
                key: current_job[key]
                for key in ("position", "caseId", "track", "runId", "packageSha256", "status")
            }
            if current is not None and isinstance(current_job.get("terminalEvidence"), dict):
                current["terminalEvidence"] = current_job["terminalEvidence"]
            return {
                "batchId": value["batchId"],
                "benchmarkVersion": value["benchmarkVersion"],
                "status": value["status"],
                "position": current_job["position"] if current_job else len(jobs),
                "total": len(jobs),
                "completed": sum(job["status"] in EVALUATED_STATUSES for job in jobs),
                "current": current,
            }

    def mark_evaluated(
        self, identity: tuple[str, str, str], status: str,
        terminal_evidence: dict[str, Any] | None = None,
    ) -> None:
        if status not in EVALUATED_STATUSES:
            raise ValueError("Blind batch evaluated status is invalid")
        with self._lock:
            value = self._read()
            active = next((job for job in value["jobs"] if job["status"] == "active"), None)
            if active is None or identity != (active["caseId"], active["track"], active["runId"]):
                raise ValueError("Only the active blind batch job can be completed")
            active["status"] = status
            if terminal_evidence is not None:
                active["terminalEvidence"] = terminal_evidence
            value["status"] = "ready_to_advance"
            self._write(value)

    def mark_completed(self, identity: tuple[str, str, str]) -> None:
        self.mark_evaluated(identity, "completed")

    def mark_explicit_unsupported(
        self, identity: tuple[str, str, str], terminal_evidence: dict[str, Any]
    ) -> None:
        self.mark_evaluated(identity, "explicit_unsupported", terminal_evidence)

    def pause(self, identity: tuple[str, str, str], reason: str,
              status: str = "infrastructure_failure") -> None:
        if status not in FAILURE_STATUSES:
            raise ValueError("Blind batch pause status is invalid")
        with self._lock:
            value = self._read()
            active = next((job for job in value["jobs"] if job["status"] == "active"), None)
            if active and identity == (active["caseId"], active["track"], active["runId"]):
                active["status"] = status
                active["failureReason"] = reason[:500]
                value["status"] = "paused"
                self._write(value)

    def advance(self) -> dict[str, Any]:
        with self._lock:
            value = self._read()
            if value["status"] != "ready_to_advance":
                raise ValueError("Current blind batch job has not passed final verification")
            jobs = value["jobs"]
            evaluated = [
                index for index, job in enumerate(jobs) if job["status"] in EVALUATED_STATUSES
            ]
            if not evaluated:
                raise ValueError("Blind batch has no verified completed job")
            next_index = max(evaluated) + 1
            if next_index >= len(jobs):
                value["status"] = "completed"
            else:
                if jobs[next_index]["status"] != "queued":
                    raise ValueError("Blind batch next job is not queued")
                jobs[next_index]["status"] = "active"
                value["status"] = "running"
            self._write(value)
            return self.snapshot()

    def retry_active(
        self, identity: tuple[str, str, str], new_run_id: str, package_sha256: str,
        reason: str, prior_status: str = "diagnostic_infrastructure_failure",
    ) -> None:
        if (
            not SAFE_ID.fullmatch(new_run_id)
            or len(package_sha256) != 64
            or any(character not in "0123456789abcdef" for character in package_sha256)
        ):
            raise ValueError("Blind batch retry identity is invalid")
        if prior_status not in {
            "diagnostic_infrastructure_failure", "case_state_contamination", "aborted"
        }:
            raise ValueError("Blind batch retry prior status is invalid")
        with self._lock:
            value = self._read()
            active = next((job for job in value["jobs"] if job["status"] == "active"), None)
            if active is None or identity != (active["caseId"], active["track"], active["runId"]):
                raise ValueError("Only the active blind batch job can be retried")
            known_run_ids = {
                attempt.get("runId")
                for job in value["jobs"]
                for attempt in job.get("priorAttempts", [])
                if isinstance(attempt, dict)
            } | {job["runId"] for job in value["jobs"]}
            if new_run_id in known_run_ids:
                raise ValueError("Blind batch retry run ID must be unique")
            attempts = active.setdefault("priorAttempts", [])
            attempts.append({
                "runId": active["runId"],
                "packageSha256": active["packageSha256"],
                "status": prior_status,
                "reason": reason[:500],
            })
            active["runId"] = new_run_id
            active["packageSha256"] = package_sha256
            self._write(value)


def prepare_batch(batch_id: str, queue_path: Path, package_root: Path,
                  cases: tuple[str, ...] = DEFAULT_CASES) -> dict[str, Any]:
    if not SAFE_ID.fullmatch(batch_id) or queue_path.exists():
        raise ValueError("Batch ID must be fresh and use a safe identifier")
    jobs: list[dict[str, Any]] = []
    for position, case_id in enumerate(cases, 1):
        run_id = f"{batch_id}_{position:02d}_{case_id}"
        target = create_package(case_id, run_id, package_root)
        payload = load_package(package_root, case_id, run_id)
        manifest = json.loads((target / "manifest.json").read_text(encoding="utf-8"))
        if payload["caseId"] != case_id:
            raise ValueError("Generated blind package identity mismatch")
        jobs.append({
            "position": position, "caseId": case_id, "track": "track_B", "runId": run_id,
            "packageSha256": manifest["payloadSha256"],
            "status": "active" if position == 1 else "queued",
        })
    value = {
        "schemaVersion": SCHEMA_VERSION, "batchId": batch_id,
        "benchmarkVersion": "LSA50_v1_1", "status": "running", "jobs": jobs,
    }
    _atomic_json(queue_path.resolve(), value)
    return BlindBatchQueue(queue_path).snapshot()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-id", required=True)
    parser.add_argument("--queue-path", type=Path, required=True)
    parser.add_argument("--package-root", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare_batch(args.batch_id, args.queue_path, args.package_root), indent=2))


if __name__ == "__main__":
    main()
