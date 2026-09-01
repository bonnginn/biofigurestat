import {
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
  parseSpreadsheetA1Range,
  spreadsheetSheetDefaultRange,
  spreadsheetSheetSelectionToTsv,
  spreadsheetWorkbookToStackedTsv,
  type ImportedSpreadsheetWorkbook,
  type SpreadsheetWorkbookImporter,
} from "../app/spreadsheetWorkbookImport";
import { localizedFailureMessage, localizedText, useAppLocale } from "../app/appLocale";
import { SPREADSHEET_ZOOM_LEVELS, useSpreadsheetZoom } from "./spreadsheetZoom";
import { useControlledSpreadsheetHistory } from "./useControlledSpreadsheetHistory";
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

const SPREADSHEET_ZOOM_STORAGE_KEY = "lsaa.delimited-spreadsheet.zoom.v1";

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
  caption,
  testIdPrefix,
  replaceOnPasteAtOrigin = false,
  workbookImporter = importLocalSpreadsheetWorkbook,
  allowWorkbookSheetStacking = false,
  columnOptions = {},
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const failure = (error: unknown, ja: string, en: string) =>
    localizedFailureMessage(locale, error, ja, en);
  const effectiveCaption = caption ?? t("データ表", "Data table");
  const {
    zoom: spreadsheetZoom,
    changeZoom: changeSpreadsheetZoom,
  } = useSpreadsheetZoom(SPREADSHEET_ZOOM_STORAGE_KEY);
  const [importedWorkbook, setImportedWorkbook] = useState<ImportedSpreadsheetWorkbook | null>(
    null,
  );
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [workbookRange, setWorkbookRange] = useState("");
  const [workbookHeaderRowCount, setWorkbookHeaderRowCount] = useState<1 | 2 | 3>(1);
  const [workbookImportError, setWorkbookImportError] = useState<string | null>(null);
  const [workbookImporting, setWorkbookImporting] = useState(false);
  const workbookImportEnabled =
    workbookImporter !== importLocalSpreadsheetWorkbook || spreadsheetWorkbookImportAvailable();
  const parsed = parseGrid(value);
  const contentColumns = parsed.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const rowCount = Math.max(minimumRows, parsed.rows.length + 1);
  const columnCount = Math.max(minimumColumns, contentColumns);
  const rows = rectangularRows(parsed.rows, rowCount, columnCount);
  const valueHistory = useControlledSpreadsheetHistory<string, ChangeSource>({
    value,
    publish: (next, publication) =>
      onChange(next, publication.kind === "commit" ? publication.metadata : "cell_edit"),
  });

  const updateCell = (row: number, column: number, nextValue: string) => {
    const next = rows.map((candidate) => [...candidate]);
    next[row]![column] = nextValue;
    valueHistory.commit(serializeGrid(next, parsed.delimiter), "cell_edit");
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
    valueHistory.commit(serializeGrid(next, "\t"), "clipboard");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLocaleLowerCase("en-US");
      const redoRequested = key === "y" || (key === "z" && event.shiftKey);
      if (key === "z" || key === "y") {
        const changed = redoRequested ? valueHistory.redo() : valueHistory.undo();
        if (changed) {
          event.preventDefault();
          return;
        }
      }
    }
    moveSpreadsheetFocus(event);
  };

  const applyImportedSheet = (workbook: ImportedSpreadsheetWorkbook, sheetIndex: number) => {
    const sheet = workbook.sheets[sheetIndex];
    if (!sheet) return;
    const range = spreadsheetSheetDefaultRange(sheet);
    setWorkbookRange(range);
    setWorkbookHeaderRowCount(1);
    valueHistory.commit(spreadsheetRowsToTsv(sheet.rows), "workbook_import");
    setWorkbookImportError(null);
  };

  const applyImportedRange = () => {
    const sheet = importedWorkbook?.sheets[selectedSheetIndex];
    if (!sheet) return;
    try {
      const selection = parseSpreadsheetA1Range(
        workbookRange,
        sheet,
        workbookHeaderRowCount,
      );
      valueHistory.commit(
        spreadsheetSheetSelectionToTsv(sheet, selection),
        "workbook_import",
      );
      setWorkbookImportError(null);
    } catch (error) {
      setWorkbookImportError(
        failure(
          error,
          "指定した表範囲を読み込めませんでした。",
          "The selected worksheet range could not be imported.",
        ),
      );
    }
  };

  const applyAllSheetsAsExperiments = (workbook: ImportedSpreadsheetWorkbook) => {
    try {
      valueHistory.commit(spreadsheetWorkbookToStackedTsv(workbook), "workbook_import");
      setWorkbookImportError(null);
    } catch (error) {
      setWorkbookImportError(
        failure(
          error,
          "worksheetをExpとしてまとめられませんでした。",
          "The worksheets could not be combined as experiments.",
        ),
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
        failure(
          error,
          "Excel workbookを読み込めませんでした。",
          "The Excel workbook could not be loaded.",
        ),
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
        aria-label={t("シートの拡大縮小", "Worksheet zoom")}
      >
        <span>{t("表示倍率", "Zoom")}</span>
        <button
          type="button"
          aria-label={t("シートを縮小", "Zoom out")}
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
          aria-label={t("シートを拡大", "Zoom in")}
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
          <caption>{effectiveCaption}</caption>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th scope="row">{rowIndex === 0 ? t("見出し", "Header") : rowIndex}</th>
                {row.map((cell, columnIndex) => {
                  const options = rowIndex > 0 ? columnOptions[columnIndex] : undefined;
                  const cellProps = {
                    "aria-label": t(
                      `${ariaLabel} 行${rowIndex + 1} 列${columnIndex + 1}`,
                      `${ariaLabel} row ${rowIndex + 1}, column ${columnIndex + 1}`,
                    ),
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
                          <option value="">{t("選択", "Select")}</option>
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
      <p>
        {t(
          "Excelから範囲をコピーし、左上のセルへそのまま貼り付けられます。空欄も保持します。",
          "Copy a range from Excel and paste it directly into the top-left cell. Blank cells are preserved.",
        )}
      </p>
      <div className="delimited-spreadsheet__workbook-import">
        <details className="delimited-spreadsheet__import-recipe">
          <summary>{t("Excelテンプレートと取込手順", "Excel template and import recipe")}</summary>
          <div>
            <a href="./templates/BioFigureStat-import-template.xlsx" download>
              {t("制約付きExcelテンプレートを保存", "Download the constrained Excel template")}
            </a>
            <ol>
              <li>{t("実験設計に合うsheetを1つ選び、見出し1行を保ちます。", "Choose one sheet that matches the design and keep its single header row.")}</li>
              <li>{t("1行を1記録として入力し、空欄はmissingのままにします。", "Enter one record per row and leave missing values blank.")}</li>
              <li>{t("読込後にsheet・A1範囲・見出し行数を確認し、列を明示的に対応付けます。", "After import, confirm the sheet, A1 range, and header count, then map columns explicitly.")}</li>
            </ol>
            <p>
              {t(
                "IDや実験日だけから対応関係・独立性は推定しません。複数fileの数も統計上のnではありません。",
                "IDs and experiment dates do not establish pairing or independence. File count is not statistical n.",
              )}
            </p>
          </div>
        </details>
        <button
          type="button"
          onClick={() => void openWorkbook()}
          disabled={workbookImporting || !workbookImportEnabled}
          title={
            workbookImportEnabled
              ? undefined
              : t(
                  "XLS / XLSX直接読込はデスクトップ版で利用できます",
                  "Direct XLS / XLSX import is available in the desktop app",
                )
          }
        >
          {workbookImporting
            ? t("Excelを読込中…", "Loading Excel…")
            : t("XLS / XLSXを直接読み込む", "Import XLS / XLSX directly")}
        </button>
        {!workbookImportEnabled ? (
          <span>{t("デスクトップ版で利用できます", "Available in the desktop app")}</span>
        ) : null}
        {importedWorkbook && importedWorkbook.sheets.length > 1 ? (
          <>
            <label>
              {t("worksheetを1枚読み込む", "Import one worksheet")}
              <select
                aria-label={t("読み込むworksheet", "Worksheet to import")}
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
                {t(
                  "全worksheetをExpとしてまとめる",
                  "Combine all worksheets as experiments",
                )}
              </button>
            ) : null}
          </>
        ) : null}
        {importedWorkbook ? (
          <>
            <span role="status">
              {importedWorkbook.sourceFiles && importedWorkbook.sourceFiles.length > 1
                ? t(
                    `${importedWorkbook.sourceFiles.length}ファイル`,
                    `${importedWorkbook.sourceFiles.length} files`,
                  )
                : importedWorkbook.fileName}{" "}
              / {importedWorkbook.sheets[selectedSheetIndex]?.name}
            </span>
            {importedWorkbook.sourceFiles && importedWorkbook.sourceFiles.length > 1 ? (
              <p role="note">
                {t(
                  "複数ファイルを読み込みました。ファイル名とworksheet名は出典として保持しますが、ファイル数を統計上のnとはみなしません。",
                  "Multiple files were loaded. File and worksheet names are retained as provenance; file count is not treated as statistical n.",
                )}
              </p>
            ) : null}
            <label>
              {t("表範囲", "Table range")}
              <input
                aria-label={t("読み込む表範囲", "Worksheet range to import")}
                value={workbookRange}
                placeholder="A1:D20"
                onChange={(event) => setWorkbookRange(event.currentTarget.value)}
              />
            </label>
            <label>
              {t("見出し行", "Header rows")}
              <select
                aria-label={t("見出し行の数", "Number of header rows")}
                value={workbookHeaderRowCount}
                onChange={(event) =>
                  setWorkbookHeaderRowCount(Number(event.currentTarget.value) as 1 | 2 | 3)
                }
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
            <button type="button" onClick={applyImportedRange}>
              {t("この範囲を読み込む", "Import this range")}
            </button>
          </>
        ) : null}
        {(importedWorkbook?.sheets[selectedSheetIndex]?.formulaCellCount ?? 0) > 0 ? (
          <p role="note">
            {t(
              `数式セル ${importedWorkbook?.sheets[selectedSheetIndex]?.formulaCellCount}件は、Excel保存時の計算結果を読み込みました。BioFigureStat内では数式を再計算しません。`,
              `${importedWorkbook?.sheets[selectedSheetIndex]?.formulaCellCount} formula cells use the calculated values stored by Excel. BioFigureStat does not recalculate formulas.`,
            )}
          </p>
        ) : null}
        {allowWorkbookSheetStacking && importedWorkbook && importedWorkbook.sheets.length > 1 ? (
          <p role="note">
            {t(
              "まとめるとworksheet名を「Experiment / worksheet」列へ残します。別々の実験回や統計的なnであることは自動判定しません。",
              "When combined, worksheet names are retained in an Experiment / worksheet column. BioFigureStat does not infer that worksheets are separate experimental runs or statistical n.",
            )}
          </p>
        ) : null}
        {workbookImportError ? <p role="alert">{workbookImportError}</p> : null}
      </div>
    </div>
  );
}
