# ADR 0005: Graph specification boundary

Status: accepted.

## Decision

Graphs are declarative versioned specifications referencing raw, derived, or analysis-result revisions. Data mappings and analysis annotations are separate from appearance. Renderer-specific objects are never persisted as the canonical graph definition.

## Consequences

- Appearance edits cannot mutate analysis results.
- A graph becomes stale when its referenced data or analysis revision changes.
- SVG/PDF and raster export can share one canonical graph specification.
- Renderer choice can be benchmarked without migrating project semantics.
