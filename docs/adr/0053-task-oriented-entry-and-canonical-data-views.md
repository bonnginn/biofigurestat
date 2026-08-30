# ADR 0053: Task-oriented entry and canonical data views

Date: 2026-08-28

## Status

Accepted for feature-flagged production integration. This decision does not make the adaptive path
the default for all users. Human revalidation remains required before the compatibility entry is
removed.

## Classification

Production-integration extension to ADR 0051 and ADR 0052. It fixes the researcher-facing entry
topology, the relationship between compact and expanded data sheets, and the Graph-first boundary.
It does not change the statistical-method authority or relax unsupported-design safe stops.

## Context

The current application exposes a context-first wizard, a production-connected StructureContract
scaffold, direct specialized analysis pages, and an isolated condition-canvas prototype. They do
not yet form one coherent workflow. In particular:

- a researcher has to choose between “simple” and “complex” routes even though complexity is only
  known after the experiment facts are entered;
- the adaptive production path accepts paste/import but has no complete spreadsheet editor;
- the live workspace edits `ExperimentCellMap`, while adaptive canonical observations are mainly
  synchronized at save time;
- a feature flag can make the same time-to-event or ordered-curve tile lead to a semantically
  different legacy page;
- heatmap matrix layout is currently capable of being persisted as if its columns established
  biological independence, although matrix position alone cannot establish biological n;
- graphing may be valid before all facts required for inference are known, but some specialized
  save paths currently construct a statistical request even when the user only created a graph.

## Decision

### Researcher-facing entry hub

`/new-experiment` owns one task-oriented entry hub. The number of visible destinations is not fixed
in advance. A destination is direct only when it saves clicks without asking the researcher to
choose a data-model category or silently changing scientific meaning.

The Alpha hub contains:

1. **実験から始める** — the general experiment-first path. A small ordinary experiment finishes
   after a short condition canvas; paired, repeated, nested, multi-factor, and sparse designs reveal
   only the additional biological questions they require. “Simple” and “complex” are not separate
   user choices.
2. **手元の表からGraphを作る** — a Graph-only ingress for an existing rectangular table. It may
   preserve and plot data before biological structure is known, but it must remain semantically
   unresolved for inference until the relevant biological questions are answered.
3. **生存時間（Kaplan–Meier）** — direct because event/censoring records require a distinct typed
   table and graph.
4. **濃度–反応・酵素反応** — direct because an ordered X/Y record and an explicitly selected model
   can determine the specialized input surface with few questions.
5. **ヒートマップ** — direct Graph-only matrix ingress. Matrix columns are not declared to be
   independent biological units merely because they are columns.

Clipboard, CSV, TSV, and generic file import are offered inside the relevant destination. They are
not a separate top-level scientific category.

Instrument/domain examples such as microscopy, cell culture, biochemical assays, and animal
experiments may tailor wording and examples after “実験から始める” is selected, but they do not
define the semantic route. The current context-first wizard remains available only behind an
explicit compatibility control while the adaptive feature flag is under human validation. It is
not interleaved with the new hub and is not presented as the recommended path.

If a semantic dedicated intent cannot be handed to a specialized destination, the corresponding
new entry is unavailable with an explanation. It must not silently fall back to a legacy example or
to a differently interpreted analysis page.

### Alpha entry-count clarification (2026-08-28)

For Alpha, the five destinations above are deliberately presented as two main routes plus three
direct specialist routes:

- the main routes are **実験から始める** and **手元の表からGraphを作る**;
- the direct specialist routes are **生存時間（Kaplan–Meier）**,
  **濃度–反応・酵素反応**, and **ヒートマップ**.

The entry count is optimized for researcher-facing clarity and saved clicks, not for symmetry or
for exposing every supported data or analysis family. There is no abstract “Special” category, and
Alpha does not add a sixth top-level route until everyday-use evidence shows that a frequent,
semantically unambiguous task is otherwise being misrouted or burdened by repeated extra choices.

Western blot, qPCR, plate-reader or plate-shaped data, flow-cytometry data, categorical values, and
multiple readouts remain presets or progressive branches within **実験から始める**. These labels
may tailor the value fields, import mapping, examples, and follow-up questions, but they do not by
themselves determine biological independence, matching, hierarchy, or analysis. Correlation and
scatter plotting belong under **手元の表からGraphを作る**, where the researcher identifies the
two numeric variables; any identity, nesting, or inference questions are requested only when
Statistics is opened. A generic “X/Y” label must not merge observational correlation with the
manipulated ordered-X and model-selection semantics of the concentration-response route.

