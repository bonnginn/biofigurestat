# Bilingual Public Alpha update readiness — 2026-09-01

## Proposed release

- Proposed tag: `v0.1.0-alpha.2`
- Channel: GitHub Pre-release
- Product: the same BioFigureStat application, with Japanese and English selected in-app
- License: MIT
- Platforms: Windows 11 x64 and Apple Silicon macOS

This is a preparation record, not publication authorization. The existing
`v0.1.0-alpha.1` release and assets remain unchanged.

## Source authority

- Application-source authority: `039f46a292487380aa56faf8bba566d799f910fc`
- Windows gate evidence commit: `69255f3`
- macOS reviewed source tree: `018dc9d4fd558b24f015a9f42e0e7a62b10b346d`
- Windows `apps`/`packages`/`engine` tree: identical to the reviewed macOS application source

The later commits contain gate documentation only; they do not change the candidate application
source.

## Candidate matrix

| Platform | Build revision | Gate | Distribution artifact |
| --- | --- | --- | --- |
| Windows 11 x64 | `ab5b012-alpha.20260901.win-refactor2` | PASS | Installer ready |
| Apple Silicon macOS | `15aabd0-alpha.20260901.mac-refactor2` | PASS with Accessibility infrastructure note | Release zip ready |

Windows installer:

- Current path: `apps/desktop/src-tauri/target/release/bundle/nsis/BioFigureStat_0.1.0_x64-setup.exe`
- Size: `47,976,307 bytes`
- SHA-256: `F7064981BE4A36EB809C6B6C6F18C974E974771BBE001BEB5D37410C3EF85747`
- Proposed release asset name: `BioFigureStat-0.1.0-alpha.2-Windows-x64-setup.exe`

macOS release artifact:

- Source branch: `codex/mac-refactor-review-20260901`
- Source HEAD: `15aabd06c76a85c3e6be43a6bd4a31e43560db09`
- Path: `/tmp/biofigurestat-release-alpha2.TA73nD/BioFigureStat-0.1.0-alpha.2-macOS-Apple-Silicon.zip`
- Release asset name: `BioFigureStat-0.1.0-alpha.2-macOS-Apple-Silicon.zip`
- Size: `47,883,673 bytes`
- SHA-256: `4EE4734D57F703845C38EB00BB8A859D1CB54A2C019E7875F5841D5DFA888722`
- `unzip -t`: PASS
- Extracted `.app` `codesign --verify --deep --strict`: PASS
- The reviewed `.app` was zipped without rebuilding or changing its source.

## Completed evidence

- Both native candidates build and pass their bundle and release verifiers.
- Both production bundles contain zero forbidden `benchmark` markers.
- Windows exact-executable native UI automation passes in the host WebView2 environment.
- macOS bounded human review passes language persistence, an older Japanese-authored `.lsa`,
  Graph-only save/reopen, unsaved-work Cancel retention, and PNG/SVG native Save dialogs.
- Standard analysis remains local and deterministic; locale remains outside `.lsa`.
- Scientific semantics, biological `n`, pairing, nesting, censoring, ordered identity, raw lineage,
  project schema, and Public Alpha migration behavior are unchanged.

## Known distribution cautions

- The macOS Alpha remains ad-hoc signed and is not Apple-notarized.
- The Windows Alpha is not code-signed.
- The release remains an Alpha Pre-release. Researchers must keep independent backups and inspect
  saved projects, statistical scope, and exported Graphs.
- The macOS Accessibility harness cannot read a typed field value in the current managed runner;
  the same product path passed human review and this remains an infrastructure limitation.

## Remaining publication actions

Completed on GitHub:

- Public source tag `v0.1.0-alpha.2` points to documentation HEAD `4a259ab` without changing the
  reviewed application source.
- One Draft Pre-release targets that tag and remains `isDraft=true`, `isPrerelease=true`.
- The Windows asset is uploaded with the expected name and local SHA-256 recorded above.
- The macOS asset is `uploaded`, size `47,883,673 bytes`, with GitHub digest
  `sha256:4ee4734d57f703845c38eb00bb8a859d1cb54a2c019e7875f5841d5dfa888722`.
- The bilingual release notes are applied to the Draft.

Remaining:

1. Review the final public-facing title, bilingual notes, Pre-release label, and both asset names.
2. Publish only after explicit user authorization; do not replace or delete `alpha.1`.

Current readiness: `READY_FOR_FINAL_PUBLICATION_CONFIRMATION`.
