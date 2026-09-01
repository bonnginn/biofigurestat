import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphErrorBarEditor } from "./ExperimentGraphErrorBarEditor";

type LayerState = WorkspaceGraphState["layers"];
type GraphAppearance = WorkspaceGraphState["appearance"];

const layers = { errorBar: true } as LayerState;
const appearance = {
  errorBar: "sd",
  uncertaintyStyle: "error_bars",
  ribbonOpacity: 0.18,
  errorBarLineWidth: 1.5,
  errorBarColor: "#222222",
} as GraphAppearance;

function Harness() {
  const [currentLayers, setLayers] = useState(layers);
  const [currentAppearance, setAppearance] = useState(appearance);
  return (
    <ExperimentGraphErrorBarEditor
      layers={currentLayers}
      appearance={currentAppearance}
      setLayers={setLayers}
      setAppearance={setAppearance}
    />
  );
}

describe("ExperimentGraphErrorBarEditor", () => {
  beforeEach(() => resetAppLocaleForTests("ja"));

  it("keeps error-bar visibility, summary, and presentation state connected", () => {
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("誤差線を表示"));
    expect(screen.getByLabelText("誤差線を表示")).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("誤差線の要約方法"), {
      target: { value: "sem" },
    });
    expect(screen.getByLabelText("誤差線の要約方法")).toHaveValue("sem");
    fireEvent.change(screen.getByLabelText("不確実性の表示形式"), {
      target: { value: "ribbon" },
    });
    expect(screen.getByLabelText("リボン透明度")).toBeInTheDocument();
  });

  it("updates line width, color, and ribbon opacity without changing graph data", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("誤差線の太さ"), { target: { value: "2.4" } });
    fireEvent.change(screen.getByLabelText("誤差線の色"), { target: { value: "#abcdef" } });
    fireEvent.change(screen.getByLabelText("不確実性の表示形式"), {
      target: { value: "ribbon" },
    });
    fireEvent.change(screen.getByLabelText("リボン透明度"), { target: { value: "0.3" } });

    expect(screen.getByText("線幅：2.4px")).toBeInTheDocument();
    expect(screen.getByLabelText("誤差線の色")).toHaveValue("#abcdef");
    expect(screen.getByText("リボン透明度：0.30")).toBeInTheDocument();
  });

  it("contains no fixed Japanese copy in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<Harness />);

    expect(screen.getByRole("heading", { name: "Error bars" })).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
});
