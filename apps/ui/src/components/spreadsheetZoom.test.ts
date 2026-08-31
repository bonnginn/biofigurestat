import { describe, expect, it } from "vitest";

import {
  nextSpreadsheetZoom,
  normalizeSpreadsheetZoom,
  SPREADSHEET_ZOOM_LEVELS,
} from "./spreadsheetZoom";

describe("shared spreadsheet zoom", () => {
  it("uses the same bounded levels for every worksheet surface", () => {
    expect(SPREADSHEET_ZOOM_LEVELS).toEqual([70, 80, 90, 100, 110, 120, 130]);
    expect(nextSpreadsheetZoom(100, 1)).toBe(110);
    expect(nextSpreadsheetZoom(100, -1)).toBe(90);
    expect(nextSpreadsheetZoom(70, -1)).toBe(70);
    expect(nextSpreadsheetZoom(130, 1)).toBe(130);
  });

  it("falls back to 100 percent for an unknown persisted value", () => {
    expect(normalizeSpreadsheetZoom(95)).toBe(100);
    expect(normalizeSpreadsheetZoom(Number.NaN)).toBe(100);
  });
});
