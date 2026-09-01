import { useMemo } from "react";

import {
  createWorkspaceGraphStateSnapshot,
  type WorkspaceGraphStateSnapshotInput,
} from "../../app/experimentGraphStateSelectors";

export function useExperimentGraphStateSnapshot(input: WorkspaceGraphStateSnapshotInput) {
  return useMemo(
    () => createWorkspaceGraphStateSnapshot(input),
    [
      input.analysis,
      input.analysisConditionIds,
      input.analysisMetric,
      input.analysisTimePointId,
      input.appearance,
      input.axes,
      input.graphType,
      input.grouping,
      input.initialAnalysisRunId,
      input.layers,
      input.plannedContrastConditionIds,
      input.selectedConditionIds,
      input.selectedReadoutId,
      input.selectedTimePointIds,
      input.sourceMode,
      input.statisticsAnnotation,
      input.statisticsAnnotations,
    ],
  );
}
