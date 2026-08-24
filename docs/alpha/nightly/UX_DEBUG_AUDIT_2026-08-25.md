# Automated UX / Debug Audit — Alpha Consolidation

Date: 2026-08-25  
Track: B  
Scope: Web Home, New Experiment, design/data setup, Statistics, Results, Graph editor, save/open/export  
Product files changed by Track B: none

## Executive result

The core Web workflow is understandable and broadly readable at ordinary and wide desktop widths. Home preserves the four-route contract, New Experiment remains experiment-first, graph creation explains unavailable graph families, and the graph editor stacks its canvas and inspector at narrow width without losing controls.

No baseline P0 usability blocker was found in Home, New Experiment, or the ordinary Graph editor. Two clear Alpha-quality responsive defects remain: the Statistics workspace keeps an internal two-column layout at narrow width, and the sticky project command bar becomes intrusive below the supported narrow-desktop review width. A separate P0 blank-screen regression appeared in the concurrent Track A working tree while this audit was running; it is recorded separately because it was not present in the initial captured baseline.

## Method and evidence

The audit used the running Web application, deterministic built-in synthetic demos, and the pinned local evaluation engine. It did not open Pool D, any benchmark workbook, or start Round 4/full-495 execution.

Three effective viewport bands were used:

- narrow: 545 px for entry/data captures and 720 px for graph/statistics captures;
- ordinary: 1,091–1,440 px;
- wide: 1,515–2,000 px.

For each screen, full-page or viewport PNG evidence and a JSON overflow scan were saved under `docs/alpha/nightly/screenshots/ux_debug_audit_2026-08-25/`. The overflow scan flags content exceeding its client box; SVG text and intentionally clipped accessible labels were manually excluded from defect classification.

## Coverage summary

| Surface | Narrow | Ordinary | Wide | Result |
| --- | --- | --- | --- | --- |
| Home | captured | captured | captured | four routes readable; no actionable clipping |
| New Experiment | captured | captured | captured | long but coherent; no actionable clipping |
| Design setup | traversed measurement → axis → conditions → experiments → confirmation | traversed | traversed | structure understandable; wording density noted |
| Data / Overview | captured | captured | captured | hierarchy readable; narrow sticky command bar issue below |
| Graph creation | captured | captured | captured | unavailable types explained; no actionable clipping |
| Graph editor | captured | captured | captured | canvas/inspector stack works at 720 px |
| Statistics setup | captured | captured | captured | narrow two-column density/overflow defect |
| Results | captured | captured | captured | hierarchy improved; narrow layout defect persists |
| Open project | captured | captured | captured | browser limitation produces explicit non-destructive alert |
| Save | inspected | inspected | inspected | disabled in browser preview and explained globally |
| Export | controls inspected/captured | controls inspected/captured | controls inspected/captured | execution recheck required after concurrent P0 fix |

## P0 — usability blockers

### B-P0-01 — Concurrent Graph change could blank the entire application

Status: **detected and reported during concurrent work; renderer default was added and the browser flow rendered again before this handoff**

During the audit, a hot update to the concurrent Track A implementation caused an existing Simple 3-group graph to render a blank page. The runtime error was:

`TypeError: Cannot read properties of undefined (reading 'length')`

The failure occurred in `ExperimentGraphSvg` while reading `statisticsAnnotations.length` from a graph state created before the new multiple-annotation field existed. This is consistent with a backward-compatibility/defaulting gap rather than invalid user data.

Evidence and repair target:

- `apps/ui/src/components/graph/ExperimentGraphWorkbench.tsx`, observed near line 688 during the concurrent edit;
- initialize/migrate an absent annotations collection to `[]` at the graph-spec/project boundary and retain a renderer-side fail-safe;
- add a regression test that opens a pre-series/pre-multiple-annotation graph state and renders it without an error boundary fallback;
- rerun save/open and graph artifact generation after the fix.

This finding is separated from the initial UX captures because the initial Home, data, graph, and Statistics screens rendered normally before the concurrent change. After `statisticsAnnotations = []` was added at the renderer boundary, a fresh Simple 3-group graph again opened successfully and exposed Copy/SVG/CSV controls. The consolidation owner should still retain a persisted-old-state regression test so the fix is not only renderer-local.

