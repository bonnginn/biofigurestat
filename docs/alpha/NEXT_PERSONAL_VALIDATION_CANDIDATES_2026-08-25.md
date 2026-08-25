# Next Personal Validation Candidates

Date: 2026-08-25  
Status: planning only — awaiting human Figure-spec review  
Corpus: Personal Figure Intent Catalog, 69 panels  
Accepted regression cases excluded from selection: PFR002, PFR004, PFR025, PFR046, PFR049, PFR069

## Decision

Fifteen candidate panels were selected to expand graph and analysis grammar without generating data, running statistics, changing product code, or updating the comparison browser. Ten are recommended for the next validation set and five are reserves that need one focused scientific decision or overlap an already accepted grammar.

All proposed specifications are drafts. Published individual values were not digitized, and the existing runtime rows are synthetic reconstructions; therefore `CONFIRMED_FROM_SOURCE_DATA` is not assigned to any candidate.

## Candidate table

| ID     | Paper / figure | Graph family               | Key grammar                                                        | Why selected                                                                                      | Confidence                                                      | Priority    |
| ------ | -------------- | -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------- |
| PFR009 | NDEL1 Fig. 5B  | WB time course             | normalized ratio; ordered time; descriptive trajectory             | Adds Western-blot normalization and a single-series biochemical time course                       | Paper/panel confirmed; inference intent needs review            | Recommended |
| PFR011 | NDEL1 Fig. 5D  | box / violin               | nested cells; six time levels; raw + session summary               | Tests a larger-n microscopy distribution without treating cells as biological n                   | Panel/design high; published test uncertain                     | Recommended |
| PFR020 | NDEL1 Fig. 9F  | grouped proportion         | genotype × renal category; numerator/denominator; possible facets  | Adds animal-level proportions and hierarchical categorical labels                                 | Panel/design high; exact inferential route uncertain            | Recommended |
| PFR021 | NDEL1 Fig. 9G  | nested distribution        | cilia within mouse; genotype × renal category                      | High-value pseudoreplication and three-level hierarchy stress case                                | **Low: biological n in catalog needs user correction**          | Reserve     |
| PFR027 | OPTO Fig. 2C   | repeated line + points     | cells nested in experiment; two longitudinal series                | Adds repeated identity and experiment-aware trajectories beyond the accepted representative trace | Paper/methods high; display aggregation needs review            | Recommended |
| PFR033 | OPTO Fig. 3A   | control-vs-many proportion | seven opto-GTPases; responder numerator/denominator                | Adds screening semantics and a sparse planned-comparison family                                   | Panel/design high; paper was descriptive                        | Recommended |
| PFR035 | OPTO Fig. 3D   | multi-series time course   | four cell types; responding-cell subset; descriptive peaks         | Tests legend density and descriptive multi-series trajectories                                    | High structure; responder-selection meaning needs review        | Reserve     |
| PFR043 | OPTO Fig. 5E   | rescue control-vs-many     | six constructs; WT and negative references; selected contrasts     | Adds construct-domain rescue logic and non-all-pairs annotation                                   | Paper/methods high                                              | Recommended |
| PFR045 | OPTO Fig. 6F   | irregular repeated line    | three probe/construct series; six time points                      | Adds unequal biological meanings in a shared longitudinal readout and endpoint context            | Paper/design high; primary endpoint needs review                | Recommended |
| PFR047 | OPTO Fig. 7E,F | paired before/after        | three treatments; within-cell change plus between-treatment change | Extends paired grammar to inhibitor comparisons                                                   | Paper/methods high; near-duplicate of accepted PFR046           | Reserve     |
| PFR054 | GFLB Fig. 2    | nested box / violin        | crown event → cell → movie; lifetime distribution                  | Adds deeper event nesting and skew-prone duration data                                            | **Low: exact subpanel/test unresolved**                         | Recommended |
| PFR059 | GFLB Fig. 3G,H | grouped biochemical        | genotype × soluble/insoluble fraction; compositional pair          | Adds crossed fractionation semantics and within-fraction contrasts                                | Paper/panel high                                                | Recommended |
| PFR061 | KER5 Fig. 1A   | grouped biochemical        | phase × keratin; two related targets                               | Adds a compact WB/fractionation two-factor display                                                | Panel high; published test uncertain; overlaps PFR059           | Reserve     |
| PFR062 | KER5 Fig. 1B,C | multi-series time course   | kinase × substrate × time; six series                              | Strong stress case for legend/hierarchy and descriptive biochemical kinetics                      | Paper/panel high; inference likely descriptive                  | Recommended |
| PFR066 | KER5 Fig. 2A,B | facet / small multiples    | phospho-signals plus mitotic-phase fractions over time             | Tests multiple readouts with incompatible meanings/scales                                         | **Low: facet, normalization, and shared-axis intent need user** | Reserve     |

