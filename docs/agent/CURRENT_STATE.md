# Current Working State

Updated: 2026-09-02 (Public Alpha published; first formal equivalence route implemented)

This is the short operational snapshot. Accepted ADRs, schemas, method references, and tests remain
the authority for durable behavior.

## Product phase

BioFigureStat `0.1.0-alpha.2` is publicly available as a GitHub Pre-release under the MIT License at
`https://github.com/bonnginn/biofigurestat/releases/tag/v0.1.0-alpha.2`.
The repository and release are anonymously accessible. The bilingual release contains:

- Windows 11 x64 installer, SHA-256
  `F7064981BE4A36EB809C6B6C6F18C974E974771BBE001BEB5D37410C3EF85747`;
- Apple Silicon macOS zip, SHA-256
  `4EE4734D57F703845C38EB00BB8A859D1CB54A2C019E7875F5841D5DFA888722`.

The earlier `0.1.0-alpha.1` Pre-release remains available and unchanged with:

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

Formal equivalence support now has its first executable route: one prespecified primary comparison
between two independent groups with a continuous outcome and a raw-difference margin. Protocol
`0.15.0` runs unequal-variance Welch TOST, records both one-sided p values and the corresponding
90% confidence interval, emits the three ADR 0061 conclusions, generates Methods text, and
round-trips the request/result through the existing `.lsa` analysis-run container. Its asymmetric
reference fixture agrees with Statsmodels' unequal-variance TOST and confidence interval.
Matched, shared-run, positive/total, multiple-claim, and specialist routes continue to stop safely;
in particular, the user's positive/total shared-run multi-clone example is not reinterpreted as
independent continuous percentages.

The bounded post-Alpha items 1–4 are now implemented and recorded in
`docs/agent/POST_ALPHA_ITEMS_1_4_COMPLETION_2026-09-01.md`. This includes public alpha.2 guidance
alignment, the macOS quit-guard harness correction, completion of the current Graph/Spreadsheet/
workbench consolidation, and the first prioritized Beta usability batch: compact workspace chrome,
safe experiment-detail revision, canonical worksheet undo/redo, retained control and adjusted
comparison access, Kaplan–Meier font sizing, and adaptive Y-axis title spacing. These source changes
have not replaced the published Alpha binaries.

The next Beta usability batch now includes two completed source-only improvements. Excel workbook
import accepts an explicit A1 range, one to three header rows, and multiple source workbooks while
retaining file provenance; workbook count is never interpreted as statistical `n`. Home also has
one bilingual five-minute guide backed by artificial independent-group data. It opens directly in
the populated Data workspace and guides the user through Graph, Statistics, and Methods without
changing analysis semantics or the `.lsa` schema. These changes are not yet part of a published
binary.

Windows preview validation on 2026-09-02 added three bounded data-entry corrections. Numeric
summary cells retain the entered lexical precision such as `1.00` separately from the canonical
numeric value, move horizontally on the first arrow press, and distinguish direct Enter movement
from a left-to-right row-entry sequence. The simple independent-group entry still opens with four
condition fields but can add conditions up to the general editor's 50-condition UI guard. A
five-condition packaged-app review passed worksheet creation, Graph, Welch ANOVA with Games–Howell,
four control comparisons, and save/reopen. These changes do not alter biological-unit identity,
analysis values, or the project schema.

The five-condition, three-unit-per-condition Games–Howell request now calculates only the ten
upper-triangle comparisons that the product stores, rather than asking SciPy to evaluate diagonal
and symmetric duplicate matrix cells. It also reuses a critical value only where pairwise degrees
of freedom are exactly equal; no rounded or approximate grouping is used. In-process calculation
on the review Windows host fell from about 2.03 seconds to 0.22–0.23 seconds, and warm direct
packaged-engine runs fell from 3.268–3.317 seconds to 1.562–1.654 seconds. A fresh-build cold run
took 9.545 seconds and is recorded separately rather than hidden in the warm comparison. All ten
adjusted p values and simultaneous confidence intervals agree with the former full SciPy matrix to
14 decimal places; the complete 69-test engine suite and 17-case frozen sidecar smoke pass. The
existing per-request timeout and cancel isolation is unchanged, and no approximation was
introduced. Timings remain a machine-specific diagnostic rather than a release guarantee.

