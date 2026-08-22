# Development Status

Updated: 2026-08-23

## Current milestone: statistical choice + AI benchmark evaluation

The shared repository is now prepared for a temporary Windows benchmark-driven development loop.
The migration is not complete until the Windows numerical checks and five visible Browser Use
pilots have actually passed. See `docs/WINDOWS_COMPATIBILITY_AUDIT_2026-08-23.md` and
`docs/WINDOWS_BENCHMARK_DEVELOPMENT_SETUP.md`.

- The statistical validation policy is now tiered. Standard package-backed methods use Tier A;
  complex models remain Tier B. R was not added.
- The executable Core now includes Welch and Student independent t-tests, Mann–Whitney U, paired
  t-test, Wilcoxon signed-rank, Welch ANOVA/Games–Howell, conventional one-way ANOVA/Tukey,
  conventional one-way ANOVA/Dunnett, Kruskal–Wallis omnibus, Pearson, Spearman, the existing
  repeated-measures method and existing Type III two-factor method.
- Statistics presents Recommended, Alternatives and Advanced. The executed request stores the
  selected method; persisted provenance separately retains the recommendation and whether the
  researcher selected something else.
- Multi-group contrast intent is explicit: all pairs, control versus many, selected planned
  condition pairs, or omnibus only. Planned pairs use the conventional one-way pooled-variance
  model with Holm-adjusted p-values and do not claim simultaneous confidence intervals. A control
  label or control ID never silently forces Dunnett.
- Methods text records the executed and recommended method, explicit contrast/correction, engine,
  package versions and application version. Omnibus-only analysis does not imply post-hoc tests.
- Engine 0.7.0 is pinned to NumPy 2.3.5, SciPy 1.18.0 and Statsmodels 0.14.6. The macOS sidecar and
  `.app` were rebuilt after the planned-comparison contract update, and the bundled engine smoke
  check passed for every exposed method.
- A development-only, synthetic-only, token-authenticated loopback evaluation bridge invokes the
  same versioned Python CLI protocol as native. No JavaScript statistical engine or bespoke AI
  controller was added.
- External browser evaluation uses one tunneled HTTPS origin. Browser code calls a relative
  `/api/evaluation/...` path; Vite privately proxies to the loopback bridge and injects the
  per-process token. The bridge port and token are never browser configuration.
- Benchmark mode records run identity, support status, route/design/statistics/graph decisions and
  graph edits. It captures default/final PNG and SVG plus structured statistics, Methods, graph
  state and interaction logs in deterministic run folders. Finalization succeeds only after the
  bridge confirms that all nine required files are present.
- Five deterministic pilot structures are cataloged and automatically verified: independent two
  groups, independent three groups, paired two-condition, nested microscopy summarized at the
  experimental-unit level, and longitudinal endpoint.
- Evaluation mode now requires the context-first design route. Its direct demo entrance is hidden;
  after an evaluator reaches an Experiment Data tab, deterministic pilot values can be inserted
  only when readout, condition count, experiment count, assignment and time structure match.
- Cross-platform evaluation scripts now resolve the pinned venv interpreter on Windows and Unix,
  keep the bridge loopback-only, verify the exact engine/package versions at startup, and launch
  Vite, the same-origin proxy, bridge and Python CLI through one `pnpm dev:evaluation` command.
- A 14-case macOS ARM64 engine 0.7.0 reference envelope now checks Windows/macOS numerical
  equivalence with explicit tolerance while keeping method identity, correction labels and result
  structure exact. Complete benchmark runs also require app, benchmark, engine and source-revision
  metadata.

The remaining migration gate requires the Windows environment: install from the exact revision,
run the shared checks including `pnpm engine:reference`, then complete one visible end-to-end run
for each pilot through Windows Browser Use at `http://127.0.0.1:1420`. No tunnel is needed for that
loop. A standalone verifier checks output identities, version/revision attribution, required files,
formats, event counts and successful current statistics after the visible runs.

See `docs/STATISTICAL_METHOD_CATALOG.md` and
`docs/BENCHMARK_EVALUATION_INFRASTRUCTURE.md` for the current contracts and manual gate.

## Implemented

