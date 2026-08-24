# Specification–Implementation Alignment Audit — 2026-08-25

## Basis

Canonical inventory は `CANONICAL_SPEC_INVENTORY_2026-08-25.md` に従う。実装確認は dirty working tree ではなく commit `362dd92c9d2a3bf8c3776549c71176a118c2e945` のコード・テストを用いた。これは全機能コードレビューではなく、主要architectureとAlpha gateの整合監査である。

## Reconstructed current specification

### Product

- Intended user: biological experimentを設計・実施し、統計・図・Methodsを一続きに扱う life-science researcher。
- Differentiation from Prism: graph-firstの表計算器ではなく、experimental unit、biological n、identity、design、analysis、provenanceを保持する experiment-first workflow。
- Non-goals: LLMを数値計算のauthorityにしない、unsupported designを近似手法へ黙って coercionしない、研究データをクラウドへ暗黙送信しない、benchmark/evaluation bridgeを製品runtimeに混入しない。

### Scientific model

- biological n は行数やtechnical replicate数ではなく、明示した experimental unit から算出する。
- pairing、nesting、repeated identity、session/date、factor levels、source/derived lineageを保存する。
- covariate/ordered/repeated axisは分析protocolで明示し、recommendationとuser decisionをprovenance化する。
- 不完全、重複、曖昧な構造は拒否し、別designとして自動補完しない。

### Statistics

- authoritative engine は local deterministic Python engine（SciPy/statsmodels系）で、versioned protocolを介する。
- supported families は t-test/ANOVA系、paired/repeated、factorial、correlation、count/composition、time-series metrics、WB derived workflows、control-vs-many等。厳密なsupport boundaryはmethod referenceとADR 0009–0046に従う。
- multiple comparisonsはdesign-awareに選択し、decision sourceとcorrectionを記録する。
- assumptions、diagnostics、warnings、effect/estimate、provenanceを結果に含める。
- AI/LLM は説明・ナビゲーションを支援できるが、数値結果を生成・置換しない。

### Graph

- Statistics result と Graph appearance は分離する。appearance変更は分析を変えず、scientific structure/value変更だけが再解析や確認に影響する。
- Graph は宣言的な data mapping、analysis annotation、appearance、provenanceを保持し、renderer objectそのものをcanonical stateにしない。
- 保存済みanalysis comparisonをannotationとして選択できる。現行canonical specは複数同時annotation、series factor、auxiliary referenceを十分には定義していない。
- preview/final renderer convergenceは最新Alpha reportでP2とされ、未完了。

### Data and persistence

- lineage は raw/source → derived → analysis → Graph annotation/appearance → Methods/provenance の順で追跡可能にする。
- `.lsa` はversioned single-file project containerで、論理的には透明なmanifest/design/data/analysis/graph/workspaceを保持する。
- migration前backup、schema version、engine/artifact version、deterministic save/open、古いprojectの安全な拒否またはmigrationを要求する。

### Benchmark

- known regression と unseen poolを分離する。Track Aはscientific completion/safe unsupported、Track Bはuser-facing representation/UXを評価する。
- Round 1–3とPool C validationは完了。Round 4は自動開始しない。Pool Dはsealed holdoutであり、workbookを含め露出しない。
- completed と explicit unsupported は別に数え、silent coercionを成功扱いしない。
- benchmark artifacts/evaluation bridgeはdevelopment-onlyでproductionへ混入させない。

### Alpha gate

- common scientific workflowsが安全に完了または明示拒否されること。
- Graphが実験意図、series、statistics annotationを誤解なく表現できること。
- experiment-first UX、save/open/export、Methods/provenanceが実用workflowで確認されること。
- accessibilityとresponsive quality、macOS/Windows native smoke、packaging/signing/privacyがrelease基準を満たすこと。

## Major implementation alignment

