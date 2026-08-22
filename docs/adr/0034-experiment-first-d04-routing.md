# ADR 0034: Explicit same-unit multi-condition designs route to D04

Status: Accepted

## Decision

An experiment-first design with one condition dimension, three or more conditions, and explicit stable matched-unit identity routes complete matched units to the existing deterministic D04 repeated-measures ANOVA and Holm paired-comparison contract.

Dates, experiment tabs, cell line, passage, or batch never create pairing. Incomplete units are identified; only complete units may enter the current D04 engine, and the recommendation states this. Matched multi-factor designs and cases needing mixed models remain Graph-only with an explanation.

## Consequences

- The redesigned UX now reaches the already validated repeated-measures backend instead of stopping at paired two-condition analysis.
- Missing or structurally unsupported repeated data never fall through to an independent one-way analysis.
