# Known Alpha Limitations

- Only validated experiment structures and statistical modules are supported. The application refuses unsupported structures instead of selecting a superficially similar test.
- Full mixed-effects, advanced survival models (Cox/competing risks), arbitrary robust/nonparametric factorial, high-dimensional feature inference, and arbitrary composition inference are not generally available. Minimal Kaplan–Meier/log-rank and visualization-only heatmaps are available.
- Crossed within-unit factors such as hemisphere × time within the same mouse and nested XY inference are display-only/unsupported; ordinary ANOVA, correlation, or regression is not substituted silently.
- Nonlinear XY fitting is intentionally bounded to zero-baseline association, one-phase association, and Michaelis–Menten for substrate concentration versus precomputed initial velocity. Raw trace-to-velocity derivation, global/shared-parameter fitting, weighting, broad dose-response/model libraries, inhibition models, and formal model comparison are not part of Alpha.
- Some defensible workflows require endpoint, AUC, or maximum summaries and must be classified as a Reasonable workaround when the reduction is scientifically material.
- Contextual Help is explanatory and local/deterministic. It does not calculate results or edit the project.
- BioFigureStat is released under the MIT License. The existing bundle identifier is retained for `.lsa` compatibility; this is not a trademark-clearance claim.
- The Public Alpha macOS build is ad-hoc signed and not Apple-notarized. Gatekeeper may require an explicit user approval to open it.
- The Public Alpha Windows x64 NSIS installer is unsigned. Windows SmartScreen may show an unknown-publisher warning.
- Expanded benchmark Rounds 1–3, unseen Pool C validation, and the 35-case context-rich Graph audit are complete. Pool D remains sealed. Passing Alpha gates does not establish comprehensive validation for unsupported workflows.