| Requirement | Status | Evidence / finding |
|---|---|---|
| Local deterministic statistical authority; AI boundary | IMPLEMENTED | `engine/lsa_engine`, versioned engine protocol, UI/process boundary and tests |
| Explicit unit hierarchy, biological n, matching/repeated identity | IMPLEMENTED | `packages/domain`, project state, engine protocols, ADR-backed tests |
| Safe refusal of incomplete/duplicate/ambiguous multi-readout | IMPLEMENTED | latest gap-closure report and loader regression coverage |
| Factor levels and scientific level groups | PARTIALLY_IMPLEMENTED | domain factors/levels exist; semantic factor roles and proposed visual role do not |
| Design-aware statistics and supported-family breadth | IMPLEMENTED | ADR 0009–0046, engine/UI test suites and benchmark closure |
| Multiple-comparison provenance and confirmation reuse | IMPLEMENTED | recommendation/decision/fingerprint architecture; value-only reuse rule |
| Declarative Graph state independent from statistics appearance | IMPLEMENTED | `packages/graph-spec`, project workspace persistence, analysis fingerprint exclusions |
| General explicit series/facet semantics | PARTIALLY_IMPLEMENTED | two-factor result rendering exists, but general Graph Editor chiefly treats condition as color/legend rather than a first-class series role |
| Auxiliary reference concept | PLANNED / SPEC GAP | no canonical domain/GraphSpec role identified |
| Multiple saved-comparison annotations on one Graph | PARTIALLY_IMPLEMENTED | saved result annotations are editable, but workspace state exposes a single selected test/mode |
| Preview/final renderer convergence | PARTIALLY_IMPLEMENTED | explicitly P2 in gap-closure report; parallel rendering paths remain |
| `.lsa` versioned single-file save/open/migration | IMPLEMENTED | `packages/project`, desktop bridge, serialization/migration tests |
| Complete raw→derived→analysis→Graph→Methods lineage | PARTIALLY_IMPLEMENTED | core lineage exists; full cross-workflow Methods and Graph provenance is not uniformly consolidated |
| Methods as an architecture package boundary | DEVIATES_FROM_SPEC | methods composition is materially UI-local; no dedicated `packages/methods` boundary matching `AGENTS.md` |
| Four-route Home; specialist analyses under New Experiment | IMPLEMENTED | latest gap closure and UI routes/tests |
| Accessibility acceptance | UNKNOWN / PARTIALLY_IMPLEMENTED | UI tests/checklist exist, but canonical measurable accessibility spec is absent |
| macOS/Windows release packaging and signing | PLANNED | checklists/native smoke remain release work |
| Current written benchmark/readiness state | SPEC_OUTDATED | README/checklist/limitations still say expanded benchmark is pending despite completed gap closure |

## Eight major spec/implementation mismatches

1. The two master documents named by `AGENTS.md` are absent from the repository.
2. Current-looking README/Alpha checklist/Known Limitations retain obsolete benchmark-gate state.
3. Factor semantics stop short of explicit semantic and visual roles.
4. General Graph Editor lacks a canonical first-class series dimension across graph types.
5. Auxiliary reference is neither canonicalized nor generally implemented.
6. Multiple saved comparisons cannot yet be represented as a general multi-annotation Graph contract.
7. Preview and final rendering paths are not yet converged.
8. Methods/provenance composition does not match the dedicated package boundary described by repository architecture.

Items 3–7 are product gaps or spec gaps; item 1 is an authority gap; item 2 is documentation lag; item 8 is architecture drift. Native signing and accessibility are tracked incomplete gates, not counted again as contradictions.

## Recent direction alignment

