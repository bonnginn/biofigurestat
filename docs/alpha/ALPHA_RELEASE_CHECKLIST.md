# Alpha Release Checklist

Updated: 2026-08-25

Current phase: manual Web UX review in parallel with native-smoke preparation

Current engineering verdict: `READY FOR NATIVE SMOKE`

## Status legend

- `[x] COMPLETE` — implementation and relevant recorded evidence exist.
- `[ ] BEFORE ALPHA` — must be completed or explicitly dispositioned before public Alpha.
- `[-] POST-ALPHA` — useful, but not required for the bounded Alpha claim.

This checklist does not itself authorize release. Public Alpha requires all `BEFORE ALPHA` items to be closed and no unresolved P0/P1 scientific-safety defect.

## Scientific safety

- [x] COMPLETE — expanded benchmark Rounds 1–3 and unseen Pool C validation completed; Pool D remains sealed.
- [x] COMPLETE — linked multi-readout, biological-unit/readout/provenance identity and safe rejection paths verified.
- [x] COMPLETE — unsupported or ambiguous designs refuse instead of silently substituting a simpler analysis.
- [x] COMPLETE — 35-case context-rich Graph Capability Audit completed; display-only/unsupported inference boundaries recorded.
- [x] COMPLETE — personal published-paper Graph validation through the accepted Round 6 corrections completed.
- [ ] BEFORE ALPHA — current manual Web review finishes with no unresolved `blocker` or generic `major` scientific-intent defect.
- [ ] BEFORE ALPHA — native packaged workflows preserve biological n, unit identity, pairing/repeated identity and result lineage after save/reopen.
- [-] POST-ALPHA — add crossed within-unit factor models, nested XY inference and other advanced families only through separate validated modules.

## Statistics

- [x] COMPLETE — deterministic local engine is the numerical authority; no AI/LLM calculation path.
- [x] COMPLETE — common independent, paired, multi-group, repeated, independent-factorial, correlation/regression, proportion/contingency, survival and D17 workflows have versioned contracts and regression evidence.
- [x] COMPLETE — multiplicity intent/correction and planned/control/all-pairs comparisons are explicit where supported.
- [x] COMPLETE — method choice, alternative selection, assumptions/warnings, engine/package versions and timestamps persist.
- [x] COMPLETE — D17 model, starts/bounds, parameters, uncertainty, diagnostics and fitted curves are saved authoritatively.
- [ ] BEFORE ALPHA — macOS and Windows packaged sidecars return the expected engine/package versions and reproduce representative saved results.
- [ ] BEFORE ALPHA — no unresolved P0/P1 numerical or recommendation regression remains after manual review.
- [-] POST-ALPHA — broad nonlinear model library, Cox/competing-risks, mixed-effects expansion, nested regression and high-dimensional inference.

## Graph

- [x] COMPLETE — major life-science grammar is covered across the 35 context-rich cases.
- [x] COMPLETE — X/series/facet, hierarchy, paired/repeated, raw/summary, uncertainty, WB, proportion and auxiliary/reference roles are represented generically.
- [x] COMPLETE — Graph annotations use saved authoritative analysis results and can be changed without recalculation.
- [x] COMPLETE — D17 Graph separates raw observations from the saved authoritative fitted curve.
- [x] COMPLETE — final on-screen SVG and SVG export share the authoritative rendering path.
- [ ] BEFORE ALPHA — manual review confirms no blocker/major clipping, overlap, misleading legend, axis or annotation behavior in representative workflows.
- [ ] BEFORE ALPHA — native SVG/PNG/clipboard export is visually checked on macOS and Windows.
- [-] POST-ALPHA — preview/final renderer convergence, resizable/detachable inspector, reusable style presets and direct legend manipulation.
- [-] POST-ALPHA — Illustrator-like free drawing is an explicit non-goal.

## Web UX

