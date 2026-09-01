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
| Apple Silicon macOS | `15aabd0-alpha.20260901.mac-refactor2` | PASS with Accessibility infrastructure note | `.app` ready; release zip pending |

Windows installer:

- Current path: `apps/desktop/src-tauri/target/release/bundle/nsis/BioFigureStat_0.1.0_x64-setup.exe`
- Size: `47,976,307 bytes`
- SHA-256: `F7064981BE4A36EB809C6B6C6F18C974E974771BBE001BEB5D37410C3EF85747`
- Proposed release asset name: `BioFigureStat-0.1.0-alpha.2-Windows-x64-setup.exe`

macOS release artifact still required:

- Zip the already reviewed `BioFigureStat.app` without rebuilding it.
- Record absolute zip path, byte size, and SHA-256.
- Proposed release asset name: `BioFigureStat-0.1.0-alpha.2-macOS-Apple-Silicon.zip`
- Verify the extracted `.app` before upload.

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

1. Produce and hash the reviewed macOS zip.
2. Decide whether to publish the update as `v0.1.0-alpha.2`.
3. Create the public source tag from the final documentation HEAD without changing application
   source.
4. Create a Draft Pre-release targeting that tag.
5. Upload both assets and verify GitHub-reported size/digest against the local records.
6. Apply the bilingual release notes in
   `docs/alpha/RELEASE_NOTES_0.1.0-alpha.2_DRAFT.md`.
7. Publish only after explicit user authorization; do not replace or delete `alpha.1`.

Current readiness: `BLOCKED_ON_MAC_ZIP_AND_PUBLICATION_DECISION`.
