import { describe, expect, it } from "vitest";

import type { ExperimentDesign } from "@lsaa/domain";

import {
  createIndependentMultiConditionDataSheet,
  rehydrateIndependentMultiConditionDataSheet,
  toCanonicalMultiConditionObservations,
} from "./multi-condition";

function designFixture(): ExperimentDesign {
  const conditions = ["control", "low", "high"];
  return {
    schemaVersion: "0.2.0",
    id: "design.multi",
    name: "Three groups",
    purpose: "microscopy",
    outcomes: [
      { id: "outcome.intensity", key: "intensity", label: "Intensity", type: "continuous" },
    ],
    factors: [
      {
        id: "factor.condition",
        key: "condition",
        label: "Condition",
        levels: conditions.map((label, index) => ({
          id: `level.${label}`,
          label,
          order: index,
        })),
      },
    ],
    conditions: conditions.map((label) => ({
      id: `condition.${label}`,
      label,
      factorLevels: { "factor.condition": `level.${label}` },
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
      label: "control vs high",
      conditionIds: ["condition.control", "condition.high"],
    },
    wizardRuleVersion: "fixture",
    wizardDecisions: [],
    createdAt: "2026-08-20T00:00:00.000Z",
  };
}

describe("independent multi-condition data sheet", () => {
  it("creates one distinct experimental unit per group and replicate", () => {
    const sheet = createIndependentMultiConditionDataSheet(designFixture(), "outcome.intensity");

    expect(sheet.columns).toHaveLength(3);
    const unitIds = sheet.columns.flatMap((column) =>
      column.entries.map((entry) => entry.experimentalUnitId),
    );
    expect(new Set(unitIds)).toHaveLength(9);
  });

  it("validates every value and round-trips editable canonical observations", () => {
    const design = designFixture();
    const sheet = createIndependentMultiConditionDataSheet(design, "outcome.intensity");
    sheet.columns.forEach((column, conditionIndex) =>
      column.entries.forEach((entry, replicateIndex) => {
        entry.experimentDate = `2026-08-${String(conditionIndex * 3 + replicateIndex + 1).padStart(2, "0")}`;
        entry.measurement = {
          kind: "scalar",
          value: conditionIndex * 10 + replicateIndex + 1,
        };
      }),
    );

    const canonical = toCanonicalMultiConditionObservations(sheet, "raw.multi.1");
    expect(canonical.success).toBe(true);
    if (!canonical.success) return;
    expect(canonical.observations).toHaveLength(9);
    expect(new Set(canonical.observations.map((item) => item.experimentDate))).toHaveLength(9);
    expect(canonical.unitInstances.every((unit) => unit.parentUnitId === null)).toBe(true);

    const restored = rehydrateIndependentMultiConditionDataSheet(
      design,
      "outcome.intensity",
      "raw.multi.1",
      canonical.unitInstances,
      canonical.observations,
    );
    expect(restored.columns[2].entries[2].measurement).toEqual({ kind: "scalar", value: 23 });
    expect(restored.columns[2].entries[2].experimentDate).toBe("2026-08-09");
  });

  it("does not validate a partially entered group", () => {
    const sheet = createIndependentMultiConditionDataSheet(designFixture(), "outcome.intensity");
    sheet.columns[0].entries[0].measurement = { kind: "scalar", value: 1 };

    const result = toCanonicalMultiConditionObservations(sheet, "raw.multi.1");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toHaveLength(8);
  });
});
