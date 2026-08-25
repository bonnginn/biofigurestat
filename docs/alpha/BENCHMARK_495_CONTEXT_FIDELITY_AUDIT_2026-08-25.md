# Benchmark 495 Context Fidelity Audit

Date: 2026-08-25  
Benchmark: `LSA495_v2_1_repaired_1`  
Decision: `GRAPH/CONTEXT SUBSET NEEDS TARGETED RECONSTRUCTION`

## Executive conclusion

The 495-case benchmark remains valuable for statistical-engine, hierarchy, loader, routing, provenance, and safe-unsupported regression. The present evidence does not support treating its historical PASS results as proof of paper-context or Figure fidelity.

A stratified sample of 50 non-Pool-D cases found no case meeting the strict `HIGH_FIDELITY` definition. Seventeen were adequate for statistical benchmarking, 17 were context reduced, 14 contained material context loss, and two were unresolvable from the available source abstraction. The common issue was not numerical invalidity: the Researcher Packet intentionally reduced every sampled scientific question to generic condition/time language and encoded none of the required X/series/facet Graph roles.

The appropriate response is targeted reconstruction of a bounded Graph/context subset, not a redesign or rerun of all 495 cases.

## Protocol incident and scope

- The fidelity audit script itself read only Round 1–3/Pool C-exposed case IDs. After audit generation, an overly broad aggregate validation command read the `goldAnalysis.expected_decision` field across the complete runtime case directory. It did not output case IDs, pool assignments, or individual observations, and the aggregate result was discarded and not used in this audit. Nevertheless, this counts as possible Pool D exposure, so this report does **not** claim that Pool D remained sealed.
- The repaired 495-case workbook was not opened.
- No 495-case product rerun was performed.
- Existing Round 1–3 and Pool C evidence was not overwritten.
- Only case IDs already exposed by `round_1.json`, `round_2.json`, `round_3.json`, and `pool_c_validation.json` were read.
- Fifty cases received the stratified fidelity audit. A metadata-only convergence/tier screen covered 184 historical non-Pool-D cases exposed by those review files.
- No product code was changed.

The 50-case fidelity results and 184-case convergence/tier screen below remain derived exclusively from the permitted historical boundary. Pool D should not be used as a pristine final holdout after this session without an explicit resealing/replacement decision.

## Audit method

For each sampled case, the audit connected the locally preserved chain:

`OA paperReference / Figure legend abstraction → Researcher Packet → Gold Metadata → Synthetic Raw → Gold Analysis → intended Graph semantics`

The audit separately evaluated:

- paper-to-packet scientific-message retention;
- biological unit, pairing, nesting, and time identity;
- primary contrast and reference roles;
- Graph representation and time semantics;
- whether display, analysis, comparison, and annotation sets were explicitly separable;
- synthetic shape, n, condition, readout, and time-pattern convergence.

The classification is deliberately conservative. A case can remain a good Tier S statistical fixture while being `CONTEXT_REDUCED` for paper or Graph purposes.

## Required metrics

| Classification                            | Count | Share |
| ----------------------------------------- | ----: | ----: |
| `HIGH_FIDELITY`                           |     0 |    0% |
| `ADEQUATE_FOR_STATISTICAL_BENCHMARK`      |    17 |   34% |
| `CONTEXT_REDUCED`                         |    17 |   34% |
| `MATERIAL_CONTEXT_LOSS`                   |    14 |   28% |
| `UNRESOLVABLE_FROM_SOURCE`                |     2 |    4% |
| **Total**                                 | **50** | **100%** |

Zero `HIGH_FIDELITY` cases in this sample does not prove that none exist among all 495. It means no sampled case carried the complete paper message, named primary contrast, reference roles, and X/series/facet semantics required for Tier C certification.

## Fidelity by family

| Family                     | Audited | Adequate statistical | Context reduced | Material loss | Unresolvable |
| -------------------------- | ------: | -------------------: | --------------: | ------------: | -----------: |
| multi-group nonparametric  |       5 |                    0 |               2 |             3 |            0 |
| factorial                  |       5 |                    0 |               4 |             1 |            0 |
| longitudinal               |       5 |                    0 |               0 |             5 |            0 |
| western blot               |       4 |                    0 |               4 |             0 |            0 |
| proportion                 |       4 |                    3 |               0 |             1 |            0 |
| nested                     |       4 |                    2 |               0 |             0 |            2 |
| paired                     |       4 |                    2 |               0 |             2 |            0 |
| two-group continuous       |       4 |                    4 |               0 |             0 |            0 |
| two-group nonparametric    |       3 |                    3 |               0 |             0 |            0 |
| multi-group parametric     |       3 |                    0 |               2 |             1 |            0 |
| survival                   |       3 |                    3 |               0 |             0 |            0 |
| correlation                |       3 |                    0 |               2 |             1 |            0 |
| multiple testing           |       3 |                    0 |               3 |             0 |            0 |

