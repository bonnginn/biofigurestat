# Known Alpha Limitations

- Only validated experiment structures and statistical modules are supported. The application refuses unsupported structures instead of selecting a superficially similar test.
- Full mixed-effects, advanced survival models (Cox/competing risks), arbitrary robust/nonparametric factorial, high-dimensional feature inference, and arbitrary composition inference are not generally available. Minimal Kaplan–Meier/log-rank and visualization-only heatmaps are available.
- Some defensible workflows require endpoint, AUC, or maximum summaries and must be classified as a Reasonable workaround when the reduction is scientifically material.
- Contextual Help is explanatory and local/deterministic. It does not calculate results or edit the project.
- The product name, logo, public license, repository URL, bundle-identifier ownership, and signing identities are not final.
- macOS signing/notarization and external-machine smoke testing remain open.
- Windows installer/sidecar packaging and native PNG clipboard support remain open.
- Expanded approximately 500-case scientific benchmarking is still required before an Alpha claim.
