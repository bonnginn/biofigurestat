# Post-Benchmark Synthesis → Alpha Gap Closure

Baseline: `1d243171193d228c5fe9bbaa8179a60b2251b54c`

This checkpoint synthesizes expanded-literature Rounds 1–3 and the sealed Pool C validation. It does not open Pool D and does not start a fourth product-development round on the benchmark.

## Evidence synthesis

- Round 1: 89 cases; 61 completed and 28 explicit unsupported.
- Round 2: 88 cases; 75 completed and 13 explicit unsupported.
- Round 3: 88 cases; 65 completed and 23 explicit unsupported.
- Pool C validation: 88 cases; 87 completed and one explicit unsupported.
- The sole recurring Pool C failure was LSA135: the benchmark safe loader refused a complete two-readout dataset even though the product data model, manual entry, graph selection, save/open, and provenance layers already supported linked readouts.
- Pool C completed all six cases requiring multiple comparisons, with no graph/statistics annotation mismatch. Publication grid defaults were already off.
- Historical Round 1–3 failure labels are not treated as a current gap list when later generic fixes and Pool C validation superseded them.

## Clustered findings and priorities

### P0 — scientific correctness and benchmark representability

1. **Linked multi-readout safe loading.** Permit complete continuous readout sets while preserving biological-unit identity, readout identity, row provenance, and biological n. Reject incomplete, duplicate, mixed-shape, or target-label-ambiguous input.

### P1 — functional capability and researcher workflow

2. **Statistics → Graph annotation continuity.** The renderer already used the authoritative saved analysis result and adjusted p-values, but the separated Graph workspace did not expose annotation selection. Expose add/change/remove controls in Graph without recalculation.
3. **Statistics result hierarchy.** Keep primary n, estimates, and omnibus/main result immediately visible; separate adjusted pairwise comparisons; place diagnostics and reproducibility detail behind explicit, accessible disclosure.
4. **Confirmation fatigue.** Retain the experimental-unit confirmation for safe value-only reruns with an identical structural fingerprint. Clear it when pairing, identity, subset, method, or other scientific structure changes.

### P1 — UX, terminology, and migration cost

5. **Home information architecture.** Home had ten route cards while copy said six, and it violated the four-route workspace contract. Keep Favorites, New, Recent, and Open on Home; place specialist data families under New Experiment. Normalize prominent mixed-language labels and compact the narrow top bar.

### P2

- Extract one shared rendering core for creation preview and final graph editor. Current preview is intentionally simplified and the final/export renderer is authoritative; replacing it safely is larger than this transition checkpoint.
- General arbitrary group-by/visual-encoding controls beyond the current design-derived condition/time semantics. Existing legend entries are synchronized with rendered series, so this is flexibility rather than a demonstrated correctness defect.
- Broader Japanese terminology and commercial-grade responsive sweep beyond the prominent entry labels corrected here.

### Later

- Rare specialist analysis families not represented by the current validated pool.
- Native-platform interaction polish after Web Alpha validation.

## Selected Alpha gap-closure clusters

This checkpoint implements the four coherent P0/P1 groups above: safe linked-readout loading; Statistics/Graph result continuity and hierarchy; structurally scoped confirmation reuse; and entry/navigation cleanup. It does not add new numerical methods or alter product scientific calculations.

## Alpha-readiness result

### Fixed

- Complete linked continuous readout sets now load with stable biological-unit mapping even when row order differs between readouts. Readout labels, observation provenance, and biological n remain separate. Incomplete, duplicate, mixed proportion/readout, or target-mismatched structures fail closed.
- The expanded code-only preflight recognizes this safe linked-readout contract. The real LSA135 runtime fixture is now classified `compatible / linked_nested_continuous`, with five biological units rather than ten readout rows.
- Graph editing exposes statistical annotation controls only when a saved authoritative analysis exists. Comparison and exact-p/symbol/hidden display can change without engine execution.
- Statistics results show n, estimates, and main/omnibus tests first; named adjusted pairwise comparisons are a distinct section; diagnostics and reproducibility details remain available through keyboard/click-accessible disclosure.
- Experimental-unit confirmation survives a value-only automatic rerun with the same structural fingerprint. A structural or method change clears it.
- Home again contains exactly the four project-level routes. Specialist data families are discoverable under New Experiment, prominent mixed-language route labels were normalized, and the narrow top bar uses compact accessible navigation labels.

### Remaining

- **P0:** none found in the audited common workflow.
- **P1:** none that requires another benchmark-driven product round before personal validation.
- **P2:** shared preview/final rendering-core extraction; arbitrary group-by/visual-encoding controls beyond design-derived condition/time semantics; broader terminology and responsive-polish sweep.
- **Later:** native-platform-specific UX and rare specialist analysis families.

### Scientific status

- Numerical engines, statistical recommendation logic, and graph numerical rendering were not changed.
- Common pairing, nesting, repeated identity, multiple-comparison, adjusted-p, and provenance paths remain green in regression.
- Unsupported or ambiguous linked-readout structures fail explicitly instead of coercing units, readouts, or technical replicates.

### Graph status

- Saved analysis is the single source of truth for graph annotation; Graph does not recalculate statistics.
- Pair identity and adjusted p-values remain linked to the selected authoritative test, including Holm paired/Wilcoxon families.
- Rendered series and legend semantics remain synchronized in current design-derived grouping, and publication grid defaults remain off.
- Creation preview remains a simplified orientation view; the final/export renderer is authoritative. Shared renderer extraction remains P2.

### UX status

- The major entry-point overload, result-hierarchy problem, annotation discoverability gap, and value-edit confirmation repetition are closed.
- The audited Web screens showed no new overlap or clipping at the review viewport; narrow navigation now collapses text visually while retaining accessible names.
- A broader Japanese copy and native-layout sweep remains suitable for Alpha feedback rather than a blocker.

### Validation

- UI: 53 files / 384 tests passed; final Graph-focused rerun: 39/39.
- Other TypeScript packages: 32 files / 130 tests passed.
- Python statistical engine: 56/56 tests passed.
- Frozen-15 preflight: PASS.
- Expanded preflight tests, including real LSA135 complete/incomplete contracts: 2/2 PASS.
- Typecheck, lint, changed-file format check, Python compile, production Web build, and diff whitespace check: PASS.
- Browser audit: Home four-route contract and New Experiment specialist routes verified on the running Web app.
- Pool D was not opened; no 495-case or Round 4 run was started.

## Recommendation

`READY FOR PERSONAL WORKFLOW VALIDATION`

The next step is validation against the user's own published-paper workflows, followed by final Web Alpha UX adjustment and then macOS/Windows native smoke. Pool D remains sealed.
