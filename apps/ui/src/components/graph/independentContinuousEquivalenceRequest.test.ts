import { describe, expect, it } from "vitest";
import type { AnalysisEngineRequest, EquivalenceAnalysisPlan } from "@lsaa/analysis-contracts";

import { createIndependentContinuousEquivalenceRequest } from "./independentContinuousEquivalenceRequest";

const comparisonId = "equivalence:control:treatment";
const plan: EquivalenceAnalysisPlan = {
  schemaVersion: "0.1.0",
  margin: {
    scale: "raw_difference",
    lowerBound: -0.5,
    upperBound: 0.5,
    unit: "AU",
    declaredAsPrespecified: true,
  },
  alpha: 0.05,
  claimMode: "single_primary_comparison",
  primaryComparisonId: comparisonId,
};
const baseRequest: AnalysisEngineRequest = {
  protocolVersion: "0.1.0",
  requestId: "request-1",
  projectId: "project-1",
  analysisId: "analysis-1",
  templateId: "D01",
  templateVersion: "0.1.0",
  method: "welch_t",
  contrastConditionIds: ["control", "treatment"],
  observations: [
    { observationId: "o1", conditionId: "control", value: 1, experimentalUnitId: "u1" },
    { observationId: "o2", conditionId: "control", value: 2, experimentalUnitId: "u2" },
    { observationId: "o3", conditionId: "treatment", value: 1.1, experimentalUnitId: "u3" },
    { observationId: "o4", conditionId: "treatment", value: 2.1, experimentalUnitId: "u4" },
  ],
  options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
};

describe("createIndependentContinuousEquivalenceRequest", () => {
  it("builds the reviewed Welch TOST contract from an independent two-group request", () => {
    expect(
      createIndependentContinuousEquivalenceRequest({ baseRequest, plan, comparisonId }),
    ).toEqual(
      expect.objectContaining({
        protocolVersion: "0.15.0",
        templateVersion: "0.2.0",
        method: "welch_tost",
        comparisonId,
        contrastConditionIds: ["control", "treatment"],
        options: { alternative: "two_sided", confidenceLevel: 0.9, multiplicityMethod: null },
      }),
    );
  });

  it("safe-stops matched metadata and non-raw or non-primary plans", () => {
    const matched = {
      ...baseRequest,
      observations: baseRequest.observations.map((observation, index) => ({
        ...observation,
        pairId: `pair-${index % 2}`,
      })),
    } as AnalysisEngineRequest;
    const percentagePlan = {
      ...plan,
      margin: { ...plan.margin, scale: "percentage_point_difference" as const },
    };
    expect(
      createIndependentContinuousEquivalenceRequest({ baseRequest: matched, plan, comparisonId }),
    ).toBeNull();
    expect(
      createIndependentContinuousEquivalenceRequest({
        baseRequest,
        plan: percentagePlan,
        comparisonId,
      }),
    ).toBeNull();
    expect(
      createIndependentContinuousEquivalenceRequest({
        baseRequest,
        plan: { ...plan, claimMode: "all_selected_comparisons", primaryComparisonId: undefined },
        comparisonId,
      }),
    ).toBeNull();
  });
});