Windows candidate `951b3b7-beta.20260902.win-preview10` packages that engine revision and passes
the production UI build, Windows bundle verifier, and release verifier. The saved synthetic Welch
TOST request also passes the frozen-sidecar smoke and an ignored Rust integration test that invokes
the packaged engine through the production process boundary, including pipes, `CREATE_NO_WINDOW`,
timeout supervision, and JSON deserialization. An unrestricted exact-executable native harness run
then passed WebView2 attachment and the real Tauri `run_analysis` command against the same candidate:
protocol `0.15.0`, status `ok`, and conclusion `equivalence_supported` returned through JSON IPC.
The sidecar, Rust packaged-process test, and native harness now read the same request fixture so its
ten observations, margin, and comparison identity cannot drift between boundaries. The full native
scenario, including Open/Export Cancel, Graph-only Statistics handoff, and dirty-close lifecycle,
also passed; evidence is under `.tmp/native-ui-regression/win-preview10-cdp-diagnostics/`. No schema,
margin, comparison identity, or TOST conclusion rule was changed during the investigation.

The import workflow also bundles a constrained bilingual Excel template with separate sheets for
independent groups, paired/repeated observations, Survival, and ordered X/Y data. The in-app recipe
links to that workbook and states that IDs/dates retain provenance but do not prove pairing or
independence, blanks remain missing, and file count is not statistical `n`. The native workbook
reader loads all five sheets, and the production Vite build retains the exact workbook bytes.

An executed Graph analysis can now be exported as one self-contained, read-only collaborator review
HTML. It keeps the serialized Graph, distinct experimental-unit `n` by condition, estimates and
confidence intervals, tests and adjusted p-values, warnings/diagnostics, Methods, displayed-data CSV,
and analysis run identity together. Japanese and English output share the same scientific values and
the export uses the existing native-aware Save boundary. The original `.lsa` remains authoritative
for editing and complete provenance. This source change is not yet part of a published binary.

Institutional deployment review now has one bilingual `IT_DATA_HANDLING_OVERVIEW.md`, linked from the
public README. It distinguishes local research-data processing from consented usage telemetry,
explicit problem reports, and user-opened external links; records storage, permissions, signing,
update, and integrity boundaries; and includes an adoption checklist without claiming certification
or an external security review.

Projects with at least two saved Graphs can now export a simple two-column panel SVG without
recalculating data or statistics. The export adds A/B/... labels, preserves each rendered Graph's
appearance, namespaces internal SVG IDs so gradients do not collide, and records source Graph IDs and
display names in metadata. Panel layout is export-only and does not change the `.lsa` schema. The
serializer, rendered-Graph collection, native-aware save boundary, button state, typecheck, lint, and
production build are covered; final visual judgment remains a Beta manual-review item.

The English-UI residue assertion now inspects current input/textarea values and
`aria-description`, in addition to visible text, labels, titles, placeholders, and alt text. This
closes the class of leak where a generated Japanese default remains only inside an editable field.
All 34 suites that use the assertion pass (347 tests) with English fixtures; researcher-entered
content remains data and is not translated.

The final source gate ran the 193-file / 1,304-test UI suite once. It produced 1,303 passes and one
stale test expectation for the Japanese `概要` tab; the corrected focused workflow passes. Full
workspace typecheck, UI lint, production UI build, the 9-test native-harness self-suite, and the
release bundle verifier pass. The expensive full UI suite was intentionally not repeated after a
one-line locale-only test correction.

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
2026-09-01. macOS candidate `15aabd0-alpha.20260901.mac-refactor2` also passes its application
build, packaged-engine smoke, bundle verifier, release verifier, language persistence, older
Japanese-authored `.lsa` English rendering, Graph-only save/reopen, unsaved-work guard, and native
PNG/SVG Save-dialog checks. Its release bundle contains zero forbidden `benchmark` markers. The
Accessibility harness remains environment-blocked when reading a typed field value back, but the
same product path passed bounded human review. See
`docs/alpha/MACOS_BILINGUAL_REFACTOR_GATE_2026-09-01.md`.
The reviewed application was packaged without rebuilding as
`BioFigureStat-0.1.0-alpha.2-macOS-Apple-Silicon.zip`; archive integrity and the extracted
application's strict code-signature verification pass. The zip is `47,883,673` bytes with SHA-256
`4EE4734D57F703845C38EB00BB8A859D1CB54A2C019E7875F5841D5DFA888722`.
The bilingual `v0.1.0-alpha.2` GitHub release is prepared as a Draft Pre-release. Both reviewed
Windows and macOS assets are uploaded; the macOS GitHub digest matches the local SHA-256. Final
publication remains an explicit user decision and does not replace `v0.1.0-alpha.1`.

