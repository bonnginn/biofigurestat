import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphInspectorTarget } from "./ExperimentGraphInspectorTarget";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

const layers = {
  raw: true,
  distribution: true,
  experiment: true,
  overall: true,
  violin: false,
  box: false,
  errorBar: true,
  connectingLine: false,
} satisfies WorkspaceGraphState["layers"];

describe("ExperimentGraphInspectorTarget", () => {
  it("delegates target selection and immutable layer toggles", () => {
    const onInspect = vi.fn();
    const onLayersChange = vi.fn();
    render(
      <ExperimentGraphInspectorTarget
        inspectorTarget="data"
        layers={layers}
        shape="nested_continuous"
        visualSeriesCount={2}
        allowAnnotation
        allowStatistics
        onInspect={onInspect}
        onLayersChange={onLayersChange}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: "x-axis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生データ" }));
    fireEvent.click(screen.getByRole("button", { name: "系列を編集" }));
    expect(onInspect).toHaveBeenNthCalledWith(1, "x-axis");
    expect(onInspect).toHaveBeenNthCalledWith(2, "series-style");
    expect(onLayersChange).toHaveBeenCalledWith({ ...layers, raw: false });
    expect(layers.raw).toBe(true);
  });

  it("keeps optional targets and all application copy in English", () => {
    act(() => setAppLocale("en"));
    const view = render(
      <ExperimentGraphInspectorTarget
        inspectorTarget="background"
        layers={layers}
        shape="proportion"
        visualSeriesCount={1}
        allowAnnotation={false}
        allowStatistics={false}
        onInspect={vi.fn()}
        onLayersChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("option", { name: "Statistical annotations" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Statistical analysis" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Raw data" })).toBeNull();
    expectNoJapaneseUi(view.container);
  });
});
