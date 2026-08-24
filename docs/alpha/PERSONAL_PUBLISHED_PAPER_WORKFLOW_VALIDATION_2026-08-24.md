# Personal Published-Paper Workflow Validation — 2026-08-24

## Decision

The personal published-paper workflow validation package is ready for researcher review in the local comparison browser. It is not yet a public-Alpha decision: six cases are waiting for the researcher's readability and preference ratings.

## Canonical personal corpus

- Source: `LSA_Personal_Figure_Benchmark_v1_Master.xlsx` and its Track B companion supplied from Downloads.
- 69 cases from five first-author papers.
- 6,810 deterministic synthetic rows; zero cases claim source raw observations.
- All reconstructions remain explicitly labeled `SYNTHETIC_RECONSTRUCTION`.
- Master and Track B SHA-256 values are pinned and validated by the importer.
- The full 69-case corpus is available for later expansion; only six representative cases were run through the UI now.

The expanded literature benchmark workbook, sealed Pool D, Round 4, and historical case conversations were not opened.

## Review set and application outcomes

| Case   | Published panel        | App outcome                       | Scientific support          | Main interpretation                                                                                            |
| ------ | ---------------------- | --------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| PFR002 | NDEL1 Fig. 1F          | completed, 9 artifacts            | direct                      | Independent experiment proportions; Welch ANOVA and Games–Howell after runtime identity correction.            |
| PFR004 | NDEL1 Fig. 2A          | completed, 9 artifacts            | direct                      | Independent conditions with repeated time inside condition; condition-by-time model.                           |
| PFR025 | OPTO Fig. 1D top       | completed, 9 artifacts            | scientifically compromising | Graph is useful, but available runtime IDs do not preserve activated/non-activated region pairing within cell. |
| PFR046 | OPTO Fig. 7C,D         | completed, 9 artifacts            | reasonable workaround       | Within-cell change is summarized to independent experiment level before comparing conditions.                  |
| PFR049 | GFLB Fig. 1 morphology | completed, 9 artifacts            | direct                      | Nested cells remain visible; inference uses independent imaging-session summaries.                             |
| PFR069 | CRYO Fig. 1F           | explicit unsupported, 4 artifacts | impossible                  | Single-cohort descriptive trajectory; no comparator or prespecified null exists.                               |

KER5 was retained in the 69-case corpus but omitted from this small visual set because the publisher page required a CAPTCHA. No CAPTCHA was bypassed and no non-primary image was substituted.

## Product findings implemented

1. The personal workbook used the same workbook-local unit labels in some independent conditions while its researcher packet explicitly said that no repeated identity was implied. The runtime importer now condition-qualifies unit and parent IDs in those cases. The source workbook remains unchanged.
2. Ordered-axis generation previously hard-coded hours. The personal loader now preserves seconds, minutes, hours, or days from the source rows; OPTO seconds and CRYO minutes render correctly.
3. The evaluation launcher now accepts `LSAA_EVALUATION_UI_PORT` and `LSAA_EVALUATION_BRIDGE_PORT`, allowing a second isolated evaluation session without stopping an existing local Vite process.

## Remaining gaps

- PFR025 needs a stronger published-data identity contract that explicitly links activated and non-activated regions within each cell. Until then, its inferential result is not scientifically acceptable even though graph generation completes.
- The Statistics workspace has no completion route for a scientifically valid descriptive-only single-cohort trajectory. PFR069 therefore cannot produce the complete nine-artifact bundle without inventing an inferential target.
- Browser preview cannot save a native project file. Each completed case includes `run.json`, `graph_state.json`, and `interaction_log.json` as the preserved run state; native project saving remains for later macOS/Windows smoke validation.
- Researcher ratings are intentionally blank. They must be supplied in the comparison browser before final UX conclusions.

## Comparison browser

Run from the repository root:

```powershell
& '.\engine\python\.venv\Scripts\python.exe' '.\scripts\run_personal_comparison_browser.py'
```

Open `http://127.0.0.1:8765/`. The browser provides:

- case list, previous/next navigation, and review progress;
- side-by-side Reference / Default / Final figures;
- readability, preference, flags, and comments;
- Methods and Statistics links;
- atomic local save to `benchmark/personal_figure_v1/review/review_data.json` and JSON export.

## Artifact map

- Source workbooks and checksum manifest: `benchmark/personal_figure_v1/source/`
- Generated 69-case runtime: `benchmark/personal_figure_v1/runtime/`
- Published reference figures: `benchmark/personal_figure_v1/references/`
- Selected-case manifest: `benchmark/personal_figure_v1/comparison_manifest.json`
- Portable selected run artifacts: `benchmark/personal_figure_v1/runs/PFR*/`
- Review data: `benchmark/personal_figure_v1/review/review_data.json`
- Aggregate summary: `benchmark/personal_figure_v1/validation_summary.json`

## Verification status

- Personal workbook import and runtime regeneration: passed.
- Personal importer unit test: passed after paired-case assertion was corrected to reflect condition-specific pair availability.
- All six default graphs generated in the application.
- Five complete nine-artifact runs; one evidence-backed explicit unsupported run.
- Comparison UI visual smoke: passed at desktop width with all three figure columns visible.
- Review persistence smoke: passed; smoke-test review was removed so researcher input starts blank.

Next gate: complete six researcher reviews, summarize readability/preference/flags, and use those results for the final Web Alpha UX adjustment pass.
