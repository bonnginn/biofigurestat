import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/preflight_expanded_literature.py"
RUNTIME = ROOT / "benchmark/literature_v2_1/runtime"


class ExpandedPreflightTest(unittest.TestCase):
    def test_round_one_preflight_is_exhaustive_and_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "report.json"
            environment = {**os.environ, "LSAA_LITERATURE_RUNTIME": str(RUNTIME)}
            completed = subprocess.run(
                [sys.executable, str(SCRIPT), "--output", str(output)],
                cwd=ROOT,
                env=environment,
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertIn('"overall": "PASS"', completed.stdout)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["caseCount"], 89)
            self.assertEqual(len(report["cases"]), 89)
            self.assertEqual(len({case["caseId"] for case in report["cases"]}), 89)
            self.assertEqual(report["checks"]["blindLeakageScan"], "PASS")
            self.assertEqual(report["checks"]["queueTransition"], "PASS")
            self.assertEqual(
                sum(report["loaderSummary"]["statusCounts"].values()),
                89,
            )


if __name__ == "__main__":
    unittest.main()
