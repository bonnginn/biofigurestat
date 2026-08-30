# Local workbook pattern audit

Updated: 2026-08-20

This audit used read-only local inspection of research-like Excel candidates. No workbook was edited,
copied into the repository, or sent to an external service. Demonstration data derived from this audit
must use fictitious labels and synthetic values.

## Repeated structures found

### Intervention families with multiple reagents

Published-paper and current screening workbooks repeatedly use a negative control plus sequence #1,
#2, and #3 for each target. The sequence is an intervention level nested scientifically within a
target family. Separate experimental dates/lots contain the biological repetitions.

Required app representation:

- factor: intervention reagent;
- scientific level group: control or target family;
- levels: individual control reagents and sequence #1/#2/#3;
- statistical `n`: independent experiment/dish, never the number of sequences;
- graph: adjacent member levels with a visible family label or bracket;
- default comparison plan: explicit control-versus-member comparisons with multiplicity control.

### Intervention × treatment

Workbooks include constructs or siRNA levels crossed with induction/treatment −/+. The same pattern
generalizes to drug −/+ for every control and sequence level.

Required app representation:

- factor A: intervention reagent, optionally grouped by control/target/construct family;
- factor B: treatment, commonly −/+;
- one complete Cartesian condition for each declared combination;
- interaction inspected before main effects;
- grouped dot plot with treatment encoded consistently within each intervention level.

### Rescue and epistasis

Workbooks contain control, knockdown, double-knockdown, and rescue combinations, sometimes repeated
for several constructs. These must remain explicit factor combinations rather than labels parsed from
a single condition-name string.

### Time course and count-derived percentage

Independent experiments store positive/total counts at multiple times and derive one percentage per
experiment and condition. Some sheets place experiment dates/lots in separate tabs and a summary tab
then calculates mean and SEM. The app must retain the date/lot as the biological replicate or block,
retain positive and total counts, and default new graphs to SD as requested.

### Image and WB transformations

Other workbooks calculate background-corrected intensity, target/loading-control ratios, and
control-equals-one values through visible formulas. The app must store source values and a versioned
transformation rather than importing only the final normalized column.

## Demonstration-template status

Implemented in the current MVP:

1. Fictitious control family versus one target family with three reagent levels. Each reagent remains a
   separate D03 condition; family labels are display metadata and never biological `n`.
2. Intervention family/reagent × treatment −/+ as a complete D05 factorial design, including the
   frequently used four-level control/siRNA-series × drug −/+ example.

High-priority extension after workflow review:

3. Two control reagents and two target families, each with three reagent levels. The present arbitrary
   D03/D05 level and group model can represent this, but a dedicated one-click example is not yet added.
4. Independent-experiment time course using positive/total counts.

Later:

5. Construct family × siRNA level × induction −/+ (design capture first; advanced model later).
