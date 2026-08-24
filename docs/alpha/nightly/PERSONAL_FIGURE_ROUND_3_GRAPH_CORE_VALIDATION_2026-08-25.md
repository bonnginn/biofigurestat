# Personal Figure Round 3 — Graph Core v1 Validation

Date: 2026-08-25  
Scope: PFR002, PFR004, PFR025, PFR046, PFR049, PFR069  
Runtime: `benchmark/personal_figure_v1/runtime_round_3`  
Artifacts: `benchmark/personal_figure_v1/runs_round_3`

All six cases were generated through the actual evaluation UI. Each completed run has the required nine artifacts. Round 1 and Round 2 artifacts were not overwritten. Synthetic numeric values are copied from Round 2; only stable observation IDs and explicit graph-intent metadata changed.

| Case   | Graph Core result                                                                                                 | Statistics result                                                                                                                                                                         | Support               |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| PFR002 | Rescue cell line on X; Dox as adjacent series with legend; two saved brackets                                     | The intended two within-line Dox comparisons are annotated, but the factorial route also calculates cross-line all-pairs results. Baseline is omitted to avoid irrelevant baseline tests. | reasonable workaround |
| PFR004 | siRNA on X; 0 h / 24 h as adjacent series with legend                                                             | Separate 0 h and 24 h one-way ANOVA + Dunnett families; only four significant 24 h brackets are drawn.                                                                                    | direct                |
| PFR025 | Two ROI trajectories on a continuous 0–900 s axis; first point meets Y-axis; Y=0.8–1.4                            | Descriptive only, no inference.                                                                                                                                                           | direct                |
| PFR046 | Dark/Lit adjacent series with legend; raw cells plus experiment summaries and mean ± SD; no cell-connecting lines | Experiment-level F/F0 summaries; Welch ANOVA + Games–Howell all-pairs, three brackets.                                                                                                    | direct                |
| PFR049 | White/unfilled violin, raw cells, imaging-session summaries                                                       | Session-level one-way ANOVA + Dunnett comparisons to AX2, two brackets.                                                                                                                   | direct                |
| PFR069 | Continuous −5 to 10 min axis; first point meets Y-axis; summary trend + SD only; Y=0.96–1.11                      | Descriptive only, no inference.                                                                                                                                                           | direct                |

## Method changes and reasons

- PFR002: the paper reports separate unpaired t-tests. The app used a two-factor model with Holm-adjusted pair results because the display is explicitly rescue-line × Dox. This currently over-computes cross-line pairs, so it is not claimed as direct equivalence.
- PFR004: the publication method is unclear. Dunnett was chosen separately at each time because the scientific family is four knockdowns versus one si-control, with independent fixed-cell dishes at each time.
- PFR025 and PFR069: no inferential method was added because both approved panels are descriptive and do not define a supported comparator/null.
- PFR046: cell-level Lit/dark fold changes were summarized within three independent experiments before Welch/Games–Howell all-pairs inference, avoiding pseudoreplication and an equal-variance assumption.
- PFR049: the paper's separate unpaired t-tests were replaced with one Dunnett family on imaging-session summaries because AX2 is the explicit common reference and cells are nested observations.

## Reviewer entrypoint

Run `scripts/run_personal_comparison_browser.py --port 8767` and open:

`http://127.0.0.1:8767/benchmark/personal_figure_v1/comparison_browser/index.html?round=3`

Round 3 review input is isolated in `benchmark/personal_figure_v1/review/review_round_3.json`.
