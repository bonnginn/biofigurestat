import tempfile
import unittest
from pathlib import Path

from verify_release_bundle import verify_bundle, verify_source_identity


class ReleaseBundleVerifierTests(unittest.TestCase):
    def write_identity_fixture(
        self,
        root: Path,
        *,
        engine_version: str = "0.15.0",
        about_engine_version: str = "0.15.0",
        revision_variable: str = "VITE_LSAA_BUILD_REVISION",
    ) -> None:
        package = '{"version":"0.1.0","license":"MIT"}'
        (root / "package.json").write_text(package, encoding="utf-8")
        (root / "apps/ui/src/app").mkdir(parents=True)
        (root / "apps/desktop/src-tauri").mkdir(parents=True)
        (root / "engine/python/lsaa_engine").mkdir(parents=True)
        (root / "apps/ui/package.json").write_text(package, encoding="utf-8")
        (root / "apps/desktop/package.json").write_text(package, encoding="utf-8")
        (root / "apps/desktop/src-tauri/tauri.conf.json").write_text(
            '{"productName":"BioFigureStat","version":"0.1.0"}', encoding="utf-8"
        )
        (root / "apps/ui/src/app/productIdentity.ts").write_text(
            "export const PRODUCT_IDENTITY = {\n"
            '  developmentName: "BioFigureStat",\n'
            '  version: "0.1.0",\n'
            f'  expectedEngineVersion: "{about_engine_version}",\n'
            '  licenseStatus: "MIT License",\n'
            f"  buildRevision: import.meta.env.{revision_variable},\n"
            "};\n",
            encoding="utf-8",
        )
        (root / "engine/python/lsaa_engine/__init__.py").write_text(
            f'ENGINE_VERSION = "{engine_version}"\n', encoding="utf-8"
        )

    def test_accepts_aligned_release_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_identity_fixture(root)
            self.assertEqual(verify_source_identity(root), [])

    def test_rejects_stale_about_engine_and_wrong_revision_variable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_identity_fixture(
                root,
                about_engine_version="0.14.0",
                revision_variable="VITE_BUILD_REVISION",
            )
            failures = verify_source_identity(root)
            self.assertTrue(any("engine version mismatch" in failure for failure in failures))
            self.assertTrue(any("VITE_LSAA_BUILD_REVISION" in failure for failure in failures))

    def test_rejects_application_name_version_and_license_drift(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_identity_fixture(root)
            (root / "apps/ui/package.json").write_text(
                '{"version":"0.2.0","license":"Apache-2.0"}', encoding="utf-8"
            )
            (root / "apps/desktop/src-tauri/tauri.conf.json").write_text(
                '{"productName":"Old Product","version":"0.1.0"}', encoding="utf-8"
            )
            failures = verify_source_identity(root)
            self.assertTrue(any("application version mismatch" in failure for failure in failures))
            self.assertTrue(any("product name mismatch" in failure for failure in failures))
            self.assertTrue(any("license mismatch" in failure for failure in failures))

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
