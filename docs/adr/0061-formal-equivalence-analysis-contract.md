# ADR 0061 — Formal equivalence analysis requires a prespecified margin and design-specific support

Date: 2026-09-02

Status: Accepted

## Decision

BioFigureStat stores a formal equivalence-analysis plan separately from ordinary difference
testing. A plan records:

- finite lower and upper equivalence bounds, with the lower bound below zero and the upper bound
  above zero;
- the scientific scale and unit of those bounds;
- an optional scientific rationale and an explicit declaration that the bounds were prespecified
  rather than generated from the observed results;
- alpha `0.05`; and
- whether one primary comparison, all selected comparisons, or separate comparison-level claims
  are intended.

At alpha `0.05`, the interval evidence contract uses the equal-tail 90% confidence interval that
corresponds to two one-sided tests. Equivalence is supported only when the whole interval lies
strictly inside the prespecified bounds. A confidence interval wholly beyond either bound supports
a meaningful difference. All overlapping cases are inconclusive. These three outcomes are not
relabelled from an ordinary null-hypothesis significance test.

The saved plan is optional and backward compatible. It is retained only for a Graph whose
scientific comparison goal is equivalence. Changing the plan invalidates any attached analysis
result but does not change observations, experimental-unit identity, pairing, nesting, blocking,
censoring, or lineage.

## Scientific basis

Schuirmann's two one-sided tests procedure establishes the TOST/interval relationship for the
ordinary continuous setting. FDA's statistical bioequivalence guidance likewise describes two
one-sided tests at level alpha as equivalent to requiring the equal-tail `100(1 - 2 alpha)%`
confidence interval to lie within the equivalence bounds. ICH E9 requires an equivalence margin to
be specified in the protocol, to represent the largest difference that is clinically acceptable,
and to be justified scientifically.

Primary references:

- Schuirmann DJ. _A comparison of the two one-sided tests procedure and the power approach for
  assessing the equivalence of average bioavailability._ J Pharmacokinet Biopharm. 1987.
  <https://pubmed.ncbi.nlm.nih.gov/3450848/>
- FDA. _Statistical Approaches to Establishing Bioequivalence._ 2022.
  <https://www.fda.gov/media/163638/download>
- ICH E9. _Statistical Principles for Clinical Trials._
  <https://database.ich.org/sites/default/files/E9_Guideline.pdf>
- FDA. _Multiple Endpoints in Clinical Trials: Guidance for Industry._ 2022.
  <https://www.fda.gov/media/162416/download>

These regulatory documents concern clinical trials and bioequivalence. BioFigureStat uses their
general statistical principles for the software contract; it does not infer that every
life-science experiment is a regulated bioequivalence study.

## Support boundary

The plan-entry and three-state interval-assessment contracts are supported. Engine execution is
not enabled merely because a plan is complete. Each design/outcome route requires a separately
reviewed estimator, standard error, degrees-of-freedom rule, confidence interval, test vectors,
Methods text, and failure behavior.

| Design / outcome                                                                  | Current execution status           | Required before enabling                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two independent groups, continuous outcome; one primary raw-difference comparison | Executable (`0.15.0`, Welch TOST)  | Implemented with unequal-variance SE/df, two one-sided p values, equal-tail 90% CI, asymmetric-margin reference vectors, three-state result, Methods, and `.lsa` round trip                       |
| Matched pairs, continuous outcome; one primary raw-difference comparison          | Executable (`0.16.0`, paired TOST) | Implemented as a one-sample TOST on complete stable-ID second-minus-first differences, with excluded incomplete-pair provenance, reference vectors, Methods, and `.lsa` round trip under ADR 0062 |
| More than one selected comparison                                                 | Not yet executable                 | Explicit claim family and reviewed multiplicity/ordering rule; no silent reuse of ordinary post-hoc correction                                                                                    |
| Shared experimental run/source with condition-specific units                      | Unsupported pending review         | Explicit fixed/random block model and degrees-of-freedom policy; shared provenance must not be treated as pairing                                                                                 |
| Positive/total counts                                                             | Unsupported pending review         | Binomial estimand and interval/test method operating on typed numerator and denominator, including clustering/overdispersion policy                                                               |
| Positive/total counts sharing a run/source                                        | Unsupported pending review         | Joint binomial and run-level dependence model; analysis of percentages as independent continuous values is prohibited                                                                             |
| Repeated, nested, survival, ordered X/Y, nonlinear, or other specialist outcomes  | Unsupported                        | Design-specific equivalence estimand and method contract                                                                                                                                          |

For positive/total outcomes, FDA explicitly notes that equivalence methods for differences in
success probabilities require careful consideration and may not share the simple CI
correspondence. BioFigureStat therefore preserves numerator, denominator, unit, and run provenance
and does not route percentages into continuous TOST.

## Multiple comparisons

The saved claim mode records scientific intent but does not itself authorize an executable
multiplicity strategy.

- `single_primary_comparison` requires one stable comparison identifier.
- `all_selected_comparisons` means the overall claim succeeds only if every required comparison
  meets its reviewed equivalence criterion; this is distinct from making several independent
  claims.
- `individual_comparison_claims` requires an explicit family definition and a reviewed
  multiplicity procedure before execution.

BioFigureStat must not guess the primary comparison or convert an existing Dunnett, Tukey, Holm,
or Games–Howell difference-testing correction into an equivalence procedure.

## Consequences

- A researcher can record and reopen the scientific margin before executable support is added for
  a design, and can execute the reviewed independent- or paired-continuous single-primary routes.
- Public Alpha `.lsa` files without an equivalence plan remain valid.
- A non-significant ordinary test never becomes evidence of equivalence.
- A statistically significant ordinary difference and an equivalence conclusion are not treated
  as logical opposites; the formal claim is determined from the prespecified bounds and the
  interval evidence.
- Unsupported designs remain visible and editable but stop before engine execution.
- Adding an executable route requires a new bounded review and tests; it does not weaken this
  contract or reinterpret existing saved plans.
