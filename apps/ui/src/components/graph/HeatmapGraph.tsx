import { forwardRef, useId } from "react";
import type { HeatmapModel } from "@lsaa/graph-spec";

export type HeatmapGraphProps = Readonly<{
  model: HeatmapModel;
  min?: number | null;
  max?: number | null;
  palette?: readonly string[];
  missingColor?: string;
  showCellValues?: boolean;
}>;

function colorChannels(color: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/iu.exec(color);
  if (!match) return [128, 128, 128];
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function heatColor(value: number, min: number, max: number, palette: readonly string[]): string {
  const t = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const colors = palette.length > 1 ? palette : [palette[0] ?? "#3b4cc0", palette[0] ?? "#3b4cc0"];
  const position = t * (colors.length - 1);
  const startIndex = Math.min(Math.floor(position), colors.length - 2);
  const local = position - startIndex;
  const start = colorChannels(colors[startIndex]!);
  const end = colorChannels(colors[startIndex + 1]!);
  const red = Math.round(start[0] + (end[0] - start[0]) * local);
  const green = Math.round(start[1] + (end[1] - start[1]) * local);
  const blue = Math.round(start[2] + (end[2] - start[2]) * local);
  return `rgb(${red}, ${green}, ${blue})`;
}

/** Export-ready SVG heatmap. Long labels expand margins instead of being clipped. */
export const HeatmapGraph = forwardRef<SVGSVGElement, HeatmapGraphProps>(function HeatmapGraph(
  {
    model,
    min = model.range?.min ?? null,
    max = model.range?.max ?? null,
    palette = ["#3b4cc0", "#f7f7f7", "#b40426"],
    missingColor = "#d1d5db",
    showCellValues = false,
  },
  ref,
) {
  const gradientId = `heatmap-color-scale-${useId().replaceAll(":", "")}`;
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
  const legendWidth = 150;
  const width = left + model.raw.columnIds.length * cellWidth + legendWidth + 54;
  const height = top + model.raw.rowIds.length * cellHeight + 60;
  const legendX = left + model.raw.columnIds.length * cellWidth + 28;
  const legendY = top;
  const legendHeight = Math.max(120, Math.min(240, model.raw.rowIds.length * cellHeight));
  return (
    <svg
      ref={ref}
      role="img"
      aria-label="Heatmap"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
          {palette.map((color, index) => (
            <stop
              key={`${color}.${index}`}
              offset={`${(index / Math.max(1, palette.length - 1)) * 100}%`}
              stopColor={color}
            />
          ))}
        </linearGradient>
      </defs>
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
                    : heatColor(value, min, max, palette)
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
      <g data-graph-layer="color-scale-legend" aria-label="Color scale legend">
        <text x={legendX} y={legendY - 12} fontSize="13" fontWeight="600">
          Value
        </text>
        <rect
          x={legendX}
          y={legendY}
          width="18"
          height={legendHeight}
          fill={`url(#${gradientId})`}
          stroke="#8793a0"
        />
        <text x={legendX + 26} y={legendY + 5} fontSize="12">
          {max === null ? "—" : Number(max.toFixed(3))}
        </text>
        <text x={legendX + 26} y={legendY + legendHeight} fontSize="12">
          {min === null ? "—" : Number(min.toFixed(3))}
        </text>
        <rect
          x={legendX}
          y={legendY + legendHeight + 18}
          width="18"
          height="14"
          fill={missingColor}
          stroke="#8793a0"
        />
        <text x={legendX + 26} y={legendY + legendHeight + 30} fontSize="12">
          Missing
        </text>
      </g>
      <text x={left} y={height - 18} fontSize="12">
        Transform: {model.transform.kind} ({model.transform.version}); missing values shown as{" "}
        {missingColor}
      </text>
    </svg>
  );
});
