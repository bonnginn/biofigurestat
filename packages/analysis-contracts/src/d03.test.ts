import { describe, expect, it } from "vitest";

import type { ExperimentDesign, Observation, UnitInstance } from "@lsaa/domain";

import { createD03EngineRequest } from "./d03-request-builder";
import { recommendD03 } from "./d03";
import { AnalysisEngineRequestSchema } from "./contracts";

const conditionIds = ["condition.control", "condition.low", "condition.high"];

function designFixture(): ExperimentDesign {
  return {
    schemaVersion: "0.2.0",
    id: "design.d03",
    name: "Three independent doses",
    purpose: "general_assay",
    outcomes: [
      { id: "outcome.intensity", key: "intensity", label: "Intensity", type: "continuous" },
    ],
    factors: [
      {
        id: "factor.dose",
        key: "dose",
        label: "Dose",
        levels: conditionIds.map((id, index) => ({ id: `level.${id}`, label: id, order: index })),
      },
    ],
    conditions: conditionIds.map((id) => ({
      id,
      label: id,
      factorLevels: { "factor.dose": `level.${id}` },
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
      id: "contrast.control-high",
      label: "Control vs high",
      conditionIds: ["condition.control", "condition.high"],
    },
    wizardRuleVersion: "fixture.d03",
    wizardDecisions: [],
    createdAt: "2026-08-20T00:00:00.000Z",
  };
}

function canonicalFixture() {
  const units: UnitInstance[] = [];
  const observations: Observation[] = [];
  conditionIds.forEach((conditionId, conditionIndex) => {
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
        rawRevisionId: "raw.d03",
        unitInstanceId: unitId,
        conditionId,
        outcomeId: "outcome.intensity",
        measurement: { kind: "scalar", value: conditionIndex * 10 + replicate },
      });
    });
  });
  return { units, observations };
}

