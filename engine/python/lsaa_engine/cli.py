from __future__ import annotations

import json
import sys
import traceback
from datetime import datetime, timezone
from typing import Any

import numpy as np
import scipy

from . import ENGINE_VERSION
from .d01_d02 import run_request


def _error_result(
    request: dict[str, Any], message: str, code: str = "invalid_request"
) -> dict[str, Any]:
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
        "diagnostics": [{"code": code, "message": message}],
        "warnings": [],
        "completedAt": datetime.now(timezone.utc).isoformat(),
    }


def _internal_error_result(request: dict[str, Any]) -> dict[str, Any]:
    return _error_result(
        request,
        "The local statistical engine could not produce a valid result.",
        "internal_engine_error",
    )


def main() -> int:
    request: dict[str, Any] = {}
    try:
        request = json.load(sys.stdin)
        result = run_request(request)
        result["completedAt"] = datetime.now(timezone.utc).isoformat()
    except (KeyError, TypeError, ValueError) as exc:
        result = _error_result(request, str(exc))
    except Exception:
        traceback.print_exc(file=sys.stderr)
        result = _internal_error_result(request)

    try:
        payload = json.dumps(result, separators=(",", ":"), allow_nan=False)
    except Exception:
        traceback.print_exc(file=sys.stderr)
        payload = json.dumps(
            _internal_error_result(request), separators=(",", ":"), allow_nan=False
        )
    sys.stdout.write(f"{payload}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
