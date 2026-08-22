import { describe, expect, it } from "vitest";
import { ExperimentDesignSchema, type Observation, type UnitInstance } from "@lsaa/domain";
import { recommendD01OrD02 } from "./d01-d02";
import { createD01D02EngineRequest } from "./request-builder";

function independentDesign() {
  return ExperimentDesignSchema.parse({
    schemaVersion: "0.2.0",
    id: "design.request.fixture",
    name: "Request fixture",
    purpose: "microscopy",
    outcomes: [
      {
        id: "outcome.cilia",
        key: "cilia_positive",
        label: "Cilia-positive cells",
        type: "proportion_counts",
      },
    ],
    factors: [
      {
        id: "factor.condition",
        key: "condition",
        label: "Condition",
        levels: [
          { id: "level.control", label: "Control", order: 0 },
          { id: "level.treatment", label: "Treatment", order: 1 },
        ],
      },
    ],
    conditions: [
      {
        id: "condition.control",
        label: "Control",
        factorLevels: { "factor.condition": "level.control" },
      },
      {
        id: "condition.treatment",
        label: "Treatment",
        factorLevels: { "factor.condition": "level.treatment" },
      },
    ],
    unitLevels: [
      {
        id: "level.dish",
        key: "dish",
        label: "Dish",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "level.dish",
    pairing: { kind: "independent" },
    plannedN: 2,
    normalizationPlans: [],
    primaryContrast: {
      id: "contrast.primary",
      label: "Control vs Treatment",
      conditionIds: ["condition.control", "condition.treatment"],
    },
    wizardRuleVersion: "fixture.1",
    wizardDecisions: [],
    createdAt: "2026-08-20T12:00:00+09:00",
  });
}

describe("D01/D02 engine request builder", () => {
  it("converts positive/total counts to one percentage per biological replicate", () => {
    const design = independentDesign();
    const match = recommendD01OrD02(design);
    if (!match.matched) throw new Error("fixture should match D01");
    const unitInstances: UnitInstance[] = [
      {
        id: "unit.control.1",
        levelId: "level.dish",
        parentUnitId: null,
        label: "Control 1",
        metadata: {},
      },
      {
        id: "unit.treatment.1",
        levelId: "level.dish",
        parentUnitId: null,
        label: "Treatment 1",
        metadata: {},
      },
    ];
    const observations: Observation[] = [
      {
        id: "observation.control.1",
        rawRevisionId: "raw.1",
        unitInstanceId: "unit.control.1",
        conditionId: "condition.control",
        outcomeId: "outcome.cilia",
        measurement: { kind: "proportion", numerator: 40, denominator: 100 },
      },
      {
        id: "observation.treatment.1",
        rawRevisionId: "raw.1",
        unitInstanceId: "unit.treatment.1",
        conditionId: "condition.treatment",
        outcomeId: "outcome.cilia",
        measurement: { kind: "proportion", numerator: 75, denominator: 100 },
      },
    ];

    const request = createD01D02EngineRequest({
      requestId: "request.1",
      projectId: "project.1",
      analysisId: "analysis.1",
      design,
      recommendation: match.recommendation,
      observations,
      unitInstances,
    });

    expect(request.observations.map((observation) => observation.value)).toEqual([40, 75]);
    expect(request.observations.every((observation) => observation.pairId === undefined)).toBe(
      true,
    );
    expect(
      createD01D02EngineRequest({
        requestId: "request.1.alternative",
        projectId: "project.1",
        analysisId: "analysis.1.alternative",
        design,
        recommendation: match.recommendation,
        observations,
        unitInstances,
        selectedMethod: "mann_whitney",
      }).method,
    ).toBe("mann_whitney");
  });

  it("derives WB target/loading ratios without discarding source intensities", () => {
    const design = independentDesign();
    const match = recommendD01OrD02(design);
    if (!match.matched) throw new Error("fixture should match D01");
    const unitInstances: UnitInstance[] = ["control", "treatment"].map((condition) => ({
      id: `unit.${condition}.1`,
      levelId: "level.dish",
      parentUnitId: null,
      label: condition,
      metadata: {},
    }));
    const observations: Observation[] = [
      ["control", 120, 30],
      ["treatment", 180, 30],
    ].map(([condition, target, loadingControl]) => ({
      id: `observation.${condition}.1`,
      rawRevisionId: "raw.1",
      unitInstanceId: `unit.${condition}.1`,
      conditionId: `condition.${condition}`,
      outcomeId: "outcome.cilia",
      measurement: {
        kind: "loading_control_ratio" as const,
        target: Number(target),
        loadingControl: Number(loadingControl),
        transformationVersion: "0.1.0" as const,
      },
    }));

    const request = createD01D02EngineRequest({
      requestId: "request.wb.1",
      projectId: "project.1",
      analysisId: "analysis.1",
      design,
      recommendation: match.recommendation,
      observations,
      unitInstances,
    });
    expect(request.observations.map((observation) => observation.value)).toEqual([4, 6]);
    expect(observations[0].measurement).toMatchObject({ target: 120, loadingControl: 30 });
  });

  it("rejects an independent unit that contributes to both conditions", () => {
    const design = independentDesign();
    const match = recommendD01OrD02(design);
    if (!match.matched) throw new Error("fixture should match D01");
    const unit: UnitInstance = {
      id: "unit.shared",
      levelId: "level.dish",
      parentUnitId: null,
      label: "Shared",
      metadata: {},
    };
    const observations: Observation[] = ["condition.control", "condition.treatment"].map(
      (conditionId, index) => ({
        id: `observation.${index}`,
        rawRevisionId: "raw.1",
        unitInstanceId: unit.id,
        conditionId,
        outcomeId: "outcome.cilia",
        measurement: { kind: "proportion" as const, numerator: 1, denominator: 2 },
      }),
    );

    expect(() =>
      createD01D02EngineRequest({
        requestId: "request.1",
        projectId: "project.1",
        analysisId: "analysis.1",
        design,
        recommendation: match.recommendation,
        observations,
        unitInstances: [unit],
      }),
    ).toThrow(/cannot contribute observations to both conditions/);
  });

  it("rejects duplicate measurements from one unit instead of inflating biological n", () => {
    const design = independentDesign();
    const match = recommendD01OrD02(design);
    if (!match.matched) throw new Error("fixture should match D01");
    const unit: UnitInstance = {
      id: "unit.control.1",
      levelId: "level.dish",
      parentUnitId: null,
      label: "Control 1",
      metadata: {},
    };
    const observations: Observation[] = [1, 2].map((index) => ({
      id: `observation.control.${index}`,
      rawRevisionId: "raw.1",
      unitInstanceId: unit.id,
      conditionId: "condition.control",
      outcomeId: "outcome.cilia",
      measurement: { kind: "proportion" as const, numerator: index, denominator: 2 },
    }));

    expect(() =>
      createD01D02EngineRequest({
        requestId: "request.1",
        projectId: "project.1",
        analysisId: "analysis.1",
        design,
        recommendation: match.recommendation,
        observations,
        unitInstances: [unit],
      }),
    ).toThrow(/only one analyzed value/);
  });

  it("rejects an undeclared nested parent in an independent design", () => {
    const design = independentDesign();
    const match = recommendD01OrD02(design);
    if (!match.matched) throw new Error("fixture should match D01");
    const unit: UnitInstance = {
      id: "unit.cell.1",
      levelId: "level.dish",
      parentUnitId: "unit.parent-dish",
      label: "Nested unit",
      metadata: {},
    };
    const observation: Observation = {
      id: "observation.nested.1",
      rawRevisionId: "raw.1",
      unitInstanceId: unit.id,
      conditionId: "condition.control",
      outcomeId: "outcome.cilia",
      measurement: { kind: "proportion", numerator: 1, denominator: 2 },
    };

    expect(() =>
      createD01D02EngineRequest({
        requestId: "request.1",
        projectId: "project.1",
        analysisId: "analysis.1",
        design,
        recommendation: match.recommendation,
        observations: [observation],
        unitInstances: [unit],
      }),
    ).toThrow(/cannot promote a nested unit to biological n/);
  });
});
