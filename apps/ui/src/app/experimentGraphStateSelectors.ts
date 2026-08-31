import type { TimeAnalysisPlan } from "./experimentDraft";
import type { WorkspaceGraphAnalysis, WorkspaceGraphState } from "./experimentWorkspaceProject";

export type WorkspaceGraphStateSnapshot = Omit<WorkspaceGraphState, "id" | "displayName">;

type StatisticsAnnotation = NonNullable<WorkspaceGraphState["statisticsAnnotation"]>;
type StatisticsAnnotationEntry = NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number];

export type WorkspaceGraphStateSnapshotInput = Readonly<{
  selectedReadoutId: string;
  sourceMode: "raw_readout" | "derived_metric";
  selectedConditionIds: readonly string[];
  analysisConditionIds: readonly string[];
  selectedTimePointIds: readonly string[];
  analysisTimePointId: string | null;
  analysisMetric: TimeAnalysisPlan;
  plannedContrastConditionIds: ReadonlyArray<readonly [string, string]>;
  graphType: WorkspaceGraphState["graphType"];
  grouping: NonNullable<WorkspaceGraphState["grouping"]>;
  layers: WorkspaceGraphState["layers"];
  appearance: WorkspaceGraphState["appearance"];
  axes: WorkspaceGraphState["axes"];
  statisticsAnnotation: StatisticsAnnotation;
  statisticsAnnotations: readonly StatisticsAnnotationEntry[];
  initialAnalysisRunId: string | null | undefined;
  analysis: WorkspaceGraphAnalysis | null;
}>;

function comparisonSetForSnapshot(
  plannedContrastConditionIds: ReadonlyArray<readonly [string, string]>,
  statisticsAnnotations: readonly StatisticsAnnotationEntry[],
): NonNullable<WorkspaceGraphState["dataSets"]>["comparisonSet"] {
  const comparisons = [
    ...plannedContrastConditionIds.map((conditionIds, index) => ({
      id: `planned.${index + 1}`,
      conditionIds: [conditionIds[0], conditionIds[1]] as [string, string],
    })),
    ...statisticsAnnotations.flatMap((annotation) =>
      annotation.endpoints
        ? [
            {
              id: annotation.comparisonId ?? annotation.id,
              conditionIds: [
                annotation.endpoints[0].conditionId,
                annotation.endpoints[1].conditionId,
              ] as [string, string],
            },
          ]
        : [],
    ),
  ];
  return [...new Map(comparisons.map((comparison) => [comparison.id, comparison])).values()];
}

/**
 * Selects the persisted Graph state from workbench-owned editing state.
 *
 * This is intentionally a projection only: it does not infer experimental structure, alter
 * analysis results, or manufacture pairing/nesting from presentation order.
 */
export function createWorkspaceGraphStateSnapshot(
  input: WorkspaceGraphStateSnapshotInput,
): WorkspaceGraphStateSnapshot {
  const {
    selectedReadoutId,
    sourceMode,
    selectedConditionIds,
    analysisConditionIds,
    selectedTimePointIds,
    analysisTimePointId,
    analysisMetric,
    plannedContrastConditionIds,
    graphType,
    grouping,
    layers,
    appearance,
    axes,
    statisticsAnnotation,
    statisticsAnnotations,
    initialAnalysisRunId,
    analysis,
  } = input;

  return {
    selectedReadoutId,
    sourceMode,
    selectedConditionIds: [...selectedConditionIds],
    analysisConditionIds: [...analysisConditionIds],
    selectedTimePointIds: [...selectedTimePointIds],
    dataSets: {
      displaySet: {
        conditionIds: [...selectedConditionIds],
        timePointIds: [...selectedTimePointIds],
      },
      analysisSet: {
        conditionIds: [...analysisConditionIds],
        timePointIds: analysisTimePointId ? [analysisTimePointId] : [...selectedTimePointIds],
      },
      comparisonSet: comparisonSetForSnapshot(
        plannedContrastConditionIds,
        statisticsAnnotations,
      ),
      annotationSet: statisticsAnnotations.flatMap((annotation) =>
        annotation.endpoints ? [{ comparisonId: annotation.comparisonId ?? annotation.id }] : [],
      ),
    },
    analysisTimePointId,
    analysisMetric,
    graphType,
    grouping,
    layers,
    appearance,
    axes,
    statisticsAnnotation,
    statisticsAnnotations: [...statisticsAnnotations],
    analysisRunId: analysis ? (initialAnalysisRunId ?? null) : null,
    analysis,
  };
}
