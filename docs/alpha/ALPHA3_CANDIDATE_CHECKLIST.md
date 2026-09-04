# BioFigureStat v0.1.0-alpha.3 candidate checklist

Updated: 2026-09-04 (JST)

Status: the corrected Windows artifact has passed its automated bundle and native gates. Final
product source is `de71d140bae95f899c05ce8d18c516cf7a09f6e9`; the Apple Silicon artifact must be
rebuilt from that commit because the otherwise validated earlier build displayed a stale engine
version in About. Release upload and publication are not authorized.

Use this checklist only for the maintenance Alpha described in
`PUBLIC_ALPHA_UPDATE_STRATEGY_2026-09-03.md`. The historical Alpha checklist remains a record of the
earlier release and must not be silently reinterpreted as current evidence.

## Source authority

- [x] Record the clean product-source branch and commit SHA: final intended artifact source
      `de71d140bae95f899c05ce8d18c516cf7a09f6e9`; macOS harness corrections are available
      separately through `e055553210efe62c7c21e412b743fa2967ac3ae3`.
- [ ] Confirm the release-build relationship after the macOS rebuild: Alpha 3 Windows and macOS
      artifacts use the same final product commit from
      `https://github.com/bonnginn/biofigurestat.git`. The older private development tree is not
      release authority, and sealed evaluation material is not copied.
- [x] Record the application version, engine version, build revision, license, and build date for
      both candidates: application `0.1.0`, engine `0.15.0`, MIT, 2026-09-04 JST; platform build
      revisions are recorded below.
- [ ] Confirm that the corrected Windows and rebuilt macOS artifacts use product source `de71d14`.

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
- [x] Release identity preflight rejects a stale About engine version or the wrong build-revision
      environment-variable name and confirms the current source declarations are aligned.

The 2026-09-03 final source gate passed the engine unit suite (75), analysis-contract suite (14
files / 55 tests), all other non-UI workspace suites (34 files / 241 tests), and the full UI suite
(211 files / 1,403 tests). TypeScript checks passed for the UI, telemetry worker, and all seven
packages; UI lint, production UI build, and the release verifier also passed. In total, the
JavaScript/TypeScript test milestone covered 259 files / 1,699 tests. Existing Windows sidecar smoke
(18) and the frozen 14-case reference suite also pass.

The reviewed Darwin-arm64 host appended exactly the four previously missing cases—Welch TOST,
paired TOST, Survival, and D17—without changing the existing 14 cases. Reference coverage passes
18/18 at source commit `3c05b36`, which is an ancestor of the final artifact source.

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

- [x] Build the x64 sidecar and NSIS installer from source commit `de71d14`.
- [x] Bundle verifier, 18-case packaged-engine smoke, and release verifier pass.
- [x] Exact-executable native harness passes once; do not hide or repeatedly retry the first
      failure.
- [ ] Installed `.lsa` association opens the expected executable and preserves the saved Graph.
- [x] Record artifact filename, byte size, SHA-256, architecture, and build revision.

Windows candidate artifact:

- File: `BioFigureStat-0.1.0-alpha.3-Windows-x64-Setup.exe`
- Bytes: `48,088,866`
- SHA-256: `b5650d3af710ad7bfa9e34264a2d11a4ec0703ab1dd485b9b3130770ba9c6fe5`
- Architecture: `x64`
- Signature: unsigned
- Build revision: `de71d14-alpha.20260904.win-alpha3-enginefix1`

The final exact-executable native harness passed on its single run. Evidence is in
`.tmp/native-ui-regression/2026-09-04T05-18-03.869Z/report.json`. Installation and the dedicated
Windows Shell `.lsa` association scenario remain pending because they intentionally change the
current-user installation state.

An earlier local bundle was rejected before gate completion because the UI had been built before
the build-revision environment value was injected. It was overwritten, never staged for release,
and its digest is not release evidence. The artifact recorded above was rebuilt with the revision
present in the production UI, then passed both verifiers.

## Apple Silicon macOS artifact gate

Before starting, make `de71d140bae95f899c05ce8d18c516cf7a09f6e9` available on the Mac and confirm
that the product worktree is clean at that exact commit. Build with
`VITE_LSAA_BUILD_REVISION=de71d14-alpha.20260904.mac-alpha3-enginefix1` and
`VITE_EXPERIMENT_FIRST_ADAPTIVE_INPUT=1`. The production UI must contain both that exact revision
and `Statistical engine 0.15.0` / `統計engine 0.15.0`; a missing revision or `0.14.0` stops the gate.

Use the corrected harness at `e055553210efe62c7c21e412b743fa2967ac3ae3` from a separate clean
worktree. Run its 19 self-tests first, then pass the rebuilt product `.app` explicitly with
`--platform macos --executable <absolute BioFigureStat.app path>`. Run the native scenario once
only. The first new failure stops the gate; do not turn repeated retries into release evidence.

- [ ] Build the arm64 sidecar and `.app` from corrected source `de71d14`.
- [ ] Bundle verifier, strict codesign verification, and release verifier pass for the rebuilt app.
- [ ] Native harness passes once where Accessibility policy permits it. Otherwise record
      `HARNESS_INFRASTRUCTURE_BLOCKED` and perform only the equivalent bounded manual checks.
- [ ] Zip the rebuilt verified `.app`, test extraction, and verify the extracted signature again.
- [ ] Record the final artifact filename, byte size, SHA-256, architecture, signing state, and build revision.

Superseded macOS evidence (do not upload):

- File: `BioFigureStat-0.1.0-alpha.3-macOS-Apple-Silicon.zip`
- Bytes: `47,908,904`
- SHA-256: `b7f512c80d43061523852eeffec1f3c2028b2fa60933b80a1281cd2e7e8bc496`
- Architecture: Apple Silicon `arm64`
- Signature: ad-hoc; strict verification passed before and after zip extraction; not notarized
- Build revision: `8b58727-alpha.20260904.mac-alpha3-quitfix1`

The corrected macOS harness self-suite passed 19/19. Its single final native run passed the dirty
edit, first Quit guard, Cancel retention, second Quit request, and explicit Discard exit. The local
evidence path on the build host was
`.tmp/native-ui-regression/2026-09-04T02-06-34.869Z/report.json`. The product calculation and quit
guard passed, but this build came from `8b58727`, whose About panel still declared engine `0.14.0`
instead of the packaged `0.15.0`. Preserve it as diagnostic evidence only and rebuild from
`de71d14` before release.

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

- Candidate source: broad source gate `PASS`; corrected artifact source commit `de71d14`
- Windows artifact: automated bundle and exact-executable native gates `PASS`; installed
  association and bounded human checks pending
- macOS artifact: earlier `8b58727` build superseded by About metadata correction; rebuild pending
- Product failures: none detected
- Environment blocks: none
- Verdict: `CORRECTED WINDOWS ARTIFACT PASS — MACOS REBUILD, WINDOWS INSTALL/ASSOCIATION, AND BOUNDED HUMAN REVIEW PENDING`
