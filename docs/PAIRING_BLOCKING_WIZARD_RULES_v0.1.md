# Pairing and Blocking Wizard Rules v0.1

Status: architecture/statistical decision for Wizard design.

## Purpose

Researchers should not need to know whether their design is called paired, matched, repeated-measures, blocked, or unpaired before entering data. The application must ask about what was physically done, infer the design deterministically, and present the inferred correspondence for confirmation.

The statistical distinction is not limited to measuring the same mouse twice. A laboratory experiment can sometimes be blocked by run when every run contains control and treated preparations handled in parallel. However, ordinary cell-culture comparisons performed in distinct dishes commonly use an independent-group analysis. The application must not infer pairing merely because dishes share a cell line, date, passage, or experimental run.

## UI simplicity rule

The internal model may retain detailed block and nesting information, but the ordinary Wizard must not expose a long statistical questionnaire.

Ask at most these two initial questions:

1. **Was the same biological unit itself measured in both conditions?** Examples: the same mouse before/after, the same donor sample split and measured under both conditions, or the same tracked cell measured twice.
2. **If not, were these separate units, such as different dishes or different animals, assigned to different conditions?**

Default routing:

- same biological unit measured across both conditions -> D02;
- separate dishes/animals/samples assigned to different conditions -> D01;
- explicit run/batch matching, repeated structure, or ambiguity -> show one optional `Advanced: account for matching or batch` branch.

Do not place experimental-run blocking on the normal path unless the user has declared it in the design or the imported data already contain block IDs.

## Canonical concepts

- **Experimental unit:** the smallest unit that could independently receive a condition under the actual protocol.
- **Independent experimental run:** an independently repeated preparation/transfection/experiment, commonly performed on another day, passage, thaw, or batch as defined by the protocol.
- **Block/matched set:** a run, donor, animal, litter, blot, plate, or other design-defined set that contains corresponding observations from multiple conditions.
- **Subsample:** a dish, well, field, cell, lane, or technical measurement that does not add an independent realization of the treatment effect under the declared design.
- **Pair ID / block ID:** the stable identifier linking condition-specific values that belong to the same matched set.

## Questions shown to the user

Do not begin with “Is this paired?”. In the ordinary flow use the two questions above. The following detailed questions are internal decision fields or Advanced follow-up questions, shown only when needed.

1. **What counts as one independent repeat of this experiment?**
   - Examples: one independently repeated transfection, one animal, one donor, one independently prepared culture.
2. **Within each independent repeat, were all comparison conditions prepared and measured together?**
   - Example: on each experimental day, cells from one common preparation were divided into control-siRNA and target-siRNA dishes and processed in parallel.
3. **Can a value in one condition be linked to exactly one value in the other condition by experiment/run/animal/donor?**
4. **Do you have one summarized value per condition in each matched set, or several dishes/wells/fields/cells?**
5. **If there are several lower-level observations, what created them and at what level was treatment independently applied?**
6. **Were some conditions performed in different runs or batches without a corresponding value in the other condition?**
7. **Are missing condition values possible within a matched set?**

The confirmation screen must show an example mapping such as:

```text
Independent repeat / block: experiment day

Experiment 1 -> Control dish summary <-> siRNA dish summary
Experiment 2 -> Control dish summary <-> siRNA dish summary
Experiment 3 -> Control dish summary <-> siRNA dish summary

Statistical n = 3 independent matched experiments
Cells/fields/dishes inside a block are not automatically additional n.
Recommended design: D02, matched by experiment.
```

## Deterministic routing rules

### Route to D02: same unit or explicitly matched conditions

Use D02 when all of the following are true:

- there are exactly two comparison conditions;
- the correspondence was created by the experimental design, not chosen after seeing results;
- each analysis value has a declared pair/block ID;
- each pair/block represents an independent experimental repeat or other independent matched unit;
- one condition-specific analysis value can be obtained for each side of the pair, either directly or through a declared within-block summary;
- the scientific estimand is the typical within-block difference or, for a separately validated workflow, within-block ratio.

