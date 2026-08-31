import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { ExperimentGraphConnectingLineEditor } from "./ExperimentGraphConnectingLineEditor";

type LayerState = WorkspaceGraphState["layers"];
type GraphAppearance = WorkspaceGraphState["appearance"];

function Harness() {
  const [layers, setLayers] = useState({ connectingLine: true } as LayerState);
  const [appearance, setAppearance] = useState({
    connectingLineWidth: 1.5,
    connectingLineColor: "#222222",
  } as GraphAppearance);
  return (
    <ExperimentGraphConnectingLineEditor
      layers={layers}
      appearance={appearance}
      setLayers={setLayers}
      setAppearance={setAppearance}
    />
  );
}

describe("ExperimentGraphConnectingLineEditor", () => {
  beforeEach(() => resetAppLocaleForTests("ja"));

  it("keeps connecting-line visibility and appearance state connected", () => {
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("接続線を表示"));
    fireEvent.change(screen.getByLabelText("接続線の太さ"), { target: { value: "2.3" } });
    fireEvent.change(screen.getByLabelText("接続線の色"), { target: { value: "#abcdef" } });

    expect(screen.getByLabelText("接続線を表示")).not.toBeChecked();
    expect(screen.getByText("線幅：2.3px")).toBeInTheDocument();
    expect(screen.getByLabelText("接続線の色")).toHaveValue("#abcdef");
  });
});
