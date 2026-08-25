# Expanded Personal Validation — Defect Classification

Date: 2026-08-25  
Round: expanded personal validation / comparison round 6

## Product change implemented

| Case   | Classification       | Severity                             | Resolution                                                                                                                                            |
| ------ | -------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| PFR045 | GRAPH_CAPABILITY_GAP | P1, generic and low-to-moderate risk | Added optional per-series line width; renderer and legend now share color, line style, and width. Added schema and pure semantic regression coverage. |

## Explicit non-product resolutions

| Case   | Classification              | Severity                      | Resolution                                                                                                                                                                                              |
| ------ | --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PFR054 | SOURCE_UNCERTAINTY          | Nonblocking for visual review | Completed true box-and-whisker plus event-dot display. Did not infer session/movie identity or count events as biological n; two-group inference is explicitly unsupported until hierarchy is supplied. |
| PFR062 | RESOLVED_GENERIC_CAPABILITY | Resolved by D17               | Preserved observed CDK1–K5/K14 points and added independent authoritative one-phase association curves with model/parameter/diagnostic/start/bounds provenance.                                         |
| PFR011 | SOURCE_UNCERTAINTY          | Nonblocking                   | Publication-facing cell distribution is separated from app-reconstructed session-level inference; the distinction is explicit in Statistics, Methods, and audit metadata.                               |

## Generator issues found and fixed before handoff

- GRAPH_DEFAULT_ISSUE: PNG Y labels initially clipped, and the first repair moved them to the top. Human review correctly identified that as a graph-grammar regression. Added safe rotated raster text with sufficient left margin and restored conventional Y-axis placement across all cases.
- GRAPH_DEFAULT_ISSUE: repeat summaries omitted required SD/error bars in PFR020, PFR027A, PFR033, PFR043, PFR059A, and PFR059B. Restored mean±SD while preserving PFR059B's complementary-fraction rule by applying the error bar to P only.
- GRAPH_DEFAULT_ISSUE: percent axes and grouped spacing did not follow the reviewed display contract. PFR020/PFR033 now stop at 100%; PFR043 uses a compact category span; PFR059A uses integer ticks.
- GRAPH_DEFAULT_ISSUE: comparison symbols in PFR059A/PFR059B did not identify their endpoints cleanly. Added explicit brackets and moved PFR059B annotations above the stacks.
- GRAPH_DEFAULT_ISSUE: PFR027B's illumination layer covered the X-axis. The axis is now redrawn above the annotation layer.
- SYNTHETIC_RECONSTRUCTION_ERROR: selected annotations were calculated but initially absent from final raster graphs. Final graphs now show only the authoritative selected comparison set, including required n.s. labels.
- UX/DISCOVERABILITY: long support-classification labels overflowed the Round 6 case navigator. Constrained and wrapped navigator content, then verified the fix in the live browser.
- ACCEPTABLE_DIFFERENCE: PFR033 and PFR043 omit a redundant legend when category labels already identify every bar.

No case-specific branch was added to product code. Case configuration remains in validation-generation infrastructure.
