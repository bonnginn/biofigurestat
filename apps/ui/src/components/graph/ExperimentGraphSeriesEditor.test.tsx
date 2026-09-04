import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import type { GraphSeries } from "./experimentGraphDataExport";
import { ExperimentGraphSeriesEditor } from "./ExperimentGraphSeriesEditor";

type LayerState = WorkspaceGraphState["layers"];
type GraphAppearance = WorkspaceGraphState["appearance"];

afterEach(() => act(() => resetAppLocaleForTests("ja")));

const series: GraphSeries = {
  seriesKey: "condition.control",
  conditionId: "condition.control",
  conditionLabel: "Control",
  xGroupKey: "condition.control",
  xGroupLabel: "Control",
  visualSeriesKey: "series.control",
  visualSeriesLabel: "Control",
  facetKey: "facet.none",
  facetLabel: "",
  auxiliaryReference: false,
  proportionPoints: [],
  experimentPoints: [],
  rawPoints: [],
  summary: { n: 0, mean: null, median: null, sd: null },
};

const treatmentSeries: GraphSeries = {
  ...series,
  seriesKey: "condition.treatment",
  conditionId: "condition.treatment",
  conditionLabel: "Treatment",
  visualSeriesKey: "series.treatment",
  visualSeriesLabel: "Treatment",
};

const initialLayers = { experiment: true, overall: true } as LayerState;
const initialAppearance = {
  pointSize: 6,
  summaryLineWidth: 1.5,
  summaryColor: "#111111",
  palette: "colorblind",
  seriesStyles: {},
} as GraphAppearance;

function Harness({
  mode,
  visualSeriesOptions = [series],
}: {
  mode: "experiment-summary" | "series-style";
  visualSeriesOptions?: readonly GraphSeries[];
}) {
  const [layers, setLayers] = useState(initialLayers);
  const [appearance, setAppearance] = useState(initialAppearance);
  return (
    <>
      <ExperimentGraphSeriesEditor
        mode={mode}
        layers={layers}
        appearance={appearance}
        visualSeriesOptions={visualSeriesOptions}
        setLayers={setLayers}
        setAppearance={setAppearance}
      />
      <output data-testid="layers-state">{JSON.stringify(layers)}</output>
      <output data-testid="appearance-state">{JSON.stringify(appearance)}</output>
    </>
  );
}

describe("ExperimentGraphSeriesEditor", () => {
  it("edits summary visibility and appearance without touching series data", () => {
    render(<Harness mode="experiment-summary" />);

    fireEvent.click(screen.getByLabelText("実験単位の点を表示"));
    fireEvent.change(screen.getByLabelText("実験単位点の大きさ"), {
      target: { value: "8" },
    });

    expect(screen.getByTestId("layers-state")).toHaveTextContent('"experiment":false');
    expect(screen.getByTestId("appearance-state")).toHaveTextContent('"pointSize":8');
  });

  it("updates only the selected visual-series style slot", () => {
    render(<Harness mode="series-style" />);

    fireEvent.change(screen.getByLabelText("Controlの線種"), {
      target: { value: "dashed" },
    });
    fireEvent.change(screen.getByLabelText("Controlの点"), {
      target: { value: "square" },
    });

    expect(screen.getByTestId("appearance-state")).toHaveTextContent(
      '"series.control":{"lineStyle":"dashed","pointStyle":"square"}',
    );
  });

  it("applies one series appearance to all series without replacing labels, order, or visibility", () => {
    render(<Harness mode="series-style" visualSeriesOptions={[series, treatmentSeries]} />);

    fireEvent.change(screen.getByLabelText("Controlの色"), {
      target: { value: "#b42318" },
    });
    fireEvent.change(screen.getByLabelText("Controlの線種"), {
      target: { value: "dashed" },
    });
    fireEvent.change(screen.getByLabelText("Controlの線幅"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Controlの点"), {
      target: { value: "triangle" },
    });
    fireEvent.change(screen.getByLabelText("Treatmentの凡例ラベル"), {
      target: { value: "Drug" },
    });
    fireEvent.change(screen.getByLabelText("Treatmentの順序"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByLabelText("Treatmentを表示"));

    fireEvent.click(screen.getAllByRole("button", { name: "この見た目を全系列へ適用" })[0]);

    const state = JSON.parse(screen.getByTestId("appearance-state").textContent ?? "{}") as {
      seriesStyles: Record<string, Record<string, unknown>>;
    };
    expect(state.seriesStyles["series.treatment"]).toMatchObject({
      color: "#b42318",
      lineStyle: "dashed",
      lineWidth: 3,
      pointStyle: "triangle",
      legendLabel: "Drug",
      order: 7,
      visible: false,
    });
  });

  it("contains no fixed Japanese editor copy in English", () => {
    act(() => setAppLocale("en"));
    const view = render(
      <Harness mode="series-style" visualSeriesOptions={[series, treatmentSeries]} />,
    );

    expect(screen.getByRole("heading", { name: "Series colors, lines, and points" })).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Apply this appearance to all series" }),
    ).toHaveLength(2);
    expectNoJapaneseUi(view.container);
  });
});
