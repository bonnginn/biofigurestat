import { z } from "zod";

export * from "./matrix";
export * from "./survival";
export * from "./common-methods";
import {
  EntityIdSchema,
  type ExperimentDesign,
  type Observation,
  type UnitInstance,
} from "@lsaa/domain";

export * from "./clipboard";
export * from "./multi-condition";
export * from "./repeated-condition";
export * from "./nested-summary";
export * from "./loading-control-normalization";
export * from "./time-series-metrics";
export * from "./adaptive-observation-views";
export * from "./adaptive-spreadsheet-view-model";

export const DATA_SHEET_SCHEMA_VERSION = "0.1.0" as const;

const ScalarDraftSchema = z.object({
  kind: z.literal("scalar"),
  value: z.number().finite().nullable(),
});

const ProportionDraftSchema = z
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

const LoadingControlRatioDraftSchema = z.object({
  kind: z.literal("loading_control_ratio"),
  target: z.number().finite().nullable(),
  loadingControl: z.number().finite().nullable(),
});

export const DraftMeasurementSchema = z.discriminatedUnion("kind", [
  ScalarDraftSchema,
  ProportionDraftSchema,
  LoadingControlRatioDraftSchema,
]);

const ConditionSchema = z.object({
  id: EntityIdSchema,
  label: z.string().min(1),
});

const ExperimentDateSchema = z.iso.date();

const IndependentEntrySchema = z.object({
  id: EntityIdSchema,
  label: z.string().min(1),
  experimentalUnitId: EntityIdSchema,
  experimentDate: ExperimentDateSchema,
  measurement: DraftMeasurementSchema,
  sourceLocation: z.string().min(1).optional(),
});

const ConditionValueSchema = z.object({
  conditionId: EntityIdSchema,
  experimentalUnitId: EntityIdSchema,
  measurement: DraftMeasurementSchema,
  sourceLocation: z.string().min(1).optional(),
});

const CommonSheetFields = {
  schemaVersion: z.literal(DATA_SHEET_SCHEMA_VERSION),
  designId: EntityIdSchema,
  outcomeId: EntityIdSchema,
  experimentalUnitLevelId: EntityIdSchema,
  conditions: z.tuple([ConditionSchema, ConditionSchema]),
};

const IndependentSheetSchema = z.object({
  ...CommonSheetFields,
  relationship: z.literal("independent"),
  columns: z.tuple([
    z.object({ conditionId: EntityIdSchema, entries: z.array(IndependentEntrySchema).min(1) }),
    z.object({ conditionId: EntityIdSchema, entries: z.array(IndependentEntrySchema).min(1) }),
  ]),
});

const MatchedSheetSchema = z.object({
  ...CommonSheetFields,
  relationship: z.literal("matched"),
  rows: z.array(
    z.object({
      id: EntityIdSchema,
      label: z.string().min(1),
      experimentalUnitId: EntityIdSchema,
      experimentDate: ExperimentDateSchema,
      values: z.tuple([ConditionValueSchema, ConditionValueSchema]),
    }),
  ),
});

const BlockedSheetSchema = z.object({
  ...CommonSheetFields,
  relationship: z.literal("blocked"),
  blockLevelId: EntityIdSchema,
  rows: z.array(
    z.object({
      id: EntityIdSchema,
      label: z.string().min(1),
      blockId: EntityIdSchema,
      experimentDate: ExperimentDateSchema,
      values: z.tuple([ConditionValueSchema, ConditionValueSchema]),
    }),
  ),
});

