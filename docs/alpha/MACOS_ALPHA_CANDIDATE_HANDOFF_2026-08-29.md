# macOS Alpha Candidate Handoff — 2026-08-29

## Authority and scope

This is the current macOS build and reduced-human-gate handoff. It supersedes
`docs/MAC_HUMAN_REVALIDATION_HANDOFF_2026-08-26.md` for new work but does not
overwrite that historical evidence.

- Branch: `codex/native-hardening-2026-08-28`
- Base HEAD before the latest UX follow-up: `26e8df8c92324ff3d5b217264d3ff40f2a61d3d8`
- Minimum candidate commit: `3e14935` (verified product candidate plus Node 26 test isolation)
- Pool D: not accessed
- Product route: experiment-first task hub; do not enable the historical feature flag
- Expected artifact: `apps/desktop/src-tauri/target/release/bundle/macos/Life Science Analysis.app`

The browser preview is not evidence for native Statistics, save/open, clipboard,
file association, signing, or sidecar behavior.

## Build instructions for Mac Codex

Run from the repository root on Apple Silicon macOS. Stop on the first failed
command and report the full command and output; do not substitute another
analysis or omit a failing verifier.

```bash
git fetch origin
git switch codex/native-hardening-2026-08-28
git pull --ff-only origin codex/native-hardening-2026-08-28
git merge-base --is-ancestor 3e14935 HEAD
git status --short

node --version
npm --version
npx --yes pnpm@11.19.0 install --frozen-lockfile
npx --yes pnpm@11.19.0 test
npx --yes pnpm@11.19.0 typecheck
npx --yes pnpm@11.19.0 lint
npx --yes pnpm@11.19.0 engine:build:mac
VITE_LSAA_BUILD_REVISION="$(git rev-parse --short HEAD)-alpha.20260829.mac1" npx --yes pnpm@11.19.0 tauri:build
npx --yes pnpm@11.19.0 native:verify:mac
```

The repository pins `pnpm@11.19.0`. The commands deliberately use `npx` so a
Mac without the optional `corepack` executable can build without installing a
global package. If `node` or `npm` itself is unavailable, stop and report that
prerequisite failure. Do not replace the pinned pnpm version with the latest
version.

Do not add Node's `--localstorage-file` option. The UI test setup deliberately
binds unqualified `localStorage` access to each isolated jsdom window; a shared
Node file can leak feature flags or consent state between Vitest workers.

Do not use `VITE_EXPERIMENT_FIRST_ADAPTIVE_INPUT=1`; the intended Alpha route is
already the production default. Do not modify fixtures or expected results to
make a failing check pass.

## Required build evidence

Return all of the following in one result:

```text
HEAD:
macOS version:
hardware architecture:
pnpm test result:
typecheck result:
lint result:
engine:build:mac result:
native:verify:mac result:
.app absolute path:
codesign --display --verbose=4 result:
codesign --verify --deep --strict result:
bundle SHA-256:
```

Use these commands for the final artifact details:

```bash
APP="apps/desktop/src-tauri/target/release/bundle/macos/Life Science Analysis.app"
codesign --display --verbose=4 "$APP"
codesign --verify --deep --strict "$APP"
ditto -c -k --keepParent "$APP" /tmp/Life-Science-Analysis-macOS.zip
shasum -a 256 /tmp/Life-Science-Analysis-macOS.zip
```

Ad-hoc signing is acceptable only for this private human gate. It is not
evidence for public distribution, notarization, or Gatekeeper delivery.

## Reduced human gate

Use the newly built `.app`, not a browser preview or an older installed copy.
Record PASS/FAIL and one short note per task. Stop immediately for a hard
failure; do not continue using potentially corrupted data.

### Task 1 — visible value equals canonical value

1. Start a simple experiment with one treatment (`Vehicle`, `Drug`), one scalar
   readout (`Response`), and separate `culture dish` units.
2. In the condition sheet enter, using Tab: row 1 `97`, `60`; row 2 `101`, `55`.
3. Overwrite `101` with `101.5`, leave the cell, then switch to `1測定1行` and
   back to `条件別シート`.
4. Create a dot Graph, save as `.lsa`, close, and reopen.

PASS requires all views, Graph, and reopened project to contain exactly
`97`, `60`, `101.5`, `55`. `97101`, duplicated observations, a Y-axis near
100,000, or a changed biological n is a **P0 hard failure**.

### Task 2 — matched and nested semantics

1. Create a same-cell Dark/Lit experiment with explicit Cell IDs and one missing
   partner.
2. Create one dish→Cell case with unequal Cell counts between conditions.
3. Check the Graph and Statistics summaries before and after save/reopen.

PASS requires matching only from explicit identity, the missing partner to stay
visible, and Cell rows not to be counted as independent biological n.

### Task 3 — specialist routes in the common shell

1. Paste one Survival table containing event and censored rows; create a
   Kaplan–Meier Graph and run log-rank.
2. Paste one ordered X/Y or enzyme-kinetics table; create its Graph and run the
   supported analysis or observe an explicit safe-stop.
3. Save/reopen both projects.

PASS requires `Data → Graph → Statistics → File` behavior, preserved censoring
and ordered coordinates, and no coercion into an ordinary scalar design.

### Task 4 — lifecycle and native export

1. With unsaved edits, try Home, New, Open, window close, and app Exit; verify
   save/cancel/discard behavior.
2. Export SVG, PNG, and CSV; copy the Graph to the clipboard and paste it into
   PowerPoint/Keynote or another native image-aware application.
3. Copy an external-LLM consultation prompt. Paste a synthetic answer into
   `相談結果から改善要望を作る`, add a short requested change, and copy the
   resulting implementation request.
4. Export a privacy-reduced diagnostic report.

PASS requires no silent data loss, no console window, working native exports,
and no research values, labels, paths, or clipboard/file content in telemetry.
The improvement request must remain a reviewed manual copy action: it must not
execute or submit the external answer automatically.

## Hard failure rules

- Visible worksheet value differs from canonical, Graph, or reopened value.
- Row alignment creates pairing or shared-run identity.
- Nested child observations become biological n.
- Censored records become missing values.
- Unsupported structure is silently converted to a supported design.
- Save/reopen changes identities, matching, ordered coordinates, raw lineage,
  Graph, or executed Statistics.
- Closing or opening a project silently discards unsaved work.

Any hard failure blocks the candidate. Wording or spacing feedback that cannot
change structure is recorded separately and does not trigger a full eight-case
rerun.

## Result template

```text
MACOS_NATIVE_BUILD: PASS / FAIL
TASK_1_CANONICAL_INTEGRITY: PASS / FAIL
TASK_2_MATCHED_NESTED: PASS / FAIL
TASK_3_SPECIALIST_ROUTES: PASS / FAIL
TASK_4_LIFECYCLE_EXPORT: PASS / FAIL
HARD_FAILURES: none / list
BOUNDED_UX_GAPS: none / list
FINAL_GATE: READY FOR TARGETED HUMAN REVALIDATION / NATIVE CANDIDATE BLOCKED
```
