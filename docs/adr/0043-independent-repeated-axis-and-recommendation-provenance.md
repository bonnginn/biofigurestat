# ADR 0043: Independent repeated-axis analysis and recommendation provenance

## Status

Accepted for benchmark fix-loop Round 2.

## Context

The workspace previously routed every full-course condition-by-axis graph through the D06 repeated-measures contract. That contract is correct only when stable biological-unit identity is preserved across axis levels. A balanced cross-sectional condition-by-time design instead has different experimental units in every condition-by-time cell. Reusing D06 would falsely assert pairing; reducing the graph to one endpoint discards the requested factorial question.

Axis wording and recommendation provenance also need to survive execution, project persistence, Methods generation, and graph artifact capture without relying on case IDs or paper/Gold knowledge.

## Decision

- D06 remains the balanced longitudinal route. Its optional `withinFactor` metadata gives a displayed axis an explicit role, title, and unit while retaining legacy time-shaped result identifiers for older requests.
- D07 protocol `0.7.0` is the balanced independent condition-by-axis route. Every observation has a unique experimental-unit ID and an explicit factor-level ID. Pair and block IDs are rejected. The engine refuses missing cells, imbalance, non-finite values, and cells with fewer than two independent units.
- D06 and D07 may emit generic factor provenance: condition-by-within-factor interaction, condition main effect, and within-factor main effect. Compatibility aliases are metadata, not a change to the scientific estimand.
- Literature default axis semantics may be initialized only from explicit blind researcher-packet wording or structured synthetic axis fields. Paper identity, Gold metadata, and case-ID lookup are not inputs.
- The selected recommendation is stored as the canonical recommendation object on the graph analysis and project analysis run. The UI explicitly records whether the researcher accepted or overrode it. A method change does not by itself upgrade scientific-support classification.
- Full-course D07 persistence materializes one source-linked derived value per independent condition-by-axis cell unit. The same immutable statistical-unit ID is used by the derived dataset and executed request.

## Consequences

NC027 can be evaluated with its complete balanced independent condition-by-time design instead of an endpoint workaround. JCB011 remains on D06 as a regression guard. JCB018 receives Radius semantics on the first graph when the blind packet explicitly describes Sholl radius. JCB024 retains its explicit recommendation and override provenance. Unsafe or unbalanced structures continue to stop before engine execution.
