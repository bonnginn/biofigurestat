import { describe, expect, it } from "vitest";

import {
  AnalysisEngineRequestSchema,
  OneSampleAnalysisEngineRequestSchema,
  SurvivalAnalysisEngineRequestSchema,
} from "./contracts";

const options = { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null };

describe("D11 survival and D12 one-sample contracts", () => {
  it("accepts explicit event/censor observations and rejects negative follow-up", () => {
    const request = {
      protocolVersion: "0.8.0",
      requestId: "request.survival",
      projectId: "project.survival",
      analysisId: "analysis.survival",
      templateId: "D11",
      templateVersion: "0.1.0",
      method: "log_rank",
      conditionIds: ["condition.control", "condition.treatment"],
      observations: [
        {
          observationId: "obs.1",
          conditionId: "condition.control",
          experimentalUnitId: "mouse.1",
          followUpTime: 4,
          eventObserved: true,
        },
        {
          observationId: "obs.2",
          conditionId: "condition.treatment",
          experimentalUnitId: "mouse.2",
          followUpTime: 8,
          eventObserved: false,
        },
      ],
      options,
    };
    expect(SurvivalAnalysisEngineRequestSchema.parse(request)).toEqual(request);
    expect(AnalysisEngineRequestSchema.safeParse(request).success).toBe(true);
    expect(
      SurvivalAnalysisEngineRequestSchema.safeParse({
        ...request,
        observations: [{ ...request.observations[0], followUpTime: -1 }, request.observations[1]],
      }).success,
    ).toBe(false);
  });

  it("requires an explicit finite null value for a one-sample test", () => {
    const request = {
      protocolVersion: "0.9.0",
      requestId: "request.one-sample",
      projectId: "project.one-sample",
      analysisId: "analysis.one-sample",
      templateId: "D12",
      templateVersion: "0.1.0",
      method: "one_sample_t",
      conditionId: "condition.cohort",
      nullValue: 100,
      observations: [1, 2, 3].map((value, index) => ({
        observationId: `obs.${index + 1}`,
        conditionId: "condition.cohort",
        experimentalUnitId: `patient.${index + 1}`,
        value,
      })),
      options,
    };
    expect(OneSampleAnalysisEngineRequestSchema.parse(request).nullValue).toBe(100);
    expect(
      AnalysisEngineRequestSchema.safeParse({ ...request, nullValue: Number.NaN }).success,
    ).toBe(false);
  });
});
