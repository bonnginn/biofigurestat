import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDefaultBenchmarkGraphCapture } from "./useDefaultBenchmarkGraphCapture";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(() => true),
  complete: vi.fn(),
  write: vi.fn(async () => undefined),
  diagnostic: vi.fn(),
  capture: vi.fn(async () => ({
    png: new Blob(["png"]),
    pngBase64: "cG5n",
    svgSha256: "svg.hash",
    pngSha256: "png.hash",
    analysisStateFingerprint: "analysis.hash",
  })),
}));

vi.mock("../../app/benchmarkEvaluation", () => ({
  beginDefaultGraphCapture: mocks.begin,
  blobToBase64: vi.fn(),
  completeDefaultGraphCapture: mocks.complete,
  sha256Hex: vi.fn(),
  writeBenchmarkArtifacts: mocks.write,
}));
vi.mock("../../app/diagnostics", () => ({
  recordDiagnosticError: mocks.diagnostic,
}));
vi.mock("../../app/evaluationMode", () => ({
  evaluationMode: { enabled: true },
  evaluationModeIsConfigured: () => true,
}));
vi.mock("../../app/graphExport", () => ({
  serializeGraphSvg: () => "<svg />",
  svgToPngBlob: vi.fn(),
}));
vi.mock("./experimentGraphBenchmarkCapture", () => ({
  createBenchmarkGraphCapturePayload: mocks.capture,
}));

const identity = {
  benchmarkVersion: "1.0.0",
  caseId: "D01",
  track: "track_A" as const,
  runId: "run.1",
};

function svgReference() {
  return {
    current: {
      viewBox: { baseVal: { width: 820, height: 500 } },
      width: { baseVal: { value: 820 } },
      height: { baseVal: { value: 500 } },
    } as unknown as SVGSVGElement,
  };
}

describe("default benchmark Graph capture", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
  });

  it("captures and completes once all eligibility facts are present", async () => {
    const setStatus = vi.fn();
    renderHook(() =>
      useDefaultBenchmarkGraphCapture({
        svgRef: svgReference(),
        identity,
        defaultGraphCapture: null,
        eventCount: 1,
        hasData: true,
        workspaceMode: "graph",
        analysisState: "analysis.state",
        setStatus,
      }),
    );

    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({ width: 820, height: 500, analysisState: "analysis.state" }),
      expect.any(Object),
    );
    expect(mocks.complete).toHaveBeenCalledWith({
      graphStateFingerprint: "svg.hash",
      analysisStateFingerprint: "analysis.hash",
      svgSha256: "svg.hash",
      pngSha256: "png.hash",
    });
    expect(setStatus).toHaveBeenCalledWith("Benchmarkの既定グラフを保存しました。");
  });

  it("does not begin capture from the Statistics workspace", () => {
    renderHook(() =>
      useDefaultBenchmarkGraphCapture({
        svgRef: svgReference(),
        identity,
        defaultGraphCapture: null,
        eventCount: 1,
        hasData: true,
        workspaceMode: "statistics",
        analysisState: "analysis.state",
        setStatus: vi.fn(),
      }),
    );
    expect(mocks.begin).not.toHaveBeenCalled();
  });
});
