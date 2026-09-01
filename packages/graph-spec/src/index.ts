import { z } from "zod";
import { EntityIdSchema } from "@lsaa/domain";

export const GraphTypeSchema = z.enum([
  "dot_summary",
  "paired_dot",
  "grouped_dot",
  "raw_and_replicate_summary",
  "scatter",
  "time_course",
  "dose_response",
  "survival_curve",
  "heatmap",
  "histogram",
  "ecdf",
  "nonlinear_xy",
]);

export const GraphDataSetSemanticsSchema = z
  .object({
    displaySet: z.object({
      conditionIds: z.array(EntityIdSchema).default([]),
      timePointIds: z.array(EntityIdSchema).default([]),
    }),
    analysisSet: z.object({
      conditionIds: z.array(EntityIdSchema).default([]),
      timePointIds: z.array(EntityIdSchema).default([]),
    }),
    comparisonSet: z
      .array(
        z.object({
          id: z.string().min(1),
          conditionIds: z.tuple([EntityIdSchema, EntityIdSchema]),
        }),
      )
      .default([]),
    annotationSet: z.array(z.object({ comparisonId: z.string().min(1) })).default([]),
  })
  .default({
    displaySet: { conditionIds: [], timePointIds: [] },
    analysisSet: { conditionIds: [], timePointIds: [] },
    comparisonSet: [],
    annotationSet: [],
  });

/**
 * Presentation state shared by the full Graph editor.
 *
 * This is deliberately separate from analysis/data-set selection: an unresolved
 * rectangular table may use the production Graph editor without claiming a
 * biological unit, pairing relation, or inferential design.  Keeping the
 * presentation in GraphSpec also makes save/reopen lossless for Graph-only
 * projects instead of maintaining a second, reduced editor contract.
 */
