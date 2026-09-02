from __future__ import annotations

import unittest

from verify_engine_reference import (
    compare,
    reference_case_id,
    reference_coverage,
    reference_source_platform,
    require_reference_writer_platform,
)


class EngineReferenceComparatorTests(unittest.TestCase):
    def test_reference_writer_is_restricted_to_the_reviewed_platform(self) -> None:
        self.assertEqual(reference_source_platform("Darwin", "aarch64"), "Darwin-arm64")
        require_reference_writer_platform("Darwin", "arm64")
        with self.assertRaisesRegex(SystemExit, "restricted to the reviewed Darwin-arm64"):
            require_reference_writer_platform("Windows", "AMD64")

    def test_reports_missing_and_obsolete_protocol_cases_without_executing_them(self) -> None:
        current = {
            "templateId": "D01",
            "method": "welch_tost",
            "requestId": "request.tost",
        }
        retired = {
            "templateId": "D99",
            "method": "retired",
            "requestId": "request.old",
        }
        reference = {
            "cases": [
                {"caseId": reference_case_id(retired), "request": retired, "result": {}},
            ]
        }

        self.assertEqual(
            reference_coverage(reference, [current]),
            ([reference_case_id(current)], [reference_case_id(retired)]),
        )

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

    def test_ignores_only_version_and_diagnostic_copy_in_numeric_reference(self) -> None:
        expected = {
            "engine": {"name": "lsaa-python", "version": "0.13.0"},
            "diagnostics": [{"code": "ASSUMPTION_NOTE", "severity": "info", "message": "Old"}],
        }
        actual = {
            "engine": {"name": "lsaa-python", "version": "0.14.0"},
            "diagnostics": [{"code": "ASSUMPTION_NOTE", "severity": "info", "message": "Clearer"}],
        }
        self.assertEqual(compare(actual, expected), [])
        actual["diagnostics"][0]["code"] = "DIFFERENT_CODE"
        self.assertTrue(compare(actual, expected))


if __name__ == "__main__":
    unittest.main()
