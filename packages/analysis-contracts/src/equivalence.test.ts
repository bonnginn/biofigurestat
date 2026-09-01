import { describe, expect, it } from "vitest";

import {
  EquivalenceAnalysisPlanSchema,
  EquivalenceAnalysisResultSchema,
  EquivalenceIntervalEvidenceSchema,
  EquivalenceMarginSchema,
  assessEquivalenceInterval,
  type EquivalenceAnalysisPlan,
} from "./equivalence";
import { AnalysisEngineResultSchema } from "./contracts";

const plan: EquivalenceAnalysisPlan = {
  schemaVersion: "0.1.0",
  margin: {
    scale: "percentage_point_difference",
    lowerBound: -10,
    upperBound: 10,
    unit: "percentage points",
    rationale: "A change below ten percentage points is biologically negligible.",
    declaredAsPrespecified: true,
  },
  alpha: 0.05,
  claimMode: "all_selected_comparisons",
};

describe("equivalence analysis contracts", () => {
  it("requires a scientifically declared interval around no difference", () => {
    expect(EquivalenceMarginSchema.safeParse(plan.margin).success).toBe(true);
    expect(
      EquivalenceMarginSchema.safeParse({ ...plan.margin, lowerBound: 0 }).success,
    ).toBe(false);
    expect(
      EquivalenceMarginSchema.safeParse({
        ...plan.margin,
        declaredAsPrespecified: false,
      }).success,
    ).toBe(false);
  });

  it("requires an explicit primary comparison only for a single-primary claim", () => {
    expect(EquivalenceAnalysisPlanSchema.safeParse(plan).success).toBe(true);
    expect(
      EquivalenceAnalysisPlanSchema.safeParse({
        ...plan,
        claimMode: "single_primary_comparison",
      }).success,
    ).toBe(false);
    expect(
      EquivalenceAnalysisPlanSchema.safeParse({
        ...plan,
        claimMode: "single_primary_comparison",
        primaryComparisonId: "planned.1",
      }).success,
    ).toBe(true);
  });

  it("classifies interval evidence without treating overlap or n.s. as equivalence", () => {
    const evidence = {
      plan,
      estimate: 1,
      lowerConfidenceBound: -4,
      upperConfidenceBound: 6,
      confidenceLevel: 0.9,
    } as const;
    expect(assessEquivalenceInterval(evidence)).toBe("equivalence_supported");
    expect(
      assessEquivalenceInterval({
        ...evidence,
        estimate: 14,
        lowerConfidenceBound: 11,
        upperConfidenceBound: 17,
      }),
    ).toBe("meaningful_difference_supported");
    expect(
      assessEquivalenceInterval({
        ...evidence,
        estimate: 7,
        lowerConfidenceBound: 2,
        upperConfidenceBound: 12,
      }),
    ).toBe("inconclusive");
  });

  it("requires the equal-tail confidence level corresponding to two alpha-level one-sided tests", () => {
    expect(
      EquivalenceIntervalEvidenceSchema.safeParse({
        plan,
        estimate: 0,
        lowerConfidenceBound: -5,
        upperConfidenceBound: 5,
        confidenceLevel: 0.9,
      }).success,
    ).toBe(true);
    expect(
      EquivalenceIntervalEvidenceSchema.safeParse({
        plan,
        estimate: 0,
        lowerConfidenceBound: -5,
        upperConfidenceBound: 5,
        confidenceLevel: 0.95,
      }).success,
    ).toBe(false);
  });

  it("accepts only a complete interval-centered result with a matching three-state conclusion", () => {
    const singlePlan: EquivalenceAnalysisPlan = {
      ...plan,
      claimMode: "single_primary_comparison",
      primaryComparisonId: "parent:clone-2",
    };
    const result = {
      resultVersion: "0.1.0" as const,
      plan: singlePlan,
      comparisons: [
        {
          comparisonId: "parent:clone-2",
          estimate: 1,
          standardError: 2,
          lowerConfidenceBound: -4,
          upperConfidenceBound: 6,
          confidenceLevel: 0.9,
          lowerOneSidedPValue: 0.001,
          upperOneSidedPValue: 0.02,
          tostPValue: 0.02,
          conclusion: "equivalence_supported" as const,
        },
      ],
    };

    expect(EquivalenceAnalysisResultSchema.safeParse(result).success).toBe(true);
    expect(
      AnalysisEngineResultSchema.safeParse({
        protocolVersion: "0.1.0",
        requestId: "request.equivalence",
        status: "ok",
        engine: { name: "test-engine", version: "test", packages: {} },
        estimates: [],
        tests: [],
        equivalence: result,
        diagnostics: [],
        warnings: [],
        completedAt: "2026-09-02T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      EquivalenceAnalysisResultSchema.safeParse({
        ...result,
        comparisons: [{ ...result.comparisons[0], tostPValue: 0.001 }],
      }).success,
    ).toBe(false);
    expect(
      EquivalenceAnalysisResultSchema.safeParse({
        ...result,
        comparisons: [{ ...result.comparisons[0], conclusion: "inconclusive" }],
      }).success,
    ).toBe(false);
    expect(
      EquivalenceAnalysisResultSchema.safeParse({
        ...result,
        comparisons: [{ ...result.comparisons[0], comparisonId: "parent:clone-3" }],
      }).success,
    ).toBe(false);
  });
});
