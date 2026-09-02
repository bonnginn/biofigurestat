import type { StructureContract } from "@lsaa/domain";
import type { GraphSpec } from "@lsaa/graph-spec";
import type { UnresolvedVisualizationProjectState } from "@lsaa/project";

import type { ExperimentSetDraft } from "./experimentDraft";
import type { WorkspaceGraphState } from "./experimentWorkspaceProject";

export type GraphOnlyWorkspaceGraphStopCode =
  | "GRAPH_REBIND_CONTRACT_MISMATCH"
  | "GRAPH_REBIND_SOURCE_MISMATCH"
  | "GRAPH_REBIND_MAPPING_MISMATCH"
  | "GRAPH_REBIND_PRESENTATION_UNSUPPORTED";

export type GraphOnlyWorkspaceGraphResult =
  | Readonly<{ status: "ready"; graphs: readonly WorkspaceGraphState[] }>
  | Readonly<{
      status: "stopped";
      code: GraphOnlyWorkspaceGraphStopCode;
      reason: string;
    }>;

function stop(
  code: GraphOnlyWorkspaceGraphStopCode,
  reason: string,
): GraphOnlyWorkspaceGraphResult {
  return { status: "stopped", code, reason };
}

function hasEmptyDataSets(spec: GraphSpec): boolean {
  return (
    spec.dataSets.displaySet.conditionIds.length === 0 &&
    spec.dataSets.displaySet.timePointIds.length === 0 &&
    spec.dataSets.analysisSet.conditionIds.length === 0 &&
    spec.dataSets.analysisSet.timePointIds.length === 0 &&
    spec.dataSets.comparisonSet.length === 0 &&
    spec.dataSets.annotationSet.length === 0
  );
}

function presentationCanBeRepresented(spec: GraphSpec): boolean {
  return (
    spec.type === "dot_summary" &&
    spec.analysisResultId === null &&
    spec.summary.center === "none" &&
    spec.summary.interval === "none" &&
    spec.appearance.showRawPoints &&
    !spec.appearance.showPairedLines &&
    spec.appearance.pointSize >= 4 &&
    spec.appearance.pointSize <= 10 &&
    Object.keys(spec.appearance.seriesStyles).length === 0 &&
    spec.annotations.length === 0 &&
    spec.facet === undefined &&
    spec.distribution === undefined &&
    spec.heatmap === undefined &&
    (spec.axes.xScale === undefined || spec.axes.xScale === "linear") &&
    hasEmptyDataSets(spec)
  );
}

/**
 * Converts a descriptive Graph-only artifact into the existing workspace Graph
 * contract after the table has been promoted to canonical observations.
 *
 * Workspace Graphs bind data by readout/condition selectors. They therefore no
 * longer retain the unresolved `visualization_table` source. On project save,
 * the existing workspace persistence path binds those selectors to the active
 * canonical raw revision. Anything that cannot be represented losslessly in
 * that contract stops instead of dropping the Graph or retaining a stale table
 * reference.
 */
