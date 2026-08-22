import { describe, expect, it } from "vitest";

import type { ExperimentDesign } from "@lsaa/domain";

import {
  createRepeatedConditionDataSheet,
  rehydrateRepeatedConditionDataSheet,
  toCanonicalRepeatedConditionObservations,
} from "./repeated-condition";

function designFixture(): ExperimentDesign {
  const conditionIds = ["condition.before", "condition.middle", "condition.after"];
  return {
    schemaVersion: "0.2.0",
    id: "design.d04.sheet",
    name: "Repeated sheet",
    purpose: "microscopy",
    outcomes: [{ id: "outcome.value", key: "value", label: "Intensity", type: "continuous" }],
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
      id: "contrast.primary",
      label: "Before vs after",
      conditionIds: [conditionIds[0], conditionIds[2]],
    },
    wizardRuleVersion: "fixture",
    wizardDecisions: [],
    createdAt: "2026-08-20T00:00:00.000Z",
  };
}

describe("D04 repeated-condition data sheet", () => {
  it("uses the same explicit matched units in every condition", () => {
    const sheet = createRepeatedConditionDataSheet(designFixture(), "outcome.value");
    const expected = sheet.columns[0].entries.map((entry) => entry.matchedUnitId);
    expect(sheet.columns).toHaveLength(3);
    expect(
      sheet.columns.every(
        (column) => column.entries.map((entry) => entry.matchedUnitId).join() === expected.join(),
      ),
    ).toBe(true);
  });

  it("canonicalizes and rehydrates complete repeated observations", () => {
    const design = designFixture();
    const sheet = createRepeatedConditionDataSheet(design, "outcome.value");
    sheet.columns.forEach((column, conditionIndex) =>
      column.entries.forEach((entry, unitIndex) => {
        entry.experimentDate = `2026-08-${String(unitIndex + 1).padStart(2, "0")}`;
        if (entry.measurement.kind === "scalar")
          entry.measurement.value = conditionIndex * 10 + unitIndex;
      }),
    );
    const canonical = toCanonicalRepeatedConditionObservations(sheet, "raw.d04");
    expect(canonical.success).toBe(true);
    if (!canonical.success) return;
    expect(canonical.unitInstances).toHaveLength(3);
    expect(canonical.observations).toHaveLength(9);
    expect(
      canonical.observations
        .filter(
          (observation) => observation.unitInstanceId === sheet.columns[0].entries[1].matchedUnitId,
        )
        .map((observation) => observation.experimentDate),
    ).toEqual(["2026-08-02", "2026-08-02", "2026-08-02"]);

    const reopened = rehydrateRepeatedConditionDataSheet(
      design,
      "outcome.value",
      "raw.d04",
      canonical.unitInstances,
      canonical.observations,
    );
    expect(reopened.columns[2].entries[1].measurement).toEqual({ kind: "scalar", value: 21 });
    expect(reopened.columns[2].entries[1].experimentDate).toBe("2026-08-02");
  });

  it("rejects different dates for the same repeated experimental unit", () => {
    const sheet = createRepeatedConditionDataSheet(designFixture(), "outcome.value");
    sheet.columns[1].entries[0].experimentDate = "2026-08-20";
    expect(() => toCanonicalRepeatedConditionObservations(sheet, "raw.d04")).not.toThrow();
    const parsed = toCanonicalRepeatedConditionObservations(sheet, "raw.d04");
    expect(parsed.success).toBe(false);
  });

  it("reports missing values instead of dropping an incomplete unit", () => {
    const sheet = createRepeatedConditionDataSheet(designFixture(), "outcome.value");
    const canonical = toCanonicalRepeatedConditionObservations(sheet, "raw.d04");
    expect(canonical.success).toBe(false);
    if (canonical.success) return;
    expect(canonical.issues).toHaveLength(9);
  });
});
