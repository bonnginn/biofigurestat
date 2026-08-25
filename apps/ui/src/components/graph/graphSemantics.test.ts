import { describe, expect, it } from "vitest";
import {
  buildHierarchyGroups,
  computeBoxWhiskerSummary,
  createMinorTicks,
  graphDisplayLabel,
  omitGenericCategoricalAxisTitle,
  resolveSeriesLinePresentation,
} from "./graphSemantics";

describe("generic graph semantics", () => {
  it("computes Tukey whiskers and preserves outliers", () => {
    const summary = computeBoxWhiskerSummary([1, 2, 2, 3, 3, 4, 20], "tukey_1_5_iqr");
    expect(summary).toMatchObject({ lowerWhisker: 1, upperWhisker: 4, outliers: [20] });
  });

  it("supports min-max whiskers for n=3 and constant-ish data", () => {
    expect(computeBoxWhiskerSummary([0.7, 0.71, 0.72], "min_max")).toMatchObject({
      lowerWhisker: 0.7,
      upperWhisker: 0.72,
      outliers: [],
    });
    expect(computeBoxWhiskerSummary([1, 1, 1, 1], "tukey_1_5_iqr")).toMatchObject({
      lowerWhisker: 1,
      upperWhisker: 1,
      outliers: [],
    });
  });

  it("creates minor ticks without extending beyond the sampled numeric domain", () => {
    const ticks = createMinorTicks([0, 10, 20], 0, 20, 5);
    expect(ticks).toEqual([2, 4, 6, 8, 12, 14, 16, 18]);
    expect(ticks.every((value) => value > 0 && value < 20)).toBe(true);
  });

  it("uses explicit labels before safe humanized fallbacks", () => {
    expect(
      graphDisplayLabel({
        explicitLabel: "Cell roundness",
        designLabel: "Circularity",
        internalName: "circularity",
      }),
    ).toBe("Cell roundness");
    expect(graphDisplayLabel({ internalName: "nuclear_to_cytosol_ratio" })).toBe(
      "Nuclear/cytosol ratio",
    );
    expect(graphDisplayLabel({ internalName: "custom_readout_name" })).toBe("Custom readout name");
  });

  it("omits only generic categorical axis titles", () => {
    expect(omitGenericCategoricalAxisTitle("Genotype")).toBe("");
    expect(omitGenericCategoricalAxisTitle("Condition")).toBe("");
    expect(omitGenericCategoricalAxisTitle("siRNA")).toBe("siRNA");
  });

  it("groups explicit hierarchical labels for unequal intervention blocks", () => {
    const groups = buildHierarchyGroups([
      { levels: [{ value: "control" }, { value: "-" }] },
      { levels: [{ value: "Ndel1" }, { value: "#1" }] },
      { levels: [{ value: "Ndel1" }, { value: "#2" }] },
      { levels: [{ value: "NDE1 with a deliberately long parent label" }, { value: "#1" }] },
    ]);
    expect(groups[0]).toEqual([
      { key: "control", label: "control", start: 0, end: 0 },
      { key: "Ndel1", label: "Ndel1", start: 1, end: 2 },
      {
        key: "NDE1 with a deliberately long parent label",
        label: "NDE1 with a deliberately long parent label",
        start: 3,
        end: 3,
      },
    ]);
    expect(groups[1]).toHaveLength(4);
  });

  it("keeps per-series width and dash semantics synchronized", () => {
    expect(resolveSeriesLinePresentation({ lineStyle: "dashed", lineWidth: 3.5 }, 2)).toEqual({
      lineStyle: "dashed",
      lineWidth: 3.5,
      dashArray: "8 5",
    });
    expect(resolveSeriesLinePresentation(undefined, 2)).toEqual({
      lineStyle: "solid",
      lineWidth: 2,
      dashArray: undefined,
    });
  });
});
