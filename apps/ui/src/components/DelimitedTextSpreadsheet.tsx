import {
  useEffect,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { moveSpreadsheetFocus, parseClipboardMatrix } from "./spreadsheetGrid";
import {
  importLocalSpreadsheetWorkbook,
  spreadsheetWorkbookImportAvailable,
  spreadsheetRowsToTsv,
  spreadsheetWorkbookToStackedTsv,
  type ImportedSpreadsheetWorkbook,
  type SpreadsheetWorkbookImporter,
} from "../app/spreadsheetWorkbookImport";
import "./DelimitedTextSpreadsheet.css";

type ChangeSource = "cell_edit" | "clipboard" | "workbook_import";

type Props = Readonly<{
  value: string;
  onChange: (value: string, source: ChangeSource) => void;
  ariaLabel: string;
  minimumRows?: number;
  minimumColumns?: number;
  caption?: string;
  testIdPrefix?: string;
  replaceOnPasteAtOrigin?: boolean;
  workbookImporter?: SpreadsheetWorkbookImporter;
  allowWorkbookSheetStacking?: boolean;
  columnOptions?: Readonly<Record<number, readonly string[]>>;
}>;

type ParsedGrid = Readonly<{
  delimiter: "\t" | "," | ";";
  rows: readonly (readonly string[])[];
}>;

const SPREADSHEET_ZOOM_LEVELS = [70, 80, 90, 100, 110, 120, 130] as const;
const SPREADSHEET_ZOOM_STORAGE_KEY = "lsaa.delimited-spreadsheet.zoom.v1";

function initialSpreadsheetZoom(): number {
  if (typeof window === "undefined") return 100;
  try {
    const storedZoom = Number(window.localStorage.getItem(SPREADSHEET_ZOOM_STORAGE_KEY));
    return SPREADSHEET_ZOOM_LEVELS.some((level) => level === storedZoom) ? storedZoom : 100;
  } catch {
    return 100;
  }
}

function delimiterCharacter(value: string): ParsedGrid["delimiter"] {
  const sample = value.split(/\r?\n/u).slice(0, 8).join("\n");
  const counts = [
    ["\t", sample.match(/\t/gu)?.length ?? 0],
    [",", sample.match(/,/gu)?.length ?? 0],
    [";", sample.match(/;/gu)?.length ?? 0],
  ] as const;
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "\t";
}

function splitDelimitedLine(line: string, delimiter: ParsedGrid["delimiter"]): string[] {
  if (delimiter === "\t") return line.split("\t");
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function parseGrid(value: string): ParsedGrid {
  const delimiter = delimiterCharacter(value);
  if (!value) return { delimiter, rows: [[""]] };
  const lines = value.replace(/\r\n?/gu, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return { delimiter, rows: lines.map((line) => splitDelimitedLine(line, delimiter)) };
}

function encodedCell(value: string, delimiter: ParsedGrid["delimiter"]): string {
  if (delimiter === "\t") return value.replace(/[\r\n]/gu, " ");
  const normalized = value.replace(/[\r\n]/gu, " ");
  return normalized.includes(delimiter) || normalized.includes('"')
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized;
}

function serializeGrid(
  rows: readonly (readonly string[])[],
  delimiter: ParsedGrid["delimiter"],
): string {
  const retained = rows.map((row) => [...row]);
  while (retained.length > 1 && retained.at(-1)?.every((value) => value === "")) retained.pop();
  const lastColumn = retained.reduce((maximum, row) => {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (row[index] !== "") return Math.max(maximum, index);
    }
    return maximum;
  }, 0);
  return retained
    .map((row) =>
      Array.from({ length: lastColumn + 1 }, (_, index) =>
        encodedCell(row[index] ?? "", delimiter),
      ).join(delimiter),
    )
    .join("\n");
}

function rectangularRows(
  rows: readonly (readonly string[])[],
  rowCount: number,
  columnCount: number,
): string[][] {
  return Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: columnCount }, (_, column) => rows[row]?.[column] ?? ""),
  );
}

