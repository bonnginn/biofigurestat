import { z } from "zod";

import {
  AdaptiveColumnMappingSchema,
  CanonicalAdaptiveObservationSchema,
  StructureContractSchema,
} from "./adaptive-input";

export const EXPERIMENT_CANVAS_SCHEMA_VERSION = "0.1.0" as const;
export const OBSERVATION_PATTERN_SET_SCHEMA_VERSION = "0.1.0" as const;
export const PROGRESSIVE_ENTRY_SNAPSHOT_SCHEMA_VERSION = "0.1.0" as const;

const SemanticKeySchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

const ReadoutRepresentationSchema = z.enum([
  "scalar",
  "proportion_counts",
  "category_counts",
  "target_reference",
  "paired_readouts",
  "event_censoring",
  "dose_response",
  "other_typed_bundle",
]);

const ScalarRecordValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const CanvasValueGroupSchema = z.object({
  key: SemanticKeySchema,
  label: z.string().min(1),
});

const CanvasValueSchema = z.object({
  key: SemanticKeySchema,
  label: z.string().min(1),
  parentValueKey: SemanticKeySchema.nullable().default(null),
  groupKey: SemanticKeySchema.nullable().default(null),
});

const CanvasDimensionSchema = z.object({
  key: SemanticKeySchema,
  label: z.string().min(1),
  kind: z.enum(["intervention", "inherent_property", "ordered_quantity"]),
  groups: z.array(CanvasValueGroupSchema).default([]),
  values: z.array(CanvasValueSchema).min(1),
});

export const CanvasConditionStatusSchema = z.enum([
  "performed",
  "not_performed",
  "unknown",
]);

const CanvasConditionCellSchema = z.object({
  conditionCellId: SemanticKeySchema,
  values: z.record(SemanticKeySchema, SemanticKeySchema),
  status: CanvasConditionStatusSchema,
});

const CanvasReadoutSchema = z.object({
  key: SemanticKeySchema,
  label: z.string().min(1),
  representation: ReadoutRepresentationSchema,
  componentKeys: z.array(SemanticKeySchema).min(1),
});

function addDuplicateIssue(
  values: readonly string[],
  path: PropertyKey[],
  label: string,
  ctx: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: "custom", path, message: `${label} must be unique` });
  }
}

function canvasSignature(
  dimensionKeys: readonly string[],
  values: Readonly<Record<string, string>>,
): string {
  return dimensionKeys.map((key) => `${key}=${values[key] ?? ""}`).join("|");
}

export const ExperimentCanvasSchema = z
  .object({
    schemaVersion: z.literal(EXPERIMENT_CANVAS_SCHEMA_VERSION),
    canvasId: SemanticKeySchema,
    experimentLabel: z.string().min(1),
    dimensions: z.array(CanvasDimensionSchema),
    conditionCells: z.array(CanvasConditionCellSchema).min(1),
    readouts: z.array(CanvasReadoutSchema).min(1),
  })
  .superRefine((canvas, ctx) => {
    addDuplicateIssue(
      canvas.dimensions.map(({ key }) => key),
      ["dimensions"],
      "Canvas dimension keys",
      ctx,
    );
    addDuplicateIssue(
      canvas.conditionCells.map(({ conditionCellId }) => conditionCellId),
      ["conditionCells"],
      "Canvas condition-cell IDs",
      ctx,
    );
    addDuplicateIssue(
      canvas.readouts.map(({ key }) => key),
      ["readouts"],
      "Canvas readout keys",
      ctx,
    );

    const dimensionKeys = canvas.dimensions.map(({ key }) => key);
    const dimensions = new Map(canvas.dimensions.map((dimension) => [dimension.key, dimension]));
    canvas.dimensions.forEach((dimension, dimensionIndex) => {
      addDuplicateIssue(
        dimension.groups.map(({ key }) => key),
        ["dimensions", dimensionIndex, "groups"],
        "Canvas value-group keys",
        ctx,
      );
      addDuplicateIssue(
        dimension.values.map(({ key }) => key),
        ["dimensions", dimensionIndex, "values"],
        "Canvas value keys",
        ctx,
      );
      const values = new Set(dimension.values.map(({ key }) => key));
      const groups = new Set(dimension.groups.map(({ key }) => key));
      dimension.values.forEach((value, valueIndex) => {
        if (value.parentValueKey && !values.has(value.parentValueKey)) {
          ctx.addIssue({
            code: "custom",
            path: ["dimensions", dimensionIndex, "values", valueIndex, "parentValueKey"],
            message: "Canvas value references an unknown parent value",
          });
        }
        if (value.groupKey && !groups.has(value.groupKey)) {
          ctx.addIssue({
            code: "custom",
            path: ["dimensions", dimensionIndex, "values", valueIndex, "groupKey"],
            message: "Canvas value references an unknown non-selectable group",
          });
        }
        if (value.parentValueKey && value.groupKey) {
          ctx.addIssue({
            code: "custom",
            path: ["dimensions", dimensionIndex, "values", valueIndex],
            message: "A Canvas value cannot be both nested below a value and grouped for display",
          });
        }
      });
    });

    const signatures = new Set<string>();
    canvas.conditionCells.forEach((cell, cellIndex) => {
      const suppliedKeys = Object.keys(cell.values);
      if (
        suppliedKeys.length !== dimensionKeys.length ||
        dimensionKeys.some((key) => !(key in cell.values))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["conditionCells", cellIndex, "values"],
          message: "A condition cell must identify one value for every Canvas dimension",
        });
        return;
      }
      Object.entries(cell.values).forEach(([dimensionKey, valueKey]) => {
        const dimension = dimensions.get(dimensionKey);
        if (!dimension || !dimension.values.some(({ key }) => key === valueKey)) {
          ctx.addIssue({
            code: "custom",
            path: ["conditionCells", cellIndex, "values", dimensionKey],
            message: "A condition cell references an unknown Canvas value",
          });
        }
      });
      const signature = canvasSignature(dimensionKeys, cell.values);
      if (signatures.has(signature)) {
        ctx.addIssue({
          code: "custom",
          path: ["conditionCells", cellIndex],
          message: "Condition combinations must be unique",
        });
      }
      signatures.add(signature);
    });
  });

const PlannedMultiplicitySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("one") }),
  z.object({ mode: z.literal("fixed_plan"), count: z.number().int().positive() }),
  z.object({ mode: z.literal("variable"), suggestedCount: z.number().int().positive().nullable() }),
  z.object({ mode: z.literal("from_input") }),
  z.object({ mode: z.literal("unknown") }),
]);

const ObservationLevelSchema = z.object({
  key: SemanticKeySchema,
  label: z.string().min(1),
  kind: z.enum([
    "biological_or_experimental_entity",
    "material_source",
    "treatment_container",
    "observed_entity",
    "sampling_location",
    "technical_record",
    "event_record",
    "unclassified",
  ]),
  parentKey: SemanticKeySchema.nullable(),
  plannedMultiplicity: PlannedMultiplicitySchema,
});

const ObservationIdentitySchema = z.object({
  key: SemanticKeySchema,
  label: z.string().min(1),
  levelKey: SemanticKeySchema,
  uniquenessScopeLevelKey: SemanticKeySchema.nullable(),
  purpose: z.enum(["instance_key", "scientific_linkage", "both"]),
  availability: z.enum([
    "available",
    "to_be_collected",
    "recoverable",
    "unknown",
    "irrecoverable",
  ]),
  origin: z.enum([
    "researcher_supplied",
    "instrument_supplied",
    "external_link_table",
    "app_assigned_before_entry",
    "app_row_surrogate",
  ]),
});

const ObservationAxisSchema = z.object({
  key: SemanticKeySchema,
  label: z.string().min(1),
  unit: z.string().nullable(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("canvas_dimension"), dimensionKey: SemanticKeySchema }),
    z.object({ kind: z.literal("within_condition_record") }),
  ]),
  kind: z.enum([
    "ordered_quantity",
    "event_follow_up",
    "spatial_coordinate",
    "acquisition_channel",
    "nominal_coordinate",
  ]),
  ordering: z.enum(["ordered", "nominal"]),
  valuePlan: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("fixed_global"),
      values: z.array(z.union([z.string(), z.number()])).min(1),
    }),
    z.object({
      mode: z.literal("per_identity"),
      suggestedValues: z.array(z.union([z.string(), z.number()])),
    }),
    z.object({ mode: z.literal("open_numeric") }),
    z.object({ mode: z.literal("from_input") }),
  ]),
});

const AxisIdentityBehaviorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("same_entity"),
    retainedLevelKey: SemanticKeySchema,
    identityKey: SemanticKeySchema,
  }),
  z.object({
    kind: z.literal("distinct_entity_each_value"),
    variedLevelKey: SemanticKeySchema,
    sharedParentLevelKey: SemanticKeySchema.nullable(),
  }),
  z.object({
    kind: z.literal("coordinate_within_entity"),
    retainedLevelKey: SemanticKeySchema,
    identityKey: SemanticKeySchema,
  }),
  z.object({
    kind: z.literal("event_subject"),
    subjectLevelKey: SemanticKeySchema,
    identityKey: SemanticKeySchema,
  }),
  z.object({ kind: z.literal("not_identity_bearing") }),
  z.object({ kind: z.literal("unknown"), candidateLevelKey: SemanticKeySchema.nullable() }),
  z.object({
    kind: z.literal("irrecoverable"),
    intendedBehavior: z
      .enum(["same_entity", "coordinate_within_entity", "event_subject"])
      .nullable(),
  }),
]);

const ObservationRecordSetSchema = z.object({
  key: SemanticKeySchema,
  label: z.string().min(1),
  observedLevelKey: SemanticKeySchema,
  axisUses: z.array(
    z.object({
      axisKey: SemanticKeySchema,
      identityBehavior: AxisIdentityBehaviorSchema,
      materialContinuity: z.enum([
        "same_material",
        "new_material_each_value",
        "not_applicable",
        "unknown",
      ]),
    }),
  ),
  coordinatePlan: z.enum([
    "cartesian_plan",
    "sparse_explicit",
    "per_identity_schedule",
    "unknown",
  ]),
  recordGrain: z.string().min(1),
  entryAlignment: z.object({
    mode: z.enum([
      "separate_lists",
      "shared_linkage",
      "same_entity",
      "mixed",
      "crossover",
      "unknown",
    ]),
    identityKey: SemanticKeySchema.nullable(),
    completeSets: z.boolean().nullable(),
  }),
});

const ReadoutConditionBindingSchema = z.object({
  readoutKey: SemanticKeySchema,
  conditionCellId: SemanticKeySchema,
  componentKeys: z.array(SemanticKeySchema).min(1),
  status: z.enum(["measured", "not_measured", "unknown"]),
  recordSetKey: SemanticKeySchema.nullable(),
});