## Coverage

- Grouped categorical and hierarchical labels: PFR020, PFR043, PFR059, PFR061.
- Multiple series and legend semantics: PFR027, PFR035, PFR045, PFR062, PFR066.
- Paired/repeated identity: PFR027, PFR045, PFR047.
- Nested microscopy and raw + summary: PFR011, PFR021, PFR054.
- Larger-n distribution: PFR011, PFR021, PFR054.
- WB/biochemical quantification: PFR009, PFR059, PFR061, PFR062, PFR066.
- Proportion with retained numerator/denominator: PFR020, PFR033, PFR043.
- Rescue and selected comparisons: PFR043.
- Control-vs-many: PFR033, PFR043.
- Facet/small multiples and multiple readouts: PFR020, PFR066.
- Descriptive time course: PFR009, PFR035, PFR045, PFR062, PFR066.

The 69-panel corpus does not provide a well-grounded survival, correlation/regression, or log-axis candidate. Those grammars were not invented solely to fill a coverage checklist.

## Recommended 10

PFR009, PFR011, PFR020, PFR027, PFR033, PFR043, PFR045, PFR054, PFR059, PFR062.

This set prioritizes distinct product stress points. PFR054 is retained despite lower source certainty because three-level event nesting is unusually valuable; its exact panel/test must be confirmed before generation.

## Reserve 5

- PFR021: proceed only after confirming mouse count, cilium count, and the true biological n.
- PFR035: proceed if the intended message is explicitly descriptive among responding cells, not population responder frequency.
- PFR047: proceed if an additional multi-treatment paired case is worth the overlap with accepted PFR046.
- PFR061: proceed if phase × keratin adds enough value beyond PFR059 fractionation.
- PFR066: proceed after choosing facets versus normalized shared scale and whether phase fractions are contextual rather than inferential peers.

## Excluded from this shortlist: 54

- Already accepted regression cases (6): PFR002, PFR004, PFR025, PFR046, PFR049, PFR069.
- Near-duplicates or lower-priority variants of selected grammars (48): PFR001, PFR003, PFR005–PFR008, PFR010, PFR012–PFR019, PFR022–PFR024, PFR026, PFR028–PFR032, PFR034, PFR036–PFR042, PFR044, PFR048, PFR050–PFR053, PFR055–PFR058, PFR060, PFR063–PFR065, PFR067–PFR068.

These are excluded from the present expansion shortlist, not rejected permanently. The main reasons are repeated bar/proportion grammar, repeated optogenetic trajectory grammar, weaker panel localization, or less product value than another candidate representing the same structure.

## Evidence boundaries

- Identification, question, graph family, panel certainty, sample-size class, and reported method were taken from the existing Personal Figure Intent Catalog/runtime packets.
- Methods confidence is only marked high where the catalog records an explicit published method.
- Proposed analysis and graph conventions are review proposals, not claims about what the paper did.
- Existing synthetic runtime row counts are used only to estimate display scale. They are not source data and will not be regenerated in this phase.

## Human-review gate

The review packet asks for short decisions on primary contrast, biological unit, inference requirement, and graph convention. No candidate should move to generation until those decisions are recorded.
