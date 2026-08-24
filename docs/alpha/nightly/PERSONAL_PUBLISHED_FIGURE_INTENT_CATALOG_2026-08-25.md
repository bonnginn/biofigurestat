# Personal Published Figure Intent Catalog

Date: 2026-08-25  
Status: intent catalog only; human confirmation remains required before promoting inferred fields to Gold

## 結論

既存の personal benchmark が参照する実在5論文から、69件の Figure/panel-level scientific question を catalog 化した。既存6ケースだけに限定せず、main figure と supplementary figure を含む。新しい synthetic data、app run、Graph artifact は作成していない。Pool D と benchmark workbook は開いていない。
内訳は main 67件、supplementary 2件。

この catalog は published Figure の意図を次の Graph capability audit 候補へ接続するための索引であり、推測を Gold に昇格させるものではない。特に factor 分解、visual-role mapping、色・凡例の厳密な意味は `INFERRED_HIGH_CONFIDENCE` または `UNCERTAIN` として明示した。

## Coverage

| Paper | DOI | Entries | Primary source |
| --- | --- | ---: | --- |
| CRYO — Cryo-ET of actin cytoskeleton and membrane structure in lamellipodia formation using optogenetics | `10.1016/j.isci.2025.112529` | 1 | https://pmc.ncbi.nlm.nih.gov/articles/PMC12136925/ |
| GFLB — The F-actin-binding RapGEF GflB is required for efficient macropinocytosis in Dictyostelium | `10.1242/jcs.194126` | 12 | https://doi.org/10.1242/jcs.194126 |
| KER5 — Regulation of keratin 5/14 intermediate filaments by CDK1, Aurora-B, and Rho-kinase | `10.1016/j.bbrc.2018.03.016` | 8 | https://www.sciencedirect.com/science/article/pii/S0006291X1830490X |
| NDEL1 — Ndel1 suppresses ciliogenesis in proliferating cells by regulating the trichoplein-Aurora A pathway | `10.1083/jcb.201507046` | 24 | https://rupress.org/jcb/article/212/4/409/38478/Ndel1-suppresses-ciliogenesis-in-proliferating |
| OPTO — Optogenetic control of small GTPases reveals RhoA mediates intracellular calcium signaling | `10.1016/j.jbc.2021.100290` | 24 | https://pmc.ncbi.nlm.nih.gov/articles/PMC7949103/ |

## Scientific-intent anchor confidence

| Anchor confidence | Entries | Meaning |
| --- | ---: | --- |
| `CONFIRMED_FROM_PAPER` | 61 | Figure/panel and scientific question are directly identified in the paper record. |
| `INFERRED_HIGH_CONFIDENCE` | 4 | Figure is identifiable, but at least one method/panel-detail field remains reconstructed. |
| `UNCERTAIN` | 4 | Figure is known but exact subpanel assignment is not secure. |

No entry is marked `CONFIRMED_FROM_SOURCE_DATA`: published numeric source data were not used in this catalog pass.
Condition/time labels and factor candidates retained from the existing source-grounded personal benchmark are not treated as direct source-data evidence; their field-level confidence remains `INFERRED_HIGH_CONFIDENCE` until panel-level re-check.

## Graph Capability Audit candidate mapping

The mapping is candidate routing, not a pass/fail benchmark and not a claim that the current app supports the dimension.

