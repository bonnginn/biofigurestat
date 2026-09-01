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
} as GraphAppearance;

function Harness({
  onGraphTypeChange = vi.fn(),
  onApplyPreset = vi.fn(),
}: {
  onGraphTypeChange?: (graphType: WorkspaceGraphState["graphType"]) => void;
  onApplyPreset?: (preset: GraphDisplayPreset) => void;
}) {
  const [, setAxes] = useState(axes);
  const [currentAppearance, setAppearance] = useState(appearance);
  return (
    <ExperimentGraphAppearanceEditor
      graphType="dot"
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

  it("resets only layout presentation values", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "レイアウトを自動設定に戻す" }));

    expect(screen.getByLabelText("グラフの大きさ")).toHaveValue("standard");
    expect(screen.getByText("左右の余白：72px")).toBeInTheDocument();
  });

  it("contains no fixed Japanese copy in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<Harness />);

    expect(screen.getByRole("heading", { name: "Graph appearance" })).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
});
