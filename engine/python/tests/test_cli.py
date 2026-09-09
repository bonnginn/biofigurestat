from __future__ import annotations

import io
import json
import os
import unittest
import subprocess
import sys
from contextlib import redirect_stderr, redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

from lsaa_engine import cli


class CliProtocolIsolationTests(unittest.TestCase):
    def test_real_cli_constant_rank_inputs_never_crash_or_emit_nonfinite_json(self):
        cases = [
            ("0.1.0", "D01", "mann_whitney", 2, "omnibus_only", None),
            ("0.2.0", "D03", "kruskal_wallis", 3, "omnibus_only", None),
            ("0.2.0", "D03", "kruskal_wallis", 3, "all_pairs", "dunn_holm_all_pairs"),
            ("0.12.0", "D15", "friedman", 3, "all_pairs", "holm_all_pairs"),
        ]
        for protocol, template, method, count, intent, correction in cases:
            with self.subTest(method=method, intent=intent):
                conditions = [f"condition.{index}" for index in range(count)]
                request = {
                    "protocolVersion": protocol, "requestId": "request.constant-ranks",
                    "projectId": "project.synthetic", "analysisId": "analysis.synthetic",
                    "templateId": template, "templateVersion": "0.1.0", "method": method,
                    "conditionIds": conditions, "contrastConditionIds": conditions[:2],
                    "contrastIntent": intent,
                    "options": {"alternative": "two_sided", "confidenceLevel": 0.95,
                                "multiplicityMethod": correction},
                    "observations": [
                        {"observationId": f"observation.{group}.{replicate}",
                         "conditionId": condition, "value": 1.0,
                         "experimentalUnitId": f"unit.{group}.{replicate}",
                         **({"pairId": f"pair.{replicate}"} if template == "D15" else {})}
                        for group, condition in enumerate(conditions) for replicate in range(3)
                    ],
                }
                completed = subprocess.run(
                    ([os.environ["LSAA_CLI_TEST_EXECUTABLE"]]
                     if os.environ.get("LSAA_CLI_TEST_EXECUTABLE")
                     else [sys.executable, "-m", "lsaa_engine.cli"]),
                    input=json.dumps(request), text=True, capture_output=True, timeout=30,
                )
                self.assertEqual(completed.returncode, 0, completed.stderr)
                def reject_constant(value):
                    self.fail(f"Non-finite protocol token: {value}")
                result = json.loads(completed.stdout, parse_constant=reject_constant)
                self.assertEqual(result["requestId"], request["requestId"])
                self.assertIn(result["status"], ["ok", "validation_error"])
                if result["status"] == "validation_error":
                    self.assertEqual(result["tests"], [])
                    self.assertNotIn("Unsupported", result["diagnostics"][0]["message"])

    def _invoke(self, request, **runner_patch):
        stdout = io.StringIO()
        with (
            patch.object(cli.sys, "stdin", io.StringIO(json.dumps(request))),
            patch.object(cli, "run_request", **runner_patch),
            redirect_stdout(stdout),
        ):
            self.assertEqual(cli.main(), 0)
        # Reject nonstandard NaN/Infinity tokens, not just malformed JSON.
        def reject_constant(value):
            self.fail(f"Non-finite protocol token: {value}")
        return json.loads(stdout.getvalue(), parse_constant=reject_constant)

    def test_nonfinite_results_become_one_complete_error_response(self):
        for value in [float("nan"), float("inf"), float("-inf")]:
            with self.subTest(value=value):
                parsed = self._invoke(
                    {"requestId": "request.nonfinite"},
                    return_value={"status": "ok", "tests": [{"pValue": value}]},
                )
                self.assertEqual(parsed["status"], "validation_error")
                self.assertEqual(parsed["requestId"], "request.nonfinite")
                self.assertEqual(parsed["tests"], [])
                self.assertEqual(parsed["diagnostics"][0]["code"], "invalid_numerical_result")

    def test_arithmetic_failures_return_valid_json_without_partial_results(self):
        for error in [ZeroDivisionError(), OverflowError(), FloatingPointError()]:
            with self.subTest(error=type(error).__name__):
                parsed = self._invoke({"requestId": "request.arithmetic"}, side_effect=error)
                self.assertEqual(parsed["status"], "validation_error")
                self.assertEqual(parsed["diagnostics"][0]["code"], "undefined_calculation")

    def test_non_object_requests_stop_with_a_protocol_response(self):
        for request in [None, [], 42]:
            with self.subTest(request=request):
                parsed = self._invoke(request, return_value={})
                self.assertEqual(parsed["status"], "validation_error")

    def test_binary_protocol_round_trips_utf8_independently_of_text_stream_encoding(self):
        request = {
            "protocolVersion": "0.15.0",
            "requestId": "request.cli-utf8",
            "rationale": "観測値から決めず事前指定",
        }
        stdin = SimpleNamespace(
            buffer=io.BytesIO(json.dumps(request, ensure_ascii=False).encode("utf-8"))
        )
        stdout_bytes = io.BytesIO()
        stdout = SimpleNamespace(buffer=stdout_bytes)
        with (
            patch.object(cli.sys, "stdin", stdin),
            patch.object(cli.sys, "stdout", stdout),
            patch.object(cli, "run_request", side_effect=lambda value: {**value, "status": "ok"}),
        ):
            self.assertEqual(cli.main(), 0)

        parsed = json.loads(stdout_bytes.getvalue().decode("utf-8"))
        self.assertEqual(parsed["status"], "ok")
        self.assertEqual(parsed["rationale"], request["rationale"])

    def test_incidental_analysis_output_cannot_corrupt_stdout_json(self):
        request = {
            "protocolVersion": "0.15.0",
            "requestId": "request.cli-output-isolation",
        }

        def noisy_result(_request):
            print("incidental numerical-library output")
            return {
                "protocolVersion": "0.15.0",
                "requestId": "request.cli-output-isolation",
                "status": "ok",
                "message": "観測値から決めず事前指定",
            }

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.object(cli.sys, "stdin", io.StringIO(json.dumps(request))),
            patch.object(cli, "run_request", side_effect=noisy_result),
            redirect_stdout(stdout),
            redirect_stderr(stderr),
        ):
            self.assertEqual(cli.main(), 0)

        parsed = json.loads(stdout.getvalue())
        self.assertEqual(parsed["status"], "ok")
        self.assertEqual(parsed["requestId"], request["requestId"])
        self.assertEqual(parsed["message"], "観測値から決めず事前指定")
        self.assertNotIn("incidental", stdout.getvalue())
        self.assertIn("incidental numerical-library output", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
