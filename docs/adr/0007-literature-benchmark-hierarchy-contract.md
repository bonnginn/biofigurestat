# ADR 0007: Literature benchmark hierarchy contract

Status: accepted for `LSA50_v1_1` corrected runtime.

## Context

The immutable v1.1 source workbook can describe independent experimental sessions in the Researcher Packet while leaving row-level `parent_unit_id` empty. JCB003 also computed its original Gold result from cell rows. A loader that falls back from a missing parent to `unit_id` consequently treats cells as biological `n`.

## Contract

Each runtime row represents one observation. Its identifiers have these meanings:

- `unit_id`: identity of the observed unit at the row level; it is the statistical unit only for a flat design.
- `parent_unit_id`: explicit biological/statistical parent for nested observations.
- `experiment_id`: experimental-session provenance. It is not automatically the statistical unit, but a versioned correction may copy it to `parent_unit_id` when the source unambiguously declares sessions as the independent units.
- `condition`, `time`, and `readout`: the analysis cell occupied by the observation.

The resolution path is:

1. The Researcher Packet declares the unit, nesting, and repeated-identity semantics.
2. Synthetic rows must encode those semantics without inference from row count.
3. Nested observations resolve through `parent_unit_id`; flat observations through `unit_id`.
4. Paired and longitudinal designs preserve `unit_id` across conditions or time. Cross-sectional designs must not share it across time.
5. Multi-readout cases preserve a unit across readouts, or use `experiment_id + condition` only when every feature/readout is complete for that identity.
6. The Gold input and loader-required unit count must use the same resolved identities.

If a packet declares nesting and any row lacks its parent, loading and preflight fail. More lower-level observations may change a unit summary but can never increase biological `n`.

## JCB003 correction

The original workbook remains unchanged and SHA-256-addressed. The versioned runtime correction maps each JCB003 row's `experiment_id` to `parent_unit_id`, declares the experimental session as the statistical unit, and recomputes the Gold Welch test from three session means per condition. This is a benchmark-data/schema correction, not a product statistical behavior change.

## Gate

`scripts/audit_literature_hierarchy.py` classifies all cases as `HIERARCHY_PASS`, `HIERARCHY_AMBIGUOUS`, `HIERARCHY_CONFLICT`, or `NOT_APPLICABLE`. The formal external pilot may receive only frozen cases that pass this gate.
