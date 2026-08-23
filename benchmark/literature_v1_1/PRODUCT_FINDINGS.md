# Literature benchmark product findings

## NC033 — single-group workflow coverage

- Date observed: 2026-08-23
- Source: fresh-blind Track B batch evaluation
- Category: Core capability gap
- Experimental structure reported by the blind Experimenter: independent patients, biological
  n=30, one condition, no time axis, and no repeated measures.
- Current boundary: ordinary experiment design and long-/wide-form import require at least two
  conditions.
- Scientific consequence: inventing a second condition would corrupt the experimental design, so
  the case is a valid `Impossible / explicit_unsupported` benchmark result rather than an
  infrastructure failure.
- Disposition: preserve for the later Integrator/product-fix phase. No product behavior was changed
  during the batch-infrastructure fix.
- Later product question: should descriptive/single-group analysis and Graph creation be supported
  without requiring a comparison group?
