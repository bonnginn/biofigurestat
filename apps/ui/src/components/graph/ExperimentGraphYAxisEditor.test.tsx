import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests } from "../../app/appLocale";
import type { ReadoutDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { ExperimentGraphYAxisEditor } from "./ExperimentGraphYAxisEditor";

type AxisSettings = WorkspaceGraphState["axes"];
type GraphAppearance = WorkspaceGraphState["appearance"];

const initialAxes: AxisSettings = {
  xSemantic: "categorical",
  xTitle: "Treatment",
  xUnit: "",
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
  axisTitleFontSize: 19,
  tickFontSize: 17,
} as GraphAppearance;

function Harness({ readoutShape = "nested_continuous" }: { readoutShape?: ReadoutDraft["shape"] }) {
  const [axes, setAxes] = useState(initialAxes);
  const [appearance, setAppearance] = useState(initialAppearance);
  return (
    <ExperimentGraphYAxisEditor
      axes={axes}
      appearance={appearance}
      readoutShape={readoutShape}
      setAxes={setAxes}
      setAppearance={setAppearance}
    />
  );
}

describe("ExperimentGraphYAxisEditor", () => {
  beforeEach(() => resetAppLocaleForTests("ja"));

  it("edits the persisted Y title, manual range, and manual tick interval", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Y軸タイトル"), {
      target: { value: "Relative response" },
    });
    expect(screen.getByLabelText("Y軸タイトル")).toHaveValue("Relative response");

    fireEvent.change(screen.getByLabelText("Y軸の範囲"), { target: { value: "manual" } });
    fireEvent.change(screen.getByLabelText("Y軸の最小値"), { target: { value: "-1" } });
    fireEvent.change(screen.getByLabelText("Y軸の最大値"), { target: { value: "3" } });
    expect(screen.getByLabelText("Y軸の最小値")).toHaveValue(-1);
    expect(screen.getByLabelText("Y軸の最大値")).toHaveValue(3);

    fireEvent.change(screen.getByLabelText("Y軸の目盛間隔"), {
      target: { value: "manual" },
    });
    fireEvent.change(screen.getByLabelText("Y軸目盛の間隔値"), {
      target: { value: "0.5" },
    });
    expect(screen.getByLabelText("Y軸目盛の間隔値")).toHaveValue(0.5);
  });

  it("keeps log scaling unavailable for a proportion readout", () => {
    render(<Harness readoutShape="proportion" />);

    expect(screen.getByLabelText("Y軸スケール")).toBeDisabled();
  });

  it("keeps axis-title and tick-label font controls connected to appearance state", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("軸タイトルの文字サイズ"), {
      target: { value: "24" },
    });
    fireEvent.change(screen.getByLabelText("目盛ラベルの文字サイズ"), {
      target: { value: "20" },
    });

    expect(screen.getByText("軸タイトル文字：24px")).toBeInTheDocument();
    expect(screen.getByText("目盛文字：20px")).toBeInTheDocument();
  });
});