Windows candidate `ab5b012-alpha.20260901.win-refactor2` is built from the same application source
tree and passes the production UI build, zero-marker release verification, packaged-engine smoke,
Windows bundle verifier, harness self-test, and the complete exact-executable native scenario. The
host run verified x86_64 IPC, zero unexpected Japanese Home copy, native export bytes, the real
Graph-only Statistics handoff, unsaved-work Cancel retention, and explicit discard exit. Its NSIS
installer SHA-256 is
`F7064981BE4A36EB809C6B6C6F18C974E974771BBE001BEB5D37410C3EF85747`. Restricted-sandbox attempts
could not attach CDP and remain separately recorded as `HARNESS_INFRASTRUCTURE_BLOCKED`; the same
exact executable passed in the host WebView2 environment. See
`docs/alpha/WINDOWS_BILINGUAL_REFACTOR_GATE_2026-09-01.md`.

Post-Alpha native regression automation now has a complete Windows packaged-app PASS. The
dependency-free harness launches the exact Tauri executable with an isolated WebView2 profile and
drives architecture IPC, exact native export, real Graph-only entry and mapping, Statistics
validation visibility/focus, and the dirty-window Close / Cancel / Discard lifecycle while
recording screenshots and JSON evidence. Revision `4041e85-alpha.20260901.win-review3` passed every
step on this host; evidence is under
`.tmp/native-ui-regression/win-review3-clean/`. The transient blank-target startup race remains
classified separately from product regressions. The macOS Accessibility adapter launches and
attaches to the packaged application, but the current managed runner cannot read a typed field
value back. This remains `HARNESS_INFRASTRUCTURE_BLOCKED`; the corresponding macOS product path has
passed manual review. See `docs/alpha/NATIVE_UI_REGRESSION_HARNESS.md`.

The next native increment extends that same exact-process Windows scenario through the real project
Open and SVG Save dialogs. It resolves both direct and modal-descendant windows owned by the spawned
BioFigureStat process and cancels them through their native handles. The extended normal scenario
passes against `707d613-beta.20260902.win-native1`; evidence is under
`.tmp/native-ui-regression/win-native-dialog-stable2/`, and harness self-tests pass 12/12. Absolute
save-target selection plus project Save and command-line `.lsa` reopen are implemented behind the
explicit `--native-file-dialog-save-targets` flag. The adapter uses the standard Alt+N accelerator
and Unicode `SendInput`, avoiding the synchronous provider call blocked by the handle-less Windows
11 filename control. The packaged `951b3b7-beta.20260902.win-preview10` application passes absolute
SVG save, project `.lsa` save, same-executable path reopen, editable-data restoration, and enabled
Graph/Statistics in `.tmp/native-ui-regression/win-preview10-save-targets-alt-n4/`. Installed `.lsa`
double-click remains the next installer-level slice. The same exact-process
gate now also opens and cancels the native PNG and CSV Save dialogs after confirming that all three
Graph export controls are enabled. SVG/PNG/CSV Cancel and the remainder of the lifecycle scenario
pass against the packaged `707d613-beta.20260902.win-native1` application; current JSON evidence is
under `.tmp/native-ui-regression/win-export-cancel-expansion/`.

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
package also has a synthetic Public Alpha v0.2 migration test that verifies unit identities,
measurements, one executed D01 analysis, and its linked Graph through migration and a current-format
save/reopen without reading private research data. Graph inspector controls now have explicit
English no-Japanese assertions for grouping,
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
workspace schema. `ExperimentGraphWorkbench.tsx` is now 1,046 lines, down from 6,922 at the Public
Alpha tag (about 85%). This is architectural concentration reduction, not a claim that the whole
application became smaller: since that tag, `apps/ui/src` production code is net +5,254 lines and
tests are net +5,852 lines because bilingual UI, native automation, compatibility guards,
extracted boundaries, and regression coverage were added. Graph-family production code is net
+2,042 lines while Graph tests are net +4,174 lines. The next consolidation pass must therefore
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

