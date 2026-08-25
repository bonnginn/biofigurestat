# Personal Published-Figure Workflow Validation — Round 4

Date: 2026-08-25  
Status: **ROUND 4 COMPLETE — READY FOR USER REVIEW**

## Scope

Round 4 re-ran the six approved personal published-Figure cases through the actual Track A UI:

- PFR002
- PFR004
- PFR025
- PFR046
- PFR049
- PFR069

The run used the dedicated `LSA_PERSONAL_FIGURE_v1_0_ROUND_4_REMEDIATION` runtime. The 495-case expanded workbook and sealed Pool D were not opened.

## Outcome

All six cases completed with `supportStatus=direct`. Every selected final run contains the required nine artifacts:

- `run.json`
- `interaction_log.json`
- `graph_state.json`
- `statistics.json`
- `methods.txt`
- `default_graph.svg` / `default_graph.png`
- `final_graph.svg` / `final_graph.png`

The review gallery is available at:

`http://127.0.0.1:8767/benchmark/personal_figure_v1/comparison_browser/index.html?round=4&view=finals`

## Case results

| Case   | Round 3 issue addressed                                                         | Round 4 final graph                                                                                                                   | Statistics                                                                                                                               |
| ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| PFR002 | Baseline was missing from Final; graph and statistics needed independent scopes | Six grouped bars retained; rescue cell line on X; Dox−, Dox＋, and baseline/reference are color-coded series with a right-side legend | Only the two prespecified within-cell-line Dox−/＋ comparisons; one-way model with Holm correction                                       |
| PFR004 | 0 h/24 h needed to be series rather than labels; brackets were too complex      | 0 h and 24 h are adjacent color-coded bars within each siRNA condition; mean ± SEM                                                    | Separate ANOVA＋Dunnett families at 0 h and 24 h; 0 h n.s. is not drawn; 24 h uses symbols above target bars plus one legend explanation |
| PFR025 | Horizontal SD marks appeared on a representative-cell trace                     | Activated and Control ROI are distinct colored trajectories on a continuous 0–900 s axis; no error bars; Y=0.8–1.4                    | No inferential test                                                                                                                      |
| PFR046 | Dark/Lit series were not sufficiently close or visually distinct                | Raw cells, experiment summaries, and mean ± SD; adjacent 0/5 min series with color and right-side legend                              | Welch ANOVA＋Games–Howell all-pairs on experiment-level Lit/dark F/F0 summaries                                                          |
| PFR049 | Expected box plot; black fill and bracket interference                          | Circularity box plots use transparent fill, session summaries, condition color, and symbol-only statistics                            | ANOVA＋Dunnett versus AX2 WT on three imaging-session summaries                                                                          |
| PFR069 | Final needed mean ± SD only on a true time axis                                 | Continuous −5 to 10 min summary trajectory with SD error bars; individual cell points/lines hidden; Y=0.96–1.11                       | No inferential test                                                                                                                      |

## Statistical-method changes and reasons

The application does not copy a paper's test mechanically when the approved experimental-unit interpretation or comparison family requires a safer analysis.

### PFR002

The paper reports two unpaired t-tests. Round 4 runs exactly those two planned comparisons in a single one-way model and applies Holm correction. This preserves the intended within-cell-line questions while controlling multiplicity. Baseline remains visible as a Figure-only reference and is not included in the statistical family.

### PFR004

The publication method is not stated clearly. Round 4 uses a separate one-way ANOVA＋Dunnett family at each time point because the scientific question is four knockdowns versus one explicit si control, and 0 h/24 h are separate dishes rather than repeated measurements. The 0 h family is executed but its n.s. results are intentionally not displayed.

### PFR025

No test was added. The approved panel is one representative cell with two ROIs and no prespecified inferential comparator.

### PFR046

The paper uses within-group paired t-tests and ANOVA/Tukey for fold changes. Round 4 displays the Dark/Lit observations but performs the across-group inference on F/F0 summaries from the three independent experiments, not on individual cells. Welch ANOVA＋Games–Howell replaces classical ANOVA/Tukey because it does not require equal variance in this small-n experiment-level comparison.

### PFR049

The paper reports unpaired t-tests. Round 4 treats the two WT-referenced comparisons as one family and uses ANOVA＋Dunnett. Cell values determine the box distribution, while the three independent imaging sessions define statistical n.

### PFR069

No test was added because the panel is a single-cohort descriptive time course with no prespecified null comparison.

## Application defect found and fixed during Round 4

Transparent SVG inspector hit-target shapes were serialized without explicit `fill="none"`/`stroke="none"`. During PNG capture, these invisible interaction targets could rasterize as black rectangles over box plots. The graph renderer now emits explicit SVG `none` attributes for violin and box hit targets, and transparent distribution fill is serialized as `none`. PFR049 was re-run after the fix and visually verified.

## Evidence locations

- Runtime: `benchmark/personal_figure_v1/runtime_round_4/`
- Selected runs: `benchmark/personal_figure_v1/runs_round_4/`
- Comparison manifest: `benchmark/personal_figure_v1/comparison_manifest_round_4.json`
- Review data: `benchmark/personal_figure_v1/review/review_round_4.json`

## Decision

Round 4 closes the six known personal-Figure remediation targets at direct-support level. The appropriate next action is user review of the completed-graph gallery; this result does not authorize or imply a 495-case benchmark rerun or Pool D exposure.
