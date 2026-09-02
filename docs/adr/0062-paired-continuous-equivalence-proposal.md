# ADR 0062 — Paired continuous equivalence execution proposal

Date: 2026-09-02

Status: Proposed; execution remains disabled

## Context

ADR 0061 permits execution only for one primary raw-difference comparison between two independent
continuous groups. A matched two-condition experiment is not two independent samples. Its
estimand is the mean of the within-pair differences, and its uncertainty must come from those
differences. Reusing Welch TOST would discard the declared identity relation and can give the wrong
standard error.

Lakens describes the one-sample TOST framework. A paired continuous comparison reduces to that
framework by forming one difference for every complete pair and testing the mean difference
against the two prespecified bounds; this is also the reduction used by established paired-TOST
implementations.

Primary methodological reference:

- Lakens D. *Equivalence Tests: A Practical Primer for t Tests, Correlations, and Meta-Analyses.*
  Social Psychological and Personality Science. 2017;8(4):355–362.
  <https://doi.org/10.1177/1948550617697177>

Independent implementation used only as a numerical cross-check:

- statsmodels `stats.weightstats.ttost_paired`, version 0.14.6.

## Proposed executable boundary

Execution would be enabled only when all of the following are true:

- the design is the existing D02 matched/paired continuous route;
- exactly two distinct conditions form one explicitly selected primary comparison;
- every analyzed observation has a stable `pairId`, and each retained pair contributes exactly one
  finite value to each condition;
- the saved margin uses raw readout units, crosses zero, was declared before execution, and is not
  derived from the observed values;
- alpha is 0.05 and the corresponding confidence level is 0.90;
- at least two complete pairs remain and the sample SD of their differences is positive; and
- there is no block-only, shared-run-only, nested, proportion, survival, ordered-X/Y, or nonlinear
  reinterpretation.

The difference direction must follow the stored `contrastConditionIds`: first condition minus
second condition. Pair order in the worksheet must not affect the result.

## Proposed calculation

For complete-pair differences `d_i = y_first,i - y_second,i`, use:

- estimate: `mean(d)`;
- standard error: `sd(d, ddof=1) / sqrt(n_complete)`;
- degrees of freedom: `n_complete - 1`;
- lower test statistic: `(mean(d) - lower_bound) / SE`, with the upper-tail p-value;
- upper test statistic: `(mean(d) - upper_bound) / SE`, with the lower-tail p-value;
- TOST p-value: the larger of the two one-sided p-values; and
- equal-tail 90% CI: `mean(d) ± t_(0.95, df) * SE`.

The existing three-state conclusion contract remains unchanged. Equivalence is supported only
when the entire CI is strictly inside the bounds. A CI wholly beyond either bound supports a
meaningful difference; all overlap cases are inconclusive.

## Incomplete pairs: decision still required

No imputation, ordinal row pairing, or substitution from condition means is allowed. Before this
route is enabled, product review must choose one explicit policy:

1. analyze complete pairs and report both the complete-pair count and every excluded incomplete
   pair as a diagnostic; or
2. fail closed whenever any selected pair is incomplete.

The existing ordinary paired analysis can describe a complete-pair analysis set, but equivalence
is a separate scientific claim. This proposal therefore does not silently inherit that policy.

## Frozen reference vector for implementation review

Using paired differences `[0.10, -0.05, 0.05, 0.00, 0.08, -0.02]` and bounds `[-0.20, 0.20]`:

| Quantity | Expected value |
| --- | ---: |
| complete pairs | 6 |
| mean difference | 0.02666666666666667 |
| sample SD of differences | 0.059217114643206545 |
| standard error | 0.024175285819291664 |
| df | 5 |
| lower-bound t | 9.375966363375472 |
| upper-bound t | -7.169856630816537 |
| lower one-sided p | 0.00011632342948540773 |
| upper one-sided p | 0.00041040541050611746 |
| TOST p | 0.00041040541050611746 |
| 90% CI | [-0.022047703698357905, 0.07538103703169124] |
| conclusion | `equivalence_supported` |

The values were independently reproduced by SciPy 1.18.0 and statsmodels 0.14.6
`ttost_paired` using the same first-minus-second direction.

## Required tests before acceptance

- the frozen asymmetric raw-bound vector above;
- condition-order reversal reverses the estimate and correctly transforms asymmetric bounds;
- shuffled observation order with stable pair IDs gives an identical result;
- duplicate observations within a pair/condition fail closed;
- missing pair IDs fail closed;
- the chosen incomplete-pair policy is visible in diagnostics and Methods;
- fewer than two complete pairs and zero-variance differences fail with specific validation errors;
- request/result schemas reject independent or block-only metadata;
- UI never labels an ordinary paired t-test as evidence of equivalence;
- saved Public Alpha `.lsa` projects without a plan remain unchanged; and
- plan, request, result, annotation, Methods, review-set export, and save/reopen use the same
  comparison direction and complete-pair count.

## Consequence

No production schema, engine protocol, or UI execution path changes under this proposed ADR. The
paired route remains safely disabled until the incomplete-pair policy and comparison-direction
wording are reviewed and this ADR is accepted.
