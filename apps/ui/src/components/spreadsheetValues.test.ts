import { describe, expect, it } from "vitest";
import { formatProportionPercentage, parseSpreadsheetNumber } from "./spreadsheetValues";

describe("spreadsheet values", () => {
  it("parses finite decimal and integer cell values consistently", () => {
    expect(parseSpreadsheetNumber(" 1.25 ")).toBe(1.25);
    expect(parseSpreadsheetNumber("4", true)).toBe(4);
    expect(parseSpreadsheetNumber("4.2", true)).toBeNull();
    expect(parseSpreadsheetNumber("")).toBeNull();
    expect(parseSpreadsheetNumber("Infinity")).toBeNull();
  });

  it("formats only complete valid proportion counts", () => {
    expect(formatProportionPercentage({ numerator: 40, denominator: 100 })).toBe("40.0%");
    expect(formatProportionPercentage({ numerator: null, denominator: 100 })).toBe("—");
    expect(formatProportionPercentage({ numerator: 2, denominator: 0 })).toBe("—");
    expect(formatProportionPercentage({ numerator: 11, denominator: 10 })).toBe("—");
  });
});
