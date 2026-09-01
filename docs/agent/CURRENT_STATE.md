# Current Working State

Updated: 2026-09-01 (Public Alpha published; post-Alpha hardening in progress)

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

For the English-localization branch, the full UI suite passes with 162 files and 1,200 tests.
English no-Japanese assertions inspect visible text plus accessible labels, titles, placeholders,
and image alternative text across the production surfaces. Typecheck, lint, and the production UI
build pass. Windows candidate `4041e85-alpha.20260901.win-review3` passes the Windows bundle verifier,
release bundle verifier, packaged-engine smoke checks, and the exact-executable native UI scenario.
Its installer SHA-256 is
`4382BA7A7534D74270C7E362320CBF2102AC9AAE64B13FEB3CB6310BA01FE8E2`. Windows human language/layout,
language switching, Graph-only save/reopen, and user-title preservation checks passed on
2026-09-01. The macOS native candidate remains outstanding.

Post-Alpha native regression automation now has a complete Windows packaged-app PASS. The
dependency-free harness launches the exact Tauri executable with an isolated WebView2 profile and
drives architecture IPC, exact native export, real Graph-only entry and mapping, Statistics
validation visibility/focus, and the dirty-window Close / Cancel / Discard lifecycle while
recording screenshots and JSON evidence. Revision `4041e85-alpha.20260901.win-review3` passed every
step on this host; evidence is under
`.tmp/native-ui-regression/win-review3-clean/`. The transient blank-target startup race remains
classified separately from product regressions. The macOS Accessibility adapter is implemented,
but a permissioned Mac run is still required before the gate is cross-platform. See
`docs/alpha/NATIVE_UI_REGRESSION_HARNESS.md`.

Windows human review found that a Graph-only project whose sample-ID column had been explicitly
accepted as one series per row reopened with its table intact but its Graph and Statistics tabs
disabled. The saved `.lsa` still contained the mapping and active Graph. Revision `a6a186f`
restores that explicit saved-Graph acceptance, keeps Save and Save As visible in the workspace
header, and uses an English default title in English mode. The exact user-shaped save/reopen
regression now passes without changing the schema or stored measurements. Revision `4041e85`
also localizes legacy app-generated default titles to the active UI language while preserving
arbitrary user-authored titles.

The post-review localization pass now reconstructs legacy matched-analysis diagnostics from
language-independent counts at render time. In English mode, an older Japanese-authored `.lsa`
therefore shows English Analysis-set, incomplete-pair, save, analysis, and validation messages
without rewriting the file or translating researcher-authored project, condition, readout, or
axis labels. The generic new-measurement form, specialist Survival/Heatmap/ordered-X/Y status and
save paths, exit-guard actions, adaptive structure input, and the Biological Interview safe-stop
also stay in the selected application language even when an internal exception originated with
Japanese detail. The full UI suite passes with 162 files and 1,213 tests; UI typecheck, lint, and
the production build pass. A new native candidate has not yet been built from this revision, and
no additional human Mac interaction is required until that candidate exists.

The next source-only Graph refactor extracts presentation projection and data-summary rendering
from `ExperimentGraphWorkbench`. Pure tested projection now owns factor-derived X-axis labels,
facet row/label alignment, legend-series deduplication, and visible-layer data readiness without
changing condition identity or canonical values. Proportion, hierarchical, WB-ratio, and
categorical data summaries now use one tested component boundary; it preserves experimental-unit
and raw-child counts while removing fixed Japanese copy from English WB/categorical summaries.
The workbench is now 2,614 lines. The full UI suite passes with 164 files and 1,222 tests; UI
typecheck, full lint, and the production build pass. The build retains the existing large-chunk
warning, so route-level code splitting remains separate future work.

The following source-only increment further reduces `ExperimentGraphWorkbench` from 2,614 to
1,888 lines. Grouping, data selection and derived-lineage guidance, experimental-unit summaries,
per-series styles, and violin/box distribution controls now have focused component boundaries.
Their tests preserve condition and series identities, nested box compatibility layers, appearance
state, and the distinction between displayed and canonical data. Spreadsheet ID/value editors now
share one draft/commit hook, including external canonical-value synchronization. The project
package also has a synthetic Public Alpha v0.2 migration test that verifies unit identities and
measurements through migration and a current-format save/reopen without reading private research
data. Graph inspector controls now have explicit English no-Japanese assertions for grouping,
selection, series, distributions, raw points, error bars, connecting lines, legends, appearance,
X/Y axes, and saved-result annotations. The current full UI suite passes with 169 files and 1,245
tests; UI typecheck, full lint, production build, and the project package's 66 tests pass. The
production build retains the existing large-chunk warning.

The Graph workbench is now loaded only when a workspace enters Graph editing. Both the general
experiment workspace and Graph-only workflow use the same localized Suspense boundary, while
their Data and Statistics entry paths no longer load the workbench eagerly. The production build
reduces the initial JavaScript chunk from about 1.77 MB to 1.02 MB (about 42%) and emits the
workbench as a separate 185.62 kB chunk. The full UI suite remains at 169 files and 1,245 passing
tests; UI typecheck, full lint, and the production build pass. The shared graph-layout dependency
is still a 569.34 kB chunk and is the next bounded bundle-analysis target.

