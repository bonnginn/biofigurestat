import type { ExperimentSetDraft } from "../../app/experimentDraft";
import type { DraftAnalysisAssessment } from "../../app/experimentDraftAnalysis";
import type { WorkspaceGraphAnalysis, WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import {
  blobToBase64,
  COMPLETE_BENCHMARK_ARTIFACT_NAMES,
  currentBenchmarkRun,
  recordBenchmarkEvent,
  recordFinalGraphCapture,
  setBenchmarkOutcome,
  sha256Hex,
  writeBenchmarkArtifacts,
} from "../../app/benchmarkEvaluation";
import { recordDiagnosticError } from "../../app/diagnostics";
import { evaluationMode } from "../../app/evaluationMode";
import { serializeGraphSvg, svgToPngBlob } from "../../app/graphExport";
import {
  createBenchmarkRunArtifact,
  createBenchmarkStatisticsArtifact,
  createFinalBenchmarkArtifacts,
} from "./experimentGraphBenchmarkArtifacts";
import { createBenchmarkGraphCapturePayload } from "./experimentGraphBenchmarkCapture";

export async function finalizeBenchmarkGraphCapture(input: Readonly<{
  svg: SVGSVGElement | null;
  draft: ExperimentSetDraft;
  analysis: WorkspaceGraphAnalysis | null;
  analysisAssessment: Pick<DraftAnalysisAssessment, "nByCondition">;
  descriptiveBenchmarkRun: boolean;
  methodsText: string | null;
  descriptiveMethodsText: string;
  benchmarkAnalysisState: string;
  graphType: WorkspaceGraphState["graphType"];
  selectedReadoutId: string;
  selectedConditionIds: readonly string[];
  analysisConditionIds: readonly string[];
  graphState: unknown;
  setStatus: (status: string) => void;
}>): Promise<void> {
  const run = currentBenchmarkRun();
  if (!input.svg || !run.identity || !run.supportStatus ||
      (!input.analysis && !input.descriptiveBenchmarkRun) ||
      (input.analysis && !input.methodsText)) {
    input.setStatus("完了前にBenchmark runを開始し、対応状況を選び、統計解析を実行してください。");
    return;
  }
  input.setStatus("評価artifactを保存中…");
  try {
    const svgText = serializeGraphSvg(input.svg);
    const viewBox = input.svg.viewBox.baseVal;
    const capture = await createBenchmarkGraphCapturePayload(
      {
        svgText,
        width: viewBox.width || input.svg.width.baseVal.value || 900,
        height: viewBox.height || input.svg.height.baseVal.value || 520,
        analysisState: input.benchmarkAnalysisState,
      },
      { renderPng: svgToPngBlob, sha256: sha256Hex, encodeBase64: blobToBase64 },
    );
    const capturedAt = new Date().toISOString();
    recordFinalGraphCapture({
      capturedAt,
      graphStateFingerprint: capture.svgSha256,
      analysisStateFingerprint: capture.analysisStateFingerprint,
      svgSha256: capture.svgSha256,
      pngSha256: capture.pngSha256,
    });
    setBenchmarkOutcome("completed");
    recordBenchmarkEvent("benchmark_run_finalized", {
      selectedGraph: input.graphType,
      selectedStatistics: input.analysis?.request.method ?? "none_descriptive",
    });
    const finalRun = currentBenchmarkRun();
    const statisticsArtifact = createBenchmarkStatisticsArtifact({
      draft: input.draft,
      analysis: input.analysis,
      analysisAssessment: input.analysisAssessment,
      selectedReadoutId: input.selectedReadoutId,
      selectedConditionIds: input.selectedConditionIds,
      analysisConditionIds: input.analysisConditionIds,
    });
    await writeBenchmarkArtifacts(
      createFinalBenchmarkArtifacts({
        runArtifact: createBenchmarkRunArtifact({
          run: finalRun,
          analysis: input.analysis,
          sourceRevision: evaluationMode.sourceRevision,
          completedAt: new Date().toISOString(),
        }),
        svgText,
        pngBase64: capture.pngBase64,
        statisticsArtifact,
        methodsText: input.analysis ? input.methodsText! : input.descriptiveMethodsText,
        graphState: input.graphState,
        interactionLog: finalRun.events,
      }),
      { requiredArtifacts: COMPLETE_BENCHMARK_ARTIFACT_NAMES },
    );
    input.setStatus("Benchmark runのartifactを保存しました。");
  } catch (error) {
    recordDiagnosticError("GRAPH_EXPORT_FAILED", error);
    setBenchmarkOutcome("infrastructure_failure");
    input.setStatus("Benchmark runのartifactを保存できませんでした。");
  }
}
