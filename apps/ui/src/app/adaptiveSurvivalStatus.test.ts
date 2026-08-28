import { describe, expect, it } from "vitest";

import { decodeAdaptiveSurvivalStatus } from "./adaptiveSurvivalStatus";

describe("adaptive survival status decoder", () => {
  it.each([
    [true, true],
    [false, false],
    ["Event", true],
    ["Observed", true],
    ["event_observed", true],
    ["Censored", false],
    ["censor", false],
  ] as const)("decodes explicit status %j", (input, expected) => {
    expect(decodeAdaptiveSurvivalStatus(input)).toBe(expected);
  });

  it.each([null, undefined, "", "   "])("rejects missing status %j", (input) => {
    expect(() => decodeAdaptiveSurvivalStatus(input)).toThrow("ADAPTIVE_SURVIVAL_STATUS_MISSING");
  });

  it.each([0, 1, "0", "1"])("rejects numeric status %j without a mapping", (input) => {
    expect(() => decodeAdaptiveSurvivalStatus(input)).toThrow(
      "ADAPTIVE_SURVIVAL_NUMERIC_STATUS_REQUIRES_EXPLICIT_MAPPING",
    );
  });

  it.each(["unknown", "dead", "lost to follow-up", {}, []])(
    "rejects unknown status %j instead of treating it as censored",
    (input) => {
      expect(() => decodeAdaptiveSurvivalStatus(input)).toThrow(
        /ADAPTIVE_SURVIVAL_STATUS_(?:INVALID|MISSING)/u,
      );
    },
  );
});
