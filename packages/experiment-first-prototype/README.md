# Experiment-first adaptive-input prototype

This private package is isolated from the production wizard. Its original benchmark compiles a
biology-first structure contract, chooses one of five generic input surfaces, materializes
paste/import payloads, and evaluates the frozen 45-case Gold set plus a separate 20-case stress set.
The newer staged-entry prototype adds Canvas and observation-pattern layers before the complete
design/statistics contract so that data and Graph can become available at the earliest safe point.

`src/contract.ts` remains the design/statistics contract and `structure-contract.schema.json` is
its portable schema. Progressive entry additionally retains `ExperimentCanvas` and
`ObservationPatternSet` as the versioned authority for condition topology and observation-entry
semantics that Contract 0.1 cannot store losslessly. The prototype deliberately does not import
production UI components and is not exported by another workspace package.

Run with the repository Node runtime:

```text
pnpm --filter @lsaa/experiment-first-prototype test
pnpm --filter @lsaa/experiment-first-prototype typecheck
```

The default `test` and `test:staged-entry` commands are non-generating. `evaluate` is the explicit
artifact-writing command: it regenerates evidence under `prototype-runs/` and `stress/`, but does
not modify `gold-set-45.json`, the original manual evidence, or Pool D. Do not run `evaluate` when
historical generated evidence must remain byte-for-byte untouched.

The generated HTML is a semantic table preview, not a production UI proposal. Payload burden
is measured as paste/file operations into these generated surfaces; current-workflow burden for
cases beyond the manually assessed original set remains a screening estimate and is labeled as
such in each trace.

`src/experiment-canvas.ts`, `src/observation-pattern.ts`, and `src/staged-readiness.ts` add an
isolated progressive-entry prototype. Condition combinations are separated from the grain,
multiplicity, identity, axes, and material continuity of observations inside each condition. The
deterministic selector uses Canvas + ObservationPatternSet and never infers biological `n` from row
count or matrix shape. It emits one of the same five surface families for each distinct record set,
so readouts collected at different grains become separate sections rather than one flattened table.

`src/experiment-canvas-builder.ts` maps either guided condition answers or a directly edited
condition matrix into `ExperimentCanvas 0.2.0-prototype`. It represents target/group headers
separately from selectable conditions and leaves unlisted combinations unknown unless the
researcher explicitly chooses another default.

`src/observation-interview.ts` is the isolated deterministic bridge from structured, researcher-fact
answers to ObservationPatternSet. It contains no free-text semantic extraction and records its safe
inferences. Unknown alignment or same-entity material continuity opens a targeted question; an
irrecoverable linkage is retained and cannot unlock an aligned matrix.

`src/progressive-snapshot.ts` (`0.2.0-prototype`) retains the Canvas, active and pending PatternSet,
surface sections, records and eligibility, raw lineage, design-projection diagnostics, and active
or invalidated comparison scopes. Its JSON round-trip is an isolated semantic test, not a
production save/open guarantee.

`src/analysis-scope.ts` creates an explicit comparison-scoped view when a sparse full experiment
cannot be represented by Contract 0.1. It accepts only performed/readout-measured cells that form a
complete Cartesian subset, never supplies an absent condition, preserves scientific grouping in
provenance, turns fixed conditions into explicit context rather than singleton factors, stops group
flattening, requires a targeted matching fact when pruning can change mixed/matched semantics,
regenerates raw grain from the retained record set, and leaves the full Canvas, PatternSet, and raw
data unchanged.

A researcher-editable plan can become graph-ready before statistics-only facts are collected.
Capability gates request only facts required by the graph, analysis, or Methods action currently
requested; irrecoverable identities stop the affected capability without deleting the canvas or
staged data. Run `test:staged-entry` for the non-generating semantic and UI-state regression suite;
it does not rewrite evaluation artifacts. The complete non-generating package suite currently
covers 145/145 tests.

`ui-prototype/` is the current first-use interaction scaffold. It offers three converging routes:
short experiment-language questions, an Excel-like condition-plan paste, and examples that only
fill the question form until the researcher explicitly builds the plan. A three-state condition
table is followed by the minimum question about values inside one condition. Graphing becomes
available when values exist; Statistics then asks for an explicit valid comparison scope and the
remaining biological facts. Example observations carry explicit provenance and cannot replace
researcher records; sample-only Graph previews cannot unlock Statistics. The observation guide
distinguishes the literal same object, separate samples split from one donor/material source, and
merely using the same cell line/type. Nested entry columns are generated from researcher-named
parent/child levels rather than fixed dish/field/Cell columns. Pasted measurement rows are committed
atomically, duplicate repeated/matched coordinates remain visibly separate and stop Statistics,
and Statistics answers are isolated by comparison scope and structure revision. Rebuilding a
populated custom plan creates a separately selectable draft, so the earlier values remain
accessible. The UI intentionally stops combined nested-plus-repeated entry rather than coercing it
into either simpler table; Core expressiveness for that structure is tested separately, while the
researcher-facing multi-section editor remains a bounded UI gap.

The condition-plan and measurement surfaces now share a spreadsheet interaction grammar without
making spreadsheet shape the semantic source. A researcher can type into ordinary cells or paste a
rectangular TSV range; the directly edited condition sheet is still passed through the same
deterministic condition-plan mapper. The generated measurement surface fixes condition membership
as a non-editable group heading instead of repeating a full condition selector in every row.
Independent and nested records have separate row lists per condition, so unequal n is retained and
row position never implies pairing. Repeated and matched surfaces retain their identity-aligned
matrices. Positive count, total count, and computed percentage occupy separate cells on every
surface. Range paste grows only the selected performed condition list, is atomic on failure, keeps
empty cells missing rather than zero, and never aggregates or replaces canonical observations.
