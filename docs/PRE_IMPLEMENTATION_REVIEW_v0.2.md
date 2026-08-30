# Pre-Implementation Review v0.2

Status: implementation gate completed before scaffolding; retained as the decision record for the initial build.

Primary specification: `LifeScience_Analysis_App_Spec_v0.2.docx` (not distributed in this public repository)

## 1. Product purpose and core architecture

This is a local-first life-science analysis desktop application that begins with the user's experiment rather than with a statistical test or Prism table type. A researcher selects an experiment purpose such as Western blot or Microscopy, answers design questions in ordinary experimental language, receives a design-aware data sheet, runs a deterministic validated analysis, adjusts a publication-ready graph, and generates reproducible Methods and provenance within one project.

The core architecture is a vertical, versioned pipeline:

```text
Experiment-purpose Wizard
        |
        v
ExperimentDesign + Unit hierarchy + Primary contrast
        |
        v
Raw revision -> QC revision -> Derived dataset
        |
        v
Analysis module -> Engine request -> Versioned result
        |
        +--> Graph specification / export
        +--> Deterministic Methods / provenance
```

The UI and analysis layers must be separated. Experiment-specific Wizards guide the user into reusable design structures. D01-D12 analysis templates are independent versioned modules. Graph appearance is independent of numerical analysis.

## 2. MVP data model and project model to freeze early

### 2.1 Canonical experiment design

`ExperimentDesign` must contain at least:

- stable design ID and design-schema version;
- experiment purpose and outcome type;
- factors, ordered levels, and condition definitions;
- explicit experimental-unit level;
- a generic ordered unit hierarchy, such as experiment -> dish -> field -> cell;
- pairing, blocking, and repeated-measure relationships;
- planned `n` and the definition of statistical `n`;
- time and dose dimensions when present;
- normalization plan, missingness/QC plan, and primary contrast;
- user-facing summary and Wizard decision trace.

The unit hierarchy must be generic. It must support cells nested in fields, technical measurements nested in biological replicates, and animals measured repeatedly without creating experiment-specific canonical schemas.

### 2.2 Canonical data representation

Use a long-form observation model internally even when the UI displays a Prism/Excel-like wide sheet.

Required entities:

- `UnitLevelDefinition`: level name, parent level, role, and whether it is the experimental unit;
- `UnitInstance`: stable ID, level, optional parent ID, block/pair metadata;
- `ConditionAssignment`: factor-level assignments for a unit or observation;
- `RawDatasetRevision`: immutable revision metadata and source hash;
- `Observation`: stable ID, raw revision, unit ID, outcome ID, typed value, measurement unit, time/dose coordinates, technical-replicate identifier, and source location;
- `QCRecord`: exclusion/flag, reason, author, time, and target;
- `TransformationSpec`: normalization or summary operation with parameters and version;
- `DerivedDataset`: upstream revision hashes plus generated values and lineage.

The visible sheet is a projection over these entities, not the persistence model itself.

### 2.3 Analysis and result contracts

Every analysis run records:

- analysis ID and module/template ID/version;
- exact input raw/QC/derived revision IDs;
- selected contrast and whether it differs from the recommendation;
- engine and package versions;
- model/test parameters and multiplicity method;
- standardized results: estimates, confidence intervals, test statistic, degrees of freedom, p-values/adjusted p-values, effect sizes, warnings, and diagnostics;
- stale/current state and execution history.

### 2.4 Project package

Use a transparent versioned package rather than an opaque single database. Proposed layout:

```text
project.lsa/
  manifest.json
  project.sqlite
  raw/
    sources/
    exports/
  assets/
  checksums.json
```

The package may later be transported as one archive, but raw measurements and the manifest must remain recoverable with ordinary tools. Saves must be atomic. `manifest.json` owns project-format version, schema versions, app version, timestamps, and content checksums. SQLite holds relational state and revision/provenance records. Original imported files may be preserved under `raw/sources`; a canonical raw CSV export provides a recovery path.

Migrations are explicit, sequential, tested, non-destructive by default, and create a backup before modifying a project.

## 3. Main implementation risks

