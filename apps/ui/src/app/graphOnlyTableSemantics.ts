import type { ParsedAdaptiveInput } from "@lsaa/adaptive-input";

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

type ColumnIndex = number | "";

type GraphPoint = Readonly<{
  xNumeric: number | null;
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
  return parsed.rows.flatMap((row) => {
    if (numericValue(row[yColumn]) === null) return [];
    const series = seriesColumn === "" ? "" : row[seriesColumn]?.trim() || "（空欄）";
    return [{ xNumeric: numericValue(row[xColumn]), series }];
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
