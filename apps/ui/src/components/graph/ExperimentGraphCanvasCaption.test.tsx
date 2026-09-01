import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphCanvasCaption } from "./ExperimentGraphCanvasCaption";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

const baseProps: Parameters<typeof ExperimentGraphCanvasCaption>[0] = {
  semanticReadiness: "resolved",
  activeLayerDescription: "Raw data + Mean ± SD",
  shape: "nested_continuous",
  isCorrelation: false,
  conditionUnitLabel: "dish",
  readoutLabel: "Intensity",
};

describe("ExperimentGraphCanvasCaption", () => {
  it("does not promote unresolved source rows to biological n", () => {
    render(
      <ExperimentGraphCanvasCaption {...baseProps} semanticReadiness="unresolved_descriptive" />,
    );
    expect(screen.getByText(/biological n/)).toHaveTextContent("対応関係とは解釈していません");
  });

  it("keeps shared-source matching distinct from condition-specific experimental units", () => {
    act(() => setAppLocale("en"));
    const view = render(
      <ExperimentGraphCanvasCaption {...baseProps} sharedSourceUnitLabel="donor" />,
    );
    expect(screen.getByText(/shared ID/)).toHaveTextContent("separate experimental units");
    expectNoJapaneseUi(view.container);
  });

  it("states that raw nested observations do not change statistical n", () => {
    act(() => setAppLocale("en"));
    render(<ExperimentGraphCanvasCaption {...baseProps} />);
    expect(screen.getByText(/raw cell or ROI data/)).toHaveTextContent(
      "statistical n, which remains the experimental unit",
    );
  });
});
