# Claude Public Alpha UX review — evidence triage

Date: 2026-08-29

External evidence: `CLAUDE_PUBLIC_ALPHA_UX_REVIEW_2026-08-29.md`

Reviewed snapshot: `f7d3a3d-dirty-20260829` browser preview

Triage baseline: `bc8c059` plus the integrity hardening described below

This file records evidence and disposition. It does not replace ADR 0051, the
StructureContract boundary, or the deterministic Biological Interview plan.

## NEW_P0_P1_FINDINGS

### P0 — visible worksheet draft versus canonical observation

- The exact reported `101` → `97101` concatenation was not reproduced on the
  current baseline using sequential keyboard entry, Tab, view switching, or
  Graph generation.
- Inspection did identify a real integrity boundary: a matrix cell's blur
  handler committed the prior React render's draft string rather than the
  browser-visible input value. Under render lag, visible and committed values
  could therefore diverge.
- Resolution: commit the exact DOM value delivered by blur. Regression now
  covers render lag, sequential Tab entry, overwrite, decimal, rectangular
  paste, view switching, Graph propagation, and project save/rehydration.
- Invariant: a visible worksheet value must equal its canonical observation;
  no presentation-only value is allowed to reach Graph, Statistics, or save.

### P1 — wide-grid focus scroll

- This is treated as an independent navigation defect and possible interaction
  amplifier. There is no evidence that it caused numeric concatenation.
- Resolution: spreadsheet focus prevents native recentering, then uses
  `scrollIntoView({block: "nearest", inline: "nearest"})` so only an actually
  off-screen target moves the viewport.

## CONFIRMS_EXISTING_DIRECTION

- Researcher-language Biological Interview questions are preferable to asking
  researchers to translate their work into factor/identity/nesting terms.
- The live natural-language experiment summary is useful orientation evidence.
- Biological n, technical observations, paired identity, and nesting must
  propagate through input, Graph, and Statistics.
- The unsaved-change guard is a product strength.
- Surface selection remains contract-driven: simple scalar data may use a
  compact matrix; paired/repeated data an identity-aligned matrix; nested
  Cell/ROI and large raw data a raw-observation surface. The review does not
  justify removing the wide grid.
- Human wording is not frozen by one external review; the deterministic blind
  Biological Interview evaluation remains the evidence gate.

## DUPLICATES_EXISTING_FINDINGS

- A simple, low-ambiguity experiment should reach a natural table quickly.
- Input-mode labels need researcher-facing examples rather than internal format
  terminology alone.
- Native save/open and authoritative local-engine validation remain separate
  from browser preview evaluation.
- Public Alpha needs a configured feedback destination and a native human gate.

## NOT_ACTIONABLE_FROM_THIS_REVIEW

- Graph engine redesign, new statistical families, specialist architecture
  changes, and an input-architecture pivot are not supported by this review.
- `Unit 1` versus `neuron 2`, the add-factor button, alternative-method copy,
  report-form configuration, and About expand/close are P2/polish candidates,
  not P0/P1 findings from the available evidence. They require generic
  reproduction or convergence with manual evidence before product changes.
- Undo/redo is not exposed by the current adaptive worksheet, so there is no
  existing undo/redo state transition to validate for this defect. Adding it is
  a separate feature decision, not a review-driven P0 fix.

## REVIEW_ENVIRONMENT_LIMITATIONS

- The reviewed browser preview could not run the local statistical engine or
  authoritative Results and could not perform native save/open.
- Those gaps are not counted as product defects from this review. Current
  native/manual validation remains authoritative for them.

## Remaining input-surface questions

- Wide grid remains suitable for small scalar and compact paired cases only if
  its keyboard and visibility invariants continue to hold.
- Large Cell/ROI, unequal nested observations, and large raw inputs should
  continue to default to the raw-observation or all-values surface rather than
  being forced into an expanding matrix.
- Surface preference and wording remain candidates for human validation; this
  review adds evidence but does not freeze the selector or interview copy.
