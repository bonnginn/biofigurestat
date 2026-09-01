import { describe, expect, it } from "vitest";

import { DEFAULT_GRAPH_LAYERS } from "./useExperimentGraphPresentationState";
import { describeActiveGraphLayers } from "./experimentGraphLayerDescription";

describe("describeActiveGraphLayers", () => {
  it("does not call an independent time series an individual trajectory", () => {
    expect(
      describeActiveGraphLayers({
        graphType: "line",
        shape: "proportion",
        layers: DEFAULT_GRAPH_LAYERS,
        errorBar: "sd",
        timeSampling: "cross_sectional",
        matched: false,
      }),
    ).toBe("Summary trend + Biological replicates + SD error bars");
  });

  it("distinguishes nested observations from experiment summaries", () => {
    expect(
      describeActiveGraphLayers({
        graphType: "violin",
        shape: "nested_continuous",
        layers: DEFAULT_GRAPH_LAYERS,
        errorBar: "sd",
        timeSampling: "none",
        matched: false,
      }),
    ).toContain("Raw observations + Experiment summaries");
  });

  it("states when no display layer is selected", () => {
    expect(
      describeActiveGraphLayers({
        graphType: "dot",
        shape: "proportion",
        layers: {
          ...DEFAULT_GRAPH_LAYERS,
          raw: false,
          distribution: false,
          experiment: false,
          overall: false,
          violin: false,
          box: false,
        },
        errorBar: "none",
        timeSampling: "none",
        matched: false,
      }),
    ).toBe("No data layers selected");
  });

  it("describes the same scientific layers in Japanese when requested", () => {
    expect(
      describeActiveGraphLayers(
        {
          graphType: "line",
          shape: "nested_continuous",
          layers: DEFAULT_GRAPH_LAYERS,
          errorBar: "sd",
          timeSampling: "longitudinal",
          matched: true,
        },
        "ja",
      ),
    ).toBe("個体ごとの軌跡 + 要約トレンド + 実験単位の要約 + SDエラーバー");
  });
});
