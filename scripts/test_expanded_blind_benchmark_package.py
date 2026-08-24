from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "benchmark/literature_v2_1/runtime"


class ExpandedBlindPackageTests(unittest.TestCase):
    def test_expanded_schema_determinism_exclusion_and_queue(self) -> None:
        script = r'''
import json
from pathlib import Path
import tempfile
from blind_benchmark_package import (
    EXPANDED_PACKET_KEYS, EXPANDED_ROW_KEYS, create_package, load_package
)
from blind_batch_queue import prepare_batch

with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    first = create_package("LSA052", "expanded_LSA052", root / "packages_a")
    second = create_package("LSA052", "expanded_LSA052", root / "packages_b")
    assert (first / "case.json").read_bytes() == (second / "case.json").read_bytes()
    payload = load_package(root / "packages_a", "LSA052", "expanded_LSA052")
    assert set(payload["researcherPacket"]) == EXPANDED_PACKET_KEYS
    assert all(set(row) == EXPANDED_ROW_KEYS for row in payload["syntheticData"])
    assert payload["researcherPacket"]["independent_session_count"] == 3
    try:
        create_package("LSA138", "excluded_LSA138", root / "excluded")
    except ValueError as error:
        assert "not available" in str(error) or "excluded" in str(error)
    else:
        raise AssertionError("dataset-excluded case was packaged")
    snapshot = prepare_batch(
        "expanded_queue", root / "queue.json", root / "queue_packages", ("LSA052", "LSA054")
    )
    assert snapshot["benchmarkVersion"] == "LSA495_v2_1_repaired_1"
    assert snapshot["total"] == 2 and snapshot["current"]["caseId"] == "LSA052"
    print(json.dumps({"status": "PASS", "rows": len(payload["syntheticData"])}))
'''
        environment = os.environ.copy()
        environment["LSAA_LITERATURE_RUNTIME"] = str(RUNTIME)
        completed = subprocess.run(
            [sys.executable, "-X", "utf8", "-c", script],
            cwd=Path(__file__).parent,
            env=environment,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["status"], "PASS")


if __name__ == "__main__":
    unittest.main()
