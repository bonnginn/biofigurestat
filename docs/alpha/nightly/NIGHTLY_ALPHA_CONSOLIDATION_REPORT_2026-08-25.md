# Nightly Alpha Consolidation Report

Date: 2026-08-25  
Canonical starting point: `docs/alpha/POST_BENCHMARK_ALPHA_GAP_CLOSURE_2026-08-24.md`  
Scope guard: Pool D sealed; Round 4 and full-495 were not run.

## Outcome

The nightly pass completed the Graph Core v1 slice, reconstructed a six-case Personal Figure Round 3 through the actual app, performed a bounded UI debug audit, audited a safe allowlist of expanded benchmark realism cases, and created a panel-level personal-figure intent catalog.

Graph Core v1 now supports first-class X/series/facet mapping, grouped series, legend/style synchronization, distribution fill choices, continuous-axis origin/range/ticks, multiple collision-aware statistical brackets, and persistence of graph semantics and annotation lineage. Backward compatibility for older graph states is retained.

## Delivered evidence

- Architecture: `docs/adr/0047-graph-core-v1-visual-grammar.md`
- Capability matrix: `docs/alpha/nightly/GRAPH_CORE_V1_CAPABILITY_MATRIX_2026-08-25.md`
- Round 3: `docs/alpha/nightly/PERSONAL_FIGURE_ROUND_3_GRAPH_CORE_VALIDATION_2026-08-25.md`
- UX audit: `docs/alpha/nightly/UX_DEBUG_AUDIT_2026-08-25.md`
- Expanded realism audit: `docs/alpha/nightly/BENCHMARK_495_REALISM_AUDIT_2026-08-25.md`
- Personal figure intent catalog: `docs/alpha/nightly/PERSONAL_PUBLISHED_FIGURE_INTENT_CATALOG_2026-08-25.md` and `.json`
- Canonical specification audit and handoff: `docs/alpha/CANONICAL_SPEC_INVENTORY_2026-08-25.md`, `docs/alpha/SPEC_IMPLEMENTATION_ALIGNMENT_2026-08-25.md`, `docs/alpha/CURRENT_SOURCE_OF_TRUTH_HANDOFF_2026-08-25.md`

## Track results

### Graph Core and Round 3

- Six runtime cases were generated from immutable Round 2 numeric values with explicit generic factor intent.
- Six actual-app runs completed with nine artifacts each.
- PFR002/PFR004/PFR046 now use adjacent series and legends.
- PFR025/PFR069 use continuous fixed-width X geometry beginning at the Y-axis.
- PFR002/PFR004/PFR046/PFR049 display multiple saved statistical comparisons.
- PFR049 is no longer solid-black filled; PFR069 is mean ± SD only.

### UX audit

- P0 old-state blank screen was fixed by safe defaulting of `statisticsAnnotations`.
- Statistics collapses to one column at 720 px.
- The project command bar remains usable at 545 px via non-wrapping horizontal scroll.
- Remaining P2 items are documented: mixed JP/EN generated labels, verbose confirmation copy, and some legacy top-bar clipping.

### Expanded realism audit

- A safe 40-case allowlist was used; the sealed workbook and Pool D were not opened.
- Fidelity: high 1, adequate 17, context-reduced 3, material-loss 15, unresolved 4.
- The report separates source-data realism limits from product support status; historical failure lists were not treated as current truth.

### Personal intent catalog

- Five papers and 69 panels were cataloged without generating synthetic values, statistics, or graphs.
- Confidence: paper-confirmed 61, inferred 4, uncertain 4.

## Known residual gaps

1. PFR002 exposes a Statistics-layer limitation: a factorial route cannot yet restrict computation to the two explicit planned contrasts. Display and lineage are correct, but support remains `reasonable_workaround`.
2. Reference-line/activation-window rendering exists at schema/renderer level but lacks complete authoring controls.
3. Facet rendering is a usable foundation; atomic export and independent facet axes remain follow-up work.

## Final verification

- TypeScript workspace tests: 525/525 PASS (UI 389; domain, data-sheet, analysis-contracts, graph-spec, and project 136).
- Python statistical engine: 56/56 PASS.
- Python script regression suite: 103 tests PASS, 1 intentionally skipped.
- Round 3 artifact contract verification: all six cases PASS.
- Typecheck, lint, and production build: PASS. The build retains the existing non-blocking large-chunk warning.
- Formatting was checked on the changed source set. A repository-wide formatting sweep was not used as a gate because the benchmark runtime corpus contains pre-existing generated files outside this change's formatting scope.

## Readiness

This pass improves Alpha readiness materially but does not itself authorize public Alpha. The next evidence gate remains personal workflow review of Round 3, followed by final UX adjustment and macOS/Windows native smoke.
