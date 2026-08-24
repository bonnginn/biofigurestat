import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "@lsaa/domain";

export const AnalysisTemplateIdSchema = z.enum([
  "D01",
  "D02",
  "D03",
  "D04",
  "D05",
  "D06",
  "D07",
  "D08",
  "D09",
  "D10",
  "D11",
  "D12",
  "D13",
]);

export const StatisticalMethodSchema = z.enum([
  "welch_t",
  "student_t",
  "mann_whitney",
  "paired_t",
  "wilcoxon_signed_rank",
  "one_way_anova",
  "welch_anova",
  "kruskal_wallis",
  "repeated_measures_anova",
  "friedman",
  "two_way_anova",
  "mixed_anova",
  "mixed_model",
  "pearson",
  "spearman",
  "one_sample_t",
  "log_rank",
]);

export const AnalysisRecommendationSchema = z.object({
  templateId: AnalysisTemplateIdSchema,
  templateVersion: z.string().min(1),
  recommendedMethod: StatisticalMethodSchema,
  alternativeMethods: z.array(StatisticalMethodSchema),
  reasonCode: z.string().min(1),
  explanation: z.string().min(1),
  statisticalNDefinition: z.string().min(1),
  multiplicityMethod: z.string().min(1).nullable().optional(),
  decision: z
    .object({
      kind: z.enum(["accepted", "overridden"]),
      selectedMethod: StatisticalMethodSchema,
      overrideReason: z.string().min(1).optional(),
    })
    .optional(),
});

export const EngineObservationSchema = z.object({
  observationId: EntityIdSchema,
  conditionId: EntityIdSchema,
  value: z.number(),
  experimentalUnitId: EntityIdSchema,
  pairId: EntityIdSchema.optional(),
  blockId: EntityIdSchema.optional(),
});

const AnalysisOptionsSchema = z.object({
  alternative: z.enum(["two_sided", "less", "greater"]).default("two_sided"),
  confidenceLevel: z.number().gt(0).lt(1).default(0.95),
  multiplicityMethod: z.string().nullable().default(null),
});

export const TwoConditionAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.1.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: AnalysisTemplateIdSchema,
  templateVersion: z.string().min(1),
  method: StatisticalMethodSchema,
  contrastConditionIds: z.tuple([EntityIdSchema, EntityIdSchema]),
  observations: z.array(EngineObservationSchema).min(2),
  options: AnalysisOptionsSchema,
});

export const MultiGroupAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.2.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D03"),
  templateVersion: z.string().min(1),
  method: z.enum(["welch_anova", "one_way_anova", "kruskal_wallis"]),
  conditionIds: z.array(EntityIdSchema).min(3),
  controlConditionId: EntityIdSchema.optional(),
  contrastIntent: z
    .enum(["all_pairs", "control_vs_many", "omnibus_only", "planned_comparisons"])
    .default("all_pairs"),
  plannedContrastConditionIds: z.array(z.tuple([EntityIdSchema, EntityIdSchema])).optional(),
  primaryContrastConditionIds: z.tuple([EntityIdSchema, EntityIdSchema]),
  observations: z.array(EngineObservationSchema).min(6),
  options: AnalysisOptionsSchema.extend({
    alternative: z.literal("two_sided").default("two_sided"),
    multiplicityMethod: z
      .enum([
        "games_howell_all_pairs",
        "tukey_hsd_all_pairs",
        "dunnett_control_vs_many",
        "holm_planned_comparisons",
      ])
      .nullable(),
  }),
});

export const RepeatedGroupAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.3.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D04"),
  templateVersion: z.string().min(1),
  method: z.literal("repeated_measures_anova"),
  conditionIds: z.array(EntityIdSchema).min(3),
  primaryContrastConditionIds: z.tuple([EntityIdSchema, EntityIdSchema]),
  observations: z.array(EngineObservationSchema.extend({ pairId: EntityIdSchema })).min(6),
  options: AnalysisOptionsSchema.extend({
    multiplicityMethod: z.literal("holm_paired_all_pairs"),
  }),
});

const FactorialFactorSchema = z.object({
  factorId: EntityIdSchema,
  levelIds: z.array(EntityIdSchema).min(2),
  levelGroups: z
    .array(
      z.object({
        groupId: EntityIdSchema,
        levelIds: z.array(EntityIdSchema).min(1),
      }),
    )
    .optional(),
});

