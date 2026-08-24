from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy import stats

from .result_common import base_result, estimate


def run_one_sample(request: dict[str, Any]) -> dict[str, Any]:
    condition_id = request["conditionId"]
    null_value = float(request["nullValue"])
    if not np.isfinite(null_value):
        raise ValueError("One-sample reference value must be finite and explicit")
    seen_units: set[str] = set()
    values: list[float] = []
    for observation in request["observations"]:
        if observation["conditionId"] != condition_id:
            raise ValueError("One-sample observation references another condition")
        unit_id = observation["experimentalUnitId"]
        if unit_id in seen_units:
            raise ValueError("Each one-sample biological unit can contribute only one value")
        seen_units.add(unit_id)
        values.append(float(observation["value"]))
    sample = np.asarray(values, dtype=float)
    if len(sample) < 2 or not np.all(np.isfinite(sample)):
        raise ValueError("One-sample t-test requires at least two finite biological-unit values")
    sd = float(np.std(sample, ddof=1))
    if sd == 0:
        raise ValueError("One-sample t-test is undefined when all values are identical")
    difference = float(np.mean(sample) - null_value)
    standard_error = sd / math.sqrt(len(sample))
    degrees_of_freedom = len(sample) - 1
    confidence_level = float(request["options"]["confidenceLevel"])
    critical = float(stats.t.ppf(1.0 - (1.0 - confidence_level) / 2.0, degrees_of_freedom))
    test = stats.ttest_1samp(
        sample,
        popmean=null_value,
        alternative=request["options"]["alternative"].replace("two_sided", "two-sided"),
    )
    result = base_result(request)
    result["estimates"] = [
        estimate(
            "mean_difference_from_reference",
            difference,
            standard_error,
            {
                "level": confidence_level,
                "lower": difference - critical * standard_error,
                "upper": difference + critical * standard_error,
            },
        )
    ]
    result["tests"] = [
        {
            "name": "one_sample_t_test",
            "statisticName": "t",
            "statistic": float(test.statistic),
            "degreesOfFreedom": [float(degrees_of_freedom)],
            "pValue": float(test.pvalue),
            "adjustedPValue": None,
            "effectSizeName": "cohen_dz",
            "effectSize": difference / sd,
        }
    ]
    result["diagnostics"] = [
        {
            "code": "explicit_one_sample_reference",
            "message": f"The sample mean was compared with the explicit reference value {null_value}.",
        }
    ]
    return result
