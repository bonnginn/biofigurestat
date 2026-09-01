import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { createMultipleReadoutFixture } from "../../app/syntheticFixtures";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphAnalysisSetEditor } from "./ExperimentGraphAnalysisSetEditor";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

function fixture() {
  const { draft: source } = createMultipleReadoutFixture();
  return {
    ...source,
    name: "Multiple readouts",
    conditionAssignment: { ...source.conditionAssignment, unitLabel: "Animal" },
    readouts: source.readouts.map((readout, index) => ({
      ...readout,
      label: index === 0 ? "Positive fraction" : "Fluorescence intensity",
    })),
  };
}

describe("ExperimentGraphAnalysisSetEditor", () => {
  it("returns stable readout and condition IDs without coupling them to display selection", () => {
    const draft = fixture();
    const onReadoutChange = vi.fn();
    const onConditionChange = vi.fn();
    render(
      <ExperimentGraphAnalysisSetEditor
        draft={draft}
        selectedReadoutId={draft.readouts[0]!.id}
        selectedConditionIds={[draft.conditions[0]!.id]}
        onReadoutChange={onReadoutChange}
        onConditionChange={onConditionChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("統計の測定項目"), {
      target: { value: draft.readouts[1]!.id },
    });
    fireEvent.click(screen.getByLabelText(`統計の条件：${draft.conditions[1]!.label}`));
    expect(onReadoutChange).toHaveBeenCalledWith(draft.readouts[1]!.id);
    expect(onConditionChange).toHaveBeenCalledWith(draft.conditions[1]!.id, true);
  });

  it("shows analysis-set semantics in English without Japanese application copy", () => {
    act(() => setAppLocale("en"));
    const draft = fixture();
    const view = render(
      <ExperimentGraphAnalysisSetEditor
        draft={draft}
        selectedReadoutId={draft.readouts[0]!.id}
        selectedConditionIds={draft.conditions.map(({ id }) => id)}
        onReadoutChange={vi.fn()}
        onConditionChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Analysis set" })).toBeVisible();
    expect(screen.getByText("Separate experimental units for each condition")).toBeVisible();
    expect(screen.getByText("Not specified (not inferred from the display name)")).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
});
