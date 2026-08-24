# Personal Published-Paper Figure Validation — Round 2 Review Synthesis

Date: 2026-08-25
Status: Round 2 review completed; product changes identified
Scope: PFR002, PFR004, PFR025, PFR046, PFR049, PFR069

## Purpose

This document separates the Round 2 findings into three categories:

1. what Round 2 successfully established;
2. what requires changes to the application itself, including upstream experiment-design representation;
3. what arose from an incomplete initial explanation or interpretation and primarily requires a different graph presentation.

These categories are related but not interchangeable. A scientifically correct brief can expose a missing application capability, while an application with sufficient capability can still produce the wrong figure when the intended comparison or visual hierarchy is not explained correctly.

## Executive conclusion

Round 2 was a meaningful improvement over Round 1. All six figures were rated `OK` for readability in the Round 2 review, whereas PFR002 and PFR004 had been rated `Insufficient` in Round 1. Round 2 correctly recovered the principal readouts, biological units, comparison targets, descriptive-only panels, and major axis ranges.

However, preference remained `Neutral` for two cases and `Dislike` for four. The remaining problems are not explained by one cause alone:

- some require an upstream, factor-aware representation of experimental design;
- some require additional graph-editor and statistical-annotation capabilities;
- some were avoidable interpretation or presentation errors that should have been resolved before graph generation.

Round 2 should therefore be treated as a successful scientific-intent reconstruction and product-gap discovery pass, not as a final visual validation.

## 1. What Round 2 achieved

### 1.1 Scientific intent was substantially corrected

- **PFR002:** identified Dox− versus Dox+ within each rescue cell line as the primary question. Baseline was retained only as an auxiliary reference, and baseline-versus-knockdown testing was excluded.
- **PFR004:** represented 0 h and 24 h as separate fixed-cell dishes rather than repeated observations of the same dish. Control-versus-knockdown comparisons were run separately at each time point, and 0 h `n.s.` labels were intentionally excluded from the final figure.
- **PFR025:** reduced the panel to one representative cell with two fluorescence traces and no inferential statistics.
- **PFR046:** restored the reported cell counts, retained cells within independent experiments, removed unreadable cell-to-cell connecting lines, and performed all-pairs group comparisons using experiment-level summaries.
- **PFR049:** corrected the readout to circularity, identified AX2 as WT reference, and retained imaging session rather than individual cell as the inferential unit.
- **PFR069:** produced a descriptive mean ± SD time course with no inferential test.

### 1.2 Data identity and statistical intent were preserved

The Round 2 synthetic runtime was deterministic and kept the distinctions among biological unit, nested observation, time point, condition, and readout. In particular:

- cross-sectional time points were not interpreted as longitudinal pairing;
- lower-level cells were not counted as independent biological replicates;
- explicit controls were carried into control-versus-many analyses;
- descriptive panels could be finalized without inventing a statistical comparison.

### 1.3 Actual application workflows were completed

All six cases were loaded, graphed, analyzed where applicable, and finalized through the application itself. Each selected run contains the complete nine-artifact set: run metadata, default and final SVG/PNG, graph state, interaction log, Methods, and Statistics.

### 1.4 Round 2 already produced useful application improvements

The work identified and corrected several genuine application issues:

- separate cross-sectional unit IDs at different time points now map safely into the intended experiment slots;
- explicit control conditions can be supplied without inferring a control from a label;
- descriptive-only cases can produce complete artifacts with statistics recorded as `not_performed`;
- continuous time-course figures no longer expand their width in proportion to the number of sampled time points;
- narrow Y-axis ranges can display sufficient decimal precision;
- individual longitudinal trajectories are shown only when the corresponding layer is enabled.

## 2. What requires changes to the application itself

## 2.1 The primary problem is upstream experiment-design representation

The current workflow still tends to flatten combinations such as `cell line × Dox`, `siRNA × time`, or `siRNA × illumination` into condition labels. That loses the factor structure needed by both analysis and graph generation.

