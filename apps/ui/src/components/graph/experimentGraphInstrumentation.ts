import type { AnalysisRecommendation } from "@lsaa/analysis-contracts";
import type { TimeAnalysisPlan } from "../../app/experimentDraft";
import type { ContrastIntent } from "../../app/experimentDraftAnalysis";
import type {
  WorkspaceGraphAnalysis,
  WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";

type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;
type StatisticsAnnotation = NonNullable<WorkspaceGraphState["statisticsAnnotation"]>;
type StatisticsAnnotationEntry = NonNullable<
  WorkspaceGraphState["statisticsAnnotations"]
>[number];

type SharedGraphProjectionInput = Readonly<{
  selectedReadoutId: string;
  sourceMode: WorkspaceGraphState["sourceMode"];
  selectedConditionIds: readonly string[];
  analysisConditionIds: readonly string[];
  selectedTimePointIds: readonly string[];
}>;

export function createBenchmarkRenderedState(
  input: SharedGraphProjectionInput &
    Readonly<{
      graphType: WorkspaceGraphState["graphType"];
      grouping: GraphGrouping;
      layers: WorkspaceGraphState["layers"];
      appearance: WorkspaceGraphState["appearance"];
      axes: WorkspaceGraphState["axes"];
      statisticsAnnotation: StatisticsAnnotation;
      statisticsAnnotations: readonly StatisticsAnnotationEntry[];
      timeAnalysis: TimeAnalysisPlan;
    }>,
): string {
  return JSON.stringify({
    selectedReadoutId: input.selectedReadoutId,
    sourceMode: input.sourceMode,
    selectedConditionIds: input.selectedConditionIds,
    analysisConditionIds: input.analysisConditionIds,
    selectedTimePointIds: input.selectedTimePointIds,
    graphType: input.graphType,
    grouping: input.grouping,
    layers: input.layers,
    appearance: input.appearance,
    axes: input.axes,
    statisticsAnnotation: input.statisticsAnnotation,
    statisticsAnnotations: input.statisticsAnnotations,
    displayedDerivedMetric:
      input.sourceMode === "derived_metric" && input.timeAnalysis.kind !== "selected_timepoint"
        ? input.timeAnalysis
        : null,
  });
}

export function createBenchmarkAnalysisState(
  input: SharedGraphProjectionInput &
    Readonly<{
      analysisTimePointId: string | null;
      timeAnalysis: TimeAnalysisPlan;
      selectedStatisticalMethod: AnalysisRecommendation["recommendedMethod"] | undefined;
      correlationMethod: "pearson" | "spearman" | undefined;
      contrastIntent: ContrastIntent;
      plannedContrastConditionIds: readonly (readonly [string, string])[];
      analysis: WorkspaceGraphAnalysis | null;
    }>,
): string {
  return JSON.stringify({
    selectedReadoutId: input.selectedReadoutId,
    sourceMode: input.sourceMode,
    selectedConditionIds: input.selectedConditionIds,
    analysisConditionIds: input.analysisConditionIds,
    selectedTimePointIds: input.selectedTimePointIds,
    analysisTimePointId: input.analysisTimePointId,
    analysisMetric: input.timeAnalysis,
    selectedStatisticalMethod: input.selectedStatisticalMethod,
    correlationMethod: input.correlationMethod ?? null,
    contrastIntent: input.contrastIntent,
    plannedContrastConditionIds: input.plannedContrastConditionIds,
    executedMethod: input.analysis?.request.method ?? null,
    executedProtocolVersion: input.analysis?.request.protocolVersion ?? null,
    executedCorrection: input.analysis?.request.options.multiplicityMethod ?? null,
  });
}

export type GraphUsageState = Readonly<{
  graphType: WorkspaceGraphState["graphType"];
  series: string;
  axes: string;
  layers: string;
  appearance: string;
  annotation: string;
}>;

export type GraphUsageEditCategory =
  | "graph_type"
  | "series_selection"
  | "axes"
  | "layers"
  | "appearance_layout"
  | "statistics_annotation";

export type BenchmarkGraphStateLog = Readonly<{
  identity: string;
  rendered: string;
  analysis: string;
}>;

export type BenchmarkGraphConfigurationEvent = Readonly<{
  type: "graph_workspace_opened" | "graph_configuration_changed" | "analysis_configuration_changed";
  effect: "analysis_only" | "rendered_graph" | "both" | "non_rendering_ui";
  detail: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type BenchmarkGraphConfigurationInput = Readonly<{
  graphType: WorkspaceGraphState["graphType"];
  selectedReadoutId: string;
  sourceMode: NonNullable<WorkspaceGraphState["sourceMode"]>;
  selectedConditionIds: readonly string[];
  analysisConditionIds: readonly string[];
  selectedTimePointIds: readonly string[];
  timeAnalysis: TimeAnalysisPlan;
  selectedStatisticalMethod: AnalysisRecommendation["recommendedMethod"] | undefined;
  statisticsAnnotation: StatisticsAnnotation;
  appearance: WorkspaceGraphState["appearance"];
  axes: WorkspaceGraphState["axes"];
  layers: WorkspaceGraphState["layers"];
}>;

export function createBenchmarkGraphConfigurationEvent(
  previous: BenchmarkGraphStateLog | null,
  current: BenchmarkGraphStateLog,
  input: BenchmarkGraphConfigurationInput,
): BenchmarkGraphConfigurationEvent | null {
  if (!previous || previous.identity !== current.identity) {
    return {
      type: "graph_workspace_opened",
      effect: "non_rendering_ui",
      detail: {
        selectedGraph: input.graphType,
        readoutId: input.selectedReadoutId,
      },
    };
  }
  const renderedChanged = previous.rendered !== current.rendered;
  const analysisChanged = previous.analysis !== current.analysis;
  if (!renderedChanged && !analysisChanged) return null;
  return {
    type: renderedChanged ? "graph_configuration_changed" : "analysis_configuration_changed",
    effect:
      renderedChanged && analysisChanged
        ? "both"
        : renderedChanged
          ? "rendered_graph"
          : "analysis_only",
    detail: {
      graphType: input.graphType,
      readoutId: input.selectedReadoutId,
      sourceMode: input.sourceMode,
      selectedConditions: input.selectedConditionIds.join("|"),
      analysisConditions: input.analysisConditionIds.join("|"),
      selectedTimes: input.selectedTimePointIds.join("|"),
      timeMetric: input.timeAnalysis.kind,
      selectedMethod: input.selectedStatisticalMethod ?? null,
      annotationMode: input.statisticsAnnotation.mode,
      pointSize: input.appearance.pointSize,
      errorBar: input.appearance.errorBar,
      spacing: input.axes.spacing,
      legendPosition: input.appearance.legendPosition,
      palette: input.appearance.palette,
      fontFamily: input.appearance.fontFamily,
      graphTitleFontSize: input.appearance.graphTitleFontSize,
      axisTitleFontSize: input.appearance.axisTitleFontSize,
      tickFontSize: input.appearance.tickFontSize,
      hierarchyFontSize: input.appearance.hierarchyFontSize,
      legendFontSize: input.appearance.legendFontSize,
      axisTitle: input.axes.yTitle,
      axisRangeMode: input.axes.yRangeMode,
      axisMin: input.axes.yMin,
      axisMax: input.axes.yMax,
      axisScale: input.axes.yScale,
      axisTickMode: input.axes.yTickMode,
      axisTickInterval: input.axes.yTickInterval,
      rawLayer: input.layers.raw,
      distributionLayer: input.layers.distribution,
      boxLayer: input.layers.box,
      experimentLayer: input.layers.experiment,
      overallLayer: input.layers.overall,
      summaryLineWidth: input.appearance.summaryLineWidth,
      axisLineWidth: input.appearance.axisLineWidth,
      errorBarLineWidth: input.appearance.errorBarLineWidth,
      connectingLineWidth: input.appearance.connectingLineWidth,
      distributionLineWidth: input.appearance.distributionLineWidth,
    },
  };
}

export function createGraphUsageState(
  input: Readonly<{
    graphType: WorkspaceGraphState["graphType"];
    selectedReadoutId: string;
    sourceMode: WorkspaceGraphState["sourceMode"];
    selectedConditionIds: readonly string[];
    selectedTimePointIds: readonly string[];
    grouping: GraphGrouping;
    axes: WorkspaceGraphState["axes"];
    layers: WorkspaceGraphState["layers"];
    appearance: WorkspaceGraphState["appearance"];
    statisticsAnnotation: StatisticsAnnotation;
    statisticsAnnotations: readonly StatisticsAnnotationEntry[];
  }>,
): GraphUsageState {
  return {
    graphType: input.graphType,
    series: JSON.stringify({
      selectedReadoutId: input.selectedReadoutId,
      sourceMode: input.sourceMode,
      selectedConditionIds: input.selectedConditionIds,
      selectedTimePointIds: input.selectedTimePointIds,
      grouping: input.grouping,
    }),
    axes: JSON.stringify(input.axes),
    layers: JSON.stringify(input.layers),
    appearance: JSON.stringify(input.appearance),
    annotation: JSON.stringify({
      statisticsAnnotation: input.statisticsAnnotation,
      statisticsAnnotations: input.statisticsAnnotations,
    }),
  };
}

export function changedGraphUsageCategories(
  previous: GraphUsageState,
  current: GraphUsageState,
): readonly GraphUsageEditCategory[] {
  return [
    ...(previous.graphType !== current.graphType ? (["graph_type"] as const) : []),
    ...(previous.series !== current.series ? (["series_selection"] as const) : []),
    ...(previous.axes !== current.axes ? (["axes"] as const) : []),
    ...(previous.layers !== current.layers ? (["layers"] as const) : []),
    ...(previous.appearance !== current.appearance ? (["appearance_layout"] as const) : []),
    ...(previous.annotation !== current.annotation ? (["statistics_annotation"] as const) : []),
  ];
}
