# Graph Core v1 Capability Matrix

Date: 2026-08-25  
Decision basis: ADR-0047, Personal Figure gold briefs, Round 2 review synthesis, bounded Expanded-495 realism audit  
Status vocabulary: `IMPLEMENTED`, `PARTIAL`, `NOT IMPLEMENTED`, `NOT APPLICABLE`

## Visual grammar

| Capability                                                          | Status      | Evidence / boundary                                                                                                                                    |
| ------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explicit X / series / facet mapping                                 | IMPLEMENTED | Graph editor exposes generic factor mappings; runtime factors can propose defaults without case-ID branches.                                           |
| Grouped categorical geometry                                        | IMPLEMENTED | Within-group and between-group spacing are separate; 2×2 and 5×2 stress tests cover geometry.                                                          |
| Layer composition                                                   | IMPLEMENTED | Raw observations, experiment summaries, overall summary, distribution, box, violin, error bars, and connections remain independently selectable.       |
| Small multiples / facet                                             | PARTIAL     | Facet contract, ordering, and simple panel rendering are present. Per-facet independent axes and one-shot multi-panel export remain follow-up work.    |
| Auxiliary reference                                                 | PARTIAL     | Condition identity and visual role persist and are labelled as reference. A dedicated reference-only statistics exclusion policy is not yet universal. |
| Series colors, line styles, point shapes, labels, order, visibility | IMPLEMENTED | Series styles are persisted and the legend is generated from visible series only.                                                                      |
| Distribution fill: transparent / white / series / custom            | IMPLEMENTED | Round 3 PFR049 confirms a white unfilled distribution instead of solid black.                                                                          |
| Long labels and dense categories                                    | IMPLEMENTED | Bounded-label and 20+ category stress tests; category rotation and compact layout controls are present.                                                |

## Axes and reference geometry

| Capability                          | Status      | Evidence / boundary                                                                                                                 |
| ----------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Continuous numeric X geometry       | IMPLEMENTED | Numeric spacing is value-proportional; irregular and log geometry tests pass.                                                       |
| First X at Y-axis intersection      | IMPLEMENTED | Continuous line plots use zero side padding; Round 3 PFR025/PFR069 verify the corrected origin.                                     |
| Manual X/Y range and tick interval  | IMPLEMENTED | Linear/log scales, manual ranges, tick interval, precision, and label rotation persist.                                             |
| Axis unit shown once                | IMPLEMENTED | Unit is part of the axis title and is not repeated on each numeric tick.                                                            |
| Horizontal/vertical reference lines | PARTIAL     | Persisted schema and renderer support exist. Dedicated editor controls and shaded activation-window authoring are not yet complete. |

## Statistical annotation

| Capability                                        | Status      | Evidence / boundary                                                                                                                                                                                                   |
| ------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple simultaneous brackets                    | IMPLEMENTED | Collision-aware interval layout; stress test covers six overlapping brackets.                                                                                                                                         |
| Adjusted p-value authority                        | IMPLEMENTED | Annotation labels use the saved engine result and its adjusted p-status; no re-computation in Graph.                                                                                                                  |
| Exact p / stars / per-comparison n.s.             | IMPLEMENTED | Each saved annotation carries its own display mode and n.s. visibility.                                                                                                                                               |
| Comparison endpoints and lineage                  | IMPLEMENTED | Saved endpoint IDs, analysis run, comparison ID, metric/window, and lineage are persisted.                                                                                                                            |
| Control-versus-many                               | IMPLEMENTED | Round 3 PFR004 and PFR049 render Dunnett families.                                                                                                                                                                    |
| Selected planned contrasts inside factorial route | PARTIAL     | Planned-comparison metadata persists, but the current factorial Statistics route still calculates all pairs. PFR002 is therefore a reasonable workaround even though only the intended two Dox comparisons are drawn. |

## Scientific identity and persistence

| Capability                                          | Status      | Evidence / boundary                                                                                                |
| --------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| Visual role independent of statistical relationship | IMPLEMENTED | X/series/facet do not rewrite independent/paired/repeated/nested identity.                                         |
| Cross-sectional time as series                      | IMPLEMENTED | PFR004 displays 0 h / 24 h as series while retaining independent dishes.                                           |
| Paired/repeated time as series                      | IMPLEMENTED | PFR046 displays Dark/Lit as series while preserving cell pairing and experiment nesting.                           |
| Biological-unit/readout/provenance identity         | IMPLEMENTED | Existing safe loader contract remains intact; Graph Core adds observation-factor identity without flattening.      |
| Backward-compatible old graph state                 | IMPLEMENTED | Missing new arrays/maps receive safe defaults; P0 blank-screen regression is browser-verified.                     |
| Project round trip                                  | IMPLEMENTED | Grouping, styles, axes, reference lines, and multiple annotations are in the project schema and UI project mapper. |

## Figure-family coverage

| Family                                             | Status      | Notes                                                                             |
| -------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| Dot / bar / box / violin with points and summaries | IMPLEMENTED | Includes nested raw observations separated from biological summaries.             |
| Grouped two-series categorical figure              | IMPLEMENTED | Round 3 PFR002, PFR004, PFR046.                                                   |
| Continuous time course                             | IMPLEMENTED | Round 3 PFR025 and PFR069.                                                        |
| Descriptive-only figure                            | IMPLEMENTED | No inferential result is required for finalization.                               |
| Survival / regression / scatter                    | IMPLEMENTED | Existing specialized/core paths remain supported; no Graph Core regression found. |
| Complex multi-panel publication composition        | PARTIAL     | Simple facets exist; freeform panel composition remains outside Graph Core v1.    |

## Residual priorities

1. Restrict factorial inference to explicit planned contrasts without calculating unwanted pairs.
2. Finish reference-line and activation-window editor controls.
3. Make multi-facet export atomic and support independent facet axes where scientifically requested.
