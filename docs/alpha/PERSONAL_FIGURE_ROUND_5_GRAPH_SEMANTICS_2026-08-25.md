# Personal Published-Figure Workflow Validation — Round 5

Date: 2026-08-25
Status: **ROUND 5 COMPLETE — READY FOR HUMAN REVIEW**

## Scope

Round 5 applies the Round 4 human review to general Graph Core semantics. It uses only the six approved personal-workflow cases and their existing synthetic values. Round 1–4 artifacts are unchanged. Pool D and the sealed 495-case workbook were not opened.

## Generic changes

- Independent `displaySet`, `analysisSet`, `comparisonSet`, and `annotationSet`, with containment/integrity validation.
- Multi-factor X hierarchy (`factorIds`) for target/sequence and treatment-state labels.
- Hierarchy-aware grouped spacing with adjacent within-category series.
- Outlined bars and no duplicate mean line by default for bar + dots.
- Tukey 1.5×IQR or min–max box-and-whisker semantics, including whisker caps and outliers.
- Continuous-axis minor ticks without grid lines.
- Time-course uncertainty options: error bars, ribbon, or none; ribbon metadata stores SD/SEM and opacity.
- No line/ribbon extension outside the measured X domain.
- Conservative graph-facing label humanization and generic categorical-axis-title omission.

## Round 5 artifacts

- Runtime: `benchmark/personal_figure_v1/runtime_round_5`
- Runs: `benchmark/personal_figure_v1/runs_round_5`
- Comparison manifest: `benchmark/personal_figure_v1/comparison_manifest_round_5.json`
- Empty review preparation: `benchmark/personal_figure_v1/review/review_round_5.json`
- Browser: `http://127.0.0.1:8768/benchmark/personal_figure_v1/comparison_browser/index.html?round=5&view=finals`

Human ratings are intentionally empty.

## Case outcomes

- PFR002: three treatment categories × two adjacent rescue-cell-line series; display references remain separable from analysis; only selected Dox contrasts are annotated.
- PFR004: 0 h/24 h adjacent series; control/Ndel1/NDE1 parent hierarchy; no misleading `Time (h)` X title.
- PFR025: accepted representative-cell trajectories retained; minor ticks; 0–900 s measured-domain clipping.
- PFR046: Dark/Lit labels; control/PLCε hierarchy; paired identity remains design-driven.
- PFR049: true Tukey box-and-whisker; `Circularity`; no generic `Genotype` title.
- PFR069: descriptive mean ± SD ribbon; minor ticks; −5 to 10 min measured-domain clipping; no inference.

## Numerical behavior

The statistical engine and previously executed numerical results are unchanged. Round 5 changes selection metadata, visual grammar, labels, and uncertainty representation only.

## Migration

No destructive migration is required. New fields are additive and legacy payloads receive safe defaults; subsequent saves write the explicit contract.

## Validation

- UI: 55 test files / 399 tests passed.
- Other TypeScript packages: 34 test files / 138 tests passed.
- Python statistical engine: 56/56 passed.
- Round 5 artifact contract: 3/3 passed.
- TypeScript typecheck: passed.
- ESLint: passed.
- Changed-file Prettier check: passed.
- Python builder/server compile check: passed.
- Production Web build: passed.
- Browser audit: six Round 5 final graphs loaded; review preparation showed `0 reviewed / 6`.

The repository-wide diff whitespace check still reports the pre-existing trailing whitespace in `PERSONAL_FIGURE_ROUND_4_REMEDIATION_VALIDATION_2026-08-25.md`; this Round 5 work did not overwrite that existing user change.

## Remaining severity

- P0: none found in this scope.
- P1: none found in this scope.
- P2: native macOS/Windows smoke and broader visual polish remain later Alpha work.

PFR002 selected-comparison rendering is resolved: the display subset is independent, exact planned pairs are persisted, and the annotation set can expose only those selected contrasts.
