import { buildStructureContract } from "@lsaa/adaptive-input";
import type { GraphSpec } from "@lsaa/graph-spec";
import {
  appendUnresolvedVisualizationDataRevision,
  appendUnresolvedVisualizationGraph,
  createUnresolvedVisualizationPromotionHistory,
  createUnresolvedVisualizationProjectState,
  ProjectStateSchema,
} from "@lsaa/project";
import { describe, expect, it } from "vitest";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { bridgeGraphOnlyTableToStatistics } from "./graphOnlyStatisticsBridge";
import { rebindGraphOnlyGraphsToWorkspace } from "./graphOnlyWorkspaceGraph";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
} from "./experimentWorkspaceProject";

const now = "2026-08-28T00:00:00.000Z";

function fixture() {
  const contract = buildStructureContract({
    experimentName: "Graph promotion",
    experimentDescription: "Separate dishes received Control or Drug.",
    experimentalUnitLabel: "culture dish",
    identityLabel: "Dish ID",
    readoutLabel: "Cell area",
    readoutRepresentation: "scalar",
    factorName: "Condition",
    factorLevels: ["Control", "Drug"],
    sameIdentityAcrossConditions: false,
    conditionEntityRelationship: { kind: "independent_condition_units" },
  });
  const base = createUnresolvedVisualizationProjectState({
    metadata: {
      projectId: "visualization.graph-promotion",
      projectName: "Graph promotion",
      experimentDate: "",
      createdAt: now,
      updatedAt: now,
    },
    entryIntent: "graph_only",
    table: {
      id: "table.graph-promotion",
      headers: ["Condition", "Value", "DishID"],
      rows: [
        ["Control", "10", "dish-c1"],
        ["Drug", "14", "dish-d1"],
      ],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      sourceKind: "clipboard",
      sourceLabel: "clipboard",
      importedAt: now,
      rawText: "Condition\tValue\tDishID\nControl\t10\tdish-c1\nDrug\t14\tdish-d1",
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
        { index: 2, header: "DishID", role: "id" },
      ],
      identityDecision: "selected_column",
      confirmedAt: now,
    },
    actor: "test",
  });
  const spec: GraphSpec = {
    id: "graph.from-table",
    version: "0.1.0",
    type: "dot_summary",
    dataSource: {
      kind: "visualization_table",
      id: base.table.id,
      revision: base.activeDataRevisionId,
    },
    analysisResultId: null,
    dataSets: {
      displaySet: { conditionIds: [], timePointIds: [] },
      analysisSet: { conditionIds: [], timePointIds: [] },
      comparisonSet: [],
      annotationSet: [],
    },
    mappings: { x: "Condition", xHierarchy: [], y: "Value" },
    summary: { center: "none", interval: "none" },
    appearance: {
      palette: ["#176f63", "#d27b2c"],
      pointSize: 7,
      opacity: 0.75,
      showRawPoints: true,
      showPairedLines: false,
      distributionFill: "none",
      distributionFillColor: "#ffffff",
      distributionOutlineColor: "#111111",
      barWidth: 0.72,
      withinGroupSpacing: 0.72,
      betweenGroupSpacing: 1.35,
      barOutline: true,
      barMeanMarker: false,
      boxWhiskerMode: "tukey_1_5_iqr",
      uncertaintyStyle: "none",
      ribbonOpacity: 0.18,
      seriesStyles: {},
    },
    axes: {
      yStartAtZero: true,
      yScale: "linear",
      xLabel: "Treatment",
      yLabel: "Cell area (µm²)",
      showMinorTicks: false,
      tickDirection: "outside",
      showCategoryGroupSeparators: false,
    },
    annotations: [],
  };
  return {
    contract,
    state: appendUnresolvedVisualizationGraph(base, {
      spec,
      actor: "test",
      createdAt: now,
    }),
  };
}

function promotedFixture() {
  const { contract, state } = fixture();
  const bridge = bridgeGraphOnlyTableToStatistics(state, contract, now);
  if (bridge.status !== "ready") throw new Error(bridge.reason);
  const workspace = createAdaptiveWorkspace({
    contract,
    observations: bridge.observations,
    mapping: bridge.mapping,
    lineage: bridge.lineage,
    now,
  });
  if (!workspace.draft) throw new Error(workspace.diagnostics.join(" / "));
  return { contract, state, workspace };
}

