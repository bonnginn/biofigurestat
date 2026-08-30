from __future__ import annotations

from collections import defaultdict
import hashlib
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "benchmark/personal_figure_v1/runtime_round_6"
RUNS = ROOT / "benchmark/personal_figure_v1/runs_round_6"
CASE_IDS = ["PFR009", "PFR011", "PFR020", "PFR027A", "PFR027B", "PFR033", "PFR043", "PFR045", "PFR054", "PFR059A", "PFR059B", "PFR062"]


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class ExpandedPersonalValidationTest(unittest.TestCase):
    def case(self, case_id: str) -> dict:
        return load(RUNTIME / "cases" / case_id / "case.json")

    def stats(self, case_id: str) -> dict:
        return load(RUNS / case_id / "statistics.json")

    def test_artifact_contract_and_hashes(self) -> None:
        required = ["project_state.json", "default_graph.svg", "default_graph.png", "final_graph.svg", "final_graph.png", "statistics.json", "methods.txt", "graph_state.json", "run.json", "interaction_log.json", "scientific_audit.json", "support_classification.json"]
        for case_id in CASE_IDS:
            root = RUNS / case_id
            for name in required:
                self.assertGreater((root / name).stat().st_size, 0, f"{case_id}/{name}")
            run = load(root / "run.json")
            self.assertEqual(run["artifactCompleteness"], "complete")
            self.assertFalse(run["humanRatingEntered"])
            self.assertEqual(run["finalPngSha256"], hashlib.sha256((root / "final_graph.png").read_bytes()).hexdigest())
            self.assertEqual(load(root / "project_state.json")["caseId"], case_id)
        self.assertEqual(load(ROOT / "benchmark/personal_figure_v1/review/review_round_6.json")["reviews"], {})

    def test_descriptive_cases_never_create_inference(self) -> None:
        for case_id in ["PFR009", "PFR027B", "PFR033", "PFR045"]:
            stats = self.stats(case_id)
            self.assertEqual(stats["status"], "not_applicable")
            self.assertEqual(stats["results"], [])
        pfr009 = self.case("PFR009")
        self.assertEqual({row["series"] for row in pfr009["rows"]}, {"Ndel1", "trichoplein"})
        self.assertEqual(len({row["experimentalUnitId"] for row in pfr009["rows"]}), 12)
        self.assertNotIn("opto-control", {row["condition"] for row in self.case("PFR033")["rows"]})

    def test_selected_comparison_patterns_are_preserved(self) -> None:
        pfr020 = self.stats("PFR020")["results"]
        p_values = {entry["label"]: entry["result"]["tests"][0]["pValue"] for entry in pfr020}
        self.assertLess(p_values["Proximal"], 0.05)
        self.assertGreater(p_values["Distal"], 0.05)
        self.assertGreater(p_values["C.D."], 0.05)
        pfr027 = self.stats("PFR027A")["results"][0]
        tests = {test["name"].split(":")[-1]: test["adjustedPValue"] for test in pfr027["result"]["tests"] if test["name"].startswith("planned_holm")}
        self.assertLess(tests["RhoA"], 0.05)
        self.assertGreater(tests["Rac1"], 0.05)
        self.assertGreater(tests["Cdc42"], 0.05)
        pfr043 = self.stats("PFR043")["results"][0]
        pairs = pfr043["request"]["plannedContrastConditionIds"]
        self.assertEqual(pairs, [["ECFP", "WT"], ["WT", "F702A"], ["WT", "H1433L"], ["WT", "R2130L"], ["WT", "ΔYins"]])
        results = {test["name"].split(":")[-1]: test["adjustedPValue"] for test in pfr043["result"]["tests"] if test["name"].startswith("planned_holm")}
        self.assertGreater(results["F702A"], 0.05)
        self.assertGreater(results["R2130L"], 0.05)
        self.assertLess(results["H1433L"], 0.05)
        self.assertLess(results["ΔYins"], 0.05)

    def test_repeated_nested_and_compositional_identity(self) -> None:
        pfr027b = self.case("PFR027B")["rows"]
        self.assertTrue(all(row.get("pairId") for row in pfr027b))
        self.assertIn("458-nm light", (RUNS / "PFR027B/final_graph.svg").read_text(encoding="utf-8"))
        pfr011 = self.case("PFR011")
        self.assertEqual(pfr011["panel"], "Fig. 5C")
        self.assertTrue(all(row.get("sessionId") for row in pfr011["rows"]))
        self.assertIn("reconstructed", self.stats("PFR011")["unit"])
        grouped: dict[tuple[str, str], float] = defaultdict(float)
        for row in self.case("PFR059B")["rows"]:
            grouped[(row["experimentalUnitId"], row["condition"])] = row["value"]
        for unit in {unit for unit, _ in grouped}:
            self.assertAlmostEqual(grouped[(unit, "P")] + grouped[(unit, "S")], 100, places=6)

    def test_manual_line_styles_round_trip_and_legend_contract(self) -> None:
        state = load(RUNS / "PFR045/graph_state.json")
        styles = state["appearance"]["seriesStyles"]
        self.assertEqual(len(styles), 5)
        self.assertTrue(all(style["lineWidth"] > 0 for style in styles.values()))
        self.assertIn("dashed", {style["lineStyle"] for style in styles.values()})
        svg = (RUNS / "PFR045/final_graph.svg").read_text(encoding="utf-8")
        self.assertIn('stroke-dasharray="8 5"', svg)

    def test_human_reviewed_graph_presentation_contract(self) -> None:
        for case_id in CASE_IDS:
            svg = (RUNS / case_id / "final_graph.svg").read_text(encoding="utf-8")
            self.assertIn('transform="rotate(-90 42 ', svg, case_id)
        self.assertTrue(load(RUNS / "PFR009/graph_state.json")["axes"]["gridLines"])
        self.assertEqual(load(RUNS / "PFR011/graph_state.json")["axes"]["tickLabels"], "numeric_hours")
        for case_id in ["PFR020", "PFR033", "PFR043"]:
            state = load(RUNS / case_id / "graph_state.json")
            self.assertEqual(state["axes"]["yMax"], 100)
            self.assertEqual(state["appearance"]["summary"], "mean_sd")
        self.assertEqual(load(RUNS / "PFR059B/graph_state.json")["appearance"]["errorBarSeries"], ["P"])
        self.assertIn("gflB KO", (RUNS / "PFR059A/final_graph.svg").read_text(encoding="utf-8"))

    def test_safe_refusal_and_authoritative_nonlinear_fit(self) -> None:
        self.assertEqual(self.stats("PFR054")["gap"], "SOURCE_UNCERTAINTY")
        pfr062_stats = self.stats("PFR062")
        self.assertEqual(pfr062_stats["status"], "ok")
        fit = pfr062_stats["results"][0]["result"]["nonlinearFit"]
        self.assertEqual(fit["modelId"], "zero_baseline_association")
        self.assertEqual({series["seriesId"] for series in fit["series"]}, {"K5", "K14"})
        self.assertTrue(all(series["converged"] for series in fit["series"]))
        pfr062_svg = (RUNS / "PFR062/final_graph.svg").read_text(encoding="utf-8")
        self.assertIn("Authoritative D17 nonlinear fit", pfr062_svg)
        self.assertIn("nonlinearFit", load(RUNS / "PFR062/project_state.json")["analysis"]["results"][0]["result"])
        self.assertEqual(load(RUNS / "PFR062/run.json")["outcome"], "completed")

    def test_audit_and_four_set_semantics(self) -> None:
        summary = load(ROOT / "benchmark/personal_figure_v1/expanded_round_6_audit_summary.json")
        self.assertEqual(summary["caseCount"], 12)
        self.assertEqual(summary["completed"], 12)
        self.assertEqual(summary["explicitUnsupported"], 0)
        self.assertFalse(summary["humanRatingsGenerated"])
        self.assertFalse(summary["poolDOpened"])
        for case_id in CASE_IDS:
            sets = load(RUNS / case_id / "graph_state.json")["dataSets"]
            self.assertEqual(set(sets), {"displaySet", "analysisSet", "comparisonSet", "annotationSet"})


if __name__ == "__main__":
    unittest.main()
