# Alpha Release Checklist

Updated: 2026-08-29

Current phase: Public Alpha artifact packaging and publication

Current engineering verdict: `ALPHA READY — REBUILD RELEASE ARTIFACTS FROM FINAL METADATA COMMIT`

## Status legend

- `[x] COMPLETE` — implementation and relevant recorded evidence exist.
- `[ ] BEFORE ALPHA` — must be completed or explicitly dispositioned before public Alpha.
- `[-] POST-ALPHA` — useful, but not required for the bounded Alpha claim.

This checklist does not itself authorize release. Public Alpha requires all `BEFORE ALPHA` items to be closed and no unresolved P0/P1 scientific-safety defect.

Current engineering evidence and the reduced human gate are summarized in
`ALPHA_CANDIDATE_READINESS_2026-08-29.md`.

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
- [x] COMPLETE — every known project-state schema version is represented in a migration fixture matrix; newer/unsupported/invalid/wrong-kind files use typed compatibility errors and do not expose parser output in the normal UI.
- [x] COMPLETE — raw, design, analysis, Graph and Methods round-trip regressions pass, including D17 lineage.
- [x] COMPLETE — SVG and displayed-data export paths are implemented; browser preview does not pretend to perform native save/analysis.
- [ ] BEFORE ALPHA — macOS clean-machine create/save/quit/reopen/export/recovery smoke passes on a real `.lsa` file.
- [ ] BEFORE ALPHA — Windows clean-machine create/save/quit/reopen/export/recovery smoke passes on a real `.lsa` file.
- [ ] BEFORE ALPHA — `.lsa` file association and migration from the oldest supported fixture are verified in packaged builds.
- [x] COMPLETE — native PNG clipboard paths are implemented for macOS and Windows; target-application paste compatibility remains part of clean-machine smoke.
- [x] COMPLETE — saved `.lsa` projects can be retained as disk-backed tabs in one window; tab selection and active-tab close reuse the shared Save / Discard / Cancel guard.
- [ ] BEFORE ALPHA — packaged tab switching, failed-open recovery, active/inactive close, and non-ASCII project paths are manually verified on macOS and Windows.
- [x] COMPLETE — native `.xls`, `.xlsx`, `.xlsm`, and `.xlsb` import uses the bounded Rust worksheet adapter, preserves internal blanks, exposes sheet choice, and never executes formula code.
- [ ] BEFORE ALPHA — representative real Excel workbooks (multiple sheets, dates, formulas, blanks, non-ASCII labels) are imported in packaged macOS and Windows builds and checked against the source workbook.

## Provenance / Methods

- [x] COMPLETE — raw revisions, transformations, design decisions, executed request/result, corrections, warnings and Graph linkage persist.
- [x] COMPLETE — deterministic Methods text includes the executed method/model and engine lineage.
- [x] COMPLETE — appearance changes do not mutate or recompute statistics.
- [ ] BEFORE ALPHA — reopened packaged projects show the same Methods/provenance and mark incompatible upstream changes stale.
- [-] POST-ALPHA — extract UI-local Methods composition into a dedicated package only through an architectural decision.

## Privacy / security

