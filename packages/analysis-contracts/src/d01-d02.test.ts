import { describe, expect, it } from "vitest";
import { DESIGN_SCHEMA_VERSION, ExperimentDesignSchema, type ExperimentDesign } from "@lsaa/domain";
import { recommendD01OrD02 } from "./d01-d02";

const baseDesign: ExperimentDesign = ExperimentDesignSchema.parse({
  schemaVersion: DESIGN_SCHEMA_VERSION,
  id: "design.rpe1-sirna",
  name: "RPE1 control vs siRNA",
  purpose: "microscopy",
  outcomes: [
    {
      id: "outcome.cilia-positive",
      key: "cilia_positive",
      label: "Cilia-positive cells",
      type: "proportion_counts",
    },
  ],
  factors: [
    {
      id: "factor.treatment",
      key: "treatment",
      label: "Treatment",
      levels: [
        { id: "level.control", label: "Control siRNA", order: 0 },
        { id: "level.target", label: "Target siRNA", order: 1 },
      ],
    },
  ],
  conditions: [
    {
      id: "condition.control",
      label: "Control siRNA",
      factorLevels: { "factor.treatment": "level.control" },
    },
    {
      id: "condition.target",
      label: "Target siRNA",
      factorLevels: { "factor.treatment": "level.target" },
    },
  ],
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
    id: "contrast.control-target",
    label: "Control vs target siRNA",
    conditionIds: ["condition.control", "condition.target"],
  },
  wizardRuleVersion: "pairing-blocking-0.1.0",
  wizardDecisions: [
    { questionId: "same-biological-unit", answer: false },
    { questionId: "separate-dishes", answer: true },
  ],
  createdAt: "2026-08-20T12:00:00+09:00",
});

describe("recommendD01OrD02", () => {
  it("routes ordinary separate RPE1 dishes to D01", () => {
    const result = recommendD01OrD02(baseDesign);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.recommendation.templateId).toBe("D01");
  });

  it("routes the same animal measured twice to D02", () => {
    const design = ExperimentDesignSchema.parse({
      ...baseDesign,
      id: "design.mouse-before-after",
      purpose: "animal",
      unitLevels: [
        {
          id: "unit.mouse",
          key: "mouse",
          label: "Mouse",
          role: "experimental_unit",
          parentLevelId: null,
        },
      ],
      experimentalUnitLevelId: "unit.mouse",
      pairing: {
        kind: "matched",
        matchLevelId: "unit.mouse",
        completePairsRequired: true,
      },
    });
    const result = recommendD01OrD02(design);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.recommendation.templateId).toBe("D02");
  });

  it("allows an explicit advanced run block to route to D02", () => {
    const design = ExperimentDesignSchema.parse({
      ...baseDesign,
      unitLevels: [
        {
          id: "unit.run",
          key: "run",
          label: "Independent experiment run",
          role: "block",
          parentLevelId: null,
        },
        {
          id: "unit.dish",
          key: "dish",
          label: "Dish",
          role: "experimental_unit",
          parentLevelId: "unit.run",
        },
      ],
      pairing: {
        kind: "blocked",
        blockLevelId: "unit.run",
        completePairsRequired: true,
        explicitlyRequested: true,
      },
    });
    const result = recommendD01OrD02(design);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.recommendation.templateId).toBe("D02");
  });
});
