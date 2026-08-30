import { describe, expect, it } from "vitest";

import { formatExactPValue } from "./statisticalFormat";

describe("exact p-value formatting", () => {
  it.each([
    [0.2, "0.2"],
    [0.0311, "0.0311"],
    [0.001, "0.001"],
    [0.0000351, "3.51e-5"],
    [3.51e-6, "3.51e-6"],
    [1e-8, "1.00e-8"],
    [1e-12, "1.00e-12"],
    [0.999999, "0.999999"],
  ])("faithfully formats p=%s as %s", (value, expected) => {
    expect(formatExactPValue(value)).toBe(expected);
    expect(formatExactPValue(value)).not.toBe("0");
  });

  it("reserves zero for an actual stored zero", () => {
    expect(formatExactPValue(0)).toBe("0");
  });
});
