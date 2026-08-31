import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests } from "../../app/appLocale";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
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
  barMeanMarker: false,
  barWidth: 0.72,
  withinGroupSpacing: 0.72,
  betweenGroupSpacing: 1.35,
  hierarchyFontSize: 17,
} as GraphAppearance;

function Harness({
  hasOrderedAxis = true,
  graphType = "dot",
}: {
  hasOrderedAxis?: boolean;
  graphType?: WorkspaceGraphState["graphType"];
}) {
  const [axes, setAxes] = useState(initialAxes);
  const [appearance, setAppearance] = useState(initialAppearance);
  return (
    <ExperimentGraphXAxisEditor
      axes={axes}
      appearance={appearance}
      attributes={attributes}
      hasOrderedAxis={hasOrderedAxis}
      groupingXSource="factor"
      graphType={graphType}
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

  it("enables bar-only appearance controls only for a bar Graph", () => {
    const { rerender } = render(<Harness graphType="dot" />);
    expect(screen.getByLabelText("棒の輪郭線を表示")).toBeDisabled();
    expect(screen.getByLabelText("棒の幅")).toBeDisabled();

    rerender(<Harness graphType="bar" />);
    expect(screen.getByLabelText("棒の輪郭線を表示")).toBeEnabled();
    expect(screen.getByLabelText("棒の幅")).toBeEnabled();
  });
});