Common-coverage analyses and specialist Survival/Heatmap workspaces are now also loaded at their
route boundaries. The initial JavaScript chunk is 812.86 kB (gzip 223.03 kB), down about 54% from
the pre-splitting 1.77 MB build. Common coverage is 110.94 kB, specialist core is 78.00 kB, the
Graph workbench is 185.61 kB, and the remaining shared graph-layout chunk is 392.98 kB. App route
tests (82), the full UI suite (169 files / 1,245 tests), typecheck, lint, and production build pass.
Further eager-page splitting was investigated but deferred because New Experiment and project-open
tests currently rely on synchronous route rendering; changing that contract is not required for
the current performance gain.

Spreadsheet draft/commit synchronization now also covers the standard experiment numeric editor
and both compact and expanded nested-measurement editors. These surfaces share the same canonical
value synchronization, dirty-text preservation, validation retention, blur commit, and paste reset
boundary already used by the adaptive and canonical spreadsheets. Decimal intermediate text,
invalid nested values, unequal condition lists, rectangular paste, and expanded child identity
remain covered. The full UI suite remains 169 files / 1,245 passing tests, with typecheck, lint, and
production build passing.

The Graph Statistics orchestration pass extracts the time-analysis editor, factor-by-time scope
notice, and analysis-set editor, and reuses the annotation editor in a display-only variant for
the Statistics workspace. The workbench is now 1,599 lines. Time-point identity, analysis windows,
baseline selection, readout and condition IDs, statistical-unit interpretation, and the existing
safe stop before an unsupported full factor-by-time model remain explicit. Each extracted surface
has an English no-Japanese regression. The full UI suite now passes 172 files and 1,253 tests;
typecheck, lint, and production build pass.

The next canvas/inspector pass extracts the Graph title/export/view-size toolbar, the semantic
canvas caption, the inspector target plus visible-layer shortcuts, the composed data-selection
editor, and renderer selection/composition. Clipboard and SVG/PNG/CSV
actions remain delegated to the existing controllers. The extracted caption has direct regression
coverage for unresolved descriptive rows, shared-source matching versus condition-specific
experimental units, and the rule that showing Cell/ROI observations does not change statistical
`n`. Inspector tests preserve immutable layer updates and English localization. Renderer selection
is a pure tested decision among composition, correlation, and general Graphs, while stable readout,
condition, and time-point IDs remain callback inputs to the parent state owner. The workbench is
now 1,137 lines, down from about 4,900 before the staged split. Presentation-only state and Graph
data-selection state now also use separately tested hooks. The latter preserves the distinction
between displayed conditions and the Statistics analysis set, keeps auxiliary reference conditions
visible without silently adding them to analysis, and retains stable condition/readout identities.
Analysis/result/annotation state is now another tested hook: restored saved annotations are not
replaced for the same request, while a newly completed analysis receives its adjusted comparison
annotations once. Display presets and the active-layer description are pure tested functions; raw
mode retains current appearance, and cross-sectional samples are not described as individual
trajectories. The latest full UI run passed 1,279 of 1,280 tests across 182 files. One Survival
save test missed its post-save message under the parallel full run and passed immediately in exact
focused isolation, so it is recorded as a test-timing flaky rather than a product regression.
Typecheck, lint, and production build pass. The initial production chunk is 814.29 kB (gzip
223.48 kB), with the existing large-chunk warning.

Project open/save error presentation is now locale-aware at the shared boundary. English mode
localizes schema compatibility failures and replaces Japanese internal exception text with a safe
English action-specific fallback; the same boundary now protects Graph-only and legacy Data Sheet
save/analysis failures. It does not rewrite project contents or researcher-authored labels. Focused
project-action, App, open/save, workspace, and locale tests pass.

The persisted Graph snapshot and active-scope projections are now separately tested boundaries.
They preserve stable readout/condition/time identities, keep the displayed set distinct from the
Statistics analysis set, copy selection arrays before emission, and retain the exact public
workspace schema. `ExperimentGraphWorkbench.tsx` is 1,114 lines, down from 6,922 at the Public
Alpha tag (about 84%). This is architectural concentration reduction, not a claim that the whole
application became smaller: since that tag, `apps/ui/src` production code is net +5,161 lines and
tests are net +5,680 lines because bilingual UI, native automation, compatibility guards,
extracted boundaries, and regression coverage were added. Graph-family production code is net
+1,995 lines while Graph tests are net +4,066 lines. The next consolidation pass must therefore
look for overlap among the extracted boundaries instead of judging progress only by the workbench
file size.

