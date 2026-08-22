# ADR 0011: Analysis protocol 0.3 for complete D04 repeated measurements

## Status

Accepted for the D04 Core implementation.

## Context

D03 and D04 can produce visually similar multi-condition dot plots, but their inferential units differ. D03 assigns separate biological units to conditions. D04 measures the same declared unit or complete block in every condition. Treating D04 observations as independent discards correspondence; inferring correspondence from row order risks false pairing.

## Decision

- Preserve protocols 0.1 and 0.2 for D01/D02 and D03.
- Add protocol 0.3 for D04 with an ordered `conditionIds` family and an explicit `pairId` on every observation.
- Accept complete repeated units only in the first implementation. Reject missing conditions, duplicate pair-condition values, undeclared conditions, non-finite values, and fewer than two complete units.
- Use one-factor repeated-measures ANOVA as the bounded default and report partial eta-squared.
- Report all paired comparisons with Holm-adjusted p-values. Pairwise confidence intervals use a Bonferroni simultaneous confidence level, recorded explicitly in diagnostics.
- Do not claim or estimate sphericity correction in this bounded implementation. Record that limitation and direct non-defensible designs to a mixed model rather than silently applying an unvalidated correction.
- Use explicit pair IDs for both analysis and graph connections; row order never creates a pair.
- Increment the local engine to 0.3.0 and validate the omnibus result independently against Statsmodels `AnovaRM`.

## Consequences

D04 is separate from D03 at the request, engine, and data-sheet boundaries. Complete repeated designs are reproducible and saved projects retain correspondence. Designs with missing repeated measurements, complex covariance, or additional factors remain outside this implementation and require a later validated mixed-model route.
