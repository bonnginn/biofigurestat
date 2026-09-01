import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import type { ReadoutDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphDistributionEditor } from "./ExperimentGraphDistributionEditor";

type LayerState = WorkspaceGraphState["layers"];
type GraphAppearance = WorkspaceGraphState["appearance"];

afterEach(() => act(() => resetAppLocaleForTests("ja")));

const initialLayers = { violin: false, distribution: false, box: false } as LayerState;
const initialAppearance = {
  distributionFill: "none",
  distributionFillColor: "#777777",
  distributionLineWidth: 1.2,
  boxWhiskerMode: "tukey_1_5_iqr",
} as GraphAppearance;

function Harness({
  mode,
  shape = "nested_continuous",
}: {
  mode: "violin" | "box";
  shape?: ReadoutDraft["shape"];
}) {
  const [layers, setLayers] = useState(initialLayers);
  const [appearance, setAppearance] = useState(initialAppearance);
  return (
    <>
      <ExperimentGraphDistributionEditor
        mode={mode}
        shape={shape}
        layers={layers}
        appearance={appearance}
        setLayers={setLayers}
        setAppearance={setAppearance}
      />
      <output data-testid="layers-state">{JSON.stringify(layers)}</output>
      <output data-testid="appearance-state">{JSON.stringify(appearance)}</output>
    </>
  );
}

describe("ExperimentGraphDistributionEditor", () => {
  it("edits violin visibility, fill, whiskers, and outline through canonical state", () => {
    render(<Harness mode="violin" />);

    fireEvent.click(screen.getByLabelText("バイオリンを表示"));
    fireEvent.change(screen.getByLabelText("分布の塗り"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("箱ひげの定義"), { target: { value: "min_max" } });
    fireEvent.change(screen.getByLabelText("分布輪郭線の太さ"), { target: { value: "2.4" } });

    expect(screen.getByTestId("layers-state")).toHaveTextContent('"violin":true');
    expect(screen.getByTestId("appearance-state")).toHaveTextContent('"distributionFill":"custom"');
    expect(screen.getByTestId("appearance-state")).toHaveTextContent('"boxWhiskerMode":"min_max"');
    expect(screen.getByTestId("appearance-state")).toHaveTextContent('"distributionLineWidth":2.4');
  });

  it("keeps the nested box compatibility layers synchronized", () => {
    render(<Harness mode="box" />);

    fireEvent.click(screen.getByLabelText("箱ひげを表示"));

    expect(screen.getByTestId("layers-state")).toHaveTextContent('"distribution":true');
    expect(screen.getByTestId("layers-state")).toHaveTextContent('"box":true');
  });

  it("contains no fixed Japanese editor copy in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<Harness mode="violin" />);

    expect(screen.getByRole("heading", { name: "Violin distribution" })).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
});
