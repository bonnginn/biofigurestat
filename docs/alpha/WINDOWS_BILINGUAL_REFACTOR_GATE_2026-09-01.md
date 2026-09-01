# Windows bilingual refactor gate — 2026-09-01

## Candidate identity

- Source HEAD: `ab5b01246d4101a143ce9565126f8e9f21387a3c`
- Build revision: `ab5b012-alpha.20260901.win-refactor2`
- Branch: `codex/native-ui-regression-automation-2026-08-31`
- Architecture: `x86_64`

`ab5b012` differs from the reviewed macOS source authority `039f46a` only in gate documentation;
the `apps`, `packages`, and `engine` source trees are identical.

## Generated artifacts

- Installer: `apps/desktop/src-tauri/target/release/bundle/nsis/BioFigureStat_0.1.0_x64-setup.exe`
- Installer size: `47,976,307 bytes`
- Installer SHA-256: `F7064981BE4A36EB809C6B6C6F18C974E974771BBE001BEB5D37410C3EF85747`
- Exact executable: `apps/desktop/src-tauri/target/release/lifescience-analysis-app.exe`
- Executable size: `13,830,656 bytes`
- Executable SHA-256: `5672C642BC9F2CE0D09A0430056F6B272178D2C0A9C3284EE5140C7F53A0F085`

## Automated gate

| Check | Result |
| --- | --- |
| Production UI build | PASS |
| Build revision embedded in bundle | PASS |
| Release verifier | PASS; forbidden `benchmark` marker count 0 |
| Engine build and smoke | PASS |
| Tauri application and NSIS installer build | PASS |
| Windows bundle verifier | PASS |
| Harness self-test | PASS (9/9) |
| Exact-executable native UI harness | PASS |

The exact-executable harness verified:

- packaged native architecture IPC reports `x86_64`;
- the isolated English Home surface has zero unexpected Japanese findings;
- native export writes the exact expected SVG bytes;
- the real Graph-only to Statistics handoff exposes and focuses its validation message;
- native Close opens the unsaved-work guard and Cancel retains the entered experimental unit;
- a second native Close followed by explicit discard exits the process.

Authoritative report:
`.tmp/native-ui-regression/win-refactor2-host/report.json`

Two earlier attempts from the restricted sandbox were recorded as
`HARNESS_INFRASTRUCTURE_BLOCKED` at the WebView2 CDP connection step. The first run is under its
timestamped evidence directory and the bounded repeat is under
`.tmp/native-ui-regression/win-refactor2-retry1/`. Running the same exact executable in the host
user's WebView2 environment passed immediately. The sandbox failures are retained as environment
evidence and are not product regressions.

## Final decision

`FINAL_GATE: PASS` for the automated Windows candidate. No additional human interaction was
required for this bounded gate.

The installer was not published and no GitHub release was changed.
