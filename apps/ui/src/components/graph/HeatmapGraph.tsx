import { forwardRef } from "react";
import type { HeatmapModel } from "@lsaa/graph-spec";

export type HeatmapGraphProps = Readonly<{
  model: HeatmapModel;
  min?: number | null;
  max?: number | null;
  missingColor?: string;
  showCellValues?: boolean;
}>;

function heatColor(value: number, min: number, max: number): string {
  const t = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const red = Math.round(245 - t * 188);
  const green = Math.round(248 - Math.abs(t - 0.5) * 120);
  const blue = Math.round(255 - (1 - t) * 120);
  return `rgb(${red}, ${green}, ${blue})`;
}

/** Export-ready SVG heatmap. Long labels expand margins instead of being clipped. */
export const HeatmapGraph = forwardRef<SVGSVGElement, HeatmapGraphProps>(function HeatmapGraph(
  {
    model,
    min = model.range?.min ?? null,
    max = model.range?.max ?? null,
    missingColor = "#d1d5db",
    showCellValues = false,
  },
  ref,
) {
  const cellWidth = 54;
  const cellHeight = 34;
  const left = Math.max(
    150,
    Math.min(360, Math.max(...model.raw.rowLabels.map((label) => label.length)) * 8),
  );
  const top = Math.max(
    90,
    Math.min(240, Math.max(...model.raw.columnLabels.map((label) => label.length)) * 7),
  );
  const width = left + model.raw.columnIds.length * cellWidth + 40;
  const height = top + model.raw.rowIds.length * cellHeight + 60;
  return (
    <svg
      ref={ref}
      role="img"
      aria-label="Heatmap"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
    >
      <title>
        Heatmap ({model.transform.kind}, version {model.transform.version})
      </title>
      {model.raw.columnLabels.map((label, column) => (
        <text
          key={model.raw.columnIds[column]}
          x={left + column * cellWidth + cellWidth / 2}
          y={top - 10}
          fontSize="13"
          textAnchor="start"
          transform={`rotate(-45 ${left + column * cellWidth + cellWidth / 2} ${top - 10})`}
        >
          {label}
        </text>
      ))}
      {model.raw.rowLabels.map((label, row) => (
        <g key={model.raw.rowIds[row]}>
          <text
            x={left - 8}
            y={top + row * cellHeight + cellHeight / 2 + 5}
            fontSize="13"
            textAnchor="end"
          >
            {label}
          </text>
          {model.values[row]!.map((value, column) => (
            <g key={model.raw.columnIds[column]}>
              <rect
                data-missing={value === null ? "true" : "false"}
                x={left + column * cellWidth}
                y={top + row * cellHeight}
                width={cellWidth}
                height={cellHeight}
                fill={
                  value === null || min === null || max === null
                    ? missingColor
                    : heatColor(value, min, max)
                }
                stroke="#ffffff"
              />
              {showCellValues && value !== null ? (
                <text
                  x={left + column * cellWidth + cellWidth / 2}
                  y={top + row * cellHeight + cellHeight / 2 + 5}
                  fontSize="11"
                  textAnchor="middle"
                >
                  {Number(value.toFixed(3))}
                </text>
              ) : null}
            </g>
          ))}
        </g>
      ))}
      <text x={left} y={height - 18} fontSize="12">
        Transform: {model.transform.kind} ({model.transform.version}); missing values shown as{" "}
        {missingColor}
      </text>
    </svg>
  );
});