function levelIsSameOrAncestor(
  levels: ReadonlyMap<string, { key: string; parentKey: string | null }>,
  ancestorKey: string,
  levelKey: string,
): boolean {
  let cursor = levels.get(levelKey);
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor.key)) {
    if (cursor.key === ancestorKey) return true;
    visited.add(cursor.key);
    cursor = cursor.parentKey ? levels.get(cursor.parentKey) : undefined;
  }
  return false;
}

export const ObservationPatternSetSchema = z
  .object({
    schemaVersion: z.literal(OBSERVATION_PATTERN_SET_SCHEMA_VERSION),
    patternSetId: SemanticKeySchema,
    canvasId: SemanticKeySchema,
    levels: z.array(ObservationLevelSchema).min(1),
    identities: z.array(ObservationIdentitySchema),
    axes: z.array(ObservationAxisSchema),
    recordSets: z.array(ObservationRecordSetSchema).min(1),
    readoutBindings: z.array(ReadoutConditionBindingSchema).min(1),
  })
  .superRefine((pattern, ctx) => {
    addDuplicateIssue(
      pattern.levels.map(({ key }) => key),
      ["levels"],
      "Observation-level keys",
      ctx,
    );
    addDuplicateIssue(
      pattern.identities.map(({ key }) => key),
      ["identities"],
      "Observation-identity keys",
      ctx,
    );
    addDuplicateIssue(
      pattern.axes.map(({ key }) => key),
      ["axes"],
      "Observation-axis keys",
      ctx,
    );
    addDuplicateIssue(
      pattern.recordSets.map(({ key }) => key),
      ["recordSets"],
      "Observation record-set keys",
      ctx,
    );

    const levels = new Map(pattern.levels.map((level) => [level.key, level]));
    const identities = new Map(pattern.identities.map((identity) => [identity.key, identity]));
    const axes = new Map(pattern.axes.map((axis) => [axis.key, axis]));
    const recordSets = new Map(pattern.recordSets.map((set) => [set.key, set]));
    pattern.levels.forEach((level, index) => {
      if (level.parentKey && !levels.has(level.parentKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["levels", index, "parentKey"],
          message: "Observation level references an unknown parent",
        });
      }
      const visited = new Set<string>();
      let cursor: typeof level | undefined = level;
      while (cursor) {
        if (visited.has(cursor.key)) {
          ctx.addIssue({
            code: "custom",
            path: ["levels", index],
            message: "Observation hierarchy contains a cycle",
          });
          break;
        }
        visited.add(cursor.key);
        cursor = cursor.parentKey ? levels.get(cursor.parentKey) : undefined;
      }
    });
    pattern.identities.forEach((identity, index) => {
      if (!levels.has(identity.levelKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["identities", index, "levelKey"],
          message: "Identity references an unknown observation level",
        });
      }
      if (identity.uniquenessScopeLevelKey && !levels.has(identity.uniquenessScopeLevelKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["identities", index, "uniquenessScopeLevelKey"],
          message: "Identity uniqueness scope is unknown",
        });
      }
      if (identity.origin === "app_row_surrogate" && identity.purpose !== "instance_key") {
        ctx.addIssue({
          code: "custom",
          path: ["identities", index],
          message: "An app row surrogate cannot establish scientific linkage",
        });
      }
    });
    pattern.axes.forEach((axis, index) => {
      if (axis.ordering === "nominal" && axis.kind === "ordered_quantity") {
        ctx.addIssue({
          code: "custom",
          path: ["axes", index, "ordering"],
          message: "An ordered quantity cannot be nominal",
        });
      }
    });
    pattern.recordSets.forEach((recordSet, recordSetIndex) => {
      if (!levels.has(recordSet.observedLevelKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["recordSets", recordSetIndex, "observedLevelKey"],
          message: "Record set references an unknown observed level",
        });
      }
      addDuplicateIssue(
        recordSet.axisUses.map(({ axisKey }) => axisKey),
        ["recordSets", recordSetIndex, "axisUses"],
        "Axis uses within a record set",
        ctx,
      );
      recordSet.axisUses.forEach((use, useIndex) => {
        if (!axes.has(use.axisKey)) {
          ctx.addIssue({
            code: "custom",
            path: ["recordSets", recordSetIndex, "axisUses", useIndex, "axisKey"],
            message: "Record set references an unknown axis",
          });
        }
        const behavior = use.identityBehavior;
        if (
          behavior.kind === "same_entity" ||
          behavior.kind === "coordinate_within_entity"
        ) {
          const identity = identities.get(behavior.identityKey);
          if (
            !identity ||
            !["scientific_linkage", "both"].includes(identity.purpose) ||
            identity.origin === "app_row_surrogate"
          ) {
            ctx.addIssue({
              code: "custom",
              path: ["recordSets", recordSetIndex, "axisUses", useIndex, "identityBehavior"],
              message: "Retained-entity axis behavior requires a scientific linkage identity",
            });
          }
          if (
            !levelIsSameOrAncestor(levels, behavior.retainedLevelKey, recordSet.observedLevelKey)
          ) {
            ctx.addIssue({
              code: "custom",
              path: ["recordSets", recordSetIndex, "axisUses", useIndex],
              message: "Retained axis level must contain the record grain",
            });
          }
        }
        if (behavior.kind === "event_subject") {
          const identity = identities.get(behavior.identityKey);
          if (
            !identity ||
            !["scientific_linkage", "both"].includes(identity.purpose) ||
            identity.origin === "app_row_surrogate"
          ) {
            ctx.addIssue({
              code: "custom",
              path: ["recordSets", recordSetIndex, "axisUses", useIndex, "identityBehavior"],
              message: "Event-subject behavior requires a scientific linkage identity",
            });
          }
        }
      });
      const alignment = recordSet.entryAlignment;
      if (alignment.mode === "separate_lists" && alignment.identityKey !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["recordSets", recordSetIndex, "entryAlignment"],
          message: "Separate lists cannot imply a hidden matching identity",
        });
      }
      if (!["separate_lists", "unknown"].includes(alignment.mode)) {
        const identity = alignment.identityKey ? identities.get(alignment.identityKey) : null;
        if (
          !identity ||
          !["scientific_linkage", "both"].includes(identity.purpose) ||
          identity.origin === "app_row_surrogate"
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["recordSets", recordSetIndex, "entryAlignment", "identityKey"],
            message: "Aligned records require a scientific linkage identity",
          });
        }
      }
    });
    addDuplicateIssue(
      pattern.readoutBindings.map(
        ({ readoutKey, conditionCellId }) => `${readoutKey}|${conditionCellId}`,
      ),
      ["readoutBindings"],
      "Readout/condition bindings",
      ctx,
    );
    pattern.readoutBindings.forEach((binding, index) => {
      if (binding.status === "measured" && !binding.recordSetKey) {
        ctx.addIssue({
          code: "custom",
          path: ["readoutBindings", index, "recordSetKey"],
          message: "A measured binding requires a record set",
        });
      }
      if (binding.status !== "measured" && binding.recordSetKey !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["readoutBindings", index, "recordSetKey"],
          message: "An unmeasured or unknown binding cannot reference a record set",
        });
      }
      if (binding.recordSetKey && !recordSets.has(binding.recordSetKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["readoutBindings", index, "recordSetKey"],
          message: "Readout binding references an unknown record set",
        });
      }
    });
  });

