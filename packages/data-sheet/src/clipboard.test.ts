import { describe, expect, it } from "vitest";
import { ExperimentDesignSchema } from "@lsaa/domain";
import { applyScalarValuesToCondition, parseTabularClipboard } from "./clipboard";
import { createTwoConditionDataSheet } from "./index";

function independentSheet() {
  const design = ExperimentDesignSchema.parse({
    schemaVersion: "0.2.0",
    id: "design.clipboard",
    name: "Clipboard fixture",
    purpose: "microscopy",
    outcomes: [
      { id: "outcome.intensity", key: "intensity", label: "Intensity", type: "continuous" },
    ],
    factors: [
      {
        id: "factor.condition",
        key: "condition",
        label: "Condition",
        levels: [
          { id: "level.a", label: "A", order: 0 },
          { id: "level.b", label: "B", order: 1 },
        ],
      },
    ],
    conditions: [
      { id: "condition.a", label: "A", factorLevels: { "factor.condition": "level.a" } },
      { id: "condition.b", label: "B", factorLevels: { "factor.condition": "level.b" } },
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
      id: "contrast.a-b",
      label: "A vs B",
      conditionIds: ["condition.a", "condition.b"],
    },
    wizardRuleVersion: "fixture",
    wizardDecisions: [],
    createdAt: "2026-08-20T00:00:00.000Z",
  });
  return createTwoConditionDataSheet(design, "outcome.intensity");
}

describe("tabular clipboard import", () => {
  it("parses ImageJ Results output and recommends the Mean column", () => {
    const parsed = parseTabularClipboard(
      "\tArea\tMean\tMin\tMax\n1\t151\t34.2\t2\t91\n2\t180\t41.5\t3\t96\n",
    );
    expect(parsed.delimiter).toBe("tab");
    expect(parsed.headers).toEqual(["行", "Area", "Mean", "Min", "Max"]);
    expect(parsed.recommendedColumnIndex).toBe(2);
    expect(parsed.columns[2].values).toEqual([34.2, 41.5]);
    expect(parsed.columns[2].valueRowNumbers).toEqual([1, 2]);
    expect(parsed.columns[0].looksLikeRowIndex).toBe(true);
  });

  it("parses one value per line and quoted CSV cells", () => {
    expect(parseTabularClipboard("1.2\n3.4\n5.6").columns[0].values).toEqual([1.2, 3.4, 5.6]);
    const csv = parseTabularClipboard('Label,Mean\n"cell, 1",12.5\n"cell, 2",13.5');
    expect(csv.columns[1].values).toEqual([12.5, 13.5]);
  });

  it("reports nonnumeric cells without silently dropping the row", () => {
    const parsed = parseTabularClipboard("Mean\n12\nnot measured\n14");
    expect(parsed.columns[0].values).toEqual([12, 14]);
    expect(parsed.columns[0].invalidRowNumbers).toEqual([2]);
    expect(parsed.recommendedColumnIndex).toBe(0);
  });

  it("fills one condition, clears old remainder values, and preserves unit IDs", () => {
    const sheet = independentSheet();
    if (sheet.relationship !== "independent") throw new Error("fixture must be independent");
    const originalIds = sheet.columns[0].entries.map((entry) => entry.experimentalUnitId);
    sheet.columns[0].entries.forEach((entry) => {
      entry.measurement = { kind: "scalar", value: 99 };
    });
    const updated = applyScalarValuesToCondition(sheet, "condition.a", [10, 20], {
      columnLabel: "Mean",
      rowNumbers: [3, 4],
    });
    if (updated.relationship !== "independent") throw new Error("fixture must remain independent");
    expect(updated.columns[0].entries.map((entry) => entry.measurement)).toEqual([
      { kind: "scalar", value: 10 },
      { kind: "scalar", value: 20 },
      { kind: "scalar", value: null },
    ]);
    expect(updated.columns[0].entries.map((entry) => entry.experimentalUnitId)).toEqual(
      originalIds,
    );
    expect(updated.columns[0].entries.map((entry) => entry.sourceLocation)).toEqual([
      "clipboard:Mean:row:3",
      "clipboard:Mean:row:4",
      undefined,
    ]);
  });

  it("rejects more pasted rows than the planned biological n", () => {
    expect(() =>
      applyScalarValuesToCondition(independentSheet(), "condition.a", [1, 2, 3, 4]),
    ).toThrow(/計画n = 3/);
  });
});