The frozen Core 65 demonstrates structural coverage and mapper/surface reachability. It is not
evidence of real-world task frequency or initial researcher navigation behavior. Top-level entry
changes therefore require the planned everyday-use evidence rather than case-count inflation or
coverage counts alone.

### General experiment flow

The production ordering follows ADR 0052:

`condition questions or editable condition canvas -> measurement definition -> minimum
observation-pattern facts -> generated data sheet -> Graph -> statistics-only targeted facts ->
complete StructureContract and analysis`

The condition canvas records performed, not-performed, and unresolved combinations. Missing or
sparse cells may still be graphed. They are not fabricated to complete a factorial design.

The application asks how condition-specific material was obtained only after the conditions are
visible. It distinguishes:

- different units assigned to one condition;
- the same entity measured across conditions or an ordered sequence;
- distinct condition-specific units split from a shared material source.

The third relationship retains both source identity and condition-specific sample identity. It is
not reduced to ordinary pairing or independence.

For a shared material source in a multi-factor experiment, the general entry asks which one
condition block was changed after the material was split. That answer determines the matching
relation; the visual order of the condition blocks does not. If two or more condition blocks were
changed after splitting, only some units can be matched, or the relationship is unknown, Contract
0.1 cannot encode the result losslessly and the workflow retains the entered condition canvas and
stops for revision. It must not pair the first condition block by default.

### One canonical record set, two spreadsheet projections

There is one editable canonical observation record set per saved dataset revision. The UI may show
it in two synchronized projections:

- **まとめて入力**: conditions are compact and one condition cell may contain multiple values.
  This view is editable only when the edit is lossless and cannot reassign identity, source
  lineage, ordered-axis coordinates, or nested parent/child ownership.
- **すべての値**: one canonical record per visible row with every required identity, condition,
  axis, hierarchy, typed component, missingness, and provenance coordinate shown. Unequal n is
  represented by unequal row counts, not padding or positional pairing.

The two projections carry the same stable record IDs. Changing views neither aggregates nor
duplicates records. A compact edit that could change scientific meaning is disabled with an
actionable reason and the expanded view remains available. Positive/total, target/reference, and
other typed bundles retain their raw components; a derived ratio is a projection, not a
replacement. Child observations such as cells or ROIs remain attached to their parent and never
become biological n by row count.

The first production integration may adapt the live legacy cell store through a tested canonical
adapter, but it must have a single write authority during editing. A save-time-only reconciliation
between independently editable stores is not an acceptable final state.

### Capability readiness and Graph-first behavior

Data retention, spreadsheet editing, Graph, Statistics, and Methods have separate readiness.

- A valid graph does not require every fact needed for inference.
- Opening Statistics requests only facts that can change the selected analysis semantics.
- When biological identity or matching is irrecoverable, Statistics stops safely; it never treats
  row position as matching or silently substitutes independence.
- The data sheet, raw lineage, condition canvas, and graph remain intact when Statistics is stopped
  or the experiment design is revised.
- Warnings distinguish “graph is descriptive”, “analysis needs more information”, “analysis is
  statistically weak but computable”, and “analysis is unsupported/invalid”. A warning alone does
  not grant an unsupported analysis.

Specialized Graph creation and save/open must not require a statistical request. In particular, a
one-group Kaplan–Meier curve and an all-censored dataset can be retained and graphed; group
comparison readiness is evaluated only when Statistics is requested. Ordered-curve input may be
graphed without fit. A fit requires an explicit supported model and its model-specific facts.

### Persistence

The saved project retains, as applicable:

- entry intent and semantic-readiness state;
- condition canvas and observation-pattern answers with provenance;
- complete StructureContract only when it is valid;
- canonical observations and stable record IDs;
- active compact/expanded view preference as presentation state;
- column mapping and raw lineage;
- graph specifications independent of analysis results;
- targeted confirmations and safe-stop diagnostics;
- the existing design projection and dual-write equivalence assertion when a complete contract
  exists.

Graph-only projects must explicitly persist unresolved semantic readiness. They must not receive a
fabricated `ExperimentDesign` merely to satisfy the project schema. This requires a versioned state
extension and migration tests before Graph-only save is production-ready.

