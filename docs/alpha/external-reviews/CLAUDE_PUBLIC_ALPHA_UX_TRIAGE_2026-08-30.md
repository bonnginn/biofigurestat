# Claude Public Alpha UX review — evidence triage (2026-08-30)

## Evidence status

This record summarizes the external browser UX report supplied by the user for build
`4dabbe5-alpha.telemetry.20260830`. It is supporting evidence, not product authority, and does not
replace earlier human or external review records.

The reviewer subsequently withdrew the only reported P1 (Backspace/Delete did not clear a wide-grid
cell). The failed deletion was caused by the review environment's synthetic key-event limitation.
When an input event was supplied, both visible views became empty correctly, and no product code was
found suppressing Backspace. Therefore this item is classified as
`REVIEW_ENVIRONMENT_LIMITATION`, not a product defect.

## Revised verdict

- New P0: none.
- New P1: none after the reviewer's correction.
- Browser UX: suitable as a Public Alpha candidate.
- Native release gate remains separate: authoritative statistics, save/reopen, native workbook
  import, OS clipboard integration, installer behavior, and telemetry delivery were outside the
  browser review environment.

## Confirmed product direction

The review provides supporting evidence for:

- experiment-first progressive disclosure;
- questions phrased as experimental facts rather than statistical terms;
- explicit biological `n`, paired identity, and nested observation semantics;
- Graph and Statistics using the same complete matched set;
- preserving entered measurements when structure answers change;
- disabled controls explaining the missing facts nearby;
- Survival and nonlinear routes sharing the normal Data / Graph / Statistics workspace;
- explicit telemetry consent and the external-LLM no-auto-send boundary.

The former wide-grid value corruption and focus-scroll findings were not reproduced. Sequential
keyboard entry, Tab navigation, rectangular paste, view switching, and Graph generation retained the
same values in the reported scenarios.

## P2 triage against current code

| Reported item                                | Current disposition                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enter does not move                          | Already covered by the shared spreadsheet navigation implementation and regression tests for condition, adaptive, canonical, nested, and delimited sheets.             |
| Significant-digit spelling is normalized     | Deferred. Numeric equality is preserved; preserving lexical formatting needs a deliberate raw-display contract rather than an isolated UI patch.                       |
| Graph-only ticks are awkward                 | Superseded by the integrated standard Graph workbench; Graph-only no longer uses the reduced preview renderer.                                                         |
| Starter heading text is inserted into        | Fixed: clicking or focusing a heading selects the full heading so normal typing replaces it.                                                                           |
| `LSA` remains in the external-LLM guide link | Fixed to `BioFigureStat`.                                                                                                                                              |
| Interview radios/title lack accessible names | Not reproduced in the standards-based accessibility tree. Existing tests locate the radios by their human labels, and the title input is wrapped by its visible label. |
| Very narrow-window label wrapping            | Deferred for normal desktop Alpha use; retain as responsive-layout backlog.                                                                                            |
| License is undecided                         | Product decision required before public distribution; no license is inferred by implementation.                                                                        |

## Release interpretation

This external review no longer blocks Alpha on a P0/P1 UX defect. It does not replace Windows and
macOS native validation, and it does not decide the distribution license.
