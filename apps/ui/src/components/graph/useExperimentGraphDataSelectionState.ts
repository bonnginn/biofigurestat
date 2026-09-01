import { useState } from "react";

import type { ExperimentSetDraft, TimeAnalysisPlan } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import type { GraphSourceMode } from "./ExperimentGraphSelectionEditor";

type InitialState = Omit<WorkspaceGraphState, "id" | "displayName">;

export function useExperimentGraphDataSelectionState(input: {
  draft: ExperimentSetDraft;
  initialState?: InitialState;
}) {
  const { draft, initialState } = input;
  const [selectedReadoutId, setSelectedReadoutId] = useState(
    initialState?.selectedReadoutId ?? draft.readouts[0]?.id ?? "",
  );
  const [selectedConditionIds, setSelectedConditionIds] = useState<string[]>(() =>
    initialState
      ? [
          ...(initialState.dataSets?.displaySet.conditionIds.length
            ? initialState.dataSets.displaySet.conditionIds
            : initialState.selectedConditionIds),
        ]
      : draft.conditions.map(({ id }) => id),
  );
  const [analysisConditionIds, setAnalysisConditionIds] = useState<string[]>(() =>
    initialState?.dataSets?.analysisSet.conditionIds.length
      ? [...initialState.dataSets.analysisSet.conditionIds]
      : initialState?.analysisConditionIds
        ? [...initialState.analysisConditionIds]
        : draft.conditions.filter(({ role }) => role !== "auxiliary_reference").map(({ id }) => id),
  );
  const [selectedTimePointIds, setSelectedTimePointIds] = useState<string[]>(() =>
    initialState
      ? [
          ...(initialState.dataSets?.displaySet.timePointIds.length
            ? initialState.dataSets.displaySet.timePointIds
            : initialState.selectedTimePointIds),
        ]
      : draft.time.points.map(({ id }) => id),
  );
  const [analysisTimePointId, setAnalysisTimePointId] = useState<string | null>(
    initialState?.analysisTimePointId ??
      (draft.time.points.length === 1 ? (draft.time.points[0]?.id ?? null) : null),
  );
  const [timeAnalysis, setTimeAnalysis] = useState<TimeAnalysisPlan>(
    initialState?.analysisMetric ?? { kind: "selected_timepoint" },
  );
  const [sourceMode, setSourceMode] = useState<GraphSourceMode>(
    initialState?.sourceMode ?? "raw_readout",
  );

  return {
    selectedReadoutId,
    setSelectedReadoutId,
    selectedConditionIds,
    setSelectedConditionIds,
    analysisConditionIds,
    setAnalysisConditionIds,
    selectedTimePointIds,
    setSelectedTimePointIds,
    analysisTimePointId,
    setAnalysisTimePointId,
    timeAnalysis,
    setTimeAnalysis,
    sourceMode,
    setSourceMode,
  };
}
