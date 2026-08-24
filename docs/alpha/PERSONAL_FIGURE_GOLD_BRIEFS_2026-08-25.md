# Personal Published-Paper Figure Validation — Approved Gold Briefs

Date: 2026-08-25
Status: approved for Round 2 reconstruction
Scope: PFR002, PFR004, PFR025, PFR046, PFR049, PFR069

This document is the sole scientific brief for Round 2. Round 1 artifacts and reviewer input remain historical evidence and must not be overwritten. The synthetic values are for workflow validation; they do not reproduce published measurements or p-values.

## PFR002 — Ndel1/NDE1 rescue (Fig. 1F)

- Question: in each inducible rescue cell line, does Dox rescue the ciliation phenotype under siNdel1?
- Cell lines: Ndel1-Myc and NDE1-Myc.
- Primary comparisons: Dox− versus Dox+ under siNdel1, separately for each cell line.
- Baseline versus knockdown is out of scope because it was established in another experiment. Baseline versus rescue may be shown only as an auxiliary reference.
- Experimental unit: independent experiment, n=3 per condition; retain ciliated-cell numerator and counted-cell denominator (>100 cells per experiment).
- Graph: bar plus one point per independent experiment; mean ± SEM.
- Paper method: two-tailed unpaired Student's t-test.
- Round 2 method: one-way ANOVA with the two pre-specified Dox contrasts and Holm adjustment. Reason for change: the two requested Dox− versus Dox+ contrasts are handled as one pre-specified comparison family while excluding cell-line-crossing and baseline-versus-knockdown comparisons. The result is not a flattened all-pairs analysis.

## PFR004 — serum-starvation ciliation (Fig. 2A)

- Conditions: si control, siNdel1 #1, siNdel1 #2, siNDE1 #1, siNDE1 #2.
- Time points: 0 h and 24 h. These are fixed-cell cross-sections from separate dishes, never repeated measurements.
- Experimental unit: independent experiment/dish, n=3 per condition and time; retain numerator and denominator (>100 counted cells).
- Graph: grouped bars plus independent-experiment points; mean ± SEM.
- Statistics: at each time point, compare each knockdown with si control. Run the 0 h family but do not draw n.s. labels; show significant 24 h control comparisons.
- Round 2 method: Dunnett control-versus-many within each time point. Reason for change: the intended family contains four comparisons to one control, so Dunnett matches the scientific question and controls multiplicity more directly than all-pairs tests or a condition × time model.

## PFR025 — optogenetic RhoA fluorescence trace (Fig. 1D, top)

- Display one representative cell only.
- Overlay the activated ROI and non-activated control ROI from that same cell.
- Time axis: seconds; activation window 300–600 s.
- Graph: two trajectories, with axes tightened to the observed response and a normalized-fluorescence reference at 1.0.
- Statistics: none. The panel is descriptive and a one-cell trace cannot support inferential testing.

## PFR046 — dark/Lit nuclear translocation (Fig. 7C,D)

- Groups: si control, siPLCε sequence 1, siPLCε sequence 3.
- Within each cell, dark and Lit are paired. Cells remain nested within three independent experiments.
- Published cell counts: 61, 58, and 72, respectively.
- Graph: raw points plus summary only; do not connect individual cells. Dark is open/black and Lit is light blue. Summary is mean ± SD.
- Statistics: compute a Lit/dark fold change for each cell, preserve experiment nesting, and compare the three siRNA groups with all-pairs contrasts.
- Paper method: paired t-tests for dark versus Lit and one-way ANOVA/Tukey for fold changes.
- Round 2 method: experiment-level fold-change summaries with Welch ANOVA and Games–Howell all-pairs comparisons. Reason for change: cells are lower-level observations within three experiments; aggregating before inference avoids treating every cell as an independent biological replicate. Welch/Games–Howell avoids an equal-variance assumption at this small biological n.

## PFR049 — GflB morphology (Fig. 1C)

- Readout: circularity, not projected cell area.
- Groups: AX2 (WT), gflB-KO, AX2(GFP-GflB); >70 cells per strain, nested within three imaging sessions.
- Graph: unfilled box/violin-style distribution with raw cells and clearly distinguished session summaries; do not use a solid black fill.
- Statistics: AX2 is the reference; compare each other strain with AX2.
- Paper method: unpaired t-tests.
- Round 2 method: Dunnett control-versus-many on imaging-session summaries. Reason for change: Dunnett matches the WT-reference family and controls multiplicity while retaining imaging session, rather than cell, as the biological unit.

## PFR069 — optogenetic lamellipodial area (Fig. 1F)

- Six cells, normalized cell area, −5 to 10 min, sampled every 10 s.
- Blue activation window: 0–10 min. Mark the approximate freezing time near 2 min.
- Graph: mean ± SD only, with horizontal and vertical limits tightened around the response.
- Statistics: none. This is a single-cohort descriptive trajectory with no comparator or pre-specified null.

## Primary sources

- NDEL1: https://rupress.org/jcb/article/212/4/409/38478/Ndel1-suppresses-ciliogenesis-in-proliferating
- OPTO: https://pmc.ncbi.nlm.nih.gov/articles/PMC7949103/
- GFLB: https://journals.biologists.com/jcs/article/130/18/3158/56373/The-F-actin-binding-RapGEF-GflB-is-required-for
- CRYO: https://pmc.ncbi.nlm.nih.gov/articles/PMC12136925/
