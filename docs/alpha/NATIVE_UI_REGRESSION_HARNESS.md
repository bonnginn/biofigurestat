# Native UI Regression Harness

Date: 2026-08-31

## Purpose

This harness moves repeatable native defect checks out of the human visual-review list. It launches
the packaged BioFigureStat executable with an isolated WebView profile and drives the actual Tauri
WebView rather than a browser preview. It does not change project schemas, scientific semantics, or
production permissions.

The first Windows gate covers:

- packaged native application launch;
- connection to the actual WebView2 instance over a loopback-only inspection port;
- an isolated English session without telemetry participation;
- native architecture IPC;
- visible and accessible application-copy scan for unexpected Japanese text;
- native export command and exact byte verification;
- actual Graph-only table entry, mapping, Graph creation, and Statistics handoff;
- required biological-structure validation appearing inline and receiving focus;
- retained Graph-only and biological-answer dirty-value retention;
- actual native window close interception;
- Cancel retaining the dirty entry;
- a second close followed by explicit discard and clean process exit;
- a screenshot of the native unsaved-work guard;
- a machine-readable JSON report for CI or release evidence.

The `日本語` language-selector button is the only allowed Japanese application text while English
is active. Researcher-entered or project-stored labels are not translated or audited as application
copy.

## Windows usage

Build the packaged engine and Tauri application first, then run:

```powershell
pnpm native:ui-regression:test
pnpm native:ui-regression:win
```

The default executable is:

```text
apps/desktop/src-tauri/target/release/lifescience-analysis-app.exe
```

Evidence is written beneath `.tmp/native-ui-regression/`. A custom exact executable and evidence
directory may be supplied:

```powershell
node scripts/native_ui_regression.mjs `
  --platform windows `
  --executable C:\absolute\path\to\lifescience-analysis-app.exe `
  --output C:\absolute\evidence\directory
```

The harness uses a temporary WebView2 user-data folder so it does not change the researcher's real
locale, consent choice, recent projects, favorites, or project tabs. It starts and terminates only
the exact process it created. Window-close checks send `WM_CLOSE` to that exact spawned process,
rather than relying on a WebView IPC permission that may not be present in the least-privilege
release capability set.

## First implementation evidence

The first exact-executable attachment reached the packaged Windows WebView, verified native IPC and
export bytes, entered the simple independent-group route, and retained React input values. It also
found a real English-localization defect that component-only coverage had missed: the route wrapper
still displayed `実験の種類を変更`. That copy and two workspace fallback messages are now
locale-aware, with a route-level no-Japanese regression assertion.

The scenario records every completed step even when a later step fails. A failed WebView attachment
records the chosen loopback port and any bounded native stdout/stderr in the evidence directory.
On the 2026-08-31 Windows host, repeated attachment after the initial successful run stopped exposing
the WebView2 CDP port even though the exact application continued to launch and its isolated profile
was created. Rebuilding the application, changing the loopback port, and adding the documented
`remote-allow-origins` flag did not change that host-level result. The packaged Windows verifier,
release verifier, typecheck, lint, and 1,117 UI tests still pass. Therefore this first harness is
useful defect-detection infrastructure, but it is not yet a stable mandatory release gate on every
Windows host.

Follow-up for the runner layer is to add a second supported Windows attachment backend or execute
the CDP scenario on a clean Windows CI/VM image. A CDP-connection failure must remain
`HARNESS_INFRASTRUCTURE_BLOCKED`; it must not be reported as a BioFigureStat product regression.

The runner now also accepts WebView2's transient blank-URL page target and retries when that target
is replaced during startup. It waits for that target to navigate to the application origin and for
origin storage to become available before beginning the scenario; an opaque `about:blank` document
is infrastructure-blocked rather than a product regression. This removed false failures during the
native startup race. A formal Tauri rebuild
on the same host still closes the CDP endpoint after the initial target, so that remaining result is
kept as host infrastructure evidence rather than converted into a product failure.

## macOS usage

The macOS adapter drives the packaged `.app` through macOS Accessibility and writes the same report
schema:

```bash
pnpm native:ui-regression:test
pnpm native:ui-regression:mac
```

It launches the exact binary inside `BioFigureStat.app`, opens the simple experiment entry, writes a
dirty title, invokes Command+Q, verifies that Cancel retains the value, then invokes Command+Q again
and confirms explicit discard exits. The traversal is bounded to 5,000 accessibility nodes and the
process wait is bounded by the harness timeout.

The runner host must grant Accessibility permission to the terminal or automation runner that calls
`osascript`. A missing permission is `HARNESS_INFRASTRUCTURE_BLOCKED`, not a product regression. The
adapter implementation and generated-script tests can run cross-platform; an actual `.app` PASS must
still be recorded on macOS before making it a mandatory release gate.

## Current boundary

This is the first native automation layer, not a claim that human review is unnecessary. Native
file-picker automation, installed-build file association, clipboard paste into third-party apps,
high-DPI layout judgment, and macOS UI driving remain separate gates.

Until the first packaged-app run of the adapter passes on a permissioned Mac runner,
`pnpm native:verify:mac` plus the bounded manual handoff remains authoritative for macOS.

Human review should increasingly focus on scientific clarity, terminology, clipping, graph
quality, and other visual judgment rather than repeatable lifecycle failures.
