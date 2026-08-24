import { z } from "zod";

export const MatrixDataSchema = z.object({
  version: z.literal("0.1.0"),
  rowIds: z.array(z.string().min(1)).min(1),
  rowLabels: z.array(z.string().min(1)).min(1),
  columnIds: z.array(z.string().min(1)).min(1),
  columnLabels: z.array(z.string().min(1)).min(1),
  values: z.array(z.array(z.number().finite().nullable()).min(1)).min(1),
});

export type MatrixData = z.infer<typeof MatrixDataSchema>;
export type HeatmapTransform = "none" | "row_z_score" | "column_z_score" | "log10";

export type HeatmapModel = Readonly<{
  type: "heatmap";
  raw: MatrixData;
  values: readonly (readonly (number | null)[])[];
  transform: Readonly<{ kind: HeatmapTransform; version: "0.1.0" }>;
  range: Readonly<{ min: number; max: number }> | null;
}>;

function validateMatrix(input: MatrixData): MatrixData {
  const matrix = MatrixDataSchema.parse(input);
  if (
    matrix.rowIds.length !== matrix.rowLabels.length ||
    matrix.values.length !== matrix.rowIds.length
  ) {
    throw new Error("Heatmap row identities, labels, and values must have equal lengths");
  }
  if (matrix.columnIds.length !== matrix.columnLabels.length) {
    throw new Error("Heatmap column identities and labels must have equal lengths");
  }
  if (
    new Set(matrix.rowIds).size !== matrix.rowIds.length ||
    new Set(matrix.columnIds).size !== matrix.columnIds.length
  ) {
    throw new Error("Heatmap row and column IDs must be unique");
  }
  if (matrix.values.some((row) => row.length !== matrix.columnIds.length)) {
    throw new Error("Heatmap values must form a rectangular matrix");
  }
  return matrix;
}

function zScore(values: readonly (number | null)[]): (number | null)[] {
  const finite = values.filter((value): value is number => value !== null);
  if (finite.length < 2) {
    throw new Error("Z-score requires at least two observed values per transformed dimension");
  }
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const sd = Math.sqrt(
    finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (finite.length - 1),
  );
  if (sd === 0) throw new Error("Z-score is undefined for a constant row or column");
  return values.map((value) => (value === null ? null : (value - mean) / sd));
}

export function createHeatmapModel(input: MatrixData, transform: HeatmapTransform): HeatmapModel {
  const raw = validateMatrix(input);
  let values: (number | null)[][] = raw.values.map((row) => [...row]);
  if (transform === "row_z_score") values = values.map(zScore);
  if (transform === "column_z_score") {
    const columns = raw.columnIds.map((_, column) =>
      zScore(values.map((row) => row[column] ?? null)),
    );
    values = raw.rowIds.map((_, row) => columns.map((column) => column[row] ?? null));
  }
  if (transform === "log10") {
    values = values.map((row) =>
      row.map((value) => {
        if (value === null) return null;
        if (value <= 0)
          throw new Error("Log10 heatmap transform requires positive observed values");
        return Math.log10(value);
      }),
    );
  }
  const observed = values.flat().filter((value): value is number => value !== null);
  return {
    type: "heatmap",
    raw,
    values,
    transform: { kind: transform, version: "0.1.0" },
    range: observed.length ? { min: Math.min(...observed), max: Math.max(...observed) } : null,
  };
}
