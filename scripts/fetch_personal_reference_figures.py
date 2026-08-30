#!/usr/bin/env python3
"""Fetch selected open-access reference Figures from the Europe PMC API."""

from __future__ import annotations

import json
import io
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "benchmark/personal_figure_v1/references"
XLINK = "{http://www.w3.org/1999/xlink}href"
SOURCES = {
    "NDEL1": {"pmcid": "PMC4754717", "figures": {"1", "2"}},
    "OPTO": {"pmcid": "PMC7949103", "figures": {"1", "7"}},
    "CRYO": {"pmcid": "PMC12136925", "figures": {"1"}},
}
PUBLISHER_ASSETS = {
    "GFLB": {
        "figure": "1",
        "articleUrl": "https://doi.org/10.1242/jcs.194126",
        "localPath": "GFLB_Figure_1.jpeg",
        "doi": "10.1242/jcs.194126",
    }
}


def fetch(url: str, *, referer: str | None = None) -> bytes:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36"
        )
    }
    if referer:
        headers["Referer"] = referer
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def normalized_figure_number(label: str) -> str | None:
    match = re.search(r"(?:figure|fig\.?)\s*(\d+)", label, flags=re.IGNORECASE)
    return match.group(1) if match else None


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, object]] = []
    for paper_code, source in SOURCES.items():
        pmcid = str(source["pmcid"])
        xml_url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
        root = ET.fromstring(fetch(xml_url))
        package_url = (
            f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/supplementaryFiles"
        )
        package = zipfile.ZipFile(io.BytesIO(fetch(package_url)))
        found: set[str] = set()
        for figure in root.findall(".//fig"):
            label = "".join(figure.findtext("label", default=""))
            figure_number = normalized_figure_number(label)
            if figure_number not in source["figures"]:
                continue
            graphic = figure.find(".//graphic")
            href = graphic.get(XLINK) if graphic is not None else None
            if not href:
                raise RuntimeError(f"{paper_code} Figure {figure_number}: graphic href missing")
            suffix = Path(href).suffix or ".jpg"
            output = OUTPUT / f"{paper_code}_Figure_{figure_number}{suffix}"
            member = next(
                (candidate for candidate in package.namelist() if Path(candidate).name == href),
                None,
            )
            if member is None:
                raise RuntimeError(f"{paper_code} Figure {figure_number}: {href} missing in OA package")
            output.write_bytes(package.read(member))
            found.add(figure_number)
            manifest.append(
                {
                    "paperCode": paper_code,
                    "figure": f"Figure {figure_number}",
                    "pmcid": pmcid,
                    "sourceUrl": xml_url,
                    "packageUrl": package_url,
                    "localPath": output.name,
                    "sourceType": "open_access_published_figure",
                }
            )
        missing = set(source["figures"]) - found
        if missing:
            raise RuntimeError(f"{paper_code}: missing Figures {sorted(missing)}")
    for paper_code, source in PUBLISHER_ASSETS.items():
        article_url = str(source["articleUrl"])
        output = OUTPUT / str(source["localPath"])
        if not output.exists():
            raise RuntimeError(
                f"{paper_code}: browser-captured publisher asset missing: {output.name}"
            )
        manifest.append(
            {
                "paperCode": paper_code,
                "figure": f"Figure {source['figure']}",
                "doi": source["doi"],
                "sourceUrl": article_url,
                "localPath": output.name,
                "sourceType": "publisher_published_figure",
            }
        )
    (OUTPUT / "pmc_reference_manifest.json").write_text(
        json.dumps({"assets": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"downloaded": len(manifest), "output": str(OUTPUT)}, indent=2))


if __name__ == "__main__":
    main()
