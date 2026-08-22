from __future__ import annotations

import unittest

from run_evaluation_environment import (
    BRIDGE_PORT,
    UI_PORT,
    create_evaluation_environment,
    pinned_engine_status,
)


class EvaluationLauncherTests(unittest.TestCase):
    def test_pinned_engine_environment_matches_migration_contract(self) -> None:
        status = pinned_engine_status()
        self.assertIn("lsaa-analysis-engine 0.7.0", status)
        self.assertIn("numpy 2.3.5", status)
        self.assertIn("scipy 1.18.0", status)
        self.assertIn("statsmodels 0.14.6", status)

    def test_token_and_bridge_address_are_server_only_environment_variables(self) -> None:
        environment = create_evaluation_environment({"BASE": "kept"}, "fixture-secret")
        self.assertEqual(environment["BASE"], "kept")
        self.assertEqual(environment["VITE_LSAA_EVALUATION_MODE"], "true")
        self.assertTrue(environment["VITE_LSAA_SOURCE_REVISION"])
        self.assertEqual(
            environment["LSAA_EVALUATION_BRIDGE_TARGET"],
            f"http://127.0.0.1:{BRIDGE_PORT}",
        )
        self.assertEqual(environment["LSAA_EVALUATION_BRIDGE_TOKEN"], "fixture-secret")
        self.assertEqual(
            environment["LSAA_EVALUATION_BRIDGE_ORIGIN"],
            f"http://127.0.0.1:{UI_PORT}",
        )
        self.assertNotIn("VITE_LSAA_EVALUATION_BRIDGE_URL", environment)
        self.assertNotIn("VITE_LSAA_EVALUATION_TOKEN", environment)


if __name__ == "__main__":
    unittest.main()
