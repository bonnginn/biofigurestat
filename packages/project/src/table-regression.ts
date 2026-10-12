import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "@lsaa/domain";
import {
  SimpleLinearRegressionEngineRequestSchema,
  AnalysisEngineResultSchema,
} from "@lsaa/analysis-contracts";

/** Optional, separately versioned analysis workspace; the source table remains unresolved for other analyses. */
export const TableRegressionDraftSchema = z
  .object({
    text: z.string(),
    includeIntercept: z.boolean(),
    xLabel: z.string(),
    yLabel: z.string(),
    xUnit: z.string(),
    yUnit: z.string(),
    xScale: z.enum(["linear", "log10"]),
    yScale: z.enum(["linear", "log10"]),
    showBand: z.boolean(),
  })
  .strict();
export const TableRegressionExecutionSchema = z
  .object({
    sourceDataRevisionId: EntityIdSchema,
    draft: TableRegressionDraftSchema,
    request: SimpleLinearRegressionEngineRequestSchema,
    result: AnalysisEngineResultSchema,
  })
  .strict()
  .superRefine(({ request, result }, ctx) => {
    if (
      result.protocolVersion !== request.protocolVersion ||
      result.requestId !== request.requestId ||
      result.status !== "ok"
    )
      ctx.addIssue({ code: "custom", message: "Regression request/result identity mismatch" });
    if (new Set(request.points.map((p) => p.experimentalUnitId)).size !== request.points.length)
      ctx.addIssue({
        code: "custom",
        message: "Regression requires distinct explicitly confirmed units",
      });
  });
export const TableRegressionWorkspaceSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    independentUnitsConfirmed: z.literal(true),
    sourceDataRevisionId: EntityIdSchema,
    draft: TableRegressionDraftSchema,
    draftHistory: z.array(
      z
        .object({
          capturedAt: IsoDateTimeSchema,
          sourceDataRevisionId: EntityIdSchema,
          draft: TableRegressionDraftSchema,
        })
        .strict(),
    ),
    executions: z.array(TableRegressionExecutionSchema),
    activeRequestId: EntityIdSchema.nullable(),
  })
  .strict();
export type TableRegressionDraft = z.infer<typeof TableRegressionDraftSchema>;
export type TableRegressionExecution = z.infer<typeof TableRegressionExecutionSchema>;
export type TableRegressionWorkspace = z.infer<typeof TableRegressionWorkspaceSchema>;
export type TableRegressionSnapshot = Readonly<{
  draft: TableRegressionDraft;
  execution: TableRegressionExecution | null;
}>;

export function regressionInputsEqual(a: TableRegressionDraft, b: TableRegressionDraft): boolean {
  return (
    a.text === b.text &&
    a.includeIntercept === b.includeIntercept &&
    a.xLabel === b.xLabel &&
    a.yLabel === b.yLabel &&
    a.xUnit === b.xUnit &&
    a.yUnit === b.yUnit
  );
}