function revisedGraphFixture() {
  const { contract, state: firstGraphState } = fixture();
  const revised = appendUnresolvedVisualizationDataRevision(firstGraphState, {
    table: {
      id: firstGraphState.table.id,
      headers: firstGraphState.table.headers,
      rows: [
        ["Control", "11", "dish-c1"],
        ["Drug", "15", "dish-d1"],
      ],
      delimiter: "tab",
      headerRow: 1,
    },
    rawLineage: {
      sourceKind: "clipboard",
      sourceLabel: "clipboard",
      importedAt: "2026-08-28T00:05:00.000Z",
      rawText: "Condition\tValue\tDishID\nControl\t11\tdish-c1\nDrug\t15\tdish-d1",
      sha256: null,
      transformations: ["delimiter_detection"],
    },
    mapping: firstGraphState.mapping,
    actor: "test",
    createdAt: "2026-08-28T00:05:00.000Z",
  });
  const currentSpec: GraphSpec = {
    ...revised.graphSpecs[0]!,
    id: "graph.current-table",
    dataSource: {
      kind: "visualization_table",
      id: revised.table.id,
      revision: revised.activeDataRevisionId,
    },
    axes: { ...revised.graphSpecs[0]!.axes, yLabel: "Current cell area" },
  };
  return {
    contract,
    state: appendUnresolvedVisualizationGraph(revised, {
      spec: currentSpec,
      actor: "test",
      createdAt: "2026-08-28T00:06:00.000Z",
    }),
  };
}

