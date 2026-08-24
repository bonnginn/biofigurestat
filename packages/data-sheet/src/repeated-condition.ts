import { z } from "zod";

import {
  EntityIdSchema,
  type ExperimentDesign,
  type Observation,
  type UnitInstance,
} from "@lsaa/domain";

import type { CanonicalSheetResult, SheetValidationIssue } from "./index";

export const REPEATED_CONDITION_DATA_SHEET_SCHEMA_VERSION = "0.3.0" as const;

const MeasurementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scalar"), value: z.number().finite().nullable() }),
  z
    .object({
      kind: z.literal("proportion"),
      numerator: z.number().int().nonnegative().nullable(),
      denominator: z.number().int().positive().nullable(),
    })
    .superRefine((value, ctx) => {
      if (
        value.numerator !== null &&
        value.denominator !== null &&
        value.numerator > value.denominator
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["numerator"],
          message: "Positive count cannot exceed total count",
        });
      }
    }),
]);

type DraftMeasurement = z.infer<typeof MeasurementSchema>;

const EntrySchema = z.object({
  id: EntityIdSchema,
  label: z.string().min(1),
  matchedUnitId: EntityIdSchema,
  experimentDate: z.iso.date(),
  measurement: MeasurementSchema,
  sourceLocation: z.string().min(1).optional(),
});

export const RepeatedConditionDataSheetSchema = z
  .object({
    schemaVersion: z.literal(REPEATED_CONDITION_DATA_SHEET_SCHEMA_VERSION),
    designId: EntityIdSchema,
    outcomeId: EntityIdSchema,
    experimentalUnitLevelId: EntityIdSchema,
    relationship: z.literal("matched"),
    conditions: z.array(z.object({ id: EntityIdSchema, label: z.string().min(1) })).min(3),
    columns: z
      .array(z.object({ conditionId: EntityIdSchema, entries: z.array(EntrySchema).min(2) }))
      .min(3),
  })
  .superRefine((sheet, ctx) => {
    if (sheet.columns.length !== sheet.conditions.length) {
      ctx.addIssue({
        code: "custom",
        path: ["columns"],
        message: "Every condition needs a column",
      });
      return;
    }
    const expectedUnits = sheet.columns[0].entries.map((entry) => entry.matchedUnitId);
    sheet.columns.forEach((column, columnIndex) => {
      if (column.conditionId !== sheet.conditions[columnIndex].id) {
        ctx.addIssue({
          code: "custom",
          path: ["columns", columnIndex, "conditionId"],
          message: "Column order must match condition order",
        });
      }
      const units = column.entries.map((entry) => entry.matchedUnitId);
      if (
        units.length !== expectedUnits.length ||
        units.some((unit, index) => unit !== expectedUnits[index])
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["columns", columnIndex, "entries"],
          message: "Every D04 column must use the same matched units in the same order",
        });
      }
    });
    if (new Set(expectedUnits).size !== expectedUnits.length) {
      ctx.addIssue({
        code: "custom",
        path: ["columns", 0, "entries"],
        message: "Matched unit IDs must be unique",
      });
    }
    const expectedDates = sheet.columns[0].entries.map((entry) => entry.experimentDate);
    sheet.columns.forEach((column, columnIndex) => {
      column.entries.forEach((entry, entryIndex) => {
        if (entry.experimentDate !== expectedDates[entryIndex]) {
          ctx.addIssue({
            code: "custom",
            path: ["columns", columnIndex, "entries", entryIndex, "experimentDate"],
            message: "The same matched unit must keep one experiment date across conditions",
          });
        }
      });
    });
  });

export type RepeatedConditionDataSheet = z.infer<typeof RepeatedConditionDataSheetSchema>;

function emptyMeasurement(
  outcomeType: ExperimentDesign["outcomes"][number]["type"],
): DraftMeasurement {
  if (outcomeType === "continuous") return { kind: "scalar", value: null };
  if (outcomeType === "percentage" || outcomeType === "proportion_counts") {
    return { kind: "proportion", numerator: null, denominator: null };
  }
  throw new Error(`Outcome type ${outcomeType} is not supported by the D04 data sheet`);
}

export function createRepeatedConditionDataSheet(
  design: ExperimentDesign,
  outcomeId: string,
  defaultExperimentDate: string = design.createdAt.slice(0, 10),
): RepeatedConditionDataSheet {
  if (design.conditions.length < 3 || design.pairing.kind === "independent") {
    throw new Error("The D04 data sheet requires three or more matched conditions");
  }
  const outcome = design.outcomes.find((candidate) => candidate.id === outcomeId);
  if (!outcome) throw new Error(`Unknown outcome ${outcomeId}`);
  const conditions = design.conditions.map(({ id, label }) => ({ id, label }));
  return RepeatedConditionDataSheetSchema.parse({
    schemaVersion: REPEATED_CONDITION_DATA_SHEET_SCHEMA_VERSION,
    designId: design.id,
    outcomeId,
    experimentalUnitLevelId: design.experimentalUnitLevelId,
    relationship: "matched",
    conditions,
    columns: conditions.map((condition) => ({
      conditionId: condition.id,
      entries: Array.from({ length: design.plannedN }, (_, index) => ({
        id: `entry.${condition.id}.${index + 1}`,
        label: `Matched unit ${index + 1}`,
        matchedUnitId: `unit.matched.${index + 1}`,
        experimentDate: defaultExperimentDate,
        measurement: emptyMeasurement(outcome.type),
      })),
    })),
  });
}

