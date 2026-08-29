import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema, ProjectMetadataSchema } from "@lsaa/domain";

export const SPECIALIZED_ENTRY_DRAFT_SCHEMA_VERSION = "0.1.0" as const;
export const SPECIALIZED_ENTRY_DRAFT_KIND = "specialized_entry_draft" as const;

const SpecializedRouteSchema = z.enum(["survival", "nonlinear-fit"]);
const SourceContextSchema = z.enum([
  "cell_culture",
  "microscopy_imaging",
  "protein_biochemical",
  "animal",
  "general_assay",
]);
const SubjectUnitRelationshipSchema = z.enum([
  "subject_is_experimental_unit",
  "nested_in_parent",
  "unknown",
]);

/**
 * The facts below are researcher answers retained by a dedicated entry. They
 * are not an ExperimentDesign and must not be interpreted as one on reopen.
 */
export const SpecializedEntryFactsSchema = z
  .object({
    orderedAxisMeaning: z
      .enum([
        "elapsed_time",
        "substrate_concentration",
        "treatment_concentration",
        "temperature",
        "distance",
        "other_ordered_quantity",
      ])
      .optional(),
    axisMaterialRelationship: z
      .enum(["same_physical_material_across_axis", "separate_material_per_axis_value", "unknown"])
      .optional(),
    axisPointParentRelationship: z
      .enum(["no_shared_parent_or_matching", "shared_parent_or_matching", "unknown"])
      .optional(),
    orderedCurveSeriesCount: z.number().int().nonnegative().optional(),
    orderedCurveSeriesMeaning: z
      .enum(["experimental_conditions", "replicate_runs_or_units", "different_readouts", "unknown"])
      .optional(),
    orderedCurveSeriesParentRelationship: z
      .enum(["no_shared_parent_or_matching", "shared_parent_or_matching", "unknown"])
      .optional(),
    orderedAxisCount: z.number().int().positive().optional(),
    timeToEventPattern: z
      .enum([
        "single_terminal_event_or_censoring",
        "recurrent_events",
        "competing_events",
        "interval_censoring",
        "multi_state",
      ])
      .optional(),
    subjectUnitRelationship: SubjectUnitRelationshipSchema.optional(),
    statisticsRequested: z.boolean().optional(),
    conditionPlan: z.enum(["complete_combinations", "explicit_sparse_combinations"]).optional(),
    hierarchyShape: z.enum(["tree", "many_to_many"]).optional(),
  })
  .strict();

export const SpecializedEntryIntentSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    moduleId: z.enum(["time_to_event", "ordered_curve_kinetics"]),
    destination: SpecializedRouteSchema,
    sourceContext: SourceContextSchema,
    entryRouteId: z.string().min(1),
    experimentName: z.string().min(1),
    experimentDescription: z.string().min(1),
    subjectUnitLabel: z.string().min(1),
    facts: SpecializedEntryFactsSchema,
  })
  .strict();

export const SpecializedEntryRawTableSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    headers: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
    delimiter: z.enum(["comma", "tab", "semicolon"]).nullable(),
    headerRow: z.number().int().positive().nullable(),
  })
  .strict();

export const SpecializedEntryRawLineageSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    sourceKind: z.enum(["direct_entry", "clipboard", "csv", "tsv", "generic_file"]),
    sourceLabel: z.string().min(1),
    capturedAt: IsoDateTimeSchema,
    /** Exact editor/file text; this is the recovery authority. */
    rawText: z.string(),
  })
  .strict();

const FitSettingSchema = z
  .object({ initial: z.string(), lower: z.string(), upper: z.string() })
  .strict();

export const SpecializedEntryAnswersSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("survival"),
      subjectUnitRelationship: SubjectUnitRelationshipSchema,
      followUpUnit: z.string(),
      numericStatusMapping: z.enum(["event_is_1", "event_is_0"]).nullable(),
      statisticsSetupExpanded: z.boolean(),
      showLogRankAnnotation: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ordered_curve"),
      facts: SpecializedEntryFactsSchema,
      xLabel: z.string(),
      yLabel: z.string(),
      xUnit: z.string(),
      yUnit: z.string(),
      nonlinearModel: z.enum([
        "zero_baseline_association",
        "one_phase_association",
        "michaelis_menten",
      ]),
      nonlinearModelExplicitlySelected: z.boolean(),
      michaelisReadoutMeaning: z
        .enum(["calculated_initial_velocity", "raw_time_series_or_other", "unknown"])
        .optional(),
      modelRationale: z.string(),
      fitSettings: z.record(z.string(), FitSettingSchema),
    })
    .strict(),
]);