At the first feature-flagged integration checkpoint, the direct heatmap destination may create and
export a matrix graph, but project save remains unavailable until that unresolved visualization
state is versioned. This is a bounded capability gap, not a reason to hide heatmap behind a generic
“special” submenu or to infer biological independence from its columns.

## Consequences and acceptance gates

- The general entry and specialized entries share project, Graph, Statistics, Methods, and
  save/open concepts even when their data-sheet components differ.
- Existing graph renderers and analysis engines are reused; large mixed pages are separated over
  time into data preparation, Graph, Statistics, and persistence controllers.
- Human revalidation must cover ordinary independent, shared-source split, repeated, nested,
  sparse condition, one-group survival, all-censored survival, enzyme ordered curve, and Graph-only
  heatmap workflows.
- Production default migration requires: stable round-trip of both spreadsheet projections;
  no unsafe coercion; no flag-dependent semantic fallback; keyboard/focus table operation;
  Japanese/English terminology review; and successful save/reopen from every enabled direct entry.

Pool D is not used by this decision or its validation.

## Implementation checkpoint — 2026-08-28

The first feature-flagged integration slice now implements the following accepted parts of this
decision without removing the compatibility workflow:

- `/new-experiment` presents two main routes and three direct specialist routes. The compatibility
  entry is hidden unless explicitly enabled, and unsupported handoffs do not fall back to a legacy
  interpretation.
- Graph-only rectangular input supports clipboard, CSV, TSV, TXT, direct spreadsheet editing,
  explicit X/Y/optional-group mapping, descriptive Graph creation before Statistics, and a
  versioned unresolved-visualization project round trip. Version `0.2.0` retains an append-only
  chain of table, mapping, and raw-lineage revisions; each Graph names its exact retained data
  revision, and every revision raw export is included in the project package. The active table,
  mapping, and raw-lineage aliases must exactly match the final revision in that chain. Legacy
  `0.0.0` and `0.1.0` states migrate by synthesizing one explicit revision and rebinding their
  legacy Graph source rather than treating an unversioned alias as current data. Requesting
  Statistics preserves the table and active Graph and asks only the biological facts needed to
  promote the data safely.
  An optional source ID column is retained for independent samples as well as matched samples;
  selecting it does not declare matching, and row order is never used as a substitute. ID
  availability is an explicit three-state fact: unanswered, confirmed absent, or a selected
  column. Promotion stops while it is unanswered; a `source-row-*` identity is generated only
  after the researcher has confirmed that no source ID column exists. A shared-source design
  requiring both source and condition-specific sample identities stops without replacing one ID
  with the other.
- Heatmap unresolved-visualization save/open is versioned. The earlier checkpoint limitation that
  heatmap project save was unavailable is therefore resolved; matrix position still does not
  establish biological independence.
- Adaptive observations have one canonical write authority with synchronized compact and
  all-observation projections. Stable record identity, typed raw components, unequal n,
  missingness, hierarchy coordinates, source rows, mapping, and raw-lineage state survive view
  changes and project round trips. For an independent comparison, absent rectangular compatibility
  padding from unequal n is not reported as a missing observation; an explicitly retained
  `unknown` or `not_collected` observation remains a missing observation. Matched and repeated
  completeness checks are unchanged.
- Experiment-structure revision is non-destructive. A no-op or cancel preserves scientific state;
  compatible changes retain canonical observations; incompatible changes stop with diagnostics;
  analysis, p-values, and Methods are invalidated when their semantic inputs change. The full
  condition-canvas presentation is retained for reopen and revision rather than reconstructed from
  a flattened Contract.
- Scientific project revisions are idempotent: unchanged save/reopen does not append raw or design
  revisions, presentation-only view changes do not create scientific history, and derived analysis
  artifacts do not masquerade as new raw data.
- Readouts at different observation grains require explicit per-readout binding. A mixed dish-level
  and Cell-level experiment is never forced into one legacy table; the current production path
  stops while retaining the condition plan and answers until multi-section input is available.

