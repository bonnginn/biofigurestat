import { z } from "zod";

import {
  EntityIdSchema,
  type ExperimentDesign,
  type Observation,
  type UnitInstance,
} from "@lsaa/domain";

import type { CanonicalSheetResult, SheetValidationIssue } from "./index";

export const MULTI_CONDITION_DATA_SHEET_SCHEMA_VERSION = "0.2.0" as const;

const MultiScalarDraftSchema = z.object({
  kind: z.literal("scalar"),
  value: z.number().finite().nullable(),
});

const MultiProportionDraftSchema = z
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
  });

const MultiDraftMeasurementSchema = z.discriminatedUnion("kind", [
  MultiScalarDraftSchema,
  MultiProportionDraftSchema,
]);

type MultiDraftMeasurement = z.infer<typeof MultiDraftMeasurementSchema>;

const MultiConditionSchema = z.object({
  id: EntityIdSchema,
  label: z.string().min(1),
});

const MultiEntrySchema = z.object({
  id: EntityIdSchema,
  label: z.string().min(1),
  experimentalUnitId: EntityIdSchema,
  experimentDate: z.iso.date(),
  measurement: MultiDraftMeasurementSchema,
  sourceLocation: z.string().min(1).optional(),
});

export const IndependentMultiConditionDataSheetSchema = z
  .object({
    schemaVersion: z.literal(MULTI_CONDITION_DATA_SHEET_SCHEMA_VERSION),
    designId: EntityIdSchema,
    outcomeId: EntityIdSchema,
    experimentalUnitLevelId: EntityIdSchema,
    relationship: z.literal("independent"),
    conditions: z.array(MultiConditionSchema).min(3),
    columns: z
      .array(
        z.object({
          conditionId: EntityIdSchema,
          entries: z.array(MultiEntrySchema).min(1),
        }),
      )
      .min(3),
  })
  .superRefine((sheet, ctx) => {
    if (sheet.columns.length !== sheet.conditions.length) {
      ctx.addIssue({
        code: "custom",
        path: ["columns"],
        message: "Every multi-group condition requires exactly one data column",
      });
      return;
    }
    sheet.columns.forEach((column, index) => {
      if (column.conditionId !== sheet.conditions[index].id) {
        ctx.addIssue({
          code: "custom",
          path: ["columns", index, "conditionId"],
          message: "Multi-group column order must match the declared condition order",
        });
      }
    });
  });

export type IndependentMultiConditionDataSheet = z.infer<
  typeof IndependentMultiConditionDataSheetSchema
>;

function emptyMeasurement(
  outcomeType: ExperimentDesign["outcomes"][number]["type"],
): MultiDraftMeasurement {
  if (outcomeType === "continuous") return { kind: "scalar", value: null };
  if (outcomeType === "percentage" || outcomeType === "proportion_counts") {
    return { kind: "proportion", numerator: null, denominator: null };
  }
  throw new Error(`Outcome type ${outcomeType} is not supported by the D03 data sheet`);
}

export function createIndependentMultiConditionDataSheet(
  design: ExperimentDesign,
  outcomeId: string,
  defaultExperimentDate: string = design.createdAt.slice(0, 10),
): IndependentMultiConditionDataSheet {
  if (design.conditions.length < 3 || design.pairing.kind !== "independent") {
    throw new Error("The D03 data sheet requires three or more independent conditions");
  }
  const outcome = design.outcomes.find((candidate) => candidate.id === outcomeId);
  if (!outcome) throw new Error(`Unknown outcome ${outcomeId}`);
  const conditions = design.conditions.map(({ id, label }) => ({ id, label }));
  return IndependentMultiConditionDataSheetSchema.parse({
    schemaVersion: MULTI_CONDITION_DATA_SHEET_SCHEMA_VERSION,
    designId: design.id,
    outcomeId,
    experimentalUnitLevelId: design.experimentalUnitLevelId,
    relationship: "independent",
    conditions,
    columns: conditions.map((condition) => ({
      conditionId: condition.id,
      entries: Array.from({ length: design.plannedN }, (_, index) => ({
        id: `entry.${condition.id}.${index + 1}`,
        label: `Biological replicate ${index + 1}`,
        experimentalUnitId: `unit.${condition.id}.${index + 1}`,
        experimentDate: defaultExperimentDate,
        measurement: emptyMeasurement(outcome.type),
      })),
    })),
  });
}