export const GraphEditorPresentationSchema = z.object({
  graphType: z.enum([
    "dot",
    "paired_dot",
    "box",
    "violin",
    "bar",
    "line",
    "scatter",
    "stacked",
    "stacked_100",
    "category_percentage",
  ]),
  grouping: z.object({
    x: z.object({
      source: z.enum(["condition", "factor"]),
      factorId: EntityIdSchema.optional(),
      factorIds: z.array(EntityIdSchema).optional(),
    }),
    series: z.object({
      source: z.enum(["none", "factor", "time"]),
      factorId: EntityIdSchema.optional(),
    }),
    color: z
      .object({
        source: z.enum(["none", "factor", "time"]),
        factorId: EntityIdSchema.optional(),
      })
      .optional(),
    shape: z
      .object({
        source: z.enum(["none", "factor", "time"]),
        factorId: EntityIdSchema.optional(),
      })
      .optional(),
    facet: z
      .object({
        source: z.literal("factor"),
        factorId: EntityIdSchema,
        axisPolicy: z.enum(["shared", "independent_x", "independent_y", "independent_both"]),
        levelOrder: z.array(z.string()),
      })
      .nullable(),
  }),
  layers: z.object({
    raw: z.boolean(),
    distribution: z.boolean(),
    experiment: z.boolean(),
    overall: z.boolean(),
    violin: z.boolean(),
    box: z.boolean(),
    errorBar: z.boolean(),
    connectingLine: z.boolean(),
  }),
  appearance: z.object({
    errorBar: z.enum(["sd", "sem", "none"]),
    palette: z.enum(["single", "condition", "grayscale", "colorblind", "publication"]),
    pointSize: z.number().min(4).max(10),
    pointOpacity: z.number().min(0.05).max(1),
    axisLineWidth: z.number().min(0.8).max(2.4),
    hierarchicalLabels: z.boolean(),
    jitter: z.number().min(0).max(24),
    fontFamily: z.enum(["arial", "helvetica", "system"]),
    graphTitleFontSize: z.number().min(12).max(32),
    axisTitleFontSize: z.number().min(10).max(28),
    tickFontSize: z.number().min(9).max(24),
    hierarchyFontSize: z.number().min(9).max(24),
    legendFontSize: z.number().min(9).max(24),
    legendPosition: z.enum(["hidden", "top", "right", "inside"]),
    seriesColors: z.record(EntityIdSchema, z.string()),
    seriesStyles: z.record(
      z.string(),
      z.object({
        color: z.string().optional(),
        fill: z.enum(["none", "white", "series", "custom"]).optional(),
        fillColor: z.string().optional(),
        lineStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
        lineWidth: z.number().min(0.5).max(8).optional(),
        pointStyle: z.enum(["circle", "square", "triangle", "diamond"]).optional(),
        legendLabel: z.string().min(1).optional(),
        order: z.number().int().optional(),
        visible: z.boolean(),
      }),
    ),
    distributionFill: z.enum(["none", "white", "series", "custom"]),
    distributionFillColor: z.string(),
    distributionOutlineColor: z.string(),
    barWidth: z.number().min(0.25).max(1),
    withinGroupSpacing: z.number().min(0.4).max(1.4),
    betweenGroupSpacing: z.number().min(0.8).max(2.4),
    barOutline: z.boolean(),
    barMeanMarker: z.boolean(),
    boxWhiskerMode: z.enum(["tukey_1_5_iqr", "min_max"]),
    uncertaintyStyle: z.enum(["error_bars", "ribbon", "none"]),
    ribbonOpacity: z.number().min(0.05).max(0.6),
    rawPointColor: z.string(),
    summaryColor: z.string(),
    errorBarColor: z.string(),
    connectingLineColor: z.string(),
    summaryLineWidth: z.number().min(0.6).max(4),
    errorBarLineWidth: z.number().min(0.6).max(4),
    connectingLineWidth: z.number().min(0.6).max(4),
    distributionLineWidth: z.number().min(0.6).max(4),
    canvasPreset: z.enum(["compact", "standard", "wide"]),
    sidePadding: z.number().min(56).max(180),
  }),
  axes: z.object({
    xSemantic: z.enum(["categorical", "time", "numeric_covariate"]),
    xTitle: z.string(),
    xUnit: z.string(),
    xScale: z.enum(["linear", "log10"]).optional(),
    xRangeMode: z.enum(["auto", "manual"]).optional(),
    xMin: z.number().finite().nullable().optional(),
    xMax: z.number().finite().nullable().optional(),
    xTickMode: z.enum(["auto", "manual"]).optional(),
    xTickInterval: z.number().positive().nullable().optional(),
    showMinorTicks: z.boolean().optional(),
    tickDirection: z.enum(["inside", "outside"]).optional(),
    showCategoryGroupSeparators: z.boolean().optional(),
    categoryLabelRotation: z.enum(["none", "minus_30", "minus_45", "minus_90"]).optional(),
    yTitle: z.string(),
    yRangeMode: z.enum(["auto", "manual"]),
    yMin: z.number().finite().nullable(),
    yMax: z.number().finite().nullable(),
    yScale: z.enum(["linear", "log10"]),
    showCategoryLabels: z.boolean(),
    hierarchyOrder: z.array(EntityIdSchema),
    spacing: z.number().min(0.7).max(1.6),
    yTickMode: z.enum(["auto", "manual"]),
    yTickInterval: z.number().positive().nullable(),
    referenceLines: z
      .array(
        z.object({
          id: EntityIdSchema,
          value: z.number().finite(),
          label: z.string().optional(),
          color: z.string(),
          lineStyle: z.enum(["solid", "dashed", "dotted"]),
        }),
      )
      .optional(),
  }),
});

export type GraphEditorPresentation = z.infer<typeof GraphEditorPresentationSchema>;

