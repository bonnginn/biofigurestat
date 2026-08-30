import { describe, expect, it } from "vitest";

import { violinDensityPath } from "./graphGeometry";

describe("violinDensityPath", () => {
  it("keeps the density shape inside the observed measurement range", () => {
    const path = violinDensityPath([0.72, 0.75, 0.81, 0.77], 50, (value) => value * 100, 12);

    expect(path).not.toBeNull();
    const yCoordinates = [...path!.matchAll(/,(-?\d+(?:\.\d+)?)/gu)].map((match) =>
      Number(match[1]),
    );
    expect(Math.min(...yCoordinates)).toBeGreaterThanOrEqual(72);
    expect(Math.max(...yCoordinates)).toBeLessThanOrEqual(81);
  });

  it("does not invent a one-sided violin for identical values", () => {
    expect(violinDensityPath([1, 1, 1], 50, (value) => value * 100, 12)).toBeNull();
  });
});
