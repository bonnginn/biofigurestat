import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphCanvasToolbar } from "./ExperimentGraphCanvasToolbar";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

function renderToolbar(
  overrides: Partial<Parameters<typeof ExperimentGraphCanvasToolbar>[0]> = {},
) {
  const props: Parameters<typeof ExperimentGraphCanvasToolbar>[0] = {
    graphTypeLabel: "Dot",
    layerDescription: "Raw data + Mean ± SD",
    graphTitleFontSize: 20,
    hasData: true,
    copyStatus: null,
    exportFeedback: null,
    benchmarkCaptureStatus: null,
    fitOverview: false,
    showBenchmarkAction: false,
    benchmarkActionDisabled: true,
    onCopy: vi.fn(),
    onExportSvg: vi.fn(),
    onExportPng: vi.fn(),
    onExportCsv: vi.fn(),
    onFinalizeBenchmark: vi.fn(),
    onFitOverviewChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<ExperimentGraphCanvasToolbar {...props} />), props };
}

describe("ExperimentGraphCanvasToolbar", () => {
  it("delegates export and display-size actions without mutating Graph state", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "グラフをコピー" }));
    fireEvent.click(screen.getByRole("button", { name: "SVGを書き出す" }));
    fireEvent.click(screen.getByRole("button", { name: "PNGを書き出す" }));
    fireEvent.click(screen.getByRole("button", { name: "表示データCSV" }));
    fireEvent.click(screen.getByRole("button", { name: "画面に全体を収める" }));
    expect(props.onCopy).toHaveBeenCalledOnce();
    expect(props.onExportSvg).toHaveBeenCalledOnce();
    expect(props.onExportPng).toHaveBeenCalledOnce();
    expect(props.onExportCsv).toHaveBeenCalledOnce();
    expect(props.onFitOverviewChange).toHaveBeenCalledWith(true);
  });

  it("disables export for an empty Graph and keeps controls in English", () => {
    act(() => setAppLocale("en"));
    const view = renderToolbar({ hasData: false });
    expect(screen.getByRole("button", { name: "Copy Graph" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export SVG" })).toBeDisabled();
    expect(screen.queryByRole("group", { name: "Graph display size" })).toBeNull();
    expectNoJapaneseUi(view.container);
  });

  it("keeps export failure feedback as an alert", () => {
    renderToolbar({ exportFeedback: { kind: "error", text: "PNG export failed" } });
    expect(screen.getByRole("alert")).toHaveTextContent("PNG export failed");
  });
});