export const TwoConditionDataSheetSchema = z
  .discriminatedUnion("relationship", [
    IndependentSheetSchema,
    MatchedSheetSchema,
    BlockedSheetSchema,
  ])
  .superRefine((sheet, ctx) => {
    const expected = sheet.conditions.map((condition) => condition.id);
    const actual =
      sheet.relationship === "independent"
        ? sheet.columns.map((column) => column.conditionId)
        : sheet.rows.flatMap((row) => row.values.map((value) => value.conditionId));

    if (sheet.relationship === "independent") {
      actual.forEach((conditionId, index) => {
        if (conditionId !== expected[index]) {
          ctx.addIssue({
            code: "custom",
            path: ["columns", index, "conditionId"],
            message: "Sheet column condition does not match the declared condition order",
          });
        }
      });
      return;
    }

    sheet.rows.forEach((row, rowIndex) => {
      row.values.forEach((value, valueIndex) => {
        if (value.conditionId !== expected[valueIndex]) {
          ctx.addIssue({
            code: "custom",
            path: ["rows", rowIndex, "values", valueIndex, "conditionId"],
            message: "Sheet value condition does not match the declared condition order",
          });
        }
        if (
          sheet.relationship === "matched" &&
          "experimentalUnitId" in row &&
          value.experimentalUnitId !== row.experimentalUnitId
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["rows", rowIndex, "values", valueIndex, "experimentalUnitId"],
            message: "Matched values must reference the same biological unit",
          });
        }
      });
    });
  });

export type DraftMeasurement = z.infer<typeof DraftMeasurementSchema>;
export type TwoConditionDataSheet = z.infer<typeof TwoConditionDataSheetSchema>;

export type SheetValidationIssue = {
  code: "missing_value" | "incomplete_proportion" | "invalid_loading_control_ratio";
  path: string;
  message: string;
};

export type CanonicalSheetResult =
  | { success: true; observations: Observation[]; unitInstances: UnitInstance[] }
  | { success: false; issues: SheetValidationIssue[] };

function emptyMeasurement(
  outcomeType: ExperimentDesign["outcomes"][number]["type"],
  measurementMode: "scalar" | "loading_control_ratio" = "scalar",
): DraftMeasurement {
  if (outcomeType === "continuous") {
    return measurementMode === "loading_control_ratio"
      ? { kind: "loading_control_ratio", target: null, loadingControl: null }
      : { kind: "scalar", value: null };
  }
  if (outcomeType === "percentage" || outcomeType === "proportion_counts") {
    return { kind: "proportion", numerator: null, denominator: null };
  }
  throw new Error(`Outcome type ${outcomeType} is not supported by the first Core data sheet`);
}

export function createTwoConditionDataSheet(
  design: ExperimentDesign,
  outcomeId: string,
  measurementMode: "scalar" | "loading_control_ratio" = "scalar",
  defaultExperimentDate: string = design.createdAt.slice(0, 10),
): TwoConditionDataSheet {
  if (design.conditions.length !== 2) {
    throw new Error("The first Core data sheet requires exactly two conditions");
  }

  const outcome = design.outcomes.find((candidate) => candidate.id === outcomeId);
  if (!outcome) throw new Error(`Unknown outcome ${outcomeId}`);

  const conditions = design.conditions.map(({ id, label }) => ({ id, label })) as [
    { id: string; label: string },
    { id: string; label: string },
  ];
  const measurement = () => emptyMeasurement(outcome.type, measurementMode);

  if (design.pairing.kind === "independent") {
    return TwoConditionDataSheetSchema.parse({
      schemaVersion: DATA_SHEET_SCHEMA_VERSION,
      designId: design.id,
      outcomeId,
      experimentalUnitLevelId: design.experimentalUnitLevelId,
      conditions,
      relationship: "independent",
      columns: conditions.map((condition) => ({
        conditionId: condition.id,
        entries: Array.from({ length: design.plannedN }, (_, index) => ({
          id: `entry.${condition.id}.${index + 1}`,
          label: `Biological replicate ${index + 1}`,
          experimentalUnitId: `unit.${condition.id}.${index + 1}`,
          experimentDate: defaultExperimentDate,
          measurement: measurement(),
        })),
      })),
    });
  }

  if (design.pairing.kind === "matched") {
    return TwoConditionDataSheetSchema.parse({
      schemaVersion: DATA_SHEET_SCHEMA_VERSION,
      designId: design.id,
      outcomeId,
      experimentalUnitLevelId: design.experimentalUnitLevelId,
      conditions,
      relationship: "matched",
      rows: Array.from({ length: design.plannedN }, (_, index) => {
        const unitId = `unit.matched.${index + 1}`;
        return {
          id: `pair.${index + 1}`,
          label: `Matched unit ${index + 1}`,
          experimentalUnitId: unitId,
          experimentDate: defaultExperimentDate,
          values: conditions.map((condition) => ({
            conditionId: condition.id,
            experimentalUnitId: unitId,
            measurement: measurement(),
          })),
        };
      }),
    });
  }

  return TwoConditionDataSheetSchema.parse({
    schemaVersion: DATA_SHEET_SCHEMA_VERSION,
    designId: design.id,
    outcomeId,
    experimentalUnitLevelId: design.experimentalUnitLevelId,
    conditions,
    relationship: "blocked",
    blockLevelId: design.pairing.blockLevelId,
    rows: Array.from({ length: design.plannedN }, (_, index) => {
      const blockId = `block.${index + 1}`;
      return {
        id: `block-row.${index + 1}`,
        label: `Independent run / batch ${index + 1}`,
        blockId,
        experimentDate: defaultExperimentDate,
        values: conditions.map((condition) => ({
          conditionId: condition.id,
          experimentalUnitId: `unit.${condition.id}.block.${index + 1}`,
          measurement: measurement(),
        })),
      };
    }),
  });
}