| Capability dimension | Candidate entries |
| --- | --- |
| all-pairs annotation | PFR044, PFR046, PFR047 |
| auxiliary reference | PFR002 |
| continuous time | PFR001, PFR004, PFR007, PFR009, PFR010, PFR012, PFR013, PFR014, PFR025, PFR026, PFR027, PFR028, PFR029, PFR030, PFR031, PFR032, PFR035, PFR045, PFR048, PFR057, PFR058, PFR062, PFR066, PFR069 |
| control-vs-many | PFR001, PFR002, PFR005, PFR006, PFR007, PFR008, PFR016, PFR018, PFR024, PFR042, PFR049, PFR050, PFR051, PFR052, PFR053, PFR054, PFR055, PFR056, PFR060, PFR063, PFR064, PFR065, PFR067 |
| descriptive-only | PFR009, PFR010, PFR025, PFR026, PFR033, PFR034, PFR035, PFR045, PFR048, PFR057, PFR058, PFR060, PFR062, PFR066, PFR069 |
| distribution | PFR011, PFR018, PFR024, PFR049, PFR050, PFR051, PFR052, PFR053, PFR054, PFR055 |
| grouped categorical | PFR001, PFR002, PFR003, PFR005, PFR006, PFR008, PFR011, PFR015, PFR016, PFR017, PFR018, PFR019, PFR020, PFR021, PFR022, PFR023, PFR024, PFR033, PFR034, PFR036, PFR037, PFR038, PFR039, PFR040, PFR041, PFR042, PFR043, PFR044, PFR049, PFR050, PFR051, PFR052, PFR053, PFR054, PFR055, PFR056, PFR059, PFR060, PFR061, PFR063, PFR064, PFR065, PFR067, PFR068 |
| independent visual series | PFR001, PFR004, PFR007, PFR012, PFR013, PFR014, PFR057, PFR058, PFR062, PFR066 |
| irregular X | PFR009, PFR010, PFR013, PFR025, PFR026, PFR027, PFR028, PFR029, PFR030, PFR031, PFR032, PFR035, PFR045, PFR048, PFR062 |
| log axis |  |
| multiple readouts | PFR009, PFR010 |
| multiple series | PFR001, PFR002, PFR004, PFR007, PFR012, PFR013, PFR014, PFR025, PFR026, PFR027, PFR028, PFR029, PFR030, PFR031, PFR032, PFR035, PFR045, PFR046, PFR047, PFR057, PFR058, PFR062, PFR066 |
| nested raw + summary | PFR005, PFR011, PFR018, PFR021, PFR024, PFR046, PFR047, PFR049, PFR050, PFR051, PFR052, PFR053, PFR054, PFR055 |
| paired series | PFR025, PFR026, PFR027, PFR028, PFR029, PFR030, PFR031, PFR032, PFR035, PFR045, PFR046, PFR047 |
| regression |  |
| rescue | PFR002, PFR003, PFR008, PFR015, PFR016, PFR017, PFR018, PFR043 |
| survival |  |

Dimensions with no secure personal candidate in the current source set: survival, regression, and a confirmed log-axis panel. These should remain explicitly uncovered rather than be inferred from an unrelated panel.

## Panel inventory

