import { forwardRef } from "react";
import type { NonlinearFitGraphModel } from "@lsaa/graph-spec";

const WIDTH = 820;
const HEIGHT = 500;
const MARGIN = { top: 38, right: 34, bottom: 70, left: 82 };
const COLORS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00"];

function linearScale(value: number, min: number, max: number, start: number, end: number) {
  return start + ((value - min) / (max - min || 1)) * (end - start);
}

function ticks(min: number, max: number, count = 5) {
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function label(value: number) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 3 }).format(value);
}

/** Renders only the authoritative fittedCurve preserved in a saved D17 result. */
export const NonlinearFitGraph = forwardRef<
  SVGSVGElement,
  {
    model: NonlinearFitGraphModel;
    xLabel: string;
    yLabel: string;
    seriesLabels?: Readonly<Record<string, string>>;
  }
>(function NonlinearFitGraph({ model, xLabel, yLabel, seriesLabels = {} }, ref) {
  const allX = model.series.flatMap(({ points, fittedCurve }) => [
    ...points.map(({ x }) => x),
    ...fittedCurve.map(({ x }) => x),
  ]);
  const allY = model.series.flatMap(({ points, fittedCurve }) => [
    ...points.map(({ y }) => y),
    ...fittedCurve.map(({ y }) => y),
  ]);
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const yMin = Math.min(0, ...allY);
  const yMax = Math.max(...allY);
  const x = (value: number) => linearScale(value, xMin, xMax, MARGIN.left, WIDTH - MARGIN.right);
  const y = (value: number) => linearScale(value, yMin, yMax, HEIGHT - MARGIN.bottom, MARGIN.top);

  return (
    <svg
      ref={ref}
      role="img"
      aria-label="非線形フィットGraph"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      data-fit-model={model.modelId}
    >
      {ticks(yMin, yMax).map((value) => (
        <g key={`y.${value}`}>
          <line
            x1={MARGIN.left}
            y1={y(value)}
            x2={WIDTH - MARGIN.right}
            y2={y(value)}
            stroke="#d8e0e8"
          />
          <text x={MARGIN.left - 10} y={y(value) + 5} textAnchor="end" fontSize="13">
            {label(value)}
          </text>
        </g>
      ))}
      {ticks(xMin, xMax).map((value) => (
        <g key={`x.${value}`}>
          <line
            x1={x(value)}
            y1={HEIGHT - MARGIN.bottom}
            x2={x(value)}
            y2={HEIGHT - MARGIN.bottom + 6}
            stroke="#111"
          />
          <text x={x(value)} y={HEIGHT - MARGIN.bottom + 24} textAnchor="middle" fontSize="13">
            {label(value)}
          </text>
        </g>
      ))}
      <line
        x1={MARGIN.left}
        y1={MARGIN.top}
        x2={MARGIN.left}
        y2={HEIGHT - MARGIN.bottom}
        stroke="#111"
        strokeWidth="1.4"
      />
      <line
        x1={MARGIN.left}
        y1={HEIGHT - MARGIN.bottom}
        x2={WIDTH - MARGIN.right}
        y2={HEIGHT - MARGIN.bottom}
        stroke="#111"
        strokeWidth="1.4"
      />
      {model.series.map((series, index) => {
        const color = COLORS[index % COLORS.length]!;
        const curve = series.fittedCurve
          .map((point, pointIndex) => `${pointIndex ? "L" : "M"} ${x(point.x)} ${y(point.y)}`)
          .join(" ");
        return (
          <g key={series.seriesId} data-fit-series={series.seriesId}>
            <path
              d={curve}
              fill="none"
              stroke={color}
              strokeWidth="3"
              data-graph-layer="authoritative-fitted-curve"
            />
            {series.points.map((point) => (
              <circle
                key={point.observationId}
                cx={x(point.x)}
                cy={y(point.y)}
                r="5"
                fill="#fff"
                stroke={color}
                strokeWidth="2"
                data-graph-layer="raw-observation"
              >
                <title>
                  {seriesLabels[series.seriesId] ?? series.seriesId}: {point.x}, {point.y}
                </title>
              </circle>
            ))}
            <line
              x1={WIDTH - MARGIN.right - 150}
              y1={MARGIN.top + 12 + index * 24}
              x2={WIDTH - MARGIN.right - 124}
              y2={MARGIN.top + 12 + index * 24}
              stroke={color}
              strokeWidth="3"
            />
            <circle
              cx={WIDTH - MARGIN.right - 137}
              cy={MARGIN.top + 12 + index * 24}
              r="4"
              fill="#fff"
              stroke={color}
              strokeWidth="2"
            />
            <text x={WIDTH - MARGIN.right - 116} y={MARGIN.top + 17 + index * 24} fontSize="13">
              {seriesLabels[series.seriesId] ?? series.seriesId}
            </text>
          </g>
        );
      })}
      <text x={(MARGIN.left + WIDTH - MARGIN.right) / 2} y={HEIGHT - 18} textAnchor="middle">
        {xLabel}
      </text>
      <text x="22" y={HEIGHT / 2} transform={`rotate(-90 22 ${HEIGHT / 2})`} textAnchor="middle">
        {yLabel}
      </text>
      <text x={MARGIN.left} y="22" fontSize="12" fill="#536171">
        observed points + saved {model.modelId} fit
      </text>
    </svg>
  );
});