- specification review, initial analysis-pattern classification, and MVP scope decisions;
- persistent development rules and versioned architecture decision records;
- pnpm workspace with React/TypeScript UI and a Tauri v2 desktop shell;
- Home with exactly Favorites, New experiment, Recent, and Open project routes;
- a Japanese-first, context-first New experiment flow that asks for the research context, readout, conditions and optional attributes, time structure, and separate experiment sessions before showing a design confirmation;
- a five-part clickable design navigator that places final confirmation beside the four design sections and lets a researcher jump directly back to any visited section, correct a typo, and return directly to confirmation without replaying every screen;
- a structure-only condition/time preview that never fabricates points, trends, effect sizes, or sample sizes;
- a two-stage recommendation surface: a lightweight analysis expectation before data entry and a final recommendation reserved for review of the actual data structure;
- an experiment-first Phase 1 workspace with `Overview | Exp 1 | Exp 2 | … | + experiment`, one optional date and note per experiment session, and explicit messaging that session tabs do not imply pairing;
- removable experiment sessions with confirmation when entered measurements would be discarded, stable non-reused session IDs after removal, and protection against deleting the final remaining session;
- one-click, clearly labeled deterministic UX fixtures for a moderately complex proportion experiment and a nested cell/ROI experiment; both include three experiment sessions, multiple times, long hierarchical labels, a planned missing cell, and a separately represented not-planned cell;
- a numbered ten-row condition spreadsheet with editable scientific column headings, single-cell and rectangular paste, arrow/Enter/Shift+Enter/Tab navigation, ignored trailing blank rows, automatic row extension, and stable row IDs that prevent cross-row editing;
- shared scientific descriptor levels that retain repeated values such as `Gene = NDEL1` for later label hierarchy and grouping without merging conditions, pooling replicates, or silently declaring a statistical factor;
- an explicit confirmation grouping that shows repeated first-column values such as Control or NDEL1 as the same upper-level item while keeping each treatment combination as a separate condition and never treating those conditions as biological `n`;
- explicit time-entry text that preserves incomplete input and never inserts a zero or any other time point that the researcher did not type;
- wide spreadsheet-style numerator/eligible input for generic proportions, including rectangular Excel/Google Sheets paste, protected derived percentages, and incomplete-cell support;
- a compact full-width proportion sheet that uses the available workspace width only when the Raw/summary inspector is actually open, keeps condition/time/direct-count/derived-percentage columns visible, and avoids reserving an empty inspector column;
- nested continuous input that retains cell/ROI-level raw values within each experiment session and calculates experiment-level summaries without counting cells as independent biological `n`;
- an explicit planned/not-planned cell state: not-planned cells remain visible and reversible but are excluded from completion, missing counts, plots, analyses, and canonical observations, while measured zero remains data;
- an independent graph workspace with proportion points and mean ± SD, or optional raw observations plus experiment summaries for nested continuous measurements;
- a graph-first workspace with a large canvas, persistent tabbed right-side Inspector, collapsed raw/experiment detail listings, direct axis/layer/legend/background selection, neutral Simple/Publication/Presentation presets, SD/SEM/no error bar selection, hierarchical labels, independent nested-data layers, and graph-specific SVG/visible-data CSV export;
- project-level File/Save As actions, Cmd/Ctrl+S keyboard saving, a compact save action, and visible unsaved state that remain separate from graph export;
- multiple independently configurable graphs in the experiment workspace, with project-level graph tabs whose appearance and validated analysis state survive project save/open;
- project-state schema 0.3 and SQLite migration 3 for the context-first workspace, including canonical raw observations, experiment-session metadata, condition/time reconstruction, graph display-state persistence, save/open re-editing, and immutable raw revisions on overwrite;
- a graph-linked post-data recommendation slice for independent two-group, one-factor multi-group, and complete two-factor comparisons: explicit experimental-unit confirmation is required before the validated local Welch t, Welch ANOVA/Games–Howell, or interaction-first Type III/Holm engine runs; incomplete factorial layouts are not flattened into a one-way comparison, and results are removed rather than silently retained when plotted data change;
- persistent project-level `データ / グラフ / ＋ グラフを作成` navigation available from Overview and every experiment tab, with graph defaults always spanning all experiment sessions;
- versioned domain contracts for experiment design, unit hierarchy, raw revisions, observations, QC, and transformations;
- D01-D05 and D09 deterministic recommendation and versioned local-engine request/result contracts;
- an experiment-language Wizard with one shared independent-group entrance: condition count selects the two-group or multi-group path, a two-factor answer selects the factorial path, and the user never has to choose D01/D03/D05 up front; the same-unit entrance similarly separates two versus three-or-more repeated conditions;
- a synthetic Figure-pattern gallery consolidated into the same three experiment-language families as the Wizard, without exposing template IDs or asking the researcher to compare a catalog of analysis cards;
- a compact new-experiment mode switch that shows either the experiment-design route or the Figure-pattern route instead of stacking both in one long page;
- a read-only, locally performed workbook-pattern audit covering selected research spreadsheets without uploading unpublished data, with only anonymized structural findings retained in the repository;
- backward-compatible and user-editable scientific level groups for multiple controls, siRNA sequences, constructs, or clones crossed with a second factor, while preserving every reagent as a distinct intervention level rather than treating it as biological `n`;
- design-aware Data Sheets for source-preserving WB target/loading-control ratios, already-normalized WB intensity, microscopy intensity, and generic positive/total cell counts, with derived values calculated per biological replicate;
- spreadsheet-style Data Sheets with N1/N2/N3 tabs, condition rows, one-time column headings, per-unit dates, calculated WB ratios or positive-cell percentages, and Enter/arrow-key cell navigation; independent-group N tabs remain presentation-only and never create statistical pairing;
- a live synthetic label-layout preview in the experiment Wizard for independent groups, repeated measurements, X/Y relationships, and two-treatment combinations, so condition and factor labels can be checked before a Data Sheet is created;
- a four-step tab workflow that separates data entry, numerical analysis, graph review, and project saving;
- direct ImageJ Results, Excel, CSV, and one-value-per-line paste for scalar replicate summaries, with numeric-column selection, preview, validation, planned-n protection, and source row provenance;
- D10 ImageJ cell/ROI import for D01/D02 and independent D03/D05 continuous outcomes, with explicit assignment to biological replicates, per-replicate mean/median preview, refusal of mixed raw/summary condition input, immutable raw-row preservation, versioned derived datasets, and analysis input tied to derived-value IDs;
- a locale-neutral project/statistical boundary for a Japanese-first UI and a future English open-source distribution;
- a pinned local Python engine implementing D01 Welch and D02 paired t-tests, D03 Welch ANOVA with Games–Howell, D04 repeated-measures ANOVA with Holm paired comparisons, D05 sum-coded Type III interaction/main-effect tests with Holm cell comparisons, and D09 Pearson/Spearman correlation;
- explicit researcher-described condition matching in the experiment-first workspace, preserved as shared experimental-unit identity and connected to paired-dot/D02 behavior without inferring correspondence from dates;
- longitudinal per-unit trajectories with a stronger summary trend, while cross-sectional time courses deliberately omit individual connecting lines;
- multiple readouts in one experiment set, with separate data tables, graph selection, canonical outcomes, and a deterministic synthetic fixture;
- a context-first XY workflow with direct paired X/Y entry per stable experiment-unit ID, two-cell spreadsheet paste, Scatter preview/workbench, complete-pair filtering, D09 Pearson/Spearman routing, and project save/open reconstruction;
- graph-linked longitudinal transformations for selected time, endpoint, maximum, minimum, trapezoidal AUC, baseline change, and F/F0, with a common analysis window, explicit cross-sectional refusal, raw-observation lineage, project persistence, and full-trace Graph display kept separate from the analysis subset;
- a categorical-composition workflow that preserves category counts per experiment unit, derives percentages without overwriting counts, supports rectangular paste, renders count/100%-stacked/category-percentage graphs, and refuses to route composition data through continuous-value tests;
- an experiment-first WB workflow with separate target/reference spreadsheet columns, rectangular paste, protected target/reference ratio derivation, loading-control normalization provenance, ordinary continuous-outcome graphs/statistics, and project save/open reconstruction of both source band values;
- active context-first entrances for cell/culture, protein/biochemical, animal, general quantitative assays, and existing-data import;
- an explicit local existing-data import route for tidy tables and wide Excel/Prism-style tables, with preview, researcher-confirmed experiment/condition/time/value mapping, CSV/TSV/TXT input, duplicate-ID refusal, and source row/column provenance that survives save/open;
- design-only reuse from a saved experiment workspace into a new project confirmation screen, with conditions/readouts/time retained but measurement cells, source notes, graphs, analyses, and historical experiment-session metadata excluded;
- locally persisted Favorites that reuse the same data-empty boundary and can retain compatible Graph type/layer/basic-style defaults without retaining raw values, results, annotations, or project history;
- explicit reference-free WB intensity, target/reference WB, and optional within-experiment control=1 or maximum=1 normalization; the latter is OFF by default, preserves source bands, and is carried through Data Sheet display, Graph/analysis values, normalization plans, lineage, Methods, and save/open;
- experiment-first D04 routing for one-factor designs with three or more explicitly matched conditions, using complete stable unit IDs and the existing repeated-measures ANOVA/Holm backend without inferring correspondence from dates or experiment tabs;
- independent numerical validation against Statsmodels reference calculations and fixed golden fixtures;
- result views with individual-dot/mean/SD graphs for independent D01/D03/D05 and explicit matched-unit connection graphs for D02/D04;
- clustered D05 publication graphs that use the first factor as the x-axis grouping, the second factor as the color series, and optional scientific parent-group brackets rather than flattening every factorial cell into an unrelated category;
- Japanese deterministic Methods text, graph appearance controls, six-color publication/accessibility palettes, and SVG/analyzed-data CSV export;
- persisted project name, first experiment date, operator, batch, and note fields, plus a separate editable date for every experimental unit; dates round-trip through raw revisions and recovery CSV without redefining historical unit identities;
- source-preserving WB target/loading-control measurements with versioned ratio derivation, recovery-CSV columns, Methods reporting, and saved-project re-editing;
- pure, tested raw-integrity transformations for broader nested observation summaries and separate-observation WB normalization foundations;
- D10 raw-and-replicate graphs in which faint cell/ROI points are visually separated from biological-replicate summaries and SD is computed from the summaries only;
- D09 complete-pair input, Pearson/Spearman selection from an experiment-language relationship question, publication-oriented scatter plotting, local result display, Methods/CSV/SVG output, and saved-project re-editing;
- transparent project-manifest schema with recovery references, checksums, package-relative path checks, unique paths, and project-ID consistency;
- declarative graph-spec and deterministic graph-model boundaries;
- project package save/open contracts with in-memory atomic-failure and corruption round-trip tests;
- a Rust directory-package adapter with staged writes, rollback, previous-project preservation, path-containment checks, and local-open UI wiring;
- durable whole-package pre-migration backups when a save raises the embedded SQLite schema version, without duplicating ordinary same-version saves;
- sequential SQLite migrations v1-v2, including versioned transformations, derived-dataset revisions, derived values, source IDs, and backward-compatible v1 decoding;
- validated ProjectState assembly, canonical raw CSV recovery export, SQLite codec, manifest/checksum validation, and populated save/open round trips;
- immutable raw revision creation on edits, deterministic stale propagation to prior analyses/graphs, and re-analysis history;
- editable rehydration of opened canonical observations, analysis state, numerical results, and graphs, with edits saved as a new immutable raw revision;
- a packaged macOS Apple Silicon statistical sidecar and a native `.app` containing that sidecar.

