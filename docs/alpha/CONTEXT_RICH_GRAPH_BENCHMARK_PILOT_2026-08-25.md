# Context-Rich Graph Benchmark Pilot

Date: 2026-08-25  
Final status: `READY FOR FAMILY EXPANSION`  
Methodology: `context-rich-graph-1.1`

## Outcome

The 12-case pilot was re-audited without overwriting any original LSA495 case or historical Round evidence. The two decision gates were resolved, and the methodology is stable enough for bounded family expansion.

| Classification                        | Count |
| ------------------------------------- | ----: |
| `CONTEXT_RICH_READY`                  |     8 |
| `READY_WITH_MINOR_SOURCE_UNCERTAINTY` |     3 |
| `CONTEXT_RICH_READY_SAFE_UNSUPPORTED` |     1 |
| `SOURCE_UNRESOLVABLE`                 |     0 |

No unresolved human-context blocker remains. The fixed non-Pool-D queue was subsequently expanded to 35 cases; see `docs/alpha/CONTEXT_RICH_GRAPH_FAMILY_EXPANSION_2026-08-25.md`.

## Pilot boundary and source method

Only the explicit allow-list `LSA135, LSA086, LSA090, LSA077, LSA126, LSA157, LSA249, LSA094, LSA168, LSA088, LSA120, LSA346` was used. Target Figure legends were checked by explicit DOI/PMCID against Europe PMC. Neither the repaired workbook nor an unfiltered runtime directory was opened.

Every new case uses the lineage form `LSAxxx_context_rich_v2`. Values are marked deterministic synthetic reconstruction and are never represented as published observations.

## Context fidelity after reconstruction

- Ready, ready with minor uncertainty, or valid safe-unsupported: 12/12 (100%).
- Material generic-template context loss among completed reconstructions: 0/10.
- Resolved source localization: `LSA077` uses Fig. 2B for the legacy lineage; Fig. 2D remains a separate split-case candidate.
- Safe Alpha boundary: `LSA126` remains Graph-valid and inference-unsupported.

`LSA077` is localized to Fig. 2B cap binding for the existing lineage because its two-way-ANOVA/Tukey fingerprint matches the historical metadata. Its Graph uses independent pulldown experiments and conserved-tryptophan mutants. The reported second ANOVA factor is not explicit, so source inference is recorded but not reconstructed. Fig. 2D is retained as a new split-case candidate rather than merged.

`LSA126` requires two crossed within-animal factors—hemisphere and ordered time—with stable mouse identity. The app can display the two-series trajectory, but its current executable contracts do not safely represent that inferential structure. Under methodology 1.1 this is `CONTEXT_RICH_READY_SAFE_UNSUPPORTED`: safe refusal is an acceptable Alpha result and does not block Graph-family expansion.

## Graph grammar coverage

The pilot covers heatmap/multi-readout, multi-series FRAP, nested box/violin, nested raw plus biological-unit summary, WB normalization, faceted correlation, survival, cumulative event timing, and rescue/reference logic.

The new datasets no longer share the previous generic two-group template: row counts, condition counts, nesting, repeated identity, X geometry, survival structure, and Graph families differ materially across cases. Because only 10 cases were completed, this is a pilot-level convergence finding rather than certification of a 30–50-case subset.

## Nonlinear fitting addendum

Generic `D17` basic nonlinear XY fitting was added. It stores the model and rationale, raw points separately from fitted curves, parameter estimates and uncertainty, diagnostics, engine/package version, initial values, and bounds. Graph construction consumes the authoritative saved fitted curve.

PFR062 now displays K5/K14 observed points and independent saved `zero_baseline_association` fits. Michaelis–Menten was rejected because X is reaction time. Appearance changes do not trigger fitting. See `docs/adr/0050-basic-nonlinear-xy-fitting.md`.

## Preliminary product gaps

1. P1 scientific-design gap: crossed within-unit factors (`hemisphere × time`) with stable biological identity.
2. Source-localization workflow gap: a case must identify the exact panel before family/contrast Gold can be generated.

No large Graph/UX redesign was started.

## Methodology 1.1 gate

1. Select the exact panel before assigning a Graph or analysis family.
2. Allow source evidence to correct the historical candidate family.
3. Establish the biological unit before interpreting n.
4. Preserve display, analysis, comparison, and annotation sets separately.
5. Accept safe-unsupported Graph cases when unsupported inference is explicit and no substitute test is run.
6. Never represent deterministic synthetic values as published observations.

The re-audit verdict is `READY_FOR_FAMILY_EXPANSION`. Expansion remains bounded to the fixed 35-case non-Pool-D repair queue; 495/495 context-rich certification is not implied.

## Artifacts

- `benchmark/literature_v2_1/context_rich_graph_pilot_2026-08-25/pilot_manifest.json`
- `benchmark/literature_v2_1/context_rich_graph_pilot_2026-08-25/runtime/`
- `benchmark/literature_v2_1/context_rich_graph_pilot_2026-08-25/runs/`
- `benchmark/literature_v2_1/context_rich_graph_pilot_2026-08-25/comparison_browser/index.html`
- method audit, exception clusters, expansion manifest, coverage matrix, Graph audit, and lineage map in the same directory.
