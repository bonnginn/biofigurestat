import { describe, expect, it } from "vitest";
import {
  formatProportionPercentage,
  parseOptionalSpreadsheetNumber,
  parseSpreadsheetNumber,
} from "./spreadsheetValues";

describe("spreadsheet values", () => {
  it("parses finite decimal and integer cell values consistently", () => {
    expect(parseSpreadsheetNumber(" 1.25 ")).toBe(1.25);
    expect(parseSpreadsheetNumber("4", true)).toBe(4);
    expect(parseSpreadsheetNumber("4.2", true)).toBeNull();
    expect(parseSpreadsheetNumber("")).toBeNull();
    expect(parseSpreadsheetNumber("Infinity")).toBeNull();
  });

  it("distinguishes an empty optional cell from invalid numeric text", () => {
    expect(parseOptionalSpreadsheetNumber("  ")).toEqual({ kind: "empty" });
    expect(parseOptionalSpreadsheetNumber("1.25")).toEqual({ kind: "value", value: 1.25 });
    expect(parseOptionalSpreadsheetNumber("Infinity")).toEqual({ kind: "invalid" });
    expect(parseOptionalSpreadsheetNumber("4.2", true)).toEqual({ kind: "invalid" });
  });

  it("formats only complete valid proportion counts", () => {
    expect(formatProportionPercentage({ numerator: 40, denominator: 100 })).toBe("40.0%");
    expect(formatProportionPercentage({ numerator: null, denominator: 100 })).toBe("—");
    expect(formatProportionPercentage({ numerator: 2, denominator: 0 })).toBe("—");
    expect(formatProportionPercentage({ numerator: 11, denominator: 10 })).toBe("—");
  });
});