1. **Pseudoreplication:** confusing cells/fields/events or technical replicates with biological `n` would produce incorrect inference.
2. **Ambiguous paste/import:** a spreadsheet-shaped paste does not by itself identify units, pairing, conditions, or nesting.
3. **Lineage and invalidation:** changes to design, raw data, QC, or normalization must invalidate exactly the dependent results without losing history.
4. **Engine distribution:** fixed Python/R engines must run on Windows/macOS without requiring users to manage runtimes.
5. **Numerical consistency:** library defaults, missing-data rules, factor coding, multiplicity methods, and version upgrades can change results.
6. **Project corruption/migration:** a monolithic opaque file would endanger raw-data recovery; save and migration failures need recovery paths.
7. **Graph/statistics coupling:** p-value annotations and summaries can become stale or inconsistent if appearance and analysis state are not separated.
8. **Export fidelity:** SVG/PDF/TIFF output, fonts, physical dimensions, and platform rendering must be reproducible.
9. **Scope growth:** implementing all experiment entrances, D01-D12, mixed models, mass spectrometry, and a rich graph editor at once would prevent a reliable MVP.
10. **Platform integration:** Tauri sidecars, signing, updater, file dialogs, and cross-platform packaging are separate risks from domain logic.

## 4. Frequent analysis patterns found in public work

Local inspection of `/Volumes/三重大組織学標本` found no research-statistics workbooks or Prism projects. Two spreadsheets were clearly administrative/teaching records and were excluded without content inspection. Therefore current frequency evidence comes from the user's open-access publications, not unpublished local datasets.

| Experiment type                                            | Data structure                                                     | Typical n / conditions                                                         | Statistical unit                                                                       | Recommended analysis                                                                                                                | Alternative                                                                                                                | Typical graph                                                                        | Evidence and MVP value                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Control vs perturbation, including knockdown/KO and rescue | 2-3 groups; independent experiments with many cells per experiment | commonly 3 biological experiments; tens to hundreds of cells per condition     | independent experiment/dish, not each cell                                             | Welch two-sample test for two groups; one-way/Welch ANOVA plus planned multiplicity for 3+                                          | Mann-Whitney or Kruskal-Wallis when justified                                                                              | individual replicate dots plus estimate/CI; raw-cell distribution as secondary layer | Very frequent and broadly useful. Core D01/D03/D10.                                                                                       |
| Paired before/after or matched control/treatment           | two measurements from the same biological unit                     | often 3+ independent experiments or dozens of tracked cells within experiments | matched biological unit                                                                | paired t-test                                                                                                                       | Wilcoxon signed-rank                                                                                                       | paired dot with connecting lines                                                     | Direct evidence in optogenetic before/after measurements. Core D02.                                                                       |
| Two-factor perturbation/rescue/epistasis                   | genotype/construct x treatment, often 2x2 or several levels        | commonly 3 biological replicates; many subsamples                              | biological replicate/block                                                             | two-way ANOVA with explicit interaction and multiplicity plan                                                                       | aligned-rank or model-based alternative only when validated                                                                | grouped individual dots plus interval                                                | Frequent and central to rescue experiments. Core D05.                                                                                     |
| Time course after serum, light, or drug stimulation        | repeated measurements or separate samples at multiple times        | seconds to hours; usually 3 experiments or multiple tracked cells              | design-dependent: biological unit with repeated time, or independent unit at each time | repeated-measures/mixed model when the same unit is tracked; factorial model when units differ                                      | summarized per-replicate analysis for a bounded simple design                                                              | line showing biological-replicate values/intervals; optional raw traces              | Frequent, but modeling and UI are more complex. High priority D07/D06.                                                                    |
| Microscopy cells/fields nested in replicate or animal      | experiment/animal -> field -> cell/event                           | 3 experiments or 5+ animals; many cells/events                                 | experiment, animal, or explicitly declared unit                                        | replicate-level summary for the first safe implementation; validated nested model later                                             | cluster bootstrap or mixed model                                                                                           | raw cells in light styling plus replicate summaries                                  | Extremely frequent and the main correctness differentiator. Core D10.                                                                     |
| Binary response or positive-cell proportion                | successes and totals within biological replicates/conditions       | 3+ experiments, often >100 cells per condition                                 | biological replicate with success/total counts                                         | for the initial common case, derive a percentage per biological replicate and use D01/D02/D03/D04 according to grouping and pairing | a validated binomial/contingency model when the scientific question is about counts/odds rather than replicate percentages | replicate percentages plus visible positive/total counts                             | Frequent in ciliation and responder assays. The common percentage comparison belongs in the Core D01-D04 path; general D12 remains later. |
| Correlation between continuous measurements                | paired numeric variables                                           | fields/cells/samples depending on design                                       | explicitly declared independent unit                                                   | Pearson or Spearman based on defined rule and data meaning                                                                          | robust method later                                                                                                        | scatter with fit/CI where applicable                                                 | General-purpose and already required by specification. Core D09.                                                                          |
| Dose response                                              | XY concentrations with replicate responses                         | multiple doses and replicate curves                                            | biological replicate/curve                                                             | nonlinear regression with declared model and parameter CI                                                                           | nonparametric trend only for different questions                                                                           | XY curve with raw replicates and fitted curve                                        | Broadly useful but less directly evidenced than time course. High priority D08.                                                           |

