import {
  resolveUnresolvedVisualizationIdentityDecision,
  resolveUnresolvedVisualizationSourceRowUnitDecision,
  type UnresolvedVisualizationColumnMapping,
  type UnresolvedVisualizationIdentityDecision,
  type UnresolvedVisualizationProjectState,
  type UnresolvedVisualizationSourceRowUnitDecision,
} from "@lsaa/project";
import { GraphSpecSchema, type GraphEditorPresentation, type GraphSpec } from "@lsaa/graph-spec";

import type { WorkspaceGraphState } from "./experimentWorkspaceProject";
import { GRAPH_ONLY_DEFAULT_PALETTE, type GraphOnlyPresentation } from "./graphOnlyTableSemantics";
import type { createGraphOnlyWorkbenchModel } from "./graphOnlyWorkbenchAdapter";
import { localizedText } from "./appLocale";
import type { GraphOnlyColumnIndex as ColumnIndex } from "./graphOnlyVisualizationInput";

export type GraphOnlyGraphType = WorkspaceGraphState["graphType"];

export const DIRECT_ENTRY_TEMPLATE = "X / condition\tY / value\tGroup (optional)\tID (optional)";

export function graphOnlyGraphSpec(
  tableId: string,
  revision: string,
  headers: readonly string[],
  xColumn: number,
  yColumn: number,
  seriesColumn: ColumnIndex,
  graphId: string,
  presentation: GraphOnlyPresentation,
  numericXAxis: boolean,
  seriesKeys: readonly string[],
  editorPresentation?: GraphEditorPresentation,
): GraphSpec {
  const seriesHeader = seriesColumn === "" ? undefined : headers[seriesColumn];
  return GraphSpecSchema.parse({
    id: graphId,
    version: "0.1.0",
    // Numeric X/Y input stays descriptive until biological-unit identity is supplied.
    // `scatter` is reserved for the Core D09 paired-measurement contract.
    type: seriesHeader ? "grouped_dot" : "dot_summary",
    dataSource: { kind: "visualization_table", id: tableId, revision },
    analysisResultId: null,
    dataSets: {
      displaySet: { conditionIds: [], timePointIds: [] },
      analysisSet: { conditionIds: [], timePointIds: [] },
      comparisonSet: [],
      annotationSet: [],
    },
    mappings: {
      x: headers[xColumn] ?? `column_${xColumn + 1}`,
      xHierarchy: [],
      y: headers[yColumn] ?? `column_${yColumn + 1}`,
      ...(seriesHeader ? { series: seriesHeader, color: seriesHeader } : {}),
    },
    summary: editorPresentation
      ? {
          center: editorPresentation.layers.overall ? "mean" : "none",
          interval:
            editorPresentation.layers.errorBar && editorPresentation.appearance.errorBar !== "none"
              ? editorPresentation.appearance.errorBar
              : "none",
        }
      : { center: "none", interval: "none" },
    annotations: [],
    appearance: {
      palette: [...presentation.palette],
      pointSize: presentation.pointSize,
      opacity: presentation.opacity,
      showRawPoints: true,
      showPairedLines: false,
      distributionFill: "none",
      distributionFillColor: "#ffffff",
      distributionOutlineColor: "#111111",
      barWidth: 0.72,
      withinGroupSpacing: 0.72,
      betweenGroupSpacing: 1.35,
      barOutline: true,
      barOutlineMode: "series",
      barOutlineColor: "#111111",
      barOutlineWidth: 1.2,
      barMeanMarker: false,
      boxWhiskerMode: "tukey_1_5_iqr",
      uncertaintyStyle: "none",
      ribbonOpacity: 0.18,
      seriesStyles: Object.fromEntries(
        seriesKeys.map((series, index) => [
          series,
          {
            color: presentation.palette[index % presentation.palette.length],
            legendLabel: presentation.seriesLabels[series]?.trim() || series,
            visible: true,
          },
        ]),
      ),
    },
    axes: {
      yStartAtZero: editorPresentation
        ? editorPresentation.axes.yRangeMode === "manual" && editorPresentation.axes.yMin === 0
        : presentation.yStartAtZero,
      yScale: editorPresentation?.axes.yScale ?? "linear",
      ...(numericXAxis ? { xScale: editorPresentation?.axes.xScale ?? ("linear" as const) } : {}),
      xLabel: editorPresentation?.axes.xTitle || presentation.xLabel || headers[xColumn] || "X",
      yLabel:
        editorPresentation?.axes.yTitle || presentation.yLabel || headers[yColumn] || "測定値",
      showMinorTicks: editorPresentation?.axes.showMinorTicks ?? true,
      tickDirection: editorPresentation?.axes.tickDirection ?? "outside",
      showCategoryGroupSeparators:
        editorPresentation?.axes.showCategoryGroupSeparators ?? Boolean(seriesHeader),
    },
    ...(editorPresentation ? { editorPresentation } : {}),
  });
}

