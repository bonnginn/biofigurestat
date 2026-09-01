import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import type { ReadoutDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphRawDotsEditor } from "./ExperimentGraphRawDotsEditor";

type LayerState = WorkspaceGraphState["layers"];
type GraphAppearance = WorkspaceGraphState["appearance"];

const layers = { raw: true, experiment: true } as LayerState;
const appearance = {
  pointSize: 6,
  jitter: 8,
  rawPointColor: "#123456",
} as GraphAppearance;

function Harness({ shape }: { shape: ReadoutDraft["shape"] }) {
  const [currentLayers, setLayers] = useState(layers);
  const [currentAppearance, setAppearance] = useState(appearance);
  return (
    <ExperimentGraphRawDotsEditor
      shape={shape}
      layers={currentLayers}
      appearance={currentAppearance}
      setLayers={setLayers}
      setAppearance={setAppearance}
    />
  );
}

describe("ExperimentGraphRawDotsEditor", () => {
  beforeEach(() => resetAppLocaleForTests("ja"));

  it("updates the raw observation layer and its visual settings for nested data", () => {
    render(<Harness shape="nested_continuous" />);

    fireEvent.click(screen.getByLabelText("生データの点を表示"));
    expect(screen.getByLabelText("生データの点を表示")).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("生データ点の大きさ"), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByLabelText("生データ点のjitter"), {
      target: { value: "14" },
    });
    fireEvent.change(screen.getByLabelText("生データ点の色"), {
      target: { value: "#abcdef" },
    });

    expect(screen.getByText("点の大きさ：9px")).toBeInTheDocument();
    expect(screen.getByText("横方向のばらし幅：14px")).toBeInTheDocument();
    expect(screen.getByLabelText("生データ点の色")).toHaveValue("#abcdef");
  });

  it("routes scalar visibility to the experiment-unit layer", () => {
    render(<Harness shape="wb_ratio" />);

    fireEvent.click(screen.getByLabelText("実験単位の点を表示"));
    expect(screen.getByLabelText("実験単位の点を表示")).not.toBeChecked();
    expect(screen.queryByLabelText("生データ点の色")).not.toBeInTheDocument();
  });

  it("contains no fixed Japanese copy in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<Harness shape="nested_continuous" />);

    expect(screen.getByRole("heading", { name: "Raw cell/ROI data" })).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
});
