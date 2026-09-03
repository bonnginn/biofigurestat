from __future__ import annotations

import json
import sys
from contextlib import redirect_stdout
from datetime import datetime, timezone
from typing import Any

import numpy as np
import scipy

from . import ENGINE_VERSION
from .d01_d02 import run_request


def _error_result(request: dict[str, Any], message: str) -> dict[str, Any]:
    return {
        "protocolVersion": request.get("protocolVersion", "0.1.0"),
        "requestId": request.get("requestId", "request.unknown"),
        "status": "validation_error",
        "engine": {
            "name": "lsaa-python",
            "version": ENGINE_VERSION,
            "packages": {"numpy": np.__version__, "scipy": scipy.__version__},
        },
        "estimates": [],
        "tests": [],
        "diagnostics": [{"code": "invalid_request", "message": message}],
        "warnings": [],
        "completedAt": datetime.now(timezone.utc).isoformat(),
    }


def _read_request() -> dict[str, Any]:
    # Windows text streams inherit a locale-dependent encoding. The desktop protocol is UTF-8,
    # so read its bytes directly instead of allowing cp932 or another host locale to reinterpret
    # researcher-entered non-ASCII text.
    stream = getattr(sys.stdin, "buffer", sys.stdin)
    return json.load(stream)


def _write_result(result: dict[str, Any]) -> None:
    encoded = json.dumps(
        result,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    stream = getattr(sys.stdout, "buffer", None)
    if stream is not None:
        stream.write(encoded)
        stream.write(b"\n")
        stream.flush()
        return
    sys.stdout.write(encoded.decode("utf-8"))
    sys.stdout.write("\n")


def main() -> int:
    request: dict[str, Any] = {}
    # stdout is the versioned JSON protocol channel. Keep incidental output from numerical
    # libraries and future analysis helpers on stderr so one harmless print cannot corrupt the
    # desktop IPC response. Serialize completely before writing to avoid exposing partial JSON.
    with redirect_stdout(sys.stderr):
        try:
            request = _read_request()
            result = run_request(request)
            result["completedAt"] = datetime.now(timezone.utc).isoformat()
        except (KeyError, TypeError, ValueError) as exc:
            result = _error_result(request, str(exc))
    _write_result(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
