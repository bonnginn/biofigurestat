# Next Personal Validation — Human Review Packet

Date: 2026-08-25  
Purpose: choose approximately 10 panels and correct their Figure specifications before any generation  
Decision shorthand: `USE`, `RESERVE`, or `DROP`, followed by corrections to contrast/unit/inference/graph

Panel links and local-image availability are recorded in `benchmark/personal_figure_v1/planning/NEXT_PERSONAL_VALIDATION_PANEL_MANIFEST_2026-08-25.json`.

## Candidate PFR009 / NDEL1 Fig. 5B

- Why selected: Western-blot densitometry as a normalized single-series time course, absent from the accepted six.
- Scientific message: Ndel1/GAPDH abundance changes over the serum-starvation trajectory.
- Design: independent WB experiments sampled across 0, 4, 8, 16, 24, and 48 h; catalog does not establish repeated lanes from one biological preparation.
- Primary contrast: trajectory relative to 0 h; no automatic all-pairs family.
- Statistical unit: independent WB experiment (`n≈3`); band and lane measurements produce the ratio and are not additional n.
- Inference: proposed **descriptive only** unless the user confirms a prespecified time contrast and matching across time.
- Graph: mean ± SEM line with one point per time; optional faint experiment points/traces only if identity is genuine.
- X / series / Y: X=time (h); one Ndel1 series; Y=Ndel1/GAPDH ratio; 0 h is reference.
- Sample size: catalog reconstruction 3 experiments and 6 time levels; 54 synthetic rows include lower-level band structure.
- Stress points: WB normalization provenance, ordered time, reference level, no unsupported p-values.
- Confidence: `CONFIRMED_FROM_PAPER`; ratio construction `CONFIRMED_FROM_METHODS`; inference proposal `UNCERTAIN_NEEDS_USER`.
- User check: Were the same biological preparations followed across time, and should any inferential contrast be shown?

## Candidate PFR011 / NDEL1 Fig. 5D

- Why selected: six-level microscopy intensity distribution with cells nested in experiments.
- Scientific message: centrosomal Ndel1 intensity changes during serum starvation.
- Design: cross-sectional cells nested in independent imaging sessions; not repeated cells.
- Primary contrast: each prespecified post-starvation time versus 0 h, if inference is required.
- Statistical unit: independent imaging experiment (`n≈3`); cells are lower-level observations.
- Inference: session-level control-versus-many or a hierarchical model; never cell-level unpaired tests.
- Graph: violin/box plus raw cells and visually distinct session summaries; compact six-level ordered X.
- X / series / Y: X=0–48 h; one intensity readout; Y=relative centrosomal Ndel1 intensity; 0 h reference.
- Sample size: 356 synthetic cell rows across 3 sessions and 6 levels, used only as a scale estimate.
- Stress points: nested raw + summary, dense distribution, selected comparisons, time as ordered categorical.
- Confidence: panel/design `CONFIRMED_FROM_PAPER`; nesting `INFERRED_HIGH_CONFIDENCE`; published test `UNCERTAIN_NEEDS_USER`.
- User check: Confirm session count and whether the intended display is box, violin, or raw dots with session summaries.

## Candidate PFR020 / NDEL1 Fig. 9F

- Why selected: animal-level proportions crossed with three renal categories.
- Scientific message: Ndel1 hypomorphism changes ciliation within specific newborn kidney compartments.
- Design: independent mice; genotype crossed with proximal tubule, distal tubule, and collecting duct categories.
- Primary contrast: WT versus cko separately within each renal category.
- Statistical unit: mouse (`n≈6`); counted cells/cilia provide numerator and denominator, not n.
- Inference: three prespecified genotype contrasts with familywise adjustment, or a genotype × category model if interaction is central.
- Graph: grouped mouse-level dots with mean ± uncertainty; facet by renal category is an acceptable alternative.
- X / series / Y: X=renal category; series=genotype; Y=ciliated fraction; WT is reference.
- Sample size: catalog indicates 6 mice and 36 synthetic mouse-category rows.
- Stress points: numerator/denominator integrity, hierarchical labels, grouped series, facets, selected comparisons.
- Confidence: panel/question `CONFIRMED_FROM_PAPER`; unit `CONFIRMED_FROM_METHODS`; exact published test `UNCERTAIN_NEEDS_USER`.
- User check: Is category-specific inference primary, or is the genotype × category interaction the main claim?