Specialist and standard Graph export/copy feedback now respects the active locale and never
exposes a legacy Japanese exception in English mode. The formerly timing-sensitive Survival save
test now awaits its asynchronous success feedback and passes repeatedly in isolation and in the
full run. Focused export, locale, Workbench, snapshot, and Survival tests pass. The combined full UI
suite passes 188 files / 1,296 tests; UI typecheck, full lint, and production build pass. The initial
production chunk is 813.08 kB (gzip 224.08 kB), the Graph workbench chunk is 199.78 kB, and the
existing greater-than-500-kB advisory remains.

The legacy two-condition and multi-condition Data Sheets now share their workflow-tab model and
roving keyboard UI, analysis-result holder, numeric-observation projection, collision-safe token
factory, project metadata form, localized save panel, and localized progress/status labels. These are presentation/orchestration concerns with identical
meaning on both surfaces; relationship-specific row layout, experimental-unit wording, pairing,
and validation remain owned by each sheet. Across the six focused Spreadsheet consolidation
commits, production code is net -27 lines while 226 direct regression-test lines were added.
DataSheet/MultiCondition focused tests, typecheck, and lint pass. Spreadsheet Undo/Redo remains an
explicit Beta item because it must coordinate canonical values, Graph invalidation, dirty state,
and persistence rather than only reverting visible text.

Graph analysis readiness is now memoized behind its own semantic-input boundary. Graph-type labels
are defined once and reused by both the creation dialog and appearance inspector, and active-layer
descriptions now follow the selected application language without changing layer identity or SVG
content semantics. Workbench, creation-dialog, appearance-editor, label, and assessment focused
tests pass together with typecheck and lint.

The application now defers `ExperimentWorkspace`, Graph-only input, the whole new-experiment entry,
and project open/rehydration until each boundary is needed. The initial JavaScript chunk is now
264.32 kB (gzip 81.16 kB), about 85% below the original 1.77 MB baseline. New Experiment, Workspace,
Graph-only, and Open Project are separate 148.63 kB, 195.72 kB, 38.53 kB, and 117.39 kB chunks.
Splitting Open Project also restores the intended specialist chunk boundary and removes the final
build advisory. Asynchronous route focus, global save, raw-table handoff, dirty-exit, favorite-
design, existing-table import, multi-project tab, and specialized reopen contracts remain covered.
The full UI suite passes 190 files / 1,299 tests; the 82 App/open integration tests, UI typecheck,
focused lint, and the production build pass. This is a loading and dependency-boundary improvement,
not a reduction in the application's total source lines.

Selected-comparison annotation creation is now a pure tested boundary shared with automatic
adjusted-comparison annotation lineage. Pairwise endpoints, adjusted/unadjusted status, hidden-to-
symbol normalization, selected-time-point identity, and derived AUC/window lineage are fixed by
direct tests rather than being assembled inside the React workbench. This removes a duplicated
lineage path and reduces `ExperimentGraphWorkbench.tsx` to 1,086 lines. The relevant 55 Graph tests,
the full UI suite (191 files / 1,301 tests), UI typecheck, focused lint, and the production build
pass. The purpose is single-source behavior and cheaper regression testing; file size reduction is
only a secondary indicator.

Unresolved descriptive Graph captions now receive semantic readiness as a typed input to the
shared layer-description function. They no longer depend on post-processing localized sentences
with `replaceAll`, and equivalent unresolved raw/summary labels are emitted once instead of as
duplicate “Table rows” / “元表の行” layers. Internal layer state and resolved experiment-unit
wording are unchanged. The workbench is 1,075 lines; 58 focused tests, typecheck, and lint pass.

Optional numeric cells now use one discriminated parser that distinguishes blank, invalid, and
finite values. The standard experiment workspace, canonical matrix, adaptive compact/expanded
sheet, and nested compact/expanded sheet no longer maintain separate trim/`Number`/finite checks.
Their existing empty-as-missing behavior, invalid-text retention, rectangular-paste atomicity,
unit identities, and canonical observations are preserved. The 122 focused spreadsheet/workspace
tests, typecheck, and lint pass.

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
  intent state is now separated as well. Factor/facet/legend/readiness presentation projection and
  localized data summaries, grouping, data selection, series presentation, and distribution
  controls are now separate tested boundaries. Time-analysis selection, factor-by-time scope,
  analysis-set selection, Statistics annotation display, canvas toolbar/export controls, semantic
  captions, inspector target/layer shortcuts, data-editor composition, renderer selection,
  presentation state, data-selection state, analysis/annotation state, display presets, active
  layer descriptions, active scope, and persisted-snapshot projection are also separated.
  Remaining analysis-assessment/view-model orchestration is the next safe extraction boundary.
- Spreadsheet implementations still include legacy and canonical surfaces, but their keyboard
  focus, row-major Tab movement, zoom, clipboard parsing, finite numeric parsing, proportion
  display, and ID/scalar draft synchronization now use shared primitives. Remaining specialized
  cell-editor presentation is the next safe commonization boundary.
- Route-level code splitting now defers the Graph workbench from Data and Statistics entry paths.
  The remaining large initial and shared graph-layout chunks require bounded dependency analysis;
  further splitting must preserve renderer and export parity.
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
