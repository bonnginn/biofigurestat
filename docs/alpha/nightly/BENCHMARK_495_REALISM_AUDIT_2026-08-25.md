# Benchmark 495 Realism / Context-Fidelity Audit

Date: 2026-08-25  
Track: Nightly Track C  
Status: read-only audit completed for a stratified, non-Pool-D sample

## Executive conclusion

The expanded benchmark is useful as a **statistical/data-shape generalization benchmark**, but it must not be treated as a 495-panel paper-faithful Graph Gold library.

Among 40 stratified cases selected only from explicitly safe Pool A regression, Rounds 1–3 (Pool B), and completed Pool C validation artifacts:

| Classification | n | Share |
|---|---:|---:|
| `HIGH_FIDELITY` | 1 | 2.5% |
| `ADEQUATE_FOR_STATISTICAL_BENCHMARK` | 17 | 42.5% |
| `CONTEXT_REDUCED` | 3 | 7.5% |
| `MATERIAL_CONTEXT_LOSS` | 15 | 37.5% |
| `UNRESOLVABLE_FROM_SOURCE` | 4 | 10.0% |

This distribution is **not an estimate for sealed Pool D** and must not be extrapolated to it. It shows that a substantial part of the safe A/B/C runtime preserves a valid statistical skeleton while replacing paper-specific factors, readouts, controls, units, time structures, or graph intent with reusable synthetic templates. That is acceptable for many engine and loader tests, but weak or unsafe for paper-context fidelity and automated Graph Capability Gold.

The per-case evidence and classification are recorded in [sample_inventory.csv](benchmark_495_realism_audit_2026-08-25/sample_inventory.csv).

## Scope and safety boundary

- The 495-case master workbook was not opened.
- No `.xlsx` or other workbook was opened.
- `sealed_pool_d.json` was not opened.
- No Pool D case ID or Pool D case artifact was inspected.
- No Round 4 or 495-case run was started.
- No benchmark evidence, product file, review, runtime, or generated synthetic data was modified.
- The only benchmark-side inputs were existing JSON artifacts for cases identified by the explicit safe lists:
  - `round_1.json`
  - `round_2.json`
  - `round_3.json`
  - `pool_c_validation_sealed.json` after the completed Pool C validation recorded in the canonical report
  - `pool_a_regression.json`
- These lists form an allowlist of 368 non-Pool-D cases. Sampling and reads were restricted to that allowlist.

The sample contains 40 cases: 13 from Round 1, 8 from Round 2, 10 from Round 3, 5 from completed Pool C validation, and 4 from the Pool A regression set. Thus it is not concentrated in the original reference cases.

## Audit method

For every sampled case the following chain was inspected from the existing runtime JSON:

`Paper Reference -> Researcher Packet -> Gold Metadata -> Synthetic Raw -> Gold Analysis / Graph intent`

The Track A packet and integrator copies agreed on Paper Reference, Researcher Packet, and synthetic-row count for all 40 sampled cases. This confirms internal artifact continuity; it does **not** establish that the synthetic content faithfully represents the paper.

The audit compared:

- the paper figure description, panel, graph representation, nearby unit/n evidence, and methods reconstruction;
- the packet's biological question, measurement context, conditions, readouts, repeated identity, nesting, and time;
- Gold Metadata design class, biological n, analysis level, and generation assumptions;
- raw condition/readout/unit/time structure, denominators, parent units, and repeated identities;
- Gold Analysis reference method, contrast, transformation, and multiplicity behavior.

Classification rubric:

- `HIGH_FIDELITY`: scientific question, main factor/control roles, unit structure, analysis intent, and graph context materially align.
- `ADEQUATE_FOR_STATISTICAL_BENCHMARK`: a coherent statistical fixture preserves the important design topology, but paper-specific biology or presentation is genericized. This is not a failed statistics case.
- `CONTEXT_REDUCED`: useful structure remains, but a major context dimension such as named variables, multi-readout breadth, perturbation, or source n is substantially reduced.
- `MATERIAL_CONTEXT_LOSS`: the synthetic design or Gold analysis changes the scientific question or conflicts with the recorded paper structure/graph family.
- `UNRESOLVABLE_FROM_SOURCE`: the safe runtime chain lacks enough Paper Reference evidence; no inference was substituted.