Longitudinal cases were the clearest family-specific failure cluster: all five sampled cases had a paper panel described as a box, violin, or heatmap while Gold/Synthetic structure imposed a repeated 0/6/12/24-hour trajectory. This is material Graph and experimental-context substitution, even if repeated identity is internally coherent.

## Recurring context-loss patterns

| Pattern                                      | Cases |
| -------------------------------------------- | ----: |
| Generic scientific question                  |    50 |
| Low paper-to-packet semantic overlap          |    50 |
| X/series/facet intent not encoded             |    50 |
| Reference role not explicit                   |    22 |
| Paper-versus-Gold time-structure conflict     |     6 |
| Human/clinical source context with animal n abstraction | 3 |
| Source patient/donor n with animal measurement context  | 3 |
| Image-level source n versus experiment-level nested Gold | 2 |

Important implications:

- An omnibus method can be statistically valid while failing to preserve a control-vs-many, rescue, or selected-comparison question.
- A line/time-course Graph can be internally valid for synthetic repeated data while not matching the selected paper panel.
- A Western blot fixture may retain analysis routing while losing normalization, target/reference, lane, and provenance semantics.
- `biological_n` safety does not establish that the paper's displayed unit, inferential unit, or scientific reference role was reconstructed correctly.

## Synthetic template convergence

The convergence screen covered 184 historical non-Pool-D cases.

- 58 unique shape fingerprints were observed across 184 cases.
- The two most common exact shapes each occurred 15 times:
  - 2 conditions × 40 readouts × 10 units × 400 rows;
  - 2 conditions × 3 readouts × 8 units × 24 rows.
- 112/184 cases had exactly two synthetic conditions.
- 159/184 had no explicit time values.
- Ten cases reused the exact `0, 6, 12, 24` time schedule.
- Frequent unit-count modes included 8, 10, 12, 16, and 28.
- Expected-decision templates were almost exactly balanced: 93 `signal_expected` and 91 `no_strong_signal_expected`.

This is not automatically a defect for deterministic engine fixtures. It becomes a fidelity defect when the repeated template replaces the selected paper panel's actual factor, time, readout, or sample structure. Template diversity is therefore adequate for routing regression but not demonstrated as representative of paper realism.

## Cases requiring human context

Only two cases meet the strict `NEEDS_HUMAN_CONTEXT` threshold after available source abstraction is exhausted:

- `LSA156`: whether image count or independent experiment is the inferential unit.
- `LSA390`: whether image count or independent experiment is the inferential unit.

Other material-loss cases belong in source reconstruction, not user interruption: their current source/packet/Gold chain contradicts itself and should be re-read from the paper before asking for scientific judgment.

## Historical evidence interpretation

Past conclusions need narrow reinterpretation, not withdrawal:

- Historical PASS remains valid for the exact tested engine/hierarchy/loader/provenance contract.
- It must not be cited as evidence that the paper's scientific message, named contrast, Graph convention, or visual grouping was preserved.
- Historical failures superseded by generic product fixes remain historical; this audit does not revive them as current product defects.
- Corrected context-rich versions must be versioned alongside, not over, the original benchmark cases.

## Decision and next action

`GRAPH/CONTEXT SUBSET NEEDS TARGETED RECONSTRUCTION`

Recommended order:

1. Reconstruct the 35-case Graph candidate subset with source-backed Figure briefs, named conditions, primary contrasts, units, and X/series/facet roles.
2. Regenerate synthetic data only where the reconstructed design no longer matches the historical synthetic structure.
3. Certify the repaired cases for Tier G; promote only the strongest cases to Tier C.
4. Run the Graph Capability Audit on that certified subset.
5. Continue Commercial-grade Web UX, targeted regression, and native smoke.
6. Replace or explicitly reseal the final holdout before any Pool D/public-Alpha decision; do not treat the current Pool D as unquestionably pristine after the aggregate-read incident.

## Machine-readable evidence

All machine-readable artifacts are under `benchmark/literature_v2_1/context_fidelity_2026-08-25/`:

- `fidelity_audit.json`
- `sampled_case_audit_manifest.json`
- `context_loss_clusters.json`
- `synthetic_template_convergence.json`
- `graph_capability_subset.json`
- `usage_tier_map.json`
- `needs_human_context.json`
