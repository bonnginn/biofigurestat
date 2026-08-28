# ADR 0050 — Basic nonlinear XY fitting

Date: 2026-08-25  
Status: accepted for Alpha Core

## Decision

Add versioned `D17` nonlinear XY fitting as a generic local-engine capability. The initial model library is deliberately limited to:

- `one_phase_association`: free baseline, plateau, and rate;
- `zero_baseline_association`: plateau and rate with baseline fixed to zero.

The Python/SciPy engine is authoritative. A Graph may render only the fitted curve stored in the saved D17 result; it must not create a cosmetic spline or recalculate a fit after appearance edits.

Requests preserve model identity, scientific rationale, series identity, raw X/Y points, initial values, and parameter bounds. Results preserve the model formula/version, parameter estimates and uncertainty, RSS, RMSE, R², AIC, residual degrees of freedom, the authoritative fitted curve, engine/package versions, starts, and bounds.

Flat data, insufficient distinct X values, invalid bounds/starts, non-finite or singular covariance, and non-convergent fits are refused explicitly.

## PFR062 application

PFR062 uses `zero_baseline_association`. Its X variable is reaction time, so Michaelis–Menten was not used. The source context does not state a fit equation; the selected one-phase saturating model is therefore recorded as an app-derived analysis choice. K5 and K14 are fitted independently from their observed synthetic points.

## Scope boundary

This is not a broad kinetic-model library. Hill models, Michaelis–Menten beyond the bounded extension below, inhibition models, shared-parameter global fits, weighting, bootstrap intervals, model selection, and profile-likelihood intervals remain outside this Alpha increment.

## Addendum — 2026-08-27: bounded Michaelis–Menten extension

The accepted D17 boundary is extended with one explicit `michaelis_menten` model for experiments in which X is substrate concentration and Y is an initial velocity already calculated before the nonlinear fit. The model is `vmax * x / (km + x)` with positive `vmax` and `km`. New Michaelis–Menten requests use D17 template version `0.2.0`; protocol `0.14.0` remains compatible with existing saved association requests, and the initial Michaelis–Menten model version is `0.1.0`.

Substrate-concentration and initial-velocity units are required because they define the units of Km and Vmax. Each fitted series requires at least three distinct positive substrate concentrations and at least one positive observed initial velocity. Invalid bounds, non-positive starting values, flat data, singular uncertainty, and non-convergence remain explicit failures. A fit whose observed substrate range does not reach the fitted Km retains its result but records an extrapolation warning.

Numerical regression uses the official R `datasets::Puromycin` Michaelis–Menten `nls` example as an independent reference. The unweighted treated reference is Vmax approximately `212.68358` and Km approximately `0.06412103`; the untreated reference is Vmax approximately `160.28013` and Km approximately `0.04770831`.

This extension does not convert raw absorbance-over-time traces into initial velocities. It also does not add Hill, substrate-inhibition, IC50/Ki, inhibitor-grid, weighted, shared-parameter/global, mixed-effects, or between-curve hypothesis tests. Those inputs must retain their raw data and stop at the relevant unsupported or derivation-required boundary rather than being coerced into Michaelis–Menten.
