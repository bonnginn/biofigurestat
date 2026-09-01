import { localizedText, type AppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft, TimeAnalysisPlan } from "../../app/experimentDraft";
import { isDerivedTimeMetric } from "../../app/experimentDraftAnalysis";
import { timeMetricLabel } from "./experimentGraphAnnotations";

export function selectExperimentGraphActiveScope(input: Readonly<{
  draft: ExperimentSetDraft;
  selectedReadoutId: string;
  selectedConditionIds: readonly string[];
  analysisConditionIds: readonly string[];
  selectedTimePointIds: readonly string[];
  sourceMode: "raw_readout" | "derived_metric";
  timeAnalysis: TimeAnalysisPlan;
  locale: AppLocale;
}>) {
  const readout =
    input.draft.readouts.find((item) => item.id === input.selectedReadoutId) ??
    input.draft.readouts[0];
  const displayConditionIds = new Set(input.selectedConditionIds);
  const analysisConditionIds = new Set(input.analysisConditionIds);
  const activeConditions = input.draft.conditions.filter((condition) =>
    displayConditionIds.has(condition.id),
  );
  const activeAnalysisConditions = input.draft.conditions.filter((condition) =>
    analysisConditionIds.has(condition.id),
  );
  const activeTimePoints = input.draft.time.points.filter((point) =>
    input.selectedTimePointIds.includes(point.id),
  );
  const timeLabel =
    input.sourceMode === "derived_metric" && isDerivedTimeMetric(input.timeAnalysis)
      ? localizedText(input.locale, "派生値：", "Derived value: ") +
        timeMetricLabel(input.timeAnalysis, input.locale)
      : activeTimePoints.length
        ? activeTimePoints.map((point) => `${point.value} ${input.draft.time.unit}`).join("、")
        : input.draft.time.sampling === "none"
          ? undefined
          : localizedText(input.locale, "時点未選択", "No time point selected");

  return {
    readout,
    activeReadoutId: readout?.id ?? "",
    activeConditionIds: displayConditionIds,
    activeConditions,
    activeAnalysisConditions,
    activeTimePoints,
    timeLabel,
  };
}