export const ProgressiveRawLineageSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  sourceKind: z.enum(["direct_entry", "clipboard", "csv", "tsv", "generic_file"]),
  sourceLabel: z.string().min(1),
  capturedAt: z.string().datetime(),
  rawText: z.string().nullable(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  transformations: z.array(z.string()),
});

export const StagedObservationRecordSchema = z.object({
  recordId: SemanticKeySchema,
  conditionCellId: SemanticKeySchema,
  recordSetKey: SemanticKeySchema.nullable(),
  observation: CanonicalAdaptiveObservationSchema,
  mappingState: z.enum(["mapped", "pending_mapping"]),
  eligibility: z.enum(["active", "excluded_condition_or_binding", "pending_mapping"]),
});

export const ProgressiveReadinessStatusSchema = z.enum([
  "READY",
  "NEED_MORE_INFORMATION",
  "SAFE_UNSUPPORTED",
]);
export const CapabilityReadinessSchema = z.object({
  status: ProgressiveReadinessStatusSchema,
  reasons: z.array(z.string().min(1)),
});

export const ScopedStructureContractSchema = z.object({
  scopeId: SemanticKeySchema,
  conditionCellIds: z.array(SemanticKeySchema).min(1),
  contract: StructureContractSchema,
});

export const ProgressiveProvenanceEventSchema = z.object({
  eventId: SemanticKeySchema,
  occurredAt: z.string().datetime(),
  actor: z.enum(["researcher", "application", "import_adapter"]),
  kind: z.enum([
    "canvas_created",
    "canvas_revised",
    "pattern_confirmed",
    "raw_staged",
    "mapping_revised",
    "contract_completed",
    "scope_completed",
    "safe_stop_recorded",
  ]),
  details: z.record(z.string(), ScalarRecordValueSchema),
});

/**
 * Domain authority for staged experiment-first entry. Versioned project
 * persistence and an isolated known-sparse Alpha input slice use this schema;
 * routing it into the default/general production workflow remains a separate
 * migration gate. A complete StructureContract is optional by design; the
 * Canvas and Pattern remain authoritative while it is unresolved.
 */
const ProgressiveEntrySnapshotBaseSchema = z.object({
  schemaVersion: z.literal(PROGRESSIVE_ENTRY_SNAPSHOT_SCHEMA_VERSION),
  snapshotId: SemanticKeySchema,
  projectId: SemanticKeySchema,
  savedAt: z.string().datetime(),
  canvas: ExperimentCanvasSchema,
  activePattern: ObservationPatternSetSchema.nullable(),
  pendingPattern: ObservationPatternSetSchema.nullable(),
  mapping: AdaptiveColumnMappingSchema.nullable(),
  rawLineage: ProgressiveRawLineageSchema.nullable(),
  stagedRecords: z.array(StagedObservationRecordSchema),
  fullContract: StructureContractSchema.nullable(),
  scopedContracts: z.array(ScopedStructureContractSchema),
  readiness: z.object({
    dataRetention: CapabilityReadinessSchema,
    adaptiveInput: CapabilityReadinessSchema,
    graph: CapabilityReadinessSchema,
    statistics: CapabilityReadinessSchema,
  }),
  provenance: z.array(ProgressiveProvenanceEventSchema),
});

export type ExperimentCanvas = z.infer<typeof ExperimentCanvasSchema>;
export type ObservationPatternSet = z.infer<typeof ObservationPatternSetSchema>;
export type ProgressiveRawLineage = z.infer<typeof ProgressiveRawLineageSchema>;
export type StagedObservationRecord = z.infer<typeof StagedObservationRecordSchema>;
export type CapabilityReadiness = z.infer<typeof CapabilityReadinessSchema>;
export type ScopedStructureContract = z.infer<typeof ScopedStructureContractSchema>;
export type ProgressiveProvenanceEvent = z.infer<typeof ProgressiveProvenanceEventSchema>;
export type ProgressiveEntrySnapshot = z.infer<typeof ProgressiveEntrySnapshotBaseSchema>;

