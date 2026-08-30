from __future__ import annotations

import io
import json
import subprocess
import sys
import unittest
from unittest.mock import patch

from lsaa_engine import cli


REQUEST = {
    "protocolVersion": "0.1.0",
    "requestId": "request.cli.contract",
}


def _rank_request(template_id: str) -> dict:
    if template_id == "D01":
        conditions = ["a", "b"]
        protocol_version = "0.1.0"
    else:
        conditions = ["a", "b", "c"]
        protocol_version = "0.2.0" if template_id == "D03" else "0.12.0"

    request = {
        "protocolVersion": protocol_version,
        "requestId": f"request.cli.{template_id.lower()}",
        "projectId": "project.cli",
        "analysisId": "analysis.cli",
        "templateId": template_id,
        "templateVersion": "0.1.0",
        "method": {"D01": "mann_whitney", "D03": "kruskal_wallis", "D15": "friedman"}[
            template_id
        ],
        "observations": [
            {
                "observationId": f"o.{condition}.{replicate}",
                "conditionId": condition,
                "experimentalUnitId": f"u.{replicate}" if template_id == "D15" else f"u.{condition}.{replicate}",
                "pairId": f"u.{replicate}" if template_id == "D15" else None,
                "value": 2.0,
            }
            for replicate in range(3)
            for condition in conditions
        ],
        "options": {
            "alternative": "two_sided",
            "confidenceLevel": 0.95,
            "multiplicityMethod": "holm_wilcoxon_all_pairs" if template_id == "D15" else None,
        },
    }
    if template_id == "D01":
        request["contrastConditionIds"] = conditions
    elif template_id == "D03":
        request.update(
            {
                "conditionIds": conditions,
                "controlConditionId": conditions[0],
                "contrastIntent": "all_pairs",
                "primaryContrastConditionIds": [conditions[0], conditions[-1]],
                "options": {**request["options"], "multiplicityMethod": "dunn_holm_all_pairs"},
            }
        )
    else:
        request["conditionIds"] = conditions
    return request


class CliContractTests(unittest.TestCase):
    def _run_main(self, engine_result=None, engine_error: Exception | None = None):
        stdin = io.StringIO(json.dumps(REQUEST))
        stdout = io.StringIO()
        stderr = io.StringIO()
        if engine_error is not None:
            behavior = {"side_effect": engine_error}
        else:
            behavior = {"return_value": engine_result}
        with (
            patch("lsaa_engine.cli.run_request", **behavior),
            patch("sys.stdin", stdin),
            patch("sys.stdout", stdout),
            patch("sys.stderr", stderr),
        ):
            exit_code = cli.main()
        return exit_code, stdout.getvalue(), stderr.getvalue()

    def test_non_finite_engine_result_falls_back_to_one_complete_json_document(self):
        exit_code, stdout, stderr = self._run_main(
            {
                "protocolVersion": "0.1.0",
                "requestId": REQUEST["requestId"],
                "status": "ok",
                "pValue": float("nan"),
            }
        )

        self.assertEqual(exit_code, 0)
        payload = json.loads(stdout)
        self.assertEqual(payload["status"], "validation_error")
        self.assertEqual(payload["diagnostics"][0]["code"], "internal_engine_error")
        self.assertEqual(stdout.count("\n"), 1)
        self.assertIn("Out of range float values", stderr)

    def test_unexpected_exception_is_hidden_from_stdout_and_reported_to_stderr(self):
        exit_code, stdout, stderr = self._run_main(
            engine_error=RuntimeError("sensitive internal detail")
        )

        self.assertEqual(exit_code, 0)
        payload = json.loads(stdout)
        self.assertEqual(payload["status"], "validation_error")
        self.assertEqual(payload["diagnostics"][0]["code"], "internal_engine_error")
        self.assertNotIn("sensitive internal detail", stdout)
        self.assertIn("sensitive internal detail", stderr)
        self.assertEqual(stdout.count("\n"), 1)

    def test_all_identical_rank_inputs_return_one_validation_json_from_real_cli(self):
        expected_messages = {
            "D01": "Mann-Whitney U is undefined when every analyzed value is identical",
            "D03": "Kruskal-Wallis is undefined when every analyzed value is identical",
            "D15": "Friedman is undefined when every analyzed value is identical",
        }
        for template_id, expected_message in expected_messages.items():
            with self.subTest(template_id=template_id):
                completed = subprocess.run(
                    [sys.executable, "-m", "lsaa_engine.cli"],
                    input=json.dumps(_rank_request(template_id)),
                    text=True,
                    capture_output=True,
                    check=False,
                )

                self.assertEqual(completed.returncode, 0)
                payload = json.loads(completed.stdout)
                self.assertEqual(payload["status"], "validation_error")
                self.assertEqual(payload["diagnostics"][0]["message"], expected_message)
                self.assertEqual(completed.stdout.count("\n"), 1)
                self.assertEqual(completed.stderr, "")


if __name__ == "__main__":
    unittest.main()
