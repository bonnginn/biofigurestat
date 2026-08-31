# Current Working State

Updated: 2026-08-31 (Public Alpha published; English localization in progress)

This is the short operational snapshot. Accepted ADRs, schemas, method references, and tests remain
the authority for durable behavior.

## Product phase

BioFigureStat `0.1.0-alpha.1` is publicly available under the MIT License at
`https://github.com/bonnginn/biofigurestat/releases/tag/v0.1.0-alpha.1`.
The repository and release are anonymously accessible. The release contains:

- Windows 11 x64 installer, SHA-256
  `74D0C98124DE7319EAC623EADD99392E198E5128B4DDFF730F62015D0B615100`;
- Apple Silicon macOS zip, SHA-256
  `9C6FAE3076D1D7BD0E7F249451239675160179CBD37AA6618BE48CC9BD4208B6`.

Those artifacts were validated from private release-build commit
`587930f7b9aa81f2dd63386ac2643bc3c625efce`. The public source tag is an audited snapshot derived
from that build and is documented in
`docs/alpha/PUBLIC_SOURCE_PROVENANCE_0.1.0-alpha.1.md`. Sealed evaluation pools, historical
benchmark outputs, third-party comparison figures, external-review working material, and the
unreferenced corpus-coupled prototype are retained only in the private archive.

## Active work

Branch `codex/english-alpha-localization-2026-08-31` adds a persistent Japanese / English
application-language setting and reviewed English copy for the production Public Alpha workflow.
Automated English rendering checks now cover the application shell, experiment setup, canonical
data surfaces, Graph and Statistics, specialist workspaces, Help, external-LLM consultation, and
problem reporting. Locale state remains outside `.lsa`; scientific semantic keys, analysis
requests, raw lineage, and the project schema are unchanged. The completed and remaining scope is
recorded in `docs/alpha/ENGLISH_ALPHA_LOCALIZATION_STATUS_2026-08-31.md`.

Legacy D01-D05 files remain backward compatible. When English is active, those pre-workspace files
stop at an English compatibility notice instead of mixing Japanese legacy-editor copy into the
English UI. Switching to Japanese opens the unchanged legacy editor; no project conversion occurs.

The preceding structural-simplification work remains the base of this branch. Further workbench
and spreadsheet consolidation should resume after the English native candidate, without mixing
structural refactors into terminology review.

## Product invariants

- The product is experiment-first; method selection follows declared experimental structure.
- Biological `n`, experimental-unit identity, pairing, blocking, nesting, repeated identity,
  censoring, ordered axes, missingness, raw lineage, and provenance remain explicit.
- Compact and expanded worksheets are views over the same canonical observations.
- Appearance changes do not mutate analysis results.
- Unsupported or ambiguous designs stop safely.
- Public Alpha `.lsa` files are backward-compatibility obligations.
- Research measurements and project contents are processed locally and are not included in usage
  telemetry or problem reports.

## Current verification

For the audited public snapshot, dependency installation, typecheck, lint, and the production UI
build pass. The self-contained package suites pass. The full UI suite produced one save-target
mock failure in 1,087 tests; the exact failed test passed immediately in focused isolation, so it
is recorded as a parallel full-run flaky rather than a product regression. Corpus-coupled
integration harnesses are not distributed because their fixtures are intentionally private.