The Graph and Statistics annotation surfaces now consume one shared editor-input projection.
Analysis result, draft, contexts, adjusted family, selected annotation, and persisted annotations
can no longer drift because a new prop was wired to only one of the two surfaces. Graph retains the
selected-comparison action and Statistics remains display-only. The 57 focused tests, typecheck,
and lint pass; this change intentionally improves one-source wiring without changing line count.

A regression-suite audit records 190 test files / 42,125 lines: 98 jsdom UI files (25,595 lines,
623 `render` and 186 `waitFor` calls) and 92 non-UI files (16,530 lines). Exact duplicate test titles
are limited to per-editor English no-Japanese contracts, not broad copied scenarios. The current
pure annotation, layer-description, and numeric-parser tests are retained because they directly
fix semantic contracts at low cost. Rationalization should instead start with the largest
integration suites and apply one direct contract test plus only the route-level integrations needed
to prove wiring, without weakening persistence, migration, biological-unit, pairing, censoring, or
lineage coverage.

After the annotation, layer-description, numeric-parser, and shared annotation-wiring increments,
the full UI suite passes 191 files / 1,303 tests. Only four low-cost pure-function tests were added;
the annotation-surface wiring reuses existing UI integration coverage. UI typecheck, full lint, and
the production build pass. The initial chunk remains 264.32 kB (gzip 81.16 kB) with no build
advisory.

Matched, independent, and expanded Spreadsheet identity cells now share one draft-text lifecycle
component. Dirty text survives unrelated canonical updates, blur commits once, invalid values keep
their accessible error relationship, and row-major keyboard movement remains delegated to the
existing navigation boundary. Stable unit identity, duplicate detection, and canonical observation
updates stay with each scientific surface rather than being generalized into strings. The direct
primitive test and the existing Canonical/Adaptive Spreadsheet suites pass together (56 tests),
with UI typecheck and focused lint passing. This increment removes repeated lifecycle wiring; it
does not change identity semantics or the persisted schema.

Graph Statistics now derives its time-scope notice and execution gate from one presentation
decision. A missing selected time point still stops Statistics safely; a selected point in a
factor-by-time structure shows the limited-scope warning while allowing the existing point-specific
analysis; a non-factorial selected point shows neither warning nor stop. The notice props are no
longer duplicated across two JSX branches, reducing the chance that only one route is updated.
The direct scope test, the 53-test workbench suite, UI typecheck, full lint, and production build
pass. The complete UI suite passes 192 files / 1,305 tests. Existing React `act(...)` warnings in
several older asynchronous suites remain test-quality debt; they are not product failures and
should be removed before deleting contract coverage.

The expanded adaptive scalar editor now uses the same Spreadsheet draft-text component as the
identity editors. Blank/invalid/finite parsing and canonical observation updates remain in the
numeric caller, while dirty retention, blur commit, accessible error rendering, and row-major
keyboard movement come from one lifecycle. The change removes 22 production lines and passes the
existing Adaptive Spreadsheet plus direct primitive suites (29 tests), UI typecheck, and focused
lint. Separately, four locale-sensitive UI suites now settle their locale-store update inside
React `act(...)`; their 40 existing tests pass without the warnings they previously emitted. No
test cases or assertions were removed.

Graph Statistics relationship context is now assembled once from the experiment declaration and
selected readout. Shared-source matched units, same-entity matching, independent nested-source
reconfirmation, and the experiment-first declaration flag can no longer be wired independently at
the panel call site. Existing shared-source, matched, nested, and general workbench coverage passes
with the Statistics orchestration suite (58 tests); no additional test was added because these
integration contracts already exercise the extracted mapping. The workbench is now 1,046 lines.

