import { describe, expect, it } from "vitest";

import {
  createUnresolvedVisualizationProjectState,
  type UnresolvedVisualizationProjectState,
} from "./unresolved-visualization";
import {
  createUnresolvedVisualizationPromotionHistory,
  ExperimentEntrySourceHistorySchema,
} from "./entry-source-history";

const now = "2026-08-28T00:00:00.000Z";

function sourceState(): UnresolvedVisualizationProjectState {
  return createUnresolvedVisualizationProjectState({
    metadata: {
      projectId: "visualization.source-history",
      projectName: "Source history",
      experimentDate: "",
      createdAt: now,
      updatedAt: now,
    },
    entryIntent: "graph_only",
    table: {
      id: "table.source-history",
      headers: ["Condition", "Value"],
      rows: [["Control", "1"]],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      sourceKind: "clipboard",
      sourceLabel: "clipboard",
      importedAt: now,
      rawText: "Condition\tValue\nControl\t1",
      sha256: null,
      transformations: ["delimiter_detection"],
    },
    mapping: {
      schemaVersion: "0.1.0",
      sourceLabel: "clipboard",
      delimiter: "tab",
      headerRow: 1,
      columns: [
        { index: 0, header: "Condition", role: "x" },
        { index: 1, header: "Value", role: "y" },
      ],
      identityDecision: "no_id",
      confirmedAt: now,
    },
    actor: "test",
  });
}

describe("Experiment entry-source history", () => {
  it("retains the complete unresolved source as read-only promotion evidence", () => {
    const source = sourceState();
    const history = createUnresolvedVisualizationPromotionHistory({
      sourceState: source,
      promotedWorkspaceGraphId: null,
      capturedAt: now,
    });

    expect(history.entries[0]?.sourceState).toEqual(source);
    expect(history.entries[0]?.promotion).toEqual({
      sourceActiveDataRevisionId: source.activeDataRevisionId,
      sourceActiveGraphId: null,
      promotedWorkspaceGraphId: null,
    });
  });

  it("fails closed for unknown extension versions and mismatched source bindings", () => {
    const source = sourceState();
    const valid = createUnresolvedVisualizationPromotionHistory({
      sourceState: source,
      promotedWorkspaceGraphId: null,
      capturedAt: now,
    });

    expect(
      ExperimentEntrySourceHistorySchema.safeParse({ ...valid, schemaVersion: "0.2.0" }).success,
    ).toBe(false);
    expect(
      ExperimentEntrySourceHistorySchema.safeParse({
        ...valid,
        entries: [
          {
            ...valid.entries[0],
            sourceState: { ...source, schemaVersion: "0.1.0" },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ExperimentEntrySourceHistorySchema.safeParse({
        ...valid,
        entries: [
          {
            ...valid.entries[0],
            promotion: {
              ...valid.entries[0]!.promotion,
              sourceActiveDataRevisionId: "revision.not-the-source",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
