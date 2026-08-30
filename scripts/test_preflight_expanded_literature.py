import json
import os
import subprocess
import sys
import tempfile
import unittest
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/preflight_expanded_literature.py"
RUNTIME = ROOT / "benchmark/literature_v2_1/runtime"


def load_preflight_module():
    spec = importlib.util.spec_from_file_location("expanded_preflight", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.path.insert(0, str(ROOT / "scripts"))
    spec.loader.exec_module(module)
    return module


class ExpandedPreflightTest(unittest.TestCase):
    def test_linked_multi_readout_contract_requires_a_complete_readout_set(self) -> None:
        module = load_preflight_module()
        payload = json.loads(
            (RUNTIME / "cases" / "LSA135" / "experimenter_track_b.json").read_text(
                encoding="utf-8"
            )
        )
        assessment = module.assess_loader_contract(payload)
        self.assertEqual(assessment["status"], "compatible")
        self.assertEqual(assessment["shape"], "linked_nested_continuous")
        self.assertEqual(assessment["readoutCount"], 2)
        self.assertEqual(assessment["experimentCount"], 5)

        incomplete = {**payload, "syntheticData": payload["syntheticData"][1:]}
        refusal = module.assess_loader_contract(incomplete)
        self.assertEqual(refusal["status"], "safe_refusal")
        self.assertEqual(refusal["reason"], "incomplete_or_ambiguous_linked_readouts")

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
