import { useLayoutEffect, type RefObject } from "react";
import {
  beginDefaultGraphCapture,
  blobToBase64,
  completeDefaultGraphCapture,
  sha256Hex,
  writeBenchmarkArtifacts,
  type BenchmarkRunState,
} from "../../app/benchmarkEvaluation";
import { recordDiagnosticError } from "../../app/diagnostics";
import { evaluationMode, evaluationModeIsConfigured } from "../../app/evaluationMode";
import { serializeGraphSvg, svgToPngBlob } from "../../app/graphExport";
import { createDefaultBenchmarkGraphArtifacts } from "./experimentGraphBenchmarkArtifacts";
import { createBenchmarkGraphCapturePayload } from "./experimentGraphBenchmarkCapture";

export function useDefaultBenchmarkGraphCapture(input: Readonly<{
  svgRef: RefObject<SVGSVGElement | null>;
  identity: BenchmarkRunState["identity"];
  defaultGraphCapture: BenchmarkRunState["defaultGraphCapture"];
  eventCount: number;
  hasData: boolean;
  workspaceMode: "graph" | "statistics" | "combined";
  analysisState: string;
  setStatus: (status: string) => void;
}>): void {
  useLayoutEffect(() => {
    if (
      !import.meta.env.DEV ||
      !evaluationModeIsConfigured(evaluationMode) ||
      !input.identity ||
      input.defaultGraphCapture ||
      !input.hasData ||
      input.workspaceMode === "statistics"
    )
      return;
    const svg = input.svgRef.current;
    if (!svg) return;
    const svgText = serializeGraphSvg(svg);
    const viewBox = svg.viewBox.baseVal;
    const capturedAt = new Date().toISOString();
    if (!beginDefaultGraphCapture(capturedAt)) return;
    void (async () => {
      try {
        const capture = await createBenchmarkGraphCapturePayload(
          {
            svgText,
            width: viewBox.width || svg.width.baseVal.value || 900,
            height: viewBox.height || svg.height.baseVal.value || 520,
            analysisState: input.analysisState,
          },
          { renderPng: svgToPngBlob, sha256: sha256Hex, encodeBase64: blobToBase64 },
        );
        await writeBenchmarkArtifacts(
          createDefaultBenchmarkGraphArtifacts({
            svgText,
            pngBase64: capture.pngBase64,
          }),
        );
        completeDefaultGraphCapture({
          graphStateFingerprint: capture.svgSha256,
          analysisStateFingerprint: capture.analysisStateFingerprint,
          svgSha256: capture.svgSha256,
          pngSha256: capture.pngSha256,
        });
        input.setStatus("Benchmarkの既定グラフを保存しました。");
      } catch (error) {
        recordDiagnosticError("GRAPH_EXPORT_FAILED", error);
        input.setStatus("既定グラフの評価artifactを保存できませんでした。");
      }
    })();
  }, [
    input.analysisState,
    input.defaultGraphCapture,
    input.eventCount,
    input.hasData,
    input.identity,
    input.setStatus,
    input.svgRef,
    input.workspaceMode,
  ]);
}