## Candidate PFR021 / NDEL1 Fig. 9G — Reserve

- Why selected: high-value cilium-within-mouse distribution and genotype × renal-category hierarchy.
- Scientific message: Ndel1 hypomorphism changes cilium length in particular renal compartments.
- Design: cilia nested within mice, crossed by genotype and renal category.
- Primary contrast: WT versus cko within each renal category.
- Statistical unit: **mouse**, not cilium; the catalog's `n=20` and “cilium nested in mouse” wording are internally unsafe until reconciled.
- Inference: mouse summaries or hierarchical model only after mouse identity/count is confirmed.
- Graph: raw cilia distribution plus mouse summaries, preferably faceted by renal category.
- X / series / Y: X=renal category; series=genotype; Y=cilium length (µm); WT reference.
- Sample size: 1,342 synthetic cilium rows; true mouse n is not safely recoverable from the current catalog entry.
- Stress points: three-level nesting, large raw layer, biological-n guardrail, facets.
- Confidence: panel `CONFIRMED_FROM_PAPER`; biological n `UNCERTAIN_NEEDS_USER`.
- User check: Supply/confirm mouse count and whether the same mouse contributes multiple renal categories.

## Candidate PFR027 / OPTO Fig. 2C

- Why selected: repeated cell trajectories nested within experiments with a comparator series.
- Scientific message: opto-RhoA selectively increases the RhoA biosensor after illumination versus opto-control.
- Design: longitudinal cells nested in three imaging experiments; stable cell identity across seven times.
- Primary contrast: opto-RhoA versus opto-control for a prespecified response summary or trajectory interaction.
- Statistical unit: independent imaging experiment (`n≈3`); cells are nested repeated observations.
- Inference: experiment-level response summary or mixed model; do not use every cell-time row as independent.
- Graph: mean trajectory with uncertainty plus optional faint cell or experiment traces; activation interval annotated.
- X / series / Y: X=time (s); series=opto-control/opto-RhoA; Y=relative RhoA biosensor intensity.
- Sample size: 84 synthetic rows representing 3 experiments, nested cells, and seven times.
- Stress points: repeated identity, nesting, continuous X, activation annotation, legend semantics.
- Confidence: design/panel/method `CONFIRMED_FROM_PAPER` and `CONFIRMED_FROM_METHODS`; aggregation choice `UNCERTAIN_NEEDS_USER`.
- User check: Which response summary is primary—endpoint, peak, AUC, or condition × time interaction?

## Candidate PFR033 / OPTO Fig. 3A

- Why selected: seven-arm responder screen with one negative control and retained counts.
- Scientific message: among tested small GTPases, RhoA is the principal inducer of Ca²⁺ transients in RPE1.
- Design: independent imaging experiments; responder numerator/denominator within each optogenetic construct.
- Primary contrast: each biologically relevant opto-GTPase versus opto-control; no all-pairs default.
- Statistical unit: independent imaging experiment (`n≈4`); cells/events are counted outcomes.
- Inference: proposed control-versus-many on experiment-level proportions; descriptive-only remains acceptable if this was a screen.
- Graph: outlined bars or dot summaries with one point per experiment; mean ± SD as reported.
- X / series / Y: X=opto-GTPase construct; one categorical series; Y=responder fraction; opto-control reference.
- Sample size: 4 experiments × 7 conditions in the reconstruction.
- Stress points: control-vs-many, long labels, numerator/denominator, sparse annotations.
- Confidence: panel/design `CONFIRMED_FROM_PAPER`; paper inference was not stated, so `UNCERTAIN_NEEDS_USER`.
- User check: Should this remain descriptive, and which constructs warrant displayed comparisons?

