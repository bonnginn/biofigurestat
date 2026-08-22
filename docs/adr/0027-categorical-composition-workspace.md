# ADR 0027: Categorical composition is a source-count workflow

Status: Accepted

## Decision

Core supports mutually exclusive category counts per experiment unit as `categorical_counts` measurements. The workspace keeps every category count, derives totals and percentages, and offers stacked-count, 100%-stacked, and category-percentage graphs.

Category observations are not silently coerced to one continuous scalar. Until a separately validated categorical-analysis contract exists, t tests and ANOVA are reported as unsupported while graphing and export remain available.

## Consequences

- Counts remain recoverable and percentages are deterministic derived display values.
- Multiple categories are visually distinguishable even when the general graph palette is set to single color.
- A categorical inference module can be added later without migrating invented scalar values.