The application should explicitly retain:

- experimental factors and their levels;
- each factor's scientific role, such as intervention, genotype, time, state, or auxiliary reference;
- whether a factor varies within or between biological units;
- nesting and repeated identity;
- primary contrasts and auxiliary comparisons;
- a proposed visual role for each factor: X category, series, facet, or annotation.

The proposed visual role must remain distinct from the statistical relationship. For example, both PFR004 and PFR046 need two visual series, but PFR004 uses independent dishes at 0 h and 24 h, whereas PFR046 has Dark and Lit measurements paired within a cell.

### Required design-to-graph mappings

| Case   | X-axis category  | Series      | Statistical relationship                          |
| ------ | ---------------- | ----------- | ------------------------------------------------- |
| PFR002 | rescue cell line | Dox− / Dox+ | specified Dox comparison within each cell line    |
| PFR004 | siRNA condition  | 0 h / 24 h  | independent dishes at each time point             |
| PFR046 | siRNA condition  | Dark / Lit  | repeated within cell; cells nested in experiments |

PFR002 additionally requires an auxiliary-reference concept because baseline is not simply another level in the primary Dox factorial comparison.

## 2.2 The graph specification needs a real series dimension

Once the factor structure exists upstream, the graph specification and editor must support:

- assignment of a factor to X, series, and optionally facet;
- grouped bars, points, boxes, or summaries within each X category;
- smaller within-group spacing and larger between-group spacing;
- color, fill, line style, and legend labels by series rather than only by flattened condition;
- display of Dark/Lit or 0 h/24 h as a coherent pair without implying statistical pairing solely from proximity;
- independent control of box fill, including unfilled or white boxes.

This is required for PFR002, PFR004, and PFR046. The black-filled box reported again for PFR049 also shows that an explicit `none / white / series color` fill control is needed.

## 2.3 Continuous X-axis behavior requires correction

For PFR025 and PFR069, the first sampled X value should map to the Y-axis intersection rather than retain categorical side padding. The continuous-axis layout should also:

- show numeric tick labels without repeating `s` or `min` at every tick;
- show the unit once in the axis title, for example `Time (min)`;
- use a smaller bottom margin than categorical/hierarchical graphs;
- place the X-axis title closer to the axis;
- allow a narrower canvas or provide an appropriate continuous-time default width.

## 2.4 Statistical annotations require multi-comparison support

The statistical analyses were saved, but the Round 2 graph states had statistical annotation set to `hidden`. This was a run-configuration error. In addition, the current renderer can select only one test result at a time and draws a comparison bracket only when the complete graph contains exactly two displayed series.

The application therefore needs:

- selection of multiple saved pairwise results;
- brackets positioned from the comparison's condition and series identities;
- automatic vertical stacking and collision avoidance;
- separate control of significant and `n.s.` annotations;
- the ability to show the PFR002 Dox comparisons, the PFR004 24 h control comparisons, and the PFR049 AX2 comparisons without replacing them with one top-right text label;
- preservation of the exact analysis time point or derived metric linked to each annotation.

This is both a product limitation and a Round 2 execution issue: enabling the existing single annotation would have shown some information, but it would not have produced the required multi-comparison figure.

## 3. What primarily resulted from insufficient explanation or interpretation

The following Round 1 problems did not, by themselves, demonstrate missing statistical-engine functionality. They largely arose because the intended scientific question or conventional figure form had not been reconstructed precisely enough before graph generation.

### PFR002

- Dox− versus Dox+ within each rescue line was the principal comparison.
- Baseline-versus-knockdown was already addressed elsewhere and should not have driven the figure.
- A bar-plus-independent-experiment-points presentation was expected.

Once explained, Round 2 corrected the comparison family and biological n. The remaining paired-series layout and multi-bracket display are application gaps.

### PFR004

