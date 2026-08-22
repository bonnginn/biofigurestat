# Windows benchmark migration preparation report

Date: 2026-08-23

Status: **preparation complete; external Windows gate not yet executed**.

## 1. Prerequisites

Windows 11 x64, Git for Windows, current Node.js LTS x64, `pnpm@11.19.0`, and CPython
3.12 x64 are required. Rust, WebView2 development prerequisites and Visual Studio Build Tools are
optional for a later native Tauri development build and are not needed for browser benchmark work.

## 2. PowerShell setup

Copy/paste-ready `winget`, clone, pnpm, Python venv, validation and pilot commands are in
`WINDOWS_BENCHMARK_DEVELOPMENT_SETUP.md`.

## 3. Compatibility changes

- Root evaluation/engine/verifier scripts use a shared Node launcher that selects
  `.venv\Scripts\python.exe` on Windows and `.venv/bin/python` on Unix.
- The bridge reuses the exact venv interpreter without resolving away Unix venv symlinks.
- The evaluation launcher discovers `pnpm.cmd` on Windows, checks exact engine/package versions,
  and prints the URL, engine environment, source revision, artifact root and stop instruction.
- Complete benchmark metadata records the source revision.
- The verifier requires the exact nine-file artifact set and app, benchmark, engine and source
  revision metadata.
- A 14-case macOS ARM64 reference envelope provides cross-OS numeric comparison.

No project schema, statistical method, analysis protocol or scientific routing was forked.

## 4. Start command

From repository root:

```powershell
pnpm dev:evaluation
```

This one command starts Vite, the same-origin proxy, the token-authenticated loopback bridge and the
pinned Python CLI. No tunnel is required for ordinary Windows Browser Use.

## 5. Browser URL

```text
http://127.0.0.1:1420
```

The bridge remains private at `127.0.0.1:43128`; browser code uses only `/api/evaluation/...`.

## 6. Clean stop

Press `Ctrl+C` once in the PowerShell window running `pnpm dev:evaluation`. The launcher terminates
the UI/proxy and bridge together.

## 7. Engine verification

On macOS preparation host:

- 38 Python engine tests passed;
- all 14 exposed analysis requests matched the macOS ARM64 engine 0.7.0 reference at
  `rtol=1e-10`, `atol=1e-12`;
- all 14 packaged macOS sidecar smoke cases passed after rebuilding the app;
- NumPy 2.3.5, SciPy 1.18.0 and Statsmodels 0.14.6 remain pinned.

The same `pnpm engine:test` and `pnpm engine:reference` commands must pass on Windows before pilots.

## 8. Benchmark verifier

The platform-neutral verifier and its four focused regression tests pass locally. It checks
identity, exact artifact membership/signatures, JSON/statistics state, Methods, log sequencing,
event counts and version/revision attribution.

```powershell
pnpm benchmark:verify -- --track track_A --run-id run_001
```

## 9. Known Windows limitations

- The current repository has no initial Git commit or remote, so an attributable Windows clone is
  blocked until the researcher chooses a private transfer/remote and creates the initial commit.
- Native Windows PNG clipboard, installer, signing, updater and release sidecar bundling are not
  implemented in this milestone.
- A real cross-OS `.lsa` exchange remains a later native gate.
- Windows package installation and process behavior cannot be certified from macOS alone.

## 10. Five-pilot gate readiness

The shared launcher, pilot loader, engine comparison and verifier are ready for the Windows gate.
The five visible Browser Use pilots have **not** yet been run on Windows, so the migration itself is
not complete. Run them in the documented order, then compare Windows Pilot 1 with the existing
macOS Pilot 1 before starting the 50-case Track A/B benchmark.

## Evidence

- Compatibility audit: `WINDOWS_COMPATIBILITY_AUDIT_2026-08-23.md`
- Full setup and pilot procedure: `WINDOWS_BENCHMARK_DEVELOPMENT_SETUP.md`
- Current repository status: `DEVELOPMENT_STATUS.md`