function expectedCanvasBindingPairs(canvas: ExperimentCanvas): Set<string> {
  return new Set(
    canvas.readouts.flatMap((readout) =>
      canvas.conditionCells.map((cell) => `${readout.key}|${cell.conditionCellId}`),
    ),
  );
}

function validatePatternAgainstCanvas(
  pattern: ObservationPatternSet,
  canvas: ExperimentCanvas,
  ctx: z.RefinementCtx,
  path: PropertyKey[],
): void {
  if (pattern.canvasId !== canvas.canvasId) {
    ctx.addIssue({ code: "custom", path, message: "Observation pattern references another Canvas" });
    return;
  }
  const expectedPairs = expectedCanvasBindingPairs(canvas);
  const suppliedPairs = new Set(
    pattern.readoutBindings.map(
      ({ readoutKey, conditionCellId }) => `${readoutKey}|${conditionCellId}`,
    ),
  );
  if (
    suppliedPairs.size !== expectedPairs.size ||
    [...expectedPairs].some((pair) => !suppliedPairs.has(pair))
  ) {
    ctx.addIssue({
      code: "custom",
      path: [...path, "readoutBindings"],
      message: "Every Canvas readout/condition pair requires one explicit binding",
    });
  }
  const cells = new Map(canvas.conditionCells.map((cell) => [cell.conditionCellId, cell]));
  const readouts = new Map(canvas.readouts.map((readout) => [readout.key, readout]));
  pattern.readoutBindings.forEach((binding, index) => {
    const cell = cells.get(binding.conditionCellId);
    const readout = readouts.get(binding.readoutKey);
    if (!cell || !readout) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "readoutBindings", index],
        message: "Binding references an unknown Canvas readout or condition",
      });
      return;
    }
    if (cell.status !== "performed" && binding.status === "measured") {
      ctx.addIssue({
        code: "custom",
        path: [...path, "readoutBindings", index, "status"],
        message: "A not-performed or unresolved condition cannot have a measured binding",
      });
    }
    if (new Set(binding.componentKeys).size !== binding.componentKeys.length) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "readoutBindings", index, "componentKeys"],
        message: "Binding component keys must be unique",
      });
    }
    if (
      binding.componentKeys.length !== readout.componentKeys.length ||
      binding.componentKeys.some((key) => !readout.componentKeys.includes(key))
    ) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "readoutBindings", index, "componentKeys"],
        message: "Binding components must exactly match the Canvas readout",
      });
    }
  });
  pattern.axes.forEach((axis, index) => {
    const dimensionKey =
      axis.source.kind === "canvas_dimension" ? axis.source.dimensionKey : null;
    if (
      dimensionKey &&
      !canvas.dimensions.some(({ key }) => key === dimensionKey)
    ) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "axes", index, "source"],
        message: "Axis references an unknown Canvas dimension",
      });
    }
  });
}

function completeCartesianCellIds(
  canvas: ExperimentCanvas,
  conditionCellIds: readonly string[],
): boolean {
  const requested = new Set(conditionCellIds);
  if (requested.size !== conditionCellIds.length) return false;
  const cells = canvas.conditionCells.filter(({ conditionCellId }) => requested.has(conditionCellId));
  if (cells.length !== requested.size || cells.some(({ status }) => status !== "performed")) {
    return false;
  }
  const valuesByDimension = canvas.dimensions.map((dimension) => ({
    key: dimension.key,
    values: [...new Set(cells.map((cell) => cell.values[dimension.key]!))],
  }));
  const expectedSignatures = valuesByDimension
    .reduce<Array<Record<string, string>>>(
      (rows, dimension) =>
        rows.flatMap((row) =>
          dimension.values.map((value) => ({ ...row, [dimension.key]: value })),
        ),
      [{}],
    )
    .map((values) => canvasSignature(canvas.dimensions.map(({ key }) => key), values));
  const observed = new Set(
    cells.map(({ values }) => canvasSignature(canvas.dimensions.map(({ key }) => key), values)),
  );
  return expectedSignatures.length === observed.size && expectedSignatures.every((key) => observed.has(key));
}

function canvasIsCompletePerformedCartesian(canvas: ExperimentCanvas): boolean {
  const expectedCount = canvas.dimensions.reduce(
    (count, dimension) => count * dimension.values.length,
    1,
  );
  return (
    canvas.conditionCells.length === expectedCount &&
    canvas.conditionCells.every(({ status }) => status === "performed") &&
    completeCartesianCellIds(
      canvas,
      canvas.conditionCells.map(({ conditionCellId }) => conditionCellId),
    )
  );
}

