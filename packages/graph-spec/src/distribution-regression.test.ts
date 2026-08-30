import { describe, expect, it } from "vitest";
import {
  createDistributionGraphSpec,
  createEcdfModel,
  createHistogramModel,
  createRegressionGraphModel,
  createRegressionGraphSpec,
  validateGraphScale,
} from "./index";

describe("distribution and regression Graph contracts", () => {
  it("preserves source values with deterministic/editable histogram bins", () => {
    const source = [1, 2, 2, 3, 8, 13];
    const automatic = createHistogramModel(source);
    const edited = createHistogramModel(source, 3);
    expect(automatic.values).toEqual(source);
    expect(edited.bins.map(({ count }) => count).reduce((a, b) => a + b)).toBe(source.length);
    expect(edited.binCount).toBe(3);
    expect(
      createDistributionGraphSpec({
        graphId: "g.hist",
        type: "histogram",
        dataSource: { kind: "raw_revision", id: "raw.1", revision: "raw.1" },
        xLabel: "Value",
        binCount: edited.binCount,
        binWidth: edited.binWidth,
      }).distribution?.binCount,
    ).toBe(3);
  });

  it("builds an unsmoothed empirical cumulative distribution", () => {
    expect(createEcdfModel([3, 1, 2]).points).toEqual([
      { x: 1, cumulativeFraction: 1 / 3 },
      { x: 2, cumulativeFraction: 2 / 3 },
      { x: 3, cumulativeFraction: 1 },
    ]);
  });

  it("refuses invalid log axes without dropping values", () => {
    expect(() => validateGraphScale([0, 1, 10], "log10", "X")).toThrow(/not removed/);
    expect(() => validateGraphScale([-1, 2], "log10", "Y")).toThrow(/greater than zero/);
    expect(() => validateGraphScale([0, 1], "linear", "X")).not.toThrow();
  });

  it("combines points, fitted line, CI band and independent axis scales", () => {
    const spec = createRegressionGraphSpec({
      graphId: "g.reg",
      dataSource: { kind: "analysis_result", id: "r", revision: "r" },
      analysisResultId: "r",
      xLabel: "Dose",
      yLabel: "Response",
      xScale: "log10",
    });
    const result = {
      protocolVersion: "0.13.0",
      requestId: "r",
      status: "ok",
      engine: { name: "e", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-24T00:00:00.000Z",
      regression: {
        slope: 1,
        intercept: 2,
        rSquared: 0.9,
        xRange: [1, 10],
        confidenceLevel: 0.95,
        fittedLine: [
          { x: 1, y: 3, lower: 2, upper: 4 },
          { x: 10, y: 12, lower: 10, upper: 14 },
        ],
      },
    } as const;
    expect(
      createRegressionGraphModel(
        spec,
        [
          { experimentalUnitId: "u1", x: 1, y: 3 },
          { experimentalUnitId: "u2", x: 10, y: 12 },
        ],
        result,
      ).line,
    ).toHaveLength(2);
    expect(spec.axes.xScale).toBe("log10");
    expect(spec.axes.yScale).toBe("linear");
  });
});
