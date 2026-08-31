import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { createCategoricalCompositionFixture } from "../../app/syntheticFixtures";
import { CompositionGraphSvg } from "./CompositionGraphSvg";
import { CorrelationGraphSvg } from "./CorrelationGraphSvg";
import type { GraphSeries } from "./experimentGraphDataExport";

type GraphAppearance = WorkspaceGraphState["appearance"];
type AxisSettings = WorkspaceGraphState["axes"];

const appearance = {
  palette: "colorblind",
  pointSize: 6,
  axisLineWidth: 1.4,
  tickFontSize: 17,
  axisTitleFontSize: 19,
  hierarchyFontSize: 17,
  legendFontSize: 16,
  fontFamily: "arial",
  seriesColors: {},
} as GraphAppearance;

const axes = {
  yTitle: "Response",
  yRangeMode: "auto",
  yMin: null,
  yMax: null,
  yTickMode: "auto",
  yTickInterval: null,
  tickDirection: "outside",
} as AxisSettings;

describe("extracted graph renderers", () => {
  it("renders categorical composition from canonical count cells with nice ticks", () => {
    const fixture = createCategoricalCompositionFixture();
    const readout = fixture.draft.readouts[0]!;
    const { container } = render(
      <CompositionGraphSvg
        draft={fixture.draft}
        cells={fixture.cells}
        readout={readout}
        conditionIds={fixture.draft.conditions.map(({ id }) => id)}
        timePointIds={[]}
        graphType="stacked_100"
        appearance={appearance}
        axes={axes}
        svgRef={createRef<SVGSVGElement>()}
      />,
    );

    expect(screen.getByRole("img", { name: "Cell-cycle compositionのカテゴリ構成グラフ" }))
      .toBeInTheDocument();
    expect(container.querySelectorAll('[data-graph-layer="category-stack"]')).toHaveLength(8);
    expect(
      [...container.querySelectorAll('[data-axis-tick="y"]')].map(
        (node) => node.parentElement?.textContent,
      ),
    ).toEqual(["100", "80", "60", "40", "20", "0"]);
  });

  it("pairs correlation points by stable experiment identity and keeps nice axis ticks", () => {
    const base = {
      xGroupKey: "xy",
      xGroupLabel: "XY",
      visualSeriesKey: "xy",
      visualSeriesLabel: "XY",
      facetKey: "facet.none",
      facetLabel: "",
      auxiliaryReference: false,
      proportionPoints: [],
      rawPoints: [],
      summary: { n: 2, mean: 1.5, median: 1.5, sd: 0.7 },
    } as const;
    const series = [
      {
        ...base,
        seriesKey: "x",
        conditionId: "x",
        conditionLabel: "X value",
        experimentPoints: [
          { experimentId: "unit.1", experimentLabel: "Unit 1", value: 1 },
          { experimentId: "unit.2", experimentLabel: "Unit 2", value: 2 },
        ],
      },
      {
        ...base,
        seriesKey: "y",
        conditionId: "y",
        conditionLabel: "Y value",
        experimentPoints: [
          { experimentId: "unit.1", experimentLabel: "Unit 1", value: 10 },
          { experimentId: "unit.2", experimentLabel: "Unit 2", value: 20 },
        ],
      },
    ] as readonly GraphSeries[];
    const { container } = render(
      <CorrelationGraphSvg
        series={series}
        appearance={appearance}
        axes={axes}
        svgRef={createRef<SVGSVGElement>()}
        analysisResult={null}
        statisticsAnnotation={{ mode: "hidden", testIndex: 0 }}
        onInspect={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "X valueとResponseの散布図" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-experimental-unit]")).toHaveLength(2);
    const xTickLabels = [...container.querySelectorAll('[data-axis-tick="x"]')].map(
      (node) => node.parentElement?.textContent ?? "",
    );
    const yTickLabels = [...container.querySelectorAll('[data-axis-tick="y"]')].map(
      (node) => node.parentElement?.textContent ?? "",
    );
    expect(xTickLabels.length).toBeGreaterThanOrEqual(3);
    expect(yTickLabels.length).toBeGreaterThanOrEqual(3);
    expect([...xTickLabels, ...yTickLabels]).toEqual(
      expect.not.arrayContaining([expect.stringMatching(/\.\d{3,}/u)]),
    );
  });
});