## Verified

- workspace formatting, lint, TypeScript checks, and React production build;
- 375 JavaScript/TypeScript checks across contract, domain, clipboard/data-sheet, graph, project, and UI suites, including statistical method choice, explicit contrast intent, same-origin evaluation proxy isolation, complete benchmark artifact-manifest verification, the five-pilot design-gated loader, context-first project save/open/re-edit, and existing scientific-integrity regressions;
- 38 Python engine checks, including Tier A alternatives, deterministic edge cases, planned-comparison Holm adjustment, and independent Statsmodels reference validation of established Core methods;
- 9 ordinary Rust checks across project storage and SQLite codec/version handling; the separately invoked pinned Rust-to-Python round trip also passes;
- macOS release build and direct execution of the analysis sidecar from inside the generated app bundle.
- native macOS app startup smoke check after adding SQLite and file-dialog integration.
- Windows migration preparation on macOS: the cross-platform launcher and bridge tests pass, the
  verifier accepts pnpm's PowerShell-style `--` argument boundary, all 14 engine requests agree
  with the macOS ARM64 reference at `rtol=1e-10` / `atol=1e-12`, and the rebuilt macOS bundle still
  passes its embedded sidecar verification. Windows execution itself remains an external gate.

The current managed Codex execution environment rejects loopback socket binding, so the live
evaluation bridge and Vite server cannot be started here. UI behavior is covered by focused DOM
tests, protocol behavior by direct bridge tests, and native behavior by bundled-engine verification.
The in-app browser is also administratively blocked from the previous Cloudflare preview URL, so
it cannot be used as an alternative execution surface. The visible five-pilot browser run remains
the final milestone gate.

