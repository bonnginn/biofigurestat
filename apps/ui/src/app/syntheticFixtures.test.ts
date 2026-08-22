import { describe, expect, it } from "vitest";

import { continuousSummary, experimentCellKey, percentage } from "./experimentDraft";
import {
  createComplexProportionFixture,
  createInternalAlphaCoreFixture,
  createLongitudinalFixture,
  createNestedContinuousFixture,
  createPairedTwoConditionFixture,
  createSimpleIndependentContinuousFixture,
  createSimpleIndependentFixture,
} from "./syntheticFixtures";

describe("deterministic UX fixtures", () => {
  it("keeps a deterministic Simple 3-group layout fixture", () => {
    const fixture = createSimpleIndependentFixture();
    expect(fixture).toEqual(createSimpleIndependentFixture());
    expect(fixture.draft.conditions.map(({ label }) => label)).toEqual([
      "Control",
      "Treatment A",
      "Treatment B",
    ]);
    expect(fixture.draft.time.sampling).toBe("none");
  });

  it("provides the copy-ready continuous 3-group Internal Alpha fixture", () => {
    const fixture = createSimpleIndependentContinuousFixture();
    expect(fixture).toEqual(createSimpleIndependentContinuousFixture());
    expect(fixture.draft.conditions.map(({ label }) => label)).toEqual([
      "Control",
      "Treatment A",
      "Treatment B",
    ]);
    expect(
      fixture.draft.experiments.map((experiment) =>
        fixture.draft.conditions.map((condition) => {
          const cell =
            fixture.cells[
              experimentCellKey({
                experimentId: experiment.id,
                conditionId: condition.id,
                readoutId: fixture.draft.readouts[0].id,
              })
            ];
          if (cell?.kind !== "nested_continuous") throw new Error("fixture cell should be nested");
          return cell.rawValues[0];
        }),
      ),
    ).toEqual([
      [10, 15, 22],
      [12, 17, 25],
      [11, 16, 24],
    ]);
  });

  it("creates the same moderately complex proportion fixture every time", () => {
    const first = createComplexProportionFixture();
    const second = createComplexProportionFixture();

    expect(second).toEqual(first);
    expect(first.draft.dataOrigin).toBe("synthetic_demo");
    expect(first.draft.experiments).toHaveLength(3);
    expect(first.draft.conditions).toHaveLength(8);
    expect(first.draft.attributes.map(({ label }) => label)).toEqual(["遺伝子", "配列", "処置"]);
    expect(first.draft.time.points.map(({ value }) => value)).toEqual([0, 24, 48]);
    expect(
      Object.values(first.cells).filter((cell) => cell.availability === "not_planned"),
    ).toHaveLength(1);
    expect(Object.keys(first.cells)).toHaveLength(71);

    const firstKey = experimentCellKey({
      experimentId: "experiment.1",
      conditionId: "condition.demo.1",
      readoutId: "readout.demo.proportion",
      timePointId: "time.0",
    });
    const firstCell = first.cells[firstKey];
    expect(firstCell?.kind).toBe("proportion");
    if (firstCell?.kind !== "proportion") throw new Error("fixture cell should be a proportion");
    expect(percentage(firstCell)).toBe((firstCell.positive! / firstCell.eligible!) * 100);
  });

  it("uses unequal cell counts while keeping experiment means as equal-weight summaries", () => {
    const fixture = createNestedContinuousFixture();
    expect(fixture).toEqual(createNestedContinuousFixture());
    expect(fixture.draft.experiments).toHaveLength(3);
    expect(fixture.draft.conditions).toHaveLength(4);
    expect(
      Object.values(fixture.cells).filter((cell) => cell.availability === "not_planned"),
    ).toHaveLength(1);
    expect(Object.keys(fixture.cells)).toHaveLength(35);

    const replicateValues = fixture.draft.experiments.map((experiment) => {
      const key = experimentCellKey({
        experimentId: experiment.id,
        conditionId: "condition.nested.1",
        readoutId: "readout.demo.intensity",
        timePointId: "time.0",
      });
      const cell = fixture.cells[key];
      if (cell?.kind !== "nested_continuous") throw new Error("fixture cell should be nested");
      return cell.rawValues;
    });
    expect(new Set(replicateValues.map((values) => values.length)).size).toBe(3);
    expect(replicateValues.every((values) => values.length >= 20 && values.length <= 40)).toBe(
      true,
    );

    const equalWeightMean = continuousSummary(
      replicateValues.map((values) => continuousSummary(values).mean!),
    ).mean!;
    const cellWeightedMean = continuousSummary(replicateValues.flat()).mean!;
    expect(equalWeightMean).not.toBeCloseTo(cellWeightedMean, 6);
  });

  it("provides a same-unit longitudinal regression fixture without changing analysis logic", () => {
    const fixture = createLongitudinalFixture();
    expect(fixture).toEqual(createLongitudinalFixture());
    expect(fixture.draft.time.sampling).toBe("longitudinal");
    expect(fixture.draft.time.points.map(({ value }) => value)).toEqual([0, 6, 12, 24]);
    expect(fixture.draft.experiments.map(({ label }) => label)).toEqual([
      "Cell 1",
      "Cell 2",
      "Cell 3",
      "Cell 4",
    ]);
  });

  it("keeps explicit stable-unit identity in the paired native validation fixture", () => {
    const fixture = createPairedTwoConditionFixture();
    expect(fixture.draft.experiments.map(({ stableUnitId }) => stableUnitId)).toEqual([
      "unit.animal.1",
      "unit.animal.2",
      "unit.animal.3",
      "unit.animal.4",
    ]);
    expect(new Set(fixture.draft.experiments.map(({ sessionId }) => sessionId)).size).toBe(4);
  });

  it("combines stable units, time, and two distinct readouts for the short native check", () => {
    const fixture = createInternalAlphaCoreFixture();
    expect(fixture).toEqual(createInternalAlphaCoreFixture());
    expect(fixture.draft.experiments.map(({ stableUnitId }) => stableUnitId)).toEqual([
      "unit.internal-alpha.1",
      "unit.internal-alpha.2",
      "unit.internal-alpha.3",
      "unit.internal-alpha.4",
    ]);
    expect(fixture.draft.readouts.map(({ label }) => label)).toEqual([
      "Marker X陽性率",
      "Reporter intensity",
    ]);
    expect(fixture.draft.time.points.map(({ value }) => value)).toEqual([0, 8, 24, 48]);
    expect(Object.keys(fixture.cells)).toHaveLength(64);
  });
});