For the post-Alpha refactor, focused Graph, Graph-only, DataSheet, MultiConditionDataSheet, and
`ExperimentGraphWorkbench` suites pass together with typecheck and lint. Native release artifacts
remain the unchanged Alpha binaries; this source-only refactor has not produced a new native
candidate. The workbench now routes SVG, PNG, and CSV through a separately tested export controller
that preserves native Save-dialog cancellation and returns diagnostic failures without changing
Graph state or export content. Its persisted-state projection is also isolated in a pure selector;
focused regression tests keep display and analysis sets distinct, retain only explicit comparison
and annotation links, and prevent later editor-array mutation from rewriting an emitted snapshot.
The X- and Y-axis editors are now separately tested components while retaining the same semantic,
title, unit, range, scale, tick, hierarchy, grouping, and appearance state owned by the workbench.
Graph type, display presets, palettes, typography, canvas size, and layout reset now use a separate
appearance editor plus one shared palette definition. Saved-result annotation visibility, display
format, placement, legend text, and removal now use a separate editor; comparison creation and
derived-metric lineage remain explicitly owned by the workbench. Raw-observation points,
experiment-unit points, uncertainty/error bars, connecting lines, and legends now also use focused
editor components. Their layer visibility, point/line styling, ribbon settings, and single-palette
legend transition are covered independently. Categorical-composition and X/Y-correlation SVG
renderers now have direct component boundaries and share the same tested numeric label and
significance formatting as the main renderer. Statistics comparison-intent transitions and
deterministic Methods generation are isolated from the workbench; tests preserve the existing
method mapping and verify that presentation metadata never mutates the executed request. The
general-purpose SVG renderer is now also a separate component boundary, including categorical
layout, nice ticks, hierarchy labels, raw and experiment-unit marks, summaries, uncertainty,
annotations, and legend drawing. Its extraction reduced the orchestration workbench from roughly
4,900 to 3,400 lines without moving canonical data construction, Statistics execution, benchmark
capture, or persisted state ownership. The existing 52-test workbench regression suite covers the
renderer boundary directly through its public workflow. Canonical cells are now projected into
Graph series by a separately tested pure adapter: stable experiment/condition/readout/time keys,
not-planned cells, proportion percentages, nested summaries, WB ratios, derived metrics, and raw
observation lineage retain their existing meanings. Derived-metric lineage rows now use the same
adapter while preserving each source time point and its value; the focused Graph and adapter suite
passes with 55 tests. This further reduces the orchestration
workbench to roughly 3,200 lines. The
expanded full UI suite passes with 147 files and 1,156 tests; typecheck and lint pass for the
extracted boundaries.

For the English-localization branch, the full UI suite passes with 131 files and 1,117 tests.
English no-Japanese assertions inspect visible text plus accessible labels, titles, placeholders,
and image alternative text across the production surfaces. Typecheck, lint, and the production UI
build pass. Windows candidate `8dec615-alpha.20260831.win-en1` passes the Windows bundle verifier,
release bundle verifier, and packaged-engine smoke checks. Its installer SHA-256 is
`B4A30A4288D0DF164766C0B99027E5CC36C4EE7D04AD381659CDD29AC4071554`. Windows human language review
and the macOS native candidate remain outstanding.

Post-Alpha native regression automation has started on this branch. A dependency-free Windows
harness now launches the exact packaged Tauri executable with an isolated WebView2 profile and can
drive native IPC, export, New Experiment input, and the dirty-window Close / Cancel / Discard
lifecycle while recording screenshots and JSON evidence. Its first attachment found and drove the
fix for Japanese route-wrapper copy in English mode. After that initial success, repeated CDP
attachment on the current Windows host stopped exposing an inspection port; the harness records
this as infrastructure failure rather than product failure. The rebuilt package still passes the
Windows bundle and release verifiers, typecheck, lint, and the expanded full UI suite (131 files,
1,117 tests). A clean Windows CI/VM backend and a macOS adapter remain required before this becomes
a mandatory cross-platform gate. See `docs/alpha/NATIVE_UI_REGRESSION_HARNESS.md`.

## Known bounded gaps

- `ExperimentGraphWorkbench` remains large and still mixes rendering, editor UI, analysis
  integration, diagnostics, and benchmark capture. Native export and persisted-state projection
  have been separated, and X/Y-axis editing now sits behind component boundaries; rendering and
  the appearance, annotation, raw-point, uncertainty, connecting-line, and legend presentation
  editors now have component boundaries. Composition and correlation renderers plus the first
  pure Statistics/Methods orchestration boundary are separated. The main general-purpose SVG
  renderer is separated as well; remaining analysis, diagnostic, and benchmark orchestration are
  the next safe extraction boundaries.
- Spreadsheet implementations still include legacy and canonical surfaces with only partial shared
  primitives.
- Route-level code splitting remains a performance and maintainability follow-up.
- English localization is covered for the production Public Alpha surfaces. Pre-workspace legacy
  D01-D05 editors use an explicit English compatibility stop rather than a partially translated
  editor; no English native release has been declared ready.
- Beta work includes Graph-preview parity, compact workspace chrome, editable experiment metadata,
  and Kaplan–Meier appearance-control parity while preserving censoring and risk-table semantics.
- Windows native UI regression automation has an initial exact-executable harness, but its CDP
  attachment still needs a clean-runner fallback; macOS UI driving is not implemented. Human review
  should then focus on scientific usability and visual judgment.

## Working-tree rule

Always run `git status --short` before editing. Preserve unrelated changes. Use small commits and
focused tests first, then expand validation in proportion to risk. Do not access sealed evaluation
pools or historical benchmark contents during ordinary product work.
