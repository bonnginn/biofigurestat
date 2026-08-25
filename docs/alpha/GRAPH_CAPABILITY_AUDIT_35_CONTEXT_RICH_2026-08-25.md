# Graph Capability Audit — 35 Context-Rich Cases

Date: 2026-08-25  
Subset: 35 completed context-rich cases  
Methodology: `context-rich-graph-1.1`  
Final verdict: `NEEDS TARGETED GRAPH GAP CLOSURE`

## Scope and evidence boundary

This audit asks whether the product can express each Figure's scientific graph grammar and whether a researcher can naturally reach the required settings. It does not score pixel-perfect reproduction of a paper Figure.

Evidence was triangulated from:

- the current canonical handoff and source-of-truth inventory;
- Graph Core ADR 0047, series-width ADR 0049, and nonlinear-fit ADR 0050;
- Personal Figure validation Rounds 2–6 and their defect classifications;
- `CONTEXT_RICH_GRAPH_FAMILY_EXPANSION_2026-08-25.md` and the 35 reconstructed project/Graph states;
- Graph, project, and UI contracts/tests;
- a live browser walkthrough of Graph creation, editing, Statistics, and responsive layouts.

The deterministic Canvas/SVG files generated for the benchmark are evidence that a reconstructed intent can be drawn. They are not, by themselves, proof that the same result is reachable through the product UI. This audit therefore credits a capability only when the generic product contract and an actual UI route exist.

Pool D and the sealed 495-case workbook were not opened.

## Result at a glance

- Intended display grammar: **35/35 expressible** through either the main Graph workspace or a specialized Core route.
- Full intended workflow: **31/35 pass**, **2/35 partial because source/model boundaries prevent authoritative inference**, and **2/35 display-only safe unsupported**.
- Natural usability: **6/35 pass without material friction**, **27/35 pass with recurring generic friction**, **2/35 safe unsupported**.
- No case-specific rendering hard-code was added.
- No new statistical family was added.

The full machine-readable case audit is `benchmark/literature_v2_1/context_rich_graph_capability_audit_2026-08-25/case_audit.csv`.

## Case-by-case decisions

`C` is CAPABILITY and `U` is USABILITY. `PASS*` means the scientific display is supported but the route or editor has generic friction.

