# ADR 0029: Time-series metrics require stable repeated-unit identity

Status: Accepted

## Decision

Core supports restrained per-unit time-series transformations: selected time value, endpoint, maximum, minimum, trapezoidal AUC, change from baseline, and F/F0. A common inclusive analysis window and an optional explicit baseline time are persisted with the graph-linked analysis.

These transformations are available only when the design declares that the same experimental unit is followed over time. Merely using Time on the x-axis or placing measurements in one experiment tab does not establish longitudinal identity. Cross-sectional designs continue to compare an explicitly selected time point.

The raw time series remains unchanged. Each derived value stores its transformation version, window, metric, raw revision, source observation IDs, source unit IDs, and experimental-unit identity. A changed upstream revision invalidates the dependent analysis through the existing project-state rules.

## Consequences

- A graph may display the full trace while its saved analysis compares a derived per-unit metric.
- Missing or duplicate times, a zero F0, or an invalid window produce no invented value.
- Specialized peak/event detection and interpolation remain out of scope.
