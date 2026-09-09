"""Prevent package, executable and About identities from silently diverging."""
from pathlib import Path
import re
import tomllib
import unittest

from lsaa_engine import ENGINE_VERSION


class VersionIdentityTests(unittest.TestCase):
    def test_engine_packaging_and_about_match_runtime_version(self):
        engine_root = Path(__file__).resolve().parents[1]
        metadata = tomllib.loads((engine_root / "pyproject.toml").read_text())
        self.assertEqual(metadata["project"]["version"], ENGINE_VERSION)
        identity = (engine_root.parents[1] / "apps/ui/src/app/productIdentity.ts").read_text()
        expected = re.search(r'expectedEngineVersion: "([^"]+)"', identity)
        self.assertIsNotNone(expected)
        self.assertEqual(expected.group(1), ENGINE_VERSION)