A versioned progressive-entry semantic foundation and a dedicated `progressive_experiment` project
kind now exercise both pre-sheet setup recovery and a known sparse condition Canvas through flat
scalar or positive/total input, descriptive Graph, and save/open. Setup and data use an inner
versioned stage/intent discriminator rather than additional top-level project kinds. Pre-sheet
save/open retains the Canvas, active/pending Pattern, readiness, and provenance while rejecting
observation records, data lineage, complete Contracts, Graph settings, and Graph/Statistics
`READY`; recovery bytes are checked against the persisted semantic state even when package hashes
have been recomputed. Setup-stage and data-stage round trips are verified independently; this does
not by itself demonstrate an in-place setup-to-data project lifecycle. This remains an isolated,
unrouted Alpha slice. Unknown condition status
stops before the value sheet; nested, ordered-axis, unsupported typed, or missing-identity records
stop safely. Statistics deliberately remains `NEED_MORE_INFORMATION` until the generic
comparison-scope mapper and analysis-specific replication/data-adequacy gate are ported and
reviewed. This slice is evidence for recoverable Canvas-to-input-to-Graph state, not evidence that
the general workflow or inferential Statistics migration is complete.

The isolated project layer also provides a guarded setup-to-data transition. It requires a new
snapshot identity, preserves the semantic Canvas and Pattern, accepts only explicitly supplied
records with recoverable lineage, and never creates a complete Contract or `Statistics READY` as a
side effect. A stopped transition returns the original setup state unchanged. The caller receives
that setup revision separately from the new data state; retaining both revisions inside one
overwritten package would require a future versioned history field and remains a bounded lifecycle
gap rather than being inferred or silently discarded.

Data-stage recovery uses a versioned canonical JSON authority containing the complete Canvas,
active and pending Patterns, mapping, and every staged record, including excluded or hidden
records. A TSV projection that omits semantic identities or provenance is not accepted as a
lossless persisted authority. Package save/open verifies the declared raw hash, exact recovery
bytes, semantic body even when identifiers are unchanged, and monotonic project, capture, mapping,
snapshot, and provenance timestamps.

For the bounded Graph-only-to-Statistics continuation, only the active descriptive Graph is
rebound to the newly validated workspace selectors and canonical raw revision. Historical Graphs
remain attached to their original unresolved data revisions; they are not silently rebound to the
current table or copied as if they described the promoted dataset. The earlier checkpoint left
unsaved source history outside the promoted Experiment project. This gap is now resolved with an
optional, versioned `entrySourceHistory 0.1.0` extension inside the Experiment workspace. It embeds
the exact unresolved source state, including every data revision, Graph specification, mapping,
raw lineage, and provenance record. The extension is immutable ingress evidence and is never a
second canonical write authority. It survives Experiment save/open and compatible structure
revision, while design reuse deliberately omits it. Unknown extension versions and inconsistent
active revision or Graph bindings fail closed.

In the browser-only synthetic preview, an entry card being available means that its input and
descriptive Graph can be reviewed; the banner and disabled controls continue to state that native
project persistence and engine execution are unavailable. In the native feature-flagged app,
Graph-only and Heatmap resumability depends on the versioned unresolved-visualization save and open
bridges. Missing bridges do not fall back to a standard project or a different scientific route.

Keyboard focus follows the task boundary: entry and route changes focus the new page heading
without scrolling, returning from Graph-only restores the originating hub control, successful
biological setup focuses the workspace heading, and dynamic factor, readout, or observation-row
removal moves focus to the next valid peer, the previous peer, or the relevant add control. Repeated
factor actions have unique accessible names that include their block number or researcher label.

Native capability availability is also fail-closed. In browser-only synthetic preview, Graph-only
and Heatmap remain open for UX review while their save/open controls and explanatory text state
that persistence is unavailable. In the native production path, both unresolved-visualization
save and open bridges are required before either entry is enabled. The same paired-capability gate
applies at the hub, the compatibility route, and a direct Heatmap URL; one missing bridge never
falls back to the standard project writer, exposes a one-sided save surface, or selects another
scientific route.

Reusable Favorites cross a separate data-free boundary. A single allow-list sanitizer is used
before Favorite persistence, on legacy Favorite load, and for design reuse. It retains reusable
structure and a versioned adaptive design template, but removes canonical observations, mappings,
raw lineage, import provenance, source-history state, source rows, experimental notes, and dates.
Legacy Favorites are rewritten in local storage after sanitization rather than merely hiding
data-bearing fields when opened.

Remaining production-default gates include the one-way biological-plan to Canvas/Pattern handoff,
multi-section input for heterogeneous readout grains, progressive project lifecycle integration,
exact original-fragment lineage for edited progressive clipboard data, Japanese/English coverage,
desktop save/open and engine human revalidation, real assistive-technology validation, the planned
everyday-use navigation study, and human review of how source-history provenance should be exposed
without presenting it as another editable dataset. The compatibility workflow must remain
available until those gates and human revalidation are complete.

