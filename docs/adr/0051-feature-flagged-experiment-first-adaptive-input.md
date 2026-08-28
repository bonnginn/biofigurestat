# ADR 0051: Feature-flagged experiment-first adaptive input

Date: 2026-08-26

## Status

Accepted for Alpha implementation.

## Classification

Small reusable Core extension. It composes the existing design, data, project, graph, and analysis
boundaries but adds one new versioned semantic contract and canonical-observation adapter.

## Decision

The Alpha path is:

`minimal biological questions → StructureContract → deterministic surface selector → adaptive surface → canonical observations → legacy ExperimentDesign projection`

The adaptive path is feature-flagged and the current wizard remains available. A saved workspace
may contain an optional, independently versioned adaptive-input snapshot with the structure
contract, selected surface, confirmed column mapping, raw lineage, canonical observations, and
dual-write equivalence result.

The existing `ExperimentDesign` remains the analysis compatibility projection. Projection is
allowed only when all analysis-relevant semantics can be represented. A mismatch or unsupported
relationship returns `NOT_REPRESENTABLE`; it never substitutes a nearby supported design.

Five surfaces are fixed for Alpha: compact unit matrix, factor-aware observation table,
repeated-axis matrix, nested observation table, and typed record table. They share clipboard,
CSV, TSV, and generic delimited-file parsing.

Targeted confirmation is emitted only when an answer changes unit identity, relationship,
hierarchy, axis identity retention, reference meaning, or missingness classification. Surface
shape and statistical-test terminology are not questions.

## Persistence and compatibility

Old projects without an adaptive snapshot open unchanged. New adaptive projects dual-write the
snapshot and existing project state. Save/open validates both and re-runs the equivalence assertion.
No migration-on-open invents an adaptive contract for an old project.

## Deferred

Vendor-specific importers, free-text metadata extraction, DAG/crossed unit ownership,
many-to-many matching, and automatic coercion of unsupported designs.

Pool D is not used by this implementation.

## Researcher-facing clarification / evidence boundary — 2026-08-26

- The current StructureContract authoring form is a production-connected scaffold for architecture
  validation, debugging, and advanced contract inspection. It is not the final researcher-facing
  entry UI.
- The general entry path asks biological questions that a researcher can answer from facts about
  what was done, measured, treated, sampled, retained, or observed in the experiment.
- Navigation from those answers to StructureContract is deterministic and rule-based. The product
  does not depend on an LLM API to interpret free text or create the semantic structure.
- StructureContract names and data-model terms are internal by default. They are exposed only when
  needed for advanced inspection, diagnostics, or an explicitly advanced workflow.
- A one-screen progressive-disclosure experiment builder is the leading researcher-facing UI
  candidate. Only questions made relevant by earlier answers are revealed, prior answers remain
  visible and editable, and a researcher-readable structure summary remains in view.
- Schema-first spreadsheet or file mapping is an advanced ingress into the same StructureContract,
  not the primary general-researcher entry path.
- The recorded 65/65 result is evidence that the StructureContract, selector, adaptive surfaces,
  canonical-observation path, and compatibility projection can express the frozen cases. It is not
  a human-navigation success rate.
- Initial researchers have not yet been shown to reach the correct StructureContract by answering
  only the intended biological questions. Human navigation therefore remains unvalidated.
- The next product gate is Biological Interview v1 followed by a deterministic blind navigation
  test of biological answers → rule-based mapping → StructureContract. Direct LLM-to-contract JSON
  generation is not a substitute for that gate.
