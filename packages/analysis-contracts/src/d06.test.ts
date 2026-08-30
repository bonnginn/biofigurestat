import { describe, expect, it } from "vitest";

import { recommendD06 } from "./d06";

describe("recommendD06", () => {
  it("matches complete balanced longitudinal condition-by-time designs", () => {
    const result = recommendD06({
      conditionCount: 2,
      timePointCount: 4,
      sampling: "longitudinal",
      completeStableUnitsPerCondition: [4, 4],
    });
    expect(result.matched).toBe(true);
    if (!result.matched) return;
    expect(result.recommendation).toMatchObject({
      templateId: "D06",
      recommendedMethod: "mixed_anova",
      statisticalNDefinition: "Complete stable biological units within each condition",
    });
  });

  it("refuses cross-sectional, incomplete, and unbalanced structures", () => {
    expect(
      recommendD06({
        conditionCount: 2,
        timePointCount: 4,
        sampling: "cross_sectional",
        completeStableUnitsPerCondition: [4, 4],
      }),
    ).toMatchObject({ matched: false, reasonCode: "requires_longitudinal_identity" });
    expect(
      recommendD06({
        conditionCount: 2,
        timePointCount: 4,
        sampling: "longitudinal",
        completeStableUnitsPerCondition: [4, 3],
      }),
    ).toMatchObject({ matched: false, reasonCode: "requires_balanced_complete_units" });
  });
});
