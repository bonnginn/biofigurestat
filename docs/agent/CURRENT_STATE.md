# Current Working State

Updated: 2026-08-31 (Public Alpha published; structural simplification in progress)

This is the short operational snapshot. Accepted ADRs, schemas, method references, and tests remain
the authority for durable behavior.

## Product phase

BioFigureStat `0.1.0-alpha.1` is publicly available under the MIT License at
`https://github.com/bonnginn/life-science-analysis-app/releases/tag/v0.1.0-alpha.1`.
The repository and release are anonymously accessible. The release contains:

- Windows 11 x64 installer, SHA-256
  `74D0C98124DE7319EAC623EADD99392E198E5128B4DDFF730F62015D0B615100`;
- Apple Silicon macOS zip, SHA-256
  `9C6FAE3076D1D7BD0E7F249451239675160179CBD37AA6618BE48CC9BD4208B6`.

Those artifacts were validated from private release-build commit
`587930f7b9aa81f2dd63386ac2643bc3c625efce`. The public source tag is an audited snapshot derived
from that build and is documented in
`docs/alpha/PUBLIC_SOURCE_PROVENANCE_0.1.0-alpha.1.md`. Sealed evaluation pools, historical
benchmark outputs, third-party comparison figures, external-review working material, and the
unreferenced corpus-coupled prototype are retained only in the private archive.

## Active work

Branch `codex/post-alpha-structural-simplification-2026-08-31` reduces duplication without adding
features or changing scientific semantics, the project schema, or analysis behavior. The initial
bounded changes:

- removed an unused Graph-only renderer after the production route had moved to the common Graph
  workbench;
- made nonlinear X/Y use the shared 1/2/5 nice-tick helper;
- shared legacy DataSheet keyboard-grid navigation;
- extracted Graph data export and annotation semantics from `ExperimentGraphWorkbench`.

The remaining high-value structural work is to continue splitting the workbench by stable
responsibility, converge compatible spreadsheet primitives without flattening scientific roles,
and add a native UI regression harness for mechanical Windows/macOS lifecycle checks.

## Product invariants

- The product is experiment-first; method selection follows declared experimental structure.
- Biological `n`, experimental-unit identity, pairing, blocking, nesting, repeated identity,
  censoring, ordered axes, missingness, raw lineage, and provenance remain explicit.
- Compact and expanded worksheets are views over the same canonical observations.
- Appearance changes do not mutate analysis results.
- Unsupported or ambiguous designs stop safely.
- Public Alpha `.lsa` files are backward-compatibility obligations.
- Research measurements and project contents are processed locally and are not included in usage
  telemetry or problem reports.

## Current verification

For the audited public snapshot, dependency installation, typecheck, lint, and the production UI
build pass. The self-contained package suites pass. The full UI suite produced one save-target
mock failure in 1,087 tests; the exact failed test passed immediately in focused isolation, so it
is recorded as a parallel full-run flaky rather than a product regression. Corpus-coupled
integration harnesses are not distributed because their fixtures are intentionally private.

For the post-Alpha refactor, focused Graph, Graph-only, DataSheet, MultiConditionDataSheet, and
`ExperimentGraphWorkbench` suites pass together with typecheck and lint. Native release artifacts
remain the unchanged Alpha binaries; this source-only refactor has not produced a new native
candidate.

## Known bounded gaps

- `ExperimentGraphWorkbench` remains large and still mixes rendering, editor UI, state orchestration,
  analysis integration, diagnostics, and benchmark capture.
- Spreadsheet implementations still include legacy and canonical surfaces with only partial shared
  primitives.
- Route-level code splitting remains a performance and maintainability follow-up.
- Researcher-facing terminology must be centralized before English localization.
- Beta work includes Graph-preview parity, compact workspace chrome, editable experiment metadata,
  and Kaplan–Meier appearance-control parity while preserving censoring and risk-table semantics.
- Windows/macOS native UI regression automation is still required; human review should then focus
  on scientific usability and visual judgment.

## Working-tree rule

Always run `git status --short` before editing. Preserve unrelated changes. Use small commits and
focused tests first, then expand validation in proportion to risk. Do not access sealed evaluation
pools or historical benchmark contents during ordinary product work.
