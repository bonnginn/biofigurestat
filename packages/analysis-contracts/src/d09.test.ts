import { describe, expect, it } from "vitest";
import type { ExperimentDesign, Observation, UnitInstance } from "@lsaa/domain";

import { recommendD09 } from "./d09";
import { createD09EngineRequest } from "./d09-request-builder";

const design: ExperimentDesign = {
  schemaVersion: "0.2.0",
  id: "design.d09",
  name: "Two measurements on the same samples",
  purpose: "microscopy",
  outcomes: [{ id: "outcome.value", key: "value", label: "Value", type: "continuous" }],
  factors: [
    {
      id: "factor.variable",
      key: "variable",
      label: "Measurement",
      levels: [
        { id: "level.x", label: "Variable X", order: 0 },
        { id: "level.y", label: "Variable Y", order: 1 },
      ],
    },
  ],
  conditions: [
    { id: "condition.x", label: "Variable X", factorLevels: { "factor.variable": "level.x" } },
    { id: "condition.y", label: "Variable Y", factorLevels: { "factor.variable": "level.y" } },
  ],
  unitLevels: [
    {
      id: "unit.sample",
      key: "sample",
      label: "Sample",
      role: "experimental_unit",
      parentLevelId: null,
    },
  ],
  experimentalUnitLevelId: "unit.sample",
  pairing: { kind: "matched", matchLevelId: "unit.sample", completePairsRequired: true },
  plannedN: 3,
  normalizationPlans: [],
  primaryContrast: {
    id: "contrast.variables",
    label: "X and Y",
    conditionIds: ["condition.x", "condition.y"],
  },
  wizardRuleVersion: "d09-fixture",
  wizardDecisions: [{ questionId: "correlation.relationship_form", answer: "linear" }],
  createdAt: "2026-08-20T00:00:00Z",
};

const units: UnitInstance[] = [1, 2, 3].map((index) => ({
  id: `sample.${index}`,
  levelId: "unit.sample",
  parentUnitId: null,
  label: `Sample ${index}`,
  metadata: {},
}));
const observations: Observation[] = units.flatMap((unit, index) =>
  design.conditions.map((condition, conditionIndex) => ({
    id: `observation.${unit.id}.${condition.id}`,
    rawRevisionId: "raw.d09.1",
    unitInstanceId: unit.id,
    conditionId: condition.id,
    outcomeId: "outcome.value",
    measurement: { kind: "scalar" as const, value: index + conditionIndex + 1 },
  })),
);

describe("D09 deterministic recommendation and request", () => {
  it("recommends Pearson only after a linear relationship is explicitly stated", () => {
    const match = recommendD09(design);
    expect(match.matched).toBe(true);
    if (!match.matched) return;
    expect(match.recommendation.recommendedMethod).toBe("pearson");
    const request = createD09EngineRequest({
      requestId: "request.d09.1",
      projectId: "project.d09",
      analysisId: "analysis.d09",
      design,
      recommendation: match.recommendation,
      observations,
      unitInstances: units,
    });
    expect(request.protocolVersion).toBe("0.5.0");
    expect(request.observations).toHaveLength(6);
    expect(new Set(request.observations.map((observation) => observation.pairId))).toHaveLength(3);
  });

  it("routes a monotonic/ranked question to Spearman and rejects incomplete pairs", () => {
    const ranked = recommendD09({
      ...design,
      wizardDecisions: [
        { questionId: "correlation.relationship_form", answer: "monotonic_or_ranked" },
      ],
    });
    expect(ranked.matched && ranked.recommendation.recommendedMethod).toBe("spearman");
    if (!ranked.matched) return;
    expect(() =>
      createD09EngineRequest({
        requestId: "request.d09.incomplete",
        projectId: "project.d09",
        analysisId: "analysis.d09",
        design: {
          ...design,
          wizardDecisions: [
            { questionId: "correlation.relationship_form", answer: "monotonic_or_ranked" },
          ],
        },
        recommendation: ranked.recommendation,
        observations: observations.slice(1),
        unitInstances: units,
      }),
    ).toThrow(/missing one variable/);
  });
});
