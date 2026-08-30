# Post-Alpha structural simplification — 2026-08-31

## 1. BASELINE

- Public source tag: `v0.1.0-alpha.1`
- Public source commit: `38bd2d6d7daa2fda8f23fb15dd9cadc063ce6a52`
- Refactor branch: `codex/post-alpha-structural-simplification-2026-08-31`
- Initial tracked files: 677
- Initial TypeScript/TSX/Rust/Python source files: 448
- Initial test files: 174
- Initial `ExperimentGraphWorkbench.tsx`: 6,854 lines
- Public release repository, release page, Windows asset, and macOS asset returned HTTP 200
  without authentication.

The public snapshot excludes sealed evaluation pools, historical benchmark outputs, external
review working material, and third-party comparison figures. Release binaries remain derived from
and validated against private build commit
`587930f7b9aa81f2dd63386ac2643bc3c625efce`; the public snapshot provenance is documented
separately.

Baseline validation:

- `pnpm install --frozen-lockfile`: PASS (10 workspace projects)
- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- production UI build: PASS; existing large-chunk advisory remains
- self-contained package suites: PASS
- full UI: 1,086 PASS / 1 flaky failure out of 1,087; the exact save-target mock test passed in
  focused isolation
- release verifier in the clean snapshot: NOT RUN because the pinned local Python `.venv` is not a
  tracked source artifact; already-published binaries retain their prior native verification

## 2. DUPLICATION_MAP

### Graph

- The production Graph-only route already used `ExperimentGraphWorkbench`, but the obsolete
  `GraphOnlyDescriptiveWorkbench` remained in source with its own five-way tick calculation,
  margins, renderer, palette editor, and export actions.
- `NonlinearFitGraph` independently divided numeric ranges into five equal intervals while the
  common workbench and Survival Graph used `createNiceTicks`.
- `ExperimentGraphWorkbench` mixed SVG rendering, editor orchestration, analysis annotations,
  CSV composition, export filenames, diagnostics, benchmark capture, and workspace layout.

### Spreadsheet

- `DataSheetPage` and `MultiConditionDataSheetPage` had identical legacy grid focus code for
  Enter and Arrow navigation, including the same data attributes and focus/select behavior.
- Canonical, adaptive, delimited specialist, and legacy sheets still have separate scientific
  projections. They must not be collapsed into one generic string table; only semantically neutral
  editing mechanics are candidates for further sharing.

### Prototype and generated outputs

- `packages/experiment-first-prototype` had no production, build, or documentation consumer and
  depended directly on a private evaluation corpus in its tests.
- The public repository contains no tracked `benchmark/`, `review/`, evaluation corpus, output,
  nightly-output, or benchmark-output directory. Ignore rules make those exclusions explicit.
- The remaining tracked PNG/ICNS/ICO assets are product icons or native fixtures, not regenerated
  benchmark output.

## 3. CHANGES_BY_COMMIT

- `110e53a` — removed the stale Graph-only renderer, retained its pure table semantics in
  `graphOnlyTableSemantics.ts`, and moved nonlinear X/Y to shared 1/2/5 nice ticks.
- `d1bcb6a` — extracted shared legacy spreadsheet keyboard navigation into
  `SpreadsheetGridInput.tsx` without changing either sheet's scientific model or styling.
- `6657e8b` — extracted Graph-series export types, visible-data CSV, categorical composition CSV,
  and safe filenames into `experimentGraphDataExport.ts`.
- `f0e0aa4` — extracted annotation labels, time-derived context, pairwise-test classification, and
  adjusted-comparison annotation construction into `experimentGraphAnnotations.ts`.

## 4. BEHAVIOR_PRESERVED

- No project or Graph schema changed.
- No statistical method, request, result, recommendation, or numerical engine code changed.
- Biological `n`, experimental-unit identity, pairing, nesting, repeated identity, censoring,
  ordered axes, missingness, and raw lineage are unchanged.
- Graph appearance remains separate from analysis.
- Graph-only inference remains unresolved until biological structure is explicitly confirmed.
- Existing workbench exports remain available through the same public import and UI actions.
- Legacy DataSheet and MultiConditionDataSheet retain their class names, focus behavior, value
  ownership, and condition/unit semantics.

## 5. REGRESSION_COVERAGE

- Graph-only and nonlinear Graph focused suite: 14/14 PASS
- DataSheet and MultiConditionDataSheet focused suite: 14/14 PASS
- `ExperimentGraphWorkbench`: 52/52 PASS after each extraction
- typecheck: PASS after each logical change
- lint: PASS after each logical change
- `git diff --check`: PASS before each commit
- Nice-tick regression explicitly covers the previously problematic awkward `0.858–1.642` range.
- Existing workbench tests cover axis-title placement, plot margins, label non-overlap, export,
  annotations, display/analysis-set separation, hierarchy, repeated trajectories, and nested data.

## 6. REMOVED_OR_QUARANTINED_CODE

- Deleted from public product source: unused `GraphOnlyDescriptiveWorkbench.tsx`.
- Omitted from the audited public snapshot: unreferenced
  `packages/experiment-first-prototype` and two corpus-coupled integration harnesses.
- Preserved outside the public repository and in the private release archive: all omitted prototype
  and corpus-coupled files.
- Historical evidence and generated benchmark output remain in the private archive; they were not
  inspected as part of the refactor.

## 7. REMAINING_STRUCTURAL_DEBT

- `ExperimentGraphWorkbench.tsx` is reduced to about 6,533 lines but still owns too many concerns.
- Graph SVG renderers still use some family-specific plot rectangles; only scientifically identical
  layout rules should be shared.
- Legacy DataSheet implementations retain duplicated persistence, raw-revision, analysis, and
  workflow-tab orchestration beyond the extracted input primitive.
- Canonical/adaptive/delimited spreadsheets use different editors because their semantic records
  differ; draft/commit and selection behavior should be compared before another extraction.
- UI production bundle remains above the 500 kB advisory threshold.
- Native lifecycle regression automation remains a higher-value next step than broad UI rewriting.

## 8. NATIVE_VERIFICATION

No new native binary was produced from this source-only refactor. The published, unchanged Alpha
assets were anonymously downloaded by HTTP and matched the GitHub-reported sizes and SHA-256
digests. Their prior Windows and macOS native gates remain the release evidence. A future candidate
must rerun native bundle verification and the planned native UI regression harness.

## 9. RECOMMENDED_NEXT_REFACTOR

1. Extract the workbench state snapshot/selector boundary and native export controller without
   changing public props or persistence shape.
2. Add the cross-platform native UI regression harness for launch, grid entry, dirty lifecycle,
   save/reopen, Graph/Statistics continuity, and export dialogs.
3. Compare canonical and specialist draft/commit primitives using visible-value === canonical-value
   tests before sharing more spreadsheet code.
4. Introduce route-level code splitting after native harness coverage exists.
5. Centralize reviewed researcher terminology before starting English localization.