## Stratification coverage and limitations

The sample covers correlation/regression, factorial, longitudinal, multi-group parametric and nonparametric, multiple testing, nested microscopy, paired, proportion, survival, two-group parametric and nonparametric, Western blot, and a linked multi-readout case.

Two requested families could not be audited as distinct families without expanding beyond the confirmed-safe roster:

- **Cross-sectional time course:** the safe 368-case design roster has no explicit `time_independent` design class. Longitudinal cases were not reinterpreted as cross-sectional.
- **Descriptive-only:** the safe 368-case design roster has no explicit descriptive-only design class. Inferential cases were not relabeled.

There was also no source-supported irregular-X case in the sample. These are evidence gaps, not evidence that the benchmark lacks such cases globally.

## Fidelity by family

| Family | Sample n | Result |
|---|---:|---|
| Correlation | 3 | 2 adequate; 1 context-reduced |
| Factorial | 3 | 3 material context loss |
| Longitudinal | 3 | 1 adequate; 1 context-reduced; 1 material loss |
| Multi-group | 3 | 2 adequate; 1 unresolvable |
| Multi-group nonparametric | 3 | 1 adequate; 2 material loss |
| Multiple testing | 3 | 3 adequate for statistical benchmarking |
| Nested | 3 | 1 adequate; 1 material loss; 1 unresolvable |
| Paired | 3 | 1 adequate; 1 material loss; 1 unresolvable |
| Proportion | 3 | 2 adequate; 1 material loss |
| Survival | 3 | 1 adequate; 2 material loss |
| Two-group continuous | 4 | 1 high; 1 context-reduced; 1 material loss; 1 unresolvable |
| Two-group nonparametric | 3 | 1 adequate; 2 material loss |
| Western blot | 3 | 2 adequate; 1 material loss |

The clearest risk concentration is factorial: all three sampled factorial cases use the same generic genotype-by-stimulus 2x2 template, while the recorded paper descriptions include a time-course, a mechanobiology/mRNA heatmap, and a learning/survival-style panel. Survival also contains two direct modality conflicts, including a Western-blot paper panel represented as event-time data.

## Recurring context-loss patterns

### 1. Statistical topology is retained while scientific factor identity is replaced

Common synthetic labels such as `Vehicle / Pathway inhibitor`, `Young adult / Aged`, `Normoxia / Hypoxia`, and `Reference / Loss-of-function` often bear no demonstrated relationship to the recorded panel. This can still exercise a test family, but it no longer tests whether the app understands the paper's actual control, WT, rescue, intervention, or reference roles.

### 2. Graph family and generated design can conflict

Examples in the sample include:

- a recorded line/time-course converted to a no-time factorial design (`LSA059`);
- a recorded box-plot endpoint converted to a four-time repeated curve (`LSA090`);
- a Western-blot panel converted to survival data (`LSA082`);
- a chemotaxis dot plot converted to a Western-blot ratio (`LSA075`);
- a bacterial localization/cell-count context converted to an organoid-level two-group fixture (`LSA095`).

These are not cosmetic graph differences. They alter the experimental question or unit structure.

### 3. Primary comparison and control roles are usually implicit or generic

Gold Analysis often identifies a valid omnibus/test family but does not retain paper-specific named contrasts. Generic `Vehicle`, `Reference construct`, or `Wild type` labels may look like controls, yet they are template values rather than verified paper roles. Consequently, these cases should not automatically drive control-vs-many, rescue, auxiliary-reference, or annotation Gold expectations.

### 4. Sample-size caps weaken paper realism