| Case | Required grammar | C | U | Main reason |
| --- | --- | --- | --- | --- |
| LSA053 | multi-group box | PARTIAL | PASS* | Display works; lineage dependence prevents authoritative synthetic inference. |
| LSA058 | multi-group box | PARTIAL | PASS* | Display works; bounded source uncertainty prevents certifying annotations. |
| LSA064 | Kaplan–Meier | PASS | PASS* | Exportable survival graph exists, but only in a specialized route. |
| LSA077 | grouped dot + summary | PASS | PASS* | X/series and selected contrasts work; mapping language was unclear. |
| LSA086 | continuous-time multi-series + SEM | PASS | PASS* | Numeric X/ribbon/error bars work; series editing is buried. |
| LSA088 | irregular XY scatter/facet | PASS | PASS* | Scatter/correlation works; regression remains a separate workflow. |
| LSA090 | box/distribution | PASS | PASS | Directly available. |
| LSA094 | WB-normalized dot + summary | PASS | PASS* | Target/reference lineage works; controls span several views. |
| LSA108 | descriptive stacked proportion | PASS | PASS* | Display works and omission of inference is correct; route is not prominent. |
| LSA120 | Kaplan–Meier | PASS | PASS* | Curve, censoring, risk table, and export work; route is separate. |
| LSA126 | two-within-factor longitudinal | DISPLAY ONLY | SAFE UNSUPPORTED | Hemisphere × time within mouse cannot be analyzed safely. |
| LSA127 | two-group nonparametric dot + summary | PASS | PASS | Directly available. |
| LSA128 | factorial descriptive | PASS | PASS* | Grouped display works; no authoritative statistics should be added. |
| LSA135 | multiple-readout heatmap | PASS | PASS* | Heatmap works through the specialized matrix workflow only. |
| LSA139 | factorial grouped box | PASS | PASS* | X/series/facet hierarchy works; setup requires inspector navigation. |
| LSA157 | nested violin/raw + summary | PASS | PASS* | Raw/displayed/statistical units are distinct but text-heavy to understand. |
| LSA168 | WB-normalized dot + summary | PASS | PASS* | Normalization lineage works; settings are distributed across views. |
| LSA178 | repeated-block dot + summary | PASS | PASS* | Identity works; confirmation flow remains interaction-heavy. |
| LSA180 | WB-normalized dot + summary | PASS | PASS* | Generic ratio display works; provenance is distant from style controls. |
| LSA186 | multiple-readout heatmap | PASS | PASS* | Heatmap works but lacks the full ordinary Graph inspector. |
| LSA210 | multi-group dot + summary | PASS | PASS | Selected contrasts and multiple annotations work. |
| LSA217 | Kaplan–Meier | PASS | PASS* | Core grammar works; editor differs from ordinary projects. |
| LSA233 | two-group proportion | PASS | PASS* | Numerator/denominator semantics work; analysis choice is not Graph-side discoverable. |
| LSA249 | nested dot + summary | PASS | PASS* | Nested layers work; terminology requires careful reading. |
| LSA257 | cross-sectional ordered-time line | PASS | PASS* | Numeric X works without repeated identity; the distinction is not prominent. |
| LSA274 | two-group box | PASS | PASS | Directly available. |
| LSA300 | paired dot + connections | PASS | PASS* | Pair identity works, conditional on correct upstream design recognition. |
| LSA302 | nested multi-group dot + summary | PASS | PASS* | Capability works; dense conditions make the narrow inspector costly. |
| LSA324 | nested XY scatter | DISPLAY ONLY | SAFE UNSUPPORTED | Simple correlation/regression must not replace a nested XY model. |
| LSA334 | bar + points + uncertainty | PASS | PASS | Directly available. |
| LSA346 | multi-series survival/rescue | PASS | PASS* | Series and saved log-rank output work; specialized route remains. |
| LSA378 | two-group box | PASS | PASS | Directly available. |
| LSA385 | two-group proportion | PASS | PASS* | Semantics work; less discoverable than continuous outcomes. |
| LSA433 | multiple-testing heatmap | PASS | PASS* | Display works; result selection and matrix styling are split. |
| LSA463 | multi-group box | PASS | PASS* | Comparisons work; long descriptions increase inspector scrolling. |

## Capability coverage

### Covered generically

- bar + points and independent raw/summary layers;
- grouped categorical layouts and factor-aware X/series/facet roles;
- hierarchical labels without parsing display strings;
- paired connections and repeated trajectories with preserved unit identity;
- box and violin distributions;
- nested observations plus biological-unit summaries;
- categorical, continuous, and irregular numeric X axes;
- error bars and time-course ribbons clipped to observed X domains;
- WB target/reference normalization with raw lineage;
- proportions with numerator/denominator semantics;
- display, analysis, comparison, and annotation sets kept separate;
- selected contrasts, control-vs-many/all-pairs policies, and multiple saved-result annotations;
- auxiliary reference/rescue display roles excluded from inference unless explicitly selected;
- independent multi-series color, symbol, line style, and line width;
- Kaplan–Meier curves, censor marks, risk tables, and log-rank results;
- scatter/correlation and authoritative simple linear-regression results;
- heatmaps with explicit transformation and exportable SVG.

### Not fully exposed or scientifically unsupported

1. **P0 — nonlinear fitting has no product entry workflow.** D17, its deterministic engine, saved fit lineage, and authoritative fitted-curve Graph contract exist, but no Web UI route invokes `nonlinear_xy_fit` or lets a user select the model/bounds and inspect the result. PFR062 therefore remains an engine/Core capability rather than a usable product capability.
2. **P0 — crossed within-mouse factors (LSA126).** The display is easy; the inference is not. Supporting hemisphere × time within mouse requires a real repeated/factorial extension and is outside a low-risk Graph-only patch.
3. **P0 — nested XY inference (LSA324).** A scatter can be drawn, but the product must not silently substitute ordinary correlation/regression when observations are nested.

The latter two are safe unsupported rather than reasons to add a large statistical family during this audit. The D17 UI gap is targeted and already has an engine/Core authority, so it is the principal pre-UX capability closure item.

