"""Fail when a production web bundle contains benchmark-only or secret material."""

from __future__ import annotations

import argparse
from pathlib import Path


FORBIDDEN_MARKERS = (
    "researcherPacket",
    "paperReference",
    "Paper Reference",
    "Gold Metadata",
    "curated_graph_reference",
    "trycloudflare.com",
    "Blind benchmark batch",
    "Literature Benchmark合成値",
)


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
        for marker in FORBIDDEN_MARKERS:
            if marker in text:
                failures.append(f"forbidden marker {marker!r}: {path.relative_to(bundle)}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", nargs="?", type=Path, default=Path("apps/ui/dist"))
    args = parser.parse_args()
    failures = verify_bundle(args.bundle)
    if failures:
        print("Release bundle verification FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Release bundle verification PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
