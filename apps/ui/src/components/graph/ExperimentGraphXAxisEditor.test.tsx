import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphXAxisEditor } from "./ExperimentGraphXAxisEditor";

type AxisSettings = WorkspaceGraphState["axes"];
type GraphAppearance = WorkspaceGraphState["appearance"];

const attributes: ExperimentSetDraft["attributes"] = [
  { id: "attribute.treatment", label: "Treatment" },
  { id: "attribute.construct", label: "Construct" },
];

const initialAxes: AxisSettings = {
  xSemantic: "time",
  xTitle: "Time",
  xUnit: "h",
  xScale: "linear",
  xRangeMode: "auto",
  xMin: null,
  xMax: null,
  xTickMode: "auto",
  xTickInterval: null,
  showMinorTicks: true,
  tickDirection: "outside",
  showCategoryGroupSeparators: false,
  categoryLabelRotation: "none",
  yTitle: "Response",
  yRangeMode: "auto",
  yMin: null,
  yMax: null,
  yScale: "linear",
  showCategoryLabels: true,
  hierarchyOrder: [],
  spacing: 1,
  yTickMode: "auto",
  yTickInterval: null,
};

const initialAppearance = {
  hierarchicalLabels: true,
  barOutline: true,
  barOutlineMode: "series",
  barOutlineColor: "#111111",
  barOutlineWidth: 1.2,
  barMeanMarker: false,
  barWidth: 0.72,
  withinGroupSpacing: 0.72,
  betweenGroupSpacing: 1.35,
  hierarchyFontSize: 17,
} as GraphAppearance;

function Harness({ hasOrderedAxis = true }: { hasOrderedAxis?: boolean }) {
  const [axes, setAxes] = useState(initialAxes);
  const [appearance, setAppearance] = useState(initialAppearance);
  return (
    <ExperimentGraphXAxisEditor
      axes={axes}
      appearance={appearance}
      attributes={attributes}
      hasOrderedAxis={hasOrderedAxis}
      groupingXSource="factor"
      setAxes={setAxes}
      setAppearance={setAppearance}
    />
  );
}

describe("ExperimentGraphXAxisEditor", () => {
  beforeEach(() => resetAppLocaleForTests("ja"));

  it("keeps ordered-axis meaning, title, unit, and numeric controls connected", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("X軸の意味"), {
      target: { value: "numeric_covariate" },
    });
    expect(screen.getByLabelText("X軸タイトル")).toHaveValue("Covariate");
    fireEvent.change(screen.getByLabelText("X軸タイトル"), {
      target: { value: "Dose" },
    });
    fireEvent.change(screen.getByLabelText("X軸単位"), { target: { value: "µM" } });
    expect(screen.getByLabelText("X軸タイトル")).toHaveValue("Dose");
    expect(screen.getByLabelText("X軸単位")).toHaveValue("µM");

    fireEvent.change(screen.getByText("X範囲").closest("label")!.querySelector("select")!, {
      target: { value: "manual" },
    });
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
  });

  it("reorders only the explicit hierarchy IDs", () => {
    render(<Harness hasOrderedAxis={false} />);

    fireEvent.click(screen.getByLabelText("Constructを上へ"));

    expect(screen.getByLabelText("Constructを上へ")).toBeDisabled();
    expect(screen.getByLabelText("Treatmentを下へ")).toBeDisabled();
  });

  it("keeps bar-only appearance controls out of the X-axis editor", () => {
    render(<Harness />);

    expect(screen.queryByLabelText("棒の輪郭線を表示")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("棒の幅")).not.toBeInTheDocument();
    expect(screen.getByLabelText("カテゴリ間隔")).toBeEnabled();
  });

  it("contains no fixed Japanese copy in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<Harness />);

    expect(screen.getByLabelText("X-axis meaning")).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
});
