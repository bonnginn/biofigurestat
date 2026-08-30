from __future__ import annotations

from collections import Counter
import copy
import unittest

from split_expanded_benchmark import balanced_assign, canonical_hash


def fixture_records(count: int = 60) -> list[dict[str, object]]:
    return [
        {
            "case_id": f"CASE{index:03d}",
            "design_class": ("independent", "paired", "repeated")[index % 3],
            "difficulty": ("standard", "advanced")[index % 2],
            "paper_graph_family": ("dot", "line", "bar", "composition")[index % 4],
            "acceptable_statistical_families": ("t", "anova", "rank")[index % 3],
            "batch_id": f"B{index % 5:02d}",
            "scope_expectation": ("core", "workaround")[index % 2],
        }
        for index in range(count)
    ]


class ExpandedBenchmarkSplitTests(unittest.TestCase):
    def test_assignment_is_deterministic_and_does_not_mutate_records(self) -> None:
        records = fixture_records()
        original = copy.deepcopy(records)
        first = balanced_assign(records, {"B": 36, "C": 12, "D": 12}, seed="fixed")
        second = balanced_assign(records, {"B": 36, "C": 12, "D": 12}, seed="fixed")
        self.assertEqual(first, second)
        self.assertEqual(records, original)
        self.assertEqual(Counter(first.values()), Counter({"B": 36, "C": 12, "D": 12}))

    def test_assignment_keeps_common_design_classes_proportional(self) -> None:
        records = fixture_records()
        by_id = {record["case_id"]: record for record in records}
        result = balanced_assign(records, {"B": 36, "C": 12, "D": 12}, seed="fixed")
        for pool, expected_total in {"B": 36, "C": 12, "D": 12}.items():
            counts = Counter(
                by_id[case_id]["design_class"]
                for case_id, assigned in result.items()
                if assigned == pool
            )
            self.assertEqual(sum(counts.values()), expected_total)
            self.assertLessEqual(max(counts.values()) - min(counts.values()), 2)

    def test_capacity_mismatch_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "capacity"):
            balanced_assign(fixture_records(10), {"B": 9}, seed="fixed")

    def test_canonical_hash_ignores_dictionary_key_order(self) -> None:
        self.assertEqual(canonical_hash({"a": 1, "b": 2}), canonical_hash({"b": 2, "a": 1}))


if __name__ == "__main__":
    unittest.main()