Runtime generation assumptions explicitly say source values were not digitized and source n informed a capped synthetic n. This is appropriate for bounded statistical fixtures, but it can materially change distribution appearance and hierarchy. Examples include source `n=1045 cells` represented as 13/14 organoid observations and source `n=86` represented as 14 pairs.

The automatically extracted nearby unit is also not always trustworthy: several references pair embryo/cell experiments with a nearby term such as `rat`. Such text must not be promoted to a verified biological-unit Gold without paper-level review.

### 5. Multi-readout support is structurally useful but not necessarily context-faithful

`LSA135` is valuable for linked-readout loader, identity, and provenance testing. Its paper description concerns a 48-DEG heatmap, while the synthetic case uses two generic fluorescence readouts and unrelated age groups. It is therefore a strong loader contract fixture, not a paper-faithful multi-readout Graph Gold.

### 6. Some original regression fixtures lack the Paper Reference link in safe runtime

Four Pool A regression cases in the sample have coherent Researcher Packets and statistics fixtures, but their safe runtime records do not expose a Paper Reference. They remain valid regression fixtures; fidelity was marked `UNRESOLVABLE_FROM_SOURCE` rather than guessed.

## Synthetic template-convergence audit

The sample shows substantial template reuse. Reuse is not inherently wrong, but here it reduces apparent diversity in scientifically relevant dimensions.

### Condition-label convergence

Across 40 cases:

- `Vehicle / Pathway inhibitor` appears in 5 cases.
- `Young adult / Aged` appears in 4 cases.
- `Reference / Loss-of-function`, `Normoxia / Hypoxia`, generic genotype-by-stimulus 2x2, `Untreated / Drug-treated organoids`, `Single observational cohort`, and reference/deletion/catalytic-dead constructs each appear in 3 cases.

These repetitions cross unrelated organisms, assays, and paper questions.

### Shape and n convergence

- The exact `2 groups x 1 readout x 14/14 rows` shape appears in 6/40 sampled cases.
- Three multi-group cases use exactly `3 groups x 4/4/4`.
- All three sampled multiple-testing cases use 40 features and 5 units/group, yielding 200 rows/group.
- All three sampled factorial cases use the same balanced generic 2x2 layout.
- Among the 36 expanded cases with populated Gold biological n, `n=14` occurs 10 times (27.8%) and `n=4` occurs 9 times (25.0%).

### Time convergence

- All three sampled longitudinal cases use exactly `0, 6, 12, 24 h`, regardless of paper context.
- All three sampled survival cases use 12 units/group with an event-time horizon through day 30.
- No sampled source-grounded irregular-X structure was found.

### Distribution/effect convergence

- The three sampled proportion fixtures have very large and tightly clustered standardized group separations (approximately 4.0–4.7 using the raw-row mean difference divided by within-group SD), despite unrelated papers.
- Multiple-testing cases share the same feature count and per-feature sample structure.
- Western-blot cases uniformly use the same three-readout schema: target band, loading reference, and normalized ratio.

This is enough convergence to make family counts look more diverse than the underlying data-generating templates. The benchmark does not need a unique distribution per case, but future realism work should diversify scientifically meaningful factor labels, n/hierarchy patterns, time grids, effect/variance regimes, and graph-intent contracts.

## Recommended benchmark uses

### Recommended now

- statistical routing and unsupported-case behavior;
- biological-n, pairing, nesting, repeated-identity, and provenance regression where the Gold structure has already been validated;
- loader/data-shape coverage, including linked readouts such as `LSA135`;
- deterministic engine result and multiplicity contracts;
- broad workflow robustness and safe failure behavior;
- family-level capability coverage, provided results are described as synthetic/statistical rather than paper reproduction.

### Use only with explicit caveat

- graph-family smoke tests where the synthetic shape matches the intended renderer;
- UX tests that need representative data density;
- method-selection tests when paper-reported method is clearly separated from the benchmark reference method;
- aggregate success-rate claims limited to benchmark representability, not publication fidelity.

