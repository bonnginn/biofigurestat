import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type ImportedSpreadsheetSheet = Readonly<{
  name: string;
  rows: readonly (readonly string[])[];
  formulaCellCount?: number;
}>;

export type ImportedSpreadsheetWorkbook = Readonly<{
  fileName: string;
  sheets: readonly ImportedSpreadsheetSheet[];
}>;

export type SpreadsheetWorkbookImporter = () => Promise<ImportedSpreadsheetWorkbook | null>;

export function spreadsheetWorkbookImportAvailable(): boolean {
  return isTauri();
}

export const importLocalSpreadsheetWorkbook: SpreadsheetWorkbookImporter = async () => {
  if (!isTauri()) return null;
  const target = await open({
    directory: false,
    multiple: false,
    title: "Excel workbookを読み込む",
    filters: [{ name: "Excel workbook", extensions: ["xls", "xlsx", "xlsm", "xlsb"] }],
  });
  if (target === null) return null;
  return invoke<ImportedSpreadsheetWorkbook>("read_spreadsheet_workbook", { target });
};

export function spreadsheetRowsToTsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) => row.map((cell) => cell.replace(/[\t\r\n]/gu, " ")).join("\t"))
    .join("\n");
}

/**
 * Stacks worksheets with the same header and retains the sheet name as an
 * explicit source column. The column is descriptive provenance only: callers
 * must not infer that a worksheet is a biological replicate or independent n.
 */
export function spreadsheetWorkbookToStackedTsv(workbook: ImportedSpreadsheetWorkbook): string {
  const sheets = workbook.sheets.filter(({ rows }) => rows.length > 0);
  if (sheets.length === 0) return "";
  const headers = sheets[0]!.rows[0] ?? [];
  const sameHeader = sheets.every((sheet) => {
    const candidate = sheet.rows[0] ?? [];
    return (
      candidate.length === headers.length &&
      candidate.every((cell, index) => cell === headers[index])
    );
  });
  if (!sameHeader) {
    throw new Error(
      "worksheetごとに見出しが異なるため、Expとしてまとめられません。sheetを1枚ずつ読み込んでください。",
    );
  }
  return spreadsheetRowsToTsv([
    ["Experiment / worksheet", ...headers],
    ...sheets.flatMap((sheet) => sheet.rows.slice(1).map((row) => [sheet.name, ...row])),
  ]);
}
