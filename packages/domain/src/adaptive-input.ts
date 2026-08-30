import { z } from "zod";

export const STRUCTURE_CONTRACT_VERSION = "0.1.0" as const;
export const ADAPTIVE_INPUT_SNAPSHOT_VERSION = "0.1.0" as const;
export const ADAPTIVE_DESIGN_TEMPLATE_VERSION = "0.1.0" as const;

const SemanticKeySchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
const MissingnessKindSchema = z.enum([
  "not_applicable",
  "not_collected",
  "assay_failed",
  "dropout",
  "censored",
  "unknown",
]);

const normalizedCoordinateLabel = (value: string | number): string =>
  String(value).normalize("NFKC").trim();

export const AdaptiveSurfaceIdSchema = z.enum([
  "compact_unit_matrix",
  "factor_observation_table",
  "repeated_axis_matrix",
  "nested_observation_table",
  "typed_record_table",
]);

export const StructureContractSchema = z
  .object({
    schemaVersion: z.literal(STRUCTURE_CONTRACT_VERSION),
    contractId: SemanticKeySchema,
    experimentName: z.string().min(1),
    experimentDescription: z.string().min(1),
    unitLevels: z
      .array(
        z.object({
          key: SemanticKeySchema,
          label: z.string().min(1),
          role: z.enum([
            "experimental_unit",
            "block",
            "sample",
            "subsample",
            "technical_replicate",
            "sampling_location",
            "condition_specific_sample",
          ]),
          parentKey: SemanticKeySchema.nullable(),
        }),
      )
      .min(1),
    experimentalUnitLevelKey: SemanticKeySchema,
    identities: z
      .array(
        z.object({
          key: SemanticKeySchema,
          label: z.string().min(1),
          unitLevelKey: SemanticKeySchema,
          required: z.boolean(),
        }),
      )
      .min(1),
    factors: z.array(
      z.object({
        key: SemanticKeySchema,
        label: z.string().min(1),
        levels: z.array(z.string().min(1)).min(1),
        unitRole: z.enum(["between_unit", "within_unit"]),
        relationship: z.enum(["independent", "paired", "repeated", "blocked"]),
        ordered: z.boolean(),
        referenceLevel: z.string().min(1).nullable(),
      }),
    ),
    matching: z.object({
      kind: z.enum(["independent", "matched", "blocked", "mixed", "crossover", "none"]),
      identityKey: SemanticKeySchema.nullable(),
      completeSetsRequired: z.boolean().nullable(),
    }),
    orderedAxes: z.array(
      z.object({
        key: SemanticKeySchema,
        label: z.string().min(1),
        unit: z.string(),
        levels: z.array(z.union([z.string(), z.number()])),
        sampling: z.enum(["cross_sectional", "repeated_same_identity", "event_follow_up"]),
        identityRetained: z.boolean(),
      }),
    ),
    readouts: z
      .array(
        z.object({
          key: SemanticKeySchema,
          label: z.string().min(1),
          valueType: z.string().min(1),
          representation: z.enum([
            "scalar",
            "proportion_counts",
            "category_counts",
            "target_reference",
            "paired_readouts",
            "event_censoring",
            "dose_response",
            "other_typed_bundle",
          ]),
          componentKeys: z.array(SemanticKeySchema).min(1),
          referenceRole: z.enum(["none", "loading_control", "baseline", "control_condition"]),
          observationLevelKey: SemanticKeySchema,
          axisKeys: z.array(SemanticKeySchema),
        }),
      )
      .min(1),
    allowedMissingness: z.array(MissingnessKindSchema).min(1),
    rawObservationGrain: z.string().min(1),
  })
  .superRefine((contract, ctx) => {
    for (const [field, keys] of Object.entries({
      unitLevels: contract.unitLevels.map(({ key }) => key),
      identities: contract.identities.map(({ key }) => key),
      factors: contract.factors.map(({ key }) => key),
      orderedAxes: contract.orderedAxes.map(({ key }) => key),
      readouts: contract.readouts.map(({ key }) => key),
    })) {
      if (new Set(keys).size !== keys.length)
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `Duplicate semantic key in ${field}`,
        });
    }
    const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
    const experimental = levels.get(contract.experimentalUnitLevelKey);
    if (experimental?.role !== "experimental_unit") {
      ctx.addIssue({
        code: "custom",
        path: ["experimentalUnitLevelKey"],
        message: "Experimental unit must reference an experimental_unit level",
      });
    }
    contract.unitLevels.forEach((level, index) => {
      if (level.parentKey && !levels.has(level.parentKey))
        ctx.addIssue({
          code: "custom",
          path: ["unitLevels", index, "parentKey"],
          message: "Unknown parent level",
        });
      const visited = new Set<string>();
      let cursor: typeof level | undefined = level;
      while (cursor) {
        if (visited.has(cursor.key)) {
          ctx.addIssue({
            code: "custom",
            path: ["unitLevels", index],
            message: "Unit hierarchy contains a cycle",
          });
          break;
        }
        visited.add(cursor.key);
        cursor = cursor.parentKey ? levels.get(cursor.parentKey) : undefined;
      }
    });
    contract.identities.forEach((identity, index) => {
      if (!levels.has(identity.unitLevelKey))
        ctx.addIssue({
          code: "custom",
          path: ["identities", index, "unitLevelKey"],
          message: "Identity references an unknown unit level",
        });
    });
    const identityKeys = new Set(contract.identities.map(({ key }) => key));
    if (
      !["independent", "none"].includes(contract.matching.kind) &&
      (!contract.matching.identityKey || !identityKeys.has(contract.matching.identityKey))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["matching", "identityKey"],
        message: "Relationship requires a known stable identity",
      });
    }
    contract.factors.forEach((factor, index) => {
      const normalizedLevels = factor.levels.map(normalizedCoordinateLabel);
      if (new Set(normalizedLevels).size !== normalizedLevels.length) {
        ctx.addIssue({
          code: "custom",
          path: ["factors", index, "levels"],
          message: "Factor levels must be unique after string normalization",
        });
      }
      if (factor.referenceLevel !== null && !factor.levels.includes(factor.referenceLevel)) {
        ctx.addIssue({
          code: "custom",
          path: ["factors", index, "referenceLevel"],
          message: "Factor reference level must be one of its declared levels",
        });
      }
    });
    contract.orderedAxes.forEach((axis, index) => {
      const normalizedLevels = axis.levels.map(normalizedCoordinateLabel);
      if (new Set(normalizedLevels).size !== normalizedLevels.length) {
        ctx.addIssue({
          code: "custom",
          path: ["orderedAxes", index, "levels"],
          message: "Ordered-axis levels must be unique after string normalization",
        });
      }
    });
    const axisKeys = new Set(contract.orderedAxes.map(({ key }) => key));
    contract.readouts.forEach((readout, index) => {
      if (new Set(readout.componentKeys).size !== readout.componentKeys.length) {
        ctx.addIssue({
          code: "custom",
          path: ["readouts", index, "componentKeys"],
          message: "Readout component keys must be unique",
        });
      }
      if (!levels.has(readout.observationLevelKey))
        ctx.addIssue({
          code: "custom",
          path: ["readouts", index, "observationLevelKey"],
          message: "Readout references an unknown observation level",
        });
      readout.axisKeys.forEach((key) => {
        if (!axisKeys.has(key))
          ctx.addIssue({
            code: "custom",
            path: ["readouts", index, "axisKeys"],
            message: `Unknown ordered axis: ${key}`,
          });
      });
    });
  });