export const SpecializedEntrySafeStopSchema = z
  .object({
    status: z.enum([
      "needs_targeted_facts",
      "contract_deferred",
      "safe_unsupported",
      "input_mapping_required",
      "input_invalid",
      "surface_mismatch",
      "dual_write_mismatch",
    ]),
    reasonCodes: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const SpecializedEntryDraftProvenanceEventSchema = z
  .object({
    id: EntityIdSchema,
    kind: z.enum(["specialized_entry_draft_created", "specialized_entry_draft_saved"]),
    occurredAt: IsoDateTimeSchema,
    actor: z.string().min(1),
  })
  .strict();

export const SpecializedEntryDraftProjectStateSchema = z
  .object({
    projectKind: z.literal(SPECIALIZED_ENTRY_DRAFT_KIND),
    schemaVersion: z.literal(SPECIALIZED_ENTRY_DRAFT_SCHEMA_VERSION),
    metadata: ProjectMetadataSchema,
    route: SpecializedRouteSchema,
    entryIntent: SpecializedEntryIntentSchema,
    rawTable: SpecializedEntryRawTableSchema,
    rawLineage: SpecializedEntryRawLineageSchema,
    answers: SpecializedEntryAnswersSchema,
    safeStop: SpecializedEntrySafeStopSchema,
    provenanceEvents: z.array(SpecializedEntryDraftProvenanceEventSchema).min(1),
  })
  .strict()
  .superRefine((state, ctx) => {
    const expectedRoute =
      state.entryIntent.moduleId === "time_to_event" ? "survival" : "nonlinear-fit";
    if (state.route !== expectedRoute || state.entryIntent.destination !== expectedRoute) {
      ctx.addIssue({
        code: "custom",
        path: ["entryIntent", "destination"],
        message: "Specialized draft route and entry intent must agree",
      });
    }
    if (
      (state.route === "survival" && state.answers.kind !== "survival") ||
      (state.route === "nonlinear-fit" && state.answers.kind !== "ordered_curve")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["answers", "kind"],
        message: "Specialized draft answers must match the retained route",
      });
    }
    state.rawTable.rows.forEach((row, index) => {
      if (row.length !== state.rawTable.headers.length) {
        ctx.addIssue({
          code: "custom",
          path: ["rawTable", "rows", index],
          message: "Specialized draft rows must match the retained header count",
        });
      }
    });
    if (state.rawTable.rows.length > 0 && state.rawLineage.rawText.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["rawLineage", "rawText"],
        message: "A non-empty specialized table must retain its exact source text",
      });
    }
  });

export type SpecializedEntryDraftProjectState = z.infer<
  typeof SpecializedEntryDraftProjectStateSchema
>;
export type SpecializedEntryDraftAnswers = z.infer<typeof SpecializedEntryAnswersSchema>;

export function createSpecializedEntryDraftProjectState(
  input: Omit<SpecializedEntryDraftProjectState, "projectKind" | "schemaVersion">,
): SpecializedEntryDraftProjectState {
  return SpecializedEntryDraftProjectStateSchema.parse({
    ...input,
    projectKind: SPECIALIZED_ENTRY_DRAFT_KIND,
    schemaVersion: SPECIALIZED_ENTRY_DRAFT_SCHEMA_VERSION,
  });
}

/**
 * Version-policy boundary. No legacy specialized draft format existed before
 * 0.1.0; current documents pass unchanged and all unknown versions fail in the
 * schema parser instead of being guessed into the current contract.
 */
export function migrateSpecializedEntryDraftProjectState(input: unknown): unknown {
  return input;
}

export function serializeSpecializedEntryDraftProjectState(
  input: SpecializedEntryDraftProjectState,
): Uint8Array {
  const state = SpecializedEntryDraftProjectStateSchema.parse(input);
  return new TextEncoder().encode(`${JSON.stringify(state, null, 2)}\n`);
}

export function deserializeSpecializedEntryDraftProjectState(
  data: Uint8Array,
): SpecializedEntryDraftProjectState {
  const decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  return SpecializedEntryDraftProjectStateSchema.parse(
    migrateSpecializedEntryDraftProjectState(decoded),
  );
}