/** A small Excel-like editor whose serialized value remains the authoritative delimited text. */
export function DelimitedTextSpreadsheet({
  value,
  onChange,
  ariaLabel,
  minimumRows = 7,
  minimumColumns = 4,
  caption = "データ表",
  testIdPrefix,
  replaceOnPasteAtOrigin = false,
  workbookImporter = importLocalSpreadsheetWorkbook,
  allowWorkbookSheetStacking = false,
  columnOptions = {},
}: Props) {
  const [spreadsheetZoom, setSpreadsheetZoom] = useState<number>(initialSpreadsheetZoom);
  const [importedWorkbook, setImportedWorkbook] = useState<ImportedSpreadsheetWorkbook | null>(
    null,
  );
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [workbookImportError, setWorkbookImportError] = useState<string | null>(null);
  const [workbookImporting, setWorkbookImporting] = useState(false);
  const workbookImportEnabled =
    workbookImporter !== importLocalSpreadsheetWorkbook || spreadsheetWorkbookImportAvailable();
  const parsed = parseGrid(value);
  const contentColumns = parsed.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const rowCount = Math.max(minimumRows, parsed.rows.length + 1);
  const columnCount = Math.max(minimumColumns, contentColumns);
  const rows = rectangularRows(parsed.rows, rowCount, columnCount);

  const changeSpreadsheetZoom = (direction: -1 | 1) => {
    const currentIndex = SPREADSHEET_ZOOM_LEVELS.findIndex((level) => level === spreadsheetZoom);
    const boundedIndex = Math.min(
      SPREADSHEET_ZOOM_LEVELS.length - 1,
      Math.max(0, (currentIndex < 0 ? 3 : currentIndex) + direction),
    );
    setSpreadsheetZoom(SPREADSHEET_ZOOM_LEVELS[boundedIndex] ?? 100);
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(SPREADSHEET_ZOOM_STORAGE_KEY, String(spreadsheetZoom));
    } catch {
      // A blocked preference store must not prevent data entry.
    }
  }, [spreadsheetZoom]);

  const updateCell = (row: number, column: number, nextValue: string) => {
    const next = rows.map((candidate) => [...candidate]);
    next[row]![column] = nextValue;
    onChange(serializeGrid(next, parsed.delimiter), "cell_edit");
  };

  const pasteCells = (
    event: ClipboardEvent<HTMLInputElement>,
    startRow: number,
    startColumn: number,
  ) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    let pasted: readonly (readonly string[])[] = parseClipboardMatrix(text);
    if (!text.includes("\t") && /[,;]/u.test(text)) {
      pasted = parseGrid(text).rows;
    }
    const replaceWholeSheet = replaceOnPasteAtOrigin && startRow === 0 && startColumn === 0;
    const baseRows = replaceWholeSheet ? [] : rows;
    const requiredRows = Math.max(baseRows.length, startRow + pasted.length);
    const requiredColumns = Math.max(
      replaceWholeSheet ? 0 : (baseRows[0]?.length ?? 0),
      startColumn + pasted.reduce((maximum, row) => Math.max(maximum, row.length), 0),
    );
    const next = rectangularRows(baseRows, requiredRows, requiredColumns);
    pasted.forEach((pastedRow, rowOffset) => {
      pastedRow.forEach((cell, columnOffset) => {
        next[startRow + rowOffset]![startColumn + columnOffset] = cell;
      });
    });
    onChange(serializeGrid(next, "\t"), "clipboard");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    moveSpreadsheetFocus(event);
  };

  const applyImportedSheet = (workbook: ImportedSpreadsheetWorkbook, sheetIndex: number) => {
    const sheet = workbook.sheets[sheetIndex];
    if (!sheet) return;
    onChange(spreadsheetRowsToTsv(sheet.rows), "workbook_import");
  };

  const applyAllSheetsAsExperiments = (workbook: ImportedSpreadsheetWorkbook) => {
    try {
      onChange(spreadsheetWorkbookToStackedTsv(workbook), "workbook_import");
      setWorkbookImportError(null);
    } catch (error) {
      setWorkbookImportError(
        error instanceof Error ? error.message : "worksheetをExpとしてまとめられませんでした。",
      );
    }
  };

  const openWorkbook = async () => {
    setWorkbookImporting(true);
    setWorkbookImportError(null);
    try {
      const workbook = await workbookImporter();
      if (!workbook) return;
      const firstNonEmpty = workbook.sheets.findIndex((sheet) => sheet.rows.length > 0);
      const initialSheet = firstNonEmpty >= 0 ? firstNonEmpty : 0;
      setImportedWorkbook(workbook);
      setSelectedSheetIndex(initialSheet);
      applyImportedSheet(workbook, initialSheet);
    } catch (error) {
      setWorkbookImportError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Excel workbookを読み込めませんでした。",
      );
    } finally {
      setWorkbookImporting(false);
    }
  };

  return (
    <div className="delimited-spreadsheet" role="region" aria-label={ariaLabel}>
      <div
        className="delimited-spreadsheet__zoom-control"
        role="group"
        aria-label="シートの拡大縮小"
      >
        <span>表示倍率</span>
        <button
          type="button"
          aria-label="シートを縮小"
          disabled={spreadsheetZoom <= SPREADSHEET_ZOOM_LEVELS[0]}
          onClick={() => changeSpreadsheetZoom(-1)}
        >
          −
        </button>
        <span className="delimited-spreadsheet__zoom-value" aria-live="polite" aria-atomic="true">
          {spreadsheetZoom}%
        </span>
        <button
          type="button"
          aria-label="シートを拡大"
          disabled={spreadsheetZoom >= SPREADSHEET_ZOOM_LEVELS[SPREADSHEET_ZOOM_LEVELS.length - 1]}
          onClick={() => changeSpreadsheetZoom(1)}
        >
          +
        </button>
      </div>
      <div className="delimited-spreadsheet__scroll">
        <table
          style={
            {
              "--delimited-sheet-zoom": String(spreadsheetZoom / 100),
            } as CSSProperties
          }
        >
          <caption>{caption}</caption>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th scope="row">{rowIndex === 0 ? "見出し" : rowIndex}</th>
                {row.map((cell, columnIndex) => {
                  const options = rowIndex > 0 ? columnOptions[columnIndex] : undefined;
                  const cellProps = {
                    "aria-label": `${ariaLabel} 行${rowIndex + 1} 列${columnIndex + 1}`,
                    "data-spreadsheet-cell": true,
                    "data-spreadsheet-row": rowIndex,
                    "data-spreadsheet-column": columnIndex,
                    "data-testid": testIdPrefix
                      ? `${testIdPrefix}-cell-${rowIndex}-${columnIndex}`
                      : undefined,
                  };
                  return (
                    <td key={columnIndex}>
                      {options ? (
                        <select
                          {...cellProps}
                          value={cell}
                          onChange={(event) =>
                            updateCell(rowIndex, columnIndex, event.target.value)
                          }
                          onKeyDown={handleKeyDown}
                        >
                          <option value="">選択</option>
                          {!options.includes(cell) && cell ? (
                            <option value={cell}>{cell}</option>
                          ) : null}
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...cellProps}
                          value={cell}
                          onChange={(event) =>
                            updateCell(rowIndex, columnIndex, event.target.value)
                          }
                          onFocus={(event) => {
                            if (rowIndex === 0) event.currentTarget.select();
                          }}
                          onClick={(event) => {
                            if (rowIndex === 0) event.currentTarget.select();
                          }}
                          onPaste={(event) => pasteCells(event, rowIndex, columnIndex)}
                          onKeyDown={handleKeyDown}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Excelから範囲をコピーし、左上のセルへそのまま貼り付けられます。空欄も保持します。</p>
      <div className="delimited-spreadsheet__workbook-import">
        <button
          type="button"
          onClick={() => void openWorkbook()}
          disabled={workbookImporting || !workbookImportEnabled}
          title={
            workbookImportEnabled ? undefined : "XLS / XLSX直接読込はデスクトップ版で利用できます"
          }
        >
          {workbookImporting ? "Excelを読込中…" : "XLS / XLSXを直接読み込む"}
        </button>
        {!workbookImportEnabled ? <span>デスクトップ版で利用できます</span> : null}
        {importedWorkbook && importedWorkbook.sheets.length > 1 ? (
          <>
            <label>
              worksheetを1枚読み込む
              <select
                aria-label="読み込むworksheet"
                value={selectedSheetIndex}
                onChange={(event) => {
                  const nextIndex = Number(event.currentTarget.value);
                  setSelectedSheetIndex(nextIndex);
                  applyImportedSheet(importedWorkbook, nextIndex);
                }}
              >
                {importedWorkbook.sheets.map((sheet, index) => (
                  <option key={`${sheet.name}:${index}`} value={index}>
                    {sheet.name}
                  </option>
                ))}
              </select>
            </label>
            {allowWorkbookSheetStacking ? (
              <button type="button" onClick={() => applyAllSheetsAsExperiments(importedWorkbook)}>
                全worksheetをExpとしてまとめる
              </button>
            ) : null}
          </>
        ) : null}
        {importedWorkbook ? (
          <span role="status">
            {importedWorkbook.fileName} / {importedWorkbook.sheets[selectedSheetIndex]?.name}
          </span>
        ) : null}
        {(importedWorkbook?.sheets[selectedSheetIndex]?.formulaCellCount ?? 0) > 0 ? (
          <p role="note">
            数式セル {importedWorkbook?.sheets[selectedSheetIndex]?.formulaCellCount}
            件は、Excel保存時の計算結果を読み込みました。BioFigureStat内では数式を再計算しません。
          </p>
        ) : null}
        {allowWorkbookSheetStacking && importedWorkbook && importedWorkbook.sheets.length > 1 ? (
          <p role="note">
            まとめるとworksheet名を「Experiment /
            worksheet」列へ残します。別々の実験回や統計的なnであることは自動判定しません。
          </p>
        ) : null}
        {workbookImportError ? <p role="alert">{workbookImportError}</p> : null}
      </div>
    </div>
  );
}