export const GraphSpecSchema = z
  .object({
    id: EntityIdSchema,
    version: z.literal("0.1.0"),
    type: GraphTypeSchema,
    dataSource: z.object({
      kind: z.enum([
        "raw_revision",
        "derived_dataset",
        "analysis_result",
        /** A graph-only table is not a biological raw revision or an analysis result. */
        "visualization_table",
      ]),
      id: EntityIdSchema,
      revision: z.string().min(1),
    }),
    analysisResultId: EntityIdSchema.nullable(),
    /** Independent display, analysis, planned-comparison, and visible-annotation ranges. */
    dataSets: GraphDataSetSemanticsSchema,
    mappings: z.object({
      x: z.string().min(1),
      xHierarchy: z.array(z.string().min(1)).default([]),
      y: z.string().min(1),
      /** First-class visual series mapping. `color` remains a backward-compatible channel. */
      series: z.string().min(1).optional(),
      color: z.string().optional(),
      /** Independent marker-shape channel; it may intentionally differ from color or series. */
      shape: z.string().min(1).optional(),
      pair: z.string().optional(),
      facet: z.string().optional(),
      auxiliaryReference: z.string().optional(),
    }),
    summary: z.object({
      center: z.enum(["none", "mean", "median"]),
      interval: z.enum(["none", "sd", "sem", "ci"]),
      confidenceLevel: z.number().gt(0).lt(1).optional(),
    }),
    appearance: z.object({
      palette: z.array(z.string()).min(1),
      pointSize: z.number().positive(),
      fontSize: z.number().min(9).max(24).optional(),
      opacity: z.number().min(0).max(1),
      showRawPoints: z.boolean(),
      showPairedLines: z.boolean(),
      distributionFill: z.enum(["none", "white", "series", "custom"]).default("white"),
      distributionFillColor: z.string().default("#ffffff"),
      distributionOutlineColor: z.string().default("#111111"),
      barWidth: z.number().min(0.25).max(1).default(0.72),
      withinGroupSpacing: z.number().min(0.4).max(1.4).default(0.72),
      betweenGroupSpacing: z.number().min(0.8).max(2.4).default(1.35),
      barOutline: z.boolean().default(true),
      barMeanMarker: z.boolean().default(false),
      boxWhiskerMode: z.enum(["tukey_1_5_iqr", "min_max"]).default("tukey_1_5_iqr"),
      uncertaintyStyle: z.enum(["error_bars", "ribbon", "none"]).default("error_bars"),
      ribbonOpacity: z.number().min(0.05).max(0.6).default(0.18),
      seriesStyles: z
        .record(
          z.string(),
          z.object({
            color: z.string().optional(),
            fill: z.enum(["none", "white", "series", "custom"]).optional(),
            fillColor: z.string().optional(),
            lineStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
            lineWidth: z.number().min(0.5).max(8).optional(),
            pointStyle: z.enum(["circle", "square", "triangle", "diamond"]).optional(),
            legendLabel: z.string().min(1).optional(),
            order: z.number().int().optional(),
            visible: z.boolean().default(true),
          }),
        )
        .default({}),
    }),
    axes: z.object({
      yStartAtZero: z.boolean(),
      yScale: z.enum(["linear", "log10"]),
      xScale: z.enum(["linear", "log10"]).optional(),
      xLabel: z.string(),
      yLabel: z.string(),
      showMinorTicks: z.boolean().default(true),
      /** Scientific figures conventionally place axis ticks outside the plotting area. */
      tickDirection: z.enum(["inside", "outside"]).default("outside"),
      /** Renderer hint for boundaries between adjacent categorical x groups. */
      showCategoryGroupSeparators: z.boolean().default(false),
    }),
    /** Full visual-editor state; never analysis authority. */
    editorPresentation: GraphEditorPresentationSchema.optional(),
    distribution: z
      .object({
        binCount: z.number().int().min(1).max(200).nullable(),
        binWidth: z.number().positive().nullable(),
      })
      .optional(),
    heatmap: z
      .object({
        transform: z.enum(["none", "row_z_score", "column_z_score", "log10"]),
        transformVersion: z.literal("0.1.0"),
        min: z.number().finite().nullable(),
        max: z.number().finite().nullable(),
        missingColor: z.string().min(1),
        showCellValues: z.boolean(),
      })
      .optional(),
    annotations: z
      .array(
        z.object({
          id: EntityIdSchema,
          analysisResultId: EntityIdSchema,
          comparisonId: z.string().min(1).optional(),
          testIndex: z.number().int().min(0),
          mode: z.enum(["exact_p", "symbol"]),
          showNonSignificant: z.boolean().default(true),
          endpoints: z
            .tuple([
              z.object({ groupId: EntityIdSchema, seriesLevelId: EntityIdSchema.optional() }),
              z.object({ groupId: EntityIdSchema, seriesLevelId: EntityIdSchema.optional() }),
            ])
            .optional(),
          pValueStatus: z.enum(["adjusted", "unadjusted"]).optional(),
          lineage: z
            .object({
              derivedMetric: z.string().optional(),
              timePointId: EntityIdSchema.optional(),
              endpoint: z.string().optional(),
              windowStart: z.number().finite().optional(),
              windowEnd: z.number().finite().optional(),
            })
            .optional(),
        }),
      )
      .default([]),
    facet: z
      .object({
        factorId: EntityIdSchema,
        levelOrder: z.array(z.string()).default([]),
        axisPolicy: z
          .enum(["shared", "independent_x", "independent_y", "independent_both"])
          .default("shared"),
      })
      .optional(),
  })
  .superRefine((spec, ctx) => {
    if (spec.type === "paired_dot" && !spec.mappings.pair) {
      ctx.addIssue({
        code: "custom",
        path: ["mappings", "pair"],
        message: "Paired-dot graphs require an explicit pair mapping",
      });
    }
    if (spec.type === "paired_dot" && !spec.appearance.showPairedLines) {
      ctx.addIssue({
        code: "custom",
        path: ["appearance", "showPairedLines"],
        message: "The Core paired-dot graph must show within-unit connections",
      });
    }
    if (spec.type === "scatter" && !spec.mappings.pair) {
      ctx.addIssue({
        code: "custom",
        path: ["mappings", "pair"],
        message: "D09 scatter graphs require an explicit experimental-unit pair mapping",
      });
    }
    if (
      spec.type === "scatter" &&
      (spec.summary.center !== "none" || spec.summary.interval !== "none")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["summary"],
        message: "The Core D09 scatter graph does not add a group mean or error bar",
      });
    }
    if (spec.summary.interval === "ci" && spec.summary.confidenceLevel === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["summary", "confidenceLevel"],
        message: "A confidence interval requires an explicit confidence level",
      });
    }
    if (spec.type === "heatmap" && !spec.heatmap) {
      ctx.addIssue({
        code: "custom",
        path: ["heatmap"],
        message: "Heatmap graphs require explicit transform and missing-value settings",
      });
    }
    if ((spec.type === "histogram" || spec.type === "ecdf") && !spec.distribution) {
      ctx.addIssue({
        code: "custom",
        path: ["distribution"],
        message: "Distribution graphs require explicit bin metadata",
      });
    }
    const analysisIds = new Set(spec.dataSets.analysisSet.conditionIds);
    spec.dataSets.comparisonSet.forEach((comparison, comparisonIndex) => {
      comparison.conditionIds.forEach((conditionId, conditionIndex) => {
        if (analysisIds.size > 0 && !analysisIds.has(conditionId)) {
          ctx.addIssue({
            code: "custom",
            path: ["dataSets", "comparisonSet", comparisonIndex, "conditionIds", conditionIndex],
            message: "Planned comparisons must reference the analysis set",
          });
        }
      });
    });
    const comparisonIds = new Set(spec.dataSets.comparisonSet.map(({ id }) => id));
    spec.dataSets.annotationSet.forEach(({ comparisonId }, annotationIndex) => {
      if (!comparisonIds.has(comparisonId)) {
        ctx.addIssue({
          code: "custom",
          path: ["dataSets", "annotationSet", annotationIndex, "comparisonId"],
          message: "Visible annotations must reference a selected comparison",
        });
      }
    });
  });

