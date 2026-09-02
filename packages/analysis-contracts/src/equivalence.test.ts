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
import {
  AnalysisEngineRequestSchema,
  IndependentContinuousEquivalenceEngineRequestSchema,
  PairedContinuousEquivalenceEngineRequestSchema,
} from "./contracts";

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
  it("requires stable pair IDs and rejects block-only metadata for paired TOST", () => {
    const request = {
      protocolVersion: "0.16.0" as const,
      requestId: "request.paired-equivalence",
      projectId: "project.paired-equivalence",
      analysisId: "analysis.paired-equivalence",
      templateId: "D02" as const,
      templateVersion: "0.2.0" as const,
      method: "paired_tost" as const,
      comparisonId: "first:second",
      contrastConditionIds: ["condition.first", "condition.second"] as const,
      equivalencePlan: {
        schemaVersion: "0.1.0" as const,
        margin: {
          scale: "raw_difference" as const,
          lowerBound: -0.2,
          upperBound: 0.2,
          unit: "AU",
          declaredAsPrespecified: true as const,
        },
        alpha: 0.05 as const,
        claimMode: "single_primary_comparison" as const,
        primaryComparisonId: "first:second",
      },
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
      options: {
        alternative: "two_sided" as const,
        confidenceLevel: 0.9 as const,
        multiplicityMethod: null,
      },
    };
    expect(PairedContinuousEquivalenceEngineRequestSchema.safeParse(request).success).toBe(true);
    expect(AnalysisEngineRequestSchema.safeParse(request).success).toBe(true);
    expect(
      PairedContinuousEquivalenceEngineRequestSchema.safeParse({
        ...request,
        observations: request.observations.map(
          ({ pairId: _pairId, ...observation }) => observation,
        ),
      }).success,
    ).toBe(false);
    expect(
      PairedContinuousEquivalenceEngineRequestSchema.safeParse({
        ...request,
        observations: request.observations.map((observation) => ({
          ...observation,
          blockId: "run.1",
        })),
      }).success,
    ).toBe(false);
  });

  it("admits only one prespecified raw-difference comparison to the first Welch TOST protocol", () => {
    const request = {
      protocolVersion: "0.15.0" as const,
      requestId: "request.equivalence",
      projectId: "project.equivalence",
      analysisId: "analysis.equivalence",
      templateId: "D01" as const,
      templateVersion: "0.2.0" as const,
      method: "welch_tost" as const,
      comparisonId: "control:treatment",
      contrastConditionIds: ["condition.control", "condition.treatment"] as const,
      equivalencePlan: {
        schemaVersion: "0.1.0" as const,
        margin: {
          scale: "raw_difference" as const,
          lowerBound: -2,
          upperBound: 2,
          unit: "AU",
          declaredAsPrespecified: true as const,
        },
        alpha: 0.05 as const,
        claimMode: "single_primary_comparison" as const,
        primaryComparisonId: "control:treatment",
      },
      observations: [
        {
          observationId: "o.a1",
          conditionId: "condition.control",
          value: 1,
          experimentalUnitId: "u.a1",
        },
        {
          observationId: "o.a2",
          conditionId: "condition.control",
          value: 2,
          experimentalUnitId: "u.a2",
        },
        {
          observationId: "o.b1",
          conditionId: "condition.treatment",
          value: 1,
          experimentalUnitId: "u.b1",
        },
        {
          observationId: "o.b2",
          conditionId: "condition.treatment",
          value: 2,
          experimentalUnitId: "u.b2",
        },
      ],
      options: {
        alternative: "two_sided" as const,
        confidenceLevel: 0.9 as const,
        multiplicityMethod: null,
      },
    };
    expect(IndependentContinuousEquivalenceEngineRequestSchema.safeParse(request).success).toBe(
      true,
    );
    expect(
      IndependentContinuousEquivalenceEngineRequestSchema.safeParse({
        ...request,
        equivalencePlan: {
          ...request.equivalencePlan,
          margin: {
            ...request.equivalencePlan.margin,
            scale: "percentage_point_difference",
          },
        },
      }).success,
    ).toBe(false);
    expect(
      IndependentContinuousEquivalenceEngineRequestSchema.safeParse({
        ...request,
        equivalencePlan: {
          ...request.equivalencePlan,
          primaryComparisonId: "different-comparison",
        },
      }).success,
    ).toBe(false);
  });

  it("requires a scientifically declared interval around no difference", () => {
    expect(EquivalenceMarginSchema.safeParse(plan.margin).success).toBe(true);
    expect(EquivalenceMarginSchema.safeParse({ ...plan.margin, lowerBound: 0 }).success).toBe(
      false,
    );
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
