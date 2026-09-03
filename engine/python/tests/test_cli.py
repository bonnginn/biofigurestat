from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

from lsaa_engine import cli


class CliProtocolIsolationTests(unittest.TestCase):
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
        self.assertNotIn("incidental", stdout.getvalue())
        self.assertIn("incidental numerical-library output", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