function contractMatchesCanvasScope(
  canvas: ExperimentCanvas,
  conditionCellIds: readonly string[],
  contract: z.infer<typeof StructureContractSchema>,
): boolean {
  const selected = new Set(conditionCellIds);
  const cells = canvas.conditionCells.filter(({ conditionCellId }) => selected.has(conditionCellId));
  const expectedFactors = canvas.dimensions
    .map((dimension) => ({
      key: dimension.key,
      levels: [...new Set(cells.map((cell) => cell.values[dimension.key]!))],
    }))
    .filter(({ levels }) => levels.length > 1);
  if (contract.factors.length !== expectedFactors.length) return false;
  const contractFactors = new Map(contract.factors.map((factor) => [factor.key, factor]));
  if (
    expectedFactors.some(({ key, levels }) => {
      const factor = contractFactors.get(key);
      return (
        !factor ||
        factor.levels.length !== levels.length ||
        levels.some((level) => !factor.levels.includes(level))
      );
    })
  ) {
    return false;
  }
  const canvasReadouts = new Map(canvas.readouts.map((readout) => [readout.key, readout]));
  return contract.readouts.every((readout) => {
    const canvasReadout = canvasReadouts.get(readout.key);
    return (
      canvasReadout?.representation === readout.representation &&
      canvasReadout.componentKeys.length === readout.componentKeys.length &&
      canvasReadout.componentKeys.every((key) => readout.componentKeys.includes(key))
    );
  });
}

function recordEligibility(
  canvas: ExperimentCanvas,
  pattern: ObservationPatternSet | null,
  record: Omit<StagedObservationRecord, "eligibility">,
): StagedObservationRecord["eligibility"] {
  if (record.mappingState === "pending_mapping" || !pattern) return "pending_mapping";
  const cell = canvas.conditionCells.find(
    ({ conditionCellId }) => conditionCellId === record.conditionCellId,
  );
  const binding = pattern.readoutBindings.find(
    (candidate) =>
      candidate.readoutKey === record.observation.readoutKey &&
      candidate.conditionCellId === record.conditionCellId,
  );
  return cell?.status === "performed" &&
    binding?.status === "measured" &&
    binding.recordSetKey === record.recordSetKey
    ? "active"
    : "excluded_condition_or_binding";
}

function patternStatisticsReadiness(
  pattern: ObservationPatternSet,
  relevantRecordSetKeys?: ReadonlySet<string>,
): CapabilityReadiness | null {
  const requiredIdentityKeys = new Set<string>();
  let unknownRelationship = false;
  pattern.recordSets
    .filter(
      ({ key }) =>
        relevantRecordSetKeys === undefined || relevantRecordSetKeys.has(key),
    )
    .forEach((recordSet) => {
    if (recordSet.entryAlignment.mode === "unknown") unknownRelationship = true;
    if (recordSet.entryAlignment.identityKey) {
      requiredIdentityKeys.add(recordSet.entryAlignment.identityKey);
    }
    recordSet.axisUses.forEach(({ identityBehavior, materialContinuity }) => {
      if (identityBehavior.kind === "unknown" || materialContinuity === "unknown") {
        unknownRelationship = true;
      }
      if (
        identityBehavior.kind === "same_entity" ||
        identityBehavior.kind === "coordinate_within_entity" ||
        identityBehavior.kind === "event_subject"
      ) {
        requiredIdentityKeys.add(identityBehavior.identityKey);
      }
      if (identityBehavior.kind === "irrecoverable") requiredIdentityKeys.add("__irrecoverable__");
    });
    });
  if (requiredIdentityKeys.has("__irrecoverable__")) {
    return { status: "SAFE_UNSUPPORTED", reasons: ["axis_identity_is_irrecoverable"] };
  }
  const required = pattern.identities.filter(({ key }) => requiredIdentityKeys.has(key));
  if (required.some(({ availability }) => availability === "irrecoverable")) {
    return { status: "SAFE_UNSUPPORTED", reasons: ["scientific_linkage_identity_is_irrecoverable"] };
  }
  if (required.some(({ availability }) => availability === "unknown")) {
    return { status: "NEED_MORE_INFORMATION", reasons: ["scientific_linkage_identity_is_unknown"] };
  }
  if (unknownRelationship) {
    return { status: "NEED_MORE_INFORMATION", reasons: ["record_relationship_is_unknown"] };
  }
  return null;
}

