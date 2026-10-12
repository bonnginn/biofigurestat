import { describe, expect, it } from "vitest";
import { createCategoryLayout, createNiceTicks } from "./graphLayout";

describe("graph layout", () => {
  it("keeps three simple categories in stable compact slots", () => {
    const layout = createCategoryLayout({
      gapWeights: [1, 1],
      spacing: 1,
      sidePadding: 72,
      canvasPreset: "standard",
    });
    expect(layout.offsets).toEqual([0, 88, 176]);
    expect(layout.innerWidth).toBe(320);
  });

  it("preserves hierarchy-aware gaps and expands a complex graph", () => {
    const layout = createCategoryLayout({
      gapWeights: [1, 2.5, 1, 2.5, 1],
      spacing: 1,
      sidePadding: 72,
      canvasPreset: "standard",
    });
    expect(layout.offsets[2] - layout.offsets[1]).toBe(220);
    expect(layout.innerWidth).toBeGreaterThan(740);
  });

  it("reserves enough width for long rendered category labels", () => {
    const layout = createCategoryLayout({
      gapWeights: [1],
      spacing: 1,
      sidePadding: 72,
      canvasPreset: "compact",
      requiredSlotWidths: [180, 140],
    });
    expect(layout.offsets[1] - layout.offsets[0]).toBeGreaterThanOrEqual(180);
  });

  it("generates human-friendly automatic ticks", () => {
    expect(createNiceTicks(0, 26.7)).toEqual([20, 10, 0]);
    expect(createNiceTicks(0, 1.4)).toEqual([1, 0.5, 0]);
  });

  it("honors a manual tick interval", () => {
    expect(createNiceTicks(0, 30, 5, 5)).toEqual([30, 25, 20, 15, 10, 5, 0]);
  });
});
