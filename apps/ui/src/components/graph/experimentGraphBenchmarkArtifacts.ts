import {
  requireAnalysisRequestRecommendation,
  type AnalysisEngineRequest,
} from "@lsaa/analysis-contracts";
import type { BenchmarkArtifact, BenchmarkRunState } from "../../app/benchmarkEvaluation";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import type { DraftAnalysisAssessment } from "../../app/experimentDraftAnalysis";
import {
  createExperimentWorkspaceDesign,
  type WorkspaceGraphAnalysis,
} from "../../app/experimentWorkspaceProject";
import { PRODUCT_IDENTITY } from "../../app/productIdentity";

export function benchmarkContrastForRequest(request: AnalysisEngineRequest): unknown {
  if (request.protocolVersion === "0.15.0") {
    return {
      comparisonId: request.comparisonId,
      conditionIds: request.contrastConditionIds,
      margin: request.equivalencePlan.margin,
    };
  }
  if (request.protocolVersion === "0.1.0") return request.contrastConditionIds;
  if (request.protocolVersion === "0.2.0") {
    return {
      intent: request.contrastIntent,
      controlConditionId: request.controlConditionId ?? null,
      plannedConditionPairs: request.plannedContrastConditionIds ?? [],
    };
  }
  if (request.protocolVersion === "0.5.0") return request.variableConditionIds;
  if (request.protocolVersion === "0.11.0") {
    return {
      rows: request.rowCategoryIds,
      columns: request.columnCategoryIds,
    };
  }
  if (request.protocolVersion === "0.12.0") return request.conditionIds;
  if (request.protocolVersion === "0.13.0") return { x: request.xLabel, y: request.yLabel };
  if (request.protocolVersion === "0.14.0") {
    return {
      seriesIds: request.seriesIds,
      modelId: request.modelId,
    };
  }
  if (
    request.protocolVersion === "0.6.0" ||
    request.protocolVersion === "0.7.0" ||
    request.protocolVersion === "0.8.0" ||
    request.protocolVersion === "0.10.0"
  ) {
    return request.conditionIds;
  }
  if (request.protocolVersion === "0.9.0") {
    return {
      conditionId: request.conditionId,
      referenceValue: request.nullValue,
    };
  }
  return request.primaryContrastConditionIds;
}

export function createBenchmarkStatisticsArtifact(
  input: Readonly<{
    draft: ExperimentSetDraft;
    analysis: WorkspaceGraphAnalysis | null;
    analysisAssessment: Pick<DraftAnalysisAssessment, "nByCondition">;
    selectedReadoutId: string;
    selectedConditionIds: readonly string[];
    analysisConditionIds: readonly string[];
  }>,
) {
  const {
    draft,
    analysis,
    analysisAssessment,
    selectedReadoutId,
    selectedConditionIds,
    analysisConditionIds,
  } = input;
  if (!analysis) {
    return {
      selectedReadoutId,
      selectedConditionIds,
      statisticalUnit: draft.conditionAssignment.unitLabel,
      selectedMethod: null,
      state: "not_performed",
      reason:
        "Approved Gold brief specifies a descriptive panel without an inferential comparator or null hypothesis.",
      applicationVersion: PRODUCT_IDENTITY.version,
    };
  }

  const recommendation = requireAnalysisRequestRecommendation(
    createExperimentWorkspaceDesign(draft, analysis.result.completedAt),
    analysis.request,
    { outcomeId: selectedReadoutId },
  );
  return {
    selectedReadoutId,
    selectedConditionIds: analysisConditionIds,
    displayedConditionIds: selectedConditionIds,
    statisticalUnit: draft.conditionAssignment.unitLabel,
    recommendation: {
      ...recommendation,
      ...(analysis.recommendation?.decision
        ? { decision: analysis.recommendation.decision }
        : {}),
    },
    recommendedMethod: recommendation.recommendedMethod,
    selectedMethod: analysis.request.method,
    recommendationDiffers: recommendation.recommendedMethod !== analysis.request.method,
    contrast: benchmarkContrastForRequest(analysis.request),
    nByCondition: analysisAssessment.nByCondition,
    correction: analysis.request.options.multiplicityMethod,
    request: analysis.request,
    result: analysis.result,
    state: "current",
    applicationVersion: PRODUCT_IDENTITY.version,
  };
}

