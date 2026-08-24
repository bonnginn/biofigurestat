import { describe, expect, it } from "vitest";
import { ExperimentDesignSchema } from "./design";
import {
  CategoricalCountsMeasurementSchema,
  LoadingControlRatioMeasurementSchema,
  ProportionMeasurementSchema,
  measurementNumericValue,
} from "./data";

describe("domain integrity", () => {
  it("retains numerator and denominator for proportion outcomes", () => {
    expect(
      ProportionMeasurementSchema.parse({ kind: "proportion", numerator: 42, denominator: 120 }),
    ).toEqual({ kind: "proportion", numerator: 42, denominator: 120 });
  });

  it("rejects impossible proportion counts", () => {
    expect(() =>
      ProportionMeasurementSchema.parse({ kind: "proportion", numerator: 121, denominator: 120 }),
    ).toThrow();
  });

  it("preserves category counts without inventing one scalar value", () => {
    const measurement = CategoricalCountsMeasurementSchema.parse({
      kind: "categorical_counts",
      counts: { "category.g1": 52, "category.s": 28, "category.g2m": 20 },
    });
    expect(measurement.counts).toEqual({
      "category.g1": 52,
      "category.s": 28,
      "category.g2m": 20,
    });
    expect(() => measurementNumericValue(measurement)).toThrow(/implicit scalar/);
  });

  it("preserves both WB band intensities and derives their ratio deterministically", () => {
    const measurement = LoadingControlRatioMeasurementSchema.parse({
      kind: "loading_control_ratio",
      target: 120.5,
      loadingControl: 30.125,
      transformationVersion: "0.1.0",
    });
    expect(measurementNumericValue(measurement)).toBe(4);
    expect(measurement).toMatchObject({ target: 120.5, loadingControl: 30.125 });
    expect(() =>
      LoadingControlRatioMeasurementSchema.parse({
        kind: "loading_control_ratio",
        target: 10,
        loadingControl: 0,
        transformationVersion: "0.1.0",
      }),
    ).toThrow();
  });

  it("preserves ImageJ background-correction inputs and formula version for WB", () => {
    const measurement = LoadingControlRatioMeasurementSchema.parse({
      kind: "loading_control_ratio",
      target: 900,
      loadingControl: 600,
      transformationVersion: "0.1.0",
      sourceMeasurements: {
        method: "mean_intensity_minus_mean_background_times_area",
        version: "0.1.0",
        target: { intensity: 20, background: 5, area: 60 },
        loadingControl: { intensity: 14, background: 4, area: 60 },
      },
    });
    expect(measurementNumericValue(measurement)).toBe(1.5);
    expect(measurement.sourceMeasurements?.target).toEqual({
      intensity: 20,
      background: 5,
      area: 60,
    });
  });

  it("preserves siRNA sequence membership without treating sequences as replicates", () => {
    const parsed = ExperimentDesignSchema.parse({
      schemaVersion: "0.2.0",
      id: "design.sirna-family",
      name: "Control and three siRNA sequences",
      purpose: "microscopy",
      outcomes: [{ id: "outcome.primary", key: "primary", label: "Primary", type: "continuous" }],
      factors: [
        {
          id: "factor.reagent",
          key: "reagent",
          label: "siRNA reagent",
          levelGroups: [
            { id: "group.control", key: "control", label: "Control", order: 0 },
            { id: "group.target-a", key: "target-a", label: "Target A", order: 1 },
          ],
          levels: [
            { id: "level.control", label: "Control", order: 0, groupId: "group.control" },
            { id: "level.seq1", label: "siRNA #1", order: 1, groupId: "group.target-a" },
            { id: "level.seq2", label: "siRNA #2", order: 2, groupId: "group.target-a" },
            { id: "level.seq3", label: "siRNA #3", order: 3, groupId: "group.target-a" },
          ],
        },
      ],
      conditions: [
        {
          id: "condition.control",
          label: "Control",
          factorLevels: { "factor.reagent": "level.control" },
        },
        {
          id: "condition.seq1",
          label: "siRNA #1",
          factorLevels: { "factor.reagent": "level.seq1" },
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
        id: "contrast.primary",
        label: "Control vs siRNA #1",
        conditionIds: ["condition.control", "condition.seq1"],
      },
      wizardRuleVersion: "fixture.1",
      wizardDecisions: [],
      createdAt: "2026-08-20T00:00:00Z",
    });

    expect(parsed.factors[0].levelGroups?.[1].label).toBe("Target A");
    expect(
      parsed.factors[0].levels.filter((level) => level.groupId === "group.target-a"),
    ).toHaveLength(3);
    expect(() =>
      ExperimentDesignSchema.parse({
        ...parsed,
        factors: [
          {
            ...parsed.factors[0],
            levels: [
              ...parsed.factors[0].levels.slice(0, 3),
              { id: "level.bad", label: "Bad", order: 3, groupId: "group.missing" },
            ],
          },
        ],
      }),
    ).toThrow(/unknown scientific group/);
    expect(() =>
      ExperimentDesignSchema.parse({
        ...parsed,
        unitLevels: [
          { ...parsed.unitLevels[0], parentLevelId: "unit.cell" },
          {
            id: "unit.cell",
            key: "cell",
            label: "Cell",
            role: "subsample",
            parentLevelId: parsed.unitLevels[0].id,
          },
        ],
      }),
    ).toThrow(/must not contain a cycle/);
  });

  it("preserves factor semantics independently from visual grouping and comparison roles", () => {
    const createdAt = "2026-08-25T00:00:00Z";
    const parsed = ExperimentDesignSchema.parse({
      schemaVersion: "0.2.0",
      id: "design.factor-aware",
      name: "Independent time series display",
      purpose: "microscopy",
      outcomes: [{ id: "outcome.y", key: "y", label: "Y", type: "continuous" }],
      factors: [
        {
          id: "factor.sirna",
          key: "sirna",
          label: "siRNA",
          scientificRole: "intervention",
          unitRole: "between_unit",
          relationship: { kind: "independent" },
          proposedVisualRole: "x",
          levels: [
            { id: "level.control", label: "Control", order: 0 },
            { id: "level.kd", label: "Knockdown", order: 1 },
          ],
        },
        {
          id: "factor.time",
          key: "time",
          label: "Time",
          scientificRole: "time",
          unitRole: "between_unit",
          relationship: { kind: "independent" },
          proposedVisualRole: "series",
          levels: [
            { id: "level.0h", label: "0 h", order: 0 },
            { id: "level.24h", label: "24 h", order: 1 },
          ],
        },
      ],
      conditions: [
        {
          id: "condition.control.0h",
          label: "Control · 0 h",
          factorLevels: { "factor.sirna": "level.control", "factor.time": "level.0h" },
          role: "primary",
        },
        {
          id: "condition.kd.24h",
          label: "Knockdown · 24 h",
          factorLevels: { "factor.sirna": "level.kd", "factor.time": "level.24h" },
          role: "auxiliary_reference",
          sourceProvenance: "published Figure reference",
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
        id: "contrast.primary",
        label: "Control vs knockdown",
        conditionIds: ["condition.control.0h", "condition.kd.24h"],
      },
      comparisons: [
        {
          id: "comparison.primary",
          label: "Primary",
          role: "primary",
          conditionIds: ["condition.control.0h", "condition.kd.24h"],
        },
      ],
      wizardRuleVersion: "factor-aware.1",
      wizardDecisions: [],
      createdAt,
    });

    expect(parsed.factors[1]).toMatchObject({
      scientificRole: "time",
      unitRole: "between_unit",
      relationship: { kind: "independent" },
      proposedVisualRole: "series",
    });
    expect(parsed.conditions[1].role).toBe("auxiliary_reference");
    expect(parsed.comparisons?.[0].role).toBe("primary");
  });

  it("rejects a design whose declared experimental unit is only a subsample", () => {
    expect(() =>
      ExperimentDesignSchema.parse({
        schemaVersion: "0.2.0",
        id: "design.invalid-unit",
        name: "Invalid cell-as-n design",
        purpose: "microscopy",
        outcomes: [
          {
            id: "outcome.intensity",
            key: "intensity",
            label: "Intensity",
            type: "continuous",
          },
        ],
        factors: [
          {
            id: "factor.condition",
            key: "condition",
            label: "Condition",
            levels: [
              { id: "level.control", label: "Control", order: 0 },
              { id: "level.treated", label: "Treated", order: 1 },
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
            id: "condition.treated",
            label: "Treated",
            factorLevels: { "factor.condition": "level.treated" },
          },
        ],
        unitLevels: [
          {
            id: "unit.cell",
            key: "cell",
            label: "Cell",
            role: "subsample",
            parentLevelId: null,
          },
        ],
        experimentalUnitLevelId: "unit.cell",
        pairing: { kind: "independent" },
        plannedN: 3,
        normalizationPlans: [],
        primaryContrast: {
          id: "contrast.primary",
          label: "Control vs treated",
          conditionIds: ["condition.control", "condition.treated"],
        },
        wizardRuleVersion: "0.1.0",
        wizardDecisions: [],
        createdAt: "2026-08-20T12:00:00+09:00",
      }),
    ).toThrow(/experimentalUnitLevelId/);
  });
});