function issueFor(measurement: DraftMeasurement, path: string): SheetValidationIssue | null {
  if (measurement.kind === "scalar") {
    return measurement.value === null
      ? { code: "missing_value", path, message: "Enter a value for every matched unit" }
      : null;
  }
  return measurement.numerator === null || measurement.denominator === null
    ? { code: "incomplete_proportion", path, message: "Enter positive and total counts" }
    : null;
}

export function toCanonicalRepeatedConditionObservations(
  draft: RepeatedConditionDataSheet,
  rawRevisionId: string,
): CanonicalSheetResult {
  const sheet = RepeatedConditionDataSheetSchema.parse(draft);
  const issues: SheetValidationIssue[] = [];
  const unitInstances: UnitInstance[] = sheet.columns[0].entries.map((entry) => ({
    id: entry.matchedUnitId,
    levelId: sheet.experimentalUnitLevelId,
    parentUnitId: null,
    label: entry.label,
    metadata: {},
  }));
  const observations: Observation[] = [];
  sheet.columns.forEach((column) => {
    column.entries.forEach((entry) => {
      const issue = issueFor(entry.measurement, entry.id);
      if (issue) {
        issues.push(issue);
        return;
      }
      observations.push({
        id: `observation.${entry.id}`,
        rawRevisionId,
        unitInstanceId: entry.matchedUnitId,
        conditionId: column.conditionId,
        outcomeId: sheet.outcomeId,
        measurement:
          entry.measurement.kind === "scalar"
            ? { kind: "scalar", value: entry.measurement.value as number }
            : {
                kind: "proportion",
                numerator: entry.measurement.numerator as number,
                denominator: entry.measurement.denominator as number,
              },
        experimentDate: entry.experimentDate,
        ...(entry.sourceLocation ? { sourceLocation: entry.sourceLocation } : {}),
      });
    });
  });
  return issues.length
    ? { success: false, issues }
    : { success: true, observations, unitInstances };
}

export function rehydrateRepeatedConditionDataSheet(
  design: ExperimentDesign,
  outcomeId: string,
  rawRevisionId: string,
  unitInstances: ReadonlyArray<UnitInstance>,
  observations: ReadonlyArray<Observation>,
  fallbackExperimentDate: string = design.createdAt.slice(0, 10),
): RepeatedConditionDataSheet {
  if (design.conditions.length < 3 || design.pairing.kind === "independent") {
    throw new Error("Only matched D04 designs can use this editable data sheet");
  }
  const unitById = new Map(unitInstances.map((unit) => [unit.id, unit]));
  const selected = observations.filter(
    (observation) =>
      observation.rawRevisionId === rawRevisionId && observation.outcomeId === outcomeId,
  );
  const orderedUnitIds = [
    ...new Set(selected.map((observation) => observation.unitInstanceId)),
  ].sort();
  const conditions = design.conditions.map(({ id, label }) => ({ id, label }));
  return RepeatedConditionDataSheetSchema.parse({
    schemaVersion: REPEATED_CONDITION_DATA_SHEET_SCHEMA_VERSION,
    designId: design.id,
    outcomeId,
    experimentalUnitLevelId: design.experimentalUnitLevelId,
    relationship: "matched",
    conditions,
    columns: conditions.map((condition) => ({
      conditionId: condition.id,
      entries: orderedUnitIds.map((unitId, index) => {
        const unit = unitById.get(unitId);
        const observation = selected.find(
          (candidate) =>
            candidate.conditionId === condition.id && candidate.unitInstanceId === unitId,
        );
        if (!unit || !observation) throw new Error(`D04 matched unit ${unitId} is incomplete`);
        if (observation.measurement.kind === "loading_control_ratio") {
          throw new Error("Raw WB target/loading input is currently available for D01/D02 only");
        }
        if (observation.measurement.kind === "categorical_counts") {
          throw new Error("Categorical composition is edited in the experiment workspace");
        }
        if (observation.measurement.kind === "time_to_event") {
          throw new Error("Time-to-event data is edited in the survival workspace");
        }
        return {
          id: `entry.rehydrated.${condition.id}.${index + 1}`,
          label: unit.label,
          matchedUnitId: unitId,
          experimentDate: observation.experimentDate ?? fallbackExperimentDate,
          measurement:
            observation.measurement.kind === "scalar"
              ? { kind: "scalar" as const, value: observation.measurement.value }
              : {
                  kind: "proportion" as const,
                  numerator: observation.measurement.numerator,
                  denominator: observation.measurement.denominator,
                },
          ...(observation.sourceLocation ? { sourceLocation: observation.sourceLocation } : {}),
        };
      }),
    })),
  });
}