### Do not use without case-level reconstruction

- paper-faithful visual similarity ratings;
- automatic Gold for X/series/facet semantics;
- control/WT/rescue/auxiliary-reference semantics;
- publication annotation placement or named primary contrasts;
- claims that synthetic n, distribution, time spacing, or effect size resembles the source paper;
- evaluation of whether an app reconstructed the paper's scientific message.

## Graph Capability Audit candidate subset

The following are candidates from this sample. `Context caveat` means the case can test a generic capability but must not supply paper-faithful labels or visual Gold without reconstruction.

| Capability dimension | Candidate cases | Allowed use |
|---|---|---|
| Two-group categorical | `LSA052` | Strong candidate; source n, siRNA contrast, and box family align |
| Grouped categorical / multi-group | `LSA063`, `LSA106` | Layout and multi-group points with context caveat |
| Nonparametric distribution | `LSA118`, `LSA083` | Box/violin/raw-point mechanics with context caveat |
| Paired identity | `LSA061` | Paired statistical identity with context caveat; paper heatmap is not graph Gold |
| Nested raw + biological summary | `LSA156` | Strong generic nested-display candidate with context caveat |
| Continuous time / repeated identity | `LSA054` | Time geometry and identity; do not copy paper labels or source n |
| Correlation / regression | `LSA127`, `LSA177` | Scatter/statistical smoke only; restore named x/y semantics before visual Gold |
| Proportion | `LSA071`, `LSA108` | Fraction/denominator and distribution smoke with context caveat |
| Survival | `LSA120` | Kaplan–Meier/log-rank smoke with context caveat |
| Multiple testing | `LSA055`, `LSA142`, `LSA161` | Heatmap/feature-table/FDR mechanics; not paper-context Gold |
| Western blot provenance | `LSA056`, `LSA094` | Linked band/loading/ratio provenance and normalized endpoint |
| Multiple readouts | `LSA135` | Loader, identity, selection, provenance only |

No reliable candidate was found in this sample for independent visual series, paired visual series as a paper-faithful grouped graph, irregular X, all-pairs annotation, rescue, auxiliary reference, log axis, descriptive-only, or cross-sectional time course. The personal published-figure catalog and reconstructed Gold briefs are better sources for those dimensions.

Cases classified `MATERIAL_CONTEXT_LOSS` should be excluded from a paper-context Graph Capability subset until reconstructed. `UNRESOLVABLE_FROM_SOURCE` cases may remain in numerical regression but cannot be promoted to context Gold.

## Repair recommendation

Do **not** rewrite the workbook or regenerate all 495 cases. The appropriate next step is a bounded, provenance-preserving realism layer:

1. Keep the existing synthetic/statistical benchmark version frozen for regression continuity.
2. Add a separate `context_fidelity` field and approved-use labels to a versioned safe manifest.
3. Reconstruct only cases selected for Graph Capability auditing, using paper/Methods/source-data evidence and explicit confidence.
4. Record factors, levels, X/series/facet roles, control/reference roles, primary contrast, unit hierarchy, and paper graph intent separately from generic synthetic labels.
5. Diversify templates within each family only when it changes a meaningful capability dimension.
6. Retain `ADEQUATE_FOR_STATISTICAL_BENCHMARK` cases as successes for their intended numerical purpose; do not mislabel them as failed cases.
7. Exclude Pool D from this work until an explicit future unsealing decision.

## Audit disposition

- Sampled n: **40**
- Safe universe from explicit non-Pool-D lists: **368**
- Paper-context Graph Gold candidates without reconstruction: **1 strong case (`LSA052`)**
- Generic Graph/statistical capability candidates with caveats: **18 cases listed above**
- Cases requiring reconstruction before graph-context use: **15 material-loss cases**
- Cases lacking enough safe Paper Reference evidence: **4**
- Benchmark-wide repair now: **not recommended**
- Targeted, versioned context reconstruction for selected Graph Capability cases: **recommended**

