import { describe, expect, it } from "vitest";
import { createCategoryLayout } from "./graphLayout";

describe("Graph Core v1 categorical stress layouts", () => {
  it("keeps 2x2 and 5x2 grouped designs ordered with separate within/between gaps", () => {
    const twoByTwo = createCategoryLayout({
      gapWeights: [0.7, 1.4, 0.7],
      spacing: 1,
      sidePadding: 72,
      canvasPreset: "standard",
    });
    const fiveByTwo = createCategoryLayout({
      gapWeights: [0.7, 1.4, 0.7, 1.4, 0.7, 1.4, 0.7, 1.4, 0.7],
      spacing: 1,
      sidePadding: 72,
      canvasPreset: "standard",
    });
    expect(twoByTwo.offsets).toHaveLength(4);
    expect(fiveByTwo.offsets).toHaveLength(10);
    expect(fiveByTwo.innerWidth).toBeLessThan(1_500);
  });

  it("keeps a 20+ category layout finite for long labels", () => {
    const layout = createCategoryLayout({
      gapWeights: Array.from({ length: 23 }, () => 1),
      spacing: 1,
      sidePadding: 72,
      canvasPreset: "compact",
      requiredSlotWidths: Array.from({ length: 24 }, (_, index) => 80 + (index % 3) * 20),
    });
    expect(layout.offsets).toHaveLength(24);
    expect(layout.innerWidth).toBeLessThan(3_500);
    expect(layout.offsets.every(Number.isFinite)).toBe(true);
  });
});
