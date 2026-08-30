import { describe, expect, it } from "vitest";
import { createCoreCorrelationGraphModel, createCoreGraphModel } from "./core-model";
import {
  createCoreMultiGroupGraphSpec,
  createCoreCorrelationGraphSpec,
  createCoreRepeatedGroupGraphSpec,
  createCoreTwoConditionGraphSpec,
} from "./index";

const conditions = [
  { id: "condition.control", label: "Control" },
  { id: "condition.treatment", label: "Treatment" },
];
const dataSource = {
  kind: "derived_dataset" as const,
  id: "dataset.primary",
  revision: "derived.1",
};

describe("Core graph render model", () => {
  it("creates D09 scatter points by explicit pair ID rather than row order", () => {
    const spec = createCoreCorrelationGraphSpec({
      graphId: "graph.d09",
      dataSource,
      xConditionId: "condition.control",
      yConditionId: "condition.treatment",
      xLabel: "Marker A",
      yLabel: "Marker B",
    });
    const model = createCoreCorrelationGraphModel(
      spec,
      [conditions[0], conditions[1]],
      [
        {
          observationId: "y2",
          conditionId: "condition.treatment",
          value: 4,
          experimentalUnitId: "u2",
          pairId: "u2",
        },
        {
          observationId: "x1",
          conditionId: "condition.control",
          value: 1,
          experimentalUnitId: "u1",
          pairId: "u1",
        },
        {
          observationId: "y1",
          conditionId: "condition.treatment",
          value: 2,
          experimentalUnitId: "u1",
          pairId: "u1",
        },
        {
          observationId: "x3",
          conditionId: "condition.control",
          value: 3,
          experimentalUnitId: "u3",
          pairId: "u3",
        },
        {
          observationId: "x2",
          conditionId: "condition.control",
          value: 2,
          experimentalUnitId: "u2",
          pairId: "u2",
        },
        {
          observationId: "y3",
          conditionId: "condition.treatment",
          value: 6,
          experimentalUnitId: "u3",
          pairId: "u3",
        },
      ],
    );
    expect(model.type).toBe("scatter");
    expect(model.scatterPoints).toEqual([
      expect.objectContaining({ pairId: "u1", x: 1, y: 2 }),
      expect.objectContaining({ pairId: "u2", x: 2, y: 4 }),
      expect.objectContaining({ pairId: "u3", x: 3, y: 6 }),
    ]);
  });

  it("creates D03 grouped dots with one group per declared condition", () => {
    const spec = createCoreMultiGroupGraphSpec({
      graphId: "graph.d03",
      templateId: "D03",
      dataSource: { kind: "analysis_result", id: "analysis.d03", revision: "request.d03" },
      yLabel: "Intensity",
      yStartAtZero: true,
    });
    const multiConditions = [
      { id: "condition.a", label: "A" },
      { id: "condition.b", label: "B" },
      { id: "condition.c", label: "C" },
    ];
    const multiData = multiConditions.flatMap((condition, conditionIndex) =>
      [1, 2, 3].map((value) => ({
        observationId: `observation.${condition.id}.${value}`,
        conditionId: condition.id,
        value: value + conditionIndex,
        experimentalUnitId: `unit.${condition.id}.${value}`,
      })),
    );

    const model = createCoreGraphModel(spec, multiConditions, multiData);
    expect(model.type).toBe("grouped_dot");
    expect(model.groups).toHaveLength(3);
    expect(model.groups.every((group) => group.errorBarKind === "sd")).toBe(true);
    expect(model.connections).toEqual([]);
  });

  it("computes mean and sample SD from visible D01 points", () => {
    const spec = createCoreTwoConditionGraphSpec({
      graphId: "graph.d01",
      templateId: "D01",
      dataSource,
      yLabel: "Intensity",
      yStartAtZero: true,
    });
    const model = createCoreGraphModel(spec, conditions, [
      { observationId: "o1", conditionId: "condition.control", value: 1, experimentalUnitId: "u1" },
      { observationId: "o2", conditionId: "condition.control", value: 3, experimentalUnitId: "u2" },
      {
        observationId: "o3",
        conditionId: "condition.treatment",
        value: 4,
        experimentalUnitId: "u3",
      },
      {
        observationId: "o4",
        conditionId: "condition.treatment",
        value: 8,
        experimentalUnitId: "u4",
      },
    ]);

    expect(model.groups[0].mean).toBe(2);
    expect(model.groups[0].errorBar).toBeCloseTo(Math.SQRT2);
    expect(model.groups[0].errorBarKind).toBe("sd");
    expect(model.groups[1].mean).toBe(6);
    expect(model.groups[1].errorBar).toBeCloseTo(Math.SQRT2 * 2);
    expect(model.connections).toEqual([]);
  });

  it("keeps D10 raw points separate and computes SD from replicate summaries only", () => {
    const base = createCoreTwoConditionGraphSpec({
      graphId: "graph.d10",
      templateId: "D01",
      dataSource,
      yLabel: "Intensity",
      yStartAtZero: true,
    });
    const model = createCoreGraphModel({ ...base, type: "raw_and_replicate_summary" }, conditions, [
      {
        observationId: "d1",
        conditionId: "condition.control",
        value: 10,
        experimentalUnitId: "dish.1",
        layer: "replicate_summary",
      },
      {
        observationId: "d2",
        conditionId: "condition.control",
        value: 20,
        experimentalUnitId: "dish.2",
        layer: "replicate_summary",
      },
      {
        observationId: "r1",
        conditionId: "condition.control",
        value: 0,
        experimentalUnitId: "dish.1",
        layer: "raw",
      },
      {
        observationId: "r2",
        conditionId: "condition.control",
        value: 100,
        experimentalUnitId: "dish.2",
        layer: "raw",
      },
      {
        observationId: "d3",
        conditionId: "condition.treatment",
        value: 30,
        experimentalUnitId: "dish.3",
        layer: "replicate_summary",
      },
      {
        observationId: "d4",
        conditionId: "condition.treatment",
        value: 40,
        experimentalUnitId: "dish.4",
        layer: "replicate_summary",
      },
      {
        observationId: "r3",
        conditionId: "condition.treatment",
        value: 500,
        experimentalUnitId: "dish.3",
        layer: "raw",
      },
    ]);

    expect(model.groups[0].values).toHaveLength(2);
    expect(model.groups[0].rawValues).toHaveLength(2);
    expect(model.groups[0].mean).toBe(15);
    expect(model.groups[0].errorBar).toBeCloseTo(Math.sqrt(50));
  });

  it("retains one explicit connection for every complete D02 pair", () => {
    const spec = createCoreTwoConditionGraphSpec({
      graphId: "graph.d02",
      templateId: "D02",
      dataSource,
      yLabel: "Intensity",
      yStartAtZero: true,
    });
    const model = createCoreGraphModel(spec, conditions, [
      {
        observationId: "o1",
        conditionId: "condition.control",
        value: 1,
        experimentalUnitId: "u1",
        pairId: "pair.1",
      },
      {
        observationId: "o2",
        conditionId: "condition.treatment",
        value: 2,
        experimentalUnitId: "u1",
        pairId: "pair.1",
      },
    ]);

    expect(model.connections).toEqual([
      {
        pairId: "pair.1",
        segmentIndex: 0,
        pointIndex: 0,
        pointCount: 1,
        from: { conditionId: "condition.control", value: 1 },
        to: { conditionId: "condition.treatment", value: 2 },
      },
    ]);
  });

  it("connects every D04 matched unit across adjacent conditions", () => {
    const repeatedConditions = [
      { id: "condition.before", label: "Before" },
      { id: "condition.middle", label: "Middle" },
      { id: "condition.after", label: "After" },
    ];
    const spec = createCoreRepeatedGroupGraphSpec({
      graphId: "graph.d04",
      templateId: "D04",
      dataSource,
      yLabel: "Intensity",
      yStartAtZero: true,
    });
    const data = ["pair.1", "pair.2"].flatMap((pairId, pairIndex) =>
      repeatedConditions.map((condition, conditionIndex) => ({
        observationId: `observation.${pairIndex}.${conditionIndex}`,
        conditionId: condition.id,
        value: pairIndex + conditionIndex,
        experimentalUnitId: pairId,
        pairId,
      })),
    );

    const model = createCoreGraphModel(spec, repeatedConditions, data);
    expect(model.type).toBe("paired_dot");
    expect(model.connections).toHaveLength(4);
    expect(model.connections.filter((connection) => connection.pairId === "pair.1")).toHaveLength(
      2,
    );
    expect(new Set(model.connections.map((connection) => connection.pointCount))).toEqual(
      new Set([2]),
    );
  });
});
