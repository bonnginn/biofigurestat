# Canonical Specification Inventory — 2026-08-25

## 目的と監査境界

この文書は、Life Science Analysis App の現行判断基準を repository 内の文書から特定する read-only 監査結果である。製品コード、既存の仕様書、benchmark 結果は変更していない。実装との照合は未コミット差分ではなく `HEAD` (`362dd92c9d2a3bf8c3776549c71176a118c2e945`) を基準にした。sealed Pool D、expanded benchmark workbook、過去の個別 case 会話は開いていない。

調査対象として `AGENTS.md`、`README.md`、`docs/**/*.md` の計88文書を発見した。うち1件は入力 fixture で仕様文書ではない。ADR は47ファイルある（番号 `0007` が2件）。

## Authority hierarchy

`AGENTS.md` が明示する優先順位は次のとおりである。

1. 現在のユーザー指示
2. `LifeScience_Analysis_App_UX_Redesign_Prompt_v0.4.md`
3. `LifeScience_Analysis_App_Spec_v0.2.docx`（UX文書が上書きしない製品・技術事項）
4. accepted ADR と schema migration
5. code/tests（現状の証拠であり、上位仕様を黙って上書きしない）

重大な管理上の欠落として、2と3のファイルは現行 repository の tracked tree に存在しない。したがって、製品ビジョンとUXの完全な原典は repository 単独では再現不能である。`AGENTS.md`、accepted ADR、現行の数値・benchmark authority、最新のAlpha status reportを、欠落原典を代替しない「利用可能な正本集合」として扱う。

## 集計

- `CURRENT_CANONICAL`: 51文書（`AGENTS.md`、ADR 47件、数値手法 authority、benchmark gate、最新Alpha status）
- `CURRENT_SUPPORTING` / `IMPLEMENTATION_NOTE` / `BENCHMARK_ONLY`: 19文書
- `HISTORICAL / SUPERSEDED`: 17文書
- 仕様対象外 fixture: 1文書
- 上記に加え、current-looking 文書3件に部分的な stale 記述があるため、**historical/superseded または stale 記述を含む文書は計20件**

ADR 0038 は一部 superseded だが、ADR 0041 による置換範囲を明記した現行 decision record なので canonical 51件に含めた。

## Canonical document map

| Domain | Canonical document | Supporting docs | Superseded / stale docs | Confidence |
|---|---|---|---|---|
| Product vision | `AGENTS.md`（ただし指名原典2件が欠落） | `README.md`, `docs/PRE_IMPLEMENTATION_REVIEW_v0.2.md` | `docs/DEVELOPMENT_STATUS.md` | Medium |
| Scientific safety principles | `AGENTS.md`; ADR 0003, 0025, 0029, 0034, 0035, 0042–0046 | `docs/PAIRING_BLOCKING_WIZARD_RULES_v0.1.md` | 初期 milestone reports | High |
| Experiment/data model | ADR 0003, 0007 relational, 0010, 0013–0014, 0018, 0025, 0029, 0033, 0035, 0042–0044 | `docs/PRE_IMPLEMENTATION_REVIEW_v0.2.md` | `docs/UX_REDESIGN_PHASE1_MILESTONE.md` | High |
| Statistics | `docs/STATISTICAL_METHODS_REFERENCE.md`; ADR 0004, 0009, 0011–0012, 0015–0016, 0036, 0038–0046 | `docs/STATISTICAL_METHOD_CATALOG.md` | `docs/STATISTICAL_CHOICE_BENCHMARK_MILESTONE_AUDIT_2026-08-22.md` | High |
| Graph | ADR 0005, 0023–0024, 0036, 0039, 0042–0046 | `docs/UI_BENCHMARK_AND_EXPERIMENTER_WORKFLOW.md`; latest Alpha report | `docs/UX_PREVIEW.md`, old UX reports | Medium-High |
| Provenance/Methods | `AGENTS.md`; ADR 0004, 0010, 0013, 0015, 0018, 0029, 0033, 0039–0044 | `docs/STATISTICAL_METHODS_REFERENCE.md` | old implementation status reports | High |
| `.lsa` persistence | ADR 0002, 0006, 0007 relational, 0017, 0021, 0030–0032, 0037 | `docs/PRE_IMPLEMENTATION_REVIEW_v0.2.md` | directory-only assumptions predating ADR 0037 | High |
| Benchmarking | `docs/BENCHMARK_EVALUATION_INFRASTRUCTURE.md`; ADR 0007 literature, 0022, 0041; latest Alpha report | `docs/benchmark/500_case_hierarchy_qc_addendum.md` | milestone audit and earlier benchmark status | High |
| UX | `AGENTS.md` plus ADR 0008, 0019–0024, 0030–0032, 0034, 0036 | contextual help/diagnostics architecture | UX v0.4原典欠落; old UX preview/gap/milestone | Medium |
| Privacy/security | `AGENTS.md`; `docs/alpha/PRIVACY.md` | diagnostics architecture | none identified | High |
| Accessibility | No complete canonical specification | `docs/alpha/ALPHA_RELEASE_CHECKLIST.md`; UI tests | old UX reports | Low |
| Packaging/platform | ADR 0001, 0002, 0006, 0017, 0037 | packaging checklist; Windows setup/audit | older native and migration reports | Medium-High |
| Alpha readiness | `docs/alpha/POST_BENCHMARK_ALPHA_GAP_CLOSURE_2026-08-24.md` | release checklist, known limitations, quick start | internal-alpha reports; stale checklist clauses | High |
| Roadmap | latest Alpha report | `AGENTS.md`, packaging checklist | internal-alpha roadmap and development status | High |