Automated evidence at this checkpoint includes: experiment-first prototype test suite `190/190`, engine
`62/62`, adaptive-input `46/46`, canonical data-sheet `59/59`, graph-spec `28/28`,
analysis-contracts `45/45`, project `59/59`, and domain `33/33`. After the source-history,
data-free Favorite, and native availability changes, a fresh complete UI run passes `823/823`
across `90` files; the directly affected UI set passes `90/90`. UI and project type checks, full UI lint, production build, and
`git diff --check` also pass.

Desktop Rust tests report `12` passed and `1` ignored: the ignored
`development_python_round_trip_returns_versioned_json` case requires the pinned development
Python environment and is not evidence for a packaged-sidecar round trip. UI and package type
checks, UI lint, production Vite build, desktop `cargo check --locked`, and `git diff --check` also
pass. The production build still reports a `1,392.63 kB` minified (`377.00 kB` gzip) JavaScript
chunk, above the `500 kB` advisory threshold. Route-level code splitting remains a nonblocking
performance and maintainability follow-up and is not treated as semantic validation evidence.

A browser-level feature-flagged smoke pass covered both main entry routes. Graph-only accepted a
rectangular three-column table, required explicit X/Y mapping, created a descriptive Graph, and
kept that table while revealing only the Statistics handoff questions. Its optional `DishID`
mapping started unanswered and disabled promotion until the researcher either selected the column
or explicitly confirmed that no ID column existed. It stated that selecting an ID does not declare
matching and that row order is never used; after an independent-sample answer, the expanded input
view retained the original `C1` and `D1` identities. Route headings received focus, and returning
from Graph-only restored focus to its hub trigger. The experiment-first route
created an independent two-condition experiment, accepted unequal counts (three Control and two
Drug observations) in compact form, exposed the same five stable observations in expanded form,
created a Graph, reached Statistics, and retained all five values and the Graph after opening and
cancelling structure revision. Focus moved into the revision editor and returned to its trigger.
This browser pass used the explicit synthetic preview; native save/open and engine execution remain
human revalidation gates. The three specialist hub controls also routed directly to Survival,
ordered curve/enzyme kinetics, and Heatmap without opening the compatibility workflow; each
destination focused its page heading, and the browser-only limitations remained visible. Pool D
was not accessed.

## Researcher-facing row-grain clarification — 2026-08-28

For Graph-only promotion without a source ID column, confirming that the column is absent is not
evidence that every source row is an independent biological or experimental unit. Before any local
unit identity is generated, the researcher is asked whether each row represents a separately
treated animal, dish, well, or other experimental unit; multiple Cell, ROI, or field rows within
one parent unit and an unknown row meaning both stop without changing the retained table or Graph.

Only an explicit answer that each row is a separate unit permits deterministic local identities
such as `unit-001`, `unit-002`, and so on. These identities are local stable addresses and do not
create matching across conditions. The earlier implementation-checkpoint wording that described
generated `source-row-*` identities is superseded by this clarification; row position alone never
establishes biological independence or pairing.

## Graph-only common-workspace checkpoint — 2026-08-30

Graph-only no longer maintains a reduced preview/editor beside the production Graph editor. Its
Data, Graph, and Statistics stages are separate workspace tabs, and Graph uses the same
`ExperimentGraphWorkbench`, export actions, axis controls, graph types, and appearance controls as
experiment-first projects. A presentation-only adapter may construct local rendering addresses for
the editor, but those addresses are not persisted as an ExperimentDesign and are never offered to
Statistics. The unresolved GraphSpec may persist the complete visual-editor presentation so that
save/reopen is lossless without asserting experimental units, independence, pairing, or biological
n.

Sample/subject ID and visual series are separate mappings. An ID column labels retained source rows
and cannot create legend entries or colors. A proposed series column whose nonempty value is unique
for every displayed row is treated as a likely ID and is blocked until the researcher either moves
it to ID or explicitly confirms that one series per row is intentional. This prevents the observed
failure in which culture-dish IDs became three unrelated legend series.

For native Excel workbooks, selecting one worksheet remains available. Graph-only additionally
offers an explicit operation to stack all nonempty worksheets when their headers match, prefixing
each row with the worksheet name in an `Experiment / worksheet` source column. The operation
retains provenance but does not infer that sheets are independent experiment runs or statistical
replicates; that fact remains part of the Statistics biological-structure handoff.