export type GraphSpec = z.infer<typeof GraphSpecSchema>;

export * from "./core-model";
export * from "./heatmap";
export * from "./survival";
export * from "./distribution";
export * from "./regression";
export * from "./nonlinear-fit";
export * from "./core-v1";

export function createHeatmapGraphSpec(
  input: Readonly<{
    graphId: string;
    dataSource: GraphSpec["dataSource"];
    transform: "none" | "row_z_score" | "column_z_score" | "log10";
    range?: Readonly<{ min: number; max: number }> | null;
    palette?: readonly string[];
    missingColor?: string;
    showCellValues?: boolean;
  }>,
): GraphSpec {
  return GraphSpecSchema.parse({
    id: input.graphId,
    version: "0.1.0",
    type: "heatmap",
    dataSource: input.dataSource,
    analysisResultId: null,
    mappings: { x: "columnId", y: "rowId", color: "value" },
    summary: { center: "none", interval: "none" },
    appearance: {
      palette: input.palette ? [...input.palette] : ["#3b4cc0", "#f7f7f7", "#b40426"],
      pointSize: 1,
      opacity: 1,
      showRawPoints: false,
      showPairedLines: false,
    },
    axes: { yStartAtZero: false, yScale: "linear", xLabel: "Samples", yLabel: "Features" },
    heatmap: {
      transform: input.transform,
      transformVersion: "0.1.0",
      min: input.range?.min ?? null,
      max: input.range?.max ?? null,
      missingColor: input.missingColor ?? "#d1d5db",
      showCellValues: input.showCellValues ?? false,
    },
  });
}

export function createSurvivalGraphSpec(
  input: Readonly<{
    graphId: string;
    dataSource: GraphSpec["dataSource"];
    analysisResultId: string;
    timeLabel: string;
    probabilityLabel?: string;
    palette?: readonly string[];
    fontSize?: number;
  }>,
): GraphSpec {
  return GraphSpecSchema.parse({
    id: input.graphId,
    version: "0.1.0",
    type: "survival_curve",
    dataSource: input.dataSource,
    analysisResultId: input.analysisResultId,
    mappings: { x: "followUpTime", y: "survivalProbability", color: "conditionId" },
    summary: { center: "none", interval: "none" },
    appearance: {
      palette: [...(input.palette ?? ["#4477AA", "#CC6677", "#228833"])],
      pointSize: 5,
      fontSize: input.fontSize ?? 12,
      opacity: 1,
      showRawPoints: false,
      showPairedLines: false,
    },
    axes: {
      yStartAtZero: true,
      yScale: "linear",
      xLabel: input.timeLabel,
      yLabel: input.probabilityLabel ?? "Survival probability",
    },
  });
}

