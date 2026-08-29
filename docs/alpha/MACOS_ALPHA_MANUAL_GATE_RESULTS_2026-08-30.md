# macOS Alpha Manual Gate Results — 2026-08-30

## Evidence boundary

This record preserves the 2026-08-30 native macOS manual gate as historical evidence. It does not
overwrite the build handoff or earlier validation reports.

- Tested commit: `27e26f7467b2904a3bcc0bdfc54c8c5409dfd4b1`
- Build revision: `27e26f7-alpha.20260829.mac1`
- Node: `26.7.0`
- pnpm: `11.19.0`
- Signing: ad-hoc
- Notarization: not performed
- Pool D: not accessed

Automated test, typecheck, lint, Python sidecar build/smoke, `.app` build, and native bundle
verification passed on Apple Silicon macOS. Existing local `pnpm-lock.yaml` and the untracked
`docs/MAC_HUMAN_REVALIDATION_HANDOFF_2026-08-28.md` were preserved.

## Gate result

| Gate | Result |
| --- | --- |
| Native build | PASS |
| Canonical value integrity | PASS |
| Matched and nested semantics | PASS |
| Survival and ordered X/Y routes | PASS with bounded UX gaps |
| Lifecycle and export | FAIL |
| Final | **PRODUCTION MIGRATION BLOCKED** |

## Release-blocking finding

With an opened project marked `未保存`, choosing the macOS application-menu Quit action terminated
the application without the shared save/cancel/discard dialog. Home, New, Open, the red window-close
button, SVG/PNG/CSV export, native Graph clipboard, and privacy-reduced diagnostics behaved as
expected. Silent loss through application Quit is a release blocker.

The cause was the distinction between a Webview window-close request and Tauri's application-level
`ExitRequested` event. Commit `9e1f68c` prevents user-initiated application exit, emits a request to
the shared UI lifecycle guard, and allows only the subsequently approved programmatic exit. It also
adds `終了` to the shared File menu. Rust regression coverage distinguishes unapproved user Quit
from approved programmatic termination. Native macOS revalidation remains required.

## Confirmed strengths

- Browser-visible, canonical, Graph, and reopened scalar values remained identical after overwrite,
  decimal entry, Tab entry, and compact/detailed view switching.
- Explicit matched identity preserved one unmatched observation and used only complete pairs for
  paired inference.
- Nested Cell observations remained subordinate to dish-level biological `n`.
- Event/censoring and ordered coordinates survived Graph, Statistics, save, and reopen.
- Native SVG, PNG, CSV, and image clipboard export worked.
- Reduced diagnostics excluded measurements, researcher labels/text, file paths, and clipboard/file
  contents.
- External-LLM consultation and implementation-request generation remained manual and did not send
  or execute an external answer.

## Reopened Alpha work

### P1 before the next broad Alpha claim

- Make Graph axis-title spacing, comparison annotations, legends, and review preview use a
  publication-credible shared layout.
- Converge Survival and ordered X/Y on the same spreadsheet and export interaction grammar, not
  merely shared container components.
- Reproduce the macOS matched-sheet Tab/focus failure. A new deterministic second-row regression
  passes on Windows; therefore the native report is not dismissed but the implementation is not
  changed speculatively.
- Show complete-pair and unmatched counts, distinguish the inference set from all observed data,
  and state the population used for summaries.
- Make warning severity adjacent and visually explicit.
- Replace generic input-row terminology with experiment session, experimental unit, and nested
  observation concepts where those layers exist.
- Prevent stale validation bundles with the same Bundle ID from being mistaken for the candidate;
  record and verify the running build revision/path during manual gates.

### Product/architecture decisions

- Project-per-window is the preferred first multi-project desktop model. It requires an explicit
  lifecycle design for independently dirty projects and app-wide Quit; it is not claimed as
  implemented by this gate.
- Direct external-LLM API integration remains outside the accepted no-product-LLM boundary. Improve
  Help discoverability and the manual consultation screen without silently transmitting data.
- Fast templates may shorten genuinely simple designs, but required experiment facts must not be
  hidden merely to make the form appear shorter.

## Revalidation rule

The next macOS build must first repeat application-menu Quit with dirty and clean projects. The
candidate remains blocked until save, cancel, and discard are each observed through the native Quit
path. Re-run the full four-task gate only after changes that affect the corresponding semantic or
persistence boundaries; wording-only changes do not restart every historical case.
