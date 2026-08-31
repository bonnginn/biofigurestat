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

Branch `codex/native-ui-regression-automation-2026-08-31` carries the post-Alpha native-regression
harness and the current source-only structural simplification. Its base includes a persistent
Japanese / English application-language setting and reviewed English copy for the production
Public Alpha workflow.
Automated English rendering checks now cover the application shell, experiment setup, canonical
data surfaces, Graph and Statistics, specialist workspaces, Help, external-LLM consultation, and
problem reporting. Locale state remains outside `.lsa`; scientific semantic keys, analysis
requests, raw lineage, and the project schema are unchanged. The completed and remaining scope is
recorded in `docs/alpha/ENGLISH_ALPHA_LOCALIZATION_STATUS_2026-08-31.md`.

Legacy D01-D05 files remain backward compatible. When English is active, those pre-workspace files
stop at an English compatibility notice instead of mixing Japanese legacy-editor copy into the
English UI. Switching to Japanese opens the unchanged legacy editor; no project conversion occurs.

Structural simplification is proceeding as small behavior-preserving commits. It does not change
the published Alpha artifacts, scientific semantics, or the project schema.

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
benchmark rendered-state, analysis-state, and usage-telemetry projections are now pure tested
boundaries as well. Tests keep presentation configuration separate from executed analysis facts,
include derived metrics only when displayed, and centrally classify usage edit categories without
moving effect order out of the workbench. Benchmark `statistics.json` and `run.json` artifact
construction now also uses pure tested builders; request-specific contrasts, descriptive
not-performed status, event counts, and the existing artifact shape are preserved. These
builders now also classify benchmark Graph-open/rendered/analysis change events, construct their
unchanged detail payload, and define the default/final artifact manifests outside the React effect.
Graph-state diagnostics, usage edit reporting, and benchmark configuration event effects now have
separately tested hooks: initial projections are not miscounted as edits, repeated fingerprints are
not re-emitted, and analysis-only changes retain their existing event classification. These
extractions now also cover the shared SVG→PNG/hash/base64 capture payload, eligible default-capture
effect, and final-run controller. Tests preserve the Statistics exclusion for default capture,
completion prerequisites, descriptive `none_descriptive` semantics, artifact completeness, and
failure-before-hash behavior. Workspace-mode selection, restored-analysis clearing, and persisted
snapshot emission now use a tested synchronization hook. Snapshot and callback changes in the same
render are delivered to the current callback rather than the stale one. Adjusted comparison
annotations are applied once per new successful request without overwriting restored annotations.
Analysis-context fingerprints and varying-factor selection are pure tested functions that preserve
stable-unit fallbacks and exclude unselected conditions. Statistics method, correlation,
comparison-intent, and planned-pair state transitions now use a tested hook that preserves
condition identities, benchmark events, and stale-result clearing. The workbench is reduced to
roughly 2,660
lines. Legacy two-condition and multi-condition sheets now share row-major Tab/Shift+Tab movement,
minimum-scroll focus behavior, roving tab-index calculation, finite numeric parsing, and proportion
display formatting. The shared boundaries retain each sheet's experimental-unit and condition
semantics while removing divergent keyboard/value paths. Focused suites, typecheck, and lint pass.
The expanded full UI suite passes with 160 files and 1,191 tests. An earlier parallel nonlinear-fit
presentation wait remains recorded as historical
flaky evidence; the current complete run did not reproduce it. The earlier focused run also
exposed duplicate `x.-5` ticks for a one-value finite range. The shared nice-tick helper now emits
one stable tick for such a degenerate range; Graph-layout, nonlinear Graph, and the full focused
workflow pass together (50/50) without the React warning.

For the English-localization branch, the full UI suite passes with 162 files and 1,198 tests.
English no-Japanese assertions inspect visible text plus accessible labels, titles, placeholders,
and image alternative text across the production surfaces. Typecheck, lint, and the production UI
build pass. Windows candidate `e6d442c-alpha.20260901.win-night1` passes the Windows bundle verifier,
release bundle verifier, packaged-engine smoke checks, and the exact-executable native UI scenario.
Its installer SHA-256 is
`719264C4213ACA0F78DCB926C2F995556808D419193EA4ED6812EADB28038E6C`. Windows human language/layout
review and the macOS native candidate remain outstanding.

Post-Alpha native regression automation now has a complete Windows packaged-app PASS. The
dependency-free harness launches the exact Tauri executable with an isolated WebView2 profile and
drives architecture IPC, exact native export, real Graph-only entry and mapping, Statistics
validation visibility/focus, and the dirty-window Close / Cancel / Discard lifecycle while
recording screenshots and JSON evidence. Revision `e6d442c-alpha.20260901.win-night1` passed every
step on this host; evidence is under
`.tmp/native-ui-regression/nightly-20260901-final/`. The transient blank-target startup race remains
classified separately from product regressions. The macOS Accessibility adapter is implemented,
but a permissioned Mac run is still required before the gate is cross-platform. See
`docs/alpha/NATIVE_UI_REGRESSION_HARNESS.md`.

## Known bounded gaps

- `ExperimentGraphWorkbench` remains large and still mixes rendering, editor UI, analysis
  integration, diagnostics, and benchmark capture. Native export and persisted-state projection
  have been separated, and X/Y-axis editing now sits behind component boundaries; rendering and
  the appearance, annotation, raw-point, uncertainty, connecting-line, and legend presentation
  editors now have component boundaries. Composition and correlation renderers plus the first
  pure Statistics/Methods orchestration boundary are separated. The main general-purpose SVG
  renderer is separated as well; benchmark artifact/event construction, pure state projections,
  usage-edit classification, Graph diagnostics, and benchmark configuration effects are separated.
  Default/final benchmark capture is now separated behind tested effect/controller boundaries.
  Native SVG/PNG/CSV cancellation remains in the existing export controller, while the duplicated
  success/failure feedback and diagnostic reporting plus clipboard format feedback are now a
  separate tested boundary. Cancellation stays silent and does not mutate Graph state. This reduces
  the workbench further. Workspace state synchronization, adjusted-annotation application, analysis
  context fingerprinting, and varying-factor selection are also separated. Remaining Statistics
  intent state is now separated as well. Large presentation/data-selection sections are the next
  safe extraction boundaries.
- Spreadsheet implementations still include legacy and canonical surfaces, but their keyboard
  focus, row-major Tab movement, zoom, clipboard parsing, finite numeric parsing, and proportion
  display now use shared primitives. Draft/commit and the remaining cell-editor presentation are
  the next safe commonization boundaries.
- Route-level code splitting remains a performance and maintainability follow-up.
- English localization is covered for the production Public Alpha surfaces. Pre-workspace legacy
  D01-D05 editors use an explicit English compatibility stop rather than a partially translated
  editor; no English native release has been declared ready.
- Beta work includes Graph-preview parity, compact workspace chrome, editable experiment metadata,
  and Kaplan–Meier appearance-control parity while preserving censoring and risk-table semantics.
- Windows native UI regression passes against the current exact packaged executable. Clean-runner
  repetition is desirable, and the implemented macOS Accessibility adapter still needs its first
  permissioned `.app` PASS. Human review remains for scientific usability and visual judgment.

## Working-tree rule

Always run `git status --short` before editing. Preserve unrelated changes. Use small commits and
focused tests first, then expand validation in proportion to risk. Do not access sealed evaluation
pools or historical benchmark contents during ordinary product work.
