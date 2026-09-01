import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { createLongitudinalFixture } from "../../app/syntheticFixtures";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphSelectionEditor } from "./ExperimentGraphSelectionEditor";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

function renderEditor(
  overrides: Partial<Parameters<typeof ExperimentGraphSelectionEditor>[0]> = {},
) {
  const { draft } = createLongitudinalFixture();
  const props: Parameters<typeof ExperimentGraphSelectionEditor>[0] = {
    draft,
    sourceMode: "raw_readout",
    timeAnalysis: { kind: "auc" },
    readoutLabel: draft.readouts[0]?.label ?? "Response",
    derivedLineageRows: [],
    selectedTimePointIds: draft.time.points.map(({ id }) => id),
    activeConditionIds: new Set(draft.conditions.map(({ id }) => id)),
    onSourceModeChange: vi.fn(),
    onAllTimePointsChange: vi.fn(),
    onTimePointChange: vi.fn(),
    onConditionChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<ExperimentGraphSelectionEditor {...props} />), props };
}

describe("ExperimentGraphSelectionEditor", () => {
  it("reports source, time-point, and condition choices without changing their IDs", () => {
    const { props } = renderEditor();

    fireEvent.change(screen.getByLabelText("グラフのデータソース"), {
      target: { value: "derived_metric" },
    });
    fireEvent.click(screen.getByLabelText("すべての時点"));
    const firstPoint = props.draft.time.points[0]!;
    fireEvent.click(screen.getByLabelText(`${firstPoint.value} ${props.draft.time.unit}`));
    const firstCondition = props.draft.conditions[0]!;
    fireEvent.click(screen.getByLabelText(firstCondition.label));

    expect(props.onSourceModeChange).toHaveBeenCalledWith("derived_metric");
    expect(props.onAllTimePointsChange).toHaveBeenCalledWith(false);
    expect(props.onTimePointChange).toHaveBeenCalledWith(firstPoint.id, false);
    expect(props.onConditionChange).toHaveBeenCalledWith(firstCondition.id, false);
  });

  it("shows derived lineage in English without translating researcher labels or IDs", () => {
    act(() => setAppLocale("en"));
    const view = renderEditor({
      sourceMode: "derived_metric",
      derivedLineageRows: [
        {
          id: "experiment.1:condition.control",
          unit: "Mouse A",
          condition: "Control",
          sourceTrace: ["0: 1", "2: 3"],
          value: 4,
        },
      ],
    });

    fireEvent.click(screen.getByText("Review how derived values were calculated"));
    expect(screen.getByRole("table", { name: "Derived-value lineage" })).toHaveTextContent(
      "Mouse A",
    );
    expect(screen.getByRole("table", { name: "Derived-value lineage" })).toHaveTextContent(
      "0: 1, 2: 3",
    );
    expectNoJapaneseUi(view.container);
  });

  it("keeps correlation conditions visible but non-editable", () => {
    const { draft } = createLongitudinalFixture();
    const correlationDraft = {
      ...draft,
      analysisIntent: { kind: "correlation" as const, relationshipForm: "linear" as const },
    };
    renderEditor({ draft: correlationDraft });

    correlationDraft.conditions.forEach(({ label }) => {
      expect(screen.getByLabelText(label)).toBeDisabled();
    });
  });
});
