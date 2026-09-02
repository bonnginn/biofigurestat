import { describe, expect, it } from "vitest";
import { GraphSpecSchema } from "./index";

const baseSpec = {
  id: "graph.set-semantics",
  version: "0.1.0" as const,
  type: "grouped_dot" as const,
  dataSource: { kind: "raw_revision" as const, id: "raw.1", revision: "0.1.0" },
  analysisResultId: "analysis.1",
  mappings: { x: "conditionId", y: "value" },
  summary: { center: "mean" as const, interval: "sd" as const },
  appearance: {
    palette: ["#245c8a"],
    pointSize: 6,
    opacity: 0.9,
    showRawPoints: true,
    showPairedLines: false,
  },
  axes: { yStartAtZero: false, yScale: "linear" as const, xLabel: "", yLabel: "Value" },
};

describe("GraphSpec data-set semantics", () => {
  it("round-trips four independent sets without coercing one into another", () => {
    const parsed = GraphSpecSchema.parse({
      ...baseSpec,
      dataSets: {
        displaySet: {
          conditionIds: ["condition.reference", "condition.a", "condition.b"],
          timePointIds: [],
        },
        analysisSet: {
          conditionIds: ["condition.a", "condition.b", "condition.c"],
          timePointIds: [],
        },
        comparisonSet: [
          { id: "planned.a-b", conditionIds: ["condition.a", "condition.b"] },
          { id: "planned.a-c", conditionIds: ["condition.a", "condition.c"] },
        ],
        annotationSet: [{ comparisonId: "planned.a-b" }],
      },
    });
    const roundTrip = GraphSpecSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTrip.dataSets.displaySet.conditionIds).toContain("condition.reference");
    expect(roundTrip.dataSets.analysisSet.conditionIds).not.toContain("condition.reference");
    expect(roundTrip.dataSets.comparisonSet).toHaveLength(2);
    expect(roundTrip.dataSets.annotationSet).toEqual([{ comparisonId: "planned.a-b" }]);
  });

  it("migrates legacy specs through non-destructive defaults", () => {
    const parsed = GraphSpecSchema.parse(baseSpec);
    expect(parsed.dataSets).toEqual({
      displaySet: { conditionIds: [], timePointIds: [] },
      analysisSet: { conditionIds: [], timePointIds: [] },
      comparisonSet: [],
      annotationSet: [],
    });
    expect(parsed.appearance).toMatchObject({
      barOutline: true,
      barMeanMarker: false,
      boxWhiskerMode: "tukey_1_5_iqr",
      uncertaintyStyle: "error_bars",
    });
    expect(parsed.axes.showMinorTicks).toBe(true);
  });

  it("preserves optional Bar outline color and width without changing legacy defaults", () => {
    const parsed = GraphSpecSchema.parse({
      ...baseSpec,
      appearance: {
        ...baseSpec.appearance,
        barOutlineMode: "custom",
        barOutlineColor: "#cc3311",
        barOutlineWidth: 2.4,
      },
    });
    const roundTrip = GraphSpecSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTrip.appearance).toMatchObject({
      barOutline: true,
      barOutlineMode: "custom",
      barOutlineColor: "#cc3311",
      barOutlineWidth: 2.4,
    });
  });
});
