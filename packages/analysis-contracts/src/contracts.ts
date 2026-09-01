import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "@lsaa/domain";
import { EquivalenceAnalysisResultSchema } from "./equivalence";

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
  "D14",
  "D15",
  "D16",
  "D17",
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
  "fisher_exact",
  "pearson_chi_square",
  "mcnemar_exact",
  "simple_linear_regression",
  "nonlinear_xy_fit",
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
        "dunn_holm_all_pairs",
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

const CountCellSchema = z.object({
  rowCategoryId: EntityIdSchema,
  columnCategoryId: EntityIdSchema,
  count: z.number().int().nonnegative(),
});

export const ContingencyAnalysisEngineRequestSchema = z
  .object({
    protocolVersion: z.literal("0.11.0"),
    requestId: EntityIdSchema,
    projectId: EntityIdSchema,
    analysisId: EntityIdSchema,
    templateId: z.literal("D14"),
    templateVersion: z.string().min(1),
    method: z.enum(["fisher_exact", "pearson_chi_square", "mcnemar_exact"]),
    structure: z.enum(["independent", "paired_binary"]),
    experimentalUnit: z.string().min(1),
    rowCategoryIds: z.array(EntityIdSchema).min(2),
    columnCategoryIds: z.array(EntityIdSchema).min(2),
    cells: z.array(CountCellSchema).min(4),
    /** Generic history compatibility; categorical source data remain exclusively in cells. */
    observations: z.array(EngineObservationSchema).max(0).default([]),
    options: AnalysisOptionsSchema.extend({
      alternative: z.literal("two_sided").default("two_sided"),
      multiplicityMethod: z.null(),
    }),
  })
  .superRefine((request, context) => {
    const expected = request.rowCategoryIds.length * request.columnCategoryIds.length;
    const keys = new Set(
      request.cells.map((cell) => `${cell.rowCategoryId}\u0000${cell.columnCategoryId}`),
    );
    if (request.cells.length !== expected || keys.size !== expected) {
      context.addIssue({
        code: "custom",
        path: ["cells"],
        message: "Every contingency cell must be supplied exactly once",
      });
    }
    const isTwoByTwo =
      request.rowCategoryIds.length === 2 && request.columnCategoryIds.length === 2;
    if ((request.method === "fisher_exact" || request.method === "mcnemar_exact") && !isTwoByTwo) {
      context.addIssue({
        code: "custom",
        path: ["method"],
        message: "Fisher and McNemar require a 2 by 2 table",
      });
    }
    if (request.method === "mcnemar_exact" && request.structure !== "paired_binary") {
      context.addIssue({
        code: "custom",
        path: ["structure"],
        message: "McNemar requires paired binary outcomes",
      });
    }
    if (request.method !== "mcnemar_exact" && request.structure !== "independent") {
      context.addIssue({
        code: "custom",
        path: ["structure"],
        message: "Fisher and Chi-square require independent groups",
      });
    }
  });

export const FriedmanAnalysisEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.12.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D15"),
  templateVersion: z.string().min(1),
  method: z.literal("friedman"),
  conditionIds: z.array(EntityIdSchema).min(3),
  observations: z.array(EngineObservationSchema.extend({ pairId: EntityIdSchema })).min(6),
  options: AnalysisOptionsSchema.extend({
    alternative: z.literal("two_sided").default("two_sided"),
    multiplicityMethod: z.literal("holm_wilcoxon_all_pairs"),
  }),
});

