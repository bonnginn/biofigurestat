# Context-Rich Graph Family Expansion

Date: 2026-08-25  
Methodology: `context-rich-graph-1.1`  
Verdict: `READY_WITH_BOUNDED_EXCEPTIONS`

## Outcome

The 12-case pilot passed the revised gate and was expanded by 23 cases to the fixed 35-case non-Pool-D Graph repair queue. Original LSA495 cases and historical Round evidence remain immutable. The repaired workbook and Pool D were not opened.

| Classification | Count |
| --- | ---: |
| `CONTEXT_RICH_READY` | 24 |
| `READY_WITH_MINOR_SOURCE_UNCERTAINTY` | 3 |
| `READY_WITH_BOUNDED_SOURCE_UNCERTAINTY` | 6 |
| `CONTEXT_RICH_READY_SAFE_UNSUPPORTED` | 2 |
| **Total** | **35** |

`READY_WITH_BOUNDED_EXCEPTIONS` means that every case has an exact source panel and a defensible scientific display. It does not mean that every source analysis was reconstructed. When the independent unit, repeated model, or per-feature analysis was not recoverable, inference was withheld and no convenient substitute was run.

## Method changes that affected selection

- Panel localization precedes family assignment.
- The source panel may override the historical repair-queue family.
- Cell, axon, generation, field, and feature counts do not become biological n without supporting identity.
- Graph-only and safe-unsupported are valid outcomes when scientific structure is preserved.
- Deterministic synthetic values are never represented as published observations.

Three material historical family corrections were found:

| Case | Historical family | Source-localized family |
| --- | --- | --- |
| `LSA127` | correlation | independent two-group nonparametric |
| `LSA233` | paired | independent mouse-level proportion |
| `LSA257` | ordinary multi-group | ordered cross-sectional refeeding time |

## Bounded exceptions

- Minor source uncertainty: `LSA135`, `LSA077`, `LSA094`.
- Bounded source/unit uncertainty with Graph retained and inference not overclaimed: `LSA324`, `LSA053`, `LSA058`, `LSA128`, `LSA178`, `LSA186`.
- Safe unsupported: `LSA126` crossed within-mouse hemisphere × time inference; `LSA108` lacks a declared independent biological n for the selected cell/focus proportion panel.

These exceptions are part of the verdict, not hidden failures.

## Validation

- 35 unique fixed case IDs; 12 revalidated pilot cases plus 23 expansion cases.
- Complete Graph, Methods, Statistics-status, project-state, support-classification, and run artifacts for every case.
- JSON roundtrip and final-Graph SHA-256 checks pass.
- Corrected-family and safe-unsupported guards pass.
- Six dedicated pilot/expansion tests pass.
- Comparison browser generated at `benchmark/literature_v2_1/context_rich_graph_expansion_2026-08-25/comparison_browser/index.html`.

## Boundary

This certifies a bounded Graph/context subset and the revised reconstruction method. It does not certify the full 495-case benchmark for paper-context fidelity, does not expose Pool D, and does not authorize a full benchmark rerun.