- [x] COMPLETE — four-route Home and specialist routes under New Experiment.
- [x] COMPLETE — specialist-analysis switcher reduces route fragmentation.
- [x] COMPLETE — Graph and 340 px editor remain side-by-side above the bounded compact breakpoint.
- [x] COMPLETE — series styling has an explicit editor target and shortcut.
- [x] COMPLETE — recommended analysis is preselected; one scientific-identity confirmation gates execution.
- [x] COMPLETE — Statistics result hierarchy separates primary results, comparisons and reproducibility detail.
- [ ] BEFORE ALPHA — user completes the current manual review sheet and all blocker/major generic findings are closed or explicitly accepted.
- [ ] BEFORE ALPHA — 1360×900, compact desktop width, high-DPI and 200% zoom visual checks pass without loss of operation.
- [-] POST-ALPHA — drag/drop factor mapping, keyboard-first power editing and user-customizable pane layout.

## Save / open / export

- [x] COMPLETE — versioned `.lsa` project, atomic save/validated replacement, migrations, checksums and recovery contracts exist.
- [x] COMPLETE — raw, design, analysis, Graph and Methods round-trip regressions pass, including D17 lineage.
- [x] COMPLETE — SVG and displayed-data export paths are implemented; browser preview does not pretend to perform native save/analysis.
- [ ] BEFORE ALPHA — macOS clean-machine create/save/quit/reopen/export/recovery smoke passes on a real `.lsa` file.
- [ ] BEFORE ALPHA — Windows clean-machine create/save/quit/reopen/export/recovery smoke passes on a real `.lsa` file.
- [ ] BEFORE ALPHA — `.lsa` file association and migration from the oldest supported fixture are verified in packaged builds.
- [ ] BEFORE ALPHA — native PNG clipboard is implemented or explicitly documented as deferred for the Alpha package.

## Provenance / Methods

- [x] COMPLETE — raw revisions, transformations, design decisions, executed request/result, corrections, warnings and Graph linkage persist.
- [x] COMPLETE — deterministic Methods text includes the executed method/model and engine lineage.
- [x] COMPLETE — appearance changes do not mutate or recompute statistics.
- [ ] BEFORE ALPHA — reopened packaged projects show the same Methods/provenance and mark incompatible upstream changes stale.
- [-] POST-ALPHA — extract UI-local Methods composition into a dedicated package only through an architectural decision.

## Privacy / security

- [x] COMPLETE — standard research data and deterministic statistics remain local; no implicit telemetry or upload.
- [x] COMPLETE — diagnostic export excludes raw values, labels, notes, paths and secrets by default.
- [x] COMPLETE — evaluation mode is development-gated; production CSP and restricted Tauri permissions exist.
- [ ] BEFORE ALPHA — packaged artifacts pass the evaluation/Gold/tunnel/source-map/secret forbidden-string scan.
- [ ] BEFORE ALPHA — CSP, file-dialog scope, sidecar invocation and diagnostic export are smoke-tested on both platforms.
- [ ] BEFORE ALPHA — product-usage telemetry is either absent/off, or ships only after approval of an explicit first-run Yes/No consent, later on/off control, event allowlist, endpoint/operator/region, retention, and deletion policy. Raw or derived measurements, experiment titles, labels, notes, identifiers, file paths, free text, content hashes, and error payloads are never telemetry fields.
- [ ] BEFORE ALPHA — external security review is completed or a named owner/risk acceptance is recorded before public distribution.
- [-] POST-ALPHA — cloud sync, collaboration and external AI Help remain out of scope unless separately approved.

## Accessibility

- [x] COMPLETE — major controls have semantic roles/labels and keyboard-addressable disclosure in automated UI tests.
- [ ] BEFORE ALPHA — explicit Alpha accessibility acceptance criteria and supported assistive-technology matrix are approved.
- [ ] BEFORE ALPHA — keyboard-only critical path: New → data → Graph → Statistics → save/open/export.
- [ ] BEFORE ALPHA — visible focus, dialog focus containment/return, form errors and status announcements are manually checked.
- [ ] BEFORE ALPHA — 200% zoom/reflow, contrast and macOS VoiceOver/Windows Narrator spot checks pass.
- [-] POST-ALPHA — comprehensive WCAG conformance claim and exhaustive assistive-technology certification.