export const SimpleLinearRegressionEngineRequestSchema = z.object({
  protocolVersion: z.literal("0.13.0"),
  requestId: EntityIdSchema,
  projectId: EntityIdSchema,
  analysisId: EntityIdSchema,
  templateId: z.literal("D16"),
  templateVersion: z.string().min(1),
  method: z.literal("simple_linear_regression"),
  xLabel: z.string().min(1),
  yLabel: z.string().min(1),
  xUnit: z.string(),
  yUnit: z.string(),
  includeIntercept: z.boolean(),
  points: z
    .array(
      z.object({
        observationId: EntityIdSchema,
        experimentalUnitId: EntityIdSchema,
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    )
    .min(3),
  /** Generic history compatibility; XY source data remain exclusively in points. */
  observations: z.array(EngineObservationSchema).max(0).default([]),
  options: AnalysisOptionsSchema.extend({ multiplicityMethod: z.null() }),
});

const NonlinearParameterMapSchema = z.record(z.string(), z.number().finite());
const NonlinearBoundsMapSchema = z.record(
  z.string(),
  z.object({ lower: z.number().finite(), upper: z.number().finite() }),
);

export const NonlinearXyFitEngineRequestSchema = z
  .object({
    protocolVersion: z.literal("0.14.0"),
    requestId: EntityIdSchema,
    projectId: EntityIdSchema,
    analysisId: EntityIdSchema,
    templateId: z.literal("D17"),
    templateVersion: z.string().min(1),
    method: z.literal("nonlinear_xy_fit"),
    modelId: z.enum(["one_phase_association", "zero_baseline_association", "michaelis_menten"]),
    modelSelectionRationale: z.string().min(1),
    /**
     * Declares how the fitted curve may be interpreted. Repeated observations from the same
     * physical material can support a descriptive point estimate, but not the independent-error
     * standard errors and confidence intervals used by the ordinary D17 fit.
     */
    fitInterpretation: z
      .enum(["inferential_independent_residuals", "descriptive_point_estimate_only"])
      .optional(),
    xLabel: z.string().min(1),
    yLabel: z.string().min(1),
    xUnit: z.string(),
    yUnit: z.string(),
    seriesIds: z.array(EntityIdSchema).min(1),
    points: z
      .array(
        z.object({
          observationId: EntityIdSchema,
          experimentalUnitId: EntityIdSchema,
          seriesId: EntityIdSchema,
          x: z.number().finite().nonnegative(),
          y: z.number().finite(),
        }),
      )
      .min(3),
    initialValues: z.record(EntityIdSchema, NonlinearParameterMapSchema).default({}),
    bounds: z.record(EntityIdSchema, NonlinearBoundsMapSchema).default({}),
    /** Generic history compatibility; XY source data remain exclusively in points. */
    observations: z.array(EngineObservationSchema).max(0).default([]),
    options: AnalysisOptionsSchema.extend({ multiplicityMethod: z.null() }),
  })
  .superRefine((request, context) => {
    if (request.modelId !== "michaelis_menten") return;
    if (request.templateVersion !== "0.2.0") {
      context.addIssue({
        code: "custom",
        path: ["templateVersion"],
        message: "Michaelis-Menten requires D17 template version 0.2.0",
      });
    }
    if (!request.xUnit.trim()) {
      context.addIssue({
        code: "custom",
        path: ["xUnit"],
        message: "Michaelis-Menten requires an explicit substrate-concentration unit",
      });
    }
    if (!request.yUnit.trim()) {
      context.addIssue({
        code: "custom",
        path: ["yUnit"],
        message: "Michaelis-Menten requires an explicit initial-velocity unit",
      });
    }
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
  ContingencyAnalysisEngineRequestSchema,
  FriedmanAnalysisEngineRequestSchema,
  SimpleLinearRegressionEngineRequestSchema,
  NonlinearXyFitEngineRequestSchema,
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
    "0.11.0",
    "0.12.0",
    "0.13.0",
    "0.14.0",
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
  equivalence: EquivalenceAnalysisResultSchema.optional(),
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
  regression: z
    .object({
      slope: z.number().finite(),
      intercept: z.number().finite(),
      rSquared: z.number().min(0).max(1),
      xRange: z.tuple([z.number().finite(), z.number().finite()]),
      confidenceLevel: z.number().gt(0).lt(1),
      fittedLine: z
        .array(
          z.object({
            x: z.number().finite(),
            y: z.number().finite(),
            lower: z.number().finite().nullable(),
            upper: z.number().finite().nullable(),
          }),
        )
        .min(2),
    })
    .optional(),
  nonlinearFit: z
    .object({
      modelId: z.enum(["one_phase_association", "zero_baseline_association", "michaelis_menten"]),
      modelVersion: z.string().min(1),
      modelFormula: z.string().min(1),
      selectionRationale: z.string().min(1),
      series: z.array(
        z.object({
          seriesId: EntityIdSchema,
          converged: z.literal(true),
          parameters: z.array(EstimateSchema).min(2),
          diagnostics: z.object({
            n: z.number().int().positive(),
            distinctX: z.number().int().positive(),
            residualDegreesOfFreedom: z.number().int().positive(),
            rss: z.number().finite().nonnegative(),
            rmse: z.number().finite().nonnegative(),
            rSquared: z.number().min(0).max(1),
            aic: z.number().finite(),
          }),
          initialValues: NonlinearParameterMapSchema,
          bounds: NonlinearBoundsMapSchema,
          fittedCurve: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).min(2),
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
