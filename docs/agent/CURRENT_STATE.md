# Current Working State

Updated: 2026-08-31 (Public Alpha published; English localization in progress)

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

Branch `codex/english-alpha-localization-2026-08-31` adds a persistent Japanese / English
application-language setting and reviewed English copy for the production Public Alpha workflow.
Automated English rendering checks now cover the application shell, experiment setup, canonical
data surfaces, Graph and Statistics, specialist workspaces, Help, external-LLM consultation, and
problem reporting. Locale state remains outside `.lsa`; scientific semantic keys, analysis
requests, raw lineage, and the project schema are unchanged. The completed and remaining scope is
recorded in `docs/alpha/ENGLISH_ALPHA_LOCALIZATION_STATUS_2026-08-31.md`.

Legacy D01-D05 files remain backward compatible. When English is active, those pre-workspace files
stop at an English compatibility notice instead of mixing Japanese legacy-editor copy into the
English UI. Switching to Japanese opens the unchanged legacy editor; no project conversion occurs.

The preceding structural-simplification work remains the base of this branch. Further workbench
and spreadsheet consolidation should resume after the English native candidate, without mixing
structural refactors into terminology review.

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

For the English-localization branch, the full UI suite passes with 131 files and 1,116 tests.
English no-Japanese assertions inspect visible text plus accessible labels, titles, placeholders,
and image alternative text across the production surfaces. Typecheck, lint, and the production UI
build pass. Windows candidate `8dec615-alpha.20260831.win-en1` passes the Windows bundle verifier,
release bundle verifier, and packaged-engine smoke checks. Its installer SHA-256 is
`B4A30A4288D0DF164766C0B99027E5CC36C4EE7D04AD381659CDD29AC4071554`. Windows human language review
and the macOS native candidate remain outstanding.

## Known bounded gaps

- `ExperimentGraphWorkbench` remains large and still mixes rendering, editor UI, state orchestration,
  analysis integration, diagnostics, and benchmark capture.
- Spreadsheet implementations still include legacy and canonical surfaces with only partial shared
  primitives.
- Route-level code splitting remains a performance and maintainability follow-up.
- English localization is covered for the production Public Alpha surfaces. Pre-workspace legacy
  D01-D05 editors use an explicit English compatibility stop rather than a partially translated
  editor; no English native release has been declared ready.
- Beta work includes Graph-preview parity, compact workspace chrome, editable experiment metadata,
  and Kaplan–Meier appearance-control parity while preserving censoring and risk-table semantics.
- Windows/macOS native UI regression automation is still required; human review should then focus
  on scientific usability and visual judgment.

## Working-tree rule

Always run `git status --short` before editing. Preserve unrelated changes. Use small commits and
focused tests first, then expand validation in proportion to risk. Do not access sealed evaluation
pools or historical benchmark contents during ordinary product work.