Cryo-ET-specific analysis is excluded by user decision. Its existence does not create an MVP requirement. The generic unit hierarchy needed for ordinary microscopy and animal work already covers the relevant data-integrity principle.

## 5. Core / High priority / Later

### Core

- Project schema, revisions, provenance, atomic persistence, and migration framework.
- Generic experimental-unit and nesting model.
- Western blot and Microscopy entrances.
- D01-D05, D09, and D10, as required by the specification roadmap.
- First statistical foundation in D01 and D02, followed in the same Core development bundle by D03-D05.
- Safe D10 replicate-summary handling for microscopy intensity and other cell/field measurements.
- A generic positive-cell-percentage outcome workflow (cilia-positive cells are one example) that stores positive and total cell counts per biological replicate, derives one percentage per replicate, and feeds D01/D02 or the corresponding multi-group template without treating pooled cells as biological `n`.
- Long-form canonical data with a design-specific paste-friendly sheet projection.
- Individual-dot, paired-dot, grouped-dot, and raw-plus-replicate-summary graph specifications.
- Deterministic recommendation/Why, alternative-analysis eligibility, and analysis history.
- Golden datasets and project round-trip/invalidation tests.

### High priority

- D07 time course and D06 repeated/block mixed-model path.
- General D12 proportion/contingency support for questions that require count/odds modeling rather than biological-replicate percentage comparison, promoted ahead of survival because it is frequent in the user's work.
- D08 dose response.
- Improved nested-model analysis beyond safe replicate summaries.
- Western-blot normalization presets and microscopy binary/count outcomes.
- Cross-platform packaged statistical sidecar and high-fidelity export validation.

### Later

- D11 survival.
- Mass-spectrometry-specific workflows and omics methods.
- Complex GLMMs and advanced nonlinear models beyond the validated standard templates.
- AI-assisted nonstandard consultation or Methods polishing.
- Cryo-ET-specific analysis is not planned.

## 6. Proposed implementation architecture

Proposed repository structure:

```text
apps/
  desktop/             Tauri shell and OS-only integration
  ui/                  React application
packages/
  domain/              IDs, design, unit hierarchy, data and provenance types
  project/             persistence, package format, migrations, recovery
  wizard/              deterministic question/rule engine
  analysis-contracts/  module API and standardized results
  graph-spec/          graph data/appearance specification
  methods/             deterministic Methods templates
  test-fixtures/       golden projects and datasets
engine/
  python/              pinned local sidecar and module runners
docs/
```

Use a pnpm workspace with TypeScript project references. Runtime validation should use a single schema source capable of producing both TypeScript types and JSON Schema. Domain packages contain no React or Tauri imports.

The statistical engine is a local versioned process behind a small JSON request/response protocol. Start with Python/SciPy/statsmodels for D01/D02 and the first core templates. Do not expose Python to the user. Keep the protocol engine-neutral so R can be introduced later for validated mixed models or other areas where it is materially stronger. Engine packages and defaults are pinned and recorded per run.

The initial graph layer should use a declarative graph specification and a vector-capable renderer. Renderer choice is an implementation decision to benchmark during the skeleton/vertical slice; the domain graph schema must not depend on renderer-specific objects.

## 7. Sol / Luna task split

### Sol owns now

- freeze IDs, unit hierarchy, project manifest, project schema v0.2, and migration rules;
- define stale-state propagation and raw revision behavior;
- define Wizard decision model and D01/D02 matching rules;
- define analysis-module and engine contracts;
- specify D01/D02 golden datasets and reference expectations;
- decide Tauri/sidecar packaging boundary and review platform risk;
- review every change affecting schema, statistics, persistence, or reproducibility.

### Luna High-Max can implement after contracts are frozen

- workspace/Tauri/React boilerplate from the approved repository layout;
- Home and Wizard presentation components;
- metadata forms, progress UI, examples, and validation messages;
- Data Sheet grid/paste interaction against an approved adapter interface;
- Recent/Open/Favorites UI and routine persistence adapters;
- individual-dot and paired-dot components against `graph-spec` fixtures;
- unit, component, end-to-end, and documentation additions using approved cases;
- CSS, accessibility, and ordinary refactors.

## 8. Initial development roadmap

### Gate 0 - completed by this review

- specification read and rendered;
- public-use patterns classified;
- cryo-ET-specific work removed;
- architecture, risks, scope, and responsibilities documented.

### Phase 1A - architecture contracts (Sol)

