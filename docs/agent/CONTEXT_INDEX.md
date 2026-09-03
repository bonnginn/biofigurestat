# Task Context Index

Use this file as a router, not a reading list. Begin with `AGENTS.md`, identify the task type, and
open only the listed authority plus the code and tests directly involved. Search by symbol before
opening broad documents.

## Current state and prioritization

- Short current snapshot: `docs/agent/CURRENT_STATE.md`
- Regression-test retention and rationalization: `docs/agent/REGRESSION_TEST_POLICY.md`
- Unusual-input debug results and research-backed method/Graph priorities:
  `docs/agent/EXPLORATORY_DEBUG_AND_METHOD_RESEARCH_2026-09-03.md`
- Public release behavior and limitations: `docs/alpha/RELEASE_NOTES_0.1.0-alpha.2.md`,
  `docs/alpha/QUICK_START.md`, and `docs/alpha/KNOWN_LIMITATIONS.md`
- Next Public Alpha timing and go/no-go boundary:
  `docs/alpha/PUBLIC_ALPHA_UPDATE_STRATEGY_2026-09-03.md`
- Next Public Alpha candidate execution and draft communication:
  `docs/alpha/ALPHA3_SCOPE_FREEZE_2026-09-03.md`, `docs/alpha/ALPHA3_CANDIDATE_CHECKLIST.md`, and
  `docs/alpha/RELEASE_NOTES_0.1.0-alpha.3-DRAFT.md`
- Public/private source relationship:
  `docs/alpha/PUBLIC_SOURCE_PROVENANCE_0.1.0-alpha.1.md` and
  `docs/alpha/BILINGUAL_ALPHA_UPDATE_READINESS_2026-09-01.md`

Historical handoffs, external reviews, benchmark outputs, and sealed evaluation material are kept
in the private archive and are not public product authority.

## Experiment entry, worksheet, and Graph-first flow

- Current accepted integration boundary: `docs/adr/0053-task-oriented-entry-and-canonical-data-views.md`
- Progressive capability/readiness model: `docs/adr/0052-progressive-semantic-readiness.md`
- Original adaptive-input contract and five surface families:
  `docs/adr/0051-feature-flagged-experiment-first-adaptive-input.md`

Read ADR 0053 first. Read 0052 or 0051 only when the task touches the semantics they introduced or
needs historical rationale.

## Statistics and scientific routing

- Numerical-method authority: `docs/STATISTICAL_METHODS_REFERENCE.md`
- User-facing method catalog: `docs/STATISTICAL_METHOD_CATALOG.md`
- Pairing/blocking rules: `docs/PAIRING_BLOCKING_WIZARD_RULES_v0.1.md`
- Equivalence execution boundary: accepted ADR 0061; paired-continuous proposal ADR 0062
- Full safety and validation rules: `docs/agent/PROJECT_RULES.md`
- Relevant contract under `packages/analysis-contracts/` and engine implementation/test under
  `engine/python/lsaa_engine/` and `engine/python/tests/`

For one method, read only its reference section, contract, implementation, and golden/reference
tests. Do not load the whole benchmark corpus.

## Project persistence, lineage, and lifecycle

- Full invariants: `docs/agent/PROJECT_RULES.md`
- Single-file container: `docs/adr/0037-single-file-project-container.md`
- Session/stable identity: `docs/adr/0035-session-and-stable-unit-identity.md`
- Workspace persistence: `docs/adr/0021-experiment-workspace-persistence.md`
- Reuse without data: `docs/adr/0030-reuse-design-without-data.md` and
  `docs/adr/0032-local-design-favorites.md`
- Current adaptive/source-history persistence amendments: ADR 0053
- Implementations: `packages/project/`, `apps/ui/src/app/desktopProjectPackage.ts`, and
  `apps/desktop/src-tauri/src/project_storage.rs`

## Graph behavior

- Current Graph-first/canonical-view boundary: ADR 0053
- Graph Core scientific set and hierarchy: `docs/adr/0048-graph-core-scientific-set-and-hierarchy-semantics.md`
- Visual grammar: `docs/adr/0047-graph-core-v1-visual-grammar.md`
- Workspace behavior: `docs/adr/0024-graph-workspace-v2.md`
- Contract/rendering code: `packages/graph-spec/` and `apps/ui/src/components/graph/`

Open older Graph ADRs only when the current ones explicitly depend on them.

## Release, privacy, diagnostics, and native packaging

- Product identity and artifact naming: `docs/adr/0054-biofigurestat-product-identity.md`
- Alpha tabs, Excel workbook import, and remote telemetry boundary:
  `docs/adr/0055-alpha-project-tabs-workbook-import-and-telemetry.md`
- Explicit Public Alpha reports and append-only triage:
  `docs/adr/0056-explicit-public-alpha-problem-reporting.md`
- Public Alpha source and bundle licensing: `docs/adr/0058-mit-public-alpha-license.md`
- Release checklist: `docs/alpha/ALPHA_RELEASE_CHECKLIST.md`
- Public Alpha 3 scope, executable checklist, and prepared macOS handoff:
  `docs/alpha/ALPHA3_SCOPE_FREEZE_2026-09-03.md`,
  `docs/alpha/ALPHA3_CANDIDATE_CHECKLIST.md`, and
  `docs/alpha/MACOS_ALPHA3_CANDIDATE_HANDOFF_2026-09-04.md`
- Privacy: `docs/alpha/PRIVACY.md`
- Institutional IT and data-handling summary: `docs/IT_DATA_HANDLING_OVERVIEW.md`
- Known limitations: `docs/alpha/KNOWN_LIMITATIONS.md`
- Diagnostics: `docs/alpha/DIAGNOSTICS_AND_ERROR_ARCHITECTURE.md`
- User-operated native checks: `docs/agent/MANUAL_VERIFICATION_PROTOCOL.md`
- Windows development setup: `docs/WINDOWS_BENCHMARK_DEVELOPMENT_SETUP.md`
- Public artifact provenance: `docs/alpha/PUBLIC_SOURCE_PROVENANCE_0.1.0-alpha.1.md` and
  `docs/alpha/BILINGUAL_ALPHA_UPDATE_READINESS_2026-09-01.md`

Browser preview is not evidence for native engine execution, save/open, packaging, signing, or
migration. Keep those evidence types separate.

## Benchmark and evaluation work

The public source contains product-side benchmark adapters and infrastructure documentation, but
not sealed pools, external responses, generated packs, or historical run outputs. Do not attempt to
reconstruct the private evaluation corpus from product work. A task that explicitly requires a
private blind evaluation must use its separately authorized private environment and instructions.

## Authority and staleness rules

1. Current user request.
2. Tracked master product/UX specifications, if restored.
3. Accepted ADRs and versioned schemas.
4. Current acceptance gate and maintained reference documents.
5. Code and tests as evidence of current behavior.
6. Dated reports, audits, run outputs, and chat history as historical evidence only.

`LifeScience_Analysis_App_UX_Redesign_Prompt_v0.4.md` and
`LifeScience_Analysis_App_Spec_v0.2.docx` are named as master authorities but are currently absent
from the repository. Flag decisions that genuinely require their missing content; do not infer it
from old summaries.

When a milestone changes current priorities or accepted behavior, update `CURRENT_STATE.md` and this
index in the same logical change. Do not append another general handoff unless it contains evidence
that cannot live in the existing canonical files.
