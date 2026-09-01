import type { RefObject } from "react";

import {
  categoricalPercentage,
  categoricalTotal,
  continuousSummary,
  experimentCellKey,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type ReadoutDraft,
} from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { GRAPH_PALETTES } from "./graphAppearance";
import { createNiceTicks, createPlotRectangle } from "./graphLayout";
import { formatGraphNumber } from "./graphValueFormatting";

type GraphAppearance = WorkspaceGraphState["appearance"];
type AxisSettings = WorkspaceGraphState["axes"];

export function CompositionGraphSvg({
  draft,
  cells,
  readout,
  conditionIds,
  timePointIds,
  graphType,
  appearance,
  axes,
  svgRef,
}: {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  readout: ReadoutDraft;
  conditionIds: readonly string[];
  timePointIds: readonly string[];
  graphType: "stacked" | "stacked_100" | "category_percentage";
  appearance: GraphAppearance;
  axes: AxisSettings;
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const categories = readout.categories ?? [];
  const timePoints =
    draft.time.points.length > 0
      ? draft.time.points.filter(({ id }) => timePointIds.includes(id))
      : [undefined];
  const groups = draft.conditions
    .filter(({ id }) => conditionIds.includes(id))
    .flatMap((condition) =>
      timePoints.map((timePoint) => {
        const cellsForGroup = draft.experiments.flatMap((experiment) => {
          const cell =
            cells[
              experimentCellKey({
                experimentId: experiment.id,
                conditionId: condition.id,
                readoutId: readout.id,
                timePointId: timePoint?.id,
              })
            ];
          return cell?.kind === "categorical_counts" && categoricalTotal(cell) !== null
            ? [cell]
            : [];
        });
        const values = categories.map((category) => {
          const perExperiment = cellsForGroup.flatMap((cell) => {
            if (graphType === "stacked") {
              const value = cell.counts[category.id];
              return value === null || value === undefined ? [] : [value];
            }
            const value = categoricalPercentage(cell, category.id);
            return value === null ? [] : [value];
          });
          return continuousSummary(perExperiment).mean ?? 0;
        });
        return {
          key: `${condition.id}:${timePoint?.id ?? "none"}`,
          label: timePoint
            ? `${condition.label} · ${timePoint.value} ${draft.time.unit}`
            : condition.label,
          values,
        };
      }),
    );
  const width = Math.max(680, 150 + groups.length * 110);
  const height = 520;
  const margin = { top: 55, right: 190, bottom: 110, left: 88 };
  const plot = createPlotRectangle(width, height, margin);
  const maximum =
    graphType === "stacked"
      ? Math.max(1, ...groups.map(({ values }) => values.reduce((sum, value) => sum + value, 0)))
      : 100;
  const yFor = (value: number) => plot.top + ((maximum - value) / maximum) * plot.height;
  const colors =
    appearance.palette === "single"
      ? GRAPH_PALETTES.colorblind
      : GRAPH_PALETTES[appearance.palette];
  const yTicks = createNiceTicks(0, maximum, 5, null);
  const tickDirection = axes.tickDirection ?? "outside";
  const yTickDelta = tickDirection === "inside" ? 1 : -1;
  return (
    <svg
      ref={svgRef}
      className="experiment-graph-svg"
      width={width}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${readout.label}のカテゴリ構成グラフ`}
      data-graph-type={graphType}
    >
      <title>{readout.label}</title>
      <desc>各カテゴリのcountから実験単位ごとの割合を計算し、条件ごとに要約しています。</desc>
      {yTicks.map((tick) => (
        <g key={tick}>
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
            x={margin.left - 10}
            y={yFor(tick) + 5}
            textAnchor="end"
            style={{ fontSize: appearance.tickFontSize, fill: "#000" }}
          >
            {formatGraphNumber(tick, 1)}
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
      />
      <line
        x1={plot.left}
        x2={plot.right}
        y1={plot.bottom}
        y2={plot.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
      />
      <text
        x="20"
        y={plot.top + plot.height / 2}
        transform={`rotate(-90 20 ${plot.top + plot.height / 2})`}
        textAnchor="middle"
        className="experiment-graph-axis-title"
        style={{ fontSize: appearance.axisTitleFontSize, fill: "#000" }}
      >
        {graphType === "stacked" ? "Count" : "Composition (%)"}
      </text>
      {groups.map((group, groupIndex) => {
        const x = plot.left + 55 + groupIndex * 110;
        if (graphType === "category_percentage") {
          return (
            <g key={group.key}>
              {group.values.map((value, categoryIndex) => (
                <circle
                  key={categories[categoryIndex]?.id}
                  cx={x + (categoryIndex - (categories.length - 1) / 2) * 12}
                  cy={yFor(value)}
                  r={appearance.pointSize}
                  fill={colors[categoryIndex % colors.length]}
                  data-graph-layer="category-percentage"
                />
              ))}
              <text
                x={x}
                y={plot.bottom + 28}
                textAnchor="middle"
                style={{ fontSize: appearance.hierarchyFontSize, fill: "#000" }}
              >
                {group.label}
              </text>
            </g>
          );
        }
        let cumulative = 0;
        return (
          <g key={group.key}>
            {group.values.map((value, categoryIndex) => {
              const top = cumulative + value;
              const rectangle = (
                <rect
                  key={categories[categoryIndex]?.id}
                  x={x - 24}
                  y={yFor(top)}
                  width="48"
                  height={Math.max(0, yFor(cumulative) - yFor(top))}
                  fill={colors[categoryIndex % colors.length]}
                  data-graph-layer="category-stack"
                />
              );
              cumulative = top;
              return rectangle;
            })}
            <text
              x={x}
              y={plot.bottom + 28}
              textAnchor="middle"
              style={{ fontSize: appearance.hierarchyFontSize, fill: "#000" }}
            >
              {group.label}
            </text>
          </g>
        );
      })}
      {categories.map((category, index) => (
        <g
          key={category.id}
          transform={`translate(${plot.right + 32} ${plot.top + index * 30})`}
        >
          <rect width="14" height="14" fill={colors[index % colors.length]} />
          <text x="22" y="12" style={{ fontSize: appearance.legendFontSize, fill: "#000" }}>
            {category.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