Canonical matrix numeric cells and expanded nested numeric cells now use the same draft-text
lifecycle as expanded adaptive scalar cells. The shared boundary commits the browser-visible value
at blur even if React has not rendered the last keystroke yet, which preserves the existing
visible-value-equals-canonical-value integrity test. Adaptive and nested compact multiline editors
also share a textarea lifecycle for dirty retention, blur commit, structured paste, keyboard
movement, and accessible errors; numeric parsing, rectangular-paste targets, missingness, unit
identity, and canonical updates remain with their respective callers. The affected 56-, 65-, and
92-test focused groups pass with UI typecheck and focused lint. These extractions add no new test
cases; they reuse the existing behavioral coverage.

After these Graph relationship and Spreadsheet lifecycle increments, the complete UI suite passes
192 files / 1,305 tests. UI typecheck, full lint, and the production build pass; the initial chunk
remains 264.32 kB (gzip 81.16 kB) with no build advisory. Locale-reset warnings in four suites and
post-save warnings in the progressive sparse workflow were removed without deleting assertions.
The remaining React scheduling warnings are isolated to the broad adaptive production-path suite
and the evaluation-only run bar. They are retained as explicit test-harness debt rather than being
silenced globally or used as a reason to remove persistence, lineage, or Statistics coverage.

Graph and Statistics readout selection now use one state transition. Previously the Graph data
editor updated the default Y-axis title while the Statistics analysis-set editor changed the
readout and invalidated the analysis without updating that title. A readout selected from either
route now updates the stable readout ID, resets the Y title from the selected readout, and removes
the stale result/annotation/Methods together. The existing stale-analysis integration test now
changes the readout through the Statistics route, verifies the persisted Y title, and then verifies
that the Graph annotation is gone. The full 53-test workbench suite, UI typecheck, and focused lint
pass. The workbench is 1,044 lines.

Shared-source topology lookup now has one domain-level helper used by the standard workspace,
Statistics analysis-set summary, and Graph Statistics relationship projection. The definition of
“distinct condition-specific experimental units from one shared source” is no longer repeated in
three UI modules. Presentation copy remains surface-specific, while source-unit label, identity
label, and role come from the same typed topology. The existing experimental-unit-count assertion
now also checks the returned source label; 124 focused draft/workspace/Graph tests, UI typecheck,
and focused lint pass.

The Graph Statistics recommendation design, analysis assessment, context fingerprint,
varying-factor projection, and factor-by-time scope decision now form one derived view-model
boundary. `ExperimentGraphWorkbench` composes that boundary instead of rebuilding the Statistics
model locally, and is 993 lines versus 6,922 at the Public Alpha tag. The existing 57 focused Graph
tests passed without adding a move-only regression case. Regression-test retention is now governed
by `docs/agent/REGRESSION_TEST_POLICY.md`: distinct scientific, persistence, route-wiring, and
native contracts remain layered, while duplicated implementation-level assertions should not grow.
After the topology and Statistics view-model changes, the complete UI suite again passes 192 files
/ 1,305 tests in 249 seconds. UI typecheck, full lint, and the production build also pass; the
initial chunk remains 264.32 kB (gzip 81.16 kB) with no build advisory.

Graph and Statistics data-selection changes now pass through one transition boundary. Readout,
display-condition, analysis-condition, source-mode, displayed-time, analysis-time, and derived-time
plan changes update their canonical selection state and invalidate stale analysis together. The
transition retains the existing distinction between Graph display scope and Statistics scope, and
does not infer condition identity or time semantics. The workbench is now 935 lines; its existing
53 integration tests, UI typecheck, and focused lint pass without a new move-only test.