- 0 h and 24 h were separate fixed-cell dishes.
- The expected display was grouped bars plus points, not a longitudinal line graph.
- Comparisons were against si control at each time point, with 0 h analyzed but `n.s.` not printed.

These points were primarily brief/interpretation requirements. After they were clarified, the remaining 0 h/24 h series mapping exposed the upstream factor-model limitation.

### PFR025

- Only one representative cell was required.
- The two signals were overlaid trajectories from that cell.
- No statistical test was required.
- The important presentation task was axis scaling and placement.

The number of cells and absence of statistics were clarification issues. The exact continuous-axis origin, unit labeling, title spacing, and canvas width now require renderer refinement.

### PFR046

- Dark and Lit are the two repeated states of interest.
- Individual cell lines should not be drawn because the cell count makes them unreadable.
- Raw points plus summaries and three-group all-pairs inference were required.

Round 2 corrected cell counts, nesting, the lack of connecting lines, and the all-pairs analysis. The missing Dark/Lit series role, colors, and legend are application-level gaps.

### PFR049

- Circularity, not projected area, was the readout.
- AX2 was WT and the intended statistical reference.
- A solid black distribution was not desired.

The readout and control were explanation/interpretation corrections. The continued black box is a simpler graph-style defect and does not require a new analysis model.

### PFR069

- Mean ± SD only and no statistical test were required.
- The apparent response needed a tighter axis range and non-expanded time axis.

Round 2 achieved those central requirements. The remaining origin, tick-unit, title-position, and width comments are continuous-axis rendering issues shared with PFR025.

## 4. Case-level classification

| Case   | Round 2 achievement                                            | Application change now required                                        | Primarily presentation/brief correction             |
| ------ | -------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| PFR002 | correct Dox contrasts, n=3, baseline auxiliary                 | factorized design, Dox series, legend, multiple brackets               | bar + points and exclusion of baseline-vs-knockdown |
| PFR004 | independent dishes, control comparisons, 0 h analysis retained | time as visual series without repeated pairing; multiple 24 h brackets | grouped bars + points; hide 0 h `n.s.`              |
| PFR025 | one cell, two traces, no statistics, tighter Y range           | continuous-axis origin, label and canvas controls                      | one-cell descriptive intent and no inference        |
| PFR046 | real cell counts, nesting, no cell lines, all-pairs analysis   | Dark/Lit series with paired identity and series styling                | raw points + summary rather than connected cells    |
| PFR049 | circularity, AX2 control, session-level inference              | unfilled box control and multiple AX2 brackets                         | correct readout and WT reference                    |
| PFR069 | mean ± SD only, no inference, fixed-width time course          | continuous-axis origin, label and canvas controls                      | descriptive-only presentation and tighter scale     |

## 5. Recommended next phase

The next phase should not begin by regenerating the six figures. It should proceed in this order:

1. extend the experiment-design model to preserve factors, levels, within/between-unit roles, auxiliary references, and proposed visual roles;
2. carry those semantics through the loader and graph specification;
3. add grouped-series and series-level legend/style controls;
4. correct continuous-axis geometry and labeling;
5. add multiple saved-comparison annotations;
6. rerun the same six Round 2 cases with the same synthetic data and compare them against the saved Round 2 review.

The saved Round 1 and Round 2 reviews should remain immutable evidence. A corrected pass should use a new review file and artifact directory rather than overwrite either round.

## Evidence

- Approved Gold briefs: `docs/alpha/PERSONAL_FIGURE_GOLD_BRIEFS_2026-08-25.md`
- Round 2 comparison manifest: `benchmark/personal_figure_v1/comparison_manifest_round_2.json`
- Round 2 reviewer input: `benchmark/personal_figure_v1/review/review_round_2.json`
- Round 2 application artifacts: `benchmark/personal_figure_v1/runs_round_2/`
- Round 2 deterministic runtime: `benchmark/personal_figure_v1/runtime_round_2/`