## P1 — clear Alpha-quality defects

### B-P1-01 — Statistics remained a dense two-column workspace at 720 px

Status: **fixed during consolidation and browser-verified**

The general Graph workbench changes to one column below 960 px, but the Statistics-specific inspector retains:

`grid-template-columns: minmax(250px, 0.42fr) minmax(420px, 1fr)`

At 720 px this produces a 13–25 px internal width mismatch and, more importantly, forces the analysis-target column beside a long recommendation/results column. The content remains technically readable but has commercial-software-level density, narrow wrapping, and long vertical scanning within each column.

Evidence:

- `statistics_setup_narrow.png` and `.json`;
- `statistics_results_narrow.png` and `.json`;
- ordinary and wide counterparts show that the two-column layout is useful when space is available.

Implemented generic fix:

- `apps/ui/src/components/graph/graph-workbench.css`;
- below the existing 960 px media / 900 px container thresholds, `.experiment-graph-workbench--statistics .experiment-graph-inspector` now uses one column;
- return `.experiment-statistics-source` and all other direct children to `grid-column: 1`, with normal row flow and a bottom rather than right divider;
- browser recheck at 720 px shows the analysis target followed by the recommendation in normal document flow, without the former internal width mismatch (`statistics_setup_narrow_fixed.png` and `.json`).

### B-P1-02 — Sticky project command bar was intrusive at very narrow desktop widths

Status: **fixed during consolidation and browser-verified**

At an effective width of 545 px, the project command bar remains sticky, keeps every command visible, wraps labels, and occupies a substantial horizontal strip over scrolling content. Full-page capture also shows repeated sticky-bar capture artifacts, while viewport review confirms that the bar remains in front of the Overview content during scrolling.

Evidence:

- `data_overview_narrow.png` and `.json`;
- the 1,091 px and 1,515 px captures are unaffected.

Implemented generic fix:

- `apps/ui/src/pages/ExperimentWorkspace.css`;
- the narrow `.experiment-workspace-project-nav` now uses non-overlapping horizontal scrolling with non-wrapping command items;
- avoid changing navigation semantics or hiding Save state;
- the first recheck exposed a vertically wrapped `ファイル` summary; adding `flex: 0 0 auto` / `white-space: nowrap` to the file-menu summary closed that residual issue;
- the final 545 px evidence (`workspace_nav_very_narrow_fixed_final.png` and `.json`) shows a compact single-row command bar with explicit horizontal scrolling and no content overlay.

## P2 — polish and comprehension

### B-P2-01 — Japanese/English terminology is inconsistent in app-generated copy

The following are app-generated rather than researcher-provided labels and should be normalized in a later copy pass:

- `Phase A`, `Phase B`, `Help`, `preview`;
- `Dot`, `Box`, `Violin`, `Line / Time course` without a Japanese explanation in the primary label;
- `Experiment summaries + Mean ± SD` and `welch_t` in user-facing status text;
- mixed examples such as `Cell・ROI` and `tracking` where Japanese equivalents can be supplied without changing scientific meaning.

Researcher-entered measurement names, condition names, and established statistical method names should not be forcibly translated.

Likely paths:

- `apps/ui/src/pages/NewExperimentPage.tsx`;
- `apps/ui/src/pages/ExperimentWorkspace.tsx`;
- `apps/ui/src/components/graph/ExperimentGraphWorkbench.tsx`;
- `apps/ui/src/components/AppShell.tsx` (`Help`).

### B-P2-02 — Design confirmation contains defensive text beyond the immediate decision

The condition-layout explanation states both that equal top-level values are grouped and that each card remains statistically separate. This is scientifically safe, but on a simple two-condition design it adds substantial explanation before the user can start data entry. Progressive disclosure or a concise primary sentence with details behind disclosure would improve pace without removing the safeguard.

Likely path: `apps/ui/src/pages/NewExperimentPage.tsx` and `ConditionTimePreview` presentation.

### B-P2-03 — Browser preview advertises disabled capability before explaining it locally

