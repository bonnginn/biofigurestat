import type { TwoConditionDataSheet } from "./index";

export type ClipboardDelimiter = "tab" | "comma" | "lines";

export type ClipboardNumericColumn = Readonly<{
  index: number;
  label: string;
  values: number[];
  valueRowNumbers: number[];
  invalidRowNumbers: number[];
  emptyRowNumbers: number[];
  looksLikeRowIndex: boolean;
}>;

export type ParsedTabularClipboard = Readonly<{
  delimiter: ClipboardDelimiter;
  headers: string[];
  rows: string[][];
  columns: ClipboardNumericColumn[];
  recommendedColumnIndex: number | null;
  parseError?: string;
}>;

function splitDelimitedRows(text: string, delimiter: "\t" | ","): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let justClosedQuote = false;
  const pushCell = () => {
    cells.push(cell.trim());
    cell = "";
    justClosedQuote = false;
  };
  const pushRow = () => {
    pushCell();
    rows.push(cells);
    cells = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          justClosedQuote = true;
        }
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.trim() === "" && !justClosedQuote) {
      quoted = true;
    } else if (character === delimiter) {
      pushCell();
    } else if (character === "\n") {
      pushRow();
    } else if (justClosedQuote && character.trim() !== "") {
      throw new Error("引用符の後に区切り文字以外の文字があります。");
    } else {
      // Quotes within an unquoted cell are literal content. In a numeric
      // column they remain invalid instead of silently becoming another value.
      cell += character;
    }
  }
  if (quoted) throw new Error("閉じていない引用符があります。");
  pushRow();
  return rows;
}

function parseNumberCell(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSequentialIndex(values: Array<number | null>): boolean {
  const present = values.filter((value): value is number => value !== null);
  return (
    present.length === values.length &&
    present.length > 0 &&
    present.every((value, index) => Number.isInteger(value) && value === index + 1)
  );
}

function recommendedColumn(columns: ClipboardNumericColumn[]): number | null {
  const candidates = columns.filter((column) => column.values.length > 0);
  if (candidates.length === 0) return null;
  const preferred = [
    /^mean$/i,
    /^median$/i,
    /integrated\s*density|intden|rawintden/i,
    /intensity/i,
    /^area$/i,
  ];
  for (const pattern of preferred) {
    const match = candidates.find((column) => pattern.test(column.label));
    if (match) return match.index;
  }
  const valid = candidates.filter(
    (column) => column.invalidRowNumbers.length === 0 && column.emptyRowNumbers.length === 0,
  );
  return (
    valid.find((column) => !column.looksLikeRowIndex) ??
    candidates.find((column) => !column.looksLikeRowIndex) ??
    candidates[0]
  ).index;
}

/** Parses direct clipboard output from ImageJ Results, Excel, or one-value-per-line text. */
export function parseTabularClipboard(text: string): ParsedTabularClipboard {
  const sourceLines = text.replace(/\r\n?/g, "\n").split("\n");
  let firstLine = 0;
  let lastLine = sourceLines.length;
  // Outer clipboard padding is harmless; an interior blank is a missing
  // position and must not shift later values onto another experimental unit.
  while (firstLine < lastLine && !sourceLines[firstLine]?.trim()) firstLine += 1;
  while (lastLine > firstLine && !sourceLines[lastLine - 1]?.trim()) lastLine -= 1;
  const lines = sourceLines.slice(firstLine, lastLine);
  if (lines.length === 0) {
    return { delimiter: "lines", headers: [], rows: [], columns: [], recommendedColumnIndex: null };
  }
  const headerLine = lines[0] ?? "";
  const delimiter: ClipboardDelimiter = headerLine.includes("\t")
    ? "tab"
    : headerLine.includes(",")
      ? "comma"
      : "lines";
  let matrix: string[][];
  try {
    matrix =
      delimiter === "lines"
        ? lines.map((line) => [line.trim()])
        : splitDelimitedRows(lines.join("\n"), delimiter === "tab" ? "\t" : ",");
  } catch (error) {
    return {
      delimiter,
      headers: [],
      rows: [],
      columns: [],
      recommendedColumnIndex: null,
      parseError: error instanceof Error ? error.message : "表の引用符を解釈できません。",
    };
  }
  const firstRow = matrix[0];
  if (delimiter === "comma" && matrix.some((row) => row.length !== firstRow.length)) {
    return {
      delimiter, headers: [], rows: matrix, columns: [], recommendedColumnIndex: null,
      parseError: "CSVの列数が行によって異なります。小数・千区切りのカンマと列区切りを区別できません。列名とタブ区切り、小数点のピリオドを確認してください。元の貼り付け内容は変更していません。",
    };
  }
  const firstNumeric = firstRow.filter((cell) => parseNumberCell(cell) !== null).length;
  const firstText = firstRow.some((cell) => cell.trim() && parseNumberCell(cell) === null);
  const numericLookingText = firstRow.some((cell) =>
    parseNumberCell(cell) === null && /^(?:[<>≤≥]=?\s*[+-]?\d|[+-]?\d[\d.,\s]*$)/.test(cell.trim()),
  );
  if ((firstNumeric > 0 && firstText) || numericLookingText ||
      (delimiter === "comma" && firstNumeric === firstRow.length && firstRow.length > 1)) {
    // Do not discard an ID/value row as a guessed header, or interpret a
    // decimal/thousands comma as two measurements. Keep the original cells.
    return {
      delimiter,
      headers: [],
      rows: matrix,
      columns: [],
      recommendedColumnIndex: null,
      parseError: "先頭行またはカンマの意味が曖昧です。明示した列名を付け、数値の小数点はピリオド、列の区切りはタブで入力してください。元の貼り付け内容は変更していません。",
    };
  }
  const hasHeader = firstRow.some(
    (cell) => cell.trim().length > 0 && parseNumberCell(cell) === null,
  );
  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const columnCount = Math.max(firstRow.length, ...dataRows.map((row) => row.length));
  const headers = Array.from({ length: columnCount }, (_, index) => {
    const supplied = hasHeader ? (firstRow[index] ?? "").trim() : "";
    return supplied || (index === 0 && hasHeader ? "行" : `列 ${index + 1}`);
  });
  const rows = dataRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index]?.trim() ?? ""),
  );
  const columns = headers.map((label, index): ClipboardNumericColumn => {
    const parsed = rows.map((row) => parseNumberCell(row[index]));
    const invalidRowNumbers: number[] = [];
    const emptyRowNumbers: number[] = [];
    rows.forEach((row, rowIndex) => {
      if (row[index] === "") emptyRowNumbers.push(rowIndex + 1);
      else if (parsed[rowIndex] === null) invalidRowNumbers.push(rowIndex + 1);
    });
    return {
      index,
      label,
      values: parsed.filter((value): value is number => value !== null),
      valueRowNumbers: parsed.flatMap((value, rowIndex) => (value === null ? [] : [rowIndex + 1])),
      invalidRowNumbers,
      emptyRowNumbers,
      looksLikeRowIndex:
        isSequentialIndex(parsed) || /^(row|index|no\.?|#|行)$/i.test(label.trim()),
    };
  });
  return {
    delimiter,
    headers,
    rows,
    columns,
    recommendedColumnIndex: recommendedColumn(columns),
  };
}