export type CoreTwoConditionGraphInput = {
  graphId: string;
  templateId: "D01" | "D02";
  dataSource: GraphSpec["dataSource"];
  analysisResultId?: string | null;
  yLabel: string;
  yStartAtZero: boolean;
};

export function createCoreTwoConditionGraphSpec(input: CoreTwoConditionGraphInput): GraphSpec {
  const paired = input.templateId === "D02";
  return GraphSpecSchema.parse({
    id: input.graphId,
    version: "0.1.0",
    type: paired ? "paired_dot" : "dot_summary",
    dataSource: input.dataSource,
    analysisResultId: input.analysisResultId ?? null,
    mappings: {
      x: "conditionId",
      y: "value",
      color: "conditionId",
      ...(paired ? { pair: "experimentalUnitId" } : {}),
    },
    summary: {
      center: "mean",
      interval: "sd",
    },
    appearance: {
      palette: ["#4779e8", "#dd8a50"],
      pointSize: 5,
      opacity: 0.9,
      showRawPoints: true,
      showPairedLines: paired,
    },
    axes: {
      yStartAtZero: input.yStartAtZero,
      yScale: "linear",
      xLabel: "Condition",
      yLabel: input.yLabel,
    },
  });
}

export function createCoreCorrelationGraphSpec(input: {
  graphId: string;
  dataSource: GraphSpec["dataSource"];
  analysisResultId?: string | null;
  xConditionId: string;
  yConditionId: string;
  xLabel: string;
  yLabel: string;
}): GraphSpec {
  return GraphSpecSchema.parse({
    id: input.graphId,
    version: "0.1.0",
    type: "scatter",
    dataSource: input.dataSource,
    analysisResultId: input.analysisResultId ?? null,
    mappings: { x: input.xConditionId, y: input.yConditionId, pair: "experimentalUnitId" },
    summary: { center: "none", interval: "none" },
    appearance: {
      palette: ["#4477AA"],
      pointSize: 5,
      opacity: 0.9,
      showRawPoints: true,
      showPairedLines: false,
    },
    axes: {
      yStartAtZero: false,
      yScale: "linear",
      xLabel: input.xLabel,
      yLabel: input.yLabel,
    },
  });
}

export type CoreMultiGroupGraphInput = {
  graphId: string;
  templateId: "D03" | "D05";
  dataSource: GraphSpec["dataSource"];
  analysisResultId?: string | null;
  yLabel: string;
  yStartAtZero: boolean;
};

export function createCoreMultiGroupGraphSpec(input: CoreMultiGroupGraphInput): GraphSpec {
  return GraphSpecSchema.parse({
    id: input.graphId,
    version: "0.1.0",
    type: "grouped_dot",
    dataSource: input.dataSource,
    analysisResultId: input.analysisResultId ?? null,
    mappings: {
      x: "conditionId",
      y: "value",
      color: "conditionId",
    },
    summary: {
      center: "mean",
      interval: "sd",
    },
    appearance: {
      palette: ["#4477AA", "#EE6677", "#228833", "#CCBB44", "#66CCEE", "#AA3377"],
      pointSize: 5,
      opacity: 0.9,
      showRawPoints: true,
      showPairedLines: false,
    },
    axes: {
      yStartAtZero: input.yStartAtZero,
      yScale: "linear",
      xLabel: "Condition",
      yLabel: input.yLabel,
    },
  });
}

export type CoreRepeatedGroupGraphInput = {
  graphId: string;
  templateId: "D04";
  dataSource: GraphSpec["dataSource"];
  analysisResultId?: string | null;
  yLabel: string;
  yStartAtZero: boolean;
};

export function createCoreRepeatedGroupGraphSpec(input: CoreRepeatedGroupGraphInput): GraphSpec {
  return GraphSpecSchema.parse({
    id: input.graphId,
    version: "0.1.0",
    type: "paired_dot",
    dataSource: input.dataSource,
    analysisResultId: input.analysisResultId ?? null,
    mappings: {
      x: "conditionId",
      y: "value",
      color: "conditionId",
      pair: "pairId",
    },
    summary: { center: "mean", interval: "sd" },
    appearance: {
      palette: ["#4477AA", "#EE6677", "#228833", "#CCBB44", "#66CCEE", "#AA3377"],
      pointSize: 5,
      opacity: 0.9,
      showRawPoints: true,
      showPairedLines: true,
    },
    axes: {
      yStartAtZero: input.yStartAtZero,
      yScale: "linear",
      xLabel: "Condition",
      yLabel: input.yLabel,
    },
  });
}