export function deriveProgressiveEntryReadiness(input: {
  canvas: ExperimentCanvas;
  activePattern: ObservationPatternSet | null;
  stagedRecords: readonly StagedObservationRecord[];
  fullContract: z.infer<typeof StructureContractSchema> | null;
  scopedContracts: readonly z.infer<typeof ScopedStructureContractSchema>[];
}): ProgressiveEntrySnapshot["readiness"] {
  const dataRetention: CapabilityReadiness = { status: "READY", reasons: [] };
  if (!input.activePattern) {
    const unresolved = {
      status: "NEED_MORE_INFORMATION" as const,
      reasons: ["observation_pattern_required"],
    };
    return {
      dataRetention,
      adaptiveInput: unresolved,
      graph: unresolved,
      statistics: { status: "NEED_MORE_INFORMATION", reasons: ["complete_or_scoped_contract_required"] },
    };
  }
  const activeRecords = input.stagedRecords.filter(({ eligibility }) => eligibility === "active");
  const hasMeasuredBinding = input.activePattern.readoutBindings.some(
    ({ status }) => status === "measured",
  );
  const adaptiveInput: CapabilityReadiness = hasMeasuredBinding
    ? { status: "READY", reasons: [] }
    : { status: "NEED_MORE_INFORMATION", reasons: ["measured_readout_binding_required"] };
  const graph: CapabilityReadiness = activeRecords.length
    ? { status: "READY", reasons: [] }
    : { status: "NEED_MORE_INFORMATION", reasons: ["active_mapped_record_required"] };
  const contractAvailable = Boolean(input.fullContract || input.scopedContracts.length);
  const relevantRecordSetKeys = contractAvailable
    ? new Set(
        input.activePattern.readoutBindings.flatMap((binding) => {
          if (binding.status !== "measured" || !binding.recordSetKey) return [];
          const includedByFull = Boolean(
            input.fullContract &&
              input.canvas.conditionCells.some(
                ({ conditionCellId, status }) =>
                  conditionCellId === binding.conditionCellId && status === "performed",
              ) &&
              input.fullContract.readouts.some(({ key }) => key === binding.readoutKey),
          );
          const includedByScope = input.scopedContracts.some(
            ({ conditionCellIds, contract }) =>
              conditionCellIds.includes(binding.conditionCellId) &&
              contract.readouts.some(({ key }) => key === binding.readoutKey),
          );
          return includedByFull || includedByScope ? [binding.recordSetKey] : [];
        }),
      )
    : undefined;
  const identityBlock = contractAvailable
    ? patternStatisticsReadiness(input.activePattern, relevantRecordSetKeys)
    : null;
  const groupedScopeGap = contractAvailable
    ? Boolean(
        (input.fullContract &&
          input.canvas.conditionCells
            .filter(({ status }) => status === "performed")
            .some((cell) =>
              input.canvas.dimensions.some((dimension) => {
                const value = dimension.values.find(
                  ({ key }) => key === cell.values[dimension.key],
                );
                return Boolean(value?.groupKey);
              }),
            )) ||
          input.scopedContracts.some(({ conditionCellIds }) =>
            input.canvas.conditionCells
              .filter(({ conditionCellId }) => conditionCellIds.includes(conditionCellId))
              .some((cell) =>
                input.canvas.dimensions.some((dimension) => {
                  const value = dimension.values.find(
                    ({ key }) => key === cell.values[dimension.key],
                  );
                  return Boolean(value?.groupKey);
                }),
              ),
          ),
      )
    : false;
  const activeRecordInContractScope = activeRecords.some((record) => {
    if (
      input.fullContract?.readouts.some(
        ({ key }) => key === record.observation.readoutKey,
      )
    ) {
      return true;
    }
    return input.scopedContracts.some(
      ({ conditionCellIds, contract }) =>
        conditionCellIds.includes(record.conditionCellId) &&
        contract.readouts.some(({ key }) => key === record.observation.readoutKey),
    );
  });
  const recordsCoverContractScope = (() => {
    if (!contractAvailable) return false;
    const activePairs = new Set(
      activeRecords
        .filter((record) => {
          const readout = input.canvas.readouts.find(
            ({ key }) => key === record.observation.readoutKey,
          );
          return Boolean(
            readout &&
              readout.componentKeys.every((componentKey) => {
                const value = record.observation.values[componentKey];
                return value !== undefined && value !== null && value !== "";
              }),
          );
        })
        .map(
          (record) =>
            `${record.conditionCellId}|${record.observation.readoutKey}`,
        ),
    );
    const scopeCovered = (
      conditionCellIds: readonly string[],
      readoutKeys: readonly string[],
    ) => {
      // StructureContract 0.1.0 cannot express per-readout condition
      // applicability. Until that semantic exists, a scoped contract is
      // Statistics-ready only when every declared readout has a measured,
      // active record in every condition in that scope. This deliberately
      // avoids a false READY for a contrast that has no data on one side.
      return conditionCellIds.every((conditionCellId) =>
        readoutKeys.every((readoutKey) => {
          const binding = input.activePattern!.readoutBindings.find(
            (candidate) =>
              candidate.conditionCellId === conditionCellId &&
              candidate.readoutKey === readoutKey,
          );
          return (
            binding?.status === "measured" &&
            activePairs.has(`${conditionCellId}|${readoutKey}`)
          );
        }),
      );
    };
    if (input.fullContract) {
      const performedConditionCellIds = input.canvas.conditionCells
        .filter(({ status }) => status === "performed")
        .map(({ conditionCellId }) => conditionCellId);
      if (
        !scopeCovered(
          performedConditionCellIds,
          input.fullContract.readouts.map(({ key }) => key),
        )
      ) {
        return false;
      }
    }
    return input.scopedContracts.every(({ conditionCellIds, contract }) =>
      scopeCovered(
        conditionCellIds,
        contract.readouts.map(({ key }) => key),
      ),
    );
  })();
  const statistics: CapabilityReadiness = identityBlock
    ? identityBlock
    : !contractAvailable
      ? { status: "NEED_MORE_INFORMATION", reasons: ["complete_or_scoped_contract_required"] }
      : !activeRecordInContractScope
        ? { status: "NEED_MORE_INFORMATION", reasons: ["active_record_in_contract_scope_required"] }
        : !recordsCoverContractScope
          ? {
              status: "NEED_MORE_INFORMATION",
              reasons: ["active_record_for_each_scope_binding_required"],
            }
        : groupedScopeGap
          ? {
              status: "NEED_MORE_INFORMATION",
              reasons: ["condition_value_grouping_requires_reviewed_scope_mapper"],
            }
          : {
            status: "NEED_MORE_INFORMATION",
            reasons: ["analysis_specific_replication_and_comparison_required"],
            };
  return { dataRetention, adaptiveInput, graph, statistics };
}