function measurementIssue(
  measurement: MultiDraftMeasurement,
  path: string,
): SheetValidationIssue | null {
  if (measurement.kind === "scalar") {
    return measurement.value === null
      ? { code: "missing_value", path, message: "Enter a value for every biological unit" }
      : null;
  }
  return measurement.numerator === null || measurement.denominator === null
    ? {
        code: "incomplete_proportion",
        path,
        message: "Enter positive and total counts for every biological replicate",
      }
    : null;
}

export function toCanonicalMultiConditionObservations(
  draft: IndependentMultiConditionDataSheet,
  rawRevisionId: string,
): CanonicalSheetResult {
  const sheet = IndependentMultiConditionDataSheetSchema.parse(draft);
  const issues: SheetValidationIssue[] = [];
  const observations: Observation[] = [];
  const unitInstances: UnitInstance[] = [];
  const seenUnits = new Set<string>();

  sheet.columns.forEach((column) => {
    column.entries.forEach((entry) => {
      const issue = measurementIssue(entry.measurement, entry.id);
      if (issue) {
        issues.push(issue);
        return;
      }
      if (seenUnits.has(entry.experimentalUnitId)) {
        throw new Error("Independent multi-group entries must use distinct experimental units");
      }
      seenUnits.add(entry.experimentalUnitId);
      unitInstances.push({
        id: entry.experimentalUnitId,
        levelId: sheet.experimentalUnitLevelId,
        parentUnitId: null,
        label: entry.label,
        metadata: {},
      });
      observations.push({
        id: `observation.${entry.id}`,
        rawRevisionId,
        unitInstanceId: entry.experimentalUnitId,
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

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, observations, unitInstances };
}

export function rehydrateIndependentMultiConditionDataSheet(
  design: ExperimentDesign,
  outcomeId: string,
  rawRevisionId: string,
  unitInstances: ReadonlyArray<UnitInstance>,
  observations: ReadonlyArray<Observation>,
  fallbackExperimentDate: string = design.createdAt.slice(0, 10),
): IndependentMultiConditionDataSheet {
  if (design.conditions.length < 3 || design.pairing.kind !== "independent") {
    throw new Error("Only independent D03 designs can use this editable data sheet");
  }
  const unitById = new Map(unitInstances.map((unit) => [unit.id, unit]));
  const selected = observations.filter(
    (observation) =>
      observation.rawRevisionId === rawRevisionId && observation.outcomeId === outcomeId,
  );
  const conditions = design.conditions.map(({ id, label }) => ({ id, label }));
  const columns = conditions.map((condition) => ({
    conditionId: condition.id,
    entries: selected
      .filter((observation) => observation.conditionId === condition.id)
      .map((observation, index) => {
        const unit = unitById.get(observation.unitInstanceId);
        if (
          !unit ||
          unit.levelId !== design.experimentalUnitLevelId ||
          unit.parentUnitId !== null
        ) {
          throw new Error(`Observation ${observation.id} is not an independent experimental unit`);
        }
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
          experimentalUnitId: unit.id,
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
  }));
  if (columns.some((column) => column.entries.length === 0)) {
    throw new Error("Every D03 condition must contain at least one observation");
  }
  return IndependentMultiConditionDataSheetSchema.parse({
    schemaVersion: MULTI_CONDITION_DATA_SHEET_SCHEMA_VERSION,
    designId: design.id,
    outcomeId,
    experimentalUnitLevelId: design.experimentalUnitLevelId,
    relationship: "independent",
    conditions,
    columns,
  });
}
