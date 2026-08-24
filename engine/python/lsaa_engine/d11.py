from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np
from scipy import stats

from .result_common import base_result


def _validate(request: dict[str, Any]) -> tuple[list[str], dict[str, list[dict[str, Any]]]]:
    condition_ids = list(request["conditionIds"])
    if len(condition_ids) < 2 or len(set(condition_ids)) != len(condition_ids):
        raise ValueError("Log-rank analysis requires at least two unique groups")
    grouped: dict[str, list[dict[str, Any]]] = {condition_id: [] for condition_id in condition_ids}
    seen_units: set[str] = set()
    for observation in request["observations"]:
        condition_id = observation["conditionId"]
        if condition_id not in grouped:
            raise ValueError("Survival observation references an undeclared group")
        unit_id = observation["experimentalUnitId"]
        if unit_id in seen_units:
            raise ValueError("Each survival biological unit must occur exactly once")
        seen_units.add(unit_id)
        follow_up = float(observation["followUpTime"])
        if not np.isfinite(follow_up) or follow_up < 0:
            raise ValueError("Follow-up time must be a finite non-negative number")
        if not isinstance(observation["eventObserved"], bool):
            raise ValueError("Event status must be explicitly Event or Censored")
        grouped[condition_id].append(observation)
    if any(not observations for observations in grouped.values()):
        raise ValueError("Every declared survival group requires at least one usable observation")
    if sum(bool(row["eventObserved"]) for rows in grouped.values() for row in rows) == 0:
        raise ValueError("Log-rank analysis requires at least one observed event")
    return condition_ids, grouped


def _kaplan_meier(rows: list[dict[str, Any]]) -> dict[str, Any]:
    times = [float(row["followUpTime"]) for row in rows]
    events = [bool(row["eventObserved"]) for row in rows]
    event_counts = Counter(time for time, event in zip(times, events, strict=True) if event)
    censor_counts = Counter(time for time, event in zip(times, events, strict=True) if not event)
    survival = 1.0
    curve = [{"time": 0.0, "survival": 1.0, "atRisk": len(rows), "events": 0, "censored": 0}]
    for time in sorted(set(times)):
        at_risk = sum(value >= time for value in times)
        deaths = event_counts[time]
        censored = censor_counts[time]
        if deaths:
            survival *= 1.0 - deaths / at_risk
        curve.append(
            {
                "time": time,
                "survival": float(survival),
                "atRisk": at_risk,
                "events": deaths,
                "censored": censored,
            }
        )
    return {
        "n": len(rows),
        "events": sum(events),
        "censored": len(rows) - sum(events),
        "curve": curve,
        "censorTimes": sorted(time for time, event in zip(times, events, strict=True) if not event),
    }


def run_survival(request: dict[str, Any]) -> dict[str, Any]:
    condition_ids, grouped = _validate(request)
    event_times = sorted(
        {
            float(row["followUpTime"])
            for rows in grouped.values()
            for row in rows
            if row["eventObserved"]
        }
    )
    observed = np.zeros(len(condition_ids) - 1)
    expected = np.zeros(len(condition_ids) - 1)
    covariance = np.zeros((len(condition_ids) - 1, len(condition_ids) - 1))
    for time in event_times:
        at_risk = np.asarray(
            [sum(float(row["followUpTime"]) >= time for row in grouped[group]) for group in condition_ids],
            dtype=float,
        )
        deaths = np.asarray(
            [
                sum(
                    float(row["followUpTime"]) == time and bool(row["eventObserved"])
                    for row in grouped[group]
                )
                for group in condition_ids
            ],
            dtype=float,
        )
        total_risk = float(np.sum(at_risk))
        total_deaths = float(np.sum(deaths))
        observed += deaths[:-1]
        expected += total_deaths * at_risk[:-1] / total_risk
        if total_risk <= 1:
            continue
        scale = total_deaths * (total_risk - total_deaths) / (total_risk**2 * (total_risk - 1))
        for first in range(len(condition_ids) - 1):
            for second in range(len(condition_ids) - 1):
                covariance[first, second] += scale * (
                    at_risk[first] * (total_risk - at_risk[first])
                    if first == second
                    else -at_risk[first] * at_risk[second]
                )
    difference = observed - expected
    statistic = float(difference @ np.linalg.pinv(covariance) @ difference)
    degrees_of_freedom = len(condition_ids) - 1
    result = base_result(request)
    result["tests"] = [
        {
            "name": "log_rank_test",
            "statisticName": "chi_square",
            "statistic": statistic,
            "degreesOfFreedom": [float(degrees_of_freedom)],
            "pValue": float(stats.chi2.sf(statistic, degrees_of_freedom)),
            "adjustedPValue": None,
            "effectSizeName": None,
            "effectSize": None,
        }
    ]
    result["survival"] = {
        "groups": [
            {"conditionId": condition_id, **_kaplan_meier(grouped[condition_id])}
            for condition_id in condition_ids
        ]
    }
    result["diagnostics"] = [
        {
            "code": "survival_censoring_preserved",
            "message": "Censored units contributed to risk sets and were not treated as missing observations.",
        }
    ]
    return result