export function rebindGraphOnlyGraphsToWorkspace(input: {
  state: UnresolvedVisualizationProjectState;
  contract: StructureContract;
  draft: ExperimentSetDraft;
}): GraphOnlyWorkspaceGraphResult {
  const { state, contract, draft } = input;
  if (
    state.entryIntent !== "graph_only" ||
    !draft.adaptiveInput ||
    JSON.stringify(draft.adaptiveInput.contract) !== JSON.stringify(contract)
  ) {
    return stop(
      "GRAPH_REBIND_CONTRACT_MISMATCH",
      "Graphと確認した実験構造の対応を確認できません。元の表とGraphは保持されています。",
    );
  }
  if (state.graphSpecs.length === 0) return { status: "ready", graphs: [] };
  if (!state.mapping || !state.activeGraphId) {
    return stop(
      "GRAPH_REBIND_MAPPING_MISMATCH",
      "保持するGraphの列対応を確認できません。元の表とGraphは保持されています。",
    );
  }

  const factor = contract.factors[0];
  const readout = contract.readouts[0];
  if (
    contract.factors.length !== 1 ||
    contract.readouts.length !== 1 ||
    !factor ||
    !readout ||
    readout.representation !== "scalar" ||
    contract.orderedAxes.length > 0
  ) {
    return stop(
      "GRAPH_REBIND_CONTRACT_MISMATCH",
      "このGraphを現在の実験ワークスペースへ安全に対応づけられません。元の表とGraphは保持されています。",
    );
  }

  const xColumn = state.mapping.columns.find(({ role }) => role === "x");
  const yColumn = state.mapping.columns.find(({ role }) => role === "y");
  if (!xColumn || !yColumn) {
    return stop(
      "GRAPH_REBIND_MAPPING_MISMATCH",
      "Graphの横軸と測定値の列対応を確認できません。元の表とGraphは保持されています。",
    );
  }

  const factorAttributeId = `factor.${factor.key}`;
  const conditionByLevel = new Map(
    draft.conditions.map((condition) => [condition.attributes[factorAttributeId], condition]),
  );
  const conditions = factor.levels.map((level) => conditionByLevel.get(level));
  const targetReadoutId = `outcome.${readout.key}`;
  if (
    conditions.some((condition) => !condition) ||
    new Set(conditions.map((condition) => condition!.id)).size !== factor.levels.length ||
    !draft.readouts.some(({ id }) => id === targetReadoutId)
  ) {
    return stop(
      "GRAPH_REBIND_CONTRACT_MISMATCH",
      "Graphの条件または測定項目を、作成した入力表へ一意に対応づけられません。元の表とGraphは保持されています。",
    );
  }
  const conditionIds = conditions.map((condition) => condition!.id);

  const spec = state.graphSpecs.find(({ id }) => id === state.activeGraphId);
  if (!spec) {
    return stop(
      "GRAPH_REBIND_MAPPING_MISMATCH",
      "現在表示しているGraphを確認できません。元の表とGraphは保持されています。",
    );
  }
  if (
    spec.dataSource.kind !== "visualization_table" ||
    spec.dataSource.id !== state.table.id ||
    spec.dataSource.revision !== state.activeDataRevisionId
  ) {
    return stop(
      "GRAPH_REBIND_SOURCE_MISMATCH",
      "Graphが現在の表とは異なるrevisionを参照しています。別のデータへ付け替えず、元の表とGraphを保持して停止します。",
    );
  }
  if (
    spec.mappings.x !== xColumn.header ||
    spec.mappings.y !== yColumn.header ||
    spec.mappings.xHierarchy.length > 0 ||
    spec.mappings.series !== undefined ||
    spec.mappings.color !== undefined ||
    spec.mappings.shape !== undefined ||
    spec.mappings.pair !== undefined ||
    spec.mappings.facet !== undefined ||
    spec.mappings.auxiliaryReference !== undefined
  ) {
    return stop(
      "GRAPH_REBIND_MAPPING_MISMATCH",
      "Graphの表示列と、統計へ引き継いだ列対応が一致しません。元の表とGraphは保持されています。",
    );
  }
  if (!presentationCanBeRepresented(spec)) {
    return stop(
      "GRAPH_REBIND_PRESENTATION_UNSUPPORTED",
      "このGraphの表示設定は現在の実験ワークスペースへ完全には移せません。設定を捨てず、元の表とGraphを保持して停止します。",
    );
  }

  const sourceColor = spec.appearance.palette[0]!;
  const graph: WorkspaceGraphState = {
    id: spec.id,
    displayName: `${spec.axes.yLabel || readout.label} Graph`,
    analysisRunId: null,
    selectedReadoutId: targetReadoutId,
    sourceMode: "raw_readout",
    selectedConditionIds: conditionIds,
    analysisConditionIds: conditionIds,
    selectedTimePointIds: [],
    dataSets: {
      displaySet: { conditionIds, timePointIds: [] },
      analysisSet: { conditionIds, timePointIds: [] },
      comparisonSet: [],
      annotationSet: [],
    },
    analysisTimePointId: null,
    analysisMetric: { kind: "selected_timepoint" },
    graphType: "dot",
    grouping: {
      x: {
        source: "factor",
        factorId: factorAttributeId,
        factorIds: [factorAttributeId],
      },
      series: { source: "none" },
      color: { source: "none" },
      shape: { source: "none" },
      facet: null,
    },
    layers: {
      raw: true,
      distribution: false,
      experiment: false,
      overall: false,
      violin: false,
      box: false,
      errorBar: false,
      connectingLine: false,
    },
    appearance: {
      errorBar: "none",
      palette: "single",
      pointSize: spec.appearance.pointSize,
      pointOpacity: spec.appearance.opacity,
      axisLineWidth: 1.4,
      hierarchicalLabels: false,
      jitter: 0,
      fontFamily: "arial",
      graphTitleFontSize: 20,
      axisTitleFontSize: 19,
      tickFontSize: 17,
      hierarchyFontSize: 17,
      legendFontSize: 16,
      legendPosition: "hidden",
      seriesColors: Object.fromEntries(conditionIds.map((id) => [id, sourceColor])),
      seriesStyles: {},
      distributionFill: spec.appearance.distributionFill,
      distributionFillColor: spec.appearance.distributionFillColor,
      distributionOutlineColor: spec.appearance.distributionOutlineColor,
      barWidth: spec.appearance.barWidth,
      withinGroupSpacing: spec.appearance.withinGroupSpacing,
      betweenGroupSpacing: spec.appearance.betweenGroupSpacing,
      barOutline: spec.appearance.barOutline,
      barOutlineMode: spec.appearance.barOutlineMode,
      barOutlineColor: spec.appearance.barOutlineColor,
      barOutlineWidth: spec.appearance.barOutlineWidth,
      barMeanMarker: spec.appearance.barMeanMarker,
      boxWhiskerMode: spec.appearance.boxWhiskerMode,
      uncertaintyStyle: spec.appearance.uncertaintyStyle,
      ribbonOpacity: spec.appearance.ribbonOpacity,
      rawPointColor: sourceColor,
      summaryColor: "#111111",
      errorBarColor: "#111111",
      connectingLineColor: "#4b5563",
      summaryLineWidth: 2,
      errorBarLineWidth: 1.5,
      connectingLineWidth: 1.5,
      distributionLineWidth: 1.2,
      canvasPreset: "standard",
      sidePadding: 72,
    },
    axes: {
      xSemantic: "categorical",
      xTitle: spec.axes.xLabel,
      xUnit: "",
      yTitle: spec.axes.yLabel,
      yRangeMode: "auto",
      yMin: null,
      yMax: null,
      yScale: spec.axes.yScale,
      showCategoryLabels: true,
      hierarchyOrder: [factorAttributeId],
      spacing: 1,
      yTickMode: "auto",
      yTickInterval: null,
      showMinorTicks: spec.axes.showMinorTicks,
      tickDirection: spec.axes.tickDirection,
      showCategoryGroupSeparators: spec.axes.showCategoryGroupSeparators,
      categoryLabelRotation: "minus_30",
    },
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    analysis: null,
  };

  return { status: "ready", graphs: [graph] };
}
