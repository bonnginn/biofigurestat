import { describe, expect, it } from "vitest";

import type { ExperimentDesign, Observation, UnitInstance } from "@lsaa/domain";

import { createD04EngineRequest } from "./d04-request-builder";
import { recommendD04 } from "./d04";

const conditionIds = ["condition.before", "condition.middle", "condition.after"];

function designFixture(): ExperimentDesign {
  return {
    schemaVersion: "0.2.0",
    id: "design.d04",
    name: "Three repeated time points",
    purpose: "time_or_dose",
    outcomes: [{ id: "outcome.value", key: "value", label: "Value", type: "continuous" }],
    factors: [
      {
        id: "factor.time",
        key: "time",
        label: "Time",
        levels: conditionIds.map((id, index) => ({
          id: `level.${index}`,
          label: id,
          order: index,
        })),
      },
    ],
    conditions: conditionIds.map((id, index) => ({
      id,
      label: id,
      factorLevels: { "factor.time": `level.${index}` },
    })),
    unitLevels: [
      {
        id: "unit.animal",
        key: "animal",
        label: "Animal",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "unit.animal",
    pairing: { kind: "matched", matchLevelId: "unit.animal", completePairsRequired: true },
    plannedN: 3,
    normalizationPlans: [],
    primaryContrast: {
      id: "contrast.before-after",
      label: "Before vs after",
      conditionIds: ["condition.before", "condition.after"],
    },
    wizardRuleVersion: "fixture.d04",
    wizardDecisions: [],
    createdAt: "2026-08-20T00:00:00.000Z",
  };
}

function canonicalFixture() {
  const units: UnitInstance[] = [1, 2, 3].map((replicate) => ({
    id: `unit.animal.${replicate}`,
    levelId: "unit.animal",
    parentUnitId: null,
    label: `Animal ${replicate}`,
    metadata: {},
  }));
  const observations: Observation[] = units.flatMap((unit, unitIndex) =>
    conditionIds.map((conditionId, conditionIndex) => ({
      id: `observation.${unitIndex}.${conditionIndex}`,
      rawRevisionId: "raw.d04",
      unitInstanceId: unit.id,
      conditionId,
      outcomeId: "outcome.value",
      measurement: { kind: "scalar" as const, value: 10 + unitIndex + conditionIndex * 3 },
    })),
  );
  return { units, observations };
}

describe("D04 repeated multi-group contract", () => {
  it("requires complete matched groups and recommends explicit Holm comparisons", () => {
    const match = recommendD04(designFixture());
    expect(match.matched).toBe(true);
    if (!match.matched) return;
    expect(match.recommendation).toMatchObject({
      templateId: "D04",
      recommendedMethod: "repeated_measures_anova",
      multiplicityMethod: "holm_paired_all_pairs",
    });
  });

  it("does not route independent groups into D04", () => {
    const design = designFixture();
    design.pairing = { kind: "independent" };
    expect(recommendD04(design)).toMatchObject({
      matched: false,
      reasonCode: "requires_matched_or_blocked_units",
    });
  });

  it("builds protocol 0.3 with explicit pair IDs", () => {
    const design = designFixture();
    const match = recommendD04(design);
    if (!match.matched) throw new Error("fixture must match D04");
    const { units, observations } = canonicalFixture();
    const request = createD04EngineRequest({
      requestId: "request.d04",
      projectId: "project.d04",
      analysisId: "analysis.d04",
      design,
      recommendation: match.recommendation,
      observations,
      unitInstances: units,
    });
    expect(request.protocolVersion).toBe("0.3.0");
    if (request.protocolVersion !== "0.3.0") return;
    expect(new Set(request.observations.map((observation) => observation.pairId))).toEqual(
      new Set(units.map((unit) => unit.id)),
    );
    expect(request.options.multiplicityMethod).toBe("holm_paired_all_pairs");
  });

  it("rejects an incomplete matched unit", () => {
    const design = designFixture();
    const match = recommendD04(design);
    if (!match.matched) throw new Error("fixture must match D04");
    const { units, observations } = canonicalFixture();
    expect(() =>
      createD04EngineRequest({
        requestId: "request.d04",
        projectId: "project.d04",
        analysisId: "analysis.d04",
        design,
        recommendation: match.recommendation,
        observations: observations.slice(1),
        unitInstances: units,
      }),
    ).toThrow(/must contain every declared condition/);
  });
});