function draftMeasurement(observation: Observation): DraftMeasurement {
  if (observation.measurement.kind === "scalar") {
    return { kind: "scalar", value: observation.measurement.value };
  }
  if (observation.measurement.kind === "proportion") {
    return {
      kind: "proportion",
      numerator: observation.measurement.numerator,
      denominator: observation.measurement.denominator,
    };
  }
  if (observation.measurement.kind === "categorical_counts") {
    throw new Error("Categorical composition is edited in the experiment workspace");
  }
  if (observation.measurement.kind === "time_to_event") {
    throw new Error("Time-to-event data is edited in the survival workspace");
  }
  return {
    kind: "loading_control_ratio",
    target: observation.measurement.target,
    loadingControl: observation.measurement.loadingControl,
  };
}

/**
 * Reconstructs an editable, design-aware sheet from one immutable raw revision.
 * Pairing and blocking are taken only from the persisted design; malformed or
 * incomplete canonical data is rejected instead of being silently reclassified.
 */
export function rehydrateTwoConditionDataSheet(
  design: ExperimentDesign,
  outcomeId: string,
  rawRevisionId: string,
  unitInstances: ReadonlyArray<UnitInstance>,
  observations: ReadonlyArray<Observation>,
  fallbackExperimentDate: string = design.createdAt.slice(0, 10),
): TwoConditionDataSheet {
  if (design.conditions.length !== 2) {
    throw new Error("The editable Core data sheet requires exactly two conditions");
  }
  if (!design.outcomes.some((outcome) => outcome.id === outcomeId)) {
    throw new Error(`Unknown outcome ${outcomeId}`);
  }

  const conditions = design.conditions.map(({ id, label }) => ({ id, label })) as [
    { id: string; label: string },
    { id: string; label: string },
  ];
  const conditionIds = new Set(conditions.map(({ id }) => id));
  const units = new Map(unitInstances.map((unit) => [unit.id, unit]));
  const selected = observations.filter(
    (observation) =>
      observation.rawRevisionId === rawRevisionId && observation.outcomeId === outcomeId,
  );
  if (selected.length === 0) {
    throw new Error("The active raw revision has no observations for the selected outcome");
  }
  selected.forEach((observation) => {
    if (!conditionIds.has(observation.conditionId)) {
      throw new Error(`Observation ${observation.id} references an unexpected condition`);
    }
    const unit = units.get(observation.unitInstanceId);
    if (!unit) throw new Error(`Observation ${observation.id} references an unknown unit`);
    if (unit.levelId !== design.experimentalUnitLevelId) {
      throw new Error(`Observation ${observation.id} is not attached to the experimental unit`);
    }
  });

  const common = {
    schemaVersion: DATA_SHEET_SCHEMA_VERSION,
    designId: design.id,
    outcomeId,
    experimentalUnitLevelId: design.experimentalUnitLevelId,
    conditions,
  } as const;

  if (design.pairing.kind === "independent") {
    const columns = conditions.map((condition) => ({
      conditionId: condition.id,
      entries: selected
        .filter((observation) => observation.conditionId === condition.id)
        .map((observation, index) => {
          const unit = units.get(observation.unitInstanceId)!;
          if (unit.parentUnitId !== null) {
            throw new Error(`Independent unit ${unit.id} unexpectedly belongs to a block`);
          }
          return {
            id: `entry.rehydrated.${condition.id}.${index + 1}`,
            label: unit.label,
            experimentalUnitId: unit.id,
            experimentDate: observation.experimentDate ?? fallbackExperimentDate,
            measurement: draftMeasurement(observation),
            ...(observation.sourceLocation ? { sourceLocation: observation.sourceLocation } : {}),
          };
        }),
    })) as [
      { conditionId: string; entries: Array<z.infer<typeof IndependentEntrySchema>> },
      { conditionId: string; entries: Array<z.infer<typeof IndependentEntrySchema>> },
    ];
    if (columns.some((column) => column.entries.length === 0)) {
      throw new Error("Both independent conditions must contain at least one observation");
    }
    return TwoConditionDataSheetSchema.parse({ ...common, relationship: "independent", columns });
  }

  if (design.pairing.kind === "matched") {
    const byUnit = new Map<string, Observation[]>();
    selected.forEach((observation) =>
      byUnit.set(observation.unitInstanceId, [
        ...(byUnit.get(observation.unitInstanceId) ?? []),
        observation,
      ]),
    );
    const rows = [...byUnit].map(([unitId, unitObservations], index) => {
      const unit = units.get(unitId)!;
      if (unit.parentUnitId !== null) {
        throw new Error(`Matched unit ${unit.id} unexpectedly belongs to a block`);
      }
      const values = conditions.map((condition) => {
        const matches = unitObservations.filter(
          (observation) => observation.conditionId === condition.id,
        );
        if (matches.length !== 1) {
          throw new Error(`Matched unit ${unitId} must have exactly one value per condition`);
        }
        return {
          conditionId: condition.id,
          experimentalUnitId: unitId,
          measurement: draftMeasurement(matches[0]),
          ...(matches[0].sourceLocation ? { sourceLocation: matches[0].sourceLocation } : {}),
        };
      }) as [z.infer<typeof ConditionValueSchema>, z.infer<typeof ConditionValueSchema>];
      return {
        id: `pair.rehydrated.${index + 1}`,
        label: unit.label,
        experimentalUnitId: unitId,
        experimentDate: unitObservations[0]?.experimentDate ?? fallbackExperimentDate,
        values,
      };
    });
    return TwoConditionDataSheetSchema.parse({ ...common, relationship: "matched", rows });
  }

  const blockLevelId = design.pairing.blockLevelId;
  const byBlock = new Map<string, Observation[]>();
  selected.forEach((observation) => {
    const unit = units.get(observation.unitInstanceId)!;
    if (!unit.parentUnitId) {
      throw new Error(`Blocked unit ${unit.id} has no parent block`);
    }
    const block = units.get(unit.parentUnitId);
    if (!block || block.levelId !== blockLevelId) {
      throw new Error(`Blocked unit ${unit.id} references an invalid parent block`);
    }
    byBlock.set(block.id, [...(byBlock.get(block.id) ?? []), observation]);
  });
  const rows = [...byBlock].map(([blockId, blockObservations], index) => {
    const values = conditions.map((condition) => {
      const matches = blockObservations.filter(
        (observation) => observation.conditionId === condition.id,
      );
      if (matches.length !== 1) {
        throw new Error(`Block ${blockId} must have exactly one value per condition`);
      }
      return {
        conditionId: condition.id,
        experimentalUnitId: matches[0].unitInstanceId,
        measurement: draftMeasurement(matches[0]),
        ...(matches[0].sourceLocation ? { sourceLocation: matches[0].sourceLocation } : {}),
      };
    }) as [z.infer<typeof ConditionValueSchema>, z.infer<typeof ConditionValueSchema>];
    return {
      id: `block-row.rehydrated.${index + 1}`,
      label: units.get(blockId)!.label,
      blockId,
      experimentDate: blockObservations[0]?.experimentDate ?? fallbackExperimentDate,
      values,
    };
  });
  return TwoConditionDataSheetSchema.parse({
    ...common,
    relationship: "blocked",
    blockLevelId,
    rows,
  });
}