export const ProgressiveEntrySnapshotSchema = ProgressiveEntrySnapshotBaseSchema.superRefine(
  (snapshot, ctx) => {
    if (snapshot.activePattern) {
      validatePatternAgainstCanvas(snapshot.activePattern, snapshot.canvas, ctx, ["activePattern"]);
    }
    if (snapshot.pendingPattern) {
      validatePatternAgainstCanvas(snapshot.pendingPattern, snapshot.canvas, ctx, ["pendingPattern"]);
    }
    addDuplicateIssue(
      snapshot.stagedRecords.map(({ recordId }) => recordId),
      ["stagedRecords"],
      "Staged record IDs",
      ctx,
    );
    addDuplicateIssue(
      snapshot.stagedRecords.map(({ observation }) => observation.observationId),
      ["stagedRecords"],
      "Staged observation IDs",
      ctx,
    );
    addDuplicateIssue(
      snapshot.scopedContracts.map(({ scopeId }) => scopeId),
      ["scopedContracts"],
      "Scoped-contract IDs",
      ctx,
    );
    addDuplicateIssue(
      snapshot.provenance.map(({ eventId }) => eventId),
      ["provenance"],
      "Progressive provenance event IDs",
      ctx,
    );
    if (snapshot.fullContract && !canvasIsCompletePerformedCartesian(snapshot.canvas)) {
      ctx.addIssue({
        code: "custom",
        path: ["fullContract"],
        message: "A full StructureContract cannot replace a sparse or unresolved Canvas",
      });
    }
    if (
      snapshot.fullContract &&
      !contractMatchesCanvasScope(
        snapshot.canvas,
        snapshot.canvas.conditionCells.map(({ conditionCellId }) => conditionCellId),
        snapshot.fullContract,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["fullContract"],
        message: "Full StructureContract does not match the complete Canvas",
      });
    }
    snapshot.scopedContracts.forEach((scope, index) => {
      if (!completeCartesianCellIds(snapshot.canvas, scope.conditionCellIds)) {
        ctx.addIssue({
          code: "custom",
          path: ["scopedContracts", index, "conditionCellIds"],
          message: "A scoped StructureContract requires a complete performed Cartesian subset",
        });
      }
      if (!contractMatchesCanvasScope(snapshot.canvas, scope.conditionCellIds, scope.contract)) {
        ctx.addIssue({
          code: "custom",
          path: ["scopedContracts", index, "contract"],
          message: "Scoped StructureContract does not match its Canvas condition subset",
        });
      }
    });
    snapshot.stagedRecords.forEach((record, index) => {
      if (
        !snapshot.canvas.readouts.some(({ key }) => key === record.observation.readoutKey) ||
        !snapshot.canvas.conditionCells.some(
          ({ conditionCellId }) => conditionCellId === record.conditionCellId,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["stagedRecords", index],
          message: "Staged record references an unknown Canvas readout or condition",
        });
      }
      const expected = recordEligibility(snapshot.canvas, snapshot.activePattern, record);
      if (record.eligibility !== expected) {
        ctx.addIssue({
          code: "custom",
          path: ["stagedRecords", index, "eligibility"],
          message: "Staged record eligibility is stale",
        });
      }
      if (record.mappingState === "mapped") {
        const condition = snapshot.canvas.conditionCells.find(
          ({ conditionCellId }) => conditionCellId === record.conditionCellId,
        );
        if (
          condition &&
          snapshot.canvas.dimensions.some(
            ({ key }) => record.observation.factors[key] !== condition.values[key],
          )
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["stagedRecords", index, "observation", "factors"],
            message: "Mapped record factors do not match the retained Canvas condition",
          });
        }
        if (
          snapshot.activePattern &&
          (!record.recordSetKey ||
            !snapshot.activePattern.recordSets.some(({ key }) => key === record.recordSetKey))
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["stagedRecords", index, "recordSetKey"],
            message: "Mapped record references an unknown observation record set",
          });
        }
      }
    });
    const expectedReadiness = deriveProgressiveEntryReadiness(snapshot);
    if (JSON.stringify(snapshot.readiness) !== JSON.stringify(expectedReadiness)) {
      ctx.addIssue({
        code: "custom",
        path: ["readiness"],
        message: "Capability readiness is stale",
      });
    }
  },
);

export function createProgressiveEntrySnapshot(input: Omit<
  z.input<typeof ProgressiveEntrySnapshotBaseSchema>,
  "schemaVersion" | "stagedRecords" | "readiness"
> & {
  stagedRecords: readonly Omit<StagedObservationRecord, "eligibility">[];
}): ProgressiveEntrySnapshot {
  const canvas = ExperimentCanvasSchema.parse(input.canvas);
  const activePattern = input.activePattern
    ? ObservationPatternSetSchema.parse(input.activePattern)
    : null;
  const stagedRecords = input.stagedRecords.map((record) => ({
    ...record,
    eligibility: recordEligibility(canvas, activePattern, record),
  }));
  const candidate = {
    ...input,
    schemaVersion: PROGRESSIVE_ENTRY_SNAPSHOT_SCHEMA_VERSION,
    canvas,
    activePattern,
    stagedRecords,
    readiness: deriveProgressiveEntryReadiness({
      canvas,
      activePattern,
      stagedRecords,
      fullContract: input.fullContract,
      scopedContracts: input.scopedContracts,
    }),
  };
  return ProgressiveEntrySnapshotSchema.parse(candidate);
}

export function serializeProgressiveEntrySnapshot(snapshot: ProgressiveEntrySnapshot): string {
  return JSON.stringify(ProgressiveEntrySnapshotSchema.parse(snapshot));
}

export function parseProgressiveEntrySnapshot(text: string): ProgressiveEntrySnapshot {
  return ProgressiveEntrySnapshotSchema.parse(JSON.parse(text) as unknown);
}
