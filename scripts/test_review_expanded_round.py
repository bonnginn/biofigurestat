import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from review_expanded_round import comparison_review, expected_comparisons


class ComparisonCompletenessReviewTests(unittest.TestCase):
    def test_detects_required_adjusted_nonparametric_posthoc_gap(self) -> None:
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
        self.assertTrue(result["rankPostHocCapabilityGap"])
        self.assertFalse(result["workflowComplete"])
        self.assertFalse(result["graphAnnotationMatchesPairwiseComparison"])

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


if __name__ == "__main__":
    unittest.main()
