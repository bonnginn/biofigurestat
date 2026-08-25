# ADR 0048 — Graph Core scientific set and hierarchy semantics

Date: 2026-08-25
Status: Accepted

## Classification

Small reusable Core extension. The change composes the existing experiment/design, analysis-result, and Graph workspace boundaries; it does not introduce a specialist workflow or numerical method.

## Context

Personal Published-Paper Figure Validation Round 4 showed that a scientifically valid analysis can still produce a misleading Figure when four ranges are implicitly treated as one: displayed data, analyzed data, computed comparisons, and visible annotations. It also showed that a flat condition string cannot faithfully express common biological hierarchies such as siRNA target → sequence or Dox → siRNA state.

## Decision

- Persist `displaySet`, `analysisSet`, `comparisonSet`, and `annotationSet` independently in workspace graph state and GraphSpec.
- Require planned comparisons to reference the analysis set and visible annotations to reference the comparison set.
- Retain legacy `selectedConditionIds` and `analysisConditionIds` as compatibility fields while new saves also write the explicit four-set contract.
- Allow an X visual grouping to contain an ordered `factorIds` hierarchy. A single `factorId` remains supported.
- Add explicit Graph metadata for bar outline/mean-marker behavior, box-whisker definition, time-course uncertainty representation and opacity, and continuous-axis minor ticks.
- Use Tukey 1.5×IQR as the box-whisker default. `min_max` remains an explicit alternative.
- Treat minor ticks independently from plot-area grid lines.
- Clip lines and ribbons to the measured X coordinates. Manual axis padding changes the plot region, not the represented data domain.
- Prefer explicit user/design labels, then a conservative humanized fallback. Generic categorical axis titles are omitted when they add no information.

## Compatibility and migration

This is an additive, non-destructive schema extension. Existing GraphSpec `0.1.0` payloads parse with safe defaults:

- empty four-set metadata;
- outlined bars and no duplicate bar mean marker;
- Tukey whiskers;
- error-bar uncertainty;
- minor ticks enabled for continuous axes.

Existing workspace graphs may omit `dataSets`, `factorIds`, and the new appearance fields. Opening them retains legacy behavior; the next save writes the explicit fields. No numerical result is recalculated and no raw or analysis data is migrated.

## Consequences

- Figure-only references no longer imply analysis inclusion.
- A computed comparison can remain hidden without deleting the analysis result.
- Visual series never imply pairing; pairing continues to come from design metadata.
- Hierarchical categorical layouts can use parent-group spacing without repeating raw condition prefixes.
- Graph appearance changes remain independent of numerical analysis execution.
