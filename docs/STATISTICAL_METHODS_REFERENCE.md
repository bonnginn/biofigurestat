# Statistical methods and engine traceability

This document records the numerical authority used by the Internal Alpha build. The application
interprets experiment design, constructs statistical units, validates input, and formats results;
standard statistical tests are delegated to pinned, maintained libraries.

## Engine policy

- Application version: `0.1.0`
- Local engine: Python package `lsaa-analysis-engine` version `0.7.0`
- Runtime dependencies: NumPy `2.3.5`, SciPy `1.18.0`
- Validation-only reference dependency: statsmodels `0.14.6`
- Versions are exactly pinned in `engine/python/pyproject.toml` for a release.
- The result contract records the actual engine and package versions returned by the running
  sidecar. The UI displays those returned values; it does not infer them from this document.

## Supported analyses

| Displayed method                                  | Design contract                                   | Numerical library                       | Golden/reference status                                                           | Important limitations                                                      |
| ------------------------------------------------- | ------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Welch's or Student's two-sample t-test            | Two independent groups                            | SciPy                                   | Engine tests compare estimate, statistic, df, CI, p and effect size               | Welch is recommended; Student is an advanced explicit choice               |
| Mann–Whitney U                                    | Two independent groups                            | SciPy                                   | Engine tests cover U, p and rank-biserial effect                                  | Tests a rank/distribution contrast; it is not universally a median test    |
| Paired t-test or Wilcoxon signed-rank             | Two conditions measured on complete stable units  | SciPy                                   | Engine tests cover paired differences/statistics, p, CI when defined and effects  | Incomplete pairs are excluded; session/date alone does not create a pair   |
| Welch ANOVA + Games–Howell                        | Three or more independent groups; all pairs       | SciPy-based engine implementation       | Golden engine tests cover omnibus and adjusted pairwise results                   | One interpreted condition factor; no silent factorial collapse             |
| One-way ANOVA + Tukey HSD or Dunnett              | Three or more independent groups                  | SciPy                                   | Engine tests cover omnibus, simultaneous comparisons and adjusted p-values        | Dunnett requires an explicitly declared control and control-vs-many intent |
| Kruskal–Wallis                                    | Three or more independent groups; omnibus only    | SciPy                                   | Engine tests cover H statistic and p-value                                        | No post-hoc comparisons are exposed in the current Core                    |
| Repeated-measures ANOVA + Holm paired comparisons | Three or more conditions on complete stable units | SciPy-based engine implementation       | Golden engine tests cover omnibus and Holm-adjusted comparisons                   | Complete cases and one repeated condition factor only                      |
| Type III two-way ANOVA + Holm cell comparisons    | Complete independent two-factor cells             | NumPy/SciPy-based engine implementation | Golden engine tests cover interaction, main effects and adjusted cell comparisons | No repeated factor-by-time model in the current Core                       |
| Pearson correlation                               | Complete X–Y pairs from the same stable units     | SciPy                                   | Golden engine tests cover coefficient, p and CI                                   | Intended for a linear association question                                 |
| Spearman rank correlation                         | Complete X–Y pairs from the same stable units     | SciPy                                   | Golden engine tests cover rank coefficient and p                                  | Intended for monotonic/rank association                                    |

The complete tier, contrast, correction, interval and limitation catalog is maintained in
`docs/STATISTICAL_METHOD_CATALOG.md`. Friedman, mixed models and complete factor-by-time repeated
models remain unavailable. They must be labelled unavailable and must not look actionable.

## Identity and reproducibility rules

- Experiment/session ID represents date or batch structure.
- Stable biological/statistical unit ID represents the real unit that can be paired or followed.
- Only the stable unit ID may create pairing and trajectory connections.
- Graphs persist their own readout, condition, time, layer, appearance, and linked analysis state.
- Any incompatible upstream change removes the old analysis and annotation until recomputation.
- Imported source rows, confirmed mapping, duplicate decisions, excluded rows, and import timestamp
  remain separate from canonical observations and derived data.

## Validation evidence

Unit and contract tests live in `engine/python/tests`, UI/project regression tests in
`apps/ui/src`, and the packaged-sidecar smoke workflow in `engine/python/smoke_sidecar.py`.
Native release validation must record the actual returned package versions and compare saved,
reopened, and rerun results before an Internal Alpha release is approved.