| Direction | Classification | Reason |
|---|---|---|
| benchmark-driven broad failure discovery | CONSISTENT_WITH_SPEC | tiered benchmark and safe-support policy are canonical |
| Pool A/B/C/D strategy | CONSISTENT_WITH_SPEC | known/unseen/holdout separation follows ADR 0041 and current report |
| Round 1–3 + Pool C validation | CONSISTENT_WITH_SPEC | recorded completed validation |
| no automatic Round 4 | CONSISTENT_WITH_SPEC | current transition decision |
| Pool D sealed | CONSISTENT_WITH_SPEC | contamination boundary |
| multi-readout safe-loader | CONSISTENT_WITH_SPEC | preserves identity and refuses ambiguity |
| factor-aware experiment design | NATURAL_EXTENSION | factors already canonical; richer roles extend them safely |
| explicit series dimension | REQUIRES_SPEC_UPDATE | needed scientifically, but current GraphSpec does not define it generally |
| auxiliary reference concept | REQUIRES_SPEC_UPDATE | useful role is absent from current canonical model |
| multiple saved-comparison Graph annotations | REQUIRES_SPEC_UPDATE | extends current single saved-result linkage |
| Graph preview/final renderer convergence | CONSISTENT_WITH_SPEC | already identified as P2 |
| commercial-grade UX audit | NATURAL_EXTENSION | supports Alpha quality without changing scientific semantics |
| Prism migration-cost consideration | NATURAL_EXTENSION | consistent with intended user and differentiation; not a current requirement |
| personal published-paper workflow validation | CONSISTENT_WITH_SPEC | explicit next phase |
| later Beginner / Expert mode | NOT_COVERED | no current canonical behavior; must not fragment scientific truth |
| later Excel-like raw staging sheet | NATURAL_EXTENSION | compatible with spreadsheet workbench ADR if raw/source identity is preserved |
| later notebook/run-level preliminary graphs | NOT_COVERED | needs lifecycle/provenance specification before implementation |

**No listed current direction conflicts with the canonical product philosophy.** Three Graph/design directions require promotion into versioned specification before broad implementation.

## Specification drift

### A. Implementation ahead of documentation

- Completed expanded benchmark, Pool C validation, and post-benchmark gap closure are not reflected in README/checklists.
- linked multi-readout loading and safe ambiguity rejection are newer than foundational design docs.
- scientific-value-only confirmation reuse and improved results hierarchy are chiefly recorded in the latest Alpha report/code.
- single-file `.lsa` workspace behavior and richer graph workspace state exceed early package descriptions.

### B. Documentation ahead of implementation

- shared preview/final renderer.
- robust arbitrary factor/series visual encoding.
- consistent Methods/provenance boundary across all workflows.
- measurable accessibility acceptance and signed native distribution.

### C. Contradictions

- `POST_BENCHMARK_ALPHA_GAP_CLOSURE_2026-08-24.md` says expanded validation is complete; README, Alpha checklist, and Known Limitations still describe it as pending.
- ADR 0002/0006 can appear to prescribe a directory package while ADR 0037 prescribes a single-file container. The intended reconciliation is logical transparency inside a newer transport, but no canonical index states this.
- Two ADRs share number 0007, causing citation ambiguity, not a behavioral contradiction.

### D. Orphan decisions

- factor semantic roles and proposed visual roles.
- first-class series dimension for time/condition pairings.
- auxiliary/reference-only groups.
- multiple saved-comparison Graph annotations.
- recent personal-figure intent corrections and round-specific rendering lessons.

These exist in recent validation briefs/reports or implementation discussion and must not silently become canonical solely through code.

### E. Stale roadmap items

- expanded benchmark and its preflight are still shown as future work in three current-looking documents.
- internal-alpha hardening/Windows migration reports remain discoverable as if current roadmaps, though superseded by post-benchmark status.
- current remaining sequence—personal workflow, Web UX, native smoke, public Alpha—is valid but not indexed from one root source.

## Roadmap reconciliation

The seven-stage high-level roadmap remains valid. Stages should be read as status-bearing rather than all future work:

1. broad scientific benchmark / gap closure — **complete**
2. Graph/design-model improvement — **partly complete; targeted factor/series/annotation work remains**
3. commercial-grade Web UX — **next/overlapping validation-driven work**
4. personal workflow validation — **in progress / immediate next gate**
5. native smoke — **pending**
6. public Alpha — **pending gates**
7. later advanced features — **later**

Smallest adjustment: do not reorder the roadmap; add a short canonicalization checkpoint inside stage 2 before implementing first-class series, auxiliary reference, and multiple annotations, and mark stage 1 complete everywhere.

