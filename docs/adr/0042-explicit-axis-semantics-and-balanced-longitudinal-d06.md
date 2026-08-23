# ADR 0042: Explicit axis semantics and balanced longitudinal D06

- Status: Accepted
- Date: 2026-08-24

## Context

The graph workspace previously inferred that every numeric repeated axis was time. That made a numeric covariate such as Sholl radius appear with time wording and units. Longitudinal scientific questions were also reduced to an endpoint, AUC, or other one-value-per-unit summary before analysis, even when the intended question was the overall condition-by-time response. Statistical annotations showed a p-value without naming the reduced metric, window, or omnibus effect that produced it.

## Decision

Graph state now stores an explicit X-axis semantic (`categorical`, `time`, or `numeric_covariate`), title, and unit. Missing fields in older project state receive non-destructive defaults. Rendering uses these fields and no longer derives an axis heading from the time-entry UI alone.

D06 is the reserved Core route for a conservative first condition-by-time repeated analysis. It accepts only complete, balanced designs with:

- at least two independent conditions;
- at least two repeated numeric points;
- stable experimental-unit identity within each condition;
- at least two complete units per condition; and
- equal unit counts across conditions.

The engine evaluates the condition-by-time interaction first, then the between-unit condition effect and within-unit time effect. The condition denominator is subject-within-condition; the time and interaction denominator is the within-subject error. Incomplete or unbalanced data are refused rather than silently filtered or treated as independent observations. A validated mixed-effects model remains the future route for those cases.

Statistical graph annotations include the executed method and the exact selected time point, derived metric/window, or D06 interaction context. They do not imply full-curve inference when the executed request analyzed only a reduced metric.

PNG rasterization paints an opaque white background before drawing the SVG. Default graph typography is increased modestly, and the redundant generic `条件` hierarchy heading is suppressed while condition values remain visible.

## Consequences

- Numeric covariates can be represented without false temporal provenance.
- NC027, JCB011, and similar balanced complete longitudinal cases can use a supported overall repeated-factor analysis without discarding identity.
- JCB024 remains a one-factor matched-condition D04 case unless its design is explicitly represented as condition-by-time D06.
- Missing or unbalanced longitudinal cases remain explicitly unsupported instead of receiving an unsafe approximation.
- Existing saved graphs remain readable through schema defaults; no destructive migration is required.
