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
The runner accepts WebView2's transient blank-URL target, waits for navigation to the application
origin and origin storage, and treats a target that remains opaque as
`HARNESS_INFRASTRUCTURE_BLOCKED` rather than a product regression.

On 2026-09-01, revision `a6a186f-alpha.20260901.win-review2` completed the entire scenario against
the exact packaged executable on the Windows development host. Evidence is in
`.tmp/native-ui-regression/win-review2-clean/report.json`. The report records `x86_64`
architecture IPC, zero unexpected Japanese findings, exact native export bytes, the English
Graph-only Statistics validation alert and focus, dirty-value retention after native Close/Cancel,
and process exit after explicit discard. This resolves the previously recorded same-host startup
race for the current runner and candidate. A clean CI/VM remains desirable for repeatability, but
is no longer required to demonstrate the first complete Windows packaged-app PASS.

A CDP-connection failure remains `HARNESS_INFRASTRUCTURE_BLOCKED`; it must never be reported as a
BioFigureStat product regression without product-level evidence.

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
