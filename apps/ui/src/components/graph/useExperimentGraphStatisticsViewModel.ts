import { useMemo } from "react";

import type {
  ExperimentCellMap,
  ExperimentSetDraft,
  TimeAnalysisPlan,
} from "../../app/experimentDraft";
import type { ContrastIntent } from "../../app/experimentDraftAnalysis";
import {
  createExperimentWorkspaceDesign,
  type WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";
import { selectGraphAnalysisScopePresentation } from "./ExperimentGraphAnalysisScopeNotice";
import {
  createGraphAnalysisContextKey,
  varyingGraphAnalysisAttributes,
} from "./experimentGraphStatistics";
import { useExperimentGraphAnalysisAssessment } from "./useExperimentGraphAnalysisAssessment";

type AssessmentInput = Parameters<typeof useExperimentGraphAnalysisAssessment>[0];

type Input = Readonly<{
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  activeReadoutId: string;
  sourceMode: WorkspaceGraphState["sourceMode"];
  analysisConditionIds: readonly string[];
  selectedTimePointIds: readonly string[];
  analysisTimePointId: string | null;
  timeAnalysis: TimeAnalysisPlan;
  correlationMethod: AssessmentInput["correlationMethod"];
  selectedMethod: AssessmentInput["selectedMethod"];
  contrastIntent: ContrastIntent;
  plannedContrastConditionIds: readonly (readonly [string, string])[];
  axes: WorkspaceGraphState["axes"];
}>;

/**
 * Projects the state consumed by the Statistics surface without owning any
 * scientific decision. Every value is derived from the canonical draft and
 * the user's explicit Graph/Statistics selections.
 */
export function useExperimentGraphStatisticsViewModel(input: Input) {
  const recommendationDesign = useMemo(() => {
    try {
      return createExperimentWorkspaceDesign(input.draft, "1970-01-01T00:00:00.000Z");
    } catch {
      // Legacy shared-source drafts remain inspectable, but cannot execute
      // Statistics until their adaptive contract is complete.
      return null;
    }
  }, [input.draft]);

  const analysisAssessment = useExperimentGraphAnalysisAssessment({
    draft: input.draft,
    cells: input.cells,
    readoutId: input.activeReadoutId,
    conditionIds: input.analysisConditionIds,
    timePointId: input.analysisTimePointId ?? undefined,
    timeAnalysis: input.timeAnalysis,
    correlationMethod: input.correlationMethod,
    selectedMethod: input.selectedMethod,
    contrastIntent: input.contrastIntent,
    plannedContrastConditionIds: input.plannedContrastConditionIds,
    withinFactor: {
      role: input.axes.xSemantic,
      title: input.axes.xTitle,
      unit: input.axes.xUnit,
    },
  });

  const analysisContextKey = createGraphAnalysisContextKey({
    draft: input.draft,
    readoutId: input.activeReadoutId,
    sourceMode: input.sourceMode,
    conditionIds: input.analysisConditionIds,
    displayedTimePointIds: input.selectedTimePointIds,
    analysisTimePointId: input.analysisTimePointId,
    plannedContrastConditionIds: input.plannedContrastConditionIds,
    timeAnalysis: input.timeAnalysis,
  });
  const varyingStatisticalAttributes = varyingGraphAnalysisAttributes(
    input.draft,
    input.analysisConditionIds,
  );
  const hasFactorByTimeStructure =
    input.draft.time.points.length > 1 && varyingStatisticalAttributes.length > 1;
  const analysisScopePresentation = selectGraphAnalysisScopePresentation({
    timePointCount: input.draft.time.points.length,
    plan: input.timeAnalysis,
    analysisTimePointId: input.analysisTimePointId,
    hasFactorByTimeStructure,
  });

  return {
    recommendationDesign,
    analysisAssessment,
    analysisContextKey,
    varyingStatisticalAttributes,
    hasFactorByTimeStructure,
    analysisScopePresentation,
  };
}
