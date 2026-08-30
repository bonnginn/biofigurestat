# ADR 0028: Experiment-first WB ratio retains both source bands

Status: Accepted

## Decision

The protein/biochemical entrance can create a generic Western blot readout with one target band and one named reference/loading control. Each experiment-unit cell stores both nonnegative target intensity and positive reference intensity. The displayed and analyzed value is derived deterministically as `target / reference`.

The canonical observation uses the existing versioned `loading_control_ratio` measurement. The design records a loading-control normalization plan with the reference label and formula. Project save/open restores the two source values rather than only the quotient.

## Consequences

- Excel-style two-column rectangular paste is supported.
- Ordinary validated continuous-outcome graph and statistical modules can consume the ratio.
- Reference zero and incomplete pairs do not produce an analyzed value.
- Control-equals-one, baseline, maximum, and multi-band normalization remain explicit later transformations; they are never applied silently.
