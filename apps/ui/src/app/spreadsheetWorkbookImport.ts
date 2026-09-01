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
  sourceFiles?: readonly string[];
}>;

export type SpreadsheetWorkbookImporter = () => Promise<ImportedSpreadsheetWorkbook | null>;

export type SpreadsheetImportSelection = Readonly<{
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  headerRowCount: 1 | 2 | 3;
}>;

export function spreadsheetWorkbookImportAvailable(): boolean {
  return isTauri();
}

export const importLocalSpreadsheetWorkbook: SpreadsheetWorkbookImporter = async () => {
  if (!isTauri()) return null;
  const selected = await open({
    directory: false,
    multiple: true,
    title: "Excel workbookを読み込む",
    filters: [{ name: "Excel workbook", extensions: ["xls", "xlsx", "xlsm", "xlsb"] }],
  });
  if (selected === null) return null;
  const targets = Array.isArray(selected) ? selected : [selected];
  const workbooks = await Promise.all(
    targets.map((target) =>
      invoke<ImportedSpreadsheetWorkbook>("read_spreadsheet_workbook", { target }),
    ),
  );
  return mergeImportedSpreadsheetWorkbooks(workbooks);
};

/** Keeps each file/sheet source explicit; it does not infer biological replicates from files. */
export function mergeImportedSpreadsheetWorkbooks(
  workbooks: readonly ImportedSpreadsheetWorkbook[],
): ImportedSpreadsheetWorkbook | null {
  if (workbooks.length === 0) return null;
  if (workbooks.length === 1) return workbooks[0]!;
  return {
    fileName: `${workbooks[0]!.fileName} +${workbooks.length - 1}`,
    sourceFiles: workbooks.map(({ fileName }) => fileName),
    sheets: workbooks.flatMap((workbook) =>
      workbook.sheets.map((sheet) => ({
        ...sheet,
        name: `${workbook.fileName} / ${sheet.name}`,
      })),
    ),
  };
}

export function spreadsheetRowsToTsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) => row.map((cell) => cell.replace(/[\t\r\n]/gu, " ")).join("\t"))
    .join("\n");
}

function columnNumber(label: string): number {
  let value = 0;
  for (const character of label.toUpperCase()) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value - 1;
}

function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function spreadsheetSheetDefaultRange(sheet: ImportedSpreadsheetSheet): string {
  const rowCount = sheet.rows.length;
  const columnCount = sheet.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  return rowCount > 0 && columnCount > 0 ? `A1:${columnLabel(columnCount - 1)}${rowCount}` : "";
}

export function parseSpreadsheetA1Range(
  value: string,
  sheet: ImportedSpreadsheetSheet,
  headerRowCount: 1 | 2 | 3,
): SpreadsheetImportSelection {
  const match = /^\s*([A-Za-z]+)([1-9]\d*)\s*:\s*([A-Za-z]+)([1-9]\d*)\s*$/u.exec(value);
  if (!match) throw new Error("表範囲をA1:D20の形式で指定してください。");
  const startColumn = columnNumber(match[1]!);
  const startRow = Number(match[2]!) - 1;
  const endColumn = columnNumber(match[3]!);
  const endRow = Number(match[4]!) - 1;
  const sheetColumnCount = sheet.rows.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  );
  if (startRow > endRow || startColumn > endColumn) {
    throw new Error("表範囲の開始セルは終了セルより左上にしてください。");
  }
  if (endRow >= sheet.rows.length || endColumn >= sheetColumnCount) {
    throw new Error("指定した表範囲がworksheetの使用範囲を超えています。");
  }
  if (endRow - startRow + 1 <= headerRowCount) {
    throw new Error("見出し行の下に少なくとも1行のデータを含めてください。");
  }
  return { startRow, endRow, startColumn, endColumn, headerRowCount };
}

function forwardFilled(row: readonly string[]): string[] {
  let inherited = "";
  return row.map((cell) => {
    if (cell.trim()) inherited = cell.trim();
    return inherited;
  });
}

export function spreadsheetSheetSelectionToTsv(
  sheet: ImportedSpreadsheetSheet,
  selection: SpreadsheetImportSelection,
): string {
  const selected = sheet.rows
    .slice(selection.startRow, selection.endRow + 1)
    .map((row) =>
      Array.from(
        { length: selection.endColumn - selection.startColumn + 1 },
        (_, index) => row[selection.startColumn + index] ?? "",
      ),
    );
  const headerRows = selected
    .slice(0, selection.headerRowCount)
    .map((row, index) =>
      index < selection.headerRowCount - 1 ? forwardFilled(row) : row.map((cell) => cell.trim()),
    );
  const headers = Array.from(
    { length: selection.endColumn - selection.startColumn + 1 },
    (_, columnIndex) => {
      const parts = headerRows
        .map((row) => row[columnIndex]?.trim() ?? "")
        .filter((part, index, all) => part && part !== all[index - 1]);
      return parts.join(" / ");
    },
  );
  return spreadsheetRowsToTsv([headers, ...selected.slice(selection.headerRowCount)]);
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
