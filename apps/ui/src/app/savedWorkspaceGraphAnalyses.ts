import type { ProjectState } from "@lsaa/project";

import type { WorkspaceGraphState } from "./experimentWorkspaceProject";

export function rebindAnalysisAnnotationReferences(
  annotations: WorkspaceGraphState["statisticsAnnotations"],
  previousRequestId: string | undefined,
  persistedRequestId: string,
): WorkspaceGraphState["statisticsAnnotations"] {
  if (!previousRequestId || previousRequestId === persistedRequestId) return annotations;
  return annotations?.map((annotation) =>
    annotation.analysisId === previousRequestId
      ? { ...annotation, analysisId: persistedRequestId }
      : annotation,
  );
}

function submittedAnalysisStillCurrent(
  current: WorkspaceGraphState,
  submitted: WorkspaceGraphState,
): boolean {
  const inputs = (graph: WorkspaceGraphState) => ({
    selectedReadoutId: graph.selectedReadoutId,
    selectedConditionIds: graph.selectedConditionIds,
    selectedTimePointIds: graph.selectedTimePointIds,
    analysisTimePointId: graph.analysisTimePointId,
    analysisMetric: graph.analysisMetric ?? { kind: "selected_timepoint" },
    analysisConditionIds: graph.analysisConditionIds,
    sourceMode: graph.sourceMode,
    analysisSet: graph.dataSets?.analysisSet,
    analysis: graph.analysis,
    analysisRunId: graph.analysisRunId,
  });
  return JSON.stringify(inputs(current)) === JSON.stringify(inputs(submitted));
}

/** Adopt only the references assigned by a successful save to the same execution.
 * Keep current appearance and avoid replacing a newer or invalidated analysis.
 * The caller must also verify that the scientific source did not change in flight.
 */
export function synchronizeSavedWorkspaceGraphAnalyses(input: {
  currentGraphs: readonly WorkspaceGraphState[];
  submittedGraphs: readonly WorkspaceGraphState[];
  savedState: ProjectState;
}): WorkspaceGraphState[] {
  const submitted = new Map(input.submittedGraphs.map((graph) => [graph.id, graph]));
  const saved = new Map(
    (input.savedState.experimentWorkspace?.graphs ?? []).map((graph) => [graph.id, graph]),
  );
  return input.currentGraphs.map((current) => {
    const before = submitted.get(current.id);
    const persisted = saved.get(current.id);
    if (
      !before ||
      before.analysis?.result.status !== "ok" ||
      !submittedAnalysisStillCurrent(current, before) ||
      !persisted?.analysisRunId
    )
      return current;
    const run = input.savedState.analysisRuns.find(({ id }) => id === persisted.analysisRunId);
    if (!run) return current;
    return {
      ...current,
      analysisRunId: run.id,
      statisticsAnnotations: rebindAnalysisAnnotationReferences(
        current.statisticsAnnotations,
        before.analysis.request.requestId,
        run.request.requestId,
      ),
      analysis: {
        request: run.request,
        result: run.result,
        recommendedMethod: run.recommendation.recommendedMethod,
        recommendation: run.recommendation,
      },
    };
  });
}
