import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/evaluationMode", () => ({
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
  completeDefaultGraphCapture,
  currentBenchmarkRun,
  recordFinalGraphCapture,
  resetBenchmarkRun,
  setBenchmarkOutcome,
} from "../app/benchmarkEvaluation";
import { BenchmarkRunBar, metadataOutcomeCanBeRecorded } from "./BenchmarkRunBar";

const blindCase = {
  schemaVersion: "1.0.0",
  benchmarkVersion: "LSA50_v1_1",
  caseId: "JCB010",
  runId: "fresh_B_JCB010_001",
  role: "track_B_experimenter",
  researcherPacket: {
    case_id: "JCB010",
    blind_experiment_summary: "Synthetic two-condition microscopy measurement.",
    measurement_context: "continuous microscopy measurement",
    conditions: "Control | Treatment",
    timepoints: "(none)",
    readouts: "value",
    experimental_unit_description: "independent biological units",
    independent_session_count: 3,
    repeated_identity_note: "No repeated identity.",
    nested_observation_note: "No additional nesting.",
  },
  syntheticData: Array.from({ length: 16 }, (_, index) => ({
    case_id: "JCB010",
    experiment_id: `Exp${(index % 3) + 1}`,
    unit_id: `U${index + 1}`,
    parent_unit_id: null,
    condition: index < 8 ? "Control" : "Treatment",
    time: null,
    readout: "value",
    value: index + 1,
    numerator: null,
    denominator: null,
    x_value: null,
    event: null,
    synthetic: true,
    seed: 1,
  })),
};

describe("BenchmarkRunBar case initialization", () => {
  beforeEach(() => resetBenchmarkRun());
  afterEach(() => vi.unstubAllGlobals());

  it("delivers the blind packet immediately after run arming on Home", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/blind-batch/current")) {
        return { ok: false, status: 404 };
      }
      if (!init?.method) {
        return { ok: true, json: async () => blindCase };
      }
      return {
        ok: true,
        json: async () => ({ written: ["run.json", "interaction_log.json"], present: [] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<BenchmarkRunBar />);

    fireEvent.change(screen.getByLabelText("Case"), { target: { value: "JCB010" } });
    fireEvent.change(screen.getByLabelText("Track"), { target: { value: "track_B" } });
    fireEvent.change(screen.getByLabelText("Run"), {
      target: { value: "fresh_B_JCB010_001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Runを開始" }));

    expect(
      await screen.findByRole("region", { name: "Blinded researcher packet" }),
    ).toHaveTextContent(/Blind case ready: JCB010 \/ 16\s*synthetic rows/);
    expect(screen.getByText("Synthetic two-condition microscopy measurement.")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/evaluation/literature/case?caseId=JCB010&track=track_B&runId=fresh_B_JCB010_001",
    );

    fireEvent.change(screen.getByLabelText("Benchmark outcome"), {
      target: { value: "infrastructure_failure" },
    });
    expect(screen.getByLabelText("Scientific support")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "終了状態だけ記録" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const artifactRequest = fetchMock.mock.calls[2];
    const body = JSON.parse(String(artifactRequest?.[1]?.body));
    expect(JSON.parse(body.artifacts[0].content)).toMatchObject({
      outcome: "infrastructure_failure",
      supportStatus: null,
      artifactCompleteness: "metadata_only",
    });
  });

  it("arms one active batch case and resets run state before the next case", async () => {
    const batch = (position: number, caseId: string, runId: string) => ({
      batchId: "batch_fixture",
      benchmarkVersion: "LSA50_v1_1",
      status: "running",
      position,
      total: 6,
      completed: position - 1,
      current: {
        position,
        caseId,
        track: "track_B",
        runId,
        packageSha256: "a".repeat(64),
        status: "active",
      },
    });
    const first = batch(1, "JCB010", "batch_fixture_01_JCB010");
    const second = batch(2, "JCB004", "batch_fixture_02_JCB004");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/blind-batch/current")) return { ok: true, status: 200, json: async () => first };
      if (url.endsWith("/blind-batch/next")) return { ok: true, status: 200, json: async () => second };
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...blindCase, caseId: url.includes("JCB004") ? "JCB004" : "JCB010",
          runId: url.includes("JCB004") ? second.current.runId : first.current.runId }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const onNavigateHome = vi.fn();
    render(<BenchmarkRunBar onNavigateHome={onNavigateHome} />);

    await screen.findByText(/Blind benchmark batch: Case 1 \/ 6/);
    await waitFor(() => expect(currentBenchmarkRun().identity?.runId).toBe(first.current.runId));
    expect(beginDefaultGraphCapture("2026-08-23T00:00:00.000Z")).toBe(true);
    completeDefaultGraphCapture({
      graphStateFingerprint: "first-default",
      analysisStateFingerprint: "first-analysis",
      svgSha256: "first-default-svg",
      pngSha256: "first-default-png",
    });
    recordFinalGraphCapture({
      capturedAt: "2026-08-23T00:01:00.000Z",
      graphStateFingerprint: "first-final",
      analysisStateFingerprint: "first-final-analysis",
      svgSha256: "first-final-svg",
      pngSha256: "first-final-png",
    });
    setBenchmarkOutcome("completed");
    fireEvent.click(await screen.findByRole("button", { name: "次のケース" }));

    await waitFor(() => expect(currentBenchmarkRun().identity?.runId).toBe(second.current.runId));
    expect(onNavigateHome).toHaveBeenCalledOnce();
    expect(currentBenchmarkRun()).toMatchObject({
      defaultGraphCaptured: false,
      defaultGraphCapture: null,
      finalGraphCapture: null,
      supportStatus: null,
      outcome: "in_progress",
    });
  });

  it("requires scientific support only for explicit unsupported metadata outcomes", () => {
    expect(metadataOutcomeCanBeRecorded("infrastructure_failure", null)).toBe(true);
    expect(metadataOutcomeCanBeRecorded("aborted_not_started", null)).toBe(true);
    expect(metadataOutcomeCanBeRecorded("explicit_unsupported", null)).toBe(false);
    expect(metadataOutcomeCanBeRecorded("explicit_unsupported", "impossible")).toBe(true);
    expect(metadataOutcomeCanBeRecorded("completed", "direct")).toBe(false);
  });
});
