from __future__ import annotations

import copy
import json
import unittest

import numpy as np
from scipy import stats

from audit_literature_hierarchy import AMBIGUOUS, CONFLICT, EXCLUDED, PASS, RUNTIME, audit_all, audit_payload


def load(case_id: str) -> dict:
    return json.loads((RUNTIME / case_id / "integrator.json").read_text(encoding="utf-8"))


class LiteratureHierarchyAuditTests(unittest.TestCase):
    def test_jcb003_uses_three_session_parents(self) -> None:
        result = audit_payload(load("JCB003"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["hierarchyPath"], "parent_unit_id")
        self.assertEqual(result["loaderRequiredBiologicalN"], 3)

    def test_another_nested_observation_does_not_inflate_n(self) -> None:
        payload = load("JCB003")
        row = copy.deepcopy(payload["syntheticData"][0])
        row["unit_id"] += "-extra"
        payload["syntheticData"].append(row)
        self.assertEqual(audit_payload(payload)["loaderRequiredBiologicalN"], 3)

    def test_missing_nested_parent_fails(self) -> None:
        payload = load("JCB003")
        payload["syntheticData"][0]["parent_unit_id"] = None
        self.assertEqual(audit_payload(payload)["status"], CONFLICT)

    def test_row_level_pseudoreplication_without_parent_fails(self) -> None:
        payload = load("JCB014")
        payload["researcherPacketSource"]["nested_observation_note"] = (
            "No special nested-observation rule beyond the stated experimental unit."
        )
        for row in payload["syntheticData"]:
            row["parent_unit_id"] = None
        self.assertEqual(audit_payload(payload)["status"], CONFLICT)

    def test_declared_biological_n_mismatch_fails(self) -> None:
        payload = load("JCB003")
        payload["researcherPacketSource"]["experimental_unit_description"] = (
            "4 biological replicates with nested cells"
        )
        self.assertEqual(audit_payload(payload)["status"], CONFLICT)

    def test_paired_identity_count(self) -> None:
        result = audit_payload(load("JCB002"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["hierarchyPath"], "unit_id_across_conditions")
        self.assertEqual(result["loaderRequiredBiologicalN"], 10)

    def test_longitudinal_time_does_not_inflate_n(self) -> None:
        result = audit_payload(load("JCB011"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["hierarchyPath"], "unit_id_across_time")
        self.assertEqual(result["loaderRequiredBiologicalN"], 8)

    def test_cross_sectional_units_are_not_shared_over_time(self) -> None:
        result = audit_payload(load("NC027"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["hierarchyPath"], "unit_id_per_condition_time")
        self.assertEqual(result["loaderRequiredBiologicalN"], 4)

    def test_flat_one_row_per_unit_remains_valid(self) -> None:
        result = audit_payload(load("JCB001"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["hierarchyPath"], "unit_id")
        self.assertEqual(result["loaderRequiredBiologicalN"], 5)

    def test_false_factorial_repeat_identity_fails(self) -> None:
        payload = load("JCB023")
        for row in payload["syntheticData"]:
            row["experiment_id"] = row["experiment_id"].rsplit("-", 1)[-1]
        self.assertEqual(audit_payload(payload)["status"], CONFLICT)

    def test_independent_factorial_runtime_is_not_paired(self) -> None:
        result = audit_payload(load("JCB023"))
        self.assertEqual(result["status"], PASS)
        self.assertEqual(result["loaderRequiredBiologicalN"], 6)
        self.assertEqual(result["experimentIdCount"], 24)

    def test_missing_matched_roi_identity_fails(self) -> None:
        payload = load("NC032")
        for row in payload["syntheticData"]:
            row["unit_id"] = f'{row["condition"]}:{row["unit_id"]}'
        self.assertEqual(audit_payload(payload)["status"], CONFLICT)

    def test_irreducible_summary_vs_nested_case_is_explicitly_excluded(self) -> None:
        payload = load("JCB019")
        self.assertEqual(audit_payload(payload)["status"], EXCLUDED)
        payload["excludedFromAutomatedScoring"] = False
        self.assertEqual(audit_payload(payload)["status"], AMBIGUOUS)

    def test_corrected_gold_references_are_persisted(self) -> None:
        expected = {
            "EL050": (0, 0.1155356542273662),
            "JCB008": (7.200000000000003, 0.02732372244729252),
            "JCB014": (-4.178906947641888, 0.015447708097254537),
            "JCB023": (10.50814367854677, 0.004088241474649362),
            "NC030": (-4.465534102942099, 0.01563691285611424),
            "NC032": (8.200000000000003, 0.04205418289496618),
            "NC037": (0.5244755244755246, 0.08001937592027474),
        }
        for case_id, reference in expected.items():
            gold = load(case_id)["goldAnalysis"]
            self.assertAlmostEqual(gold["reference_statistic"], reference[0])
            self.assertAlmostEqual(gold["reference_p_value"], reference[1])

    def test_corrected_gold_recomputes_from_runtime_analysis_units(self) -> None:
        def parent_means(case_id: str) -> dict[str, list[float]]:
            grouped: dict[tuple[str, str], list[float]] = {}
            for row in load(case_id)["syntheticData"]:
                grouped.setdefault((row["condition"], row["parent_unit_id"]), []).append(row["value"])
            result: dict[str, list[float]] = {}
            for (condition, _), values in grouped.items():
                result.setdefault(condition, []).append(float(np.mean(values)))
            return result

        for case_id, method in (("JCB008", stats.kruskal), ("JCB014", stats.ttest_ind)):
            groups = list(parent_means(case_id).values())
            actual = method(*groups) if case_id == "JCB008" else method(*groups, equal_var=False)
            gold = load(case_id)["goldAnalysis"]
            self.assertAlmostEqual(float(actual.statistic), gold["reference_statistic"])
            self.assertAlmostEqual(float(actual.pvalue), gold["reference_p_value"])

        el = load("EL050")
        raw_p = []
        for readout in sorted({row["readout"] for row in el["syntheticData"]}):
            groups = [
                [row["value"] for row in el["syntheticData"] if row["readout"] == readout and row["condition"] == condition]
                for condition in sorted({row["condition"] for row in el["syntheticData"]})
            ]
            raw_p.append(float(stats.ttest_ind(*groups, equal_var=False).pvalue))
        order = np.argsort(raw_p)
        adjusted = np.empty(len(raw_p))
        running = 1.0
        for rank_index in range(len(raw_p) - 1, -1, -1):
            source_index = order[rank_index]
            running = min(running, raw_p[source_index] * len(raw_p) / (rank_index + 1))
            adjusted[source_index] = running
        self.assertEqual(int(np.sum(adjusted <= 0.05)), el["goldAnalysis"]["reference_statistic"])
        self.assertAlmostEqual(float(np.min(adjusted)), el["goldAnalysis"]["reference_p_value"])

        nc030 = load("NC030")
        final_time = max(float(row["time"]) for row in nc030["syntheticData"])
        groups = [
            [row["value"] for row in nc030["syntheticData"] if row["condition"] == condition and float(row["time"]) == final_time]
            for condition in sorted({row["condition"] for row in nc030["syntheticData"]})
        ]
        result = stats.ttest_ind(*groups, equal_var=False)
        self.assertAlmostEqual(float(result.statistic), nc030["goldAnalysis"]["reference_statistic"])
        self.assertAlmostEqual(float(result.pvalue), nc030["goldAnalysis"]["reference_p_value"])

        nc032 = load("NC032")
        blocks = [
            [next(row["value"] for row in nc032["syntheticData"] if row["condition"] == condition and row["unit_id"] == unit) for unit in sorted({row["unit_id"] for row in nc032["syntheticData"]})]
            for condition in sorted({row["condition"] for row in nc032["syntheticData"]})
        ]
        result = stats.friedmanchisquare(*blocks)
        self.assertAlmostEqual(float(result.statistic), nc032["goldAnalysis"]["reference_statistic"])
        self.assertAlmostEqual(float(result.pvalue), nc032["goldAnalysis"]["reference_p_value"])

        nc037 = load("NC037")
        result = stats.spearmanr([row["x_value"] for row in nc037["syntheticData"]], [row["value"] for row in nc037["syntheticData"]])
        self.assertAlmostEqual(float(result.statistic), nc037["goldAnalysis"]["reference_statistic"])
        self.assertAlmostEqual(float(result.pvalue), nc037["goldAnalysis"]["reference_p_value"])

        jcb023 = load("JCB023")
        rows = jcb023["syntheticData"]
        conditions = sorted({row["condition"] for row in rows})
        times = sorted({str(row["time"]) for row in rows})
        a = np.array([row["condition"] == conditions[-1] for row in rows], dtype=float)
        b = np.array([str(row["time"]) == times[-1] for row in rows], dtype=float)
        y = np.array([row["value"] for row in rows], dtype=float)
        reduced = np.column_stack((np.ones(len(rows)), a, b))
        full = np.column_stack((reduced, a * b))
        sse_reduced = float(np.sum((y - reduced @ np.linalg.lstsq(reduced, y, rcond=None)[0]) ** 2))
        sse_full = float(np.sum((y - full @ np.linalg.lstsq(full, y, rcond=None)[0]) ** 2))
        statistic = (sse_reduced - sse_full) / (sse_full / (len(rows) - full.shape[1]))
        p_value = float(stats.f.sf(statistic, 1, len(rows) - full.shape[1]))
        self.assertAlmostEqual(statistic, jcb023["goldAnalysis"]["reference_statistic"])
        self.assertAlmostEqual(p_value, jcb023["goldAnalysis"]["reference_p_value"])

    def test_full_audit_has_stable_review_set(self) -> None:
        report = audit_all()
        non_pass = {
            case["caseId"]: case["status"]
            for case in report["cases"]
            if case["status"] != PASS
        }
        self.assertEqual(
            non_pass,
            {"JCB019": EXCLUDED},
        )
        self.assertEqual(report["counts"][PASS], 49)
        self.assertEqual(report["counts"][CONFLICT], 0)


if __name__ == "__main__":
    unittest.main()
