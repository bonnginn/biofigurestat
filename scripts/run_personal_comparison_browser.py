#!/usr/bin/env python3
"""Serve the personal Figure comparison UI and persist reviewer input locally."""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]
REVIEW_PATH = ROOT / "benchmark/personal_figure_v1/review/review_data.json"
ROUND_2_REVIEW_PATH = ROOT / "benchmark/personal_figure_v1/review/review_round_2.json"
ROUND_3_REVIEW_PATH = ROOT / "benchmark/personal_figure_v1/review/review_round_3.json"
UI_PATH = "/benchmark/personal_figure_v1/comparison_browser/index.html"


class ReviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def review_path(self) -> Path:
        query = parse_qs(urlparse(self.path).query)
        round_number = query.get("round")
        if round_number == ["1"]:
            return REVIEW_PATH
        if round_number == ["3"]:
            return ROUND_3_REVIEW_PATH
        return ROUND_2_REVIEW_PATH

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", UI_PATH)
            self.end_headers()
            return
        if parsed.path == "/api/personal-review":
            payload = self.review_path().read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_PUT(self) -> None:  # noqa: N802
        if urlparse(self.path).path != "/api/personal-review":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 1_000_000:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid review payload length")
            return
        try:
            data = json.loads(self.rfile.read(length))
            if data.get("schemaVersion") != "1.0.0" or not isinstance(data.get("reviews"), dict):
                raise ValueError("Invalid review schema")
        except (json.JSONDecodeError, ValueError) as error:
            self.send_error(HTTPStatus.BAD_REQUEST, str(error))
            return
        review_path = self.review_path()
        review_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=review_path.parent, delete=False, suffix=".tmp"
        ) as temporary:
            json.dump(data, temporary, ensure_ascii=False, indent=2)
            temporary.write("\n")
            temporary_path = Path(temporary.name)
        temporary_path.replace(review_path)
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1", choices=["127.0.0.1", "localhost"])
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), ReviewHandler)
    print(f"Personal Figure comparison: http://{args.host}:{args.port}{UI_PATH}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
