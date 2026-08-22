import { describe, expect, it } from "vitest";

import { defaultGraphYTitle, defaultLayersForGraphType } from "./graphDefaults";

describe("defaultLayersForGraphType", () => {
  it("DotとBarは個々の実験単位・平均・SDを初期表示する", () => {
    for (const type of ["dot", "bar"] as const) {
      expect(defaultLayersForGraphType(type, "proportion")).toMatchObject({
        experiment: true,
        overall: true,
        errorBar: true,
        violin: false,
        box: false,
      });
    }
  });

  it("nested Violinは観測分布とraw・実験単位点だけを初期表示する", () => {
    expect(defaultLayersForGraphType("violin", "nested_continuous")).toEqual({
      raw: true,
      distribution: false,
      experiment: true,
      overall: false,
      violin: true,
      box: false,
      errorBar: false,
      connectingLine: false,
    });
  });

  it("少数の実験単位だけのViolinにraw観測を作ったことにしない", () => {
    expect(defaultLayersForGraphType("violin", "proportion")).toMatchObject({
      raw: false,
      experiment: true,
      overall: false,
      errorBar: false,
    });
  });

  it("application生成のGraph軸だけ英語既定にし、ユーザー名は変換しない", () => {
    expect(
      defaultGraphYTitle({ id: "readout.1", label: "Marker X陽性率", shape: "proportion" }),
    ).toBe("Percentage of Marker X-positive cells");
    expect(defaultGraphYTitle({ id: "readout.2", label: "繊毛陽性率", shape: "proportion" })).toBe(
      "繊毛陽性率",
    );
  });
});
