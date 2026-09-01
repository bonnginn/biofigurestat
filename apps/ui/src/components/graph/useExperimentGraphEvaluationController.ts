import { useState, type RefObject } from "react";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import type { DraftAnalysisAssessment } from "../../app/experimentDraftAnalysis";
import type {
  WorkspaceGraphAnalysis,
  WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";
import { useBenchmarkRun } from "../../app/benchmarkEvaluation";
import { evaluationMode, evaluationModeIsConfigured } from "../../app/evaluationMode";
import type { BenchmarkGraphConfigurationInput } from "./experimentGraphInstrumentation";
import { useBenchmarkGraphConfigurationEffects } from "./useBenchmarkGraphConfigurationEffects";
import { useDefaultBenchmarkGraphCapture } from "./useDefaultBenchmarkGraphCapture";
import { finalizeBenchmarkGraphCapture } from "./finalizeBenchmarkGraphCapture";

export type ExperimentGraphEvaluationControllerInput = Readonly<{
  svgRef: RefObject<SVGSVGElement | null>;
  draft: ExperimentSetDraft;
  analysis: WorkspaceGraphAnalysis | null;
  analysisAssessment: Pick<DraftAnalysisAssessment, "nByCondition">;
  methodsText: string | null;
  renderedState: string;
  analysisState: string;
  configuration: BenchmarkGraphConfigurationInput;
  graphType: WorkspaceGraphState["graphType"];
  selectedReadoutId: string;
  selectedConditionIds: readonly string[];
  analysisConditionIds: readonly string[];
  graphState: unknown;
  hasData: boolean;
  workspaceMode: "graph" | "statistics" | "combined";
  readoutLabel: string;
  activeConditionLabels: readonly string[];
}>;

export type ExperimentGraphEvaluationController = Readonly<{
  status: string | null;
  actionLabel: string | null;
  actionDisabled: boolean;
  finalize: () => Promise<void>;
}>;

export function useExperimentGraphEvaluationController(
  input: ExperimentGraphEvaluationControllerInput,
): ExperimentGraphEvaluationController {
  const [status, setStatus] = useState<string | null>(null);
  const run = useBenchmarkRun();
  const descriptive = input.draft.analysisIntent.kind === "single_cohort";

  useBenchmarkGraphConfigurationEffects({
    identity: run.identity,
    renderedState: input.renderedState,
    analysisState: input.analysisState,
    configuration: input.configuration,
  });
  useDefaultBenchmarkGraphCapture({
    svgRef: input.svgRef,
    identity: run.identity,
    defaultGraphCapture: run.defaultGraphCapture,
    eventCount: run.events.length,
    hasData: input.hasData,
    workspaceMode: input.workspaceMode,
    analysisState: input.analysisState,
    setStatus,
  });

  const descriptiveMethodsText = [
    "Descriptive Figure workflow (no inferential test).",
    `Readout: ${input.readoutLabel}.`,
    `Displayed conditions: ${input.activeConditionLabels.join(", ")}.`,
    `Statistical unit retained as: ${input.draft.conditionAssignment.unitLabel}.`,
    "Reason: the approved Gold brief specifies a descriptive panel and does not define an inferential comparator or null hypothesis.",
  ].join("\n");

  return {
    status,
    actionLabel:
      import.meta.env.DEV && evaluationModeIsConfigured(evaluationMode) ? "Benchmark完了" : null,
    actionDisabled:
      !input.hasData ||
      !run.identity ||
      !run.supportStatus ||
      !run.defaultGraphCaptured ||
      (!input.analysis && !descriptive),
    finalize: () =>
      finalizeBenchmarkGraphCapture({
        svg: input.svgRef.current,
        draft: input.draft,
        analysis: input.analysis,
        analysisAssessment: input.analysisAssessment,
        descriptiveBenchmarkRun: descriptive,
        methodsText: input.methodsText,
        descriptiveMethodsText,
        benchmarkAnalysisState: input.analysisState,
        graphType: input.graphType,
        selectedReadoutId: input.selectedReadoutId,
        selectedConditionIds: input.selectedConditionIds,
        analysisConditionIds: input.analysisConditionIds,
        graphState: input.graphState,
        setStatus,
      }),
  };
}
