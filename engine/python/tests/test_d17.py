from __future__ import annotations

import unittest

from lsaa_engine.d01_d02 import run_request


def request(points, *, model="zero_baseline_association", initial=None, bounds=None):
    return {
        "protocolVersion": "0.14.0",
        "requestId": "request.d17",
        "projectId": "project.d17",
        "analysisId": "analysis.d17",
        "templateId": "D17",
        "templateVersion": "0.1.0",
        "method": "nonlinear_xy_fit",
        "modelId": model,
        "modelSelectionRationale": "A monotone saturating time-course is the simplest justified kinetic model.",
        "xLabel": "Time",
        "yLabel": "Product",
        "xUnit": "min",
        "yUnit": "mol/mol",
        "seriesIds": sorted({point["seriesId"] for point in points}),
        "points": points,
        "initialValues": initial or {},
        "bounds": bounds or {},
        "observations": [],
        "options": {"alternative": "two_sided", "confidenceLevel": 0.95, "multiplicityMethod": None},
    }


def series(series_id="K5", noisy=False):
    values = [0.0, 0.55, 0.95, 1.30, 1.52]
    xs = [0.0, 15.0, 30.0, 60.0, 120.0]
    points = []
    for replicate in range(3 if noisy else 1):
        for index, (x, y) in enumerate(zip(xs, values, strict=True)):
            offset = (replicate - 1) * 0.025 if noisy else 0.0
            points.append({"observationId": f"{series_id}.{replicate}.{index}", "experimentalUnitId": f"u.{replicate}", "seriesId": series_id, "x": x, "y": y + offset})
    return points


class D17Tests(unittest.TestCase):
    def test_clean_and_noisy_saturating_association(self):
        for points in (series(), series(noisy=True)):
            result = run_request(request(points))
            self.assertTrue(result["nonlinearFit"]["series"][0]["converged"])
            self.assertGreater(result["nonlinearFit"]["series"][0]["diagnostics"]["rSquared"], 0.95)
            self.assertEqual(len(result["nonlinearFit"]["series"][0]["fittedCurve"]), 120)

    def test_flat_insufficient_and_non_identifiable_are_rejected(self):
        flat = [{**point, "y": 1.0} for point in series()]
        with self.assertRaisesRegex(ValueError, "flat"):
            run_request(request(flat))
        with self.assertRaisesRegex(ValueError, "distinct X"):
            run_request(request(series()[:2]))
        duplicate_x = [{**point, "x": float(index % 2)} for index, point in enumerate(series())]
        with self.assertRaisesRegex(ValueError, "distinct X"):
            run_request(request(duplicate_x))

    def test_bounds_and_two_series_are_persisted(self):
        points = series("K5", noisy=True) + [{**point, "y": point["y"] * 0.7} for point in series("K14", noisy=True)]
        bounds = {series_id: {"plateau": {"lower": 0.5, "upper": 3.0}, "rate": {"lower": 0.0001, "upper": 1.0}} for series_id in ("K5", "K14")}
        initial = {series_id: {"plateau": 1.5, "rate": 0.03} for series_id in ("K5", "K14")}
        result = run_request(request(points, initial=initial, bounds=bounds))
        self.assertEqual([fit["seriesId"] for fit in result["nonlinearFit"]["series"]], ["K14", "K5"])
        self.assertEqual(result["nonlinearFit"]["series"][0]["bounds"]["rate"], {"lower": 0.0001, "upper": 1.0})


if __name__ == "__main__":
    unittest.main()
