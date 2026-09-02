import { describe, expect, it } from "vitest";

import { createHeatmapModel } from "./heatmap";
import { createKaplanMeierGraphModel } from "./survival";
import { createCoreGraphModel } from "./core-model";
import { createCoreMultiGroupGraphSpec, createSurvivalGraphSpec, GraphSpecSchema } from "./index";

describe("single-cohort Core graph", () => {
  it("creates a dot/summary model with one real cohort", () => {
    const spec = createCoreMultiGroupGraphSpec({
      graphId: "graph.one",
      templateId: "D03",
      dataSource: { kind: "raw_revision", id: "raw.1", revision: "raw.1" },
      yLabel: "Value",
      yStartAtZero: false,
    });
    const model = createCoreGraphModel(
      spec,
      [{ id: "cohort", label: "Patient cohort" }],
      [
        { observationId: "o1", conditionId: "cohort", experimentalUnitId: "u1", value: 2 },
        { observationId: "o2", conditionId: "cohort", experimentalUnitId: "u2", value: 4 },
      ],
    );
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]).toMatchObject({ label: "Patient cohort" });
    expect(model.groups[0]?.values).toHaveLength(2);
  });
});

describe("Kaplan–Meier Core graph", () => {
  it("persists optional legend presentation while accepting an older spec without it", () => {
    const spec = createSurvivalGraphSpec({
      graphId: "graph.survival",
      dataSource: { kind: "analysis_result", id: "run.1", revision: "run.1" },
      analysisResultId: "run.1",
      timeLabel: "Days",
      legendFontSize: 15,
      legendPosition: "top",
      showMinorTicks: false,
      tickDirection: "inside",
    });
    expect(spec.appearance).toMatchObject({ legendFontSize: 15, legendPosition: "top" });
    expect(spec.axes).toMatchObject({ showMinorTicks: false, tickDirection: "inside" });

    const legacy = structuredClone(spec);
    delete legacy.appearance.legendFontSize;
    delete legacy.appearance.legendPosition;
    expect(GraphSpecSchema.parse(legacy).appearance).not.toHaveProperty("legendPosition");
  });

  it("uses steps, censor marks, and explicit number-at-risk values", () => {
    const model = createKaplanMeierGraphModel(
      [{ id: "control", label: "Control" }],
      [
        {
          observationId: "o1",
          experimentalUnitId: "m1",
          conditionId: "control",
          followUpTime: 2,
          eventObserved: true,
        },
        {
          observationId: "o2",
          experimentalUnitId: "m2",
          conditionId: "control",
          followUpTime: 4,
          eventObserved: false,
        },
        {
          observationId: "o3",
          experimentalUnitId: "m3",
          conditionId: "control",
          followUpTime: 6,
          eventObserved: true,
        },
      ],
    );
    expect(model.groups[0]).toMatchObject({ n: 3, events: 2, censored: 1 });
    const survival = model.groups[0].steps.map((point) => point.survival);
    expect(survival[0]).toBe(1);
    expect(survival[1]).toBeCloseTo(2 / 3);
    expect(survival[2]).toBeCloseTo(2 / 3);
    expect(survival[3]).toBe(0);
    expect(model.groups[0].censorMarks[0]).toMatchObject({
      time: 4,
      experimentalUnitId: "m2",
    });
    expect(model.groups[0].censorMarks[0].survival).toBeCloseTo(2 / 3);
    expect(model.groups[0].numberAtRisk).toEqual([
      { time: 2, count: 3 },
      { time: 4, count: 2 },
      { time: 6, count: 1 },
    ]);
  });
});

describe("Heatmap Core model", () => {
  const matrix = {
    version: "0.1.0" as const,
    rowIds: ["r1", "r2"],
    rowLabels: ["Long feature one", "Feature two"],
    columnIds: ["u1", "u2", "u3"],
    columnLabels: ["Sample 1", "Sample 2", "Sample 3"],
    values: [
      [1, 2, null],
      [10, 20, 40],
    ],
  };

  it("preserves raw missing values and records row z-score provenance", () => {
    const model = createHeatmapModel(matrix, "row_z_score");
    expect(model.raw).toEqual(matrix);
    expect(model.values[0][2]).toBeNull();
    expect(model.transform).toEqual({ kind: "row_z_score", version: "0.1.0" });
    expect(model.values[0][0]).toBeCloseTo(-Math.SQRT1_2);
  });

  it("requires positive values for an explicit log transform", () => {
    expect(() =>
      createHeatmapModel(
        {
          ...matrix,
          values: [
            [0, 2, null],
            [10, 20, 40],
          ],
        },
        "log10",
      ),
    ).toThrow(/positive/);
  });
});
