import { useMemo } from "react";

import { assessDraftGraphAnalysis } from "../../app/experimentDraftAnalysis";

type AssessmentInput = Parameters<typeof assessDraftGraphAnalysis>[0];

/**
 * Keeps the statistics-readiness projection outside the workbench composition
 * component. This hook does not own or alter any scientific choice; it only
 * memoizes the existing assessment against every semantic input.
 */
export function useExperimentGraphAnalysisAssessment(input: AssessmentInput) {
  return useMemo(
    () => assessDraftGraphAnalysis(input),
    [
      input.cells,
      input.conditionIds,
      input.contrastIntent,
      input.correlationMethod,
      input.draft,
      input.plannedContrastConditionIds,
      input.readoutId,
      input.selectedMethod,
      input.timeAnalysis,
      input.timePointId,
      input.withinFactor?.role,
      input.withinFactor?.title,
      input.withinFactor?.unit,
    ],
  );
}
