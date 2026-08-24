import { z } from "zod";
import { GraphSpecSchema, type GraphSpec } from "./index";

const ValuesSchema = z.array(z.number().finite()).min(1);

export type HistogramModel = Readonly<{
  values: number[];
  binCount: number;
  binWidth: number;
  bins: Array<{ lower: number; upper: number; count: number }>;
}>;

export type EcdfModel = Readonly<{
  values: number[];
  points: Array<{ x: number; cumulativeFraction: number }>;
}>;

/** Deterministic Freedman-Diaconis binning, falling back to sqrt(n) for tied data. */
export function createHistogramModel(
  input: readonly number[],
  requestedBinCount?: number,
): HistogramModel {
  const values = [...ValuesSchema.parse(input)].sort((a, b) => a - b);
  const min = values[0]!;
  const max = values.at(-1)!;
  if (min === max)
    return {
      values,
      binCount: 1,
      binWidth: 1,
      bins: [{ lower: min - 0.5, upper: max + 0.5, count: values.length }],
    };
  const quantile = (p: number) => {
    const position = (values.length - 1) * p;
    const lower = Math.floor(position);
    const fraction = position - lower;
    return (
      values[lower]! + fraction * (values[Math.min(lower + 1, values.length - 1)]! - values[lower]!)
    );
  };
  const iqr = quantile(0.75) - quantile(0.25);
  const fdWidth = (2 * iqr) / Math.cbrt(values.length);
  const fallback = Math.ceil(Math.sqrt(values.length));
  const binCount =
    requestedBinCount ?? (fdWidth > 0 ? Math.max(1, Math.ceil((max - min) / fdWidth)) : fallback);
  if (!Number.isInteger(binCount) || binCount < 1 || binCount > 200)
    throw new Error("Histogram bin count must be an integer from 1 to 200");
  const binWidth = (max - min) / binCount;
  const counts = Array<number>(binCount).fill(0);
  for (const value of values)
    counts[Math.min(binCount - 1, Math.floor((value - min) / binWidth))] += 1;
  return {
    values,
    binCount,
    binWidth,
    bins: counts.map((count, index) => ({
      lower: min + index * binWidth,
      upper: min + (index + 1) * binWidth,
      count,
    })),
  };
}

export function createEcdfModel(input: readonly number[]): EcdfModel {
  const values = [...ValuesSchema.parse(input)].sort((a, b) => a - b);
  return {
    values,
    points: values.map((x, index) => ({ x, cumulativeFraction: (index + 1) / values.length })),
  };
}

export function createDistributionGraphSpec(
  input: Readonly<{
    graphId: string;
    type: "histogram" | "ecdf";
    dataSource: GraphSpec["dataSource"];
    xLabel: string;
    xScale?: "linear" | "log10";
    binCount?: number | null;
    binWidth?: number | null;
  }>,
): GraphSpec {
  return GraphSpecSchema.parse({
    id: input.graphId,
    version: "0.1.0",
    type: input.type,
    dataSource: input.dataSource,
    analysisResultId: null,
    mappings: { x: "value", y: input.type === "histogram" ? "count" : "cumulativeFraction" },
    summary: { center: "none", interval: "none" },
    appearance: {
      palette: ["#4477AA"],
      pointSize: 4,
      opacity: 0.9,
      showRawPoints: false,
      showPairedLines: false,
    },
    axes: {
      yStartAtZero: true,
      xScale: input.xScale ?? "linear",
      yScale: "linear",
      xLabel: input.xLabel,
      yLabel: input.type === "histogram" ? "Count" : "Cumulative fraction",
    },
    distribution: { binCount: input.binCount ?? null, binWidth: input.binWidth ?? null },
  });
}

export function validateGraphScale(
  values: readonly number[],
  scale: "linear" | "log10",
  axis: "X" | "Y",
): void {
  if (scale === "log10" && values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error(
      `${axis} log10 axis requires every displayed value to be finite and greater than zero; incompatible points were not removed`,
    );
  }
}