## Canonical registry

### CURRENT_CANONICAL (51)

1. `AGENTS.md` — repository governance, authority order, product/scientific invariants.
2. `docs/STATISTICAL_METHODS_REFERENCE.md` — numerical-method authority.
3. `docs/BENCHMARK_EVALUATION_INFRASTRUCTURE.md` — benchmark/evaluation gate authority.
4. `docs/alpha/POST_BENCHMARK_ALPHA_GAP_CLOSURE_2026-08-24.md` — current readiness and roadmap transition authority.
5. `docs/adr/*.md` 47件 — accepted/adopted architecture and scientific decisions. ADR 0038 is partially superseded by ADR 0041; both remain necessary to reconstruct the decision.

Canonicality の根拠は、明示的な authority 記述、accepted status、後続ADRからの参照、現行コード・テストとの一致である。日付だけでは決めていない。

Post-audit canonical references: `docs/adr/0051-feature-flagged-experiment-first-adaptive-input.md`
(2026-08-26), as amended for the accepted Alpha prototype direction by
`docs/adr/0052-progressive-semantic-readiness.md` (2026-08-27), and for the feature-flagged
task-oriented entry, canonical data views, and Graph-first boundary by
`docs/adr/0053-task-oriented-entry-and-canonical-data-views.md` (2026-08-28). ADR 0052 and ADR 0053
do not approve production-default migration or replace its human-validation gates.

### CURRENT_SUPPORTING / IMPLEMENTATION_NOTE / BENCHMARK_ONLY (19)

- `README.md` — current entry point and safety boundary。ただし expanded benchmark の記述は stale。
- `docs/PRE_IMPLEMENTATION_REVIEW_v0.2.md` — foundational design rationale; named master spec の代替ではない。
- `docs/PAIRING_BLOCKING_WIZARD_RULES_v0.1.md`
- `docs/STATISTICAL_METHOD_CATALOG.md`
- `docs/UI_BENCHMARK_AND_EXPERIMENTER_WORKFLOW.md`
- `docs/LOCAL_WORKBOOK_PATTERN_AUDIT.md`
- `docs/WINDOWS_BENCHMARK_DEVELOPMENT_SETUP.md`
- `docs/benchmark/500_case_hierarchy_qc_addendum.md`
- `docs/alpha/ALPHA_RELEASE_CHECKLIST.md` — active checklistだが benchmark checkbox は stale。
- `docs/alpha/ALPHA_SIDEWORK_REPORT_2026-08-24.md`
- `docs/alpha/CONTEXTUAL_HELP_ARCHITECTURE.md`
- `docs/alpha/DIAGNOSTICS_AND_ERROR_ARCHITECTURE.md`
- `docs/alpha/KNOWN_LIMITATIONS.md` — active limitationsだが expanded benchmark pending は stale。
- `docs/alpha/PACKAGING_CHECKLIST.md`
- `docs/alpha/PERSONAL_FIGURE_GOLD_BRIEFS_2026-08-25.md` — workflow-specific benchmark brief, not product spec.
- `docs/alpha/PERSONAL_PUBLISHED_PAPER_WORKFLOW_VALIDATION_2026-08-24.md` — current validation protocol, not product spec.
- `docs/alpha/PRIVACY.md`
- `docs/alpha/PRODUCT_NAMING_AND_BRAND_STUDY_2026-08-24.md`
- `docs/alpha/QUICK_START.md`

