# BioFigureStat v0.1.0-alpha.3 candidate checklist

Updated: 2026-09-03 (JST)

Status: automated product-source gate passed at `2d9fba6`; no candidate artifact or release has
been authorized.

Use this checklist only for the maintenance Alpha described in
`PUBLIC_ALPHA_UPDATE_STRATEGY_2026-09-03.md`. The historical Alpha checklist remains a record of the
earlier release and must not be silently reinterpreted as current evidence.

## Source authority

- [x] Record the clean product-source branch and commit SHA: branch
      `codex/native-ui-regression-automation-2026-08-31`, product source
      `2d9fba652b79e69e98aec623f534c2d8e9a59a39`.
- [ ] Confirm the public-source tree and private release-build tree relationship without copying
      sealed evaluation material into the public repository.
- [ ] Record the application version, engine version, build revision, license, and build date.
- [ ] Confirm that Windows and macOS artifacts use the same candidate source tree.

## Automated source gate

- [x] Focused tests for every changed responsibility pass.
- [x] Project migration tests pass for Public Alpha continuous, Survival, and ordered X/Y fixtures
      (9 files / 73 tests).
- [ ] Analysis-contract and engine reference/smoke tests pass for Welch TOST, paired TOST, and
      multi-condition Games–Howell.
- [x] UI English-residue gate passes without translating researcher-entered labels (39 files / 362
      tests).
- [x] Workspace typecheck and lint pass.
- [x] One full package/UI milestone gate passes, or every isolated failure has an explicit product,
      stale-test, or flaky disposition before a single bounded rerun.
- [x] Production UI build and release verifier pass with zero forbidden evaluation markers.

The engine unit suite (75), analysis-contract suite (55), existing Windows sidecar smoke (18), and
existing frozen 14-case reference suite pass. `pnpm engine:reference:coverage` intentionally stops
and reports four missing Darwin-arm64 cases: Welch TOST, paired TOST, Survival, and D17. The
combined reference item above remains open rather than overstating the evidence. On the reviewed
Darwin-arm64 host, run `verify_engine_reference.py --write-reference`, review that only the four
expected cases are added or numerically refreshed, then run the complete coverage gate on both
hosts. The writer refuses to run on another platform.

## Windows artifact gate

- [ ] Build the x64 sidecar and NSIS installer from the recorded candidate source.
- [ ] Bundle verifier and release verifier pass.
- [ ] Exact-executable native harness passes once; do not hide or repeatedly retry the first
      failure.
- [ ] Installed `.lsa` association opens the expected executable and preserves the saved Graph.
- [ ] Record artifact filename, byte size, SHA-256, architecture, and build revision.

## Apple Silicon macOS artifact gate

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

- Candidate source: product source gate passed at `2d9fba6`; artifact nomination pending
- Windows artifact: `TBD`
- macOS artifact: `TBD`
- Product failures: `TBD`
- Environment blocks: `TBD`
- Verdict: `NOT YET EVALUATED`
