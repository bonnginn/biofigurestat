import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "@lsaa/domain";

import {
  UnresolvedVisualizationProjectStateSchema,
  type UnresolvedVisualizationProjectState,
} from "./unresolved-visualization";

export const EXPERIMENT_ENTRY_SOURCE_HISTORY_SCHEMA_VERSION = "0.1.0" as const;

/**
 * Read-only evidence captured when an unresolved visualization is promoted to
 * an Experiment project.  It is deliberately separate from canonical raw
 * revisions: canonical observations remain the only authority for analysis,
 * while this snapshot preserves every source revision and historical Graph.
 */
export const UnresolvedVisualizationPromotionHistoryEntrySchema = z
  .object({
    id: EntityIdSchema,
    kind: z.literal("unresolved_visualization_promotion"),
    capturedAt: IsoDateTimeSchema,
    sourceState: UnresolvedVisualizationProjectStateSchema,
    promotion: z
      .object({
        sourceActiveDataRevisionId: EntityIdSchema,
        sourceActiveGraphId: EntityIdSchema.nullable(),
        promotedWorkspaceGraphId: EntityIdSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.promotion.sourceActiveDataRevisionId !== entry.sourceState.activeDataRevisionId) {
      ctx.addIssue({
        code: "custom",
        path: ["promotion", "sourceActiveDataRevisionId"],
        message: "Promotion history must identify the active source data revision exactly",
      });
    }
    if (entry.promotion.sourceActiveGraphId !== entry.sourceState.activeGraphId) {
      ctx.addIssue({
        code: "custom",
        path: ["promotion", "sourceActiveGraphId"],
        message: "Promotion history must identify the active source Graph exactly",
      });
    }
    if (entry.promotion.promotedWorkspaceGraphId !== entry.sourceState.activeGraphId) {
      ctx.addIssue({
        code: "custom",
        path: ["promotion", "promotedWorkspaceGraphId"],
        message: "Only the active source Graph may be rebound into the Experiment workspace",
      });
    }
  });

export const ExperimentEntrySourceHistorySchema = z
  .object({
    schemaVersion: z.literal(EXPERIMENT_ENTRY_SOURCE_HISTORY_SCHEMA_VERSION),
    entries: z.array(UnresolvedVisualizationPromotionHistoryEntrySchema).min(1),
  })
  .strict()
  .superRefine((history, ctx) => {
    const ids = new Set<string>();
    history.entries.forEach((entry, index) => {
      if (ids.has(entry.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["entries", index, "id"],
          message: "Entry-source history IDs must be unique",
        });
      }
      ids.add(entry.id);
    });
  });

export type ExperimentEntrySourceHistory = z.infer<typeof ExperimentEntrySourceHistorySchema>;

function safeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function createUnresolvedVisualizationPromotionHistory(input: {
  sourceState: UnresolvedVisualizationProjectState;
  promotedWorkspaceGraphId: string | null;
  capturedAt: string;
}): ExperimentEntrySourceHistory {
  const sourceState = UnresolvedVisualizationProjectStateSchema.parse(input.sourceState);
  return ExperimentEntrySourceHistorySchema.parse({
    schemaVersion: EXPERIMENT_ENTRY_SOURCE_HISTORY_SCHEMA_VERSION,
    entries: [
      {
        id: `entry-source.${safeIdPart(sourceState.metadata.projectId)}.${safeIdPart(sourceState.activeDataRevisionId)}`,
        kind: "unresolved_visualization_promotion",
        capturedAt: input.capturedAt,
        sourceState,
        promotion: {
          sourceActiveDataRevisionId: sourceState.activeDataRevisionId,
          sourceActiveGraphId: sourceState.activeGraphId,
          promotedWorkspaceGraphId: input.promotedWorkspaceGraphId,
        },
      },
    ],
  });
}