export function graphOnlyEditorPresentation(
  state: Omit<WorkspaceGraphState, "id" | "displayName"> | null,
): GraphEditorPresentation | undefined {
  if (!state) return undefined;
  return {
    graphType: state.graphType,
    grouping: state.grouping!,
    layers: state.layers,
    appearance: {
      ...state.appearance,
      barOutline: state.appearance.barOutline ?? true,
      barMeanMarker: state.appearance.barMeanMarker ?? false,
      boxWhiskerMode: state.appearance.boxWhiskerMode ?? "tukey_1_5_iqr",
      uncertaintyStyle: state.appearance.uncertaintyStyle ?? "error_bars",
      ribbonOpacity: state.appearance.ribbonOpacity ?? 0.18,
    },
    axes: state.axes,
  };
}

export function initialGraphOnlyColumn(
  state: UnresolvedVisualizationProjectState | null | undefined,
  role: "x" | "y" | "series" | "id",
): ColumnIndex {
  return state?.mapping?.columns.find((candidate) => candidate.role === role)?.index ?? "";
}

export function initialGraphOnlyIdentityDecision(
  state: UnresolvedVisualizationProjectState | null | undefined,
): UnresolvedVisualizationIdentityDecision {
  return state?.mapping
    ? resolveUnresolvedVisualizationIdentityDecision(state.mapping)
    : "unanswered";
}

export function initialGraphOnlySourceRowUnitDecision(
  state: UnresolvedVisualizationProjectState | null | undefined,
): UnresolvedVisualizationSourceRowUnitDecision {
  return state?.mapping
    ? resolveUnresolvedVisualizationSourceRowUnitDecision(state.mapping)
    : "unanswered";
}

export function graphOnlyLifecycleSnapshot(values: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(values);
}

export function activeGraphOnlyGraph(
  state: UnresolvedVisualizationProjectState | null | undefined,
): GraphSpec | null {
  if (!state?.activeGraphId) return null;
  return state.graphSpecs.find(({ id }) => id === state.activeGraphId) ?? null;
}

export function initialGraphOnlyPresentation(
  state: UnresolvedVisualizationProjectState | null | undefined,
  locale: "ja" | "en",
): GraphOnlyPresentation {
  const graph = activeGraphOnlyGraph(state);
  const localizedDefaultTitle = localizedText(
    locale,
    "表から作成したGraph",
    "Graph created from a table",
  );
  const storedTitle = state?.metadata.projectName;
  const seriesLabels = Object.fromEntries(
    Object.entries(graph?.appearance.seriesStyles ?? {}).flatMap(([series, style]) =>
      style.legendLabel ? [[series, style.legendLabel]] : [],
    ),
  );
  return {
    title:
      storedTitle === "表から作成したGraph" || storedTitle === "Graph created from a table"
        ? localizedDefaultTitle
        : (storedTitle ?? localizedDefaultTitle),
    xLabel: graph?.axes.xLabel ?? null,
    yLabel: graph?.axes.yLabel ?? null,
    pointSize: graph?.appearance.pointSize ?? 5,
    opacity: graph?.appearance.opacity ?? 0.9,
    palette: graph?.appearance.palette ?? GRAPH_ONLY_DEFAULT_PALETTE,
    yStartAtZero: graph?.axes.yStartAtZero ?? false,
    seriesLabels,
  };
}

export function sameGraphOnlyGraph(left: GraphSpec | null, right: GraphSpec): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

export function sameGraphOnlyMapping(
  left: UnresolvedVisualizationColumnMapping | null,
  right: UnresolvedVisualizationColumnMapping,
): boolean {
  return (
    left !== null &&
    left.sourceLabel === right.sourceLabel &&
    left.delimiter === right.delimiter &&
    left.headerRow === right.headerRow &&
    resolveUnresolvedVisualizationIdentityDecision(left) ===
      resolveUnresolvedVisualizationIdentityDecision(right) &&
    resolveUnresolvedVisualizationSourceRowUnitDecision(left) ===
      resolveUnresolvedVisualizationSourceRowUnitDecision(right) &&
    left.columns.length === right.columns.length &&
    left.columns.every((column, index) => {
      const candidate = right.columns[index];
      return (
        candidate !== undefined &&
        column.index === candidate.index &&
        column.header === candidate.header &&
        column.role === candidate.role
      );
    })
  );
}

export function initialGraphOnlyEditorState(
  model: NonNullable<ReturnType<typeof createGraphOnlyWorkbenchModel>>,
  graph: GraphSpec | null,
): Omit<WorkspaceGraphState, "id" | "displayName"> | undefined {
  const editor = graph?.editorPresentation;
  if (!editor) return undefined;
  return {
    selectedReadoutId: model.draft.readouts[0]!.id,
    sourceMode: "raw_readout",
    selectedConditionIds: [...model.conditionIds],
    analysisConditionIds: [...model.conditionIds],
    selectedTimePointIds: [...model.timePointIds],
    dataSets: {
      displaySet: {
        conditionIds: [...model.conditionIds],
        timePointIds: [...model.timePointIds],
      },
      analysisSet: {
        conditionIds: [...model.conditionIds],
        timePointIds: [...model.timePointIds],
      },
      comparisonSet: [],
      annotationSet: [],
    },
    analysisTimePointId: null,
    analysisMetric: { kind: "selected_timepoint" },
    ...editor,
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    statisticsAnnotations: [],
    analysisRunId: null,
    analysis: null,
  };
}
