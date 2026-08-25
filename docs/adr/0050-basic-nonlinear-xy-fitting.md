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

This is not a broad kinetic-model library. Hill models, Michaelis–Menten, inhibition models, shared-parameter global fits, weighting, bootstrap intervals, model selection, and profile-likelihood intervals remain outside this Alpha increment.
