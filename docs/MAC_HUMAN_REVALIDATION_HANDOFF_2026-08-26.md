# macOS Human Revalidation Handoff

Date: 2026-08-26

Validated commit: `4b37908039abea5f33f780c2537340beefaa94be`

Branch: `codex/personal-figure-round5-graph-semantics`

Native artifact: macOS Apple Silicon `.app`, adaptive input enabled

Overall judgment: **ADAPTIVE INPUT IMPLEMENTED WITH BOUNDED UX GAPS**

## Purpose

This document hands the latest macOS native human-validation results back to the Windows development environment. It records observed behavior rather than requesting reinterpretation of unsupported designs. Do not overwrite earlier validation evidence.

## Build and automated verification

- `pnpm install --frozen-lockfile`: passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: 63 files / 445 tests passed when Node 26 was run with a valid `--localstorage-file` option.
- `pnpm engine:build:mac`: passed; D01, D02, D03, D04, D05, D09, D11, and D17 sidecar smoke checks passed.
- `VITE_EXPERIMENT_FIRST_ADAPTIVE_INPUT=1 pnpm tauri:build`: passed.
- `pnpm native:verify:mac`: passed, including `.lsa` file association and bundled engine checks.
- Code signing: ad-hoc signature; not notarized.

The initial plain `pnpm test` invocation failed because Node 26 exposed an unavailable built-in `localStorage`. The same code passed all tests with:

```bash
NODE_OPTIONS=--localstorage-file=/private/tmp/lsaa-vitest-localstorage.json pnpm test
```

This was treated as a test-runtime compatibility issue, not an application regression.

## Native validation summary

| Area | Result | Notes |
|---|---|---|
| Help panel | PASS | The Help panel opened and closed normally. The previous unclosable overlay was not reproduced. |
| Adaptive input entry | UX GAP | The entry control remains visually greyed out even though it is clickable. |
| Generate input surface | UX GAP | `入力面を作る` also appears disabled/grey after required fields are complete, but clicking it advances. |
| Case 1: independent three-group experiment | PASS WITH UX GAPS | Import, graph, statistics, all-comparison annotation, native save, and reopen succeeded. |
| Case 2 | NOT REPEATED | Previous human result retained; latest automated regression tests passed. |
| Case 3 | NOT REPEATED | Previous human result retained; latest automated regression tests passed. |
| Case 4 | NOT REPEATED | Previous human result retained; latest automated regression tests passed. |
| Case 5: survival/time-to-event | PASS WITH UX GAPS | Event/censoring import, Kaplan–Meier, log-rank, Methods, and native save succeeded. |

## Case 1 details

### Structure

- Experiment: independent drug experiment.
- Biological unit: culture run.
- Stable identity: `RunID`.
- Factor: `Treatment`.
- Levels: `Vehicle`, `Drug A`, `Drug B`.
- Readout: scalar `Signal`.
- Imported observations: 12, four per condition.
- Selected adaptive surface: `factor_observation_table`.

### Confirmed behavior

- Three factor levels were preserved.
- The graph and statistical workflow were reachable.
- An action to add all statistical comparisons to the graph annotation was available.
- Native `.lsa` save completed.
- Reopen preserved data, groups, graph, statistics, and annotations.

### Remaining UX gaps

1. **Enabled controls look disabled.** Both the Adaptive entry control and `入力面を作る` remained grey even while clickable.
2. **Correction requires excessive backtracking.** A typo in `Vehicle` could not be corrected at the generated input-surface stage. The researcher had to return to the first questionnaire and repeat too many operations. The generated surface should allow editing the relevant factor/level definition while preserving the pasted table, or provide a direct return to the specific design field.
3. **Post-hoc discoverability remains weak.** The all-comparisons annotation action is an improvement, but its location and consequence are not self-explanatory. The preferred default remains: show the complete adjusted post-hoc comparison set first, then allow individual comparisons to be hidden with checkboxes.

## Case 5 details

### Structure

- Experiment: animal survival.
- Biological unit: mouse.
- Stable identity: `MouseID`.
- Factor: `Treatment`.
- Levels: `Vehicle`, `Treatment`.
- Readout representation: follow-up/event.
- Imported observations: 12 mice.
- Each group: `n=6`, `event=4`, `censored=2`.
- Selected adaptive surface: `typed_record_table` followed by the dedicated survival route.

### Confirmed behavior

- Event and censored records were retained and were not converted to missing values.
- Kaplan–Meier curves rendered for both groups.
- Censor marks rendered.
- Number-at-risk table rendered.
- Log-rank analysis completed:
  - chi-square = `0.972266122684548`
  - df = `1`
  - p = `0.32411566401784075`
- Methods text correctly summarized the design, biological n, event/censor counts, log-rank result, engine version, and package versions.
- Native project save succeeded.

### Remaining UX and presentation gaps

1. **Survival is not yet fully integrated into the common workspace.** A top-level specialized-analysis selector now exists, which is an improvement, but survival still uses a dedicated page rather than the common `File / Data / Graph / Statistics` interaction model. Preserve the dedicated event/censoring data contract while integrating the GUI.
2. **Raw statistical precision is excessive.** The visible Statistics line currently resembles:

   ```text
   log-rank chi_square=0.972266122684548, p=0.32411566401784075
   ```

   A researcher-facing default should be closer to `log-rank: χ²(1)=0.972, p=0.324`, while retaining full precision in the stored result contract/export.
3. **No obvious graph annotation control for the log-rank result.** Provide an option to place the formatted log-rank result on the graph without recomputing it.
4. **Y-axis numeric tick labels were absent in the reviewed graph.** The axis title was present, but readable probability ticks should also be shown.
5. **Language and visual consistency remain incomplete.** The survival screen mixes English and Japanese and does not yet match the common workspace's publication-oriented controls.

## Priority for the next Windows implementation round

### P1: misleading control states

- Make enabled Adaptive controls look enabled.
- Keep truly disabled controls visibly distinct.
- Show required-field omissions adjacent to the missing fields and explain why progression is blocked.
- Add regression tests for both semantic `disabled` state and visible enabled styling.

### P1: local correction without restart

- Allow factor names and levels to be corrected from the generated input-surface/confirmation stage.
- Preserve already pasted text while returning to edit design fields.
- Avoid forcing a complete restart for a spelling correction.

### P1: survival workspace integration

- Preserve the dedicated time-to-event observation model and D11 execution contract.
- Integrate Data, Graph, Statistics, File, save, and reopen interactions with the common workspace shell.
- Do not convert survival observations into ordinary continuous outcomes.

### P2: statistical presentation

- Format researcher-facing test statistics and p-values to conventional precision while retaining raw precision internally.
- Add graph annotation selection for log-rank results.
- Display readable Y-axis probability ticks.
- Improve post-hoc all-comparison discoverability and use an opt-out comparison list after the complete adjusted set is shown.

## Required non-regression behavior

- Do not regress the now-working Help close behavior.
- Do not regress Case 1 native save/reopen of data, graph, statistics, or annotations.
- Do not reinterpret nested observations as biological n.
- Do not convert censored survival observations to missing data.
- Do not sacrifice full-precision persisted results merely to improve display formatting.
- Keep current workflows available while Adaptive input remains feature-flagged.

## Recommended decision

Proceed with a bounded Windows UX-hardening round. The adaptive architecture and native persistence path are usable enough for continued validation, but misleading control styling and the survival workspace split should be corrected before broader researcher testing.
