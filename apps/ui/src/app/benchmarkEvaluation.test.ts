import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./evaluationMode", () => ({
  evaluationMode: {
    enabled: true,
    apiBasePath: "/api/evaluation",
    sourceRevision: "fixture-revision",
  },
  evaluationModeIsConfigured: (config: { enabled: boolean; apiBasePath: string | null }) =>
    Boolean(config.enabled && config.apiBasePath?.startsWith("/")),
}));

import {
  beginDefaultGraphCapture,
  COMPLETE_BENCHMARK_ARTIFACT_NAMES,
  completeDefaultGraphCapture,
  currentBenchmarkRun,
  recordFinalGraphCapture,
  recordBenchmarkEvent,
  resetBenchmarkRun,
  setBenchmarkSupportStatus,
  startBenchmarkRun,
  writeBenchmarkArtifacts,
} from "./benchmarkEvaluation";

describe("benchmark evaluation run store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    startBenchmarkRun({
      benchmarkVersion: "LSA50_v1_1",
      caseId: "pilot_independent_2group",
      track: "track_A",
      runId: "run_001",
    });
  });

  it("records ordered run identity, support status, and meaningful events", () => {
    setBenchmarkSupportStatus("direct");
    recordBenchmarkEvent("workspace_subroute_opened", { subroute: "statistics" });
    expect(beginDefaultGraphCapture("2026-08-23T00:00:00.000Z")).toBe(true);
    expect(beginDefaultGraphCapture("2026-08-23T00:00:01.000Z")).toBe(false);
    completeDefaultGraphCapture({
      graphStateFingerprint: "a".repeat(64),
      svgSha256: "a".repeat(64),
      pngSha256: "b".repeat(64),
    });
    recordFinalGraphCapture({
      capturedAt: "2026-08-23T00:01:00.000Z",
      graphStateFingerprint: "c".repeat(64),
      svgSha256: "c".repeat(64),
      pngSha256: "d".repeat(64),
    });

    const run = currentBenchmarkRun();
    expect(run.identity).toEqual({
      benchmarkVersion: "LSA50_v1_1",
      caseId: "pilot_independent_2group",
      track: "track_A",
      runId: "run_001",
    });
    expect(run.supportStatus).toBe("direct");
    expect(run.defaultGraphCaptured).toBe(true);
    expect(run.events.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(run.events.map(({ type }) => type)).toEqual([
      "benchmark_run_started",
      "support_status_selected",
      "workspace_subroute_opened",
      "default_graph_capture_started",
      "default_graph_captured",
      "final_graph_captured",
    ]);
    expect(run.defaultGraphCapture).toMatchObject({
      status: "complete",
      eventIndex: 4,
      graphStateFingerprint: "a".repeat(64),
    });
    expect(run.finalGraphCapture).toMatchObject({
      status: "complete",
      eventIndex: 6,
      graphStateFingerprint: "c".repeat(64),
    });
    expect(run.events[0]?.detail.sourceRevision).toBe("fixture-revision");
  });

  it("clears the active identity instead of rearming capture into the same run", () => {
    resetBenchmarkRun();
    expect(currentBenchmarkRun()).toMatchObject({
      identity: null,
      defaultGraphCaptured: false,
      defaultGraphCapture: null,
      finalGraphCapture: null,
    });
  });

  it("sends synthetic-only artifacts to the token-authenticated evaluation bridge", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        written: ["run.json", "methods.txt"],
        directory: "pilot_independent_2group/track_A/run_001",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await writeBenchmarkArtifacts([
      { name: "run.json", content: "{}" },
      { name: "methods.txt", content: "fixture" },
    ]);

    expect(response.written).toEqual(["run.json", "methods.txt"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/evaluation/artifacts");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      mode: "evaluation",
      syntheticOnly: true,
      benchmark: {
        benchmarkVersion: "LSA50_v1_1",
        caseId: "pilot_independent_2group",
        track: "track_A",
        runId: "run_001",
      },
      artifacts: [
        { name: "run.json", content: "{}" },
        { name: "methods.txt", content: "fixture" },
      ],
    });
  });

  it("requires the bridge to confirm the complete nine-artifact run manifest", async () => {
    const present = [...COMPLETE_BENCHMARK_ARTIFACT_NAMES];
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        written: ["run.json"],
        present,
        directory: "pilot_independent_2group/track_A/run_001",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      writeBenchmarkArtifacts([{ name: "run.json", content: "{}" }], {
        requiredArtifacts: COMPLETE_BENCHMARK_ARTIFACT_NAMES,
      }),
    ).resolves.toMatchObject({ present });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body)).requiredArtifacts).toEqual(present);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        written: ["run.json"],
        present: present.filter((name) => name !== "methods.txt"),
        directory: "pilot_independent_2group/track_A/run_001",
      }),
    });
    await expect(
      writeBenchmarkArtifacts([{ name: "run.json", content: "{}" }], {
        requiredArtifacts: COMPLETE_BENCHMARK_ARTIFACT_NAMES,
      }),
    ).rejects.toThrow("methods.txt");
  });
});
