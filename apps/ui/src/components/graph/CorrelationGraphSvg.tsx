import type { RefObject } from "react";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";

import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { formatExactPValue } from "../../app/statisticalFormat";
import { GRAPH_PALETTES } from "./graphAppearance";
import type { GraphSeries } from "./experimentGraphDataExport";
import { createNiceTicks, createPlotRectangle } from "./graphLayout";
import { formatGraphNumber, graphSignificanceSymbol } from "./graphValueFormatting";

type GraphAppearance = WorkspaceGraphState["appearance"];
type AxisSettings = WorkspaceGraphState["axes"];
type StatisticsAnnotation = NonNullable<WorkspaceGraphState["statisticsAnnotation"]>;

export function CorrelationGraphSvg({
  series,
  appearance,
  axes,
  svgRef,
  analysisResult,
  statisticsAnnotation,
  onInspect,
}: {
  series: readonly GraphSeries[];
  appearance: GraphAppearance;
  axes: AxisSettings;
  svgRef: RefObject<SVGSVGElement | null>;
  analysisResult: AnalysisEngineResult | null;
  statisticsAnnotation: StatisticsAnnotation;
  onInspect: (target: "x-axis" | "y-axis") => void;
}) {
  const [xSeries, ySeries] = series;
  const yByExperiment = new Map(
    ySeries?.experimentPoints.map((point) => [point.experimentId, point]) ?? [],
  );
  const pairs =
    xSeries?.experimentPoints.flatMap((xPoint) => {
      const yPoint = yByExperiment.get(xPoint.experimentId);
      return yPoint ? [{ id: xPoint.experimentId, x: xPoint.value, y: yPoint.value }] : [];
    }) ?? [];
  const width = 720;
  const height = 520;
  const margin = { top: 44, right: 44, bottom: 88, left: 94 };
  const xValues = pairs.map(({ x }) => x);
  const yValues = pairs.map(({ y }) => y);
  const paddedDomain = (values: readonly number[]) => {
    const minimum = values.length > 0 ? Math.min(...values) : 0;
    const maximum = values.length > 0 ? Math.max(...values) : 1;
    const range = Math.max(maximum - minimum, Math.abs(maximum) * 0.08, 1);
    return [minimum - range * 0.1, maximum + range * 0.1] as const;
  };
  const [xMin, xMax] = paddedDomain(xValues);
  const automaticY = paddedDomain(yValues);
  const manualY =
    axes.yRangeMode === "manual" &&
    axes.yMin !== null &&
    axes.yMax !== null &&
    axes.yMin < axes.yMax;
  const yMin = manualY ? axes.yMin! : automaticY[0];
  const yMax = manualY ? axes.yMax! : automaticY[1];
  const plot = createPlotRectangle(width, height, margin);
  const xFor = (value: number) => plot.left + ((value - xMin) / (xMax - xMin)) * plot.width;
  const yFor = (value: number) => plot.top + ((yMax - value) / (yMax - yMin)) * plot.height;
  const xTicks = createNiceTicks(xMin, xMax, 5, null);
  const yTicks = createNiceTicks(
    yMin,
    yMax,
    5,
    axes.yTickMode === "manual" ? axes.yTickInterval : null,
  );
  const xLabel = xSeries?.conditionLabel ?? "X";
  const yLabel = axes.yTitle.trim() || ySeries?.conditionLabel || "Y";
  const annotationTest = analysisResult?.tests[statisticsAnnotation.testIndex];
  const annotationValue = annotationTest
    ? (annotationTest.adjustedPValue ?? annotationTest.pValue)
    : null;
  const tickDirection = axes.tickDirection ?? "outside";
  const xTickDelta = tickDirection === "inside" ? -1 : 1;
  const yTickDelta = tickDirection === "inside" ? 1 : -1;
  return (
    <svg
      ref={svgRef}
      className="experiment-graph-svg"
      width={width}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${xLabel}と${yLabel}の散布図`}
      data-graph-type="scatter"
      style={{
        fontFamily:
          appearance.fontFamily === "arial"
            ? "Arial, sans-serif"
            : appearance.fontFamily === "helvetica"
              ? "Helvetica, Arial, sans-serif"
              : "system-ui, sans-serif",
      }}
    >
      <title>{`${xLabel} vs ${yLabel}`}</title>
      <desc>各点は同じ実験単位から得たXとYの完全な1組です。</desc>
      {xTicks.map((tick) => (
        <g key={`x-${tick}`}>
          <line
            x1={xFor(tick)}
            x2={xFor(tick)}
            y1={plot.bottom}
            y2={plot.bottom + xTickDelta * 5}
            className="experiment-graph-tick"
            data-axis-tick="x"
            data-tick-direction={tickDirection}
          />
          <text
            x={xFor(tick)}
            y={plot.bottom + 25}
            textAnchor="middle"
            style={{ fontSize: appearance.tickFontSize, fill: "#000" }}
          >
            {formatGraphNumber(tick, 2)}
          </text>
        </g>
      ))}
      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line
            x1={plot.left}
            x2={plot.left + yTickDelta * 5}
            y1={yFor(tick)}
            y2={yFor(tick)}
            className="experiment-graph-tick"
            data-axis-tick="y"
            data-tick-direction={tickDirection}
          />
          <text
            x={plot.left - 10}
            y={yFor(tick) + 5}
            textAnchor="end"
            style={{ fontSize: appearance.tickFontSize, fill: "#000" }}
          >
            {formatGraphNumber(tick, 2)}
          </text>
        </g>
      ))}
      <line
        x1={plot.left}
        x2={plot.left}
        y1={plot.top}
        y2={plot.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
        onDoubleClick={() => onInspect("y-axis")}
      />
      <line
        x1={plot.left}
        x2={plot.right}
        y1={plot.bottom}
        y2={plot.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
        onDoubleClick={() => onInspect("x-axis")}
      />
      <text
        x={plot.left + plot.width / 2}
        y={height - 22}
        textAnchor="middle"
        className="experiment-graph-axis-title"
        style={{ fontSize: appearance.axisTitleFontSize, fill: "#000" }}
      >
        {xLabel}
      </text>
      <text
        x={22}
        y={plot.top + plot.height / 2}
        textAnchor="middle"
        transform={`rotate(-90 22 ${plot.top + plot.height / 2})`}
        className="experiment-graph-axis-title"
        style={{ fontSize: appearance.axisTitleFontSize, fill: "#000" }}
      >
        {yLabel}
      </text>
      {pairs.map((pair) => (
        <circle
          key={pair.id}
          cx={xFor(pair.x)}
          cy={yFor(pair.y)}
          r={appearance.pointSize}
          fill={appearance.seriesColors["scatter"] ?? GRAPH_PALETTES[appearance.palette][0]}
          className="experiment-graph-point"
          data-experimental-unit={pair.id}
        />
      ))}
      {statisticsAnnotation.mode !== "hidden" && annotationValue !== null ? (
        <text
          x={plot.right}
          y={plot.top}
          textAnchor="end"
          className="experiment-graph-stat-label"
          data-graph-layer="statistics-annotation"
        >
          {statisticsAnnotation.mode === "symbol"
            ? graphSignificanceSymbol(annotationValue)
            : `p = ${formatExactPValue(annotationValue)}`}
        </text>
      ) : null}
    </svg>
  );
}
