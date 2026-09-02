# BioFigureStat v0.1.0-alpha.3 candidate checklist

Updated: 2026-09-03 (JST)

Status: source preparation in progress; no candidate artifact or release has been authorized.

Use this checklist only for the maintenance Alpha described in
`PUBLIC_ALPHA_UPDATE_STRATEGY_2026-09-03.md`. The historical Alpha checklist remains a record of the
earlier release and must not be silently reinterpreted as current evidence.

## Source authority

- [ ] Record the clean candidate branch and full commit SHA.
- [ ] Confirm the public-source tree and private release-build tree relationship without copying
      sealed evaluation material into the public repository.
- [ ] Record the application version, engine version, build revision, license, and build date.
- [ ] Confirm that Windows and macOS artifacts use the same candidate source tree.

## Automated source gate

- [ ] Focused tests for every changed responsibility pass.
- [ ] Project migration tests pass for Public Alpha continuous, Survival, and ordered X/Y fixtures.
- [ ] Analysis-contract and engine reference/smoke tests pass for Welch TOST, paired TOST, and
      multi-condition Games–Howell.
- [ ] UI English-residue gate passes without translating researcher-entered labels.
- [ ] Workspace typecheck and lint pass.
- [ ] One full package/UI milestone gate passes, or every isolated failure has an explicit product,
      stale-test, or flaky disposition before a single bounded rerun.
- [ ] Production UI build and release verifier pass with zero forbidden evaluation markers.

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

- Candidate source: `TBD`
- Windows artifact: `TBD`
- macOS artifact: `TBD`
- Product failures: `TBD`
- Environment blocks: `TBD`
- Verdict: `NOT YET EVALUATED`