- add architecture decision records for repository/toolchain, project package, unit hierarchy, engine protocol, and graph-spec boundary;
- implement the approved experimental-language pairing/blocking rules in `PAIRING_BLOCKING_WIZARD_RULES_v0.1.md` as versioned decision fixtures before building the Wizard UI;
- define schema v0.2 and migration/test conventions;
- define D01/D02 fixtures, recommendation rules, and result contracts.

Exit: schemas and golden expectations are reviewable without UI code.

### Phase 1B - desktop skeleton (Luna, reviewed by Sol)

- scaffold pnpm, React/TypeScript, Tauri, lint/test/build;
- implement minimal Home shell with the four specified routes;
- add empty project create/save/open round trip using the approved project contract.

Exit: macOS and Windows builds open and reload a versioned empty project.

### Phase 2 - first vertical slice and self-use Core bundle

- Western blot and Microscopy entry cards;
- deterministic Wizard to D01/D02;
- project metadata and design summary;
- generated sheet with multi-cell paste;
- D01/D02 local engine execution, recommendation/Why, alternatives, and history;
- individual-dot and paired-dot graphs;
- save/open, New from design, and Favorite separation;
- golden and round-trip tests.

Exit A: one D01 and one D02 experiment can be created, analyzed, graphed, saved, reopened, and reproduced without Prism.

Immediately extend the same contracts within the Core bundle:

- D03: 3+ independent groups, one factor;
- D04: 3+ matched/repeated groups;
- D05: two independent factors, including interaction and explicit multiple comparisons;
- D10 safe replicate summaries: preserve raw cell/field observations while using the declared biological unit for inference;
- positive-cell percentage workflow: store numerator and denominator for every biological replicate, derive and show each replicate percentage, and route it to D01/D02/D03/D04 according to grouping and pairing;
- D09 correlation before Core completion.

Exit B: the three immediate self-use scenarios below can be completed without restructuring the project schema.

1. Positive-cell percentage by condition (including cilia-positive cells), retaining positive/total counts and biological replicate identity; two independent groups route to D01 and paired groups route to D02.
2. Western blot D/L-condition comparison, mapped to D01 when independent or D02 when matched; use D05/D06 semantics if another factor or repeated block is present.
3. Microscopy intensity comparison across groups, retaining cell/field nesting and using D01/D03/D05 on replicate summaries or D10 when raw nested observations are displayed.

### Phase 3 - remaining Core breadth and provenance

- grouped and nested-data graph specifications and refinement of the Core bundle;
- normalization/QC lineage and stale-result propagation;
- Methods generation and reproducibility export.

### Phase 4 - high-priority research patterns

- D07/D06 repeated time paths;
- general D12 proportion/contingency expansion;
- D08 dose response;
- validated nested models and packaged engine hardening.

## 9. First implementation scope

Implementation starts with a narrow D01/D02 vertical slice so contracts can be verified end to end, but development must continue directly into the self-use Core bundle before declaring the first usable milestone:

1. approved schema/project/module contracts;
2. desktop skeleton and four-entry Home;
3. Western blot and Microscopy Wizard entrances;
4. deterministic mapping to D01/D02 only;
5. metadata and design-aware sheet projection;
6. D01/D02 analysis with golden verification;
7. individual-dot and paired-dot graphs;
8. save/open, new-from-design, favorite, history, and reproducibility round trip.

The immediately following Core extension includes D03-D05, D09, safe D10 replicate summaries, and the generic positive-cell percentage outcome workflow. The latter feeds the existing group-comparison modules and must not be implemented as a separate special-case statistical module.

Rich Inspector, general mixed models, time course, dose response, mass spectrometry, AI integration, and cryo-ET-specific capability do not belong in the first vertical slice. A narrowly validated repeated/block path may be added where required for D/L or other immediate self-use experiments, but it must use the approved D06 contract rather than ad hoc pairing logic.

## 10. Decisions to confirm at the stopping point

The review recommends proceeding with these decisions unless revised:

1. Adopt Tauri + React/TypeScript and a pnpm workspace.
2. Use a generic unit hierarchy and long-form canonical observation model.
3. Use a transparent package containing manifest + SQLite + recoverable raw exports/assets.
4. Use a versioned local Python engine protocol initially, leaving an R adapter boundary for later.
5. Use D01/D02 as the first vertical foundation, then deliver D03-D05, D09, safe D10, and a generic positive-cell percentage outcome workflow that routes into the group-comparison templates.
6. Keep general D12 count/odds modeling and time course as High priority while including ordinary replicate-percentage comparisons in Core.
7. Exclude cryo-ET-specific analysis entirely.
