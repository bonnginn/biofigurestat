from __future__ import annotations

import unittest

from verify_engine_reference import compare


class EngineReferenceComparatorTests(unittest.TestCase):
    def test_numeric_tolerance_and_exact_semantics(self) -> None:
        expected = {
            "method": "welch_t",
            "p": 0.0123456789,
            "correction": None,
            "values": [1.0, 2.0],
        }
        self.assertEqual(
            compare(
                {**expected, "p": expected["p"] + 1e-13},
                expected,
            ),
            [],
        )
        self.assertTrue(compare({**expected, "method": "student_t"}, expected))
        self.assertTrue(compare({**expected, "p": expected["p"] + 1e-4}, expected))
        self.assertTrue(compare({**expected, "values": [1.0]}, expected))


if __name__ == "__main__":
    unittest.main()