export const CanonicalAdaptiveObservationSchema = z.object({
  observationId: SemanticKeySchema,
  readoutKey: SemanticKeySchema,
  identities: z.record(SemanticKeySchema, z.string().min(1)),
  factors: z.record(SemanticKeySchema, z.string()),
  axes: z.record(SemanticKeySchema, z.union([z.string(), z.number()])),
  hierarchy: z.record(SemanticKeySchema, z.string()),
  values: z.record(SemanticKeySchema, z.union([z.string(), z.number(), z.boolean(), z.null()])),
  missingness: z.record(SemanticKeySchema, MissingnessKindSchema).default({}),
  sourceRow: z.number().int().positive().nullable(),
});

export const AdaptiveColumnMappingSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  sourceLabel: z.string().min(1),
  delimiter: z.enum(["comma", "tab", "semicolon"]),
  headerRow: z.number().int().positive(),
  columns: z.record(
    z.string(),
    z.object({
      role: z.enum([
        "identity",
        "factor",
        "axis",
        "hierarchy",
        "value",
        "missingness",
        "metadata",
        "ignore",
      ]),
      semanticKey: SemanticKeySchema.nullable(),
      fixedFactors: z.record(SemanticKeySchema, z.string()).default({}),
      fixedAxes: z.record(SemanticKeySchema, z.union([z.string(), z.number()])).default({}),
    }),
  ),
  confirmedAt: z.string().datetime(),
});

export const AdaptiveRawLineageSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  sourceKind: z.enum(["clipboard", "csv", "tsv", "generic_file"]),
  sourceLabel: z.string().min(1),
  importedAt: z.string().datetime(),
  rawText: z.string(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  transformations: z.array(z.string()),
});

/**
 * Versioned researcher-facing condition-canvas provenance.
 *
 * This is deliberately presentation/provenance metadata rather than a second
 * semantic authority.  Consumers must validate `answers` and the displayed
 * condition levels against the sibling StructureContract before using it for
 * prefill.  Legacy adaptive snapshots omit this field.
 */
export const BIOLOGICAL_SETUP_PRESENTATION_VERSION = "0.1.0" as const;

const BiologicalReadoutRepresentationSchema = z.enum([
  "scalar",
  "proportion_counts",
  "category_counts",
  "target_reference",
  "paired_readouts",
  "event_censoring",
  "dose_response",
  "other_typed_bundle",
]);

