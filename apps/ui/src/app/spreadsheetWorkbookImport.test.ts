import { describe, expect, it } from "vitest";

import {
  parseSpreadsheetA1Range,
  spreadsheetSheetDefaultRange,
  spreadsheetSheetSelectionToTsv,
  type ImportedSpreadsheetSheet,
} from "./spreadsheetWorkbookImport";

const sheet: ImportedSpreadsheetSheet = {
  name: "Measurements",
  rows: [
    ["Metadata", "", "Treatment", ""],
    ["Sample ID", "Date", "Vehicle", "Drug A"],
    ["S01", "2026-09-01", "1.0", "1.5"],
    ["S02", "2026-09-02", "1.1", "1.6"],
    ["note outside table", "", "", ""],
  ],
};

describe("spreadsheet workbook range selection", () => {
  it("uses familiar A1 notation and rejects reversed or out-of-sheet ranges", () => {
    expect(spreadsheetSheetDefaultRange(sheet)).toBe("A1:D5");
    expect(parseSpreadsheetA1Range("A1:D4", sheet, 2)).toEqual({
      startRow: 0,
      endRow: 3,
      startColumn: 0,
      endColumn: 3,
      headerRowCount: 2,
    });
    expect(() => parseSpreadsheetA1Range("D4:A1", sheet, 1)).toThrow(/左上/u);
    expect(() => parseSpreadsheetA1Range("A1:E4", sheet, 1)).toThrow(/使用範囲/u);
    expect(() => parseSpreadsheetA1Range("A1:D2", sheet, 2)).toThrow(/データ/u);
  });

  it("flattens two-level merged-style headings without changing data cells", () => {
    const selection = parseSpreadsheetA1Range("A1:D4", sheet, 2);
    expect(spreadsheetSheetSelectionToTsv(sheet, selection)).toBe(
      [
        "Metadata / Sample ID\tMetadata / Date\tTreatment / Vehicle\tTreatment / Drug A",
        "S01\t2026-09-01\t1.0\t1.5",
        "S02\t2026-09-02\t1.1\t1.6",
      ].join("\n"),
    );
  });

  it("selects a strict subtable and preserves blank internal values", () => {
    const selected = spreadsheetSheetSelectionToTsv(
      {
        name: "Subtable",
        rows: [
          ["ignore", "Condition", "Value", "Note"],
          ["x", "Vehicle", "1.0", ""],
          ["x", "Drug", "1.5", "kept"],
        ],
      },
      {
        startRow: 0,
        endRow: 2,
        startColumn: 1,
        endColumn: 3,
        headerRowCount: 1,
      },
    );
    expect(selected).toBe("Condition\tValue\tNote\nVehicle\t1.0\t\nDrug\t1.5\tkept");
  });
});
