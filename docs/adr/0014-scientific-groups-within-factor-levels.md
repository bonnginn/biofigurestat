# ADR 0014: Scientific groups within factor levels

Date: 2026-08-20  
Status: Accepted as a backward-compatible design-model extension

## Context

Real cell-biology experiments are often not flat lists of unrelated conditions. Examples include:

- one or more negative controls and siRNA sequence #1/#2/#3 targeting the same gene;
- several target-gene families, each containing multiple independent reagents;
- every reagent crossed with drug −/+ or another treatment factor;
- rescue constructs grouped by isoform or domain while siRNA and induction remain explicit factors.

The first D03/D05 UI flattened every displayed condition. That can draw points, but it loses the
scientific relationship among related intervention levels. Conversely, treating three siRNA
sequences as `n=3` would be pseudoreplication: sequences are distinct interventions, while dishes or
independent experiments remain the biological replicates.

## Decision

`FactorDefinition` may now declare `levelGroups`. Each actual `FactorLevel` may reference one group.
For example, the intervention factor can contain levels `NC1`, `NC2`, `siRNA #1`, `siRNA #2`, and
`siRNA #3`, while the first two belong to the `Control` group and the latter three to `Target A`.

Group membership is scientific and presentational metadata. The actual factor levels remain separate
model levels and no group member is silently pooled. A second factor such as drug −/+ is crossed with
the intervention levels through the existing complete-factorial condition model.

D05 protocol 0.4 carries the group-to-level mapping to the local engine for provenance. The current
Type III model and cell comparisons still operate on the declared intervention levels. The engine
emits a diagnostic stating that grouped reagents were not used as biological replicates.

## Statistical boundary

- Biological `n` is the independent dish, animal, donor, or experiment declared by the design.
- Multiple siRNA sequences, guide RNAs, clones, constructs, or control reagents are factor levels, not
  biological replicates.
- The current safe default reports the reagent-level factor, its interaction with the crossed factor,
  and multiplicity-adjusted cell comparisons.
- A target-family pooled claim requires an explicit hierarchical contrast/model. It is not inferred
  from the visual bracket and remains a later statistical extension.
- An incomplete factorial design must remain explicit; missing drug × reagent cells cannot be
  invented or silently analyzed as a complete D05 design.

## Consequences

The project can preserve both the graph hierarchy and the analysis hierarchy for common control/
multi-sequence/drug experiments. Existing flat designs remain valid because level groups are optional.
The UI can add family brackets and compact grouped labels without changing raw observation identity.
