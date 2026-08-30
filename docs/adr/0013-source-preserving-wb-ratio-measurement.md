# ADR 0013: Source-preserving WB ratio measurement

Date: 2026-08-20  
Status: Accepted for the first re-editable WB workflow

## Context

The first WB screen accepted only a normalized scalar per biological replicate. That is sufficient
for analysis, but it cannot reproduce or edit the target/loading-control calculation. Persisting only
the quotient would conflict with the project's raw-data-integrity requirement.

The immediate self-use case is a two-condition D01/D02 comparison. A broader transformation graph
and multi-band WB model remain later work.

## Decision

Add a versioned `loading_control_ratio` measurement value containing:

- the target-band intensity;
- the loading-control intensity;
- the transformation version.

The analyzed scalar is always derived as `target / loadingControl`. The denominator must be greater
than zero and neither source intensity is overwritten. The canonical recovery CSV receives explicit
columns for both intensities and the transformation version. Saved projects rehydrate the composite
measurement so either source value can be edited and the ratio recalculated.

The existing D01/D02 analysis request remains a scalar protocol: its request builder performs the
declared deterministic derivation and the project validator independently reproduces the same value
from the persisted measurement. The statistical engine therefore does not need WB-specific logic.

## Boundaries

- This first raw-band editor is exposed only for two-condition D01/D02 workflows.
- D03-D05 continue to accept an already normalized scalar until their composite WB editors are added.
- The composite value represents exactly one target band and one loading-control band from the same
  biological replicate. Multiple targets, multiple loading controls, lane-level image provenance,
  background subtraction, and control-equals-one transformations require the later transformation
  graph and must not be inferred implicitly.
- A biological replicate remains the statistical unit; bands and lanes are not promoted to `n`.

## Consequences

The frequent d/L WB comparison becomes re-editable without adding WB-specific statistical branches.
Raw source values remain available in both the project database and recovery CSV. Future migration to
a general transformation graph can expand this composite record into explicit source observations
because its semantics and version are recorded.
