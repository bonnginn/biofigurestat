from __future__ import annotations

import unittest

from lsaa_engine.d01_d02 import run_request


def request(points, *, model="zero_baseline_association", initial=None, bounds=None):
    michaelis_menten = model == "michaelis_menten"
    return {
        "protocolVersion": "0.14.0",
        "requestId": "request.d17",
        "projectId": "project.d17",
        "analysisId": "analysis.d17",
        "templateId": "D17",
        "templateVersion": "0.2.0" if michaelis_menten else "0.1.0",
        "method": "nonlinear_xy_fit",
        "modelId": model,
        "modelSelectionRationale": (
            "X is substrate concentration and Y is precomputed initial velocity."
            if michaelis_menten
            else "A monotone saturating time-course is the simplest justified kinetic model."
        ),
        "xLabel": "Substrate concentration" if michaelis_menten else "Time",
        "yLabel": "Initial velocity" if michaelis_menten else "Product",
        "xUnit": "mM" if michaelis_menten else "min",
        "yUnit": "µmol/min" if michaelis_menten else "mol/mol",
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


def puromycin_points():
    # R datasets::Puromycin, used by the official R nls Michaelis-Menten example.
    values = {
        "treated": [
            (0.02, 76),
            (0.02, 47),
            (0.06, 97),
            (0.06, 107),
            (0.11, 123),
            (0.11, 139),
            (0.22, 159),
            (0.22, 152),
            (0.56, 191),
            (0.56, 201),
            (1.10, 207),
            (1.10, 200),
        ],
        "untreated": [
            (0.02, 67),
            (0.02, 51),
            (0.06, 84),
            (0.06, 86),
            (0.11, 98),
            (0.11, 115),
            (0.22, 131),
            (0.22, 124),
            (0.56, 144),
            (0.56, 158),
            (1.10, 160),
        ],
    }
    return [
        {
            "observationId": f"{state}.{index}",
            "experimentalUnitId": f"reaction.{state}.{index}",
            "seriesId": state,
            "x": concentration,
            "y": rate,
        }
        for state, rows in values.items()
        for index, (concentration, rate) in enumerate(rows, start=1)
    ]


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

    def test_michaelis_menten_matches_r_puromycin_nls_reference(self):
        result = run_request(request(puromycin_points(), model="michaelis_menten"))
        self.assertEqual(result["nonlinearFit"]["modelFormula"], "vmax * x / (km + x)")
        expected = {
            "treated": {"vmax": 212.68358, "km": 0.06412103},
            "untreated": {"vmax": 160.28013, "km": 0.04770831},
        }
        for fit in result["nonlinearFit"]["series"]:
            parameters = {
                parameter["name"].rsplit(".", 1)[-1]: parameter["value"]
                for parameter in fit["parameters"]
            }
            self.assertAlmostEqual(
                parameters["vmax"], expected[fit["seriesId"]]["vmax"], delta=0.001
            )
            self.assertAlmostEqual(
                parameters["km"], expected[fit["seriesId"]]["km"], delta=0.000001
            )
            self.assertTrue(fit["converged"])
            self.assertGreater(fit["diagnostics"]["rSquared"], 0.9)

    def test_michaelis_menten_rejects_non_identifying_or_invalid_inputs(self):
        points = puromycin_points()[:12]
        invalid_version = request(points, model="michaelis_menten")
        invalid_version["templateVersion"] = "0.1.0"
        with self.assertRaisesRegex(ValueError, "template version 0.2.0"):
            run_request(invalid_version)

        insufficient_positive_x = [
            {**point, "x": [0.0, 0.02, 0.06][index % 3]}
            for index, point in enumerate(points)
        ]
        with self.assertRaisesRegex(ValueError, "3 distinct positive substrate concentrations"):
            run_request(request(insufficient_positive_x, model="michaelis_menten"))

        non_positive_velocity = [{**point, "y": -abs(point["y"])} for point in points]
        with self.assertRaisesRegex(ValueError, "at least one positive initial velocity"):
            run_request(request(non_positive_velocity, model="michaelis_menten"))

        with self.assertRaisesRegex(ValueError, "initial vmax must be positive"):
            run_request(
                request(
                    points,
                    model="michaelis_menten",
                    initial={"treated": {"vmax": -1, "km": 0.05}},
                )
            )

        with self.assertRaisesRegex(ValueError, "bounds for km must be non-negative"):
            run_request(
                request(
                    points,
                    model="michaelis_menten",
                    bounds={"treated": {"km": {"lower": -1, "upper": 1}}},
                )
            )

    def test_michaelis_menten_warns_when_km_requires_substrate_range_extrapolation(self):
        points = [
            {
                "observationId": f"linear.{index}",
                "experimentalUnitId": f"reaction.{index}",
                "seriesId": "enzyme",
                "x": concentration,
                "y": velocity,
            }
            for index, (concentration, velocity) in enumerate(
                [(0.1, 1.01), (0.2, 1.98), (0.3, 3.02), (0.4, 3.95), (0.5, 5.02)],
                start=1,
            )
        ]
        result = run_request(request(points, model="michaelis_menten"))
        self.assertEqual(
            [warning["code"] for warning in result["warnings"]],
            ["michaelis_menten_substrate_range_below_km"],
        )


if __name__ == "__main__":
    unittest.main()