## Current evaluation gate

Run the five cataloged pilots in the external browser evaluation environment. Each run must begin
at Home/New experiment, construct the design in researcher language, reach an Experiment Data tab,
load the compatible deterministic values, execute the real local statistical engine, inspect and
edit the Graph, assign a support outcome, and finalize all nine artifacts. See
`docs/BENCHMARK_EVALUATION_INFRASTRUCTURE.md` for the exact procedure.

## Work after that review

1. Complete one visible end-to-end run for each of the five pilots and review the output folders.
2. If those runs pass, begin the planned literature-derived 50-case x 2-track benchmark without
   adding benchmark-specific scientific capabilities.
3. Keep unsupported experimental families as explicit safe refusals; use benchmark evidence to
   prioritize later Core extensions.
4. Use the prepared Windows browser-evaluation loop for fast benchmark iteration after its five
   pilot migration gate; defer installer/signing/native clipboard work to the Windows packaging
   milestone.

## Scope reminders

- Positive-cell percentage is a generic Core data-shaping workflow (cilia-positive cells are one use case) and routes through D01/D02/D03/D04 according to the experiment design.
- Western blot normalized intensity and microscopy intensity begin as continuous outcomes.
- Cryo-ET-specific analysis is out of scope; generic nesting remains in scope.