export const FactorialAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.4.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D05"),
  templateVersion: z.string().min(1),
  method: z.literal("two_way_anova"),
  factors: z.tuple([FactorialFactorSchema, FactorialFactorSchema]),
  conditions: z
    .array(
      z.object({
        conditionId: EntityIdSchema,
        factorALevelId: EntityIdSchema,
        factorBLevelId: EntityIdSchema,
      }),
    )
    .min(4),
  primaryContrastConditionIds: z.tuple([EntityIdSchema, EntityIdSchema]),
  observations: z.array(EngineObservationSchema).min(8),
  options: AnalysisOptionsSchema.extend({
    multiplicityMethod: z.literal("holm_all_cell_pairs"),
  }),
});

export const CorrelationAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.5.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D09"),
  templateVersion: z.string().min(1),
  method: z.enum(["pearson", "spearman"]),
  variableConditionIds: z.tuple([EntityIdSchema, EntityIdSchema]),
  observations: z.array(EngineObservationSchema.extend({ pairId: EntityIdSchema })).min(6),
  options: AnalysisOptionsSchema.extend({
    multiplicityMethod: z.null(),
  }),
});

export const LongitudinalMixedAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.6.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D06"),
  templateVersion: z.string().min(1),
  method: z.literal("mixed_anova"),
  withinFactor: z
    .object({
      role: z.enum(["time", "numeric_covariate", "categorical"]),
      title: z.string().min(1),
      unit: z.string(),
    })
    .optional(),
  conditionIds: z.array(EntityIdSchema).min(2),
  timePoints: z.array(z.object({ timePointId: EntityIdSchema, value: z.number().finite() })).min(2),
  observations: z
    .array(
      EngineObservationSchema.extend({
        pairId: EntityIdSchema,
        timePointId: EntityIdSchema,
      }),
    )
    .min(8),
  options: AnalysisOptionsSchema.extend({
    alternative: z.literal("two_sided").default("two_sided"),
    multiplicityMethod: z.null(),
  }),
});

export const IndependentRepeatedAxisAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.7.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D07"),
  templateVersion: z.string().min(1),
  method: z.literal("two_way_anova"),
  conditionIds: z.array(EntityIdSchema).min(2),
  withinFactor: z.object({
    role: z.enum(["time", "numeric_covariate", "categorical"]),
    title: z.string().min(1),
    unit: z.string(),
    levels: z
      .array(
        z.object({
          levelId: EntityIdSchema,
          value: z.number().finite(),
        }),
      )
      .min(2),
  }),
  observations: z
    .array(
      EngineObservationSchema.extend({ withinFactorLevelId: EntityIdSchema }).superRefine(
        (observation, context) => {
          if (observation.pairId !== undefined || observation.blockId !== undefined) {
            context.addIssue({
              code: "custom",
              message: "D07 independent-cell observations cannot carry pairId or blockId",
            });
          }
        },
      ),
    )
    .min(8),
  options: AnalysisOptionsSchema.extend({
    alternative: z.literal("two_sided").default("two_sided"),
    multiplicityMethod: z.null(),
  }),
});

export const SurvivalObservationSchema = z.object({
  observationId: EntityIdSchema,
  conditionId: EntityIdSchema,
  experimentalUnitId: EntityIdSchema,
  followUpTime: z.number().finite().nonnegative(),
  eventObserved: z.boolean(),
  value: z.never().optional(),
  pairId: z.never().optional(),
  blockId: z.never().optional(),
});

export const SurvivalAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.8.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D11"),
  templateVersion: z.string().min(1),
  method: z.literal("log_rank"),
  conditionIds: z.array(EntityIdSchema).min(2),
  observations: z.array(SurvivalObservationSchema).min(2),
  options: AnalysisOptionsSchema.extend({
    alternative: z.literal("two_sided").default("two_sided"),
    multiplicityMethod: z.null(),
  }),
});

export const OneSampleAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.9.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D12"),
  templateVersion: z.string().min(1),
  method: z.literal("one_sample_t"),
  conditionId: EntityIdSchema,
  nullValue: z.number().finite(),
  observations: z.array(EngineObservationSchema).min(2),
  options: AnalysisOptionsSchema.extend({ multiplicityMethod: z.null() }),
});

export const CategoricalRepeatedStateAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.10.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D13"),
  templateVersion: z.string().min(1),
  method: z.literal("mixed_anova"),
  conditionIds: z.array(EntityIdSchema).min(2),
  withinFactor: z.object({
    role: z.literal("categorical"),
    title: z.string().min(1),
    unit: z.literal(""),
  }),
  stateLevels: z
    .array(
      z.object({
        levelId: EntityIdSchema,
        label: z.string().min(1),
        order: z.number().int().nonnegative(),
      }),
    )
    .min(2),
  observations: z
    .array(EngineObservationSchema.extend({ pairId: EntityIdSchema, stateLevelId: EntityIdSchema }))
    .min(8),
  options: AnalysisOptionsSchema.extend({
    alternative: z.literal("two_sided").default("two_sided"),
    multiplicityMethod: z.null(),
  }),
});

export const AnalysisEngineRequestSchema = z.discriminatedUnion("protocolVersion", [
  TwoConditionAnalysisEngineRequestSchema,
  MultiGroupAnalysisEngineRequestSchema,
  RepeatedGroupAnalysisEngineRequestSchema,
  FactorialAnalysisEngineRequestSchema,
  CorrelationAnalysisEngineRequestSchema,
  LongitudinalMixedAnalysisEngineRequestSchema,
  IndependentRepeatedAxisAnalysisEngineRequestSchema,
  SurvivalAnalysisEngineRequestSchema,
  OneSampleAnalysisEngineRequestSchema,
  CategoricalRepeatedStateAnalysisEngineRequestSchema,
]);

export const EstimateSchema = z.object({
  name: z.string().min(1),
  value: z.number(),
  standardError: z.number().nonnegative().nullable(),
  confidenceInterval: z
    .object({
      level: z.number().gt(0).lt(1),
      lower: z.number(),
      upper: z.number(),
    })
    .nullable(),
});

export const TestResultSchema = z.object({
  name: z.string().min(1),
  statisticName: z.string().min(1),
  statistic: z.number(),
  degreesOfFreedom: z.array(z.number()).nullable(),
  pValue: z.number().min(0).max(1),
  adjustedPValue: z.number().min(0).max(1).nullable(),
  effectSizeName: z.string().nullable(),
  effectSize: z.number().nullable(),
});

export const AnalysisEngineResultSchema = z.object({
  protocolVersion: z.enum([
    "0.1.0",
    "0.2.0",
    "0.3.0",
    "0.4.0",
    "0.5.0",
    "0.6.0",
    "0.7.0",
    "0.8.0",
    "0.9.0",
    "0.10.0",
  ]),
  requestId: EntityIdSchema,
  status: z.enum(["ok", "validation_error", "engine_error"]),
  engine: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    packages: z.record(z.string(), z.string()),
  }),
  estimates: z.array(EstimateSchema),
  tests: z.array(TestResultSchema),
  factorMetadata: z
    .object({
      withinFactor: z.object({
        role: z.enum(["time", "numeric_covariate", "categorical"]),
        title: z.string().min(1),
        unit: z.string(),
      }),
      effectIds: z.object({
        interaction: z.literal("condition_by_within_factor_interaction"),
        condition: z.literal("condition_main_effect"),
        withinFactor: z.literal("within_factor_main_effect"),
      }),
      legacyEffectAliases: z.record(z.string(), z.string()),
    })
    .optional(),
  survival: z
    .object({
      groups: z.array(
        z.object({
          conditionId: EntityIdSchema,
          n: z.number().int().positive(),
          events: z.number().int().nonnegative(),
          censored: z.number().int().nonnegative(),
          curve: z.array(
            z.object({
              time: z.number().finite().nonnegative(),
              survival: z.number().min(0).max(1),
              atRisk: z.number().int().nonnegative(),
              events: z.number().int().nonnegative(),
              censored: z.number().int().nonnegative(),
            }),
          ),
          censorTimes: z.array(z.number().finite().nonnegative()),
        }),
      ),
    })
    .optional(),
  diagnostics: z.array(z.object({ code: z.string(), message: z.string() })),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  completedAt: IsoDateTimeSchema,
});

export const AnalysisHistoryEntrySchema = z.object({
  id: EntityIdSchema,
  analysisId: EntityIdSchema,
  action: z.enum(["created", "method_changed", "executed", "marked_stale"]),
  reason: z.string().min(1),
  actor: z.string().min(1),
  occurredAt: IsoDateTimeSchema,
});

export type AnalysisRecommendation = z.infer<typeof AnalysisRecommendationSchema>;
export type AnalysisEngineRequest = z.infer<typeof AnalysisEngineRequestSchema>;
export type AnalysisEngineResult = z.infer<typeof AnalysisEngineResultSchema>;
