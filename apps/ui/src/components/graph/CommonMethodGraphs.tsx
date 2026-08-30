import { forwardRef } from "react";
import type { EcdfModel, HistogramModel, RegressionGraphModel } from "@lsaa/graph-spec";

const W = 760,
  H = 440,
  L = 72,
  R = 28,
  T = 28,
  B = 62;
const scale = (
  value: number,
  min: number,
  max: number,
  start: number,
  end: number,
  mode: "linear" | "log10" = "linear",
) => {
  const transform = mode === "log10" ? Math.log10 : (x: number) => x;
  const lo = transform(min),
    hi = transform(max);
  return start + ((transform(value) - lo) / (hi - lo || 1)) * (end - start);
};

export const DistributionGraph = forwardRef<
  SVGSVGElement,
  {
    model: HistogramModel | EcdfModel;
    type: "histogram" | "ecdf";
    xLabel: string;
    xScale?: "linear" | "log10";
  }
>(function DistributionGraph({ model, type, xLabel, xScale = "linear" }, ref) {
  const values = model.values,
    min = Math.min(...values),
    max = Math.max(...values);
  const x = (value: number) => scale(value, min, max, L, W - R, xScale);
  const histogram = type === "histogram" ? (model as HistogramModel) : null;
  const yMax = histogram ? Math.max(...histogram.bins.map(({ count }) => count), 1) : 1;
  const y = (value: number) => scale(value, 0, yMax, H - B, T);
  const path =
    type === "ecdf"
      ? (model as EcdfModel).points.reduce(
          (d, point, index, points) =>
            `${d}${index === 0 ? `M ${x(point.x)} ${y(0)} V ${y(point.cumulativeFraction)}` : ` H ${x(point.x)} V ${y(point.cumulativeFraction)}`}${index === points.length - 1 ? ` H ${W - R}` : ""}`,
          "",
        )
      : "";
  return (
    <svg
      ref={ref}
      role="img"
      aria-label={type === "histogram" ? "Histogram" : "Empirical cumulative distribution"}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
    >
      <line x1={L} y1={T} x2={L} y2={H - B} stroke="#111" />
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#111" />
      {histogram?.bins.map((bin, index) => (
        <rect
          key={index}
          x={x(bin.lower)}
          y={y(bin.count)}
          width={Math.max(1, x(bin.upper) - x(bin.lower))}
          height={H - B - y(bin.count)}
          fill="#4477AA"
          opacity="0.8"
          stroke="white"
        />
      ))}
      {type === "ecdf" ? <path d={path} fill="none" stroke="#4477AA" strokeWidth="3" /> : null}
      <text x={(L + W - R) / 2} y={H - 18} textAnchor="middle">
        {xLabel}
        {xScale === "log10" ? " (log10 axis)" : ""}
      </text>
      <text x={18} y={H / 2} transform={`rotate(-90 18 ${H / 2})`} textAnchor="middle">
        {type === "histogram" ? "Count" : "Cumulative fraction"}
      </text>
      {histogram ? (
        <text x={W - R} y={T + 14} textAnchor="end" fontSize="12">
          bins={histogram.binCount}; width={histogram.binWidth.toPrecision(4)}
        </text>
      ) : null}
    </svg>
  );
});

export const RegressionGraph = forwardRef<
  SVGSVGElement,
  {
    model: RegressionGraphModel;
    xLabel: string;
    yLabel: string;
    xScale?: "linear" | "log10";
    yScale?: "linear" | "log10";
  }
