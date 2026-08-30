import { describe, expect, it } from "vitest";
import { createCoreTwoConditionGraphSpec, createSurvivalGraphSpec, GraphSpecSchema } from "./index";

const dataSource = {
  kind: "derived_dataset" as const,
  id: "dataset.primary",
  revision: "derived.1",
};

describe("Core D01/D02 graph specifications", () => {
  it("retains Survival workspace axis labels and palette in its GraphSpec", () => {
    const spec = createSurvivalGraphSpec({
      graphId: "graph.survival",
      dataSource: { kind: "analysis_result", id: "result.survival", revision: "result.1" },
      analysisResultId: "result.survival",
      timeLabel: "Days after treatment",
      probabilityLabel: "Tumor-free probability",
      palette: ["#123456", "#abcdef"],
    });

    expect(spec.axes).toMatchObject({
      xLabel: "Days after treatment",
      yLabel: "Tumor-free probability",
    });
    expect(spec.appearance.palette).toEqual(["#123456", "#abcdef"]);
  });

  it("round-trips grouped categories with independent color and shape channels", () => {
    const parsed = GraphSpecSchema.parse({
      id: "graph.grouped-channels",
      version: "0.1.0",
      type: "grouped_dot",
      dataSource: { kind: "raw_revision", id: "raw.grouped", revision: "1" },
      analysisResultId: null,
      mappings: {
        x: "factor.sex",
        xHierarchy: ["factor.sex", "factor.region"],
        y: "value",
        series: "factor.region",
        color: "factor.sex",
        shape: "factor.region",
        facet: "factor.readout",
      },
      summary: { center: "mean", interval: "sem" },
      appearance: {
        palette: ["#cc6677", "#4477aa"],
        pointSize: 5,
        opacity: 1,
        showRawPoints: true,
        showPairedLines: false,
        seriesStyles: {
          "region.hip": { pointStyle: "circle", legendLabel: "HIP" },
          "region.ffcc": { pointStyle: "triangle", legendLabel: "FFCC" },
        },
      },
      axes: {
        yStartAtZero: false,
        yScale: "linear",
        xLabel: "Sex",
        yLabel: "Relative expression",
        tickDirection: "outside",
        showCategoryGroupSeparators: true,
      },
      facet: { factorId: "factor.readout", levelOrder: ["readout.a", "readout.b"] },
    });

    const roundTrip = GraphSpecSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(roundTrip.mappings).toMatchObject({
      series: "factor.region",
      color: "factor.sex",
      shape: "factor.region",
      facet: "factor.readout",
    });
    expect(roundTrip.axes).toMatchObject({
      tickDirection: "outside",
      showCategoryGroupSeparators: true,
    });
    expect(roundTrip.appearance.seriesStyles["region.ffcc"]?.pointStyle).toBe("triangle");
  });

  it("adds backward-compatible axis defaults to older GraphSpec payloads", () => {
    const spec = createCoreTwoConditionGraphSpec({
      graphId: "graph.legacy-defaults",
      templateId: "D01",
      dataSource,
      yLabel: "Response",
      yStartAtZero: false,
    });
    const legacyPayload = structuredClone(spec) as Record<string, unknown> & {
      axes: Record<string, unknown>;
    };
    delete legacyPayload.axes.tickDirection;
    delete legacyPayload.axes.showCategoryGroupSeparators;

    const parsed = GraphSpecSchema.parse(legacyPayload);

    expect(parsed.axes.tickDirection).toBe("outside");
    expect(parsed.axes.showCategoryGroupSeparators).toBe(false);
  });

  it("preserves factor-aware series, auxiliary reference, and saved-result annotations", () => {
    const parsed = GraphSpecSchema.parse({
      id: "graph.factor-aware",
      version: "0.1.0",
      type: "grouped_dot",
      dataSource: { kind: "analysis_result", id: "analysis.1", revision: "1" },
      analysisResultId: "analysis.1",
      mappings: {
        x: "factor.siRNA",
        y: "value",
        series: "factor.time",
        color: "factor.time",
        auxiliaryReference: "condition.role",
      },
      summary: { center: "mean", interval: "sd" },
      appearance: {
        palette: ["#111111", "#777777"],
        pointSize: 5,
        opacity: 1,
        showRawPoints: true,
        showPairedLines: false,
        distributionFill: "white",
        withinGroupSpacing: 0.7,
        betweenGroupSpacing: 1.4,
        seriesStyles: {
          "level.24h": {
            legendLabel: "24 h",
            pointStyle: "square",
            lineStyle: "dashed",
            lineWidth: 3.5,
          },
        },
      },
      axes: { yStartAtZero: false, yScale: "linear", xLabel: "siRNA", yLabel: "Response" },
      annotations: [
        {
          id: "annotation.1",
          analysisResultId: "analysis.1",
          testIndex: 2,
          mode: "symbol",
          showNonSignificant: false,
          lineage: { timePointId: "time.24h" },
        },
      ],
    });

    expect(parsed.mappings.series).toBe("factor.time");
    expect(parsed.appearance.seriesStyles["level.24h"]?.legendLabel).toBe("24 h");
    expect(parsed.appearance.seriesStyles["level.24h"]?.lineWidth).toBe(3.5);
    expect(parsed.annotations).toHaveLength(1);
  });

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
