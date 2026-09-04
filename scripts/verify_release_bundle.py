"""Fail when a production web bundle contains benchmark-only or secret material."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re


FORBIDDEN_MARKERS = (
    "benchmark",
    "researcherPacket",
    "paperReference",
    "Paper Reference",
    "Gold Metadata",
    "curated_graph_reference",
    "trycloudflare.com",
    "Blind benchmark batch",
    "Literature Benchmark合成値",
    "/api/evaluation",
    "/literature/case",
    "/blind-batch/",
    "personal benchmark synthetic reconstruction",
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def _read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _typescript_string(source: str, field: str) -> str | None:
    match = re.search(rf"\b{re.escape(field)}\s*:\s*[\"']([^\"']+)[\"']", source)
    return match.group(1) if match else None


def verify_source_identity(source_root: Path) -> list[str]:
    """Keep user-visible release identity aligned with packaged source declarations."""

    failures: list[str] = []
    try:
        root_package = _read_json(source_root / "package.json")
        ui_package = _read_json(source_root / "apps/ui/package.json")
        desktop_package = _read_json(source_root / "apps/desktop/package.json")
        tauri_config = _read_json(source_root / "apps/desktop/src-tauri/tauri.conf.json")
        product_identity = (source_root / "apps/ui/src/app/productIdentity.ts").read_text(
            encoding="utf-8"
        )
        engine_init = (source_root / "engine/python/lsaa_engine/__init__.py").read_text(
            encoding="utf-8"
        )
    except (OSError, json.JSONDecodeError) as error:
        return [f"release identity source could not be read: {error}"]

    product_version = _typescript_string(product_identity, "version")
    declared_versions = {
        "root package": root_package.get("version"),
        "UI package": ui_package.get("version"),
        "desktop package": desktop_package.get("version"),
        "Tauri config": tauri_config.get("version"),
        "About product identity": product_version,
    }
    expected_version = root_package.get("version")
    for label, value in declared_versions.items():
        if value != expected_version:
            failures.append(
                f"application version mismatch: {label} declares {value!r}, expected {expected_version!r}"
            )

    product_name = _typescript_string(product_identity, "developmentName")
    if tauri_config.get("productName") != product_name:
        failures.append(
            "product name mismatch: Tauri config declares "
            f"{tauri_config.get('productName')!r}, About product identity declares {product_name!r}"
        )

    engine_match = re.search(r'^ENGINE_VERSION\s*=\s*[\"\']([^\"\']+)[\"\']', engine_init, re.MULTILINE)
    engine_version = engine_match.group(1) if engine_match else None
    expected_engine = _typescript_string(product_identity, "expectedEngineVersion")
    if expected_engine != engine_version:
        failures.append(
            "engine version mismatch: About product identity declares "
            f"{expected_engine!r}, engine declares {engine_version!r}"
        )

    license_status = _typescript_string(product_identity, "licenseStatus")
    package_licenses = {
        root_package.get("license"),
        ui_package.get("license"),
        desktop_package.get("license"),
    }
    if package_licenses != {"MIT"} or license_status != "MIT License":
        failures.append(
            "license mismatch: packages must declare 'MIT' and About must declare 'MIT License'"
        )

    if "import.meta.env.VITE_LSAA_BUILD_REVISION" not in product_identity:
        failures.append(
            "About build revision must use import.meta.env.VITE_LSAA_BUILD_REVISION"
        )
    return failures


def verify_bundle(bundle: Path) -> list[str]:
    failures: list[str] = []
    if not (bundle / "index.html").is_file():
        failures.append("index.html is missing")
    for path in sorted(bundle.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix == ".map":
            failures.append(f"source map must not ship: {path.relative_to(bundle)}")
            continue
        if path.suffix.lower() not in {".html", ".js", ".css", ".json", ".txt"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        normalized = text.lower()
        for marker in FORBIDDEN_MARKERS:
            if marker.lower() in normalized:
                failures.append(f"forbidden marker {marker!r}: {path.relative_to(bundle)}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", nargs="?", type=Path, default=Path("apps/ui/dist"))
    args = parser.parse_args()
    failures = verify_source_identity(REPOSITORY_ROOT)
    failures.extend(verify_bundle(args.bundle))
    if failures:
        print("Release bundle verification FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Release bundle verification PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
