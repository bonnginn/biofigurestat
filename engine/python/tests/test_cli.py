from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch

from lsaa_engine import cli


class CliProtocolIsolationTests(unittest.TestCase):
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