## P1 Graph and UX findings

### 1. Graph editor geometry

Before repair, the desktop inspector was fixed at 278 px and internally scrolled. At an effective viewport around 900 px, the inspector moved below a 775 px-high Graph, so a user could not see the Graph while changing settings. This is a generic P1, especially for hierarchical factors, series styles, and long comparison labels.

This audit widened the desktop inspector to 310–340 px. It improves labels and control density but does not solve the stacked responsive layout. A commercial pass should add a deliberate expanded editor mode: a large overlay/workspace, resizable split, or equivalent design that retains a persistent large Graph while editing.

### 2. Specialized-route fragmentation

Heatmap, survival, and regression capabilities are implemented and tested, but live in specialist pages with different editing surfaces. They are discoverable only after entering “special data/analysis” routes and do not share the complete main Graph inspector. The scientific capability is present; the project-centric workflow is inconsistent.

### 3. Statistics interaction and confirmation fatigue

The Statistics panel now has a sound hierarchy: recommendation and decision first, primary results next, detailed pairwise/diagnostics/provenance collapsed. Display and analysis sets are independently selectable, and saved-result annotations are Graph-side editable.

The first run still requires both a method-decision action and a design-independence confirmation. This is scientifically defensible, but repeated use feels heavier than jamovi/JASP-style interaction. Scientific-structure fingerprint reuse prevents style-only changes from forcing reconfirmation; the commercial pass should preserve that safety while reducing redundant clicks and showing the active analysis state more compactly beside the Graph.

### 4. Series-style discoverability

Per-series color, symbol, line style, and width exist, but they are reached by choosing inspector targets and then locating series controls. Direct legend/series selection or a visible “系列スタイル” entry would reduce navigation without changing Graph semantics.

### 5. Preview/final relationship

The final on-screen SVG is the exported SVG authority, so final/export consistency is strong. The creation dialog uses a schematic preview component rather than the final renderer. Its text says details can change, so this is not a scientific blocker, but a commercial pass should make the distinction visually explicit or reuse the final renderer when inexpensive.

## Repairs made in this audit

- widened the desktop Graph inspector from 250–278 px to 310–340 px;
- changed `Factor → visual mapping` to `実験要因の表示割り当て`;
- changed `X factor` to `X軸に使う要因`;
- changed `系列 factor` to `系列に使う要因` and clarified that the series controls color/symbol;
- changed `Facet (small multiples)` to `パネル分割` and localized its accessible label;
- added the case-by-case audit CSV;
- ran the targeted Graph workbench suite: 42/42 passed;
- ran Graph-spec regression: 26/26 passed;
- ran D17 engine regression: 3/3 passed;
- ran UI typecheck and targeted lint: passed;
- rechecked the modified editor in the live browser; the inspector measured 340 px at the wide desktop breakpoint and the localized labels were visible.

## Remaining P2 / Later

- direct manipulation of legend entries and series;
- reusable Graph style presets/templates;
- a unified specialist/main Graph editing surface;
- more compact Methods/provenance affordances without hiding authority;
- creation-preview reuse of the final renderer;
- cross-device visual polish for long Japanese labels, brackets, and dense legends;
- advanced nonlinear model libraries beyond the bounded D17 minimum;
- crossed repeated-factor and nested-regression statistical families.

## Commercial-grade Web UX decision

A dedicated Commercial-grade Web UX pass is still required. The current product has broad Graph grammar coverage and substantially improved information hierarchy, but its responsive editor geometry, specialist-route fragmentation, style discoverability, and confirmation density remain below commercial quality.

That UX pass should start only after the targeted D17 nonlinear-fit UI gap is closed or explicitly removed from Alpha acceptance. The two advanced repeated/nested inference cases should remain visibly and safely unsupported unless a separate statistical-family project is authorized.

## Final verdict

`NEEDS TARGETED GRAPH GAP CLOSURE`

Reason: the 35-case subset shows broad display coverage, but D17 nonlinear fitting is not reachable as a product workflow, and two context-rich designs must remain display-only to avoid invalid inference. After the targeted D17 UI closure and regression tests, the appropriate next phase is `READY FOR COMMERCIAL-GRADE WEB UX PASS`.
