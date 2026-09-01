import { describe, expect, it } from "vitest";

import { selectGraphRendererKind } from "./ExperimentGraphCanvasRenderer";

describe("selectGraphRendererKind", () => {
  it("uses the composition renderer only for categorical composition Graphs", () => {
    expect(
      selectGraphRendererKind({
        shape: "categorical_counts",
        graphType: "stacked_100",
        analysisIntentKind: "group_comparison",
      }),
    ).toBe("composition");
    expect(
      selectGraphRendererKind({
        shape: "nested_continuous",
        graphType: "stacked_100",
        analysisIntentKind: "group_comparison",
      }),
    ).toBe("general");
  });

  it("uses the correlation renderer only for an explicit correlation scatter", () => {
    expect(
      selectGraphRendererKind({
        shape: "nested_continuous",
        graphType: "scatter",
        analysisIntentKind: "correlation",
      }),
    ).toBe("correlation");
    expect(
      selectGraphRendererKind({
        shape: "nested_continuous",
        graphType: "scatter",
        analysisIntentKind: "group_comparison",
      }),
    ).toBe("general");
  });
});
