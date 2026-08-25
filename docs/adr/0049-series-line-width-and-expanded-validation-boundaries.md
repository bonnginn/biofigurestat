# ADR 0049: Series line width and expanded-validation boundaries

## Status

Accepted — 2026-08-25

## Context

Expanded personal validation PFR045 requires five simultaneously visible time-course series whose color, line style, width, visibility, and legend representation remain synchronized. Color, line style, order, label, and visibility were already persisted per series; width was global only. PFR062 requires an authoritative nonlinear kinetic fit, while Core has no versioned nonlinear-fit contract.

## Decision

- Add optional per-series `lineWidth` (0.5–8) to GraphSpec and persisted workspace graph state. Old projects retain the existing global summary-line width.
- The final renderer and legend resolve line style and width from the same per-series record. Hidden series continue to be excluded through the existing series-resolution path.
- Treat this as a small reusable Graph Core extension, not a PFR045 case exception.
- Do not implement a PFR062-only nonlinear optimizer or render a cosmetic spline. PFR062 records `SCIENTIFIC_ENGINE_GAP` and an explicit unsupported fit while preserving observed kinetic points.

## Compatibility

The field is optional and additive. Existing schema versions and saved projects remain readable; no destructive migration is required.

## Nonlinear-fit boundary

A future implementation must version model identity, parameter units/bounds, deterministic starting values, weighting, replicate/curve hierarchy, convergence and failure diagnostics, uncertainty method, fit provenance, and Graph linkage. Ordinary linear regression is not an acceptable substitute for the specified enzymatic kinetic fit.
