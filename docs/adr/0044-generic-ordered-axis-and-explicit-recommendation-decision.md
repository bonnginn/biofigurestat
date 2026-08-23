# ADR 0044: Generic ordered-axis authoring and explicit recommendation decisions

## Status

Accepted for benchmark fix-loop Round 3.

## Context

ADR 0043 added scientific contracts for repeated numeric axes, but the experiment wizard could
still author only time. A researcher therefore could not represent a Sholl radius without falsely
labelling it as time. In addition, the selected recommendation and graph error-bar semantics did
not reliably survive project reload and Methods export, and independent condition-by-axis output
could describe `n` without distinguishing per-cell from total units.

## Decision

- The existing ordered-axis draft structure gains an additive semantic (`time` or
  `numeric_covariate`), title, and unit. The wizard asks for these explicitly and never infers a
  numeric covariate from case identity, paper information, or Gold data.
- Literature loading requires the authored axis to match the structured blind packet before data
  are mapped. A Sholl-radius packet is rejected from a time-authored design rather than coerced.
- D06 uses stable biological-unit identity across ordered-axis levels for either semantic. D07 uses
  distinct independent units in every condition-by-axis cell and reports both per-cell `n` and the
  total number of independent units.
- Before execution, the researcher explicitly accepts the canonical recommendation or selects a
  supported alternative. That decision is part of the canonical recommendation and persists in
  the project and Methods text.
- Methods text is generated from the final graph layer state for SD/SEM/none and retains engine
  sphericity diagnostics across reload and export.
- Interactive preflight covers wizard reachability, loader compatibility, default-graph capture,
  recommendation decision persistence, and UTF-8 engine IPC.

## Consequences

JCB018 can reach a Radius (µm) repeated-axis workflow without semantic mislabelling. NC027 reports
its statistical units unambiguously. JCB011 warnings and graph summaries remain visible in Methods,
and JCB024 records whether its recommendation was accepted or overridden. Existing time projects
remain valid because absent axis metadata defaults to the legacy time semantic.
