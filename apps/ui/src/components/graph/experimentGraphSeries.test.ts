import { describe, expect, it } from "vitest";
import {
  experimentCellKey,
  type ExperimentCellMap,
} from "../../app/experimentDraft";
import { createLongitudinalFixture } from "../../app/syntheticFixtures";
import {
  buildDerivedGraphLineageRows,
  getGraphCell,
  graphCellValue,
} from "./experimentGraphSeries";

describe("experiment graph canonical cell adapter", () => {
  it("reads the exact canonical cell identity and preserves its scientific value", () => {
    const key = experimentCellKey({
      experimentId: "experiment.1",
      conditionId: "condition.drug",
      readoutId: "readout.viability",
      timePointId: "time.24h",
    });
    const cells: ExperimentCellMap = {
      [key]: {
        kind: "proportion",
        positive: 37,
        eligible: 50,
      },
    };

    const cell = getGraphCell(
      cells,
      "experiment.1",
      "condition.drug",
      "readout.viability",
      "time.24h",
    );

    expect(cell).toBe(cells[key]);
    expect(graphCellValue(cell)).toBe(74);
  });

  it("keeps missing, not-planned, nested-summary, and WB-ratio meanings distinct", () => {
    expect(graphCellValue(undefined)).toBeNull();
    expect(
      graphCellValue({
        kind: "nested_continuous",
        rawValues: [1, 3, 5],
        source: "manual",
      }),
    ).toBe(3);
    expect(
      graphCellValue({
        kind: "wb_ratio",
        target: 8,
        reference: 4,
      }),
    ).toBe(2);
    expect(
      graphCellValue({
        kind: "proportion",
        positive: 1,
        eligible: 2,
        availability: "not_planned",
      }),
    ).toBeNull();
  });

  it("keeps each derived value linked to its original time-point measurements", () => {
    const fixture = createLongitudinalFixture();
    const rows = buildDerivedGraphLineageRows({
      draft: fixture.draft,
      cells: fixture.cells,
      readout: fixture.draft.readouts[0],
      activeConditions: fixture.draft.conditions,
      sourceMode: "derived_metric",
      timeAnalysis: { kind: "auc" },
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.id.includes(":"))).toBe(true);
    expect(rows.every((row) => row.sourceTrace.length === fixture.draft.time.points.length)).toBe(
      true,
    );
    expect(rows[0]?.sourceTrace[0]).toMatch(/^0: /u);
  });
});
