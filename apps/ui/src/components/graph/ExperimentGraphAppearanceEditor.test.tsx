import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import {
  ExperimentGraphAppearanceEditor,
  type GraphDisplayPreset,
} from "./ExperimentGraphAppearanceEditor";

type AxisSettings = WorkspaceGraphState["axes"];
type GraphAppearance = WorkspaceGraphState["appearance"];

const conditions: ExperimentSetDraft["conditions"] = [
  { id: "condition.vehicle", label: "Vehicle", attributes: {} },
  { id: "condition.drug", label: "Drug", attributes: {} },
];

const axes = {
  spacing: 1,
} as AxisSettings;

const appearance = {
  palette: "condition",
  seriesColors: {},
  fontFamily: "arial",
  graphTitleFontSize: 20,
  canvasPreset: "wide",
  sidePadding: 120,
  axisLineWidth: 1.4,
  barOutline: true,
  barOutlineMode: "series",
  barOutlineColor: "#111111",
  barOutlineWidth: 1.2,
  barMeanMarker: false,
  barWidth: 0.72,
} as GraphAppearance;

function Harness({
  graphType = "dot",
  onGraphTypeChange = vi.fn(),
  onApplyPreset = vi.fn(),
}: {
  graphType?: WorkspaceGraphState["graphType"];
  onGraphTypeChange?: (graphType: WorkspaceGraphState["graphType"]) => void;
  onApplyPreset?: (preset: GraphDisplayPreset) => void;
}) {
  const [, setAxes] = useState(axes);
  const [currentAppearance, setAppearance] = useState(appearance);
  return (
    <ExperimentGraphAppearanceEditor
      graphType={graphType}
      appearance={currentAppearance}
      readoutShape="nested_continuous"
      analysisIntentKind="group_comparison"
      conditionAssignmentKind="independent"
      timeSampling="none"
      activeConditions={conditions}
      onGraphTypeChange={onGraphTypeChange}
      onApplyPreset={onApplyPreset}
      setAxes={setAxes}
      setAppearance={setAppearance}
    />
  );
}

describe("ExperimentGraphAppearanceEditor", () => {
  beforeEach(() => resetAppLocaleForTests("ja"));

  it("delegates Graph type and preset changes without owning scientific state", () => {
    const onGraphTypeChange = vi.fn();
    const onApplyPreset = vi.fn();
    render(<Harness onGraphTypeChange={onGraphTypeChange} onApplyPreset={onApplyPreset} />);

    expect(screen.getByRole("option", { name: "ドット" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "折れ線／経時変化" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("グラフの基本形"), { target: { value: "bar" } });
    fireEvent.change(screen.getByLabelText("表示プリセット"), {
      target: { value: "publication" },
    });

    expect(onGraphTypeChange).toHaveBeenCalledWith("bar");
    expect(onApplyPreset).toHaveBeenCalledWith("publication");
  });

  it("keeps per-condition palette edits in appearance state", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Vehicleの色"), {
      target: { value: "#123456" },
    });

    expect(screen.getByLabelText("Vehicleの色")).toHaveValue("#123456");
  });

  it("keeps Bar appearance with Graph appearance and offers quick preset colors", () => {
    const { rerender } = render(<Harness graphType="dot" />);
    expect(screen.queryByRole("heading", { name: "棒" })).not.toBeInTheDocument();

    rerender(<Harness graphType="bar" />);
    expect(screen.getByRole("heading", { name: "棒" })).toBeVisible();
    expect(screen.getByLabelText("棒の外枠色")).toHaveValue("series");

    fireEvent.change(screen.getByLabelText("棒の外枠色"), { target: { value: "custom" } });
    expect(screen.getByRole("group", { name: "棒の外枠のプリセット色" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "赤を選択" }));
    expect(screen.getByLabelText("棒の外枠の任意色")).toHaveValue("#b42318");

    fireEvent.change(screen.getByLabelText("棒の外枠の太さ"), { target: { value: "2.4" } });
    expect(screen.getByLabelText("棒の外枠の太さ")).toHaveValue("2.4");
    fireEvent.click(screen.getByLabelText("棒に平均マーカーを重ねる"));
    expect(screen.getByLabelText("棒に平均マーカーを重ねる")).toBeChecked();
    fireEvent.change(screen.getByLabelText("棒の幅"), { target: { value: "0.9" } });
    expect(screen.getByLabelText("棒の幅")).toHaveValue("0.9");
  });

  it("resets only layout presentation values", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "レイアウトを自動設定に戻す" }));

    expect(screen.getByLabelText("グラフの大きさ")).toHaveValue("standard");
    expect(screen.getByText("左右の余白：72px")).toBeInTheDocument();
  });

  it("contains no fixed Japanese copy in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<Harness graphType="bar" />);

    expect(screen.getByRole("heading", { name: "Graph appearance" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Bars" })).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
});
