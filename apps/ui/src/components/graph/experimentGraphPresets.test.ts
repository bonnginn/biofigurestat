import { describe, expect, it } from "vitest";

import { graphPresentationForPreset } from "./experimentGraphPresets";
import { DEFAULT_GRAPH_APPEARANCE } from "./useExperimentGraphPresentationState";

const currentAppearance = { ...DEFAULT_GRAPH_APPEARANCE, pointSize: 11 };

describe("graphPresentationForPreset", () => {
  it("keeps a multi-series publication preset distinguishable", () => {
    const result = graphPresentationForPreset({
      preset: "publication",
      graphType: "dot",
      shape: "proportion",
      visualSeriesCount: 2,
      currentAppearance,
    });

    expect(result.appearance).toMatchObject({
      palette: "condition",
      legendPosition: "right",
      pointSize: 6,
      axisLineWidth: 1.4,
    });
    expect(result.layers.experiment).toBe(true);
  });

  it("shows observations without an overall summary in the raw preset", () => {
    const result = graphPresentationForPreset({
      preset: "raw",
      graphType: "violin",
      shape: "nested_continuous",
      visualSeriesCount: 1,
      currentAppearance,
    });

    expect(result.layers).toMatchObject({
      raw: true,
      distribution: true,
      experiment: true,
      overall: false,
    });
    expect(result.appearance.palette).toBe("condition");
    expect(result.appearance.pointSize).toBe(11);
  });

  it("uses the existing graph-specific layers for simple and presentation presets", () => {
    const simple = graphPresentationForPreset({
      preset: "simple",
      graphType: "bar",
      shape: "proportion",
      visualSeriesCount: 1,
      currentAppearance,
    });
    const presentation = graphPresentationForPreset({
      preset: "presentation",
      graphType: "bar",
      shape: "proportion",
      visualSeriesCount: 1,
      currentAppearance,
    });

    expect(presentation.layers).toEqual(simple.layers);
    expect(presentation.appearance).toMatchObject({
      palette: "publication",
      pointSize: 8,
      axisLineWidth: 2,
    });
  });
});