export const BiologicalSetupPresentationSchema = z.object({
  schemaVersion: z.literal(BIOLOGICAL_SETUP_PRESENTATION_VERSION),
  answers: z.object({
    experimentName: z.string().min(1),
    experimentDescription: z.string().min(1),
    experimentalUnitLabel: z.string().min(1),
    identityLabel: z.string().min(1),
    readoutLabel: z.string().min(1),
    readoutRepresentation: BiologicalReadoutRepresentationSchema,
    readoutUsesNestedObservation: z.boolean().optional(),
    readoutUsesOrderedAxis: z.boolean().optional(),
    additionalReadouts: z
      .array(
        z.object({
          label: z.string().min(1),
          representation: BiologicalReadoutRepresentationSchema,
          usesNestedObservation: z.boolean().optional(),
          usesOrderedAxis: z.boolean().optional(),
        }),
      )
      .optional(),
    factorName: z.string().min(1).optional(),
    factorLevels: z.array(z.string().min(1)).optional(),
    additionalFactors: z
      .array(
        z.object({
          name: z.string().min(1),
          levels: z.array(z.string().min(1)).min(1),
          sameIdentityAcrossConditions: z.boolean().optional(),
        }),
      )
      .optional(),
    sameIdentityAcrossConditions: z.boolean(),
    conditionEntityRelationship: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("independent_condition_units") }),
        z.object({ kind: z.literal("same_entity_across_conditions") }),
        z.object({
          kind: z.literal("distinct_condition_units_shared_source"),
          sourceUnitLabel: z.string().min(1),
          sourceIdentityLabel: z.string().min(1),
          sourceRole: z.enum(["block", "sample"]),
          completeSetsRequired: z.boolean(),
        }),
      ])
      .optional(),
    orderedAxis: z
      .object({
        label: z.string().min(1),
        unit: z.string(),
        levels: z.array(z.union([z.string(), z.number()])),
        sameIdentity: z.boolean(),
      })
      .optional(),
    nestedObservationLabel: z.string().min(1).optional(),
  }),
  conditionBlocks: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      showGroups: z.boolean(),
      groupLabels: z.array(z.string()),
      values: z.array(z.array(z.string())).min(1),
    }),
  ),
  conditionCombinations: z.array(
    z.object({
      id: z.string().min(1),
      labels: z.array(z.string().min(1)),
      displayLabel: z.string().min(1),
      status: z.enum(["performed", "not_performed", "unknown"]),
    }),
  ),
});

export const DualWriteEquivalenceSchema = z.object({
  status: z.enum(["equivalent", "not_representable", "mismatch"]),
  checkedAt: z.string().datetime(),
  diagnostics: z.array(z.string()),
  contractFingerprint: z.string().min(1),
  designFingerprint: z.string().nullable(),
});

export const AdaptiveInputSnapshotSchema = z.object({
  schemaVersion: z.literal(ADAPTIVE_INPUT_SNAPSHOT_VERSION),
  featureFlag: z.literal("experiment_first_adaptive_input_alpha"),
  contract: StructureContractSchema,
  surface: z.object({
    surfaceId: AdaptiveSurfaceIdSchema,
    reasonCodes: z.array(z.string().min(1)),
  }),
  mapping: AdaptiveColumnMappingSchema.nullable(),
  rawLineage: AdaptiveRawLineageSchema.nullable(),
  canonicalObservations: z.array(CanonicalAdaptiveObservationSchema),
  equivalence: DualWriteEquivalenceSchema,
  targetedConfirmations: z.array(
    z.object({ key: SemanticKeySchema, answer: z.string(), confirmedAt: z.string().datetime() }),
  ),
  biologicalSetup: BiologicalSetupPresentationSchema.nullable().optional(),
});

/**
 * A design-only reuse boundary. Data-bearing fields from AdaptiveInputSnapshot
 * are intentionally absent and therefore cannot be carried into a new
 * experiment through this schema.
 */
export const AdaptiveDesignTemplateSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_DESIGN_TEMPLATE_VERSION),
    sourceSnapshotVersion: z.literal(ADAPTIVE_INPUT_SNAPSHOT_VERSION),
    contract: StructureContractSchema,
    surface: z.object({
      surfaceId: AdaptiveSurfaceIdSchema,
      reasonCodes: z.array(z.string().min(1)),
    }),
    targetedConfirmations: z.array(
      z.object({ key: SemanticKeySchema, answer: z.string(), confirmedAt: z.string().datetime() }),
    ),
  })
  .strict();

export type StructureContract = z.infer<typeof StructureContractSchema>;
export type AdaptiveSurfaceId = z.infer<typeof AdaptiveSurfaceIdSchema>;
export type CanonicalAdaptiveObservation = z.infer<typeof CanonicalAdaptiveObservationSchema>;
export type AdaptiveColumnMapping = z.infer<typeof AdaptiveColumnMappingSchema>;
export type AdaptiveRawLineage = z.infer<typeof AdaptiveRawLineageSchema>;
export type BiologicalSetupPresentation = z.infer<typeof BiologicalSetupPresentationSchema>;
export type DualWriteEquivalence = z.infer<typeof DualWriteEquivalenceSchema>;
export type AdaptiveInputSnapshot = z.infer<typeof AdaptiveInputSnapshotSchema>;
export type AdaptiveDesignTemplate = z.infer<typeof AdaptiveDesignTemplateSchema>;