- [x] COMPLETE — standard research data and deterministic statistics remain local; no product-usage event is recorded or queued before explicit first-run consent.
- [x] COMPLETE — first-run Yes/No, later on/off control, exact event allowlist, bounded queue, opt-out purge, HTTPS-only transport, failure isolation, and a research-data-free local copy are implemented and tested. The allowlist excludes raw or derived measurements, experiment titles, researcher-entered labels/notes/project or sample identifiers, file paths, free text, clipboard/file content, content hashes, and error payloads. It does include disclosed random app/session IDs, timestamps, application/build and OS-family metadata, typed workflow categories, bounded counts, and fixed error codes; this is not presented as complete anonymity.
- [x] COMPLETE — diagnostic export excludes raw values, labels, notes, paths and secrets by default.
- [x] COMPLETE — evaluation mode is development-gated; production CSP and restricted Tauri permissions exist.
- [x] COMPLETE — the 2026-08-29 production Web bundle passed the evaluation/Gold/tunnel/source-map/secret forbidden-string scan before Windows packaging.
- [ ] BEFORE ALPHA — CSP, file-dialog scope, sidecar invocation and diagnostic export are smoke-tested on both platforms.
- [x] COMPLETE — the Alpha collector implementation uses Cloudflare Workers/D1, exact-schema validation, size/rate limits, deduplication, 90-day deletion, and no source-IP database field. The client uses a fresh `remote-*` notice and discards earlier local-only queues.
- [x] COMPLETE — release preflight rejects placeholder D1 configuration, unsafe endpoint/key/contact values and wildcard/incomplete CORS, then generates an exact-origin Tauri CSP overlay without embedding the key or contact.
- [x] COMPLETE — Cloudflare account ownership, APAC deployment, exact endpoint/public ingestion key and privacy/deletion contact are configured; D1 migrations and the Worker are deployed. Deployment smoke verified health `200`, unapproved-origin `403`, synthetic accepted upload `202`, allowlisted D1 persistence and 90-day expiry; the Windows candidate uses the exact endpoint CSP and native origins remain exact in CORS.
- [ ] BEFORE ALPHA — verify the packaged macOS/Windows opt-in upload, offline retry, opt-out purge and scheduled deletion operation before public distribution.
- [x] COMPLETE — the Public Alpha report form requires a full outbound preview and per-report send, has bounded exact fields, excludes files/screenshots/project content, attaches a smaller closed diagnostic schema only when selected, isolates failures, and returns an opaque report ID. Its separate Worker endpoint/D1 tables enforce 16 KiB input, exact native CORS, rate limits, idempotency, deduplication, encrypted optional reply contact, append-only status history, and 90-day expiry.
- [x] COMPLETE — the report Worker migration and endpoint are deployed. Synthetic smoke verified `201`, APAC/NRT persistence, AES-GCM contact ciphertext with no plaintext match, and exact synthetic-row cleanup. Admin routes fail closed because Cloudflare Access team/audience configuration is not yet present.
- [ ] BEFORE ALPHA — configure Cloudflare Access for the admin hostname/path, add an Access service token for read-only daily triage, verify all seven status transitions and explicit contact reveal, and name the human owner for replies and fix approval.
- [ ] BEFORE ALPHA — verify explicit report preview, successful report ID, offline failure isolation, and optional diagnostic attachment in packaged macOS and Windows builds.
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
- [x] COMPLETE — local analysis has a 120-second hard timeout and request-scoped user cancellation; successful numerical-library reliability warnings are retained in Results.
- [x] COMPLETE — browser-only attempts to run local analysis fail explicitly instead of displaying invented output.
- [ ] BEFORE ALPHA — packaged sidecar missing/crash/version-mismatch, unwritable target, corrupt project and recovery messages are exercised.
- [ ] BEFORE ALPHA — diagnostic JSON can be copied/saved on macOS and Windows and contains no research data by default.

## Documentation

- [x] COMPLETE — canonical handoff, Graph Capability Audit, Web UX closure, privacy, quick start and known limitations exist.
- [x] COMPLETE — obsolete “expanded benchmark pending” statements in active release-facing documents are removed.
- [x] COMPLETE — competitor scope matrix and manual Web UX review form are available.
- [x] COMPLETE — BioFigureStat 0.1.0, MIT License, public repository URL, privacy/support route and Public Alpha release notes are approved.
- [ ] BEFORE ALPHA — Quick Start and Known Limitations are checked against the exact packaged UI.
- [ ] BEFORE ALPHA — missing named master product/UX specifications are restored or formally superseded by a versioned canonical replacement.
- [-] POST-ALPHA — historical reports receive consistent superseded banners and duplicate ADR numbering gets an alias/index.

## Packaging

- [x] COMPLETE — production Web build and automated Web forbidden-string scan exist.
- [x] COMPLETE — macOS ARM64 app/engine resource mapping and verifier exist.
- [x] COMPLETE — Windows icon/version/file-association base configuration exists.
- [x] COMPLETE — product identity and icon are BioFigureStat across the Web shell and native artifacts; the existing bundle identifier and `.lsa` format remain stable for compatibility (ADR 0054).
- [ ] BEFORE ALPHA — final version/build revision is injected and the BioFigureStat name/icon are checked in installed Windows and macOS artifacts.
- [ ] BEFORE ALPHA — macOS signing identity, notarization/stapling and DMG or approved delivery method pass.
- [x] COMPLETE — Windows bundle override, x64 engine resource mapping, release compile and NSIS generation pass; the 2026-08-30 BioFigureStat installer checksum is recorded in `CURRENT_STATE.md`.
- [ ] BEFORE ALPHA — packaged artifact scan passes and installation/uninstallation behavior is documented.
- [-] POST-ALPHA — Store distribution and automatic updater are out of the current Alpha scope.

## macOS / Windows native smoke

- [-] POST-ALPHA IN PROGRESS — exact Windows executable automation covers native IPC/export and dirty Close / Cancel / Discard with screenshot/JSON evidence; clean-runner CDP stability and the macOS adapter remain open (`NATIVE_UI_REGRESSION_HARNESS.md`).

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
