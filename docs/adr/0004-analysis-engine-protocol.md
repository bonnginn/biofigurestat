# ADR 0004: Versioned local analysis engine protocol

Status: accepted for D01/D02 foundation.

## Decision

Statistical modules communicate with a local engine through a small versioned JSON request/result protocol. The first packaged implementation will use pinned Python/SciPy/statsmodels components. The protocol does not expose Python-specific objects and permits a later R adapter.

## Result contract

Retain engine/package versions, estimates, confidence intervals, test statistic, degrees of freedom, p-values, adjusted p-values, effect sizes, diagnostics, and warnings. Methods text is generated from executed settings, not from an LLM.

## Validation

Each analysis template has golden datasets compared with an independent mature reference implementation. Engine upgrades require golden comparison and an explicit recorded version change.
