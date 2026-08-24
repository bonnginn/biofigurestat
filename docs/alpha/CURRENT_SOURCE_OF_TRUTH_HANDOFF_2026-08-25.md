# Current Source of Truth Handoff — 2026-08-25

## Canonical sources

Read in this order:

1. `AGENTS.md` — authority order, product/scientific invariants, repository boundaries.
2. `docs/alpha/POST_BENCHMARK_ALPHA_GAP_CLOSURE_2026-08-24.md` — current status and roadmap transition.
3. `docs/STATISTICAL_METHODS_REFERENCE.md` — numerical-method authority.
4. `docs/BENCHMARK_EVALUATION_INFRASTRUCTURE.md` — benchmark/evaluation gate.
5. `docs/adr/*.md` — accepted architecture/scientific decisions; ADR 0038 is partially superseded by ADR 0041.
6. `docs/alpha/CANONICAL_SPEC_INVENTORY_2026-08-25.md` and `docs/alpha/SPEC_IMPLEMENTATION_ALIGNMENT_2026-08-25.md` — this audit's map and reconciliation, not a replacement product spec.

Warning: `AGENTS.md` names `LifeScience_Analysis_App_UX_Redesign_Prompt_v0.4.md` and `LifeScience_Analysis_App_Spec_v0.2.docx` as higher authorities, but neither is tracked in the current repository. Resolve this before treating repository documentation as self-contained.

## Current product invariants

- The product is experiment-first: purpose → design → design-aware data → statistics → Graph → Methods/provenance.
- The intended user is a life-science researcher, not a generic chart consumer.
- Experimental unit and biological n must be explicit.
- Pairing, nesting, repeated identity, session/date, and readout identity must survive loading, analysis, save/open, and export.
- Raw/source data is preserved; derived values retain lineage.
- Incomplete, duplicate, ambiguous, or unsupported structures are refused safely, never silently coerced.
- Statistical numbers come from the local deterministic engine, not an LLM.
- Recommendation, user decision, correction, assumptions, warnings, and engine version are provenance.
- Graph appearance does not mutate statistical analysis.
- Saved analysis results may drive Graph annotations; appearance remains separately editable.
- `.lsa` is a versioned single-file project container with safe migration/backup behavior.
- AI/cloud behavior must not upload research data implicitly.
- Benchmark/evaluation code is development-only and must not enter product runtime.
- Home has four primary project routes; specialist analyses live under New Experiment.
- Pool D is sealed; no automatic Round 4 or full 495-case rerun.

## Current architecture

The repository separates domain/design, project persistence, local analysis protocol/engine, Graph specification/rendering, desktop filesystem/process bridge, and UI workspace. Project state carries versioned design/data/analysis/graph/workspace records. The Python engine is authoritative for numerical work; TypeScript coordinates design, protocol, persistence, rendering, and UX. A known architecture drift is that Methods composition remains substantially UI-local rather than a clean dedicated package boundary.

## Current status

### Scientific

Round 1–3 and unseen Pool C validation are complete. The linked multi-readout loader preserves biological unit/readout/provenance identity and rejects incomplete, duplicate, or ambiguous inputs. Broad common statistical support and safe unsupported behavior have passed the recorded regression suites. Pool D remains untouched.

### Graph

Saved Statistics results can be annotated and edited from Graph Editor; results hierarchy and confirmation reuse were improved. Remaining structural gaps are first-class factor/series roles, auxiliary references, multiple saved-comparison annotations, and preview/final renderer convergence. These need canonical Graph/design decisions, not isolated drawing patches.

### UX

Home/navigation and major Japanese labels/responsive header behavior have been improved. Personal published-paper validation is the current reality check. Commercial-grade consistency, accessibility criteria, and remaining responsive/renderer polish are not complete.

## Public Alpha gate

Before public Alpha, all of the following must be true:

- common personal workflows complete safely or refuse with actionable explanations;
- factor/series/annotation behavior represents the experimental intent without misleading grouping;
- statistics, Graph, Methods, and provenance remain linked through save/open/export;
- no P0/P1 scientific-safety regression exists;
- Web UX and accessibility meet explicit acceptance criteria;
- macOS and Windows native smoke, packaging, signing, migration, privacy, and diagnostics checks pass;
- benchmark development assets and sealed data remain outside production artifacts.

## Sealed and do-not-cross boundaries

- Do not open or expose Pool D.
- Do not start Round 4 automatically or rerun all 495 cases without a new explicit purpose.
- Do not reinterpret historical Round 1–3 failures as current defects.
- Do not coerce unsupported or ambiguous scientific structures.
- Do not let AI/LLM become the numerical authority.
- Do not let Graph appearance edits invalidate or mutate analysis.
- Do not overwrite raw data, provenance, user decisions, or dirty working-tree changes.

## Current priorities

### P0

- None recorded after gap closure; any newly found wrong-result, identity-loss, or silent-coercion defect immediately becomes P0.

### P1

- Complete personal published-paper workflow validation and address demonstrated scientific-intent blockers.
- Canonicalize and implement the minimum factor/series/annotation model required by those workflows.
- Keep save/open/export and provenance correct through those changes.

### P2

- Converge preview and final renderers.
- Broaden factor-aware visual encodings and multi-annotation presentation.
- Finish commercial-grade Web UX, responsive behavior, localization, accessibility criteria, and help/diagnostics polish.
- Reconcile stale README/Alpha documents and create a canonical index.

### Later

- Beginner/Expert modes.
- richer Excel-like raw staging.
- notebook/run-level preliminary graphs.
- rare specialist workflows and native polish beyond the Alpha gate.

## Current roadmap

1. Broad benchmark/gap closure — complete.
2. Targeted Graph/design-model completion — active where personal workflows prove need.
3. Commercial-grade Web UX — active/next.
4. Personal published-paper workflow validation — immediate gate.
5. macOS/Windows native smoke and packaging.
6. Public Alpha decision.
7. Advanced features later.

## Genuine open specification questions

1. Where will the missing product and UX master specifications be restored or formally replaced?
2. What are the canonical semantic roles for factor, x-axis, series/color, facet, pairing, and auxiliary reference?
3. What is the versioned Graph contract for multiple saved comparisons and collision/layout behavior?
4. Must preview and exported/final graphs share one renderer or one normalized intermediate scene?
5. What measurable accessibility standard and test matrix gates Alpha?
6. Should Methods become a dedicated package as prescribed, or should the architecture document be updated to accept UI-local composition?
7. What is the exact supported lifecycle/provenance model for later preliminary run-level graphs?

## Working-tree note

At audit time the repository contains pre-existing uncommitted changes, including a saved personal-figure review, a prior synthesis document, interrupted implementation work, and nightly artifacts. They were neither discarded nor used as proof of committed implementation. Continue from `git status` before any write operation.