## Candidate PFR035 / OPTO Fig. 3D — Reserve

- Why selected: four simultaneous cell-type trajectories and dense legend semantics.
- Scientific message: responding cell types show different Ca²⁺ transient shapes/peak timing after opto-RhoA.
- Design: responding cells followed longitudinally and nested in imaging experiments.
- Primary contrast: descriptive trajectory/peak timing; not responder frequency and not automatic cell-type all-pairs.
- Statistical unit: independent imaging experiment (`n≈3`) if inference is added; cells are nested.
- Inference: proposed **descriptive only** unless a prespecified peak/AUC contrast is confirmed.
- Graph: four colored mean ± SD trajectories or small multiples when overlap obscures shapes.
- X / series / Y: X=time (s); series/facet=cell type; Y=normalized R-GECO1 (%).
- Sample size: 384 synthetic responding-cell time rows across four cell types.
- Stress points: multi-series legend, responder-only subset disclosure, ribbon overlap, small multiples.
- Confidence: panel/design `CONFIRMED_FROM_PAPER`; population interpretation `UNCERTAIN_NEEDS_USER`.
- User check: Confirm that the message is conditional on responding cells and choose overlay versus facets.

## Candidate PFR043 / OPTO Fig. 5E

- Why selected: mechanistic rescue with WT, negative control, and multiple domain mutants.
- Scientific message: specific PLCε domains/catalytic activities are required to restore the Ca²⁺ response after depletion.
- Design: independent imaging experiments with six rescue constructs and responder counts.
- Primary contrast: each mutant versus PLCε WT; ECFP versus WT establishes rescue context. Do not compare every mutant with every other mutant.
- Statistical unit: independent imaging experiment (`n≈3`); responder cells are counted outcomes.
- Inference: one-way family with prespecified WT-reference contrasts and multiplicity control.
- Graph: construct-level experiment dots with mean ± SD; group WT and mutants hierarchically.
- X / series / Y: X=rescue construct/domain; Y=Ca²⁺ responder fraction; PLCε WT is functional reference and ECFP is negative reference.
- Sample size: 18 synthetic experiment-condition rows.
- Stress points: rescue semantics, two reference roles, selected comparisons, long construct labels.
- Confidence: panel/method `CONFIRMED_FROM_PAPER` and `CONFIRMED_FROM_METHODS`; exact displayed comparison subset needs user confirmation.
- User check: Confirm whether ECFP-vs-WT plus every mutant-vs-WT is the complete comparison family.

## Candidate PFR045 / OPTO Fig. 6F

- Why selected: three repeated fluorescence trajectories with different probe/control meanings.
- Scientific message: opto-5-ptase and opto-RhoA change cytosolic PLCδ-PH fluorescence relative to a fluorescent-protein control.
- Design: repeated measurements within cells/experiments at six times, including an irregular final interval.
- Primary contrast: trajectory or endpoint change of each active construct versus its matched control.
- Statistical unit: independent cell/imaging experiment (`n≈6`); repeated times are not independent n.
- Inference: descriptive trajectory by default; paired response summary if a specific endpoint/AUC was planned.
- Graph: three mean ± SD lines with measured-point-only ribbons and activation interval.
- X / series / Y: X=time (s); series=opto-5-ptase+probe, opto-RhoA+probe, opto-RhoA+mCherry; Y=relative cytosolic fluorescence.
- Sample size: 108 synthetic repeated rows.
- Stress points: irregular continuous X, repeated identity, legend wording, ribbons, control-role clarity.
- Confidence: panel/design `CONFIRMED_FROM_PAPER`; inferential endpoint `UNCERTAIN_NEEDS_USER`.
- User check: Is the 300 s endpoint primary, or is the entire trajectory descriptive?

## Candidate PFR047 / OPTO Fig. 7E,F — Reserve

