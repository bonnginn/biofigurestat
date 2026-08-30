# ADR 0045: Pre-500 specialized Core boundaries

## Status

Accepted — 2026-08-24

## Decision

Survival, one-sample inference, categorical repeated states, and visualization-only matrices use explicit versioned contracts rather than masquerading as existing two-group or time-course data.

- D11 / protocol 0.8.0 stores follow-up time and event status and executes Kaplan–Meier plus the k-group log-rank test. Censoring is never encoded as missing.
- D12 / protocol 0.9.0 stores a single cohort and an explicit null value. Descriptive-only projects create no inferential request.
- D13 / protocol 0.10.0 stores ordered categorical state IDs and labels. Its validated balanced repeated-factor calculation reuses D06 mathematics internally, but the public contract, graph labels, provenance, and Methods do not contain fabricated time values.
- Heatmaps are visualization-only Core. Raw rectangular matrix data and explicit transform version are persisted together. Missing cells remain `null`; no normalization is implicit.
- Linked multi-readout and categorical composition retain biological-unit and readout identity. Composition percentages are derived from preserved counts and totals. Inferential compositional testing remains a safe refusal.

Existing project schema 0.3 remains readable. New `matrixViews` is additive with an empty default, avoiding a destructive migration.

## Survival limits

The minimal Core deliberately excludes Cox regression, competing risks, time-varying covariates, frailty, and parametric survival models.

## Heatmap limits

Hierarchical clustering is deferred. Adding it responsibly requires a versioned distance/linkage contract, missing-data policy, deterministic leaf ordering, and validation fixtures. Heatmap export uses the same SVG-to-PNG path as existing graphs.

## Dose-response audit

The current engine can call SciPy, but the product does not yet have a nonlinear-model contract that records parameter bounds, starting-value strategy, convergence diagnostics, weighting, replicate/curve hierarchy, confidence-interval method, or model comparison. A 4-parameter logistic checkbox without those items would be scientifically weaker than a safe refusal.

D08 is therefore deferred until the expanded benchmark establishes priority. A minimal validated implementation should add, in order:

1. an explicit dose/response and biological-curve identity contract;
2. a bounded 4-parameter logistic model using SciPy's maintained optimizer;
3. deterministic starting values and convergence/failure diagnostics;
4. parameter estimates for bottom, top, EC50/IC50, and Hill slope, with tested profile-likelihood or otherwise justified confidence intervals;
5. raw-replicate plus fitted-curve Graph and full Methods provenance;
6. reference fixtures spanning increasing/decreasing curves, unequal dose spacing, replicate curves, weak identification, and non-convergence.

No bespoke optimizer or additional cloud dependency is introduced.
