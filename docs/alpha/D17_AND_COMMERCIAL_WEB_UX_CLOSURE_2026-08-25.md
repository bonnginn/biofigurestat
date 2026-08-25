# D17 and Commercial-grade Web UX Closure

Date: 2026-08-25  
Input audit: `GRAPH_CAPABILITY_AUDIT_35_CONTEXT_RICH_2026-08-25.md`  
Decision basis: canonical Alpha documents, Graph Core ADRs, ADR 0050, personal validation, and the completed 35-case context-rich subset  
Final verdict: `READY FOR NATIVE SMOKE`

## Scope and evidence boundary

This pass closed the D17 Web-UI gap identified by the 35-case Graph Capability Audit and then addressed generic, low-to-medium-risk Web UX P1 findings. It did not add case-specific rendering, a broad new statistical family, or pixel-match individual paper Figures.

Pool D, the sealed 495-case workbook, and historical case conversations were not opened.

## D17 nonlinear fitting closure

### Researcher workflow now exposed

- `New Experiment` exposes `非線形XYフィット` as a versioned D17 route.
- Input requires explicit `Unit ID`, `Series`, `X`, and `Y`; one unit label cannot silently cross series.
- The researcher explicitly selects `zero_baseline_association` or `one_phase_association` and records a scientific rationale.
- Changing between the supplied model defaults also updates the default rationale. A researcher-edited rationale is preserved.
- Optional initial values and bounds are available in a collapsed advanced section and are persisted when supplied.
- Successful results show parameter estimate, standard error, confidence interval, n, distinct X, RMSE, R², AIC, residual degrees of freedom, starts, bounds, and engine/package versions.
- Browser-only preview refuses execution explicitly because no local statistical authority is available; it does not draw an invented fit.

### Authority, Graph linkage, and persistence

- The deterministic Python/SciPy D17 result remains the sole fit authority.
- Raw observations and saved fitted-curve points remain separate Graph layers.
- The Graph consumes the saved `nonlinearFit.series[].fittedCurve`; appearance changes do not refit or smooth data.
- Project save persists raw X/Y observations, series and biological-unit identity, request, model/version/rationale, starts/bounds, parameters/uncertainty, diagnostics, fitted curve, engine versions, Graph spec, and provenance.
- Project open reconstructs the Graph and result/Methods views from the saved analysis result rather than recalculating.
- Project validation now rejects a D17 request point whose series, unit, X, or Y cannot be reproduced from the declared raw revision.

The existing ADR 0050 scope boundary remains unchanged: this is a small explicit model library, not automatic model selection, Michaelis–Menten-on-time, cosmetic interpolation, global/shared-parameter fitting, or an extensive kinetic package.

## Commercial-grade Web UX findings and repairs

### P0

No remaining generic Web P0 was found in the reviewed paths.

### P1 repaired

| Friction cluster                                                      | Repair                                                                                                                                                    | Verification                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| D17 had no safe Web-UI route                                          | Added model/input/advanced settings/result/Graph/save-open workflow                                                                                       | Contract, engine, UI, Graph, project round-trip, and browser checks              |
| Ordinary Graph and editor stopped being simultaneous too early        | Retained the two-column Graph + 340 px inspector layout down to a 720 px workspace threshold; stack only below that                                       | Live browser at the desktop app's compact Web viewport plus responsive CSS audit |
| Series styling was buried                                             | Added `系列の色・線・点` as an explicit editor target and a data-panel shortcut                                                                           | UI regression and live Graph-editor walkthrough                                  |
| Specialized analyses felt like isolated destinations                  | Added one consistent specialist-analysis switcher across Survival, Heatmap, contingency, repeated nonparametric, regression, D17, and distribution routes | Live D17 → Survival route switch                                                 |
| Recommended statistics required redundant acceptance                  | The recommendation is selected by default; execution retains the single scientific independence/pairing confirmation                                      | Statistics regressions and live 3-group walkthrough                              |
| An alternative method selection could be reset before first execution | Preserved supported method selection until a genuine structural change or completed-analysis invalidation                                                 | Targeted recommendation regression                                               |
| Model and default rationale could disagree                            | Synchronized only built-in rationale text when the model changes; preserve custom rationale                                                               | D17 UI regression and browser walkthrough                                        |

### Interaction assessment against jamovi/JASP-style lightness

The main Graph/Statistics workflow now has a reasonable Alpha interaction rhythm: the app recommends and preselects a method, the researcher can choose a supported alternative in place, one design-identity confirmation gates execution, and results remain subordinate to the Graph instead of expanding inside the canvas. Safe value-only reruns and unsafe structural-change invalidation remain distinct.

This is not a claim of full jamovi/JASP parity. Drag/drop variable assignment, resizable panes, a unified analysis tree, keyboard-complete editing, and user-customizable workspace layouts remain post-Alpha product work.

## Browser observations

- D17 route: both accepted models, formulae, rationale, axes/units, and advanced starts/bounds are discoverable without leaving the page.
- Browser preview: executing D17 produces an explicit desktop-engine message and leaves save/export of a fit disabled.
- Specialized routes: direct switch from D17 to Survival succeeds without returning through Home or New Experiment.
- Ordinary Graph: preview and inspector are visible side-by-side in the compact desktop Web viewport; the inspector scrolls independently.
- Series editing: the dedicated shortcut and editor target are visible from the data inspector.
- Statistics: Welch ANOVA is visibly selected for the 3-group demo; there is no separate “use recommendation” action, and the single unit-independence checkbox controls execution.

## Regression evidence

- UI: **404/404 PASS** across 57 files.
- Graph spec: **26/26 PASS** across 7 files.
- Analysis contracts: **42/42 PASS** across 12 files.
- Project targeted state/round-trip: **9/9 PASS**.
- Python statistical engine: **59/59 PASS**, including D17 cases.
- UI and project TypeScript checks: PASS.
- Live in-app-browser walkthrough: PASS for D17 route safety, specialist switching, Graph/editor simultaneity, series discoverability, and reduced confirmation flow.

The UI suite still emits pre-existing React `act(...)` warnings in asynchronous workspace/benchmark tests; these are warnings, not failures, and did not indicate a user-visible regression in this pass.

## Remaining P2 / Later

- Make inspector width resizable and optionally detachable into a larger overlay/workspace.
- Add keyboard-first and drag/drop factor-to-X/series/facet assignment.
- Consolidate specialized result presentation further; navigation is unified, but each family still has a purpose-built editor surface.
- Replace internal method identifiers in the recommendation-decision sentence with fully localized labels.
- Add more flexible nonlinear models, weighting, shared-parameter/global fitting, bootstrap/profile likelihood, and formal model comparison only after Alpha.
- Clean up asynchronous React-test `act(...)` warnings.

These items improve polish or broaden scope; none is a remaining generic Alpha scientific blocker in the audited workflows.

## Verdict

`READY FOR NATIVE SMOKE`

D17 is now safely reachable, authoritative, inspectable, and persistent from the Web UI. The recurring P1 Web friction clusters identified by the 35-case audit have targeted generic repairs and regression evidence. The next risk boundary is native integration—desktop engine invocation, filesystem dialogs, save/open on real `.lsa` files, export, window sizing, and OS-specific rendering—rather than another broad Web UX pass.
