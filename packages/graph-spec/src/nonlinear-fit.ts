import { GraphSpecSchema, type GraphSpec } from "./index";
import { validateGraphScale } from "./distribution";

export type NonlinearFitPoint = Readonly<{
  observationId: string;
  experimentalUnitId: string;
  seriesId: string;
  x: number;
  y: number;
}>;

export type NonlinearFitResult = Readonly<{
  nonlinearFit?: Readonly<{
    modelId: string;
    series: ReadonlyArray<{
      seriesId: string;
      fittedCurve: ReadonlyArray<{ x: number; y: number }>;
    }>;
  }>;
}>;

export type NonlinearFitGraphModel = Readonly<{
  modelId: string;
  series: ReadonlyArray<{
    seriesId: string;
    points: NonlinearFitPoint[];
    fittedCurve: ReadonlyArray<{ x: number; y: number }>;
  }>;
}>;

export function createNonlinearFitGraphSpec(
  input: Readonly<{
    graphId: string;
    dataSource: GraphSpec["dataSource"];
    analysisResultId: string;
    xLabel: string;
    yLabel: string;
    seriesIds: readonly string[];
    palette?: readonly string[];
  }>,
): GraphSpec {
  return GraphSpecSchema.parse({
    id: input.graphId,
    version: "0.1.0",
    type: "nonlinear_xy",
    dataSource: input.dataSource,
    analysisResultId: input.analysisResultId,
    mappings: { x: "x", y: "y", series: "seriesId" },
    dataSets: {
      displaySet: { conditionIds: [...input.seriesIds], timePointIds: [] },
      analysisSet: { conditionIds: [...input.seriesIds], timePointIds: [] },
      comparisonSet: [],
      annotationSet: [],
    },
    summary: { center: "none", interval: "none" },
    appearance: {
      palette: input.palette ? [...input.palette] : ["#245c8a", "#c26532", "#3e7c67"],
      pointSize: 5,
      opacity: 0.9,
      showRawPoints: true,
      showPairedLines: false,
    },
    axes: {
      yStartAtZero: true,
      xScale: "linear",
      yScale: "linear",
      xLabel: input.xLabel,
      yLabel: input.yLabel,
    },
  });
}

export function createNonlinearFitGraphModel(
  spec: GraphSpec,
  points: readonly NonlinearFitPoint[],
  result: NonlinearFitResult,
): NonlinearFitGraphModel {
  if (spec.type !== "nonlinear_xy" || !result.nonlinearFit) {
    throw new Error("Nonlinear XY Graph requires an authoritative D17 result");
  }
  const fitBySeries = new Map(result.nonlinearFit.series.map((fit) => [fit.seriesId, fit]));
  const seriesIds = [...new Set(points.map(({ seriesId }) => seriesId))];
  const series = seriesIds.map((seriesId) => {
    const fit = fitBySeries.get(seriesId);
    if (!fit) throw new Error(`Missing authoritative fitted curve for series ${seriesId}`);
    const raw = points.filter((point) => point.seriesId === seriesId);
    validateGraphScale(
      raw.map(({ x }) => x),
      spec.axes.xScale ?? "linear",
      "X",
    );
    validateGraphScale(
      [...raw.map(({ y }) => y), ...fit.fittedCurve.map(({ y }) => y)],
      spec.axes.yScale,
      "Y",
    );
    return { seriesId, points: raw, fittedCurve: [...fit.fittedCurve] };
  });
  return { modelId: result.nonlinearFit.modelId, series };
}
