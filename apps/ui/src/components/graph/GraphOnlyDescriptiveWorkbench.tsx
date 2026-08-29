import { useMemo, useRef, useState } from "react";

import type { ParsedAdaptiveInput } from "@lsaa/adaptive-input";

import { GraphExportActions, type GraphExportFeedback } from "./GraphExportActions";
import { GraphWorkspaceFrame } from "./GraphWorkspaceFrame";

export type GraphOnlyPresentation = Readonly<{
  title: string;
  xLabel: string | null;
  yLabel: string | null;
  pointSize: number;
  opacity: number;
  palette: readonly string[];
  yStartAtZero: boolean;
  seriesLabels: Readonly<Record<string, string>>;
}>;

export const GRAPH_ONLY_DEFAULT_PALETTE = [
  "#176f63",
  "#d27b2c",
  "#5877a9",
  "#9b4d8f",
  "#6f8f3d",
] as const;

const GRAPH_ONLY_PALETTES = {
  standard: GRAPH_ONLY_DEFAULT_PALETTE,
  blueOrange: ["#2f6690", "#f28e2b", "#59a14f", "#b07aa1", "#e15759"],
  grayscale: ["#161616", "#555555", "#888888", "#b4b4b4", "#d6d6d6"],
} as const;

type ColumnIndex = number | "";

type GraphPoint = Readonly<{
  rowIndex: number;
  xRaw: string;
  xNumeric: number | null;
  y: number;
  series: string;
}>;

