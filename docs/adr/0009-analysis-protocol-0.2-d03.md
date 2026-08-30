# ADR 0009: Analysis protocol 0.2 for D03

## Status

Accepted for the D03 engine foundation.

## Context

Protocol 0.1 represents exactly two conditions with a required two-condition contrast. Reusing that shape for a 3+ group omnibus analysis would hide the analyzed family of conditions and make multiple-comparison behavior ambiguous. Existing saved D01/D02 projects must remain readable and reproducible.

## Decision

- Preserve protocol 0.1 unchanged for D01/D02 requests.
- Add protocol 0.2 for D03 requests with an explicit ordered `conditionIds` family and a separate two-condition `primaryContrastConditionIds` field.
- Keep the persisted request schema as a discriminated union so existing protocol 0.1 projects remain valid without migration.
- Use Welch one-way ANOVA as the D03 variance-robust default.
- Execute Games-Howell all-pairs comparisons as an explicit multiplicity procedure. Store unadjusted pairwise Welch p-values and Games-Howell adjusted p-values separately.
- Reject fewer than two biological units per condition, duplicate analyzed experimental units, nested/blocked units promoted to biological n, non-finite values, and zero within-group variance.
- Report the omnibus F statistic and both degrees of freedom, Welch-compatible Cohen f, pairwise mean differences with simultaneous confidence intervals, pairwise Welch statistics, and Hedges g.
- Increment the local engine version to 0.2.0. Numerical validation compares the omnibus result and effect size with Statsmodels 0.14.6 and fixes Games-Howell outputs in golden tests.

## Consequences

D03 can be tested and packaged before its 3+ group Data Sheet and Wizard UI are exposed. D01/D02 numerical behavior and stored protocol remain unchanged. D04 and D05 must receive their own explicit request shapes rather than overloading the D03 condition-family contract.
