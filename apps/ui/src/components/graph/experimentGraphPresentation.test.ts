import { describe, expect, it } from "vitest";

import { createInitialGraphGrouping } from "../../app/graphGrouping";
import {
  createCategoricalCompositionFixture,
  createSimpleIndependentContinuousFixture,
} from "../../app/syntheticFixtures";
import type { GraphSeries } from "./experimentGraphDataExport";
import {
  buildConditionAxisLabels,
  buildGraphFacetGroups,
  hasVisibleGraphData,
  uniqueVisualSeriesOptions,
} from "./experimentGraphPresentation";

function graphSeries(
  conditionId: string,
  conditionLabel: string,
  overrides: Partial<GraphSeries> = {},
): GraphSeries {
  return {
    seriesKey: conditionId,
    conditionId,
    conditionLabel,
    xGroupKey: conditionId,
    xGroupLabel: conditionLabel,
    visualSeriesKey: conditionId,
    visualSeriesLabel: conditionLabel,
    facetKey: "facet.none",
    facetLabel: "",
    auxiliaryReference: false,
    proportionPoints: [],
    experimentPoints: [],
    rawPoints: [],
    summary: { n: 0, mean: null, median: null, sd: null },
    ...overrides,
  };
}

describe("experiment Graph presentation projection", () => {
  it("derives X-axis levels from declared factors without changing condition identity", () => {
    const { draft } = createSimpleIndependentContinuousFixture();
    const series = draft.conditions.map(({ id, label }) => graphSeries(id, label));

    const labels = buildConditionAxisLabels({
      draft,
      series,
      hierarchyOrder: draft.attributes.map(({ id }) => id),
      grouping: createInitialGraphGrouping(draft),
    });

    expect(labels.map(({ conditionId }) => conditionId)).toEqual(
      draft.conditions.map(({ id }) => id),
    );
    expect(labels.map(({ levels }) => levels[0])).toEqual([
      { id: "attribute.group", label: "Group", value: "Control" },
      { id: "attribute.group", label: "Group", value: "Treatment A" },
      { id: "attribute.group", label: "Group", value: "Treatment B" },
    ]);
  });

  it("keeps facet rows and labels aligned while honoring explicit facet order", () => {
    const series = [
      graphSeries("condition.a", "A", { facetKey: "late", facetLabel: "Late" }),
      graphSeries("condition.b", "B", { facetKey: "early", facetLabel: "Early" }),
      graphSeries("condition.c", "C", { facetKey: "late", facetLabel: "Late" }),
    ];
    const axisLabels = series.map(({ conditionId, conditionLabel }) => ({
      conditionId,
      levels: [{ id: "condition", label: "Condition", value: conditionLabel }],
      timeLabel: "",
    }));

    const facets = buildGraphFacetGroups({
      series,
      axisLabels,
      requestedOrder: ["Early", "Late"],
    });

    expect(facets.map(({ label }) => label)).toEqual(["Early", "Late"]);
    expect(facets[1]?.rows.map(({ conditionId }) => conditionId)).toEqual([
      "condition.a",
      "condition.c",
    ]);
    expect(facets[1]?.labels.map(({ conditionId }) => conditionId)).toEqual([
      "condition.a",
      "condition.c",
    ]);
  });

  it("deduplicates legend series without dropping the first configured style slot", () => {
    const series = [
      graphSeries("condition.a", "A", {
        visualSeriesKey: "series.control",
        visualSeriesLabel: "Control",
      }),
      graphSeries("condition.b", "B", {
        visualSeriesKey: "series.control",
        visualSeriesLabel: "Control",
      }),
      graphSeries("condition.c", "C", {
        visualSeriesKey: "series.drug",
        visualSeriesLabel: "Drug",
      }),
    ];

    expect(uniqueVisualSeriesOptions(series).map(({ conditionId }) => conditionId)).toEqual([
      "condition.a",
      "condition.c",
    ]);
  });

  it("detects only values that the selected data layer can actually render", () => {
    const categorical = createCategoricalCompositionFixture();
    expect(
      hasVisibleGraphData({
        shape: "categorical_counts",
        sourceMode: "raw_readout",
        series: [],
        cells: categorical.cells,
      }),
    ).toBe(true);

    const rawOnly = graphSeries("condition.raw", "Raw", {
      rawPoints: [{ experimentId: "unit.1", experimentLabel: "Unit 1", value: 2, index: 0 }],
    });
    expect(
      hasVisibleGraphData({
        shape: "nested_continuous",
        sourceMode: "raw_readout",
        series: [rawOnly],
        cells: {},
      }),
    ).toBe(true);
    expect(
      hasVisibleGraphData({
        shape: "nested_continuous",
        sourceMode: "derived_metric",
        series: [rawOnly],
        cells: {},
      }),
    ).toBe(false);
  });
});
