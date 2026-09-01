import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { createLongitudinalFixture } from "../../app/syntheticFixtures";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphTimeAnalysisEditor } from "./ExperimentGraphTimeAnalysisEditor";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

function renderEditor(
  overrides: Partial<Parameters<typeof ExperimentGraphTimeAnalysisEditor>[0]> = {},
) {
  const { draft } = createLongitudinalFixture();
  const props: Parameters<typeof ExperimentGraphTimeAnalysisEditor>[0] = {
    time: draft.time,
    plan: { kind: "selected_timepoint" },
    analysisTimePointId: null,
    onKindChange: vi.fn(),
    onPlanChange: vi.fn(),
    onAnalysisTimePointChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<ExperimentGraphTimeAnalysisEditor {...props} />), props };
}

describe("ExperimentGraphTimeAnalysisEditor", () => {
  it("keeps time-point identity and analysis-window values in callbacks", () => {
    const { draft } = createLongitudinalFixture();
    const firstPoint = draft.time.points[0]!;
    const lastPoint = draft.time.points.at(-1)!;
    const { props, rerender } = renderEditor({
      time: draft.time,
      plan: { kind: "auc" },
    });

    fireEvent.change(screen.getByLabelText("解析windowの開始"), {
      target: { value: String(firstPoint.value) },
    });
    fireEvent.change(screen.getByLabelText("解析windowの終了"), {
      target: { value: String(lastPoint.value) },
    });
    expect(props.onPlanChange).toHaveBeenNthCalledWith(1, {
      kind: "auc",
      windowStart: firstPoint.value,
    });
    expect(props.onPlanChange).toHaveBeenNthCalledWith(2, {
      kind: "auc",
      windowEnd: lastPoint.value,
    });

    rerender(
      <ExperimentGraphTimeAnalysisEditor {...props} plan={{ kind: "selected_timepoint" }} />,
    );
    fireEvent.change(screen.getByLabelText("解析する時点"), {
      target: { value: firstPoint.id },
    });
    expect(props.onAnalysisTimePointChange).toHaveBeenCalledWith(firstPoint.id);
  });

  it("shows the complete derived-time editor in English without Japanese application copy", () => {
    act(() => setAppLocale("en"));
    const view = renderEditor({
      plan: { kind: "change_from_baseline" },
    });

    expect(
      screen.getByRole("heading", { name: "What to compare from the time series" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Analysis-window start")).toBeVisible();
    expect(screen.getByLabelText("Analysis-window end")).toBeVisible();
    expect(screen.getByLabelText("Baseline time point")).toBeVisible();
    expectNoJapaneseUi(view.container);
  });

  it("keeps derived metrics unavailable for independent samples at each time point", () => {
    const { draft } = createLongitudinalFixture();
    renderEditor({
      time: { ...draft.time, sampling: "cross_sectional" },
    });

    expect(screen.getByRole("option", { name: "AUC（台形法）" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "baselineからの変化量" })).toBeDisabled();
    expect(screen.getByText(/時点ごとに別サンプル/)).toBeVisible();
  });
});
