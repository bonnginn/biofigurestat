# Alpha Candidate Readiness — 2026-08-29

## Decision

**Engineering status:** `READY FOR TARGETED HUMAN REVALIDATION`

**Public distribution status:** `PUBLIC ALPHA BLOCKED`

The current tree contains an engineering Alpha candidate: the intended experiment-first entry,
adaptive worksheet, Graph, Statistics, specialist routes, project lifecycle, diagnostics, external
LLM consultation prompt, and consent-gated usage telemetry have automated evidence. Public Alpha is
not approved until the external and native-human gates below are completed.

The requirement-by-requirement evidence audit is recorded in
`ALPHA_OBJECTIVE_COMPLETION_AUDIT_2026-08-29.md`.

## Alpha product path

The default New Experiment path is task-oriented rather than the older wizard:

1. start from an experiment, an existing table, Survival, an ordered X/Y or enzyme-kinetics
   experiment, or a Heatmap;
2. record biological facts without requiring StructureContract terminology;
3. generate a canonical worksheet appropriate to the structure;
4. use compact or detailed views over the same canonical observations;
5. create a Graph, add Statistics only when the required biological facts exist, and preserve the
   executed result and lineage through save/reopen.

The older compatibility route remains in code for migration safety. It is not the intended Alpha
entry and must not be presented as the default.

## Current automated evidence

| Area | Current result |
| --- | ---: |
| UI tests | 1,077 passed |
| Semantic package tests | 290 passed |
| Experiment-first prototype tests | 190 passed |
| Python engine tests | 63 passed |
| Rust native tests | 17 passed, 1 development-environment round trip ignored in the ordinary run |
| Real Rust → packaged Python-engine round trip | Passed for representative D01, D03 and D04 requests |
| Windows sidecar smoke | D01–D17 passed; engine `0.14.0` |
| UI typecheck | Passed |
| UI lint | Passed |
| Production Web build | Passed with revision `97976b5-alpha.20260829.4` |
| Release-bundle forbidden-content scan | Passed |
| Windows Tauri release and NSIS generation | Passed |

These checks establish deterministic behavior and regression coverage. They do not establish that a
first-time researcher understands every question or that a packaged application works on a clean
machine.

## Windows candidate

- Installer: `apps/desktop/src-tauri/target/release/bundle/nsis/Life Science Analysis_0.1.0_x64-setup.exe`
- Size: `46,631,746` bytes
- SHA-256: `D2276BC3D11856CA4F908C515E8C849A2E875CA5D0A146A561015775E7003C7A`
- Build revision: `97976b5-alpha.20260829.4`
- Build time: 2026-08-29 16:56 JST

This Windows artifact contains the progressive experiment-entry, shared Graph workspace,
canonical-value integrity changes, bounded UX clarifications, and manual external-LLM
implementation-request copy through `97976b5`. It passed the Windows bundle verifier, release
content verifier, and D01–D17 packaged-engine sidecar smoke. Clean-machine human validation is
still required.

This is an unsigned engineering candidate, not a public release. The packaged executable is
verified as PE subsystem `Windows GUI (2)` so it does not own a command-prompt window. Windows
sidecar processes use `CREATE_NO_WINDOW`, and native PNG clipboard support is implemented. These
still require clean-machine confirmation with this exact installer.

## macOS native build handoff

The authoritative command sequence, artifact evidence template, and reduced four-task gate are in
`MACOS_ALPHA_CANDIDATE_HANDOFF_2026-08-29.md`. The concise commands below remain a quick reference.

Use Apple Silicon macOS and build from the verified branch. `97976b5` is the minimum product
commit for the current reduced gate.

```bash
git fetch origin
git switch codex/native-hardening-2026-08-28
git pull --ff-only origin codex/native-hardening-2026-08-28
git merge-base --is-ancestor 97976b5 HEAD
npx --yes pnpm@11.19.0 install --frozen-lockfile
NODE_OPTIONS=--localstorage-file=/private/tmp/lsaa-vitest-localstorage.json npx --yes pnpm@11.19.0 test
npx --yes pnpm@11.19.0 typecheck
npx --yes pnpm@11.19.0 lint
npx --yes pnpm@11.19.0 engine:build:mac
npx --yes pnpm@11.19.0 tauri:build
npx --yes pnpm@11.19.0 native:verify:mac
```

The production build enables the experiment-first task hub by default. Do not add the historical
`VITE_EXPERIMENT_FIRST_ADAPTIVE_INPUT=1` override unless explicitly testing the rollback mechanism.
The expected application is:
`apps/desktop/src-tauri/target/release/bundle/macos/Life Science Analysis.app`.

Record the exact `git rev-parse HEAD`, `.app` code-signing identity, bundle SHA-256, macOS version,
hardware architecture, and every failed command. A browser preview does not substitute for this
native evidence.

## Generic failures closed in this candidate

- Independent worksheets no longer make researchers type generated internal IDs during ordinary
  entry; IDs remain stable and can be revealed or edited when necessary.