function measurementIssue(
  measurement: DraftMeasurement,
  path: string,
): SheetValidationIssue | null {
  if (measurement.kind === "scalar") {
    return measurement.value === null
      ? { code: "missing_value", path, message: "Enter a value for every biological unit" }
      : null;
  }
  if (measurement.kind === "loading_control_ratio") {
    if (
      measurement.target === null ||
      measurement.loadingControl === null ||
      measurement.target < 0 ||
      measurement.loadingControl <= 0
    ) {
      return {
        code: "invalid_loading_control_ratio",
        path,
        message:
          "Enter a non-negative target intensity and a loading-control intensity greater than zero",
      };
    }
    return null;
  }
  if (measurement.numerator === null || measurement.denominator === null) {
    return {
      code: "incomplete_proportion",
      path,
      message: "Enter both positive and total cell counts for every biological replicate",
    };
  }
  return null;
}

export function toCanonicalObservations(
  draft: TwoConditionDataSheet,
  rawRevisionId: string,
): CanonicalSheetResult {
  const sheet = TwoConditionDataSheetSchema.parse(draft);
  const issues: SheetValidationIssue[] = [];
  const observations: Observation[] = [];
  const units = new Map<string, UnitInstance>();

  const addObservation = (
    conditionId: string,
    experimentalUnitId: string,
    experimentalUnitLabel: string,
    measurement: DraftMeasurement,
    observationId: string,
    parentUnitId: string | null,
    experimentDate: string,
    sourceLocation?: string,
  ) => {
    const issue = measurementIssue(measurement, observationId);
    if (issue) {
      issues.push(issue);
      return;
    }
    units.set(experimentalUnitId, {
      id: experimentalUnitId,
      levelId: sheet.experimentalUnitLevelId,
      parentUnitId,
      label: experimentalUnitLabel,
      metadata: {},
    });
    observations.push({
      id: observationId,
      rawRevisionId,
      unitInstanceId: experimentalUnitId,
      conditionId,
      outcomeId: sheet.outcomeId,
      measurement:
        measurement.kind === "scalar"
          ? { kind: "scalar", value: measurement.value as number }
          : measurement.kind === "proportion"
            ? {
                kind: "proportion",
                numerator: measurement.numerator as number,
                denominator: measurement.denominator as number,
              }
            : {
                kind: "loading_control_ratio",
                target: measurement.target as number,
                loadingControl: measurement.loadingControl as number,
                transformationVersion: "0.1.0" as const,
              },
      experimentDate,
      ...(sourceLocation ? { sourceLocation } : {}),
    });
  };

  if (sheet.relationship === "independent") {
    sheet.columns.forEach((column) =>
      column.entries.forEach((entry) =>
        addObservation(
          column.conditionId,
          entry.experimentalUnitId,
          entry.label,
          entry.measurement,
          `observation.${entry.id}`,
          null,
          entry.experimentDate,
          entry.sourceLocation,
        ),
      ),
    );
  } else if (sheet.relationship === "matched") {
    sheet.rows.forEach((row) => {
      row.values.forEach((value) =>
        addObservation(
          value.conditionId,
          value.experimentalUnitId,
          row.label,
          value.measurement,
          `observation.${row.id}.${value.conditionId}`,
          null,
          row.experimentDate,
          value.sourceLocation,
        ),
      );
    });
  } else {
    sheet.rows.forEach((row) => {
      units.set(row.blockId, {
        id: row.blockId,
        levelId: sheet.blockLevelId,
        parentUnitId: null,
        label: row.label,
        metadata: {},
      });
      row.values.forEach((value) =>
        addObservation(
          value.conditionId,
          value.experimentalUnitId,
          value.experimentalUnitId,
          value.measurement,
          `observation.${row.id}.${value.conditionId}`,
          row.blockId,
          row.experimentDate,
          value.sourceLocation,
        ),
      );
    });
  }

  if (issues.length > 0) return { success: false, issues };
  return { success: true, observations, unitInstances: [...units.values()] };
}
