import { useMemo, useState } from "react";

import {
  orderedAxisSemantic,
  orderedAxisTitle,
  orderedAxisUnit,
  type ExperimentSetDraft,
} from "../../app/experimentDraft";
import { defaultGraphYTitle, defaultLayersForGraphType } from "../../app/graphDefaults";
import {
  createInitialGraphGrouping,
  normalizeGraphGroupingChannels,
} from "../../app/graphGrouping";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import type { GraphInspectorTarget } from "./useExperimentGraphWorkspaceEffects";

type InitialState = Omit<WorkspaceGraphState, "id" | "displayName">;

export const DEFAULT_GRAPH_LAYERS: WorkspaceGraphState["layers"] = {
  raw: true,
  distribution: true,
  experiment: true,
  overall: true,
  violin: false,
  box: false,
  errorBar: true,
  connectingLine: false,
};

export const DEFAULT_GRAPH_APPEARANCE: WorkspaceGraphState["appearance"] = {
  errorBar: "sd",
  palette: "single",
  pointSize: 6,
  pointOpacity: 0.9,
  axisLineWidth: 1.4,
  hierarchicalLabels: true,
  jitter: 12,
  fontFamily: "arial",
  graphTitleFontSize: 20,
  axisTitleFontSize: 19,
  tickFontSize: 17,
  hierarchyFontSize: 17,
  legendFontSize: 16,
  legendPosition: "hidden",
  seriesColors: {},
  seriesStyles: {},
  distributionFill: "white",
  distributionFillColor: "#ffffff",
  distributionOutlineColor: "#111111",
  barWidth: 0.72,
  withinGroupSpacing: 0.72,
  betweenGroupSpacing: 1.35,
  barOutline: true,
  barMeanMarker: false,
  boxWhiskerMode: "tukey_1_5_iqr",
  uncertaintyStyle: "error_bars",
  ribbonOpacity: 0.18,
  rawPointColor: "#8a96a3",
  summaryColor: "#111111",
  errorBarColor: "#111111",
  connectingLineColor: "#4b5563",
  summaryLineWidth: 2,
  errorBarLineWidth: 1.5,
  connectingLineWidth: 1.5,
  distributionLineWidth: 1.2,
  canvasPreset: "standard",
  sidePadding: 72,
};

export function useExperimentGraphPresentationState(input: {
  draft: ExperimentSetDraft;
  initialState?: InitialState;
  initialGraphType?: WorkspaceGraphState["graphType"];
  semanticReadiness: "resolved" | "unresolved_descriptive";
  workspaceMode: "graph" | "statistics" | "combined";
}) {
  const { draft, initialState, semanticReadiness, workspaceMode } = input;
  const initialGraphType = initialState?.graphType ?? input.initialGraphType ?? "dot";
  const proposedInitialGrouping = useMemo(
    () =>
      normalizeGraphGroupingChannels(initialState?.grouping ?? createInitialGraphGrouping(draft)),
    [draft, initialState?.grouping],
  );
  const [layers, setLayers] = useState<WorkspaceGraphState["layers"]>(() => {
    if (initialState?.layers) return initialState.layers;
    if (semanticReadiness !== "unresolved_descriptive") return DEFAULT_GRAPH_LAYERS;
    return {
      ...defaultLayersForGraphType(initialGraphType, draft.readouts[0]?.shape ?? "proportion"),
      // Source rows remain descriptive until their experimental-unit meaning is confirmed.
      overall: false,
      errorBar: false,
    };
  });
  const [appearance, setAppearance] = useState<WorkspaceGraphState["appearance"]>({
    ...DEFAULT_GRAPH_APPEARANCE,
    ...(proposedInitialGrouping.series.source !== "none"
      ? { legendPosition: "right" as const, palette: "condition" as const }
      : {}),
    ...initialState?.appearance,
  });
  const [graphType, setGraphType] = useState<WorkspaceGraphState["graphType"]>(initialGraphType);
  const [grouping, setGrouping] = useState(proposedInitialGrouping);
  const [axes, setAxes] = useState<WorkspaceGraphState["axes"]>(
    initialState?.axes ?? {
      xSemantic: draft.time.points.length > 0 ? orderedAxisSemantic(draft.time) : "categorical",
      xTitle: draft.time.points.length > 0 ? orderedAxisTitle(draft.time) : "",
      xUnit: draft.time.points.length > 0 ? orderedAxisUnit(draft.time) : "",
      yTitle: defaultGraphYTitle(draft.readouts[0]),
      yRangeMode: "auto",
      yMin: null,
      yMax: null,
      yScale: "linear",
      showCategoryLabels: true,
      hierarchyOrder: draft.attributes.map(({ id }) => id),
      spacing: 1,
      yTickMode: "auto",
      yTickInterval: null,
      showMinorTicks: true,
      tickDirection: "outside",
      showCategoryGroupSeparators: false,
    },
  );
  const [inspectorTarget, setInspectorTarget] = useState<GraphInspectorTarget>(
    workspaceMode === "statistics" ? "statistics" : "data",
  );
  const [fitOverview, setFitOverview] = useState(false);

  return {
    layers,
    setLayers,
    appearance,
    setAppearance,
    graphType,
    setGraphType,
    grouping,
    setGrouping,
    axes,
    setAxes,
    inspectorTarget,
    setInspectorTarget,
    fitOverview,
    setFitOverview,
  };
}