| ID | Paper | Figure/panel | Scientific question | Design / visual candidate | Confidence |
| --- | --- | --- | --- | --- | --- |
| PFR001 | NDEL1 | Fig. 1B | Does depletion of Ndel1 or NDE1 induce unscheduled primary-cilium assembly in proliferating RPE1 cells over 48–72 h? | cross_time; continuous time, control-vs-many, grouped categorical, independent visual series | `CONFIRMED_FROM_PAPER` |
| PFR002 | NDEL1 | Fig. 1F | Does inducible siRNA-resistant Ndel1 expression rescue unscheduled ciliation caused by Ndel1 depletion? | proportion; auxiliary reference, control-vs-many, grouped categorical, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR003 | NDEL1 | Fig. 1F | Is rescue specific to Ndel1 rather than NDE1 expression under the corresponding knockdown conditions? | proportion; grouped categorical, rescue | `CONFIRMED_FROM_PAPER` |
| PFR004 | NDEL1 | Fig. 2A | Does Ndel1 depletion impair primary-cilium disassembly after serum-driven cell-cycle reentry? | cross_time; continuous time, independent visual series, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR005 | NDEL1 | Fig. 2C | Does Ndel1 depletion alter ciliary length before serum stimulation? | nested; control-vs-many, grouped categorical, nested raw + summary | `CONFIRMED_FROM_PAPER` |
| PFR006 | NDEL1 | Fig. 3B,C,F,I,L | How do Ndel1, Lis1, dynein-1 subunits, and Tctex-1 depletion compare in their effects on unscheduled ciliation? | proportion; control-vs-many, grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR007 | NDEL1 | Fig. 3D,G,J,M | How do depletion of Ndel1 and dynein regulators affect serum-induced ciliary disassembly? | cross_time; continuous time, control-vs-many, independent visual series, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR008 | NDEL1 | Fig. 4B | Is the reduction in cyclin-A-positive proliferating cells after Ndel1 depletion dependent on primary cilia and reversible by IFT20 codepletion? | proportion; control-vs-many, grouped categorical, rescue | `CONFIRMED_FROM_PAPER` |
| PFR009 | NDEL1 | Fig. 5B | How does Ndel1 abundance normalized to GAPDH change during serum starvation? | wb; continuous time, descriptive-only, irregular X, multiple readouts | `CONFIRMED_FROM_PAPER` |
| PFR010 | NDEL1 | Fig. 5B | How does trichoplein abundance normalized to GAPDH change during serum starvation? | wb; continuous time, descriptive-only, irregular X, multiple readouts | `CONFIRMED_FROM_PAPER` |
| PFR011 | NDEL1 | Fig. 5D | How does mother-centriole-associated Ndel1 intensity change during serum starvation? | nested; distribution, grouped categorical, nested raw + summary | `CONFIRMED_FROM_PAPER` |
| PFR012 | NDEL1 | Fig. 6A | Does inducible Ndel1 expression inhibit primary-cilium assembly during serum starvation? | cross_time; continuous time, independent visual series, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR013 | NDEL1 | Fig. 6C | Does Ndel1 expression retain trichoplein at the mother centriole during serum starvation? | cross_time; continuous time, independent visual series, irregular X, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR014 | NDEL1 | Fig. 7A | How does trichoplein overproduction alter ciliation during serum starvation? | cross_time; continuous time, independent visual series, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR015 | NDEL1 | Fig. 7B | Can trichoplein overproduction rescue unscheduled ciliation caused by Ndel1 depletion? | proportion; grouped categorical, rescue | `CONFIRMED_FROM_PAPER` |
| PFR016 | NDEL1 | Fig. 7C | Can Ndel1 overproduction rescue unscheduled ciliation caused by trichoplein depletion? | proportion; control-vs-many, grouped categorical, rescue | `CONFIRMED_FROM_PAPER` |
| PFR017 | NDEL1 | Fig. 7D | Does KCTD17 codepletion restore ciliation and Aurora-A activation phenotypes caused by Ndel1 depletion? | proportion; grouped categorical, rescue | `CONFIRMED_FROM_PAPER` |
| PFR018 | NDEL1 | Fig. 7E | Does KCTD17 codepletion restore mother-centriole-associated trichoplein after Ndel1 depletion? | nested; control-vs-many, distribution, grouped categorical, nested raw + summary | `CONFIRMED_FROM_PAPER` |
| PFR019 | NDEL1 | Fig. 9C | Does reduced Ndel1 expression alter body weight in adult mice? | continuous; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR020 | NDEL1 | Fig. 9F | Does Ndel1 hypomorphism increase the fraction of ciliated cells in distinct newborn kidney tubule categories? | proportion; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR021 | NDEL1 | Fig. 9G | Does Ndel1 hypomorphism alter primary-cilium length in newborn kidney tubule categories? | nested; grouped categorical, nested raw + summary | `CONFIRMED_FROM_PAPER` |
| PFR022 | NDEL1 | Fig. 9I | Does Ndel1 hypomorphism alter the fraction of Ki-67-positive newborn kidney cells? | proportion; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR023 | NDEL1 | Fig. 10A,B | How do Ndel1 depletion and inducible Ndel1 expression affect ciliation in proliferating or low-serum Swiss 3T3 cells? | proportion; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR024 | NDEL1 | Fig. 10C,D | Does Ndel1 depletion lengthen primary cilia in quiescent Swiss 3T3 cells? | nested; control-vs-many, distribution, grouped categorical, nested raw + summary | `CONFIRMED_FROM_PAPER` |
| PFR025 | OPTO | Fig. 1D top | How rapidly and reversibly does SspB-LARG-DH accumulate in a locally illuminated plasma-membrane region? | longitudinal; continuous time, descriptive-only, irregular X, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR026 | OPTO | Fig. 1D bottom | Does local opto-RhoA activation increase RhoA biosensor intensity specifically in the illuminated region? | longitudinal; continuous time, descriptive-only, irregular X, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR027 | OPTO | Fig. 2C | Does blue-light recruitment of the RhoA-specific GEF activate the corresponding small-GTPase biosensor compared with opto-control? | longitudinal; continuous time, irregular X, multiple series, paired series | `CONFIRMED_FROM_PAPER` |
| PFR028 | OPTO | Fig. 2D | Does blue-light recruitment of the Rac1-specific GEF activate the corresponding small-GTPase biosensor compared with opto-control? | longitudinal; continuous time, irregular X, multiple series, paired series | `CONFIRMED_FROM_PAPER` |
| PFR029 | OPTO | Fig. 2E | Does blue-light recruitment of the Cdc42-specific GEF activate the corresponding small-GTPase biosensor compared with opto-control? | longitudinal; continuous time, irregular X, multiple series, paired series | `CONFIRMED_FROM_PAPER` |
| PFR030 | OPTO | Fig. 2F | Does blue-light recruitment of the HRas-specific GEF activate the corresponding small-GTPase biosensor compared with opto-control? | longitudinal; continuous time, irregular X, multiple series, paired series | `CONFIRMED_FROM_PAPER` |
| PFR031 | OPTO | Fig. 2G | Does blue-light recruitment of the Rap1A-specific GEF activate the corresponding small-GTPase biosensor compared with opto-control? | longitudinal; continuous time, irregular X, multiple series, paired series | `CONFIRMED_FROM_PAPER` |
| PFR032 | OPTO | Fig. 2H | Does blue-light recruitment of the RalB-specific GEF activate the corresponding small-GTPase biosensor compared with opto-control? | longitudinal; continuous time, irregular X, multiple series, paired series | `CONFIRMED_FROM_PAPER` |
| PFR033 | OPTO | Fig. 3A | Which optogenetically activated small GTPase induces intracellular Ca2+ transients in RPE1 cells? | proportion; descriptive-only, grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR034 | OPTO | Fig. 3B | Which optogenetically activated small GTPase induces intracellular Ca2+ transients in HeLa cells? | proportion; descriptive-only, grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR035 | OPTO | Fig. 3D | How do normalized R-GECO1 Ca2+ transient trajectories compare among responding RPE1, HeLa, MDCK, and HEK293T cells after opto-RhoA activation? | longitudinal; continuous time, descriptive-only, irregular X, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR036 | OPTO | Fig. 4A L-15 | Which pathway inhibitors reduce opto-RhoA-induced Ca2+ responder frequency in RPE1 in L-15? | proportion; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR037 | OPTO | Fig. 4A Ringer | Which pathway inhibitors reduce opto-RhoA-induced Ca2+ responder frequency in RPE1 in Ringer? | proportion; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR038 | OPTO | Fig. 4B L-15 | Which pathway inhibitors reduce opto-RhoA-induced Ca2+ responder frequency in HeLa in L-15? | proportion; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR039 | OPTO | Fig. 4B Ringer | Which pathway inhibitors reduce opto-RhoA-induced Ca2+ responder frequency in HeLa in Ringer? | proportion; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR040 | OPTO | Fig. 4C | Which pathway inhibitors reduce opto-RhoA-induced Ca2+ responder frequency in MDCK? | proportion; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR041 | OPTO | Fig. 4D | Which pathway inhibitors reduce opto-RhoA-induced Ca2+ responder frequency in HEK293T? | proportion; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR042 | OPTO | Fig. 5B | Is PLCε required for opto-RhoA-induced Ca2+ transients in RPE1 and HeLa cells? | proportion; control-vs-many, grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR043 | OPTO | Fig. 5E | Which PLCε domains or catalytic activities are required to rescue RhoA-induced Ca2+ transients after PLCε depletion? | proportion; grouped categorical, rescue | `CONFIRMED_FROM_PAPER` |
| PFR044 | OPTO | Fig. 6C | Is plasma-membrane-localized RhoA activation more effective than TGN- or Golgi-targeted RhoA activation in inducing Ca2+ transients? | proportion; all-pairs annotation, grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR045 | OPTO | Fig. 6F | How does cytosolic PLCδ-PH intensity change during light activation of opto-5-ptase or opto-RhoA compared with fluorescent-protein controls? | longitudinal; continuous time, descriptive-only, irregular X, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR046 | OPTO | Fig. 7C,D | Does PLCε depletion prevent the within-cell increase in NFAT nuclear-to-cytosol ratio after opto-RhoA activation? | paired_cells; all-pairs annotation, multiple series, nested raw + summary, paired series | `CONFIRMED_FROM_PAPER` |
| PFR047 | OPTO | Fig. 7E,F | Do cyclosporin A or BAPTA-AM prevent the within-cell NFAT translocation response to opto-RhoA? | paired_cells; all-pairs annotation, multiple series, nested raw + summary, paired series | `CONFIRMED_FROM_PAPER` |
| PFR048 | OPTO | Fig. 7B | What is the temporal pattern of NFAT nuclear accumulation in individual HeLa cells after opto-RhoA activation? | longitudinal; continuous time, descriptive-only, irregular X | `CONFIRMED_FROM_PAPER` |
| PFR049 | GFLB | Fig. 1 (quantitative morphology panel) | Does GflB loss or overproduction alter projected cell area in vegetative Dictyostelium cells? | nested; control-vs-many, distribution, grouped categorical, nested raw + summary | `UNCERTAIN` |
| PFR050 | GFLB | Fig. 1 (quantitative morphology panel) | Does GflB loss or overproduction change cell roundness? | nested; control-vs-many, distribution, grouped categorical, nested raw + summary | `UNCERTAIN` |
| PFR051 | GFLB | Fig. 1 (quantitative morphology panel) | Does GflB loss increase cell polarization compared with parental and GflB-overproducing cells? | nested; control-vs-many, distribution, grouped categorical, nested raw + summary | `UNCERTAIN` |
| PFR052 | GFLB | Fig. 1 (cell-migration panel) | How does GflB expression state affect random cell-migration speed? | nested; control-vs-many, distribution, grouped categorical, nested raw + summary | `UNCERTAIN` |
| PFR053 | GFLB | Fig. 2 | Does GflB loss or overproduction alter the number of macropinocytic crowns present per cell? | nested; control-vs-many, distribution, grouped categorical, nested raw + summary | `INFERRED_HIGH_CONFIDENCE` |
| PFR054 | GFLB | Fig. 2 | Does GflB loss prolong macropinocytic crown lifetime? | nested; control-vs-many, distribution, grouped categorical, nested raw + summary | `INFERRED_HIGH_CONFIDENCE` |
| PFR055 | GFLB | Fig. 2 | Does GflB expression state alter the rate of new crown formation? | nested; control-vs-many, distribution, grouped categorical, nested raw + summary | `INFERRED_HIGH_CONFIDENCE` |
| PFR056 | GFLB | Fig. 2 | Does GflB loss specifically reduce successful crown retraction/completion? | proportion; control-vs-many, grouped categorical | `INFERRED_HIGH_CONFIDENCE` |
| PFR057 | GFLB | Fig. 3A | Does GflB loss reduce fluid-phase macropinocytic uptake over time? | cross_time; continuous time, descriptive-only, independent visual series, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR058 | GFLB | Fig. 3B | Does GflB loss reduce phagocytic uptake of TRITC-labeled yeast particles over time? | cross_time; continuous time, descriptive-only, independent visual series, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR059 | GFLB | Fig. 3G,H | Does GflB loss shift actin into the detergent-insoluble cytoskeletal fraction? | biochem; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR060 | GFLB | Fig. S2 | Does GflB loss or overproduction increase cytokinesis failure at abscission? | proportion; control-vs-many, descriptive-only, grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR061 | KER5 | Fig. 1A | Does mitotic entry increase Triton-X-100 solubility of the K5/K14 intermediate-filament pair? | biochem; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR062 | KER5 | Fig. 1B,C | How do CDK1, Aurora-B, and Rho-kinase phosphorylate K5 and K14 over a two-hour in-vitro reaction? | cross_time; continuous time, descriptive-only, independent visual series, irregular X | `CONFIRMED_FROM_PAPER` |
| PFR063 | KER5 | Fig. 1D | Do K5 Thr23 and Thr144 mutations reduce CDK1-mediated phosphorylation? | continuous; control-vs-many, grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR064 | KER5 | Fig. 1E | Does the K5 S30A mutation reduce Aurora-B-mediated phosphorylation? | continuous; control-vs-many, grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR065 | KER5 | Fig. 1F | Does the K5 T159A mutation reduce Rho-kinase-mediated phosphorylation? | continuous; control-vs-many, grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR066 | KER5 | Fig. 2A,B | What is the temporal relationship between K5-Thr23/K5-Ser30 phosphorylation and mitotic-phase composition after release from G2/M arrest? | cross_time; continuous time, descriptive-only, independent visual series, multiple series | `CONFIRMED_FROM_PAPER` |
| PFR067 | KER5 | Fig. 2D | Do combined non-phosphorylatable K5 mutations increase the frequency of post-mitotic K5/K14 IF bridges? | proportion; control-vs-many, grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR068 | KER5 | Fig. S2B | How does the frequency of K5-Thr23-positive mitotic basal cells change across murine developmental stages? | proportion; grouped categorical | `CONFIRMED_FROM_PAPER` |
| PFR069 | CRYO | Fig. 1F | How does cell area change during and after PA-Rac1 photoactivation on an EM grid before vitrification? | longitudinal; continuous time, descriptive-only | `CONFIRMED_FROM_PAPER` |

