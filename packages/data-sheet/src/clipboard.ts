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
}>;

function splitCommaRow(row: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
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
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { delimiter: "lines", headers: [], rows: [], columns: [], recommendedColumnIndex: null };
  }
  const delimiter: ClipboardDelimiter = lines.some((line) => line.includes("\t"))
    ? "tab"
    : lines.some((line) => line.includes(","))
      ? "comma"
      : "lines";
  const split = (line: string) =>
    delimiter === "tab"
      ? line.split("\t").map((cell) => cell.trim())
      : delimiter === "comma"
        ? splitCommaRow(line)
        : [line.trim()];
  const matrix = lines.map(split);
  const firstRow = matrix[0];
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
