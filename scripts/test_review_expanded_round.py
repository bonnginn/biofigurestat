import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from review_expanded_round import comparison_review, expected_comparisons, failure_cluster


class ComparisonCompletenessReviewTests(unittest.TestCase):
    def test_accepts_valid_adjusted_pairwise_route_for_nonparametric_reference(self) -> None:
        gold = {
            "multiple_comparison_correction": "Dunn-Holm post hoc",
            "analysis_scope_note": "Kruskal-Wallis with corrected post hoc",
        }
        statistics = {
            "selectedMethod": "welch_anova",
            "contrast": {"intent": "all_pairs"},
            "result": {
                "tests": [
                    {"name": "welch_one_way_anova", "adjustedPValue": None},
                    {"name": "games_howell:a:b", "adjustedPValue": 0.04},
                ]
            },
        }
        result = comparison_review(
            "multi_group_nonparam",
            gold,
            statistics,
            {"statisticsAnnotation": {"testIndex": 0}},
        )
        self.assertTrue(expected_comparisons(gold, "multi_group_nonparam"))
        self.assertFalse(result["rankPostHocCapabilityGap"])
        self.assertTrue(result["workflowComplete"])
        self.assertFalse(result["graphAnnotationMatchesPairwiseComparison"])

    def test_detects_nonparametric_reference_case_without_adjusted_pairwise_results(self) -> None:
        result = comparison_review(
            "multi_group_nonparam",
            {
                "multiple_comparison_correction": "Dunn-Holm post hoc",
                "analysis_scope_note": "Kruskal-Wallis with corrected post hoc",
            },
            {
                "selectedMethod": "kruskal_wallis",
                "contrast": {"intent": "omnibus_only"},
                "result": {"tests": [{"name": "kruskal_wallis", "adjustedPValue": None}]},
            },
            {"statisticsAnnotation": {"testIndex": 0}},
        )
        self.assertTrue(result["rankPostHocCapabilityGap"])
        self.assertFalse(result["workflowComplete"])

    def test_accepts_adjusted_pairwise_result_and_matching_graph_annotation(self) -> None:
        result = comparison_review(
            "multi_group",
            {"multiple_comparison_correction": "Tukey", "analysis_scope_note": "post hoc"},
            {
                "selectedMethod": "one_way_anova",
                "contrast": {"intent": "all_pairs"},
                "result": {
                    "tests": [
                        {"name": "one_way_anova", "adjustedPValue": None},
                        {"name": "tukey_hsd:a:b", "adjustedPValue": 0.03},
                    ]
                },
            },
            {"statisticsAnnotation": {"testIndex": 1}},
        )
        self.assertTrue(result["workflowComplete"])
        self.assertTrue(result["graphAnnotationMatchesPairwiseComparison"])

    def test_clusters_multi_readout_loader_evidence_by_required_structure(self) -> None:
        cluster = failure_cluster(
            "two_group_continuous",
            "explicit_unsupported",
            {},
            {},
            "The blinded case requires multiple distinct readouts from each biological unit.",
        )
        self.assertEqual(cluster, "multi_readout_loader_missing")


if __name__ == "__main__":
    unittest.main()
