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
]);

export const GraphSpecSchema = z
  .object({
    id: EntityIdSchema,
    version: z.literal("0.1.0"),
    type: GraphTypeSchema,
    dataSource: z.object({
      kind: z.enum(["raw_revision", "derived_dataset", "analysis_result"]),
      id: EntityIdSchema,
      revision: z.string().min(1),
    }),
    analysisResultId: EntityIdSchema.nullable(),
    mappings: z.object({
      x: z.string().min(1),
      y: z.string().min(1),
      color: z.string().optional(),
      pair: z.string().optional(),
      facet: z.string().optional(),
    }),
    summary: z.object({
      center: z.enum(["none", "mean", "median"]),
      interval: z.enum(["none", "sd", "sem", "ci"]),
      confidenceLevel: z.number().gt(0).lt(1).optional(),
    }),
    appearance: z.object({
      palette: z.array(z.string()).min(1),
      pointSize: z.number().positive(),
      opacity: z.number().min(0).max(1),
      showRawPoints: z.boolean(),
      showPairedLines: z.boolean(),
    }),
    axes: z.object({
      yStartAtZero: z.boolean(),
      yScale: z.enum(["linear", "log10"]),
      xLabel: z.string(),
      yLabel: z.string(),
    }),
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
  });

export type GraphSpec = z.infer<typeof GraphSpecSchema>;

export * from "./core-model";
export * from "./heatmap";
export * from "./survival";

export function createHeatmapGraphSpec(
  input: Readonly<{
    graphId: string;
    dataSource: GraphSpec["dataSource"];
    transform: "none" | "row_z_score" | "column_z_score" | "log10";
    range?: Readonly<{ min: number; max: number }> | null;
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
      palette: ["#3b4cc0", "#f7f7f7", "#b40426"],
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
      palette: ["#4477AA", "#CC6677", "#228833"],
      pointSize: 5,
      opacity: 1,
      showRawPoints: false,
      showPairedLines: false,
    },
    axes: {
      yStartAtZero: true,
      yScale: "linear",
      xLabel: input.timeLabel,
      yLabel: "Survival probability",
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
