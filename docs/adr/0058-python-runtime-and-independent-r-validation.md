# ADR 0058 — Python runtime and independent R validation

Date: 2026-08-31
Status: Accepted

## Context

BioFigureStat currently performs statistical computation in a pinned local Python environment using
NumPy, SciPy, statsmodels, and method-specific engine code. Analysis-dependent coordinates, such as
fitted lines and curves, also come from the Python engine; the React/TypeScript graph layer renders
the resulting specification as SVG.

Using R as the runtime would not by itself prove that the application's results are correct. The
reliability boundary also includes the selected method and assumptions, data-shape validation,
biological-unit semantics, parameter conventions, edge cases, result serialization, graph
coordinates, and the exact dependencies shipped in a release artifact. Replacing the runtime would
add migration risk without addressing those boundaries.

## Decision

BioFigureStat keeps its pinned Python statistical engine as the production runtime. A wholesale
migration to R is not planned merely to obtain familiarity or perceived trust.

R is used as an independent validation oracle where an established R implementation exists. Every
supported inferential method must have a documented reference mapping and representative comparison
cases before it is described publicly as cross-validated. Comparisons must cover, as applicable:

- ordinary valid inputs and the exact parameter, tail, correction, and confidence-level conventions;
- ties, zero variance, small samples, missing or non-finite values, and other defined boundaries;
- paired, repeated, blocked, nested, or censored semantics when the method supports them;
- estimates, test statistics, degrees of freedom, p-values, intervals, multiplicity adjustments,
  warnings, and analysis-dependent fitted coordinates;
- the packaged Python dependencies and engine entry point used by the release artifact.

Agreement with R is evidence, not sole authority. Expected differences caused by documented
algorithm or convention choices must be explained and tested rather than forced to match. Tests must
also use hand-checkable examples or another independent reference where practical, and confirmed
defects remain release work even when an R comparison is unavailable.

The project may state that major methods were cross-checked with R only after the corresponding
mapping, fixtures, tolerances, results, and dependency versions are recorded in maintained validation
evidence. It must not make a blanket claim that all calculations or graphs are validated simply
because Python or R is used.

## Consequences

- Existing Python engine contracts and packaging remain stable; no R runtime is added to the app.
- The next Alpha must close confirmed engine defects according to their recorded release priority.
- Method additions require reference-validation work as part of their definition of done, not as a
  post-release reassurance step.
- Statistical trust is communicated through reproducible evidence, pinned dependencies, explicit
  limitations, and safe failures rather than through the programming-language name.
- Purely visual SVG rendering remains a TypeScript/React responsibility, while numerical values and
  analysis-dependent geometry remain covered by engine/reference validation.