- Why selected: paired dark/light response under three inhibitors, followed by between-treatment change comparison.
- Scientific message: cyclosporin A and BAPTA-AM suppress opto-RhoA-driven NFAT translocation.
- Design: paired measurements within cells, cells nested in three experiments, three independent treatment groups.
- Primary contrast: Dark versus Lit within each treatment and treatment differences in cell- or experiment-level change.
- Statistical unit: independent experiment (`n≈3`) for treatment inference; cells remain paired nested observations.
- Inference: experiment-aware paired/change analysis with prespecified DMSO-reference treatment contrasts.
- Graph: paired raw cell layer plus experiment summaries, or change-score dots; avoid connecting unrelated cells.
- X / series / Y: X=treatment; series=Dark/Lit; Y=NFAT nuclear/cytosol ratio; DMSO reference.
- Sample size: 360 synthetic cell-time rows.
- Stress points: pairing plus nesting, paired visual series, two-stage comparisons, annotation hierarchy.
- Confidence: panel/test `CONFIRMED_FROM_PAPER` and `CONFIRMED_FROM_METHODS`.
- User check: This overlaps PFR046; keep only if inhibitor-reference comparisons add sufficient value.

## Candidate PFR054 / GFLB Fig. 2

- Why selected: event lifetime nested within cell and movie, a deeper hierarchy than the accepted morphology case.
- Scientific message: GflB loss prolongs macropinocytic crown lifetime and overproduction may restore/alter it.
- Design: crown events nested in cells and movies across three imaging sessions.
- Primary contrast: gflB knockout versus AX2; overproducer versus AX2 is secondary.
- Statistical unit: independent movie/session (`n≈3`); crowns and cells are lower-level observations.
- Inference: session summaries or hierarchical model with two AX2-reference contrasts.
- Graph: unfilled violin/box with raw crown events and distinct movie/session summaries.
- X / series / Y: X=genotype; Y=crown lifetime (s); AX2 reference.
- Sample size: 109 synthetic crown-event rows; true published event/session allocation needs checking.
- Stress points: event→cell→movie nesting, skewed duration, raw + summary, selected contrasts.
- Confidence: figure/question `CONFIRMED_FROM_PAPER`; exact subpanel and published test `UNCERTAIN_NEEDS_USER`.
- User check: Confirm exact panel, session count, whether events from one cell can repeat, and preferred summary statistic.

## Candidate PFR059 / GFLB Fig. 3G,H

- Why selected: crossed biochemical fractionation with fractions that sum to a total.
- Scientific message: GflB loss redistributes actin toward the detergent-insoluble cytoskeletal fraction.
- Design: independent fractionation experiments; soluble and insoluble measurements arise from the same experiment/sample.
- Primary contrast: knockout versus AX2 within each fraction; the insoluble fraction is likely primary.
- Statistical unit: independent fractionation experiment (`n≈3`); paired fractions share an experiment.
- Inference: paired/factorial experiment-aware analysis, not four unrelated groups.
- Graph: grouped dots/bars, genotype on X and fraction as adjacent series; paired fractions may use separate facet if clearer.
- X / series / Y: X=genotype; series=soluble/insoluble; Y=actin fraction of total; AX2 reference.
- Sample size: 12 synthetic experiment-fraction rows.
- Stress points: crossed factors, within-sample dependence, compositional values, grouped labels, selected comparisons.
- Confidence: panel/method `CONFIRMED_FROM_PAPER` and `CONFIRMED_FROM_METHODS`; pairing of fractions `INFERRED_HIGH_CONFIDENCE`.
- User check: Is insoluble fraction the sole inferential target, and should soluble/insoluble be shown as complementary values?

## Candidate PFR061 / KER5 Fig. 1A — Reserve

