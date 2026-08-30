"""Shared result-envelope helpers for versioned analysis modules."""

from __future__ import annotations

from typing import Any

import numpy as np
import scipy

from . import ENGINE_VERSION


def estimate(
    name: str,
    value: float,
    standard_error: float | None,
    confidence_interval: dict[str, float] | None,
) -> dict[str, Any]:
    return {
        "name": name,
        "value": value,
        "standardError": standard_error,
        "confidenceInterval": confidence_interval,
    }


def base_result(request: dict[str, Any]) -> dict[str, Any]:
    return {
        "protocolVersion": request["protocolVersion"],
        "requestId": request["requestId"],
        "status": "ok",
        "engine": {
            "name": "lsaa-python",
            "version": ENGINE_VERSION,
            "packages": {
                "numpy": np.__version__,
                "scipy": scipy.__version__,
            },
        },
        "estimates": [],
        "tests": [],
        "diagnostics": [],
        "warnings": [],
    }
