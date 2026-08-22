import { describe, expect, it } from "vitest";

import type { Observation, UnitInstance } from "@lsaa/domain";

import {
  createNestedScalarDerivedDataset,
  summarizeNestedScalarObservations,
} from "./nested-summary";

function nestedFixture() {
  const units: UnitInstance[] = [];
  const observations: Observation[] = [];
  ["control", "treatment"].forEach((condition, conditionIndex) => {
    [1, 2].forEach((replicate) => {
      const dishId = `dish.${condition}.${replicate}`;
      units.push({
        id: dishId,
        levelId: "level.dish",
        parentUnitId: null,
        label: dishId,
        metadata: {},
      });
      [1, 2].forEach((field) => {
        const fieldId = `field.${condition}.${replicate}.${field}`;
        units.push({
          id: fieldId,
          levelId: "level.field",
          parentUnitId: dishId,
          label: fieldId,
          metadata: {},
        });
        [1, 2, 3].forEach((cell) => {
          const cellId = `cell.${condition}.${replicate}.${field}.${cell}`;
          units.push({
            id: cellId,
            levelId: "level.cell",
            parentUnitId: fieldId,
            label: cellId,
            metadata: {},
          });
          observations.push({
            id: `observation.${cellId}`,
            rawRevisionId: "raw.cells.1",
            unitInstanceId: cellId,
            conditionId: `condition.${condition}`,
            outcomeId: "outcome.intensity",
            measurement: {
              kind: "scalar",
              value: conditionIndex * 100 + replicate * 10 + field + cell,
            },
            sourceLocation: `imagej:row:${observations.length + 1}`,
          });
        });
      });
    });
  });
  return { units, observations };
}

describe("D10 safe replicate summaries", () => {
  it("reduces cells and fields to one value per biological replicate with full lineage", () => {
    const fixture = nestedFixture();
    const original = structuredClone(fixture.observations);

    const result = summarizeNestedScalarObservations({
      transformationId: "transform.replicate-mean.1",
      rawRevisionId: "raw.cells.1",
      outcomeId: "outcome.intensity",
      experimentalUnitLevelId: "level.dish",
      method: "mean",
      observations: fixture.observations,
      unitInstances: fixture.units,
    });

    expect(result.summaries).toHaveLength(4);
    expect(result.summaries.every((summary) => summary.subsampleCount === 6)).toBe(true);
    expect(result.summaries.flatMap((summary) => summary.sourceObservationIds)).toHaveLength(24);
    expect(result.transformation.method).toBe("replicate_summary");
    expect(result.transformation.inputRevisionIds).toEqual(["raw.cells.1"]);
    expect(fixture.observations).toEqual(original);
  });

  it("supports median without pooling biological units across conditions", () => {
    const fixture = nestedFixture();
    const result = summarizeNestedScalarObservations({
      transformationId: "transform.replicate-median.1",
      rawRevisionId: "raw.cells.1",
      outcomeId: "outcome.intensity",
      experimentalUnitLevelId: "level.dish",
      method: "median",
      observations: fixture.observations,
      unitInstances: fixture.units,
    });

    expect(new Set(result.summaries.map((summary) => summary.experimentalUnitId))).toHaveLength(4);
    expect(
      result.summaries.filter((summary) => summary.conditionId === "condition.control"),
    ).toHaveLength(2);
    expect(
      result.summaries.filter((summary) => summary.conditionId === "condition.treatment"),
    ).toHaveLength(2);
  });

  it("materializes versioned derived values whose IDs can be used as analysis input", () => {
    const fixture = nestedFixture();
    const derived = createNestedScalarDerivedDataset({
      derivedDatasetRevisionId: "derived.cells.1",
      rawRevisionId: "raw.cells.1",
      outcomeId: "outcome.intensity",
      experimentalUnitLevelId: "level.dish",
      method: "mean",
      observations: fixture.observations,
      unitInstances: fixture.units,
      createdAt: "2026-08-20T00:00:00Z",
      createdBy: "researcher",
    });

    expect(derived.revision.transformationId).toBe(derived.transformation.id);
    expect(derived.values).toHaveLength(4);
    expect(derived.values.every((value) => value.sourceObservationIds.length === 6)).toBe(true);
    expect(derived.values.every((value) => value.sourceUnitIds.length === 6)).toBe(true);
    expect(derived.transformation.parameters.weighting).toBe(
      "equal_observations_within_experimental_unit",
    );
  });

  it("is deterministic when raw rows arrive in a different order", () => {
    const fixture = nestedFixture();
    const common = {
      transformationId: "transform.deterministic.1",
      rawRevisionId: "raw.cells.1",
      outcomeId: "outcome.intensity",
      experimentalUnitLevelId: "level.dish",
      method: "mean" as const,
      unitInstances: fixture.units,
    };
    const forward = summarizeNestedScalarObservations({
      ...common,
      observations: fixture.observations,
    });
    const reverse = summarizeNestedScalarObservations({
      ...common,
      observations: [...fixture.observations].reverse(),
    });
    expect(reverse).toEqual(forward);
  });

  it("rejects a unit tree that cannot reach the declared biological level", () => {
    const fixture = nestedFixture();
    fixture.units.find((unit) => unit.id.startsWith("field."))!.parentUnitId = null;

    expect(() =>
      summarizeNestedScalarObservations({
        transformationId: "transform.invalid.1",
        rawRevisionId: "raw.cells.1",
        outcomeId: "outcome.intensity",
        experimentalUnitLevelId: "level.dish",
        method: "mean",
        observations: fixture.observations,
        unitInstances: fixture.units,
      }),
    ).toThrow(/no ancestor at the declared experimental-unit level/);
  });
});