>(function RegressionGraph({ model, xLabel, yLabel, xScale = "linear", yScale = "linear" }, ref) {
  const xs = model.points.map(({ x }) => x),
    ys = [
      ...model.points.map(({ y }) => y),
      ...model.line.flatMap(({ lower, upper, y }) => [lower ?? y, upper ?? y]),
    ];
  const x = (v: number) => scale(v, Math.min(...xs), Math.max(...xs), L, W - R, xScale),
    y = (v: number) => scale(v, Math.min(...ys), Math.max(...ys), H - B, T, yScale);
  const line = model.line.map((p, i) => `${i ? "L" : "M"} ${x(p.x)} ${y(p.y)}`).join(" ");
  const band = model.showConfidenceBand
    ? `${model.line.map((p, i) => `${i ? "L" : "M"} ${x(p.x)} ${y(p.upper ?? p.y)}`).join(" ")} ${[
        ...model.line,
      ]
        .reverse()
        .map((p) => `L ${x(p.x)} ${y(p.lower ?? p.y)}`)
        .join(" ")} Z`
    : "";
  return (
    <svg
      ref={ref}
      role="img"
      aria-label="Simple linear regression Graph"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
    >
      <line x1={L} y1={T} x2={L} y2={H - B} stroke="#111" />
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#111" />
      {band ? <path d={band} fill="#4477AA" opacity="0.14" /> : null}
      <path d={line} fill="none" stroke="#CC6677" strokeWidth="3" />
      {model.points.map((p) => (
        <circle key={p.experimentalUnitId} cx={x(p.x)} cy={y(p.y)} r="5" fill="#4477AA">
          <title>
            {p.experimentalUnitId}: {p.x}, {p.y}
          </title>
        </circle>
      ))}
      <text x={(L + W - R) / 2} y={H - 18} textAnchor="middle">
        {xLabel}
        {xScale === "log10" ? " (log10 axis)" : ""}
      </text>
      <text x={18} y={H / 2} transform={`rotate(-90 18 ${H / 2})`} textAnchor="middle">
        {yLabel}
        {yScale === "log10" ? " (log10 axis)" : ""}
      </text>
    </svg>
  );
});

export const CountGraph = forwardRef<
  SVGSVGElement,
  {
    rowLabels: string[];
    columnLabels: string[];
    counts: number[][];
    display: "count" | "fraction" | "stacked";
  }
>(function CountGraph({ rowLabels, columnLabels, counts, display }, ref) {
  const totals = counts.map((row) => row.reduce((a, b) => a + b, 0)),
    max = display === "count" ? Math.max(...totals, 1) : 1,
    barWidth = Math.min(100, (W - L - R) / (rowLabels.length * 1.5));
  return (
    <svg
      ref={ref}
      role="img"
      aria-label="Categorical count Graph"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
    >
      <line x1={L} y1={T} x2={L} y2={H - B} stroke="#111" />
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#111" />
      {counts.map((row, i) => {
        const cx = L + ((i + 0.5) * (W - L - R)) / rowLabels.length;
        let cumulative = 0;
        return (
          <g key={rowLabels[i]}>
            {row.map((count, j) => {
              const value = display === "count" ? count : count / totals[i]!;
              const top = scale(cumulative + value, 0, max, H - B, T);
              const bottom = scale(cumulative, 0, max, H - B, T);
              cumulative += value;
              return (
                <rect
                  key={columnLabels[j]}
                  x={cx - barWidth / 2}
                  y={top}
                  width={barWidth}
                  height={bottom - top}
                  fill={["#4477AA", "#CC6677", "#228833", "#CCBB44"][j % 4]}
                >
                  <title>
                    {columnLabels[j]}: {count} / {totals[i]}
                  </title>
                </rect>
              );
            })}
            <text x={cx} y={H - B + 22} textAnchor="middle">
              {rowLabels[i]}
            </text>
          </g>
        );
      })}
      <text x={18} y={H / 2} transform={`rotate(-90 18 ${H / 2})`} textAnchor="middle">
        {display === "count" ? "Count" : "Fraction"}
      </text>
      {columnLabels.map((label, i) => (
        <g key={label}>
          <rect
            x={W - 180}
            y={T + i * 22}
            width="14"
            height="14"
            fill={["#4477AA", "#CC6677", "#228833", "#CCBB44"][i % 4]}
          />
          <text x={W - 160} y={T + 12 + i * 22} fontSize="12">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
});