describe("Graph-only Graph promotion", () => {
  it("keeps the descriptive artifact and binds it to canonical workspace selectors", () => {
    const { contract, state, workspace } = promotedFixture();
    const rebound = rebindGraphOnlyGraphsToWorkspace({
      state,
      contract,
      draft: workspace.draft!,
    });

    expect(rebound.status).toBe("ready");
    if (rebound.status !== "ready") return;
    expect(rebound.graphs).toHaveLength(1);
    expect(rebound.graphs[0]).toMatchObject({
      id: "graph.from-table",
      displayName: "Cell area (µm²) Graph",
      selectedReadoutId: "outcome.cellarea",
      selectedConditionIds: ["condition.1", "condition.2"],
      graphType: "dot",
      layers: { raw: true, experiment: false, overall: false, errorBar: false },
      grouping: {
        x: { source: "factor", factorId: "factor.condition" },
        series: { source: "none" },
      },
      appearance: {
        pointSize: 7,
        pointOpacity: 0.75,
        seriesColors: { "condition.1": "#176f63", "condition.2": "#176f63" },
      },
      axes: {
        xTitle: "Treatment",
        yTitle: "Cell area (µm²)",
        showMinorTicks: false,
        tickDirection: "outside",
      },
      analysis: null,
    });
    expect(rebound.graphs[0]).not.toHaveProperty("dataSource");

    const saved = createExperimentWorkspaceProject({
      draft: workspace.draft!,
      cells: workspace.cells,
      graphs: rebound.graphs,
      now,
    });
    expect(saved.activeRawRevisionId).toBe("raw.workspace.1");
    expect(saved.graphs).toEqual([]);
    expect(saved.experimentWorkspace?.graphs[0]).not.toHaveProperty("dataSource");
    expect(rehydrateExperimentWorkspace(saved)?.graphs[0]).toMatchObject({
      id: "graph.from-table",
      selectedReadoutId: "outcome.cellarea",
      analysis: null,
    });
  });

  it("stops instead of rebinding a Graph from an older table revision", () => {
    const { contract, state, workspace } = promotedFixture();
    const stale = {
      ...state,
      graphSpecs: state.graphSpecs.map((spec) => ({
        ...spec,
        dataSource: { ...spec.dataSource, revision: "2026-08-27T00:00:00.000Z" },
      })),
    };

    expect(
      rebindGraphOnlyGraphsToWorkspace({ state: stale, contract, draft: workspace.draft! }),
    ).toMatchObject({ status: "stopped", code: "GRAPH_REBIND_SOURCE_MISMATCH" });
  });

  it("rebinds only the active Graph and leaves older-revision Graphs as source history", () => {
    const { contract, state: current } = revisedGraphFixture();
    const bridge = bridgeGraphOnlyTableToStatistics(current, contract, now);
    if (bridge.status !== "ready") throw new Error(bridge.reason);
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: bridge.observations,
      mapping: bridge.mapping,
      lineage: bridge.lineage,
      now,
    });
    if (!workspace.draft) throw new Error(workspace.diagnostics.join(" / "));

    const rebound = rebindGraphOnlyGraphsToWorkspace({
      state: current,
      contract,
      draft: workspace.draft,
    });

    expect(current.graphSpecs.map(({ id }) => id)).toEqual([
      "graph.from-table",
      "graph.current-table",
    ]);
    expect(rebound).toMatchObject({
      status: "ready",
      graphs: [{ id: "graph.current-table", axes: { yTitle: "Current cell area" } }],
    });
  });

  it("retains both unsaved source revisions and Graphs through Experiment save/open", () => {
    const { contract, state } = revisedGraphFixture();
    const bridge = bridgeGraphOnlyTableToStatistics(state, contract, now);
    if (bridge.status !== "ready") throw new Error(bridge.reason);
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: bridge.observations,
      mapping: bridge.mapping,
      lineage: bridge.lineage,
      now,
    });
    if (!workspace.draft) throw new Error(workspace.diagnostics.join(" / "));
    const rebound = rebindGraphOnlyGraphsToWorkspace({ state, contract, draft: workspace.draft });
    if (rebound.status !== "ready") throw new Error(rebound.reason);
    const history = createUnresolvedVisualizationPromotionHistory({
      sourceState: state,
      promotedWorkspaceGraphId: rebound.graphs[0]?.id ?? null,
      capturedAt: "2026-08-28T00:07:00.000Z",
    });
    const saved = createExperimentWorkspaceProject({
      draft: { ...workspace.draft, entrySourceHistory: history },
      cells: workspace.cells,
      graphs: rebound.graphs,
      now: "2026-08-28T00:08:00.000Z",
    });
    const reopenedState = ProjectStateSchema.parse(JSON.parse(JSON.stringify(saved)));
    const reopened = rehydrateExperimentWorkspace(reopenedState)!;

    expect(state.dataRevisions).toHaveLength(2);
    expect(state.graphSpecs.map(({ id }) => id)).toEqual([
      "graph.from-table",
      "graph.current-table",
    ]);
    expect(reopened.draft.entrySourceHistory).toEqual(history);
    expect(reopened.draft.entrySourceHistory?.entries[0]?.sourceState).toEqual(state);
    expect(
      reopened.draft.entrySourceHistory?.entries[0]?.sourceState.graphSpecs.map(
        ({ id, dataSource }) => ({ id, revision: dataSource.revision }),
      ),
    ).toEqual([
      { id: "graph.from-table", revision: state.dataRevisions[0]!.id },
      { id: "graph.current-table", revision: state.dataRevisions[1]!.id },
    ]);
    expect(reopened.graphs.map(({ id }) => id)).toEqual(["graph.current-table"]);
    expect(reopened.graphs[0]).not.toHaveProperty("dataSource");
    expect(reopenedState.activeRawRevisionId).not.toBe(state.activeDataRevisionId);
  });

  it("stops instead of discarding an unsupported Graph presentation", () => {
    const { contract, state, workspace } = promotedFixture();
    const unsupported = {
      ...state,
      graphSpecs: state.graphSpecs.map((spec) => ({
        ...spec,
        summary: { center: "mean" as const, interval: "sd" as const },
      })),
    };

    expect(
      rebindGraphOnlyGraphsToWorkspace({
        state: unsupported,
        contract,
        draft: workspace.draft!,
      }),
    ).toMatchObject({ status: "stopped", code: "GRAPH_REBIND_PRESENTATION_UNSUPPORTED" });
  });
});
