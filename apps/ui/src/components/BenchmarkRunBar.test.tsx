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

import { resetBenchmarkRun } from "../app/benchmarkEvaluation";
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const artifactRequest = fetchMock.mock.calls[1];
    const body = JSON.parse(String(artifactRequest?.[1]?.body));
    expect(JSON.parse(body.artifacts[0].content)).toMatchObject({
      outcome: "infrastructure_failure",
      supportStatus: null,
      artifactCompleteness: "metadata_only",
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
