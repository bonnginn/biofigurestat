import { describe, expect, it } from "vitest";
import type { AnalysisEngineRequest, EquivalenceAnalysisPlan } from "@lsaa/analysis-contracts";

import { createPairedContinuousEquivalenceRequest } from "./pairedContinuousEquivalenceRequest";

const comparisonId = "equivalence:condition.first:condition.second";
const plan: EquivalenceAnalysisPlan = {
  schemaVersion: "0.1.0",
  margin: {
    scale: "raw_difference",
    lowerBound: -0.2,
    upperBound: 0.2,
    unit: "AU",
    declaredAsPrespecified: true,
  },
  alpha: 0.05,
  claimMode: "single_primary_comparison",
  primaryComparisonId: comparisonId,
};
const baseRequest: AnalysisEngineRequest = {
  protocolVersion: "0.1.0",
  requestId: "request.paired",
  projectId: "project.paired",
  analysisId: "analysis.paired",
  templateId: "D02",
  templateVersion: "0.1.0",
  method: "paired_t",
  contrastConditionIds: ["condition.first", "condition.second"],
  observations: [
    {
      observationId: "o.1a",
      conditionId: "condition.first",
      value: 1,
      experimentalUnitId: "p.1",
      pairId: "p.1",
    },
    {
      observationId: "o.1b",
      conditionId: "condition.second",
      value: 1.1,
      experimentalUnitId: "p.1",
      pairId: "p.1",
    },
    {
      observationId: "o.2a",
      conditionId: "condition.first",
      value: 2,
      experimentalUnitId: "p.2",
      pairId: "p.2",
    },
    {
      observationId: "o.2b",
      conditionId: "condition.second",
      value: 2.1,
      experimentalUnitId: "p.2",
      pairId: "p.2",
    },
  ],
  options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
};

describe("createPairedContinuousEquivalenceRequest", () => {
  it("preserves matched observations and explicit incomplete-pair provenance", () => {
    expect(
      createPairedContinuousEquivalenceRequest({
        baseRequest,
        plan,
        comparisonId,
        excludedIncompletePairIds: ["pair.missing"],
      }),
    ).toMatchObject({
      protocolVersion: "0.16.0",
      templateId: "D02",
      method: "paired_tost",
      contrastConditionIds: ["condition.first", "condition.second"],
      excludedIncompletePairIds: ["pair.missing"],
    });
  });

  it("safe-stops independent, blocked, or incomplete plans", () => {
    expect(
      createPairedContinuousEquivalenceRequest({
        baseRequest: { ...baseRequest, templateId: "D01", method: "welch_t" },
        plan,
        comparisonId,
      }),
    ).toBeNull();
    expect(
      createPairedContinuousEquivalenceRequest({
        baseRequest: {
          ...baseRequest,
          observations: baseRequest.observations.map((item) => ({ ...item, blockId: "run.1" })),
        },
        plan,
        comparisonId,
      }),
    ).toBeNull();
    expect(
      createPairedContinuousEquivalenceRequest({
        baseRequest,
        plan: { ...plan, primaryComparisonId: "other" },
        comparisonId,
      }),
    ).toBeNull();
  });
});