- Wide-grid blur commits the exact browser-visible value rather than a prior render's draft. The
  same values are regression-checked through Tab entry, overwrite, decimal, paste, view switching,
  Graph generation, and save/reopen; `visible value === canonical value` is an invariant.
- Spreadsheet focus prevents native recentering and scrolls only the nearest amount required to
  reveal an off-screen target, avoiding unnecessary horizontal jumps during sequential entry.
- Spreadsheet keyboard flow advances across a row and returns to the first editable cell on the next
  row.
- Positive/total-count entry accepts the first typed count and retains both raw components while the
  proportion remains calculated.
- Independent-factorial requests use canonical factor cell identifiers instead of display labels,
  closing the D05 factor-cell mismatch seen during manual validation.
- Violin density no longer invents a lower extent from a baseline that was not observed.
- The Y-axis title is positioned independently of the left-margin clipping correction, so preserving
  the first character of `Treatment` no longer pushes the title unnecessarily far from the axis.
- The worksheet overview reports biological-unit counts per condition without counting nested child
  observations as independent n.
- Survival entry accepts documented English and Japanese event/censoring terms and shows the accepted
  terms beside the sheet.
- Windows engine launch suppresses the sidecar console window without losing its standard streams.
- The Windows GUI-subsystem attribute now resides on the packaged binary crate root; an automated
  PE-header verifier prevents a console-attached executable from being accepted again.
- Windows PNG clipboard export uses a native registered PNG clipboard format.
- External-LLM help generates a bounded consultation prompt without an in-product LLM API or measured
  values. A deliberately pasted answer and researcher-written change request can be copied as an
  explicitly unverified implementation request; neither path sends or executes content. The
  external guide must be published before its GitHub link is relied upon.
- Matched empty-state tabs use the researcher-facing experimental-unit name consistently rather
  than mixing `Unit 1` with later named units.
- Adding another treatment dimension is visually and verbally distinguished from progressing to
  the next step.
- Selecting a non-recommended statistical method says that the choice is recorded, without falsely
  implying that a free-text override reason was captured.
- Graph-only entry begins with a compact five-row spreadsheet that expands as needed and describes
  its role as Graph-first rather than an explanatory preview.
- Usage telemetry remains off until explicit consent. With no approved remote endpoint, it fails
  closed and remains local-only; research values, labels, notes, paths, clipboard/file content and
  free text are excluded.

## Reduced researcher revalidation

Do not repeat every historical case. Run these four composite tasks against the exact native
candidate; the detailed steps and hard-failure rules remain in
`PRODUCTION_UX_ACCEPTANCE_GATE_2026-08-28.md`.

1. **Independent and factorial:** unequal-n scalar entry followed by a 2×2 table; verify keyboard
   flow, optional ID reveal, complete comparisons, Graph, Statistics and save/reopen.
2. **Matched and nested:** one same-entity Dark/Lit case and one dish→Cell case; verify pairing,
   biological n, child observations and missing values.
3. **Specialist routes:** one Survival table and one ordered X/Y table; verify Data → Graph →
   Statistics → save/reopen and native export.
4. **Lifecycle and support:** edit a saved project, exercise Home/New/Open/close with unsaved changes,
   copy an external-LLM consultation prompt, create a reviewed implementation-request copy from a
   synthetic answer, and export privacy-reduced diagnostics.

Re-run all eight semantic UX cases only after a change to structure mapping, canonical observation
identity, condition-combination status, or save/open migration.

## Public Alpha blockers and human decisions

### Native evidence

- Windows 11 clean-machine install, launch, D01/D03 or equivalent analysis, Graph, save/reopen,
  SVG/PNG/clipboard, diagnostics, file association and uninstall.
- macOS Apple Silicon build and the equivalent native smoke, including signing/notarization or an
  explicitly approved non-public delivery method.
- Both platforms at high DPI/200% zoom, non-ASCII paths, corrupt-project recovery and no-network use.
- Keyboard-only critical path plus Windows Narrator and macOS VoiceOver spot checks.

### Product and service decisions

- Approve final product name, license, bundle identifier, version and support/repository URLs.
- Choose the opt-in telemetry operator, region, retention and deletion/contact process before adding
  any remote endpoint. A new notice version and fresh opt-in are required.
- Choose the feedback-form provider, fields, privacy notice, retention and responsible support owner.
- Publish `docs/help/EXTERNAL_LLM_ASSIST_GUIDE_v0.1.md` at the URL embedded in the application, or
  approve a different stable URL.
- Record a security reviewer or named risk acceptance before public distribution.

## Bounded post-Alpha scope

Route-level code splitting, additional nonlinear models, Cox/competing-risks, crossed or partial
multi-factor matching, richer confidence-interval choices, customizable pane layouts, cloud sync,
and in-product AI remain outside the bounded Alpha. Unsupported structures must continue to stop
safely rather than be converted into a different supported design.

## Evidence boundary

Pool D was not accessed. The 65-case result remains evidence of StructureContract and adaptive
surface expressiveness, not evidence of first-time human navigation success. Browser review remains
UX evidence only and does not close native-engine or save/open gates.
