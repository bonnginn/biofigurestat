from __future__ import annotations

import unittest

from lsaa_engine.d01_d02 import run_request


OPTIONS = {"alternative": "two_sided", "confidenceLevel": 0.95, "multiplicityMethod": None}


class CommonCoverageTests(unittest.TestCase):
    def test_fisher_and_ratios_match_scipy_reference(self) -> None:
        request = {"protocolVersion": "0.11.0", "requestId": "r14", "projectId": "p", "analysisId": "a", "templateId": "D14", "templateVersion": "0.1.0", "method": "fisher_exact", "structure": "independent", "experimentalUnit": "animal", "rowCategoryIds": ["control", "treated"], "columnCategoryIds": ["event", "no"], "cells": [{"rowCategoryId": row, "columnCategoryId": column, "count": count} for row, values in (("control", (1, 9)), ("treated", (6, 4))) for column, count in zip(("event", "no"), values, strict=True)], "options": OPTIONS}
        result = run_request(request)
        self.assertAlmostEqual(result["tests"][0]["statistic"], 0.074074074074, places=10)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.05727554180, places=10)
        self.assertEqual(result["estimates"][0]["name"], "odds_ratio")

    def test_mcnemar_uses_only_discordant_pairs(self) -> None:
        cells = [[12, 1], [7, 20]]
        request = {"protocolVersion": "0.11.0", "requestId": "mcnemar", "projectId": "p", "analysisId": "a", "templateId": "D14", "templateVersion": "0.1.0", "method": "mcnemar_exact", "structure": "paired_binary", "experimentalUnit": "matched animal", "rowCategoryIds": ["before-positive", "before-negative"], "columnCategoryIds": ["after-positive", "after-negative"], "cells": [{"rowCategoryId": row, "columnCategoryId": column, "count": cells[i][j]} for i, row in enumerate(("before-positive", "before-negative")) for j, column in enumerate(("after-positive", "after-negative"))], "options": OPTIONS}
        result = run_request(request)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.0703125)
        self.assertEqual(result["estimates"], [])

    def test_friedman_and_holm_wilcoxon_preserve_pairs(self) -> None:
        matrix = [[8, 7, 6], [9, 7, 5], [6, 5, 4], [10, 8, 7], [7, 6, 3], [11, 9, 8]]
        request = {"protocolVersion": "0.12.0", "requestId": "r15", "projectId": "p", "analysisId": "a", "templateId": "D15", "templateVersion": "0.1.0", "method": "friedman", "conditionIds": ["a", "b", "c"], "observations": [{"observationId": f"o.{i}.{j}", "conditionId": condition, "experimentalUnitId": f"u.{i}", "pairId": f"u.{i}", "value": matrix[i][j]} for i in range(6) for j, condition in enumerate(("a", "b", "c"))], "options": {**OPTIONS, "multiplicityMethod": "holm_wilcoxon_all_pairs"}}
        result = run_request(request)
        self.assertAlmostEqual(result["tests"][0]["statistic"], 12.0)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.002478752176)
        self.assertEqual(len(result["tests"]), 4)
        self.assertTrue(all(test["adjustedPValue"] is not None for test in result["tests"][1:]))

    def test_simple_regression_matches_closed_form_reference(self) -> None:
        points = [(1, 2.1), (2, 4.2), (3, 5.8), (4, 8.3), (5, 9.9)]
        request = {"protocolVersion": "0.13.0", "requestId": "r16", "projectId": "p", "analysisId": "a", "templateId": "D16", "templateVersion": "0.1.0", "method": "simple_linear_regression", "xLabel": "Dose", "yLabel": "Response", "xUnit": "nM", "yUnit": "%", "includeIntercept": True, "points": [{"observationId": f"o.{i}", "experimentalUnitId": f"u.{i}", "x": x, "y": y} for i, (x, y) in enumerate(points)], "options": OPTIONS}
        result = run_request(request)
        self.assertAlmostEqual(result["regression"]["slope"], 1.97, places=12)
        self.assertAlmostEqual(result["regression"]["intercept"], 0.15, places=12)
        self.assertAlmostEqual(result["regression"]["rSquared"], 0.995817510007, places=11)
        self.assertAlmostEqual(result["tests"][0]["pValue"], 0.0001149441943, places=10)

    def test_regression_zero_intercept_is_explicit(self) -> None:
        request = {"protocolVersion": "0.13.0", "requestId": "r16zero", "projectId": "p", "analysisId": "a", "templateId": "D16", "templateVersion": "0.1.0", "method": "simple_linear_regression", "xLabel": "X", "yLabel": "Y", "xUnit": "", "yUnit": "", "includeIntercept": False, "points": [{"observationId": f"o.{i}", "experimentalUnitId": f"u.{i}", "x": float(i), "y": 2.0 * i + (0.1 if i % 2 else -0.1)} for i in range(1, 6)], "options": OPTIONS}
        self.assertEqual(run_request(request)["regression"]["intercept"], 0.0)


if __name__ == "__main__":
    unittest.main()
