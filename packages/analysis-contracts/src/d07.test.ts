import { describe, expect, it } from "vitest";

import { AnalysisEngineRequestSchema } from "./contracts";

describe("D07 request contract", () => {
  const base = {
    protocolVersion: "0.7.0" as const,
    requestId: "request.d07",
    projectId: "project.d07",
    analysisId: "analysis.d07",
    templateId: "D07" as const,
    templateVersion: "0.1.0" as const,
    method: "two_way_anova" as const,
    conditionIds: ["condition.control", "condition.treatment"],
    withinFactor: {
      role: "time" as const,
      title: "Time",
      unit: "h",
      levels: [
        { levelId: "axis.24", value: 24 },
        { levelId: "axis.72", value: 72 },
      ],
    },
    observations: ["condition.control", "condition.treatment"].flatMap(
      (conditionId, conditionIndex) =>
        ["axis.24", "axis.72"].flatMap((withinFactorLevelId, levelIndex) =>
          [1, 2].map((replicate) => ({
            observationId: `observation.${conditionIndex}.${levelIndex}.${replicate}`,
            conditionId,
            withinFactorLevelId,
            value: conditionIndex + levelIndex + replicate,
            experimentalUnitId: `unit.${conditionIndex}.${levelIndex}.${replicate}`,
          })),
        ),
    ),
    options: { alternative: "two_sided" as const, confidenceLevel: 0.95, multiplicityMethod: null },
  };

  it("accepts explicit independent-cell factor metadata", () => {
    expect(AnalysisEngineRequestSchema.parse(base)).toMatchObject({
      protocolVersion: "0.7.0",
      templateId: "D07",
      withinFactor: { role: "time", title: "Time", unit: "h" },
    });
  });

  it("does not accept longitudinal pair identity in the independent-cell protocol", () => {
    expect(() =>
      AnalysisEngineRequestSchema.parse({
        ...base,
        observations: base.observations.map((observation) => ({
          ...observation,
          pairId: observation.experimentalUnitId,
        })),
      }),
    ).toThrow();
  });
});
