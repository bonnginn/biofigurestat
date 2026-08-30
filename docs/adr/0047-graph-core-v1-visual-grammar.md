# ADR 0047: Graph Core v1 factor-aware visual grammar

- Status: Accepted
- Date: 2026-08-25

## Context

The experiment model preserves scientific factors, experimental-unit identity, repeated structure, and analysis provenance, while the general Graph workspace can still flatten several scientific dimensions into condition labels. Visual proximity, color, or label parsing cannot safely determine whether two displayed series are independent, paired, or repeated. A publication-oriented graph also needs more than one saved comparison, true continuous-axis geometry, and deterministic legend/style behavior without allowing appearance to alter inference.

## Decision

Graph Core v1 extends the declarative boundary of ADR 0005 and the layered workspace of ADR 0024 with a versioned, factor-aware visual grammar.

### Factor and visual roles

- A scientific factor may declare a scientific role (`intervention`, `genotype`, `time`, `state`, `rescue`, `control_reference`, `readout`, or `other`), its within-/between-unit role, and an explicit independent/paired/repeated relationship.
- A proposed visual role is independent metadata: `x`, `series`, `facet`, `annotation`, `auxiliary_reference`, or `none`.
- A Graph persists the resolved X, series, and optional facet factor IDs. It never derives them by splitting condition labels.
- Pairing, nesting, and repeated identity come only from experiment-design metadata. Renderer geometry never creates or changes statistical identity.

### Grouping, series, and facets

- Categorical Graphs resolve an ordered X level and an ordered series level for each displayed observation group. Within-X and between-X spacing are separate appearance settings.
- Series metadata includes level identity, display label, order, visibility, color, fill, line style, and point style. Legends are generated from the visible resolved series and therefore stay synchronized after ordering, visibility, label, or style changes.
- An optional facet mapping has deterministic level ordering and an axis policy schema (`shared`, with independent policies reserved for compatible later extensions). Graph Core renders simple small multiples using the same series resolver; complex page layout remains later work.
- Graph type and display layers remain separate. Bars, points, distributions, experiment summaries, nested observations, connecting lines, and trajectories are composable only where their scientific unit semantics are known.

### Auxiliary references

- A condition or factor level may be an auxiliary visual reference with provenance.
- Auxiliary references are displayable and styleable but are excluded from the primary contrast family unless a researcher explicitly selects a saved comparison involving them.
- Reference appearance never authorizes an annotation or statistical comparison.

### Saved-result annotations

- A Graph may link multiple annotations to authoritative saved analysis results. The Graph does not recalculate p-values.
- Annotation identity stores analysis/result identity, comparison/test identity, displayed group/series endpoints, adjusted/unadjusted provenance, analyzed metric, and applicable time point/window/endpoint.
- Exact p-values, significance symbols, and `n.s.` visibility are controlled per annotation. Brackets resolve from explicit displayed identities, stack deterministically, avoid collisions, and expand the Graph extent.
- Appearance editing is excluded from the analysis fingerprint.

### Axis and publication semantics

- X axes are explicitly categorical, continuous time, or continuous numeric covariate. Continuous axes use numeric/irregular spacing, compact margins, bounded canvas width, one unit-bearing axis title, stable tick precision, and optional explicit ranges/ticks.
- Y axes retain safe automatic ranges, explicit manual ranges, linear/log10 semantics, unit/title consistency, and an extensible reference-line model. Automatic truncation must not create a misleading baseline.
- Publication controls cover point shape/size/opacity/jitter, line width/style/visibility, distribution/bar fill and outline, SD/SEM/none (and CI only when supported), group spacing, legend placement, and plot margins. Solid black distribution fill is not the default.

### Preview and final output

- Preview, workspace, save/open, clipboard, and final export consume the same persisted visual-role resolution, axis semantics, legend metadata, and style defaults.
- Renderer implementations may remain separate temporarily, but they may not reinterpret X/series/facet/reference/annotation semantics. Remaining renderer duplication is tracked as P2.

## Compatibility and migration

- New fields are optional or receive non-destructive defaults. Existing `.lsa` projects continue to interpret `condition` as X, no explicit series/facet, a single legacy annotation, and white distribution fill.
- The legacy color mapping remains readable as a compatibility channel; new Graphs store a first-class series mapping.
- Facet axis policy initially defaults to shared axes. Independent-axis rendering is not silently enabled.

## Consequences

- Grouped and layered Graphs can represent the same visual layout for statistically different independent, paired, or repeated designs without conflating them.
- Auxiliary references and multiple saved comparisons become provenance-bearing Graph elements rather than case-specific drawing instructions.
- Legend, axis, and export behavior can be stress-tested from normalized Graph semantics.
- Specialized layout authoring, arbitrary free dragging, and scientifically ambiguous inference remain outside Graph Core v1.
