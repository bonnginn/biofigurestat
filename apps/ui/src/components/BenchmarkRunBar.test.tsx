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
import {
  BenchmarkRunBar,
  createFreshUnsupportedEvidence,
  metadataOutcomeCanBeRecorded,
} from "./BenchmarkRunBar";

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
    fireEvent.change(screen.getByLabelText("Benchmark outcome"), {
      target: { value: "explicit_unsupported" },
    });
    fireEvent.change(screen.getByLabelText("Scientific support"), {
      target: { value: "impossible" },
    });
    expect(screen.getByLabelText("Scientific reason")).toHaveValue("");
    expect(screen.getByLabelText("Experimental unit")).toHaveValue("");
    expect(screen.getByLabelText("Biological n (if determinable)")).toHaveValue(null);
    expect(screen.getByLabelText("Attempted routes")).toHaveValue("");
    expect(
      screen.getByLabelText("Why continuation would require scientific compromise"),
    ).toHaveValue("");
  });

  it("persists and rehydrates an explicit unsupported terminal run", async () => {
    const terminalEvidence = {
      supportStatus: "impossible",
      scientificReason: "A one-group design cannot be represented.",
      experimentalUnit: "independent patients",
      biologicalN: 30,
      attemptedRoutes: ["ordinary design", "long import", "wide import"],
      scientificCompromiseReason: "A fictitious second condition would corrupt the design.",
      completedAt: "2026-08-23T00:01:00Z",
    };
    const activeBatch = {
      batchId: "batch_fixture",
      benchmarkVersion: "LSA50_v1_1",
      status: "running",
      position: 2,
      total: 6,
      completed: 1,
      current: {
        position: 2,
        caseId: "NC033",
        track: "track_B",
        runId: "batch_fixture_02_NC033_retry_01",
        packageSha256: "b".repeat(64),
        status: "active",
      },
    };
    const persistedBatch = {
      ...activeBatch,
      status: "ready_to_advance",
      completed: 2,
      current: { ...activeBatch.current, status: "explicit_unsupported", terminalEvidence },
    };
    const nextBatch = {
      ...activeBatch,
      status: "running",
      position: 3,
      completed: 2,
      current: {
        ...activeBatch.current,
        position: 3,
        caseId: "JCB023",
        runId: "batch_fixture_03_JCB023_retry_01",
        packageSha256: "c".repeat(64),
        status: "active",
      },
    };
    let persisted = false;
    let advanced = false;
    const ncCase = {
      ...blindCase,
      caseId: "NC033",
      runId: activeBatch.current.runId,
      researcherPacket: { ...blindCase.researcherPacket, case_id: "NC033" },
      syntheticData: blindCase.syntheticData.map((row) => ({ ...row, case_id: "NC033" })),
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/blind-batch/current")) {
        return {
          ok: true,
          status: 200,
          json: async () => (advanced ? nextBatch : persisted ? persistedBatch : activeBatch),
        };
      }
      if (url.endsWith("/blind-batch/next")) {
        advanced = true;
        return { ok: true, status: 200, json: async () => nextBatch };
      }
      if (url.endsWith("/literature/case?caseId=NC033&track=track_B&runId=batch_fixture_02_NC033_retry_01")) {
        return { ok: true, status: 200, json: async () => ncCase };
      }
      if (url.endsWith("/artifacts") && init?.method === "POST") {
        persisted = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            written: ["run.json", "interaction_log.json"],
            present: ["run.json", "interaction_log.json"],
            verified: true,
          }),
        };
      }
      if (url.includes("/literature/case?caseId=JCB023")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...ncCase,
            caseId: "JCB023",
            runId: nextBatch.current.runId,
            researcherPacket: { ...ncCase.researcherPacket, case_id: "JCB023" },
            syntheticData: ncCase.syntheticData.map((row) => ({ ...row, case_id: "JCB023" })),
          }),
        };
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const rendered = render(<BenchmarkRunBar />);
    await screen.findByText(/Blind case ready: NC033/);
    fireEvent.change(screen.getByLabelText("Benchmark outcome"), {
      target: { value: "explicit_unsupported" },
    });
    fireEvent.change(screen.getByLabelText("Scientific support"), {
      target: { value: "impossible" },
    });
    fireEvent.change(screen.getByLabelText("Scientific reason"), {
      target: { value: terminalEvidence.scientificReason },
    });
    fireEvent.change(screen.getByLabelText("Experimental unit"), {
      target: { value: terminalEvidence.experimentalUnit },
    });
    fireEvent.change(screen.getByLabelText("Biological n (if determinable)"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Attempted routes"), {
      target: { value: terminalEvidence.attemptedRoutes.join("\n") },
    });
    fireEvent.change(
      screen.getByLabelText("Why continuation would require scientific compromise"),
      { target: { value: terminalEvidence.scientificCompromiseReason } },
    );
    fireEvent.click(screen.getByRole("button", { name: "終了状態だけ記録" }));
    await screen.findByText("Explicit unsupportedを検証・永続化しました。");
    expect(screen.getByRole("button", { name: "次のケース" })).toBeEnabled();
    const artifactCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/artifacts"));
    const artifactBody = JSON.parse(String(artifactCall?.[1]?.body));
    expect(artifactBody.requiredArtifacts).toEqual(["run.json", "interaction_log.json"]);
    expect(artifactBody.artifacts.map(({ name }: { name: string }) => name)).toEqual([
      "run.json",
      "interaction_log.json",
    ]);
    expect(JSON.parse(artifactBody.artifacts[0].content)).toMatchObject({
      outcome: "explicit_unsupported",
      supportStatus: "impossible",
      biologicalN: 30,
      artifactCompleteness: "metadata_only_explicit_unsupported",
    });

    rendered.unmount();
    resetBenchmarkRun();
    render(<BenchmarkRunBar />);
    await waitFor(() => expect(currentBenchmarkRun().outcome).toBe("explicit_unsupported"));
    expect(currentBenchmarkRun().supportStatus).toBe("impossible");
    expect(screen.getByLabelText("Scientific reason")).toHaveValue(
      terminalEvidence.scientificReason,
    );
    expect(screen.getByRole("button", { name: "次のケース" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "次のケース" }));
    await waitFor(() => expect(currentBenchmarkRun().identity?.runId).toBe(nextBatch.current.runId));
    expect(screen.queryByText(terminalEvidence.scientificReason)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Benchmark outcome"), {
      target: { value: "explicit_unsupported" },
    });
    fireEvent.change(screen.getByLabelText("Scientific support"), {
      target: { value: "impossible" },
    });
    expect(screen.getByLabelText("Scientific reason")).toHaveValue("");
    expect(screen.getByLabelText("Experimental unit")).toHaveValue("");
    expect(screen.getByLabelText("Biological n (if determinable)")).toHaveValue(null);
    expect(screen.getByLabelText("Attempted routes")).toHaveValue("");
    expect(
      screen.getByLabelText("Why continuation would require scientific compromise"),
    ).toHaveValue("");
  });

  it("creates unsupported evidence as a fresh run-owned object", () => {
    const first = createFreshUnsupportedEvidence({
      caseId: "NC033",
      runId: "run_nc033",
      packageSha256: "a".repeat(64),
    });
    const populated = {
      ...first,
      scientificReason: "NC033 reason",
      experimentalUnit: "patient",
      biologicalN: "30",
      attemptedRoutes: "long import",
      scientificCompromiseReason: "NC033 compromise",
    };
    const second = createFreshUnsupportedEvidence({
      caseId: "JCB023",
      runId: "run_jcb023",
      packageSha256: "b".repeat(64),
    });
    expect(second).not.toBe(populated);
    expect(second).toEqual({
      owner: {
        caseId: "JCB023",
        runId: "run_jcb023",
        packageSha256: "b".repeat(64),
      },
      scientificReason: "",
      experimentalUnit: "",
      biologicalN: "",
      attemptedRoutes: "",
      scientificCompromiseReason: "",
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
