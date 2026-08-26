import tempfile
import unittest
from pathlib import Path

from verify_release_bundle import verify_bundle


class ReleaseBundleVerifierTests(unittest.TestCase):
    def test_accepts_minimal_clean_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)
            (bundle / "index.html").write_text("<main>Alpha</main>", encoding="utf-8")
            self.assertEqual(verify_bundle(bundle), [])

    def test_rejects_sensitive_marker_and_source_map(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)
            (bundle / "index.html").write_text("<main>Alpha</main>", encoding="utf-8")
            (bundle / "app.js").write_text("const key = 'researcherPacket'", encoding="utf-8")
            (bundle / "app.js.map").write_text("{}", encoding="utf-8")
            failures = verify_bundle(bundle)
            self.assertTrue(any("researcherPacket" in failure for failure in failures))
            self.assertTrue(any("source map" in failure for failure in failures))

    def test_rejects_development_instrumentation_case_insensitively(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)
            (bundle / "index.html").write_text("<main>Alpha</main>", encoding="utf-8")
            (bundle / "app.js").write_text("const label = 'Benchmark Run'", encoding="utf-8")
            failures = verify_bundle(bundle)
            self.assertTrue(any("benchmark" in failure for failure in failures))


if __name__ == "__main__":
    unittest.main()
