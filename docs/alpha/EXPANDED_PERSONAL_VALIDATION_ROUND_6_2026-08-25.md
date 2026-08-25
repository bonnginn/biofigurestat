# Expanded Personal Validation — Round 6

Date: 2026-08-25  
Status: `READY WITH NONBLOCKING SOURCE UNCERTAINTIES`

## Outcome

All 12 human-corrected cases were processed in a new immutable round. Following the nonlinear-fitting addendum, all 12 now have complete workflows; PFR062 uses the generic versioned D17 nonlinear XY contract. Existing Round 1–5 evidence was not overwritten, Pool D was not opened, and human ratings remain empty.

## Case results

| Case    | Outcome                                          | Scientific result                                                                                                                                                                                    |
| ------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PFR009  | Complete                                         | n=1 representative WB; two 0 h-normalized descriptive series; no error bars or inference.                                                                                                            |
| PFR011  | Complete with source uncertainty                 | Fig. 5C distribution; cross-sectional cells; app-reconstructed session summaries for selected 0 h comparisons; only significant labels displayed.                                                    |
| PFR020  | Complete                                         | Adjacent WT/cko bars within Proximal, Distal, and C.D.; Proximal significant and the other two n.s.; mouse-level proportions retained.                                                               |
| PFR027A | Complete                                         | control/RhoA/Rac1/Cdc42 summary dots; control-vs-many family; mixed significant/n.s. labels.                                                                                                         |
| PFR027B | Complete                                         | Repeated two-series fluorescence trajectory with 458-nm illumination interval and experiment/cell identity. No endpoint inference.                                                                   |
| PFR033  | Complete                                         | Six-condition descriptive RPE1 screen; no invented opto-control, p-value, or duplicate mean marker.                                                                                                  |
| PFR043  | Complete                                         | ECFP-vs-WT and WT-vs-mutant planned family only; Holm adjustment; impaired H1433L/ΔYins and retained F702A/R2130L in the synthetic reconstruction.                                                   |
| PFR045  | Complete                                         | Five mean±SD measured-domain series; individual color, solid/dashed style, width, and visibility state persisted; legend uses the same style semantics.                                              |
| PFR054  | Graph complete; inference explicitly unsupported | Fig. 2D true Tukey box-and-whisker plus crown events. Source-backed inferential unit is unresolved, so events were not treated as biological n.                                                      |
| PFR059A | Complete                                         | 3 fractions × 3 genotypes, grouped hierarchy, within-fraction selected comparisons.                                                                                                                  |
| PFR059B | Complete                                         | Complementary paired P/S values from the same fractionation samples; stacked display and genotype comparisons on the P component.                                                                    |
| PFR062  | Complete nonlinear XY fit                        | K5/K14 observed points remain separate from independent authoritative `zero_baseline_association` curves; model, parameters, uncertainty, diagnostics, starts, bounds, and engine lineage are saved. |

## Scientific audit

Every case persists answers for experimental unit, display versus inferential unit, pairing/repeated identity, descriptive versus inferential status, comparison family, reference roles, display/analysis/comparison/annotation sets, legend/factor semantics, and graph convention.

Nonblocking uncertainties:

- PFR011 session identities are explicit app reconstruction, not recovered published raw identity.
- PFR054 cell/movie/session hierarchy is not safely recoverable from the current source evidence.
- GFLB Fig. 2D/Fig. 3G,H and KER5 Fig. 1B are linked to the primary articles with local placeholders rather than bypassing publisher restrictions.

## Product implementation

PFR045 exposed one generic P1 Graph gap. Optional per-series `lineWidth` is now serialized in GraphSpec and project graph state, editable in the Inspector, used by line rendering, and reflected in the legend together with line style. The field is additive and does not require destructive migration.

PFR062 triggered a controlled generic Core addition rather than a case-specific optimizer. D17 provides two explicit one-phase association models, bounds/start/convergence/uncertainty provenance, failure refusal, and saved authoritative fitted curves. Michaelis–Menten was not used because X is reaction time. See ADR 0050.

## Human visual review corrections

The first expanded-review feedback was applied without changing the analysis families or experimental units:

- Restored every raster Y-axis title to the conventional rotated axis position.
- PFR009 now includes horizontal guide lines; PFR011 uses numeric hour ticks because the axis title already carries the hour unit.
- PFR020 now shows repeat dots and mean±SD with a 0–100% axis.
- PFR027A now shows SD; PFR027B redraws the X-axis above the illumination layer.
- PFR033 now shows SD with a 0–100% axis.
- PFR043 now shows SD and uses a narrower category span to remove excessive whitespace.
- PFR059A now shows SD, integer ticks, and explicit within-fraction comparison brackets.
- PFR059B shows SD on P only and moves both P-fraction comparison brackets above the 100% stacks.

## Artifact map

- Dataset/spec manifest: `benchmark/personal_figure_v1/expanded_round_6_spec_manifest.json`
- Runtime datasets: `benchmark/personal_figure_v1/runtime_round_6/`
- Complete run artifacts: `benchmark/personal_figure_v1/runs_round_6/`
- Comparison manifest: `benchmark/personal_figure_v1/comparison_manifest_round_6.json`
- Empty human review state: `benchmark/personal_figure_v1/review/review_round_6.json`
- Automated audit/defects: `benchmark/personal_figure_v1/expanded_round_6_audit_summary.json`
- Product boundary: `docs/adr/0049-series-line-width-and-expanded-validation-boundaries.md`

Each case contains project state, Default/Final SVG and PNG, Statistics, Methods, graph state, run metadata, interaction/provenance log, scientific audit, and support classification.

## Validation report

- UI: 55 files / 400 tests passed.
- TypeScript packages: 34 files / 138 tests passed across GraphSpec, project, domain, analysis-contracts, and data-sheet.
- Python statistical engine: 56 tests passed.
- Expanded artifact/scientific contract: 8 tests passed, including save/open, GraphSpec serialization, provenance/export integrity, nested-unit, descriptive-only, selected-comparison, reviewed graph-presentation semantics, and PFR062 authoritative-fit regression coverage.
- UI/package typecheck, UI lint, changed-file format check, Python script compilation, and production build passed. The build retained the existing nonblocking large-chunk warning.
- Round 6 browser audit confirmed 12 review entries, empty human ratings, three-panel reference/default/final rendering, and a readable responsive case navigator.

## Human-review handoff

Review the 12 cases in comparison round 6. Ratings are intentionally blank. PFR054 should be judged for display fidelity separately from inferential support; PFR062 should be judged on observed-point fidelity, saved nonlinear curves, and Statistics/Methods lineage.

The next action is human readability/preference review. No further generation should occur until that review is saved.
