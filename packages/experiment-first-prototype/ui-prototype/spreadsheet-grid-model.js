/**
 * DOM-independent spreadsheet helpers for the isolated experiment-first UI.
 *
 * The grid deliberately carries no biological or statistical meaning. It only
 * preserves rectangular cell coordinates so the caller can map an Excel-like
 * condition sheet through the existing deterministic semantic adapter.
 */

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
}

function cellText(value) {
  return value == null ? "" : String(value);
}

function cloneRectangularCells(cells, rowCount, columnCount) {
  return Array.from({ length: rowCount }, (_, rowIndex) => (
    Array.from({ length: columnCount }, (_, columnIndex) => cellText(cells?.[rowIndex]?.[columnIndex]))
  ));
}

/**
 * Create a rectangular, immutable-by-convention grid value.
 *
 * Ragged input rows are padded with explicit empty strings. Supplied dimensions
 * are minimums; existing cell coordinates are never truncated.
 */
export function createSpreadsheetGrid({ rowCount = 1, columnCount = 1, cells = [] } = {}) {
  assertNonNegativeInteger(rowCount, "rowCount");
  assertNonNegativeInteger(columnCount, "columnCount");
  if (!Array.isArray(cells) || cells.some((row) => !Array.isArray(row))) {
    throw new TypeError("cells must be an array of row arrays.");
  }

  const normalizedRowCount = Math.max(rowCount, cells.length);
  const widestInputRow = cells.reduce((widest, row) => Math.max(widest, row.length), 0);
  const normalizedColumnCount = Math.max(columnCount, widestInputRow);

  return {
    rowCount: normalizedRowCount,
    columnCount: normalizedColumnCount,
    cells: cloneRectangularCells(cells, normalizedRowCount, normalizedColumnCount),
  };
}

/**
 * Parse plain spreadsheet clipboard text while retaining empty cell positions.
 *
 * A single final line ending (the normal clipboard terminator from Excel and
 * similar tools) is ignored. Additional blank lines remain real pasted rows.
 */
export function parseTabDelimitedText(text) {
  let normalized = cellText(text).replace(/\r\n?/g, "\n");
  if (normalized.endsWith("\n")) normalized = normalized.slice(0, -1);

  const rows = normalized.split("\n").map((line) => line.split("\t"));
  const columnCount = rows.reduce((widest, row) => Math.max(widest, row.length), 1);

  return createSpreadsheetGrid({
    rowCount: Math.max(rows.length, 1),
    columnCount,
    cells: rows,
  });
}

/**
 * Paste TSV text starting at a zero-based cell coordinate.
 *
 * The returned grid is a new value. Cells outside the pasted rectangle are
 * preserved, rows/columns grow as needed, and pasted empty cells deliberately
 * replace the corresponding target cells with an empty string.
 */
export function applyTabDelimitedPaste(grid, {
  startRow = 0,
  startColumn = 0,
  text = "",
} = {}) {
  assertNonNegativeInteger(startRow, "startRow");
  assertNonNegativeInteger(startColumn, "startColumn");

  const current = createSpreadsheetGrid(grid);
  const pasted = parseTabDelimitedText(text);
  const rowCount = Math.max(current.rowCount, startRow + pasted.rowCount);
  const columnCount = Math.max(current.columnCount, startColumn + pasted.columnCount);
  const next = createSpreadsheetGrid({
    rowCount,
    columnCount,
    cells: current.cells,
  });

  for (let pastedRow = 0; pastedRow < pasted.rowCount; pastedRow += 1) {
    for (let pastedColumn = 0; pastedColumn < pasted.columnCount; pastedColumn += 1) {
      next.cells[startRow + pastedRow][startColumn + pastedColumn] = pasted.cells[pastedRow][pastedColumn];
    }
  }

  return {
    grid: next,
    range: {
      startRow,
      startColumn,
      endRow: startRow + pasted.rowCount - 1,
      endColumn: startColumn + pasted.columnCount - 1,
      rowCount: pasted.rowCount,
      columnCount: pasted.columnCount,
    },
  };
}

/** Return a new grid with one cell changed, expanding it when necessary. */
export function setSpreadsheetCell(grid, rowIndex, columnIndex, value) {
  assertNonNegativeInteger(rowIndex, "rowIndex");
  assertNonNegativeInteger(columnIndex, "columnIndex");
  const current = createSpreadsheetGrid(grid);
  const next = createSpreadsheetGrid({
    rowCount: Math.max(current.rowCount, rowIndex + 1),
    columnCount: Math.max(current.columnCount, columnIndex + 1),
    cells: current.cells,
  });
  next.cells[rowIndex][columnIndex] = cellText(value);
  return next;
}

function trailingNonEmptyRowCount(grid) {
  let count = grid.rowCount;
  while (count > 0 && grid.cells[count - 1].every((cell) => cell === "")) count -= 1;
  return count;
}

function trailingNonEmptyColumnCount(grid, rowCount) {
  let count = grid.columnCount;
  while (count > 0) {
    const isEmpty = Array.from({ length: rowCount }, (_, rowIndex) => grid.cells[rowIndex][count - 1])
      .every((cell) => cell === "");
    if (!isEmpty) break;
    count -= 1;
  }
  return count;
}

/**
 * Serialize a grid to plain tab-delimited text.
 *
 * Exact rectangular serialization is the default. The trailing-edge options
 * are useful for a generously preallocated blank UI without dropping interior
 * empty cells or changing their coordinates.
 */
export function serializeSpreadsheetGrid(grid, {
  trimTrailingEmptyRows = false,
  trimTrailingEmptyColumns = false,
} = {}) {
  const normalized = createSpreadsheetGrid(grid);
  const rowCount = trimTrailingEmptyRows ? trailingNonEmptyRowCount(normalized) : normalized.rowCount;
  const columnCount = trimTrailingEmptyColumns
    ? trailingNonEmptyColumnCount(normalized, rowCount)
    : normalized.columnCount;

  if (rowCount === 0 || columnCount === 0) return "";
  return normalized.cells
    .slice(0, rowCount)
    .map((row) => row.slice(0, columnCount).join("\t"))
    .join("\n");
}
