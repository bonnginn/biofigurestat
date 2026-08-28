# ADR 0052: Progressive semantic readiness for experiment entry

Date: 2026-08-27

## Status

Accepted for the Alpha prototype direction. Isolated semantic contracts, regression rules,
selected browser interaction mechanics, and an isolated semantic snapshot/JSON round trip have
automated prototype evidence. This acceptance authorizes the staged semantic architecture and the
next prototype work; it does not approve production migration or claim human validation.
Researcher navigation and editing usability, production save/open and live remapping, and
production UI remain unvalidated and unapproved.

## Classification

Small reusable Core extension to ADR 0051. It adds versioned entry/observation semantics and changes
when facts are required, without changing the domain ownership of canonical observations, Graph,
Statistics, or Methods. It amends ADR 0051 only for Alpha prototype entry ordering, saved adaptive
snapshot contents, and the next human-navigation gate.

## Context

The architecture and evidence recorded with ADR 0051 start from a complete StructureContract
followed by an adaptive input surface. Subsequent
human review found that requiring every statistics-relevant biological fact before any data entry
or graphing would make common Graph-only work unnecessarily long. A condition matrix also proved a
more understandable way to describe multi-treatment experiments than asking for one global
treatment receiver before the condition plan exists.

## Decision

Introduce a versioned, researcher-editable `ExperimentCanvas` (`0.2.0-prototype` in the isolated
implementation) before the complete StructureContract. The canvas records conditions,
non-selectable value groups such as multiple siRNAs for one target, actual/sparse combinations,
and readout bundles.
It can be created by short biological prompts or direct editing/paste of a condition plan. Both
routes are deterministic and converge on the same canvas; condition-plan paste is not schema-first
raw-data import.

Before a structured data-entry surface is selected, collect the minimum facts about how values were
obtained. Store them in a versioned `ObservationPatternSet` (`0.3.0-prototype` in the isolated
implementation): observation levels and multiplicity,
readout-to-condition bindings, identities and their availability/origin, ordered or nominal axes,
identity behaviour along each axis, material continuity, and record-set grain. The accepted Alpha
prototype order is:

`biological plan questions / editable condition canvas → ExperimentCanvas → minimum observation-pattern questions → ObservationPatternSet → deterministic adaptive surface section(s) → observation mapping → graph → statistics-only facts → explicit comparison scope when needed → complete full/scoped StructureContract → Methods`

Capabilities are gated independently:

`data retained → adaptive structured input → graph preview → structured graph → statistics → methods`

Each gate requests only semantic facts required by that action. Raw values and lineage may be staged
before the observation pattern is complete, but deterministic structured-surface selection requires
the relevant ObservationPatternSet. Ordinary summary graphs do not require biological independence
or replication questions. Paired lines and individual trajectories require recoverable identity.
Statistics requires experimental unit, receiver, source/split lineage, independent replication, and
only the matching, hierarchy, axis, missingness, and comparison facts present in that experiment.
Methods additionally requires the executed analysis record.

A capability may be `READY`, `NEED_MORE_INFORMATION`, or `SAFE_UNSUPPORTED`. A stopped capability
does not delete the canvas, raw data, or graphs that remain valid. Irrecoverable matching never
falls back to an independent analysis.

For an incomplete condition plan, Statistics may create a comparison-scoped semantic view only
from condition cells that were performed and have the selected readout. The selected cells must
form a complete Cartesian subset. The mapper never supplies an absent combination or treats every
performed cell as a complete factorial. The scoped contract does not replace the full Canvas:
unselected conditions, non-selectable scientific grouping, raw observations, and their lineage stay
in the project snapshot. A condition fixed within the scope becomes recorded context rather than a
meaningless one-level factor. A selection that varies across grouping Contract 0.1.0 cannot preserve
stops instead of flattening the groups. Thus a valid within-sequence comparison may be available
while a full factor interaction remains stopped.
When pruning could change matched or mixed relationships, matching is not copied from the full
experiment: one targeted scoped fact is required. The selected raw-observation grain is regenerated
from the retained record set rather than copied from a removed readout or hierarchy.

The full StructureContract remains authoritative for design/statistics semantics once its required
facts are resolved. `ExperimentCanvas + ObservationPatternSet + mapping/raw lineage` remain the
versioned authority for entry and observation semantics. They are not discarded after contract
generation because StructureContract 0.1.0 cannot losslessly store multiplicity, per-readout grain,
condition/readout bindings, identity availability/origin, irregular schedules, nominal acquisition
coordinates, or physical-material continuity. A partial draft must not be persisted or presented as
a valid complete StructureContract.

The saved adaptive snapshot must therefore include the Canvas and active or pending PatternSet,
their schema versions and provenance, surface-section plan, records and eligibility, mapping
decisions, raw lineage, the complete full/scoped StructureContract when available, and the existing
dual-write/equivalence diagnostics. The isolated `ProgressiveEntrySnapshot 0.2.0-prototype` now
exercises this semantic shape, active-scope provenance, invalidated-scope retention, and JSON round
trip; this is not evidence for production save/open.

## Consequences and remaining production/human-validation gates

- The five Alpha surface families remain fixed unless a separate architecture decision changes
  them. One experiment may generate more than one section when readouts have different record
  grains; each section still uses one of the five families. Their deterministic selection and the
  fields shown within a family may vary as semantic depth increases. Preserving values and raw
  lineage through production save/open and live remapping remains an unvalidated production-acceptance
  requirement.
- Graph-only entry may contain aggregated values insufficient for later inference. The graph stays
  available while Statistics identifies the missing observation grain.
- Survival graphing requires event/censoring meaning earlier than ordinary graphing.
- The former Biological Interview blind materials must be revised to test canvas-assisted staged
  navigation. The frozen Round 1 must not begin against the obsolete all-upfront flow.
- Production migration remains feature-flagged and does not replace the current workflow until
  human navigation and editing usability are validated.
