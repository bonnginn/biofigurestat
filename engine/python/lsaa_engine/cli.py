from __future__ import annotations

import json
import sys
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


def main() -> int:
    request: dict[str, Any] = {}
    try:
        request = json.load(sys.stdin)
        result = run_request(request)
        result["completedAt"] = datetime.now(timezone.utc).isoformat()
    except (KeyError, TypeError, ValueError) as exc:
        result = _error_result(request, str(exc))
    json.dump(result, sys.stdout, separators=(",", ":"), allow_nan=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
