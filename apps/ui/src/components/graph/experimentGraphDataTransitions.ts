import type { Dispatch, SetStateAction } from "react";

import type { AppLocale } from "../../app/appLocale";
import { localizedText } from "../../app/appLocale";
import type { ExperimentSetDraft, TimeAnalysisPlan } from "../../app/experimentDraft";
import { defaultGraphYTitle, defaultLayersForGraphType } from "../../app/graphDefaults";
import type {
  WorkspaceGraphAnalysis,
  WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";
import { timeMetricLabel } from "./experimentGraphAnnotations";

type Input = Readonly<{
  draft: ExperimentSetDraft;
  locale: AppLocale;
  selectedReadoutId: string;
  sourceMode: NonNullable<WorkspaceGraphState["sourceMode"]>;
  timeAnalysis: TimeAnalysisPlan;
  setSelectedReadoutId: (readoutId: string) => void;
  setSelectedConditionIds: Dispatch<SetStateAction<string[]>>;
  setAnalysisConditionIds: Dispatch<SetStateAction<string[]>>;
  setSelectedTimePointIds: Dispatch<SetStateAction<string[]>>;
  setAnalysisTimePointId: (timePointId: string | null) => void;
  setSourceMode: (mode: NonNullable<WorkspaceGraphState["sourceMode"]>) => void;
  setTimeAnalysis: (plan: TimeAnalysisPlan) => void;
  setGraphType: (graphType: WorkspaceGraphState["graphType"]) => void;
  setLayers: Dispatch<SetStateAction<WorkspaceGraphState["layers"]>>;
  setAxes: Dispatch<SetStateAction<WorkspaceGraphState["axes"]>>;
  setAnalysis: Dispatch<SetStateAction<WorkspaceGraphAnalysis | null>>;
  removeConditionFromPlannedContrasts: (conditionId: string) => void;
}>;

/**
 * Owns Graph/Statistics data-selection transitions that must invalidate stale
 * analysis together. It does not infer experimental structure or identities.
 */
export function createExperimentGraphDataTransitions(input: Input) {
  const t = (ja: string, en: string) => localizedText(input.locale, ja, en);
  const currentReadout = input.draft.readouts.find(({ id }) => id === input.selectedReadoutId);

  const changeAnalysisCondition = (conditionId: string, checked: boolean) => {
    input.setAnalysisConditionIds((current) =>
      checked
        ? [...current, conditionId]
        : current.filter((selectedId) => selectedId !== conditionId),
    );
    input.removeConditionFromPlannedContrasts(conditionId);
    input.setAnalysis(null);
  };

  const changeReadout = (readoutId: string) => {
    const nextReadout = input.draft.readouts.find(({ id }) => id === readoutId);
    input.setSelectedReadoutId(readoutId);
    input.setAxes((current) => ({
      ...current,
      yTitle: defaultGraphYTitle(nextReadout),
    }));
    input.setAnalysis(null);
  };

  const changeSourceMode = (mode: NonNullable<WorkspaceGraphState["sourceMode"]>) => {
    input.setSourceMode(mode);
    let nextTimeAnalysis = input.timeAnalysis;
    if (mode === "derived_metric") {
      const nextType = input.draft.conditionAssignment.kind === "matched" ? "paired_dot" : "dot";
      if (input.timeAnalysis.kind === "selected_timepoint") {
        nextTimeAnalysis = { kind: "auc" };
        input.setTimeAnalysis(nextTimeAnalysis);
      }
      input.setGraphType(nextType);
      input.setLayers(defaultLayersForGraphType(nextType, "nested_continuous"));
    }
    input.setAxes((current) => ({
      ...current,
      yTitle:
        mode === "derived_metric"
          ? `${currentReadout?.label ?? t("測定値", "Measured value")} — ${timeMetricLabel(nextTimeAnalysis, input.locale)}`
          : defaultGraphYTitle(currentReadout),
    }));
    input.setAnalysis(null);
  };

  const changeAllTimePoints = (checked: boolean) => {
    input.setSelectedTimePointIds(checked ? input.draft.time.points.map(({ id }) => id) : []);
    input.setAnalysis(null);
  };

  const changeTimePoint = (timePointId: string, checked: boolean) => {
    input.setSelectedTimePointIds((current) =>
      checked
        ? [...current, timePointId]
        : current.filter((selectedId) => selectedId !== timePointId),
    );
    input.setAnalysis(null);
  };

  const changeDisplayedCondition = (conditionId: string, checked: boolean) => {
    input.setSelectedConditionIds((current) =>
      checked
        ? [...current, conditionId]
        : current.filter((selectedId) => selectedId !== conditionId),
    );
  };

  const changeTimeAnalysisKind = (kind: TimeAnalysisPlan["kind"]) => {
    const nextPlan = { kind };
    input.setTimeAnalysis(nextPlan);
    if (kind === "full_time_course") input.setSourceMode("raw_readout");
    if (input.sourceMode === "derived_metric") {
      input.setAxes((current) => ({
        ...current,
        yTitle: `${currentReadout?.label ?? t("測定値", "Measured value")} — ${timeMetricLabel(nextPlan, input.locale)}`,
      }));
    }
    input.setAnalysis(null);
  };

  const changeTimeAnalysisPlan = (nextPlan: TimeAnalysisPlan) => {
    input.setTimeAnalysis(nextPlan);
    input.setAnalysis(null);
  };

  const changeAnalysisTimePoint = (timePointId: string | null) => {
    input.setAnalysisTimePointId(timePointId);
    input.setAnalysis(null);
  };

  return {
    changeAnalysisCondition,
    changeReadout,
    changeSourceMode,
    changeAllTimePoints,
    changeTimePoint,
    changeDisplayedCondition,
    changeTimeAnalysisKind,
    changeTimeAnalysisPlan,
    changeAnalysisTimePoint,
  };
}
