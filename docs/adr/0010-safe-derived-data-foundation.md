# ADR 0010: Safe derived-data foundation

## Status

Accepted as a Core foundation; project persistence and UI exposure remain pending.

## Context

Microscopy frequently contains cells nested in fields and biological replicates, while Western blots require target/loading-control normalization. Treating source rows as biological n or overwriting raw intensities would violate the product's core integrity rules.

## Decision

- Replicate summaries traverse the explicit unit tree to the declared experimental-unit level and create exactly one summary per biological unit and condition.
- Mean and median are the first supported summary functions. Each summary retains every source observation ID and subsample count in a versioned `replicate_summary` transformation specification.
- Loading-control normalization requires exactly one target and one control intensity for the same biological unit and condition, rejects a zero control, and stores both source observation IDs in a versioned `loading_control_ratio` transformation specification.
- Neither transformation mutates raw observations.
- D01/D02/D03 request builders and engines independently reject duplicate analyzed values per biological unit. Nested raw rows cannot enter standard inference without an explicit derived summary.
- These pure transformation contracts do not masquerade as persisted derived data. Persisting and analyzing their outputs requires a future project-schema migration with derived-dataset revisions and invalidation rules.

## Consequences

The statistical safety rules and numerical transformations can be tested before the nested-import and raw-WB UI is exposed. The app must continue to label current scalar paste as already summarized biological-replicate input until derived-dataset persistence is implemented.
