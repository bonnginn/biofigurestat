import { describe, expect, it } from "vitest";
import {
  createCategoryLayout,
  createNiceTicks,
  createPlotRectangle,
  yAxisTitlePosition,
} from "./graphLayout";

describe("graph layout", () => {
  it("derives one exact drawable rectangle from canvas margins", () => {
    expect(createPlotRectangle(720, 520, { top: 44, right: 44, bottom: 88, left: 94 })).toEqual({
      left: 94,
      top: 44,
      right: 676,
      bottom: 432,
      width: 582,
      height: 388,
    });
  });

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

  it("emits one stable tick for a degenerate finite range", () => {
    expect(createNiceTicks(-5, -5)).toEqual([-5]);
  });

  it("keeps the Y title close while reserving space for the widest visible tick", () => {
    const compact = yAxisTitlePosition({
      axisX: 124,
      tickLabels: ["0", "0.5", "1", "1.5"],
      tickFontSize: 17,
      titleFontSize: 19,
    });
    const wide = yAxisTitlePosition({
      axisX: 124,
      tickLabels: ["-1000.0", "0", "1000.0"],
      tickFontSize: 17,
      titleFontSize: 19,
    });

    expect(compact).toBeGreaterThan(42);
    expect(compact).toBeLessThan(78);
    expect(wide).toBeLessThan(compact);
    expect(wide).toBeGreaterThanOrEqual(18);
  });
});