- Why selected: compact phase × keratin biochemical display with two related targets.
- Scientific message: early mitosis increases the soluble fractions of K5 and K14.
- Design: independent fractionation experiments, with K5 and K14 measured within experiment/sample.
- Primary contrast: early mitosis versus interphase separately for K5 and K14.
- Statistical unit: independent biochemical experiment (`n≈3`); target bands are linked readouts.
- Inference: two prespecified phase contrasts with multiplicity handling; preserve within-experiment target identity.
- Graph: grouped experiment dots/bars; X=keratin and series=phase, or facet by keratin.
- X / series / Y: X=K5/K14; series=interphase/early mitosis; Y=soluble fraction of total.
- Sample size: 12 synthetic experiment-target-phase rows.
- Stress points: linked targets, grouped series, within-experiment dependence, selected comparisons.
- Confidence: panel `CONFIRMED_FROM_PAPER`; published test `UNCERTAIN_NEEDS_USER`.
- User check: Confirm whether K5/K14 are separate readouts from the same experiment and whether PFR059 already covers enough fractionation grammar.

## Candidate PFR062 / KER5 Fig. 1B,C

- Why selected: six biochemical kinetic series crossing three kinases with two substrates.
- Scientific message: kinase/substrate combinations have distinct phosphorylation kinetics over 120 min.
- Design: independent in-vitro kinase experiments at 0, 30, 60, and 120 min; catalog does not prove repeated aliquot identity.
- Primary contrast: descriptive kinase × substrate trajectories; inference only for a prespecified endpoint or kinetic summary.
- Statistical unit: independent kinase experiment (`n≈3`); time aliquots and substrate readings are not independent n.
- Inference: proposed **descriptive only** for the main trajectory; selected endpoint/AUC contrasts require user confirmation.
- Graph: small multiples by kinase with K5/K14 series, or a carefully labeled six-series overlay.
- X / series / Y: X=time (min); series=substrate within kinase; facet=kinase; Y=mol phosphate/mol keratin.
- Sample size: 72 synthetic experiment-series-time rows.
- Stress points: three-factor hierarchy, legend/facet semantics, continuous axis, series density.
- Confidence: panel/design `CONFIRMED_FROM_PAPER`; paper describes the kinetics, while inferential intent `UNCERTAIN_NEEDS_USER`.
- User check: Choose small multiples versus six-line overlay and confirm whether any endpoint statistics belong on this panel.

## Candidate PFR066 / KER5 Fig. 2A,B — Reserve

- Why selected: phospho-signals and mitotic-phase fractions share time but not measurement meaning or scale.
- Scientific message: K5 phosphorylation peaks align temporally with specific mitotic-phase composition after release.
- Design: independent synchronized-cell experiments sampled from 0 to 2 h; multiple linked readouts per experiment/time.
- Primary contrast: descriptive temporal alignment; do not treat four traces as exchangeable groups.
- Statistical unit: independent synchronization experiment (`n≈3`); linked readouts must retain experiment identity.
- Inference: proposed **descriptive only** unless a formal association/lag hypothesis is supplied.
- Graph: facets/small multiples separating phospho-signal and phase fraction, aligned on one time axis; avoid misleading dual Y axes.
- X / series / Y: X=time after release; series within facets=pK5-Thr23/pK5-Ser30 and prometaphase–metaphase/anaphase–telophase fractions.
- Sample size: 60 synthetic linked-readout rows.
- Stress points: multiple readouts, synchronized facets, incompatible Y semantics, provenance links.
- Confidence: panel/question `CONFIRMED_FROM_PAPER`; normalization, facet arrangement, and exact readout linkage `UNCERTAIN_NEEDS_USER`.
- User check: Confirm normalization of each phospho-signal and whether phase fractions are context-only or require quantitative comparison.

## Proposed selection

- Recommended: PFR009, PFR011, PFR020, PFR027, PFR033, PFR043, PFR045, PFR054, PFR059, PFR062.
- Reserve: PFR021, PFR035, PFR047, PFR061, PFR066.
- Suggested reply format: `USE: ... / RESERVE: ... / DROP: ...`, followed only by corrections such as `PFR009 descriptive`, `PFR020 interaction primary`, or `PFR054 movie n=...`.

No synthetic reconstruction or graph generation should begin until this packet is reviewed.
