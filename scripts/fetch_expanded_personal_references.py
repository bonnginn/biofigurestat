#!/usr/bin/env python3
"""Fetch only open-access primary Figure assets for expanded personal review.

GFLB and KER5 remain transparent primary-article placeholders when a reusable
local primary Figure asset is unavailable. No CAPTCHA or access control is bypassed.
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
import shutil
import urllib.request
import zipfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "benchmark/personal_figure_v1/references/expanded_round_6"
PACKAGES = {
    "PMC4754717": {
        "JCB_201507046_Fig5.jpg": ["PFR009", "PFR011"],
        "JCB_201507046_Fig9.jpg": ["PFR020"],
    },
    "PMC7949103": {
        "gr2.jpg": ["PFR027A", "PFR027B"],
        "gr3.jpg": ["PFR033"],
        "gr5.jpg": ["PFR043"],
        "gr6.jpg": ["PFR045"],
    },
}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for pmcid, requested in PACKAGES.items():
        url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/supplementaryFiles"
        request = urllib.request.Request(url, headers={"User-Agent": "LifeScienceAnalysisApp/0.1"})
        with urllib.request.urlopen(request, timeout=60) as response:
            archive = zipfile.ZipFile(BytesIO(response.read()))
        by_basename = {Path(name).name: name for name in archive.namelist()}
        for basename, case_ids in requested.items():
            member = by_basename.get(basename)
            if not member:
                raise RuntimeError(f"{pmcid} package did not contain {basename}")
            extracted = OUTPUT / f"_{basename}"
            with archive.open(member) as source, extracted.open("wb") as target:
                shutil.copyfileobj(source, target)
            with Image.open(extracted) as figure:
                for case_id in case_ids:
                    figure.convert("RGB").save(OUTPUT / f"{case_id}.png")
            extracted.unlink()


if __name__ == "__main__":
    main()
