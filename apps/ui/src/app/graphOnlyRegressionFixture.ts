import {
  createUnresolvedVisualizationProjectState,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";
export function regressionSource(): UnresolvedVisualizationProjectState {
  const now = "2026-10-12T00:00:00Z";
  return createUnresolvedVisualizationProjectState({
    metadata: {
      projectId: "regression-source",
      projectName: "Synthetic XY",
      experimentDate: "",
      createdAt: now,
      updatedAt: now,
    },
    entryIntent: "graph_only",
    table: {
      id: "table.xy",
      headers: ["Mouse", "Weight", "Organ"],
      rows: [
        ["a", "20", "0.9"],
        ["b", "25", "1.1"],
        ["c", "30", "1.4"],
      ],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      sourceKind: "clipboard",
      sourceLabel: "clipboard",
      importedAt: now,
      rawText: "Mouse\tWeight\tOrgan\na\t20\t0.9\nb\t25\t1.1\nc\t30\t1.4",
      sha256: null,
      transformations: [],
    },
    mapping: {
      schemaVersion: "0.1.0",
      sourceLabel: "clipboard",
      delimiter: "tab",
      headerRow: 1,
      confirmedAt: now,
      identityDecision: "selected_column",
      sourceRowUnitDecision: "unanswered",
      columns: [
        { index: 0, header: "Mouse", role: "id" },
        { index: 1, header: "Weight", role: "x" },
        { index: 2, header: "Organ", role: "y" },
      ],
    },
    actor: "test",
  });
}
