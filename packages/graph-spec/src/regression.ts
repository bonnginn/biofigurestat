import { GraphSpecSchema, type GraphSpec } from "./index";
import { validateGraphScale } from "./distribution";

export type RegressionGraphPoint = Readonly<{ experimentalUnitId: string; x: number; y: number }>;
export type RegressionResult = Readonly<{
  regression?: Readonly<{
    fittedLine: ReadonlyArray<{ x: number; y: number; lower: number | null; upper: number | null }>;
  }>;
}>;
export type RegressionGraphModel = Readonly<{
  points: RegressionGraphPoint[];
  line: NonNullable<RegressionResult["regression"]>["fittedLine"];
  showConfidenceBand: boolean;
}>;

export function createRegressionGraphSpec(
  input: Readonly<{
    graphId: string;
    dataSource: GraphSpec["dataSource"];
    analysisResultId: string;
    xLabel: string;
    yLabel: string;
    xScale?: "linear" | "log10";
    yScale?: "linear" | "log10";
  }>,
): GraphSpec {
  return GraphSpecSchema.parse({
    id: input.graphId,
    version: "0.1.0",
    type: "scatter",
    dataSource: input.dataSource,
    analysisResultId: input.analysisResultId,
    mappings: { x: "x", y: "y", pair: "experimentalUnitId" },
    summary: { center: "none", interval: "none" },
    appearance: {
      palette: ["#4477AA"],
      pointSize: 5,
      opacity: 0.9,
      showRawPoints: true,
      showPairedLines: false,
    },
    axes: {
      yStartAtZero: false,
      xScale: input.xScale ?? "linear",
      yScale: input.yScale ?? "linear",
      xLabel: input.xLabel,
      yLabel: input.yLabel,
    },
  });
}

export function createRegressionGraphModel(
  spec: GraphSpec,
  points: readonly RegressionGraphPoint[],
  result: RegressionResult,
  showConfidenceBand = true,
): RegressionGraphModel {
  if (spec.type !== "scatter" || !result.regression)
    throw new Error("Regression Graph requires a D16 regression result");
  validateGraphScale(
    points.map(({ x }) => x),
    spec.axes.xScale ?? "linear",
    "X",
  );
  validateGraphScale(
    [...points.map(({ y }) => y), ...result.regression.fittedLine.map(({ y }) => y)],
    spec.axes.yScale,
    "Y",
  );
  return { points: [...points], line: [...result.regression.fittedLine], showConfidenceBand };
}
