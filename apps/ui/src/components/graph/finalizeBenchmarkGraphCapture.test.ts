import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExperimentSetDraft } from "../../app/experimentDraft";
import { finalizeBenchmarkGraphCapture } from "./finalizeBenchmarkGraphCapture";

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  finalCapture: vi.fn(),
  event: vi.fn(),
  outcome: vi.fn(),
  write: vi.fn(async () => undefined),
  diagnostic: vi.fn(),
  capture: vi.fn(async () => ({
    png: new Blob(["png"]), pngBase64: "cG5n", svgSha256: "svg.hash",
    pngSha256: "png.hash", analysisStateFingerprint: "analysis.hash",
  })),
}));
const run = {
  identity: { benchmarkVersion: "1.0.0", caseId: "D01", track: "track_A" as const, runId: "run.1" },
  startedAt: "2026-08-31T00:00:00.000Z", outcome: "in_progress" as const,
  supportStatus: "direct" as const, defaultGraphCaptured: true,
  defaultGraphCapture: null, finalGraphCapture: null, events: [],
};

vi.mock("../../app/benchmarkEvaluation", () => ({
  blobToBase64: vi.fn(),
  COMPLETE_BENCHMARK_ARTIFACT_NAMES: ["run.json", "final_graph.png", "final_graph.svg", "statistics.json", "methods.txt", "graph_state.json", "interaction_log.json"],
  currentBenchmarkRun: mocks.current,
  recordBenchmarkEvent: mocks.event,
  recordFinalGraphCapture: mocks.finalCapture,
  setBenchmarkOutcome: mocks.outcome,
  sha256Hex: vi.fn(),
  writeBenchmarkArtifacts: mocks.write,
}));
vi.mock("../../app/diagnostics", () => ({ recordDiagnosticError: mocks.diagnostic }));
vi.mock("../../app/evaluationMode", () => ({ evaluationMode: { sourceRevision: "revision.test" } }));
vi.mock("../../app/graphExport", () => ({ serializeGraphSvg: () => "<svg />", svgToPngBlob: vi.fn() }));
vi.mock("./experimentGraphBenchmarkCapture", () => ({ createBenchmarkGraphCapturePayload: mocks.capture }));

const svg = { viewBox: { baseVal: { width: 820, height: 500 } }, width: { baseVal: { value: 820 } }, height: { baseVal: { value: 500 } } } as unknown as SVGSVGElement;

function input(setStatus: (status: string) => void) {
  const draft = createExperimentSetDraft("cell_culture", "nested_continuous");
  return {
    svg, draft, analysis: null, analysisAssessment: { nByCondition: [] },
    descriptiveBenchmarkRun: true, methodsText: "", descriptiveMethodsText: "Descriptive methods",
    benchmarkAnalysisState: "analysis.state", graphType: "dot" as const,
    selectedReadoutId: draft.readouts[0]!.id,
    selectedConditionIds: draft.conditions.map(({ id }) => id), analysisConditionIds: [],
    graphState: { graphType: "dot" }, setStatus,
  };
}

describe("final benchmark Graph capture", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
    mocks.current.mockReturnValue(run);
  });

  it("stops before artifact work when completion facts are missing", async () => {
    const setStatus = vi.fn();
    await finalizeBenchmarkGraphCapture({ ...input(setStatus), svg: null });
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith("完了前にBenchmark runを開始し、対応状況を選び、統計解析を実行してください。");
  });

  it("records completion and writes the descriptive artifact set", async () => {
    const setStatus = vi.fn();
    await finalizeBenchmarkGraphCapture(input(setStatus));
    expect(mocks.finalCapture).toHaveBeenCalledWith(expect.objectContaining({ svgSha256: "svg.hash", pngSha256: "png.hash" }));
    expect(mocks.outcome).toHaveBeenCalledWith("completed");
    expect(mocks.event).toHaveBeenCalledWith("benchmark_run_finalized", { selectedGraph: "dot", selectedStatistics: "none_descriptive" });
    expect(mocks.write).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "final_graph.png", encoding: "base64" }),
        expect.objectContaining({ name: "methods.txt", content: "Descriptive methods" }),
      ]),
      expect.objectContaining({ requiredArtifacts: expect.arrayContaining(["run.json"]) }),
    );
    expect(setStatus).toHaveBeenLastCalledWith("Benchmark runのartifactを保存しました。");
  });
});
