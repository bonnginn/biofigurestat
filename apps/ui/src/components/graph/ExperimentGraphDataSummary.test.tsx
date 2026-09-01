import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import type { GraphSeries } from "./experimentGraphDataExport";
import { ExperimentGraphDataSummary } from "./ExperimentGraphDataSummary";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

function graphSeries(overrides: Partial<GraphSeries> = {}): GraphSeries {
  return {
    seriesKey: "condition.control",
    conditionId: "condition.control",
    conditionLabel: "Control",
    xGroupKey: "condition.control",
    xGroupLabel: "Control",
    visualSeriesKey: "condition.control",
    visualSeriesLabel: "Control",
    facetKey: "facet.none",
    facetLabel: "",
    auxiliaryReference: false,
    timeLabel: "Day 2",
    proportionPoints: [],
    experimentPoints: [],
    rawPoints: [],
    summary: { n: 0, mean: null, median: null, sd: null },
    ...overrides,
  };
}

describe("ExperimentGraphDataSummary", () => {
  it("renders proportional counts without changing experimental-unit identity", () => {
    const view = render(
      <ExperimentGraphDataSummary
        shape="proportion"
        series={[
          graphSeries({
            proportionPoints: [
              {
                experimentId: "unit.1",
                experimentLabel: "Unit 1",
                value: 0.75,
                positive: 3,
                eligible: 4,
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText("1実験単位・3/4")).toBeInTheDocument();
    expect(view.container).toHaveTextContent("Control・Day 2");
  });

  it.each([
    ["proportion", graphSeries()] as const,
    [
      "nested_continuous",
      graphSeries({
        experimentPoints: [{ experimentId: "unit.1", experimentLabel: "Unit 1", value: 1 }],
        rawPoints: [
          { experimentId: "unit.1", experimentLabel: "Unit 1", value: 1, index: 0 },
          { experimentId: "unit.1", experimentLabel: "Unit 1", value: 2, index: 1 },
        ],
      }),
    ] as const,
    [
      "wb_ratio",
      graphSeries({
        experimentPoints: [{ experimentId: "unit.1", experimentLabel: "Unit 1", value: 1 }],
      }),
    ] as const,
  ])("contains no Japanese UI copy in English for %s", (shape, series) => {
    act(() => setAppLocale("en"));
    const view = render(<ExperimentGraphDataSummary shape={shape} series={[series]} />);

    expectNoJapaneseUi(view.container);
    expect(view.container).toHaveTextContent("Control · Day 2");
  });

  it("localizes the categorical summary instead of exposing fixed Japanese copy", () => {
    act(() => setAppLocale("en"));
    const view = render(<ExperimentGraphDataSummary shape="categorical_counts" series={[]} />);

    expect(view.container).toHaveTextContent(
      "Uses category counts and automatically calculated proportions.",
    );
    expectNoJapaneseUi(view.container);
  });
});
