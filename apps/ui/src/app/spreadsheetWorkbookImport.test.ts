import { describe, expect, it } from "vitest";
import { parseDelimitedRecords } from "@lsaa/adaptive-input";
import { spreadsheetRowsToTsv, spreadsheetWorkbookToStackedTsv, parseSpreadsheetA1Range, spreadsheetSheetSelectionToTsv, mergeImportedSpreadsheetWorkbooks } from "./spreadsheetWorkbookImport";

describe("workbook delimited cell preservation", () => {
  it("quotes leading quotes, embedded tabs and newlines while keeping empty cells", () => {
    const rows = [
      ["Label", "Notes", "Value", "Empty"],
      ['"quoted label', "line1\nline2\tpart", "0", ""],
      ["plain", "", "0.000001", ""],
    ];
    const before = structuredClone(rows);
    const text = spreadsheetRowsToTsv(rows);
    expect(text).toBe(
      'Label\tNotes\tValue\tEmpty\n"""quoted label"\t"line1\nline2\tpart"\t0\t\nplain\t\t0.000001\t',
    );
    expect(parseDelimitedRecords(text, "\t")).toEqual(rows);
    expect(rows).toEqual(before);
  });

  it("keeps multiline worksheet provenance and data when stacking compatible sheets", () => {
    const workbook = {
      fileName: "local.xlsx",
      sheets: [
        {
          name: '"First\nworksheet',
          rows: [
            ["Label", "Value"],
            ["A\tB", "1"],
          ],
        },
        {
          name: "Second",
          rows: [
            ["Label", "Value"],
            ["C\nD", ""],
          ],
        },
      ],
    };
    const before = structuredClone(workbook);
    expect(parseDelimitedRecords(spreadsheetWorkbookToStackedTsv(workbook), "\t")).toEqual([
      ["Experiment / worksheet", "Label", "Value"],
      ['"First\nworksheet', "A\tB", "1"],
      ["Second", "C\nD", ""],
    ]);
    expect(workbook).toEqual(before);
  });
});

describe("restored alpha4 Excel selection", () => {
  it("selects a range with three header rows while retaining quoted data and source rows", () => {
    const sheet = {name: "Sheet", rows: [["ignored", "Treatment", ""], ["ignored", "Dose", ""], ["ignored", "Value", "Note"], ["ignored", "1.000", "line1\nline2\tpart"]]};
    const before = structuredClone(sheet);
    const selection = parseSpreadsheetA1Range("B1:C4", sheet, 3);
    expect(parseDelimitedRecords(spreadsheetSheetSelectionToTsv(sheet, selection), "\t")).toEqual([["Treatment / Dose / Value", "Treatment / Dose / Note"], ["1.000", "line1\nline2\tpart"]]);
    expect(sheet).toEqual(before);
  });
  it("rejects reversed, out-of-sheet and header-only ranges", () => {
    const sheet = {name: "Sheet", rows: [["X", "Y"], ["1", "2"]]};
    for (const range of ["B2:A1", "A1:C2", "A1:B1", "A0:B2"]) expect(() => parseSpreadsheetA1Range(range, sheet, 1)).toThrow();
  });
  it("retains source identity across multiple workbooks without inferring n", () => {
    const workbooks = [{fileName:"a.xlsx",sheets:[{name:"Sheet",rows:[["X"],["1"]]}]}, {fileName:"b.xlsx",sheets:[{name:"Sheet",rows:[["X"],["2"]]}]}];
    const before = structuredClone(workbooks);
    const merged = mergeImportedSpreadsheetWorkbooks(workbooks)!;
    expect(merged.sourceFiles).toEqual(["a.xlsx", "b.xlsx"]);
    expect(merged.sheets.map(({name})=>name)).toEqual(["a.xlsx / Sheet", "b.xlsx / Sheet"]);
    expect(workbooks).toEqual(before);
  });
});

it("keeps same-named files as distinct descriptive sources", () => {const merged=mergeImportedSpreadsheetWorkbooks([{fileName:"same.xlsx",sheets:[{name:"Sheet",rows:[["h"],["a"]]}]},{fileName:"same.xlsx",sheets:[{name:"Sheet",rows:[["h"],["b"]]}]}]); expect(merged?.sourceFiles).toEqual(["same.xlsx [1]","same.xlsx [2]"]); expect(merged?.sheets.map(s=>s.name)).toEqual(["same.xlsx [1] / Sheet","same.xlsx [2] / Sheet"]);});
