# ADR 0046: Final common statistical and Graph coverage before expanded benchmark

## Status

Accepted — 2026-08-24

## Decision

The final pre-500 Core additions are bounded, versioned modules rather than test-name shortcuts:

- D14 / protocol 0.11.0 accepts only non-negative integer category counts and explicitly distinguishes independent tables from paired-binary transition tables. Fisher exact and Pearson Chi-square are independent-only; exact McNemar is paired-only. Two-by-two independent results include odds and risk ratios with confidence intervals.
- D15 / protocol 0.12.0 requires complete `pairId` identity across three or more conditions and executes Friedman plus all-pairs Wilcoxon signed-rank comparisons with Holm correction. It never flattens repeated observations.
- D16 / protocol 0.13.0 is ordinary least-squares simple regression, separate from correlation. It reports slope, intercept, R², slope confidence interval/test and a fitted line with optional mean confidence band. The intercept is estimated by default and may be fixed at zero only explicitly.
- Graph specs now persist independent X/Y display scales (`linear` or `log10`). Invalid log display refuses with all source points intact; display scaling never transforms analysis input.
- Histogram uses editable bin count or deterministic Freedman–Diaconis binning with a tied-data fallback. ECDF is the unsmoothed empirical step distribution. Both retain individual source values and do not automatically create an inferential request.

Categorical count bars, fraction bars, and 100% stacked composition preserve the source counts. The Methods provenance records experimental unit, total n, counts, paired/independent structure, model and multiplicity behavior.

## Minimal mixed-effects assessment

`statsmodels` 0.14.6 is already pinned and provides maintained REML random-intercept fitting. A scientifically complete product route for incomplete repeated observations still requires a new missingness-aware design/data contract, estimand and contrast policy, categorical coding policy, convergence/singularity diagnostics, reference fixtures, and UI/provenance review. Reusing the balanced D06 contract would contradict the target missing-observation use case.

Therefore minimal continuous mixed effects is deferred, as the addendum permits. No bespoke matrix algebra is introduced, and this does not block the expanded benchmark. If benchmark frequency establishes priority, the first scope is a random-intercept continuous model with current fixed factors, explicit grouping, REML, convergence status, biological n and missingness; no GLMM, random slopes, nonlinear, or crossed multilevel expansion.

## Explicit stop boundary

Cox regression, ROC, Bland–Altman, Deming regression, logistic/Poisson/negative-binomial/full GLM, three-way ANOVA, PCA, generalized mixed models and arbitrary multivariate/omics modelling remain deferred until expanded-benchmark evidence establishes priority. No further speculative method expansion is authorized before that benchmark.
