# Task Context Index

Use this file as a router, not a reading list. Begin with `AGENTS.md`, identify the task type, and
open only the listed authority plus the code and tests directly involved. Search by symbol before
opening broad documents.

## Current state and prioritization

- Short current snapshot: `docs/agent/CURRENT_STATE.md`
- Current production UX gate and eight evaluation cases:
  `docs/alpha/PRODUCTION_UX_ACCEPTANCE_GATE_2026-08-28.md`
- Older handoff/audit context only when historical comparison is needed:
  `docs/alpha/CURRENT_SOURCE_OF_TRUTH_HANDOFF_2026-08-25.md`

The dated handoff is partly superseded by ADR 0052, ADR 0053, and the 2026-08-28 acceptance gate.
Do not use it alone to describe current status.

## Experiment entry, worksheet, and Graph-first flow

- Current accepted integration boundary: `docs/adr/0053-task-oriented-entry-and-canonical-data-views.md`
- Progressive capability/readiness model: `docs/adr/0052-progressive-semantic-readiness.md`
- Original adaptive-input contract and five surface families:
  `docs/adr/0051-feature-flagged-experiment-first-adaptive-input.md`
- Human/production acceptance behavior: `docs/alpha/PRODUCTION_UX_ACCEPTANCE_GATE_2026-08-28.md`

Read ADR 0053 first. Read 0052 or 0051 only when the task touches the semantics they introduced or
needs historical rationale.

## Statistics and scientific routing

- Numerical-method authority: `docs/STATISTICAL_METHODS_REFERENCE.md`
- User-facing method catalog: `docs/STATISTICAL_METHOD_CATALOG.md`
- Pairing/blocking rules: `docs/PAIRING_BLOCKING_WIZARD_RULES_v0.1.md`
- Full safety and validation rules: `docs/agent/PROJECT_RULES.md`
- Relevant contract under `packages/analysis-contracts/` and engine implementation/test under
  `engine/python/lsaa_engine/` and `engine/python/tests/`
- Latest external engine-scenario triage and deferred defects:
  `docs/alpha/external-reviews/CLAUDE_ENGINE_SCENARIO_TRIAGE_2026-08-30.md`

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
- Release checklist: `docs/alpha/ALPHA_RELEASE_CHECKLIST.md`
- Production UX gate: `docs/alpha/PRODUCTION_UX_ACCEPTANCE_GATE_2026-08-28.md`
- Privacy: `docs/alpha/PRIVACY.md`
- Known limitations: `docs/alpha/KNOWN_LIMITATIONS.md`
- Diagnostics: `docs/alpha/DIAGNOSTICS_AND_ERROR_ARCHITECTURE.md`
- Windows setup/audits: `docs/WINDOWS_BENCHMARK_DEVELOPMENT_SETUP.md` and the relevant dated audit
- Current macOS Alpha handoff: `docs/alpha/MACOS_ALPHA_CANDIDATE_HANDOFF_2026-08-29.md`
- Latest native macOS manual result: `docs/alpha/MACOS_ALPHA_MANUAL_GATE_RESULTS_2026-08-30.md`
- Historical macOS validation evidence: `docs/MAC_HUMAN_REVALIDATION_HANDOFF_2026-08-26.md`

Browser preview is not evidence for native engine execution, save/open, packaging, signing, or
migration. Keep those evidence types separate.

## Benchmark and evaluation work

- Infrastructure contract: `docs/BENCHMARK_EVALUATION_INFRASTRUCTURE.md`
- Evaluation family entrypoint:
  `docs/evaluation/experiment-to-structure-navigation-pilot/README.md`
- Then open only the named version/run's README, manifest, and required evaluator instructions.

Never inspect sealed data or use evaluator-only materials during a blind run. Treat generated packs,
external model responses, prototype HTML, and dated run outputs as evidence artifacts, not product
authority.

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