## Diagnostics

- [x] COMPLETE — stable error taxonomy, actionable next steps, local contextual Help and privacy-reduced diagnostics exist.
- [x] COMPLETE — browser-only attempts to run local analysis fail explicitly instead of displaying invented output.
- [ ] BEFORE ALPHA — packaged sidecar missing/crash/version-mismatch, unwritable target, corrupt project and recovery messages are exercised.
- [ ] BEFORE ALPHA — diagnostic JSON can be copied/saved on macOS and Windows and contains no research data by default.

## Documentation

- [x] COMPLETE — canonical handoff, Graph Capability Audit, Web UX closure, privacy, quick start and known limitations exist.
- [x] COMPLETE — obsolete “expanded benchmark pending” statements in active release-facing documents are removed.
- [x] COMPLETE — competitor scope matrix and manual Web UX review form are available.
- [ ] BEFORE ALPHA — product name, version, license, repository/support URL and release notes are approved.
- [ ] BEFORE ALPHA — Quick Start and Known Limitations are checked against the exact packaged UI.
- [ ] BEFORE ALPHA — missing named master product/UX specifications are restored or formally superseded by a versioned canonical replacement.
- [-] POST-ALPHA — historical reports receive consistent superseded banners and duplicate ADR numbering gets an alias/index.

## Packaging

- [x] COMPLETE — production Web build and automated Web forbidden-string scan exist.
- [x] COMPLETE — macOS ARM64 app/engine resource mapping and verifier exist.
- [x] COMPLETE — Windows icon/version/file-association base configuration exists.
- [ ] BEFORE ALPHA — final product identity, icon, bundle identifier and version/build revision are injected.
- [ ] BEFORE ALPHA — macOS signing identity, notarization/stapling and DMG or approved delivery method pass.
- [ ] BEFORE ALPHA — Windows bundle override, x64 engine resource, installer and WebView2 strategy pass.
- [ ] BEFORE ALPHA — packaged artifact scan passes and installation/uninstallation behavior is documented.
- [-] POST-ALPHA — Store distribution and automatic updater are out of the current Alpha scope.

## macOS / Windows native smoke

- [ ] BEFORE ALPHA — macOS Apple Silicon: install/launch, sidecar/version, representative analysis, Graph, save/open, SVG/PNG/clipboard, diagnostics, quit/reopen.
- [ ] BEFORE ALPHA — Windows 11 x64: install/launch, sidecar/version, representative analysis, Graph, save/open, SVG/PNG/clipboard or documented deferral, diagnostics, quit/reopen.
- [ ] BEFORE ALPHA — both platforms: high-DPI/window resize, non-ASCII paths, file association, corrupt/recovery fixture and no-network operation.
- [ ] BEFORE ALPHA — native-smoke evidence records OS/build revision, artifact checksum, engine versions, failures and disposition.

## Known unsupported workflows

- [x] COMPLETE — unsupported families are listed in `KNOWN_LIMITATIONS.md` and fail safely.
- [x] COMPLETE — crossed hemisphere × time within mouse and nested XY inference are not silently replaced by ordinary ANOVA/regression.
- [x] COMPLETE — advanced nonlinear models/global fits and Cox/competing-risks are outside the bounded Alpha capability.
- [ ] BEFORE ALPHA — every unsupported action reached during manual/native review gives an actionable explanation rather than a dead end.
- [-] POST-ALPHA — prioritize unsupported families from real usage frequency and scientific value, not competitor menu breadth.

## Release decision record

- [ ] BEFORE ALPHA — all open items above have an evidence link, named owner and disposition.
- [ ] BEFORE ALPHA — final verdict is recorded as `PUBLIC ALPHA APPROVED` or `PUBLIC ALPHA BLOCKED` with reasons.
