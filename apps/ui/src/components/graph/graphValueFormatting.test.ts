import { describe, expect, it } from "vitest";

import {
  formatGraphNumber,
  formatGraphPercentage,
  graphSignificanceSymbol,
} from "./graphValueFormatting";

describe("graph value formatting", () => {
  it("keeps finite graph labels bounded and missing values explicit", () => {
    expect(formatGraphNumber(1.2345)).toBe("1.23");
    expect(formatGraphNumber(Number.NaN)).toBe("—");
    expect(formatGraphPercentage(12.34)).toBe("12.3%");
    expect(formatGraphPercentage(null)).toBe("—");
  });

  it("uses the existing significance thresholds", () => {
    expect(graphSignificanceSymbol(0.00001)).toBe("****");
    expect(graphSignificanceSymbol(0.0005)).toBe("***");
    expect(graphSignificanceSymbol(0.005)).toBe("**");
    expect(graphSignificanceSymbol(0.04)).toBe("*");
    expect(graphSignificanceSymbol(0.05)).toBe("n.s.");
  });
});
