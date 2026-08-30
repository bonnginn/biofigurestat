import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema, Sha256Schema } from "./ids";

export const ScalarMeasurementSchema = z.object({
  kind: z.literal("scalar"),
  value: z.number(),
});

export const ProportionMeasurementSchema = z
  .object({
    kind: z.literal("proportion"),
    numerator: z.number().int().nonnegative(),
    denominator: z.number().int().positive(),
  })
  .refine((measurement) => measurement.numerator <= measurement.denominator, {
    message: "Proportion numerator cannot exceed denominator",
    path: ["numerator"],
  });

/**
 * Source-preserving WB measurement. The analyzed value is derived
 * deterministically as target/loadingControl; both raw band intensities remain
 * editable in the project instead of persisting only the quotient.
 */
export const LoadingControlRatioMeasurementSchema = z.object({
  kind: z.literal("loading_control_ratio"),
  target: z.number().finite().nonnegative(),
  loadingControl: z.number().finite().positive(),
  transformationVersion: z.literal("0.1.0"),
  sourceMeasurements: z
    .object({
      method: z.literal("mean_intensity_minus_mean_background_times_area"),
      version: z.literal("0.1.0"),
      target: z.object({
        intensity: z.number().finite().nonnegative(),
        background: z.number().finite().nonnegative(),
        area: z.number().finite().positive(),
      }),
      loadingControl: z.object({
        intensity: z.number().finite().nonnegative(),
        background: z.number().finite().nonnegative(),
        area: z.number().finite().positive(),
      }),
    })
    .optional(),
});

export const CategoricalCountsMeasurementSchema = z
  .object({
    kind: z.literal("categorical_counts"),
    counts: z.record(EntityIdSchema, z.number().int().nonnegative()),
  })
  .refine((measurement) => Object.keys(measurement.counts).length >= 2, {
    message: "Categorical composition requires at least two declared categories",
    path: ["counts"],
  });

export const TimeToEventMeasurementSchema = z.object({
  kind: z.literal("time_to_event"),
  followUpTime: z.number().finite().nonnegative(),
  eventObserved: z.boolean(),
});

export const MeasurementValueSchema = z.discriminatedUnion("kind", [
  ScalarMeasurementSchema,
  ProportionMeasurementSchema,
  LoadingControlRatioMeasurementSchema,
  CategoricalCountsMeasurementSchema,
  TimeToEventMeasurementSchema,
]);

export const RawDatasetRevisionSchema = z.object({
  id: EntityIdSchema,
  previousRevisionId: EntityIdSchema.nullable(),
  sourceKind: z.enum(["manual", "paste", "csv", "excel", "project_edit"]),
  sourceName: z.string().optional(),
  sourceSha256: Sha256Schema.optional(),
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().min(1),
  note: z.string().optional(),
});

export const UnitInstanceSchema = z.object({
  id: EntityIdSchema,
  levelId: EntityIdSchema,
  parentUnitId: EntityIdSchema.nullable(),
  label: z.string().min(1),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const ObservationSchema = z.object({
  id: EntityIdSchema,
  rawRevisionId: EntityIdSchema,
  unitInstanceId: EntityIdSchema,
  conditionId: EntityIdSchema,
  outcomeId: EntityIdSchema,
  measurement: MeasurementValueSchema,
  experimentDate: z.iso.date().optional(),
  time: z.number().optional(),
  dose: z.number().optional(),
  technicalReplicateId: EntityIdSchema.optional(),
  sourceLocation: z.string().optional(),
});

export const QCRecordSchema = z.object({
  id: EntityIdSchema,
  targetKind: z.enum(["observation", "unit", "raw_revision"]),
  targetId: EntityIdSchema,
  status: z.enum(["included", "flagged", "excluded"]),
  reason: z.string().min(1),
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().min(1),
});

export const TransformationSpecSchema = z.object({
  id: EntityIdSchema,
  version: z.string().min(1),
  method: z.enum([
    "proportion_to_percentage",
    "loading_control_ratio",
    "baseline_subtraction",
    "control_equals_one",
    "per_unit_maximum",
    "replicate_summary",
    "time_series_metric",
    "matrix_row_z_score",
    "matrix_column_z_score",
    "matrix_log10",
    "custom",
  ]),
  inputRevisionIds: z.array(EntityIdSchema).min(1),
  parameters: z.record(z.string(), z.unknown()),
});

export const DerivedDatasetRevisionSchema = z.object({
  id: EntityIdSchema,
  previousRevisionId: EntityIdSchema.nullable(),
  sourceRawRevisionId: EntityIdSchema,
  sourceQcRevisionId: EntityIdSchema.nullable(),
  outcomeId: EntityIdSchema,
  transformationId: EntityIdSchema,
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().min(1),
  state: z.enum(["current", "stale"]),
  staleReason: z.string().min(1).nullable(),
});

export const DerivedScalarValueSchema = z.object({
  id: EntityIdSchema,
  derivedDatasetRevisionId: EntityIdSchema,
  experimentalUnitId: EntityIdSchema,
  conditionId: EntityIdSchema,
  outcomeId: EntityIdSchema,
  value: z.number().finite(),
  sourceObservationIds: z.array(EntityIdSchema).min(1),
  sourceUnitIds: z.array(EntityIdSchema).min(1),
  subsampleCount: z.number().int().positive(),
});

export type RawDatasetRevision = z.infer<typeof RawDatasetRevisionSchema>;
export type UnitInstance = z.infer<typeof UnitInstanceSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
export type MeasurementValue = z.infer<typeof MeasurementValueSchema>;
export type TransformationSpec = z.infer<typeof TransformationSpecSchema>;
export type DerivedDatasetRevision = z.infer<typeof DerivedDatasetRevisionSchema>;
export type DerivedScalarValue = z.infer<typeof DerivedScalarValueSchema>;

/** Returns the scalar value supplied to a statistical analysis. */
export function measurementNumericValue(measurement: MeasurementValue): number {
  if (measurement.kind === "scalar") return measurement.value;
  if (measurement.kind === "proportion") {
    return (measurement.numerator / measurement.denominator) * 100;
  }
  if (measurement.kind === "loading_control_ratio") {
    return measurement.target / measurement.loadingControl;
  }
  throw new Error(
    "Categorical counts and time-to-event data do not have one implicit scalar value",
  );
}