Clear ordinary examples are the same mouse before/after, the same donor represented in both conditions, or the same tracked biological unit measured twice.

An experimental-run block can also produce a matched analysis, but only through the explicit Advanced path: on each of four independent experiment days, a common RPE1 preparation is split into control-siRNA and target-siRNA dishes, processed together, summarized once per condition, and deliberately analyzed with experiment day as the block. Parallel handling alone does not trigger this route.

### Route to D01: two independent groups

Use D01 when any of the following describes the intended comparison:

- control and treated experimental units come from unrelated runs with no one-to-one correspondence;
- separate dishes were assigned to control and siRNA/treatment conditions in an ordinary cell-culture group comparison and no explicit block model was requested;
- one group was collected in a different series of batches and no design-defined match exists;
- the apparent matching is only that all samples use the same cell line, reagent, instrument, or calendar date;
- values cannot be assigned a meaningful pair/block ID without looking at their outcomes;
- the scientific estimand is the difference between two independent populations of experimental units.

### Route to D10 or a hierarchical/block model

Do not force either D01 or D02 directly onto lower-level observations when:

- several dishes exist per condition within one run;
- many fields or cells are measured per dish;
- technical replicate lanes or repeated measurements occur within a sample;
- the design is unbalanced or a matched condition is missing;
- multiple sources of blocking exist.

For the first safe implementation, preserve all raw lower-level observations and derive one declared summary per biological repeat and condition before routing those summaries to D01/D02. Later validated modules may use a hierarchical or mixed model without collapsing the data.

### More than two conditions or factors

- three or more independent conditions -> D03;
- three or more matched conditions -> D04;
- two independent factors -> D05;
- two factors with matching, repeated measures, or blocking -> D06.

## RPE1 siRNA example

“Same RPE1 cell line, same day, different dishes” routes to D01 in the ordinary simplified workflow. Date, passage, and experimental run remain stored as metadata so a block-aware analysis can be selected later without losing information.

Optional Advanced D02/block interpretation:

- each independent run starts from a common cell preparation;
- that preparation is divided into control-siRNA and target-siRNA dishes;
- both conditions are transfected, cultured, collected, blotted, and quantified in parallel;
- the entire process is repeated independently on several occasions;
- the result table has one value per condition per independent run.

Default D01 interpretation:

- control and target-siRNA treatments were applied to distinct dishes;
- the intended question is a comparison of treatment groups rather than within-run differences;
- no pre-specified block analysis was declared;
- shared cell line, date, passage, or protocol is recorded as metadata but does not automatically create pairs.

Not enough independent replication:

- several dishes or many cells were measured during one single experimental run, but the entire treatment comparison was not independently repeated. The application must report the independent run count and must not silently convert the dish/cell count into biological `n`.

## Missing and ambiguous cases

- A matched analysis must not silently drop an unmatched value. Show which block is incomplete and how the selected module handles it.
- If the user cannot identify the experimental unit or block ID, do not guess D01/D02. Show the inferred structure as unresolved and request clarification.
- Do not decide pairing from a correlation test or from which option produces a smaller p-value. The design determines matching before outcome inspection.

## Provenance requirements

Persist:

- the user's answers to the concrete design questions;
- the inferred experimental-unit level;
- pair/block level and IDs;
- subsample levels;
- the rule/version that mapped the design to D01/D02/D10;
- the user confirmation or any override with reason and timestamp.

## Acceptance tests

At minimum, add fixtures for:

1. same mouse before/after -> D02;
2. independent mice in two treatment groups -> D01;
3. ordinary RPE1 control/siRNA in separate dishes, even when handled in parallel -> D01 with run metadata;
4. RPE1 control/siRNA with an explicitly declared complete run block -> Advanced D02/block path;
5. multiple fields/cells per dish and multiple dishes per run -> D10/summarize then D01 or D02;
6. one single run with many cells -> insufficient biological replication warning;
7. three matched conditions -> D04;
8. genotype x treatment with run blocking -> D06.
