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