describe("D03 independent multi-group contract", () => {
  it("recommends Welch ANOVA with explicit Games-Howell multiplicity", () => {
    const match = recommendD03(designFixture());

    expect(match.matched).toBe(true);
    if (!match.matched) return;
    expect(match.recommendation).toMatchObject({
      templateId: "D03",
      recommendedMethod: "welch_anova",
      multiplicityMethod: "games_howell_all_pairs",
    });
  });

  it("does not route repeated groups or two-factor designs into D03", () => {
    const repeated = designFixture();
    repeated.pairing = {
      kind: "matched",
      matchLevelId: "unit.dish",
      completePairsRequired: true,
    };
    expect(recommendD03(repeated)).toMatchObject({
      matched: false,
      reasonCode: "requires_independent_units",
    });

    const factorial = designFixture();
    factorial.factors.push({
      id: "factor.genotype",
      key: "genotype",
      label: "Genotype",
      levels: [
        { id: "level.wt", label: "WT", order: 0 },
        { id: "level.ko", label: "KO", order: 1 },
      ],
    });
    expect(recommendD03(factorial)).toMatchObject({
      matched: false,
      reasonCode: "requires_exactly_one_factor",
    });
  });

  it("builds protocol 0.2 input from biological units only", () => {
    const design = designFixture();
    const match = recommendD03(design);
    if (!match.matched) throw new Error("fixture must match D03");
    const { units, observations } = canonicalFixture();

    const request = createD03EngineRequest({
      requestId: "request.d03",
      projectId: "project.d03",
      analysisId: "analysis.d03",
      design,
      recommendation: match.recommendation,
      observations,
      unitInstances: units,
      controlConditionId: conditionIds[0],
    });

    expect(request.protocolVersion).toBe("0.2.0");
    if (request.protocolVersion !== "0.2.0") return;
    expect(request.conditionIds).toEqual(conditionIds);
    expect(request.controlConditionId).toBe(conditionIds[0]);
    expect(request.contrastIntent).toBe("all_pairs");
    expect(request.observations).toHaveLength(9);
    expect(request.options.multiplicityMethod).toBe("games_howell_all_pairs");
  });

  it("builds coherent Tukey, Dunnett, planned-pair, and omnibus-only requests", () => {
    const design = designFixture();
    const match = recommendD03(design);
    if (!match.matched) throw new Error("fixture must match D03");
    const { units, observations } = canonicalFixture();
    const common = {
      requestId: "request.d03.choice",
      projectId: "project.d03",
      analysisId: "analysis.d03.choice",
      design,
      recommendation: match.recommendation,
      observations,
      unitInstances: units,
      controlConditionId: conditionIds[0],
    };
    expect(
      createD03EngineRequest({
        ...common,
        selectedMethod: "one_way_anova",
        contrastIntent: "all_pairs",
      }),
    ).toMatchObject({
      method: "one_way_anova",
      contrastIntent: "all_pairs",
      options: { multiplicityMethod: "tukey_hsd_all_pairs" },
    });
    expect(
      createD03EngineRequest({
        ...common,
        selectedMethod: "one_way_anova",
        contrastIntent: "control_vs_many",
      }),
    ).toMatchObject({
      method: "one_way_anova",
      contrastIntent: "control_vs_many",
      controlConditionId: conditionIds[0],
      options: { multiplicityMethod: "dunnett_control_vs_many" },
    });
    expect(
      createD03EngineRequest({
        ...common,
        selectedMethod: "one_way_anova",
        contrastIntent: "planned_comparisons",
        plannedContrastConditionIds: [
          [conditionIds[0], conditionIds[1]],
          [conditionIds[0], conditionIds[2]],
        ],
      }),
    ).toMatchObject({
      method: "one_way_anova",
      contrastIntent: "planned_comparisons",
      plannedContrastConditionIds: [
        [conditionIds[0], conditionIds[1]],
        [conditionIds[0], conditionIds[2]],
      ],
      options: { multiplicityMethod: "holm_planned_comparisons" },
    });
    expect(
      createD03EngineRequest({
        ...common,
        selectedMethod: "kruskal_wallis",
        contrastIntent: "omnibus_only",
      }),
    ).toMatchObject({
      method: "kruskal_wallis",
      contrastIntent: "omnibus_only",
      options: { multiplicityMethod: null },
    });
  });

  it("rejects missing, duplicate, or undeclared planned comparison pairs", () => {
    const design = designFixture();
    const match = recommendD03(design);
    if (!match.matched) throw new Error("fixture must match D03");
    const { units, observations } = canonicalFixture();
    const common = {
      requestId: "request.d03.planned.invalid",
      projectId: "project.d03",
      analysisId: "analysis.d03.planned.invalid",
      design,
      recommendation: match.recommendation,
      observations,
      unitInstances: units,
      selectedMethod: "one_way_anova" as const,
      contrastIntent: "planned_comparisons" as const,
    };
    expect(() => createD03EngineRequest(common)).toThrow(/at least one explicit condition pair/);
    expect(() =>
      createD03EngineRequest({
        ...common,
        plannedContrastConditionIds: [
          [conditionIds[0], conditionIds[1]],
          [conditionIds[1], conditionIds[0]],
        ],
      }),
    ).toThrow(/duplicate condition pairs/);
    expect(() =>
      createD03EngineRequest({
        ...common,
        plannedContrastConditionIds: [[conditionIds[0], "condition.not-declared"]],
      }),
    ).toThrow(/declared condition IDs/);
  });

  it("rejects an explicit control ID outside the declared design", () => {
    const design = designFixture();
    const match = recommendD03(design);
    if (!match.matched) throw new Error("fixture must match D03");
    const { units, observations } = canonicalFixture();

    expect(() =>
      createD03EngineRequest({
        requestId: "request.d03",
        projectId: "project.d03",
        analysisId: "analysis.d03",
        design,
        recommendation: match.recommendation,
        observations,
        unitInstances: units,
        controlConditionId: "condition.not-declared",
      }),
    ).toThrow(/control must be one of the declared conditions/);
  });

  it("keeps the current D03 result contract explicitly two-sided", () => {
    const design = designFixture();
    const match = recommendD03(design);
    if (!match.matched) throw new Error("fixture must match D03");
    const { units, observations } = canonicalFixture();
    const request = createD03EngineRequest({
      requestId: "request.d03.sidedness",
      projectId: "project.d03",
      analysisId: "analysis.d03.sidedness",
      design,
      recommendation: match.recommendation,
      observations,
      unitInstances: units,
      controlConditionId: conditionIds[0],
      selectedMethod: "one_way_anova",
      contrastIntent: "control_vs_many",
    });

    expect(
      AnalysisEngineRequestSchema.safeParse({
        ...request,
        options: { ...request.options, alternative: "greater" },
      }).success,
    ).toBe(false);
  });

  it("rejects nested observations instead of counting them as biological n", () => {
    const design = designFixture();
    const match = recommendD03(design);
    if (!match.matched) throw new Error("fixture must match D03");
    const { units, observations } = canonicalFixture();
    units[0] = { ...units[0], parentUnitId: "unit.parent" };

    expect(() =>
      createD03EngineRequest({
        requestId: "request.d03",
        projectId: "project.d03",
        analysisId: "analysis.d03",
        design,
        recommendation: match.recommendation,
        observations,
        unitInstances: units,
      }),
    ).toThrow(/cannot silently promote a nested or blocked unit/);
  });
});