The global preview banner correctly says save/open and local analysis are disabled. The Open route still presents an enabled `プロジェクトファイルを選ぶ` button; clicking it safely produces an explicit alert and does not alter the workspace. This is not a blocker, but a local note beside the button would reduce a predictable dead-end.

Evidence: `open_project_narrow/ordinary/wide.png` and `.json`.

Likely path: `apps/ui/src/pages/OpenProjectPage.tsx`.

### B-P2-04 — Narrow top-bar text uses visually clipped spans

At widths below 680 px, the Home and New Experiment text spans are reduced to 1×1 px using the legacy clip pattern. The controls retain accessible names and no user-visible overflow occurs, so this is not a functional failure. Replace with the project's standard visually-hidden utility when the broader responsive/copy sweep is performed.

Evidence: narrow Home/New/data JSON scans flag only `.topbar-nav__label`; screenshots show icon-only controls as intended.

Likely path: `apps/ui/src/styles.css`.

## Later

- Beginner/Expert modes or a major navigation philosophy change.
- Excel-like raw staging sheet or a large data-entry redesign.
- Native-specific command-bar and dialog redesign; requires Windows/macOS smoke rather than Web-only inference.
- Broad replacement of English scientific terminology where the researcher or publication supplies the term.

## Positive findings

- Home contains exactly Favorites, New Experiment, Recent, and Open, with no clipped cards across audited widths.
- New Experiment starts from experimental context rather than test names and clearly separates ordinary workflows from specialist routes.
- The design wizard asks concrete operational questions for independent versus repeated units rather than asking `paired/unpaired` without context.
- Disabled paired/scatter graph types include visible reasons, avoiding controls that silently imply support.
- Graph creation preview and final editor use the same selected dataset and graph family in the audited Simple 3-group flow.
- The Graph editor becomes a single-column canvas/inspector layout at 720 px and remains readable.
- Statistics results put biological `n`, the estimate/CI, and the main test ahead of diagnostics and reproducibility disclosures.
- The Open action fails safely in browser preview and explicitly states that the current workspace was not changed.
- No typography below 12 px was found by the automated scan.

## Save/open/export assessment

Browser preview is intentionally not a substitute for native persistence smoke:

- Save is disabled and the top banner explains the limitation.
- Open produces a local, non-destructive explanatory alert in preview.
- Copy/SVG/CSV controls are visible and grouped next to the graph preview.
- After the renderer default was added, a fresh graph rendered and Copy/SVG/CSV were enabled. The browser controller did not observe the app-generated SVG download as a standard download event, so this report does not substitute that observation for the existing export regression tests.

Native save/open and file-dialog ergonomics remain part of the planned Windows/macOS smoke phase. Existing automated persistence/export regression tests should still be run by the consolidation owner.

## Validation at Track B handoff

- Browser: Home, New Experiment, design confirmation, data Overview, graph creation, Graph editor, Statistics setup, Statistics results, and Open were captured across three viewport bands.
- Browser: the P0 blank screen no longer reproduced after the default-array fix.
- Browser: Statistics one-column behavior was verified at 720 px.
- Browser: project command-bar scrolling/non-wrapping was verified at 545 px.
- UI suite during concurrent Track A implementation: 54 files ran; 52 passed, with 380/388 tests passing. The eight failures were confined to the actively changing Graph contract (seven `ExperimentGraphWorkbench` expectations and one matched-trajectory `ExperimentWorkspace` expectation). Track B did not change those product files or their expectations. The consolidation owner was given the exact failure clusters for scientific-contract review rather than mechanically updating assertions.
- Documentation: `git diff --check` passed for the Track B report/evidence index.

## Recommended integration order

1. Retain backward-compatible graph-state rendering coverage for B-P0-01.
2. Resolve the eight actively changing Graph-contract test failures by checking product semantics first.
3. Rerun Graph, Statistics, Results, and export at 720/1,440/2,000 px after Track A stabilizes.
4. Treat copy normalization and design-confirmation shortening as a bounded P2 pass.

## Evidence index

See `docs/alpha/nightly/screenshots/ux_debug_audit_2026-08-25/README.md` for the file inventory and interpretation notes.
