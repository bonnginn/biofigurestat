import { describe, expect, it } from "vitest";
import {
  continuousAxisPosition,
  layoutComparisonBrackets,
  resolveFacetOrder,
  resolveVisibleSeries,
} from "./core-v1";

describe("Graph Core v1 structural stress contracts", () => {
  it("uses numeric geometry for irregular and long continuous X", () => {
    expect(continuousAxisPosition({ value: 1, minimum: 0, maximum: 10, scale: "linear" })).toBe(
      0.1,
    );
    expect(continuousAxisPosition({ value: 9, minimum: 0, maximum: 10, scale: "linear" })).toBe(
      0.9,
    );
    expect(
      continuousAxisPosition({ value: 10, minimum: 1, maximum: 100, scale: "log10" }),
    ).toBeCloseTo(0.5);
    expect(
      continuousAxisPosition({ value: 0, minimum: 1, maximum: 100, scale: "log10" }),
    ).toBeNaN();
  });

  it("stacks six overlapping pairwise brackets without collisions", () => {
    const laidOut = layoutComparisonBrackets([
      { id: "a", start: 0, end: 1 },
      { id: "b", start: 0, end: 2 },
      { id: "c", start: 0, end: 3 },
      { id: "d", start: 1, end: 3 },
      { id: "e", start: 2, end: 4 },
      { id: "f", start: 0, end: 4 },
    ]);
    expect(new Set(laidOut.map(({ level }) => level)).size).toBeGreaterThan(1);
    for (const first of laidOut) {
      for (const second of laidOut) {
        if (first.id === second.id || first.level !== second.level) continue;
        expect(first.end < second.start || first.start > second.end).toBe(true);
      }
    }
  });

  it("assigns the same bracket levels regardless of incoming comparison order", () => {
    const comparisons = [
      { id: "a", start: 0, end: 1 },
      { id: "b", start: 0, end: 2 },
      { id: "c", start: 1, end: 2 },
      { id: "d", start: 0, end: 3 },
    ];
    const levels = (input: typeof comparisons) =>
      Object.fromEntries(layoutComparisonBrackets(input).map(({ id, level }) => [id, level]));
    expect(levels(comparisons)).toEqual(levels([...comparisons].reverse()));
  });

  it("keeps legend metadata synchronized with order, visibility, line and point semantics", () => {
    const visible = resolveVisibleSeries([
      {
        id: "24h",
        label: "24 h",
        order: 2,
        visible: true,
        color: "#222",
        fill: "white",
        lineStyle: "dashed",
        pointStyle: "square",
      },
      {
        id: "0h",
        label: "0 h",
        order: 1,
        visible: true,
        color: "#111",
        fill: "none",
        lineStyle: "solid",
        pointStyle: "circle",
      },
      {
        id: "hidden",
        label: "Hidden",
        order: 0,
        visible: false,
        color: "#000",
        fill: "series",
        lineStyle: "solid",
        pointStyle: "triangle",
      },
    ]);
    expect(visible.map(({ label }) => label)).toEqual(["0 h", "24 h"]);
    expect(visible[1]).toMatchObject({ lineStyle: "dashed", pointStyle: "square" });
  });

  it("orders three-factor facet foundations deterministically", () => {
    expect(
      resolveFacetOrder([
        { levelId: "facet.c", order: 2, value: 3 },
        { levelId: "facet.a", order: 0, value: 1 },
        { levelId: "facet.b", order: 1, value: 2 },
      ]).map(({ value }) => value),
    ).toEqual([1, 2, 3]);
  });
});