export function createBenchmarkRunArtifact(
  input: Readonly<{
    run: BenchmarkRunState;
    analysis: WorkspaceGraphAnalysis | null;
    sourceRevision: string | null;
    completedAt: string;
  }>,
) {
  const { run, analysis, sourceRevision, completedAt } = input;
  return {
    ...run.identity,
    appVersion: PRODUCT_IDENTITY.version,
    sourceRevision,
    engineVersion: analysis?.result.engine.version ?? "not_applicable",
    startedAt: run.startedAt,
    completedAt,
    outcome: run.outcome,
    supportStatus: run.supportStatus,
    artifactCompleteness: "complete",
    defaultGraphCaptured: run.defaultGraphCaptured,
    captureProvenanceVersion: "1.1.0",
    defaultCapturedAt: run.defaultGraphCapture?.capturedAt ?? null,
    defaultCapturedEventIndex: run.defaultGraphCapture?.eventIndex ?? null,
    finalCapturedAt: run.finalGraphCapture?.capturedAt ?? null,
    finalCapturedEventIndex: run.finalGraphCapture?.eventIndex ?? null,
    defaultGraphStateFingerprint: run.defaultGraphCapture?.graphStateFingerprint ?? null,
    finalGraphStateFingerprint: run.finalGraphCapture?.graphStateFingerprint ?? null,
    defaultAnalysisStateFingerprint: run.defaultGraphCapture?.analysisStateFingerprint ?? null,
    finalAnalysisStateFingerprint: run.finalGraphCapture?.analysisStateFingerprint ?? null,
    defaultSvgSha256: run.defaultGraphCapture?.svgSha256 ?? null,
    defaultPngSha256: run.defaultGraphCapture?.pngSha256 ?? null,
    finalSvgSha256: run.finalGraphCapture?.svgSha256 ?? null,
    finalPngSha256: run.finalGraphCapture?.pngSha256 ?? null,
    interactionCount: run.events.length,
    graphEditCount: run.events.filter(({ type }) => type === "graph_configuration_changed").length,
    renderedGraphEditCount: run.events.filter(
      ({ effect }) => effect === "rendered_graph" || effect === "both",
    ).length,
    analysisEditCount: run.events.filter(
      ({ effect }) => effect === "analysis_only" || effect === "both",
    ).length,
  };
}

export function createDefaultBenchmarkGraphArtifacts(
  input: Readonly<{ svgText: string; pngBase64: string }>,
): readonly BenchmarkArtifact[] {
  return [
    { name: "default_graph.svg", content: input.svgText, mediaType: "image/svg+xml" },
    {
      name: "default_graph.png",
      content: input.pngBase64,
      encoding: "base64",
      mediaType: "image/png",
    },
  ];
}

export function createFinalBenchmarkArtifacts(
  input: Readonly<{
    runArtifact: unknown;
    svgText: string;
    pngBase64: string;
    statisticsArtifact: unknown;
    methodsText: string;
    graphState: unknown;
    interactionLog: BenchmarkRunState["events"];
  }>,
): readonly BenchmarkArtifact[] {
  return [
    { name: "run.json", content: JSON.stringify(input.runArtifact, null, 2) },
    { name: "final_graph.svg", content: input.svgText, mediaType: "image/svg+xml" },
    {
      name: "final_graph.png",
      content: input.pngBase64,
      encoding: "base64",
      mediaType: "image/png",
    },
    { name: "statistics.json", content: JSON.stringify(input.statisticsArtifact, null, 2) },
    { name: "methods.txt", content: input.methodsText },
    { name: "graph_state.json", content: JSON.stringify(input.graphState, null, 2) },
    { name: "interaction_log.json", content: JSON.stringify(input.interactionLog, null, 2) },
  ];
}
