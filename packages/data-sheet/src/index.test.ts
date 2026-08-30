import { describe, expect, it } from "vitest";
import { ExperimentDesignSchema } from "@lsaa/domain";
import {
  createTwoConditionDataSheet,
  rehydrateTwoConditionDataSheet,
  toCanonicalObservations,
  type TwoConditionDataSheet,
} from "./index";

function design(pairing: "independent" | "matched", outcome: "continuous" | "proportion_counts") {
  return ExperimentDesignSchema.parse({
    schemaVersion: "0.2.0",
    id: `design.${pairing}.${outcome}`,
    name: "Fixture",
    purpose: "microscopy",
    outcomes: [{ id: "outcome.primary", key: "primary", label: "Primary", type: outcome }],
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
        id: "unit.biological",
        key: "biological",
        label: "Biological replicate",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "unit.biological",
    pairing:
      pairing === "independent"
        ? { kind: "independent" }
        : { kind: "matched", matchLevelId: "unit.biological", completePairsRequired: true },
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

describe("two-condition data sheet", () => {
  it("keeps visually aligned independent entries as separate biological units", () => {
    const sheet = createTwoConditionDataSheet(
      design("independent", "continuous"),
      "outcome.primary",
    );
    expect(sheet.relationship).toBe("independent");
    if (sheet.relationship !== "independent") throw new Error("unexpected sheet relationship");

    sheet.columns[0].entries[0].measurement = { kind: "scalar", value: 1 };
    sheet.columns[0].entries[0].sourceLocation = "clipboard:Mean:row:1";
    sheet.columns[0].entries[1].measurement = { kind: "scalar", value: 2 };
    sheet.columns[1].entries[0].measurement = { kind: "scalar", value: 3 };
    sheet.columns[1].entries[1].measurement = { kind: "scalar", value: 4 };

    const result = toCanonicalObservations(sheet, "raw.1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(new Set(result.observations.map((item) => item.unitInstanceId))).toHaveLength(4);
    expect(result.observations[0].sourceLocation).toBe("clipboard:Mean:row:1");
  });

  it("preserves a different experiment date for every independent experimental unit", () => {
    const experiment = design("independent", "continuous");
    const sheet = createTwoConditionDataSheet(
      experiment,
      "outcome.primary",
      "scalar",
      "2026-08-01",
    );
    if (sheet.relationship !== "independent") throw new Error("unexpected sheet relationship");
    const dates = ["2026-08-01", "2026-08-08", "2026-08-02", "2026-08-09"];
    sheet.columns.forEach((column, conditionIndex) =>
      column.entries.forEach((entry, replicateIndex) => {
        entry.experimentDate = dates[conditionIndex * 2 + replicateIndex];
        entry.measurement = { kind: "scalar", value: conditionIndex * 10 + replicateIndex };
      }),
    );

    const canonical = toCanonicalObservations(sheet, "raw.dates.1");
    expect(canonical.success).toBe(true);
    if (!canonical.success) return;
    expect(canonical.observations.map((observation) => observation.experimentDate)).toEqual(dates);

    const restored = rehydrateTwoConditionDataSheet(
      experiment,
      "outcome.primary",
      "raw.dates.1",
      canonical.unitInstances,
      canonical.observations,
      "2026-01-01",
    );
    if (restored.relationship !== "independent") throw new Error("unexpected sheet relationship");
    expect(
      restored.columns.flatMap((column) => column.entries.map((entry) => entry.experimentDate)),
    ).toEqual(dates);
  });

  it("uses the same biological unit for both values in a matched row", () => {
    const sheet = createTwoConditionDataSheet(design("matched", "continuous"), "outcome.primary");
    if (sheet.relationship !== "matched") throw new Error("unexpected sheet relationship");
    sheet.rows.forEach((row, index) => {
      row.experimentDate = index === 0 ? "2026-08-03" : "2026-08-10";
      row.values[0].measurement = { kind: "scalar", value: index + 1 };
      row.values[1].measurement = { kind: "scalar", value: index + 2 };
    });

    const result = toCanonicalObservations(sheet, "raw.1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(new Set(result.observations.map((item) => item.unitInstanceId))).toHaveLength(2);
    sheet.rows.forEach((row) => {
      expect(
        result.observations
          .filter((item) => item.unitInstanceId === row.experimentalUnitId)
          .map((item) => item.experimentDate),
      ).toEqual([row.experimentDate, row.experimentDate]);
    });
  });

  it("preserves positive and total cell counts per biological replicate", () => {
    const sheet = createTwoConditionDataSheet(
      design("independent", "proportion_counts"),
      "outcome.primary",
    );
    if (sheet.relationship !== "independent") throw new Error("unexpected sheet relationship");
    sheet.columns.forEach((column, conditionIndex) =>
      column.entries.forEach((entry, replicateIndex) => {
        entry.measurement = {
          kind: "proportion",
          numerator: 40 + conditionIndex * 10 + replicateIndex,
          denominator: 100,
        };
      }),
    );

    const result = toCanonicalObservations(sheet, "raw.1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.observations[0].measurement).toEqual({
      kind: "proportion",
      numerator: 40,
      denominator: 100,
    });
    expect(result.observations).toHaveLength(4);
  });

  it("does not accept a partially filled proportion replicate", () => {
    const sheet = createTwoConditionDataSheet(
      design("independent", "proportion_counts"),
      "outcome.primary",
    ) as TwoConditionDataSheet;
    if (sheet.relationship !== "independent") throw new Error("unexpected sheet relationship");
    sheet.columns[0].entries[0].measurement = {
      kind: "proportion",
      numerator: 50,
      denominator: null,
    };

    const result = toCanonicalObservations(sheet, "raw.1");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.some((issue) => issue.code === "incomplete_proportion")).toBe(true);
  });

  it("keeps raw target and loading-control intensities editable while analyzing their ratio", () => {
    const experiment = design("independent", "continuous");
    const sheet = createTwoConditionDataSheet(
      experiment,
      "outcome.primary",
      "loading_control_ratio",
    );
    if (sheet.relationship !== "independent") throw new Error("unexpected sheet relationship");
    sheet.columns.forEach((column, conditionIndex) =>
      column.entries.forEach((entry, replicateIndex) => {
        entry.measurement = {
          kind: "loading_control_ratio",
          target: 100 + 20 * conditionIndex + replicateIndex,
          loadingControl: 25,
        };
      }),
    );

    const canonical = toCanonicalObservations(sheet, "raw.wb.1");
    expect(canonical.success).toBe(true);
    if (!canonical.success) return;
    expect(canonical.observations[0].measurement).toEqual({
      kind: "loading_control_ratio",
      target: 100,
      loadingControl: 25,
      transformationVersion: "0.1.0",
    });

    const restored = rehydrateTwoConditionDataSheet(
      experiment,
      "outcome.primary",
      "raw.wb.1",
      canonical.unitInstances,
      canonical.observations,
    );
    expect(restored.relationship).toBe("independent");
    if (restored.relationship !== "independent") return;
    expect(restored.columns[0].entries[0].measurement).toEqual({
      kind: "loading_control_ratio",
      target: 100,
      loadingControl: 25,
    });
  });

  it("rejects a missing or zero WB loading-control value before analysis", () => {
    const sheet = createTwoConditionDataSheet(
      design("independent", "continuous"),
      "outcome.primary",
      "loading_control_ratio",
    );
    if (sheet.relationship !== "independent") throw new Error("unexpected sheet relationship");
    sheet.columns.forEach((column) =>
      column.entries.forEach((entry) => {
        entry.measurement = { kind: "loading_control_ratio", target: 100, loadingControl: 25 };
      }),
    );
    sheet.columns[0].entries[0].measurement = {
      kind: "loading_control_ratio",
      target: 100,
      loadingControl: 0,
    };
    const result = toCanonicalObservations(sheet, "raw.wb.1");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "invalid_loading_control_ratio" }),
    );
  });

  it.each([
    ["independent", "continuous"],
    ["matched", "continuous"],
    ["independent", "proportion_counts"],
  ] as const)(
    "rehydrates an editable %s %s sheet without changing its units",
    (pairing, outcome) => {
      const experiment = design(pairing, outcome);
      const original = createTwoConditionDataSheet(experiment, "outcome.primary");
      if (original.relationship === "independent") {
        original.columns.forEach((column, conditionIndex) =>
          column.entries.forEach((entry, replicateIndex) => {
            entry.measurement =
              outcome === "proportion_counts"
                ? {
                    kind: "proportion",
                    numerator: 30 + conditionIndex * 10 + replicateIndex,
                    denominator: 100,
                  }
                : { kind: "scalar", value: conditionIndex * 10 + replicateIndex + 1 };
          }),
        );
      } else {
        original.rows.forEach((row, replicateIndex) =>
          row.values.forEach((value, conditionIndex) => {
            value.measurement = { kind: "scalar", value: conditionIndex * 10 + replicateIndex + 1 };
          }),
        );
      }
      const canonical = toCanonicalObservations(original, "raw.1");
      expect(canonical.success).toBe(true);
      if (!canonical.success) return;
      canonical.unitInstances[0].label = "Original biological replicate";

      const restored = rehydrateTwoConditionDataSheet(
        experiment,
        "outcome.primary",
        "raw.1",
        canonical.unitInstances,
        canonical.observations,
      );
      const roundTrip = toCanonicalObservations(restored, "raw.2");
      expect(roundTrip.success).toBe(true);
      if (!roundTrip.success) return;
      expect(
        roundTrip.unitInstances.find((unit) => unit.id === canonical.unitInstances[0].id)?.label,
      ).toBe("Original biological replicate");
      expect(
        roundTrip.observations.map(({ conditionId, unitInstanceId, measurement }) => ({
          conditionId,
          unitInstanceId,
          measurement,
        })),
      ).toEqual(
        canonical.observations.map(({ conditionId, unitInstanceId, measurement }) => ({
          conditionId,
          unitInstanceId,
          measurement,
        })),
      );
    },
  );

  it("rejects an incomplete persisted matched pair", () => {
    const experiment = design("matched", "continuous");
    const original = createTwoConditionDataSheet(experiment, "outcome.primary");
    if (original.relationship !== "matched") throw new Error("unexpected sheet relationship");
    original.rows.forEach((row) =>
      row.values.forEach((value) => {
        value.measurement = { kind: "scalar", value: 1 };
      }),
    );
    const canonical = toCanonicalObservations(original, "raw.1");
    if (!canonical.success) throw new Error("fixture must be canonical");
    expect(() =>
      rehydrateTwoConditionDataSheet(
        experiment,
        "outcome.primary",
        "raw.1",
        canonical.unitInstances,
        canonical.observations.slice(1),
      ),
    ).toThrow(/exactly one value per condition/);
  });
});
