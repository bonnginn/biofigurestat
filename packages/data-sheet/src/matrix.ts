import { z } from "zod";

const MatrixDataSchema = z.object({
  version: z.literal("0.1.0"),
  rowIds: z.array(z.string().min(1)).min(1),
  rowLabels: z.array(z.string().min(1)).min(1),
  columnIds: z.array(z.string().min(1)).min(1),
  columnLabels: z.array(z.string().min(1)).min(1),
  values: z.array(z.array(z.number().finite().nullable()).min(1)).min(1),
});

export type MatrixPasteData = z.infer<typeof MatrixDataSchema>;

/** Parses a rectangular TSV/CSV matrix. Empty/NA cells remain explicit nulls. */
export function parseMatrixPaste(text: string): MatrixPasteData {
  const lines = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("Matrix paste requires a header and at least one row");
  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const header = lines[0]!.split(delimiter).map((cell) => cell.trim());
  const columnLabels = header.slice(1);
  if (!columnLabels.length || columnLabels.some((label) => !label)) {
    throw new Error("Matrix columns require non-empty labels");
  }
  const rowLabels: string[] = [];
  const values = lines.slice(1).map((line, rowIndex) => {
    const cells = line.split(delimiter).map((cell) => cell.trim());
    if (cells.length !== header.length)
      throw new Error(`Matrix row ${rowIndex + 2} is not rectangular`);
    const rowLabel = cells[0] ?? "";
    if (!rowLabel) throw new Error(`Matrix row ${rowIndex + 2} requires a label`);
    rowLabels.push(rowLabel);
    return cells.slice(1).map((cell) => {
      if (cell === "" || /^(na|nan)$/iu.test(cell)) return null;
      const value = Number(cell);
      if (!Number.isFinite(value))
        throw new Error(`Matrix row ${rowIndex + 2} contains a non-numeric value`);
      return value;
    });
  });
  return MatrixDataSchema.parse({
    version: "0.1.0",
    rowIds: rowLabels.map((_, index) => `feature.${index + 1}`),
    rowLabels,
    columnIds: columnLabels.map((_, index) => `sample.${index + 1}`),
    columnLabels,
    values,
  });
}
