import { useState } from "react";
import type { AnalysisRecommendation } from "@lsaa/analysis-contracts";

import {
  recordBenchmarkEvent,
  type BenchmarkEventEffect,
} from "../../app/benchmarkEvaluation";
import type {
  ContrastIntent,
  ScientificComparisonGoal,
} from "../../app/experimentDraftAnalysis";
import type { WorkspaceGraphAnalysis } from "../../app/experimentWorkspaceProject";
import { statisticalMethodForContrastIntent } from "./experimentGraphStatistics";

type StatisticalMethod = AnalysisRecommendation["recommendedMethod"];
type RecordEvent = (
  type: string,
  detail: Readonly<Record<string, string | number | boolean | null>>,
  effect: BenchmarkEventEffect,
) => void;

export function useExperimentGraphStatisticsIntent(input: Readonly<{
  initialAnalysis?: WorkspaceGraphAnalysis | null;
  initialComparisonGoal?: ScientificComparisonGoal;
  clearAnalysis: () => void;
  recordEvent?: RecordEvent;
}>) {
  const recordEvent = input.recordEvent ?? recordBenchmarkEvent;
  const request = input.initialAnalysis?.request;
  const [correlationMethod, setCorrelationMethod] = useState<"pearson" | "spearman" | undefined>(
    request?.method === "pearson" || request?.method === "spearman" ? request.method : undefined,
  );
  const [selectedMethod, setSelectedMethod] = useState<StatisticalMethod | undefined>(
    request?.method,
  );
  const [contrastIntent, setContrastIntent] = useState<ContrastIntent>(
    request?.protocolVersion === "0.2.0" ? request.contrastIntent : "all_pairs",
  );
  const [plannedContrastConditionIds, setPlannedContrastConditionIds] = useState<
    Array<readonly [string, string]>
  >(
    request?.protocolVersion === "0.2.0"
      ? (request.plannedContrastConditionIds ?? []).map(([firstId, secondId]) => [
          firstId,
          secondId,
        ])
      : [],
  );
  const [comparisonGoal, setComparisonGoal] = useState<ScientificComparisonGoal>(
    input.initialComparisonGoal ?? "difference",
  );

  const recordMethod = (method: StatisticalMethod, recommended: StatisticalMethod = method) => {
    recordEvent(
      "statistics_method_selected",
      { recommended, selected: method },
      "analysis_only",
    );
    input.clearAnalysis();
  };

  return {
    correlationMethod,
    selectedMethod,
    comparisonGoal,
    contrastIntent,
    plannedContrastConditionIds,
    changeCorrelationMethod(method: "pearson" | "spearman", recommended?: StatisticalMethod) {
      setCorrelationMethod(method);
      setSelectedMethod(method);
      recordMethod(method, recommended);
    },
    changeSelectedMethod(method: StatisticalMethod, recommended?: StatisticalMethod) {
      setSelectedMethod(method);
      recordMethod(method, recommended);
    },
    changeComparisonGoal(goal: ScientificComparisonGoal) {
      setComparisonGoal(goal);
      recordEvent("statistics_comparison_goal_selected", { goal }, "analysis_only");
      input.clearAnalysis();
    },
    changePlannedContrastConditionIds(pairs: readonly (readonly [string, string])[]) {
      setPlannedContrastConditionIds([...pairs]);
      recordEvent(
        "statistics_planned_comparisons_selected",
        {
          pairs: pairs.map(([firstId, secondId]) => `${firstId}:${secondId}`).join("|"),
          count: pairs.length,
        },
        "analysis_only",
      );
      input.clearAnalysis();
    },
    removeConditionFromPlannedContrasts(conditionId: string) {
      setPlannedContrastConditionIds((current) =>
        current.filter(
          ([firstId, secondId]) => firstId !== conditionId && secondId !== conditionId,
        ),
      );
    },
    changeContrastIntent(intent: ContrastIntent) {
      setContrastIntent(intent);
      recordEvent("statistics_contrast_selected", { intent }, "analysis_only");
      setSelectedMethod(statisticalMethodForContrastIntent(intent));
      input.clearAnalysis();
    },
  };
}