The first regression-suite rationalization replaces repeated heavy App renders for partial
persistence bridges with one pure capability truth table. Save-only and open-only combinations are
still proven to fail closed, while route tests retain the user-visible no-bridge and complete-bridge
paths for Graph-only, Heatmap, Survival, and ordered curves. The complete UI gate now passes 193
files / 1,295 tests in 246 seconds (1,305 tests in 249 seconds before this step); total test work fell
from 244 to 238 seconds. Ten parameterized route cases were removed net, without removing any
scientific-data, save/open-content, or route-family assertion. UI typecheck, full lint, and
production build pass; the initial chunk is 264.45 kB (gzip 81.20 kB) with no build advisory.
The project package migration/round-trip suite also passes 9 files / 66 tests.

Graph type changes and display-preset application now share one presentation-only transition
boundary. Changing Graph type still restores the shape-appropriate layer defaults, and a
multi-condition time-series still restores a visible colorblind legend when line display requires
it; presets retain their existing layer and appearance mapping. Data, condition identities, and
analysis state are not inputs to this boundary. The workbench is 941 lines, versus 6,922 at the
Public Alpha tag. Its existing 57 focused Graph tests, UI typecheck, and focused lint pass without
adding an implementation-move test.

The adaptive expanded-sheet append cell now uses the same draft lifecycle as the other canonical
Spreadsheet cells. A valid blur appends exactly one observation and clears the entry draft;
invalid input and rectangular-paste problems remain visible without discarding the typed value.
Observation construction, identity factories, numeric parsing, and canonical updates remain in
the adaptive sheet. The existing Adaptive Spreadsheet and direct draft-lifecycle suites pass 32
tests; no new test case was needed because the affected contracts were already exercised.

After both increments, the complete UI gate passes 193 files / 1,295 tests in 248 seconds. UI
typecheck, full lint, and the production build pass; the initial chunk remains 264.45 kB (gzip
81.20 kB) with no build advisory.

Graph SVG, PNG, CSV, and clipboard actions now use one user-action controller. It reads the current
SVG and selected Graph scope, delegates native Save-dialog behavior and cancellation to the
existing export controller, and delegates localized success/failure diagnostics to the existing
feedback boundary. CSV composition and visible-series serialization are unchanged. This reduces
the orchestration workbench to 898 lines; the 57 focused Workbench/export tests, UI typecheck, and
focused lint pass.

The remaining X/Y-axis and Statistics inspector ordering now has explicit composition components.
The workspace still owns axes, appearance, analysis selection, recommendation, request execution,
and annotation state; the extracted components only select the appropriate editor and preserve the
existing time-selection → scope notice → Statistics panel → saved-annotation order. This reduces
the workbench to 892 lines. The existing 61 axis and 63 Statistics/Workbench focused tests pass,
with UI typecheck and focused lint passing; no move-only test was added.

Regression verification now has an explicit cost-aware cadence in
`docs/agent/REGRESSION_TEST_POLICY.md`. Full UI runs are reserved for meaningful batches,
high-risk schema/scientific/persistence changes, handoff, and release gates; small extractions use
focused contract and route-wiring tests. A redundant second full run after the export-action move
was stopped when the already-recorded parallel Workspace save-target flaky recurred. The exact
Graph change remains covered by its passing focused suite; the next complete run belongs at the
next batch boundary rather than immediately repeating roughly six minutes of work.

Raw-observation, experiment-unit, uncertainty, connecting-line, and legend inspector composition
now passes through one layer-inspector boundary. Analysis annotation insertion is owned by the
analysis-state hook together with the analysis result and persisted annotations, rather than being
mutated from the outer workbench. These changes preserve the same editor order and annotation
lineage while reducing `ExperimentGraphWorkbench.tsx` to 825 lines, from 6,922 at the Public Alpha
tag. The relevant 70- and 57-test focused groups pass. The completed Graph batch also passes UI
typecheck, full lint, and the production build; the initial chunk remains 264.45 kB (gzip 81.20 kB)
with no build advisory. The expanded Public Alpha migration fixture passes the complete project
package suite (9 files / 66 tests) and project typecheck.

The selected Graph scope now feeds one derived-data projection for series, derived lineage rows,
readout shape, hierarchical/category axis labels, facets, visual-series options, and the final
visible-data gate. The projection composes the existing tested scientific builders; condition,
time, source-mode, nested/raw-point, and lineage semantics are unchanged. This reduces the outer
workbench to 768 lines. The 60 existing Workbench/series/presentation tests, UI typecheck, full
lint, and the production build pass. The initial chunk remains 264.45 kB (gzip 81.20 kB) with no
build advisory; no move-only test was added.