function numericValue(raw: string | undefined): number | null {
  const value = raw?.trim() ?? "";
  if (!value || ["NA", "N/A", "—"].includes(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function graphPoints(
  parsed: ParsedAdaptiveInput,
  xColumn: number,
  yColumn: number,
  seriesColumn: ColumnIndex,
): readonly GraphPoint[] {
  return parsed.rows.flatMap((row, rowIndex) => {
    const y = numericValue(row[yColumn]);
    if (y === null) return [];
    const xRaw = row[xColumn]?.trim() || `行 ${rowIndex + 2}`;
    const series = seriesColumn === "" ? "" : row[seriesColumn]?.trim() || "（空欄）";
    return [{ rowIndex, xRaw, xNumeric: numericValue(xRaw), y, series }];
  });
}

export function graphOnlyUsesNumericXAxis(
  parsed: ParsedAdaptiveInput,
  xColumn: number,
  yColumn: number,
  seriesColumn: ColumnIndex,
): boolean {
  const points = graphPoints(parsed, xColumn, yColumn, seriesColumn);
  return points.length > 0 && points.every(({ xNumeric }) => xNumeric !== null);
}

export function graphOnlySeriesKeys(
  parsed: ParsedAdaptiveInput,
  xColumn: number,
  yColumn: number,
  seriesColumn: ColumnIndex,
): readonly string[] {
  const keys: string[] = [];
  graphPoints(parsed, xColumn, yColumn, seriesColumn).forEach(({ series }) => {
    if (series && !keys.includes(series)) keys.push(series);
  });
  return keys;
}

function extent(values: readonly number[], includeZero = false): readonly [number, number] {
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  if (includeZero) {
    minimum = Math.min(0, minimum);
    maximum = Math.max(0, maximum);
  }
  if (minimum === maximum) {
    if (includeZero && minimum === 0) return [0, 1];
    const padding = Math.abs(minimum) * 0.08 || 1;
    return [minimum - padding, maximum + padding];
  }
  const padding = (maximum - minimum) * 0.06;
  if (includeZero && minimum === 0) return [0, maximum + padding];
  if (includeZero && maximum === 0) return [minimum - padding, 0];
  return [minimum - padding, maximum + padding];
}

function ticks(minimum: number, maximum: number, count = 5): readonly number[] {
  return Array.from(
    { length: count },
    (_, index) => minimum + ((maximum - minimum) * index) / (count - 1),
  );
}

function formatTick(value: number): string {
  const absolute = Math.abs(value);
  if ((absolute > 0 && absolute < 0.001) || absolute >= 10000) return value.toExponential(1);
  return Number(value.toPrecision(4)).toString();
}

function paletteName(palette: readonly string[]): keyof typeof GRAPH_ONLY_PALETTES {
  const match = Object.entries(GRAPH_ONLY_PALETTES).find(
    ([, candidate]) => JSON.stringify(candidate) === JSON.stringify(palette),
  );
  return (match?.[0] as keyof typeof GRAPH_ONLY_PALETTES | undefined) ?? "standard";
}

export function GraphOnlyDescriptiveWorkbench({
  parsed,
  xColumn,
  yColumn,
  seriesColumn,
  presentation,
  onPresentationChange,
}: Readonly<{
  parsed: ParsedAdaptiveInput;
  xColumn: number;
  yColumn: number;
  seriesColumn: ColumnIndex;
  presentation: GraphOnlyPresentation;
  onPresentationChange: (presentation: GraphOnlyPresentation) => void;
}>) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [exportFeedback, setExportFeedback] = useState<GraphExportFeedback | null>(null);
  const points = useMemo(
    () => graphPoints(parsed, xColumn, yColumn, seriesColumn),
    [parsed, seriesColumn, xColumn, yColumn],
  );
  if (!points.length) return null;

  const numericXAxis = points.every(({ xNumeric }) => xNumeric !== null);
  const seriesKeys = graphOnlySeriesKeys(parsed, xColumn, yColumn, seriesColumn);
  const xLabel = presentation.xLabel ?? parsed.headers[xColumn] ?? "X";
  const yLabel = presentation.yLabel ?? parsed.headers[yColumn] ?? "測定値";
  const width = 840;
  const height = 470;
  const left = 76;
  const right = seriesKeys.length ? 170 : 32;
  const top = 62;
  const bottom = 88;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const [minimumY, maximumY] = extent(
    points.map(({ y }) => y),
    presentation.yStartAtZero,
  );
  const yPosition = (value: number) =>
    top + ((maximumY - value) / (maximumY - minimumY)) * plotHeight;
  const categories: string[] = [];
  points.forEach(({ xRaw }) => {
    if (!categories.includes(xRaw)) categories.push(xRaw);
  });
  const numericXValues = points.map(({ xNumeric }) => xNumeric as number);
  const [minimumX, maximumX] = numericXAxis ? extent(numericXValues) : [0, 1];
  const xPosition = (point: GraphPoint) => {
    if (numericXAxis) {
      return left + (((point.xNumeric as number) - minimumX) / (maximumX - minimumX)) * plotWidth;
    }
    const categoryIndex = categories.indexOf(point.xRaw);
    return (
      left +
      (categories.length <= 1
        ? plotWidth / 2
        : (categoryIndex / (categories.length - 1)) * plotWidth)
    );
  };
  const resolvedTitle = presentation.title.trim() || "表から作成したGraph";

  const canvas = (
    <figure className="graph-only__figure">
      <svg
        ref={svgRef}
        className="graph-only__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        data-x-scale={numericXAxis ? "numeric" : "categorical"}
        aria-label={`${yLabel}を${xLabel}ごとに表示したGraph`}
      >
        <text className="experiment-graph-axis-title" x={width / 2} y={28} textAnchor="middle">
          {resolvedTitle}
        </text>
        <line
          className="experiment-graph-axis-line"
          x1={left}
          x2={left}
          y1={top}
          y2={top + plotHeight}
        />
        <line
          className="experiment-graph-axis-line"
          x1={left}
          x2={left + plotWidth}
          y1={top + plotHeight}
          y2={top + plotHeight}
        />
        {ticks(minimumY, maximumY).map((tick) => {
          const y = yPosition(tick);
          return (
            <g key={`y.${tick}`}>
              <line className="experiment-graph-tick" x1={left - 6} x2={left} y1={y} y2={y} />
              <text
                className="experiment-graph-axis-label"
                x={left - 10}
                y={y + 4}
                textAnchor="end"
              >
                {formatTick(tick)}
              </text>
            </g>
          );
        })}
        {numericXAxis
          ? ticks(minimumX, maximumX).map((tick) => {
              const x = left + ((tick - minimumX) / (maximumX - minimumX)) * plotWidth;
              return (
                <g key={`x.${tick}`}>
                  <line
                    className="experiment-graph-tick"
                    x1={x}
                    x2={x}
                    y1={top + plotHeight}
                    y2={top + plotHeight + 6}
                  />
                  <text
                    className="experiment-graph-axis-label"
                    x={x}
                    y={top + plotHeight + 24}
                    textAnchor="middle"
                  >
                    {formatTick(tick)}
                  </text>
                </g>
              );
            })
          : categories.map((category) => {
              const x = xPosition({
                rowIndex: -1,
                xRaw: category,
                xNumeric: null,
                y: 0,
                series: "",
              });
              return (
                <g key={category}>
                  <line
                    className="experiment-graph-tick"
                    x1={x}
                    x2={x}
                    y1={top + plotHeight}
                    y2={top + plotHeight + 6}
                  />
                  <text
                    className="experiment-graph-axis-label"
                    x={x}
                    y={top + plotHeight + 22}
                    textAnchor="end"
                    transform={`rotate(-28 ${x} ${top + plotHeight + 22})`}
                  >
                    {category}
                  </text>
                </g>
              );
            })}
        {points.map((point) => {
          const seriesIndex = Math.max(0, seriesKeys.indexOf(point.series));
          const fill = presentation.palette[seriesIndex % presentation.palette.length]!;
          const categoricalSeriesOffset =
            !numericXAxis && seriesKeys.length > 1
              ? (seriesIndex - (seriesKeys.length - 1) / 2) * 10
              : 0;
          return (
            <circle
              key={`${point.rowIndex}.${point.xRaw}.${point.y}`}
              className="experiment-graph-point experiment-graph-point--raw"
              data-graph-only-point="true"
              data-source-x={point.xRaw}
              data-source-y={point.y}
              cx={xPosition(point) + categoricalSeriesOffset}
              cy={yPosition(point.y)}
              r={presentation.pointSize}
              fill={fill}
              opacity={presentation.opacity}
            />
          );
        })}
        <text
          className="experiment-graph-axis-title"
          x={left + plotWidth / 2}
          y={height - 12}
          textAnchor="middle"
        >
          {xLabel}
        </text>
        <text
          className="experiment-graph-axis-title"
          x={20}
          y={top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 20 ${top + plotHeight / 2})`}
        >
          {yLabel}
        </text>
        {seriesKeys.length ? (
          <g aria-label="凡例">
            {seriesKeys.map((series, index) => {
              const y = top + index * 26;
              return (
                <g key={series}>
                  <circle
                    cx={left + plotWidth + 30}
                    cy={y}
                    r={Math.min(presentation.pointSize, 6)}
                    fill={presentation.palette[index % presentation.palette.length]}
                  />
                  <text className="experiment-graph-axis-label" x={left + plotWidth + 44} y={y + 4}>
                    {presentation.seriesLabels[series]?.trim() || series}
                  </text>
                </g>
              );
            })}
          </g>
        ) : null}
      </svg>
      <figcaption>
        {numericXAxis
          ? "横軸の数値間隔を保って表示しています。統計的な比較は含みません。"
          : "表のカテゴリを入力順に表示しています。統計的な比較は含みません。"}
      </figcaption>
    </figure>
  );

  const inspector = (
    <div className="graph-workspace-frame__settings">
      <label>
        Graphタイトル
        <input
          aria-label="Graphタイトル"
          value={presentation.title}
          onChange={(event) => onPresentationChange({ ...presentation, title: event.target.value })}
        />
      </label>
      <label>
        横軸の表示名
        <input
          aria-label="横軸の表示名"
          value={xLabel}
          onChange={(event) =>
            onPresentationChange({ ...presentation, xLabel: event.target.value })
          }
        />
      </label>
      <label>
        縦軸の表示名
        <input
          aria-label="縦軸の表示名"
          value={yLabel}
          onChange={(event) =>
            onPresentationChange({ ...presentation, yLabel: event.target.value })
          }
        />
      </label>
      <label>
        点の大きさ <span>{presentation.pointSize}</span>
        <input
          aria-label="点の大きさ"
          type="range"
          min="2"
          max="12"
          step="1"
          value={presentation.pointSize}
          onChange={(event) =>
            onPresentationChange({ ...presentation, pointSize: Number(event.target.value) })
          }
        />
      </label>
      <label>
        点の透明度 <span>{Math.round(presentation.opacity * 100)}%</span>
        <input
          aria-label="点の透明度"
          type="range"
          min="0.2"
          max="1"
          step="0.05"
          value={presentation.opacity}
          onChange={(event) =>
            onPresentationChange({ ...presentation, opacity: Number(event.target.value) })
          }
        />
      </label>
      <label>
        色
        <select
          aria-label="Graphの配色"
          value={paletteName(presentation.palette)}
          onChange={(event) =>
            onPresentationChange({
              ...presentation,
              palette: GRAPH_ONLY_PALETTES[event.target.value as keyof typeof GRAPH_ONLY_PALETTES],
            })
          }
        >
          <option value="standard">標準</option>
          <option value="blueOrange">青・オレンジ</option>
          <option value="grayscale">グレースケール</option>
        </select>
      </label>
      <label className="graph-inspector-checkbox">
        <input
          type="checkbox"
          checked={presentation.yStartAtZero}
          onChange={(event) =>
            onPresentationChange({ ...presentation, yStartAtZero: event.target.checked })
          }
        />
        縦軸を0から始める
      </label>
      {seriesKeys.length ? (
        <fieldset className="graph-only__legend-settings">
          <legend>凡例の表示名</legend>
          {seriesKeys.map((series) => (
            <label key={series}>
              {series}
              <input
                aria-label={`${series}の凡例名`}
                value={presentation.seriesLabels[series] ?? ""}
                placeholder={series}
                onChange={(event) =>
                  onPresentationChange({
                    ...presentation,
                    seriesLabels: {
                      ...presentation.seriesLabels,
                      [series]: event.target.value,
                    },
                  })
                }
              />
            </label>
          ))}
        </fieldset>
      ) : null}
      <p className="graph-only__subtle">
        表示設定だけを変更します。実験構造や統計的なnには変換しません。
      </p>
    </div>
  );

  return (
    <GraphWorkspaceFrame
      title={resolvedTitle}
      actions={
        <GraphExportActions
          svgRef={svgRef}
          fileStem={resolvedTitle}
          onFeedback={setExportFeedback}
        />
      }
      canvas={canvas}
      inspector={inspector}
      feedback={
        exportFeedback ? (
          <p
            className={
              exportFeedback.kind === "success" ? "graph-only__success" : "graph-only__error"
            }
            role="status"
          >
            {exportFeedback.text}
          </p>
        ) : null
      }
    />
  );
}
