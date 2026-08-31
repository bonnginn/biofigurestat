import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { ExperimentGraphLegendEditor } from "./ExperimentGraphLegendEditor";

type GraphAppearance = WorkspaceGraphState["appearance"];

function Harness({ palette = "single" }: { palette?: GraphAppearance["palette"] }) {
  const [appearance, setAppearance] = useState({
    legendPosition: "hidden",
    legendFontSize: 12,
    palette,
  } as GraphAppearance);
  return (
    <>
      <ExperimentGraphLegendEditor appearance={appearance} setAppearance={setAppearance} />
      <output aria-label="palette">{appearance.palette}</output>
    </>
  );
}

describe("ExperimentGraphLegendEditor", () => {
  beforeEach(() => resetAppLocaleForTests("ja"));

  it("makes a single-color graph distinguishable when its legend is enabled", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("凡例の位置"), { target: { value: "right" } });

    expect(screen.getByLabelText("凡例の位置")).toHaveValue("right");
    expect(screen.getByLabelText("palette")).toHaveTextContent("condition");
  });

  it("preserves an existing palette and updates legend font size", () => {
    render(<Harness palette="colorblind" />);

    fireEvent.change(screen.getByLabelText("凡例の位置"), { target: { value: "top" } });
    fireEvent.change(screen.getByLabelText("凡例の文字サイズ"), {
      target: { value: "18" },
    });

    expect(screen.getByLabelText("palette")).toHaveTextContent("colorblind");
    expect(screen.getByText("文字：18px")).toBeInTheDocument();
  });
});
