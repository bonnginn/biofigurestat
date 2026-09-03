# BioFigureStat v0.1.0-alpha.3 candidate checklist

Updated: 2026-09-04 (JST)

Status: scope frozen and the broad source gate passed on `codex/alpha3-candidate-20260903`.
The reviewed product candidate is `90c83ce`; the Windows R5 artifact verified the UTF-8 engine
protocol correction with Japanese Welch TOST input. Four Darwin-arm64 reference records and the
same-final-commit Windows/macOS artifacts remain before a release candidate can be finalized.

Use this checklist only for the maintenance Alpha described in
`PUBLIC_ALPHA_UPDATE_STRATEGY_2026-09-03.md`. The historical Alpha checklist remains a record of the
earlier release and must not be silently reinterpreted as current evidence.

## Source authority

- [x] Record the clean product-source branch and commit SHA: candidate branch
      `codex/alpha3-candidate-20260903`, frozen product code `5ba1a92`, preparation base
      `2d2fc00`.
- [x] Confirm the release-build relationship: Alpha 3 Windows and macOS builds use the same final
      commit directly from `https://github.com/bonnginn/biofigurestat.git`. The older private
      development tree is not release authority, and sealed evaluation material is not copied.
- [x] Record the application version, engine version, build revision, license, and build date for
      the latest Windows validation candidate: application `0.1.0`, engine `0.15.0`, build
      `90c83ce-alpha.20260903.win-alpha3-r5`, MIT, 2026-09-03 JST.
- [ ] Confirm that Windows and macOS artifacts use the same candidate source tree.

## Automated source gate

- [x] Focused tests for every changed responsibility pass.
- [x] Project migration tests pass for Public Alpha continuous, Survival, and ordered X/Y fixtures
      (9 files / 73 tests).
- [x] Analysis-contract tests and engine unit tests pass for Welch TOST, paired TOST, and
      multi-condition Games–Howell. Cross-platform reference completeness remains a separate
      macOS artifact gate below.
- [x] UI English-residue gate passes without translating researcher-entered labels (39 files / 362
      tests).
- [x] Workspace typecheck and lint pass.
- [x] One full package/UI milestone gate passes, or every isolated failure has an explicit product,
      stale-test, or flaky disposition before a single bounded rerun.
- [x] Production UI build and release verifier pass with zero forbidden evaluation markers.

The 2026-09-03 final source gate passed the engine unit suite (75), analysis-contract suite (14
files / 55 tests), all other non-UI workspace suites (34 files / 241 tests), and the full UI suite
(211 files / 1,403 tests). TypeScript checks passed for the UI, telemetry worker, and all seven
packages; UI lint, production UI build, and the release verifier also passed. In total, the
JavaScript/TypeScript test milestone covered 259 files / 1,699 tests. Existing Windows sidecar smoke
(18) and the frozen 14-case reference suite also pass.

Complete cross-platform reference coverage intentionally stops and reports four missing
Darwin-arm64 cases: Welch TOST, paired TOST, Survival, and D17. This is an evidence gap, not a
numerical mismatch. On the reviewed Darwin-arm64 host, run
`pnpm engine:reference:append-missing:mac`, review that exactly the four expected cases were
appended and all existing cases remained unchanged, then run `pnpm engine:reference:coverage` on
both hosts. Both write modes refuse to run on another platform.

The workspace package-manager wrapper requested an interactive modules-directory reinstall in this
non-interactive checkout. No dependencies were changed. The source gate therefore invoked the
already-installed Vitest, TypeScript, ESLint, and Vite entry points directly; all product checks
listed above completed successfully.

The final input-integrity follow-up adds three focused corrections after the earlier `82ac3af`
source gate: rectangular paste retains matching lexical numeric text, simple-group condition names
cannot collide after trim/NFKC normalization, and fractional initial row counts are normalized to
the displayed integer. The two directly affected suites pass 35/35 tests; a further seven related
files pass 113/113 tests across undo/redo, save/open, five-condition entry, CSV/XLSX import,
experiment date, and experiment-session identity. UI typecheck and focused lint pass. These focused
results do not replace the single final package/full gate.

## Windows artifact gate

- [x] Build the x64 sidecar and NSIS installer from source commit `90c83ce` for R5 validation.
- [x] Bundle verifier, 18-case packaged-engine smoke, and release verifier pass.
- [ ] Exact-executable native harness passes once; do not hide or repeatedly retry the first
      failure.
- [ ] Installed `.lsa` association opens the expected executable and preserves the saved Graph.
- [x] Record artifact filename, byte size, SHA-256, architecture, and build revision.

Windows R5 validation artifact:

- File: `BioFigureStat-0.1.0-alpha.3-Windows-x64-Setup-r5.exe`
- Bytes: `48,015,788`
- SHA-256: `96A59D5CE20211B26F13ED5E8BA949EDDE867A27965A8C5180F8A18B12FD86B2`
- Architecture: `x64`
- Signature: unsigned
- Build revision: `90c83ce-alpha.20260903.win-alpha3-r5`

R5 corrected the locale-dependent process boundary that produced syntactically invalid JSON when
Japanese text was included in an equivalence rationale. The engine CLI now consumes binary stdin
and emits UTF-8 bytes on stdout. Engine unit tests include a Japanese round trip and the Rust
packaged-engine boundary includes Japanese rationale text. On the packaged Windows application,
the researcher confirmed Welch TOST completed with Vehicle n=5 and Drug A n=5, prespecified bounds
`-0.1` to `0.1`, mean difference `-0.01`, 90% CI `-0.0285955` to `0.00859548`, and TOST
`p=0.00000926559`. The conclusion was equivalence supported. This closes the reported product
failure but does not replace the final same-source artifact gate.

The earlier one permitted native harness run found the WebView2 page target but could not establish a
stable CDP connection. It stopped as `HARNESS_INFRASTRUCTURE_BLOCKED`, not a product failure, and
was not retried. Evidence is in
`.tmp/native-ui-regression/2026-09-03T11-51-45.296Z/report.json`. The installed association and
bounded human behavior checks therefore remain open.

An earlier local bundle was rejected before gate completion because the UI had been built before
the build-revision environment value was injected. It was overwritten, never staged for release,
and its digest is not release evidence. The artifact recorded above was rebuilt with the revision
present in the production UI, then passed both verifiers.

## Apple Silicon macOS artifact gate

- [ ] On Darwin arm64, append and review exactly the four missing reference cases (Welch TOST,
      paired TOST, Survival, and D17), then commit them to establish the final candidate SHA.
- [ ] Build the arm64 sidecar and `.app` from the same candidate source.
- [ ] Bundle verifier, strict codesign verification, and release verifier pass.
- [ ] Native harness passes once where Accessibility policy permits it. Otherwise record
      `HARNESS_INFRASTRUCTURE_BLOCKED` and perform only the equivalent bounded manual checks.
- [ ] Zip the already verified `.app`, test extraction, and verify the extracted signature again.
- [ ] Record artifact filename, byte size, SHA-256, architecture, signing state, and build revision.

## Representative compatibility and behavior

- [ ] Open representative `alpha.1` and `alpha.2` `.lsa` projects without conversion prompts that
      alter scientific meaning.
- [ ] Continuous project: Data, experimental-unit IDs, saved analysis, Graph, Methods, and raw
      lineage are preserved.
- [ ] Paired project: pairing direction and incomplete-pair handling are preserved.
- [ ] Survival project: event/censor status and risk table are preserved.
- [ ] Ordered X/Y project: unit, series, X, Y, and order identity are preserved.
- [ ] Graph-only project: Data, enabled tabs, saved Graph, and presentation reopen.
- [ ] Entered lexical values such as `1.00` remain visible while canonical numeric values remain
      equal to the analysis/export values.
- [ ] SVG, PNG, CSV, clipboard where supported, and collaborator-review HTML correspond to the
      visible Graph and saved analysis run.
- [ ] Japanese and English display pass the short review; researcher-entered labels stay unchanged.

## Human visual gate

- [ ] Graph-only editor density is usable at 1360×900 and common high-DPI scaling.
- [ ] Graph, Inspector, dialogs, annotations, and legends have no material clipping or overlap.
- [ ] Bar fill/outline presets, custom color, thickness, off state, and save/reopen are coherent.
- [ ] Unsaved-work Cancel retains the edit; Discard exits only after explicit selection.

## Release publication

- [ ] Final Japanese and English release notes match the exact artifacts and known limitations.
- [ ] Existing `alpha.2` assets remain unchanged.
- [ ] Upload the new Windows and macOS assets without publishing; verify remote sizes and digests.
- [ ] Obtain explicit publication approval.
- [ ] Publish as a GitHub Pre-release, then anonymously verify release, README download links,
      assets, checksums, Quick Start, and Help links.

## Final verdict

- Candidate source: broad source gate `PASS`; reviewed product candidate `90c83ce`; final artifact
  source SHA pending four reviewed Darwin-arm64 reference records
- Windows artifact: R5 automated bundle gate and Japanese Welch TOST product path `PASS`; final
  same-source rebuild, installed association, and bounded human checks pending
- macOS artifact: `TBD`
- Product failures: none detected
- Environment blocks: Windows WebView2 CDP connection; four Darwin-arm64 reference records pending
  on the macOS artifact host
- Verdict: `SOURCE + WINDOWS AUTOMATED BUNDLE GATES PASS — HUMAN AND MACOS GATES PENDING`