## Interpretation guardrails

- Visual proximity or a shared series color never establishes pairing. Pairing/repeated identity comes only from the experiment-design metadata.
- `biologicalN` is retained together with its definition; nested cells, cilia, events, lanes, and technical observations are not silently promoted to biological n.
- Published statistical-method text is recorded separately from any future app recommendation. An uncertain paper method remains `UNCERTAIN`.
- Exact published color/legend semantics are not generally encoded in the existing benchmark metadata and therefore remain `UNCERTAIN` unless later checked panel-by-panel.
- The four GFLB morphology entries PFR049–PFR052 have exact-Figure but uncertain-subpanel provenance; they are useful for capability exploration but should not be Gold panel-level regression cases yet.
- PFR002, PFR004, PFR025, PFR046, PFR049, and PFR069 retain the separately approved Round-2 brief as the human-reviewed interpretation layer; this catalog does not overwrite it.

## Recommended first candidate subset

A compact feature-scoped set that extends beyond the existing six without generating new data yet:

- grouped/independent time series: PFR001, PFR007, PFR012, PFR057;
- rescue and auxiliary-reference pressure: PFR002, PFR008, PFR015, PFR016;
- nested raw plus biological-unit summary: PFR005, PFR011, PFR018, PFR021, PFR054;
- longitudinal and irregular numeric X: PFR025, PFR030, PFR035, PFR045, PFR069;
- within-cell paired series: PFR046 and PFR047;
- descriptive-only: PFR009, PFR010, PFR025, PFR034, PFR035, PFR045, PFR048, PFR057, PFR058, PFR060, PFR062, PFR066, PFR069;
- multiple linked readouts: PFR009 and PFR010;
- supplementary-figure coverage: PFR060 and PFR068.

Before any candidate becomes a Gold Graph regression case, re-check its legend and Methods in the primary article and resolve every `UNCERTAIN` field relevant to the asserted capability.

## Machine-readable companion

`docs/alpha/nightly/PERSONAL_PUBLISHED_FIGURE_INTENT_CATALOG_2026-08-25.json` contains all 69 entries with factors/levels, contrasts, unit identity, nesting/pairing, graph semantics, confidence by field, provenance, and candidate capability tags.
