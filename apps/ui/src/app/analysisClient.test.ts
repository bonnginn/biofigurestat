import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";

import { createEvaluationAnalysisRunner, localEngineFailureMessage } from "./analysisClient";

const request: AnalysisEngineRequest = {
  protocolVersion: "0.1.0",
  requestId: "request.evaluation.test",
  projectId: "project.evaluation.test",
  analysisId: "analysis.evaluation.test",
  templateId: "D01",
  templateVersion: "0.1.0",
  method: "welch_t",
  contrastConditionIds: ["condition.a", "condition.b"],
  observations: [
    { observationId: "o.a1", conditionId: "condition.a", value: 1, experimentalUnitId: "u.a1" },
    { observationId: "o.a2", conditionId: "condition.a", value: 2, experimentalUnitId: "u.a2" },
    { observationId: "o.b1", conditionId: "condition.b", value: 3, experimentalUnitId: "u.b1" },
    { observationId: "o.b2", conditionId: "condition.b", value: 4, experimentalUnitId: "u.b2" },
  ],
  options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
};

const result: AnalysisEngineResult = {
  protocolVersion: "0.1.0",
  requestId: request.requestId,
  status: "ok",
  engine: { name: "lsaa-python", version: "0.6.0", packages: { scipy: "1.18.0" } },
  estimates: [],
  tests: [],
  diagnostics: [],
  warnings: [],
  completedAt: "2026-08-22T00:00:00+09:00",
};

describe("evaluation analysis client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the explicit synthetic-only bridge envelope and parses the canonical result", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ result, evaluation: { syntheticOnly: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const runner = createEvaluationAnalysisRunner({
      enabled: true,
      apiBasePath: "/api/evaluation",
      sourceRevision: "fixture-revision",
    });
    await expect(runner(request)).resolves.toEqual(result);
    expect(fetch).toHaveBeenCalledWith(
      "/api/evaluation/analysis",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      mode: "evaluation",
      syntheticOnly: true,
      request: { requestId: request.requestId },
    });
  });

  it("refuses a partially configured bridge", async () => {
    const runner = createEvaluationAnalysisRunner({
      enabled: true,
      apiBasePath: null,
      sourceRevision: null,
    });
    await expect(runner(request)).rejects.toThrow("明示的に設定");
  });
});

describe("local engine failure guidance", () => {
  it("distinguishes insufficient nonlinear-fit data from a missing engine", () => {
    expect(
      localEngineFailureMessage(
        "The local analysis engine failed: D17 K5 requires at least 3 distinct X values",
      ),
    ).toContain("異なるX値が不足");
  });

  it("explains non-identifiable nonlinear parameters", () => {
    expect(localEngineFailureMessage("D17 K5 fit is non-identifiable")).toContain(
      "一意に推定できません",
    );
  });
});
