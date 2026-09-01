# ADR 0059 — Equivalence is a distinct scientific goal with an explicit safe stop

Date: 2026-09-01

Status: Accepted

## Decision

BioFigureStat records `equivalence` (also described to researchers as “no meaningful difference”)
as a scientific comparison goal distinct from ordinary difference detection. The goal is optional
metadata on a saved Graph so Public Alpha `.lsa` files without it remain valid and continue to open
as difference-detection workflows.

The first supported phase is intentionally a safe stop. When equivalence is selected, the
Statistics surface does not recommend or execute an ordinary t test, ANOVA, or nonparametric
difference test. It explains that a scientifically justified equivalence margin and an appropriate
equivalence analysis are required, retains the entered data and Graph, and lets the researcher
return to difference detection without changing the experimental structure.

BioFigureStat does not infer an equivalence margin from the observed data. A non-significant
difference-test result is accompanied by an explicit statement that it does not establish
equivalence or absence of an effect.

## Rationale

“No statistically significant difference” and “sufficient evidence that effects lie within a
predefined negligible range” are different claims. Routing both questions through the existing
method selector would make an invalid scientific conclusion easy. Treating the comparison goal as
question metadata also avoids silently rewriting pairing, nesting, biological-unit identity,
censoring, or the engine request.

## Deferred formal analysis

A later implementation may add TOST or an equivalent confidence-interval decision procedure only
after statistical and scientific review defines:

- how the margin is specified, justified, unit-labelled, and stored before results are inspected;
- supported independent, matched, repeated, and shared-source designs;
- estimate, confidence interval, lower/upper bounds, multiplicity, and three-outcome reporting;
- behavior for positive/total outcomes using the typed numerator and denominator rather than a
  naive analysis of percentages;
- Methods text and reproducibility records that distinguish equivalence from difference testing.

Until that contract exists, an equivalence selection remains unsupported and cannot reach engine
execution.

## Consequences

- Existing `.lsa` files require no migration and retain their previous Statistics behavior.
- Selecting equivalence invalidates any displayed difference-test result but does not mutate data.
- The comparison goal never substitutes an engine method or a pairwise-comparison intent.
- Formal equivalence tests, automatic margins, and claims of “no effect” are not part of this
  change.
