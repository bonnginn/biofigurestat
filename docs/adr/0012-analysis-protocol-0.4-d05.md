# ADR 0012: Analysis protocol 0.4 for complete independent D05 factorial designs

## Status

Accepted for the bounded D05 Core implementation.

## Context

Rescue, epistasis, drug, light, and genotype experiments frequently combine two factors. Flattening the four or more factorial cells into a one-way test loses the interaction, while interpreting main effects without checking interaction can be misleading. Factor identities and level assignments must remain reproducible in the engine request.

## Decision

- Add protocol 0.4 with exactly two ordered factors, their ordered levels, and an explicit mapping from every condition to one level of each factor.
- Require a complete Cartesian product with one condition per factorial cell and at least two independent biological units per cell.
- Reject repeated, nested, duplicate, undeclared, or non-finite analyzed units rather than silently counting them as independent observations.
- Fit the complete OLS model using sum-to-zero contrasts and report Type III tests in the order interaction, factor A, factor B. Report partial eta-squared for each.
- Show the interaction before averaged main effects in the UI and Methods output.
- Provide transparent all-cell Welch comparisons with Holm-adjusted p-values. Their confidence intervals use a Bonferroni simultaneous level recorded in diagnostics.
- Keep mixed/repeated factorial designs and incomplete factorial cells outside this bounded implementation.
- Increment the local engine to 0.4.0 and validate all three Type III F tests against Statsmodels with sum contrasts.

## Consequences

D05 preserves the factorial meaning in saved requests and does not overload D03. The conservative all-cell comparison family is general and reproducible, although later UI may add predeclared simple-effect contrast families. More complex repeated or mixed factorial experiments require a separately validated mixed-model protocol.
