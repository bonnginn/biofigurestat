import { describe, expect, it } from "vitest";

import type { ExperimentDesign, Observation, UnitInstance } from "@lsaa/domain";

import { createD05EngineRequest } from "./d05-request-builder";
import { recommendD05 } from "./d05";

function designFixture(): ExperimentDesign {
  const factorA = {
    id: "factor.sirna",
    key: "sirna",
    label: "siRNA",
    levels: [
      { id: "level.control", label: "Control", order: 0 },
      { id: "level.target", label: "Target", order: 1 },
    ],
  };
  const factorB = {
    id: "factor.light",
    key: "light",
    label: "Light",
    levels: [
      { id: "level.dark", label: "Dark", order: 0 },
      { id: "level.lit", label: "Lit", order: 1 },
    ],
  };
  const combinations = factorA.levels.flatMap((a) => factorB.levels.map((b) => [a, b] as const));
  return {
    schemaVersion: "0.2.0",
    id: "design.d05",
    name: "siRNA by light",
    purpose: "microscopy",
    outcomes: [{ id: "outcome.value", key: "value", label: "Intensity", type: "continuous" }],
    factors: [factorA, factorB],
    conditions: combinations.map(([a, b], index) => ({
      id: `condition.${index}`,
      label: `${a.label} / ${b.label}`,
      factorLevels: { [factorA.id]: a.id, [factorB.id]: b.id },
    })),
    unitLevels: [
      {
        id: "unit.dish",
        key: "dish",
        label: "Dish",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "unit.dish",
    pairing: { kind: "independent" },
    plannedN: 3,
    normalizationPlans: [],
    primaryContrast: {
      id: "contrast.primary",
      label: "First vs last",
      conditionIds: ["condition.0", "condition.3"],
    },
    wizardRuleVersion: "fixture.d05",
    wizardDecisions: [],
    createdAt: "2026-08-20T00:00:00.000Z",
  };
}

function canonicalFixture(design: ExperimentDesign) {
  const units: UnitInstance[] = [];
  const observations: Observation[] = [];
  design.conditions.forEach((condition, conditionIndex) => {
    [1, 2, 3].forEach((replicate) => {
      const unitId = `unit.${conditionIndex}.${replicate}`;
      units.push({
        id: unitId,
        levelId: "unit.dish",
        parentUnitId: null,
        label: unitId,
        metadata: {},
      });
      observations.push({
        id: `observation.${conditionIndex}.${replicate}`,
        rawRevisionId: "raw.d05",
        unitInstanceId: unitId,
        conditionId: condition.id,
        outcomeId: "outcome.value",
        measurement: { kind: "scalar", value: conditionIndex * 2 + replicate },
      });
    });
  });
  return { units, observations };
}

describe("D05 complete two-factor contract", () => {
  it("recommends interaction-first two-way ANOVA", () => {
    const match = recommendD05(designFixture());
    expect(match.matched).toBe(true);
    if (!match.matched) return;
    expect(match.recommendation).toMatchObject({
      templateId: "D05",
      recommendedMethod: "two_way_anova",
      multiplicityMethod: "holm_all_cell_pairs",
    });
  });

  it("rejects an incomplete factorial design", () => {
    const design = designFixture();
    design.conditions.pop();
    expect(recommendD05(design)).toMatchObject({
      matched: false,
      reasonCode: "requires_complete_factorial_cells",
    });
  });

  it("builds protocol 0.4 from independent units", () => {
    const design = designFixture();
    const match = recommendD05(design);
    if (!match.matched) throw new Error("fixture must match D05");
    const { units, observations } = canonicalFixture(design);
    const request = createD05EngineRequest({
      requestId: "request.d05",
      projectId: "project.d05",
      analysisId: "analysis.d05",
      design,
      recommendation: match.recommendation,
      observations,
      unitInstances: units,
    });
    expect(request.protocolVersion).toBe("0.4.0");
    if (request.protocolVersion !== "0.4.0") return;
    expect(request.conditions).toHaveLength(4);
    expect(request.observations).toHaveLength(12);
  });

  it("carries scientific level groups without pooling their member interventions", () => {
    const design = designFixture();
    design.factors[0].levelGroups = [
      { id: "group.control", key: "control", label: "Control", order: 0 },
      { id: "group.target", key: "target", label: "Target gene", order: 1 },
    ];
    design.factors[0].levels = [
      { ...design.factors[0].levels[0], groupId: "group.control" },
      { ...design.factors[0].levels[1], groupId: "group.target" },
    ];
    const match = recommendD05(design);
    if (!match.matched) throw new Error("fixture must match D05");
    const { units, observations } = canonicalFixture(design);
    const request = createD05EngineRequest({
      requestId: "request.d05.groups",
      projectId: "project.d05",
      analysisId: "analysis.d05",
      design,
      recommendation: match.recommendation,
      observations,
      unitInstances: units,
    });
    if (request.protocolVersion !== "0.4.0") throw new Error("unexpected protocol");
    expect(request.factors[0].levelGroups).toEqual([
      { groupId: "group.control", levelIds: ["level.control"] },
      { groupId: "group.target", levelIds: ["level.target"] },
    ]);
    expect(request.observations).toHaveLength(12);
  });

  it("rejects duplicate or nested biological units", () => {
    const design = designFixture();
    const match = recommendD05(design);
    if (!match.matched) throw new Error("fixture must match D05");
    const { units, observations } = canonicalFixture(design);
    units[0] = { ...units[0], parentUnitId: "unit.parent" };
    expect(() =>
      createD05EngineRequest({
        requestId: "request.d05",
        projectId: "project.d05",
        analysisId: "analysis.d05",
        design,
        recommendation: match.recommendation,
        observations,
        unitInstances: units,
      }),
    ).toThrow(/non-nested experimental unit/);
  });
});