/**
 * Replaces one condition's scalar draft values without altering pairing or unit IDs.
 * Remaining planned units are cleared so old and newly pasted values cannot mix silently.
 */
export function applyScalarValuesToCondition(
  sheet: TwoConditionDataSheet,
  conditionId: string,
  values: ReadonlyArray<number>,
  source?: Readonly<{ columnLabel: string; rowNumbers?: ReadonlyArray<number> }>,
): TwoConditionDataSheet {
  if (values.length === 0) throw new Error("取り込める数値がありません。");
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("有限の数値だけを取り込めます。");
  }
  const conditionIndex = sheet.conditions.findIndex((condition) => condition.id === conditionId);
  if (conditionIndex < 0) throw new Error("取込先の条件が実験デザインにありません。");
  const capacity =
    sheet.relationship === "independent"
      ? sheet.columns[conditionIndex].entries.length
      : sheet.rows.length;
  if (values.length > capacity) {
    throw new Error(
      `貼り付けた${values.length}個の値が、計画n = ${capacity}を超えています。先に実験デザインのnを変更してください。`,
    );
  }
  const measurementAt = (index: number) => ({
    kind: "scalar" as const,
    value: values[index] ?? null,
  });
  const sourceLocationAt = (index: number) =>
    source
      ? `clipboard:${source.columnLabel}:row:${source.rowNumbers?.[index] ?? index + 1}`
      : undefined;

  if (sheet.relationship === "independent") {
    const columns = [...sheet.columns] as [(typeof sheet.columns)[0], (typeof sheet.columns)[1]];
    const column = columns[conditionIndex];
    if (column.entries.some((entry) => entry.measurement.kind !== "scalar")) {
      throw new Error("陽性細胞率は、陽性細胞数と総細胞数の専用入力を使ってください。");
    }
    columns[conditionIndex] = {
      ...column,
      entries: column.entries.map((entry, index) => ({
        ...entry,
        measurement: measurementAt(index),
        ...(index < values.length
          ? sourceLocationAt(index)
            ? { sourceLocation: sourceLocationAt(index) }
            : { sourceLocation: undefined }
          : { sourceLocation: undefined }),
      })),
    };
    return { ...sheet, columns };
  }

  const rows = sheet.rows.map((row, rowIndex) => {
    const current = row.values[conditionIndex];
    if (current.measurement.kind !== "scalar") {
      throw new Error("陽性細胞率は、陽性細胞数と総細胞数の専用入力を使ってください。");
    }
    const valuesForRow = [...row.values] as [(typeof row.values)[0], (typeof row.values)[1]];
    valuesForRow[conditionIndex] = {
      ...current,
      measurement: measurementAt(rowIndex),
      ...(rowIndex < values.length
        ? sourceLocationAt(rowIndex)
          ? { sourceLocation: sourceLocationAt(rowIndex) }
          : { sourceLocation: undefined }
        : { sourceLocation: undefined }),
    };
    return { ...row, values: valuesForRow };
  });
  return { ...sheet, rows } as TwoConditionDataSheet;
}
