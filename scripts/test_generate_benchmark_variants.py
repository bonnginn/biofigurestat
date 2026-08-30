from __future__ import annotations

import copy
import unittest

from generate_benchmark_variants import generate_variant


ANCHOR = {
    "caseId": "ANCHOR001", "designKind": "independent", "conditionLabels": {"A": "Control", "B": "Treatment"},
    "rows": [
        {"rowId": f"{condition}.{unit}", "biologicalUnitId": f"{condition}.{unit}", "conditionId": condition, "value": value, "missingState": "observed"}
        for condition, values in {"A": [1.0, 2.0, 4.0, 5.0], "B": [3.0, 5.0, 6.0, 9.0]}.items()
        for unit, value in enumerate(values, 1)
    ],
}


class VariantGeneratorTests(unittest.TestCase):
    def test_is_deterministic_preserves_anchor_and_biological_n(self) -> None:
        original = copy.deepcopy(ANCHOR)
        spec = {"variantId": "v1", "changes": [{"kind": "sample_size", "nByCondition": {"A": 3, "B": 2}}, {"kind": "variance_scale", "factor": 1.5}, {"kind": "effect_scale", "conditionId": "B", "factor": 0.5}]}
        first = generate_variant(ANCHOR, spec, 42)
        second = generate_variant(ANCHOR, spec, 42)
        self.assertEqual(first, second)
        self.assertEqual(ANCHOR, original)
        n_check = next(check for check in first["variantProvenance"]["invariantChecks"] if check["name"] == "biological_n")
        self.assertEqual(n_check["nByCondition"], {"A": 3, "B": 2})

    def test_missing_is_not_zero_or_not_planned(self) -> None:
        result = generate_variant(ANCHOR, {"variantId": "missing", "changes": [{"kind": "missingness", "rowIds": ["A.1"]}]}, 1)
        row = next(row for row in result["rows"] if row["rowId"] == "A.1")
        self.assertIsNone(row["value"])
        self.assertEqual(row["missingState"], "missing")

    def test_paired_downsampling_keeps_complete_pairs(self) -> None:
        paired = copy.deepcopy(ANCHOR)
        paired["designKind"] = "paired"
        for row in paired["rows"]:
            row["pairId"] = row["biologicalUnitId"].split(".")[1]
        result = generate_variant(paired, {"variantId": "paired", "changes": [{"kind": "sample_size", "nByCondition": {"A": 2, "B": 2}}]}, 9)
        pairs = {}
        for row in result["rows"]:
            pairs.setdefault(row["pairId"], set()).add(row["conditionId"])
        self.assertTrue(all(conditions == {"A", "B"} for conditions in pairs.values()))

    def test_rejects_accidental_zero_variance(self) -> None:
        with self.assertRaisesRegex(ValueError, "zero within-condition variance"):
            generate_variant(ANCHOR, {"variantId": "bad", "changes": [{"kind": "variance_scale", "factor": 0}]}, 1)


if __name__ == "__main__":
    unittest.main()