General, categorical-composition, and correlation SVG renderers now derive their drawable plot
rectangle from one margin-to-bounds helper. Axis endpoints, tick anchors, plot width/height, labels,
and legend anchors therefore use the same left/top/right/bottom contract instead of recomputing
`canvas - margins` locally. Kaplan–Meier remains separate because its risk-table rows extend the
canvas with different semantics. The helper has a direct exact-bounds test, and the 62 focused
layout/renderer/Workbench tests, UI typecheck, and focused lint pass.

The synthetic Public Alpha v0.2 migration coverage now includes the canonical Survival and ordered
X/Y shapes in addition to the ordinary analyzed D01 project. Opening the legacy package and saving
it again with the current writer preserves Survival event versus censor status and ordered-point
unit, series, X, and Y identity. The package construction used by these fixtures is shared so new
legacy shapes do not duplicate manifest/checksum plumbing. The complete project package suite
passes 9 files / 71 tests together with project typecheck; no production schema or migration logic
changed.

Specialist parse failures now use the same locale-safe error boundary as project and Graph export
failures. Invalid Survival and Heatmap data no longer expose legacy Japanese exception text in the
English UI, and the Survival 0/1 mapping gate uses retained internal evidence rather than matching
the translated display message. The 31-test specialist page suite, UI typecheck, and focused lint
pass; scientific validation and stored data are unchanged.

Numerical warning propagation is now audited end to end. Every executable engine module starts
from the shared result envelope, the analysis contract requires a warning array, and the current
Statistics panels, deterministic Methods text, and collaborator review-set export consume that
array. The Public Alpha migration fixture now also proves that warning code and message survive
legacy open and current save/reopen. This adds persistence evidence without adding another heavy UI
route test.

The ordinary current-data Graph preview now exposes the same minimum axis context expected from a
finished Graph: a shared plot rectangle, nice-number Y ticks, tick labels, and X/Y titles with the
shared adaptive Y-title spacing rule. The preview's scientific layers, domains, values, and graph
selection are unchanged. A direct coordinate regression proves the title remains left of the
plot. Scatter preview points also receive bounded domain padding instead of landing on the axes,
with shared nice ticks and adaptive Y-title spacing on both numeric axes. The four focused preview
tests, UI typecheck, and focused lint pass. Composition previews now also retain a 0–100% axis,
condition labels, category legend, and sufficient canvas width for all ten configured conditions;
wide designs scroll rather than clip the last conditions or legend. Five focused preview tests,
UI typecheck, focused lint, and the production build pass. The initial chunk remains bounded at
265.53 kB (gzip 81.50 kB) with no build advisory. Final visual judgment remains a human Beta review
item.

The ordinary, scatter, and categorical Graph-creation previews now consume that same rectangle
contract for axis endpoints, point scaling, bar baselines, and label anchors. Existing preview
dimensions and data domains are unchanged; future margin changes no longer require several
independent coordinate edits in one preview. The focused preview/layout group passes 9 tests with
UI typecheck and focused lint.

The nonlinear-fit/observed-X/Y renderer also uses the shared plot rectangle for scaling, axes,
ticks, legend anchors, and the X-title center. Its authoritative fitted curves and raw XY points
are unchanged. The focused nonlinear/layout group passes 11 tests with UI typecheck and lint.

The legacy Results dot/grouped and correlation renderers now use the same plot rectangle too.
Their biological-unit points, pairing lines, factor-level grouping, error bars, and correlation
pairs are unchanged. The focused Results/layout group passes 13 tests with UI typecheck and lint.

The general SVG renderer now uses its derived plot rectangle consistently for value scaling,
category and continuous positions, axes and hit targets, ticks, reference lines, annotations,
legends, hierarchy labels, and axis-title centers. Only the pre-plot margin-sizing calculation
remains local. The 60 focused layout/Workbench tests pass with UI typecheck and lint.
The completed plot-boundary batch also passes full UI lint and the production build; the initial
chunk remains 264.45 kB (gzip 81.19 kB) with no build advisory.

