import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTabDelimitedPaste,
  createSpreadsheetGrid,
  parseTabDelimitedText,
  serializeSpreadsheetGrid,
  setSpreadsheetCell,
} from "./spreadsheet-grid-model.js";

test("ragged initial cells become an explicit rectangular grid", () => {
  const grid = createSpreadsheetGrid({
    rowCount: 2,
    columnCount: 2,
    cells: [["条件", "Dox −", "Dox +"], ["control"]],
  });

  assert.equal(grid.rowCount, 2);
  assert.equal(grid.columnCount, 3);
  assert.deepEqual(grid.cells, [
    ["条件", "Dox −", "Dox +"],
    ["control", "", ""],
  ]);
});

test("TSV parsing retains interior and trailing empty cell coordinates", () => {
  const parsed = parseTabDelimitedText("A\t\n\tD\n");

  assert.equal(parsed.rowCount, 2);
  assert.equal(parsed.columnCount, 2);
  assert.deepEqual(parsed.cells, [["A", ""], ["", "D"]]);
});

test("one clipboard terminator is ignored while an additional blank line remains a row", () => {
  assert.deepEqual(parseTabDelimitedText("A\n").cells, [["A"]]);
  assert.deepEqual(parseTabDelimitedText("A\n\n").cells, [["A"], [""]]);
});

test("rectangular paste expands rows and columns without changing outside cells", () => {
  const original = createSpreadsheetGrid({
    rowCount: 2,
    columnCount: 2,
    cells: [["corner", "keep-top"], ["keep-left", "old"]],
  });
  const result = applyTabDelimitedPaste(original, {
    startRow: 1,
    startColumn: 1,
    text: "実施\tなし\n不明\t実施",
  });

  assert.deepEqual(result.grid.cells, [
    ["corner", "keep-top", ""],
    ["keep-left", "実施", "なし"],
    ["", "不明", "実施"],
  ]);
  assert.deepEqual(result.range, {
    startRow: 1,
    startColumn: 1,
    endRow: 2,
    endColumn: 2,
    rowCount: 2,
    columnCount: 2,
  });
  assert.deepEqual(original.cells, [["corner", "keep-top"], ["keep-left", "old"]]);
});

test("an empty pasted cell clears only its addressed target coordinate", () => {
  const original = createSpreadsheetGrid({
    rowCount: 2,
    columnCount: 3,
    cells: [["A", "B", "C"], ["D", "E", "F"]],
  });
  const { grid } = applyTabDelimitedPaste(original, {
    startRow: 0,
    startColumn: 1,
    text: "\tX",
  });

  assert.deepEqual(grid.cells, [["A", "", "X"], ["D", "E", "F"]]);
});

test("single-cell editing is immutable and can expand the sheet", () => {
  const original = createSpreadsheetGrid({ cells: [["A"]] });
  const edited = setSpreadsheetCell(original, 2, 2, 0);

  assert.deepEqual(original.cells, [["A"]]);
  assert.deepEqual(edited.cells, [
    ["A", "", ""],
    ["", "", ""],
    ["", "", "0"],
  ]);
});

test("serialization preserves the full rectangle and empty coordinates", () => {
  const grid = createSpreadsheetGrid({
    rowCount: 3,
    columnCount: 3,
    cells: [["siRNA", "Dox −", "Dox +"], ["control", "実施", ""], ["", "", ""]],
  });

  assert.equal(
    serializeSpreadsheetGrid(grid),
    "siRNA\tDox −\tDox +\ncontrol\t実施\t\n\t\t",
  );
  assert.equal(
    serializeSpreadsheetGrid(grid, {
      trimTrailingEmptyRows: true,
      trimTrailingEmptyColumns: true,
    }),
    "siRNA\tDox −\tDox +\ncontrol\t実施\t",
  );
});

test("invalid coordinates stop instead of being silently coerced", () => {
  const grid = createSpreadsheetGrid();
  assert.throws(() => applyTabDelimitedPaste(grid, { startRow: -1, text: "x" }), /startRow/);
  assert.throws(() => setSpreadsheetCell(grid, 0.5, 0, "x"), /rowIndex/);
});
