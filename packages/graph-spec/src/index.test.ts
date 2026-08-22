import { describe, expect, it } from "vitest";
import { createCoreTwoConditionGraphSpec, GraphSpecSchema } from "./index";

const dataSource = {
  kind: "derived_dataset" as const,
  id: "dataset.primary",
  revision: "derived.1",
};

describe("Core D01/D02 graph specifications", () => {
  it("creates an individual-dot plus mean/SD graph for D01", () => {
    const spec = createCoreTwoConditionGraphSpec({
      graphId: "graph.d01",
      templateId: "D01",
      dataSource,
      yLabel: "Normalized intensity",
      yStartAtZero: true,
    });

    expect(spec.type).toBe("dot_summary");
    expect(spec.summary).toEqual({ center: "mean", interval: "sd" });
    expect(spec.appearance.showRawPoints).toBe(true);
    expect(spec.appearance.showPairedLines).toBe(false);
  });

  it("creates a paired-dot graph with explicit within-unit connections for D02", () => {
    const spec = createCoreTwoConditionGraphSpec({
      graphId: "graph.d02",
      templateId: "D02",
      dataSource,
      yLabel: "Intensity",
      yStartAtZero: true,
    });

    expect(spec.type).toBe("paired_dot");
    expect(spec.mappings.pair).toBe("experimentalUnitId");
    expect(spec.appearance.showPairedLines).toBe(true);
  });

  it("rejects a paired-dot graph that loses its pair mapping", () => {
    const valid = createCoreTwoConditionGraphSpec({
      graphId: "graph.d02",
      templateId: "D02",
      dataSource,
      yLabel: "Intensity",
      yStartAtZero: true,
    });

    expect(
      GraphSpecSchema.safeParse({
        ...valid,
        mappings: { ...valid.mappings, pair: undefined },
      }).success,
    ).toBe(false);
  });
});