Clipboard and SVG/PNG/CSV action feedback now lives with the existing user-action controller hook;
the outer workbench retains only benchmark-capture status. Native Save-dialog cancellation and
localized export diagnostics are unchanged. The existing 53 Workbench and 4 export-feedback tests
pass with UI typecheck, lint, and the production build. The workbench is now 758 lines; the initial
chunk remains 264.45 kB (gzip 81.19 kB) with no build advisory.

The remaining development-evaluation finalization composition now sits behind one Graph controller.
Production builds replace that controller and its event runtime with neutral no-op modules, so
development-only artifact capture, labels, and module names are absent rather than merely hidden
behind a false UI condition. This reduces the workbench to 720 lines. The focused Workbench,
toolbar, and Vite configuration group passes 59 tests with UI typecheck and focused lint. The
production build retains the 264.45 kB initial chunk, and the release verifier finds zero forbidden
`benchmark` markers in the generated bundle.

## Known bounded gaps

Adaptive independent worksheets now retain sparse row identity: entering row 3 before rows 1 and
2 no longer compacts the value upward. Canonical observations may carry an optional explicit
experiment-session link, and the worksheet exposes the session date for independent as well as
matched structures. Save/reopen, Graph, and Statistics use the same linked canonical rows. The
link is provenance only and never infers pairing from a shared run label or date. Legacy Public
Alpha `.lsa` observations without the field retain their dense-order fallback until edited. ADR
0060 records this boundary. Focused worksheet, workspace, project round-trip, domain-schema, and
Graph/Statistics production-path tests cover the change.

Equivalence / “no meaningful difference” is represented as a separate saved scientific goal, not
as an ordinary contrast or engine method. A Graph can now store a prespecified finite lower/upper
margin, its scale/unit and rationale, alpha 0.05, and the intended claim across comparisons. The
pure interval contract reports `equivalence_supported`, `meaningful_difference_supported`, or
`inconclusive` from the corresponding equal-tail 90% confidence interval. The Statistics UI still
safe-stops before engine execution, never derives a margin from observed data, and warns that a
non-significant difference test does not establish equivalence. Public Alpha `.lsa` files remain
valid because the plan is optional. ADR 0061 fixes the primary-source rationale and the executable
support boundary: continuous independent and paired routes await method review; shared-run and
typed positive/total routes cannot be coerced into naive continuous percentage TOST. Focused
contract, UI, state-selector, and project-schema tests cover validation, goal transitions, engine
non-execution, bilingual plan entry, stale-result clearing, and save/reopen compatibility.
Multiple-comparison planning can record all-selected, separate-claim, or one explicitly selected
primary-comparison intent without guessing a correction. The optional result envelope rejects a
TOST p-value that is not the larger one-sided p-value, a conclusion that disagrees with the 90% CI
and bounds, duplicate comparison IDs, or a primary result that does not match the prespecified ID.
An interval-centered result component is ready to display estimate, CI, margin, both one-sided
tests, and the three-state conclusion once a reviewed engine route is enabled. No equivalence
engine route is enabled by these foundation changes.

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
  presentation state, data-selection state, analysis/annotation state, display-preset/type
  transitions, active
  layer descriptions, active scope, and persisted-snapshot projection are also separated.
  Axis, Statistics, and layer inspector composition are now separate as well, annotation insertion
  is colocated with the analysis-state boundary, and development-evaluation finalization is behind
  a controller that is replaced in production. Remaining work should follow a concrete product
  responsibility rather than further file-count reduction.
- Spreadsheet implementations still include legacy and canonical surfaces, but their keyboard
  focus, row-major Tab movement, zoom, clipboard parsing, finite numeric parsing, proportion
  display, and ID/scalar/append-value draft synchronization now use shared primitives. Remaining
  input controls were audited after this consolidation. Their remaining commit rules are specific
  to dates, proportions, loading-control ratios, missingness, identity conflicts, or nested
  structure; they should not be forced through one generic string commit boundary. Further
  commonization should follow a concrete duplicated behavior, not file-count reduction.
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
