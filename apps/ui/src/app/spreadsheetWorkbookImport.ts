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
