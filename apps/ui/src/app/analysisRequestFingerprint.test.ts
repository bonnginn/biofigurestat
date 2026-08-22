import { describe, expect, it } from "vitest";
import { AnalysisEngineRequestSchema, type AnalysisEngineRequest } from "@lsaa/analysis-contracts";

import {
  analysisRequestStructuralFingerprint,
  canSafelyAutomaticallyRerun,
} from "./analysisRequestFingerprint";

type TwoConditionRequest = Extract<AnalysisEngineRequest, { protocolVersion: "0.1.0" }>;

function request(): TwoConditionRequest {
  return AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.1.0",
    requestId: "request.1",
    projectId: "project.1",
    analysisId: "analysis.1",
    templateId: "D01",
    templateVersion: "0.1.0",
    method: "welch_t",
    contrastConditionIds: ["condition.control", "condition.treatment"],
    observations: [
      {
        observationId: "observation.1",
        conditionId: "condition.control",
        experimentalUnitId: "unit.1",
        value: 1,
      },
      {
        observationId: "observation.2",
        conditionId: "condition.control",
        experimentalUnitId: "unit.2",
        value: 2,
      },
      {
        observationId: "observation.3",
        conditionId: "condition.treatment",
        experimentalUnitId: "unit.3",
        value: 3,
      },
      {
        observationId: "observation.4",
        conditionId: "condition.treatment",
        experimentalUnitId: "unit.4",
        value: 4,
      },
    ],
    options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
  }) as TwoConditionRequest;
}

describe("analysis request structural fingerprint", () => {
  it("値とrequest IDの変更だけなら同じ解析を安全に再実行できる", () => {
    const previous = request();
    const next = {
      ...previous,
      requestId: "request.2",
      observations: previous.observations.map((observation, index) => ({
        ...observation,
        value: observation.value + index + 0.5,
      })),
    };
    expect(canSafelyAutomaticallyRerun(previous, next)).toBe(true);
    expect(analysisRequestStructuralFingerprint(previous)).toBe(
      analysisRequestStructuralFingerprint(next),
    );
  });

  it("実験単位、比較、method、sidednessの変更は同一解析とみなさない", () => {
    const previous = request();
    expect(
      canSafelyAutomaticallyRerun(previous, {
        ...previous,
        observations: previous.observations.slice(1),
      }),
    ).toBe(false);
    expect(
      canSafelyAutomaticallyRerun(previous, {
        ...previous,
        contrastConditionIds: ["condition.treatment", "condition.control"],
      }),
    ).toBe(false);
    expect(canSafelyAutomaticallyRerun(previous, { ...previous, method: "mann_whitney" })).toBe(
      false,
    );
    expect(
      canSafelyAutomaticallyRerun(previous, {
        ...previous,
        options: { ...previous.options, alternative: "greater" },
      }),
    ).toBe(false);
  });
});
