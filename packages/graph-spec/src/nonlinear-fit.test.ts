import { describe, expect, it } from "vitest";
import { createNonlinearFitGraphModel, createNonlinearFitGraphSpec } from "./nonlinear-fit";

describe("authoritative nonlinear XY Graph", () => {
  const points = [0, 30, 60, 120].map((x, index) => ({
    observationId: `o.${index}`,
    experimentalUnitId: "experiment.1",
    seriesId: "K5",
    x,
    y: index * 0.4,
  }));
  const result = {
    nonlinearFit: {
      modelId: "zero_baseline_association",
      series: [
        {
          seriesId: "K5",
          fittedCurve: [
            { x: 0, y: 0 },
            { x: 120, y: 1.4 },
          ],
        },
      ],
    },
  };

  it("keeps raw points separate and draws the saved engine curve", () => {
    const spec = createNonlinearFitGraphSpec({
      graphId: "graph.fit",
      dataSource: { kind: "analysis_result", id: "analysis-run.fit", revision: "analysis-run.fit" },
      analysisResultId: "analysis-run.fit",
      xLabel: "Time (min)",
      yLabel: "mol Pi / mol substrate",
      seriesIds: ["K5"],
    });
    const model = createNonlinearFitGraphModel(spec, points, result);
    expect(model.series[0]?.points).toEqual(points);
    expect(model.series[0]?.fittedCurve).toEqual(result.nonlinearFit.series[0]?.fittedCurve);
  });

  it("refuses cosmetic curves without a saved D17 result", () => {
    const spec = createNonlinearFitGraphSpec({
      graphId: "graph.fit",
      dataSource: { kind: "analysis_result", id: "analysis-run.fit", revision: "analysis-run.fit" },
      analysisResultId: "analysis-run.fit",
      xLabel: "Time",
      yLabel: "Response",
      seriesIds: ["K5"],
    });
    expect(() => createNonlinearFitGraphModel(spec, points, {})).toThrow(/authoritative D17/);
  });
});