### HISTORICAL / SUPERSEDED (17)

- `docs/CORE_COMPLETION_ACCEPTANCE.md`
- `docs/DEVELOPMENT_STATUS.md`
- `docs/IMPLEMENTATION_PLAN_INTERNAL_ALPHA_HARDENING_v1.md`
- `docs/INTERNAL_ALPHA_FINDINGS_2026-08-22.md`
- `docs/INTERNAL_ALPHA_HARDENING_IMPLEMENTATION_REPORT_2026-08-22.md`
- `docs/INTERNAL_ALPHA_READINESS_2026-08-22.md`
- `docs/INTERNAL_ALPHA_VALIDATION_REPORT_AND_ROADMAP_2026-08-22.md`
- `docs/NATIVE_INTERNAL_ALPHA_VALIDATION.md`
- `docs/NATIVE_STATISTICAL_VALIDATION_2026-08-21.md`
- `docs/NATIVE_WORKFLOW_VALIDATION_STAGE_1_6.md`
- `docs/STATISTICAL_CHOICE_BENCHMARK_MILESTONE_AUDIT_2026-08-22.md`
- `docs/USER_EVALUATION_01.md`
- `docs/UX_PREVIEW.md`
- `docs/UX_REDESIGN_GAP_ANALYSIS_v0.4.md`
- `docs/UX_REDESIGN_PHASE1_MILESTONE.md`
- `docs/WINDOWS_COMPATIBILITY_AUDIT_2026-08-23.md`
- `docs/WINDOWS_MIGRATION_PREPARATION_REPORT_2026-08-23.md`

これらは当時の証拠として保持すべきだが、現在地や未完了項目の authority として使用しない。

### 部分的に stale な current-looking 文書（3）

- `README.md` — expanded benchmark を将来 gate として残している。
- `docs/alpha/ALPHA_RELEASE_CHECKLIST.md` — expanded benchmark completion が未チェックのまま。
- `docs/alpha/KNOWN_LIMITATIONS.md` — expanded benchmark が未実施であるかのような記述が残る。

## Authority conflicts and unclear areas

1. **Missing masters:** `AGENTS.md` が指名する製品仕様書とUX仕様書が tracked tree にない。最大の source-of-truth defect。
2. **ADR番号の衝突:** `0007` が literature benchmark と relational project state の2件に使われる。内容は競合しないが参照が曖昧。
3. **Persistence evolution:** ADR 0002/0006 の transparent directory package は、ADR 0037 の single-file container により transport/storage 面が発展した。論理構造は維持されるため全面矛盾ではない。
4. **Graph semantics:** general `GraphSpec` boundary は canonical だが、factor role、series role、auxiliary reference、複数 annotation の意味論は canonical ADR に未昇格。
5. **Accessibility:** release checklist 以外に、検証可能な canonical requirements がない。

## Minimum documentation repairs proposed (not applied)

1. repository root に canonical index を1件置き、各domainの正本と置換関係を明示する。
2. 欠落している2つの master documents を repository に収容するか、正式に置換する新しい versioned spec を採択する。
3. factor roles、series/facet、auxiliary reference、multiple saved-comparison annotations を Graph/design ADR に昇格する。
4. `README.md`、Alpha checklist、Known Limitations の benchmark 状態だけを最新化する。
5. historical 17文書に front matter または先頭 banner で `HISTORICAL` と後継文書を付記する。
6. ADR `0007` の重複を、履歴を壊さない alias/index で解消する。
7. accessibility acceptance criteria を独立した canonical 文書として定義する。
