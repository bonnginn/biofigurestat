import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import type { ExperimentSetDraft } from "../../app/experimentDraft";
import { createInitialGraphGrouping } from "../../app/graphGrouping";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { createSimpleIndependentContinuousFixture } from "../../app/syntheticFixtures";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphGroupingEditor } from "./ExperimentGraphGroupingEditor";

type GraphAppearance = WorkspaceGraphState["appearance"];
type AxisSettings = WorkspaceGraphState["axes"];
type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

afterEach(() => act(() => resetAppLocaleForTests("ja")));

const baseAxes = {
  xSemantic: "categorical",
  xTitle: "Treatment",
} as AxisSettings;

const baseAppearance = {
  legendPosition: "hidden",
  palette: "single",
} as GraphAppearance;

function twoFactorDraft(): ExperimentSetDraft {
  const { draft } = createSimpleIndependentContinuousFixture();
  return {
    ...draft,
    attributes: [
      { id: "attribute.treatment", label: "Treatment" },
      { id: "attribute.construct", label: "Construct" },
    ],
  };
}

function Harness({
  axes = baseAxes,
  onEditSeriesStyles = vi.fn(),
}: {
  axes?: AxisSettings;
  onEditSeriesStyles?: () => void;
}) {
  const draft = twoFactorDraft();
  const [grouping, setGrouping] = useState<GraphGrouping>(() => createInitialGraphGrouping(draft));
  const [appearance, setAppearance] = useState<GraphAppearance>(baseAppearance);
  return (
    <>
      <ExperimentGraphGroupingEditor
        draft={draft}
        axes={axes}
        grouping={grouping}
        setGrouping={setGrouping}
        setAppearance={setAppearance}
        visualSeriesCount={2}
        onEditSeriesStyles={onEditSeriesStyles}
      />
      <output data-testid="grouping-state">{JSON.stringify(grouping)}</output>
      <output data-testid="appearance-state">{JSON.stringify(appearance)}</output>
    </>
  );
}

describe("ExperimentGraphGroupingEditor", () => {
  it("maps a factor to series without changing the experimental design", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("系列に使う要因"), {
      target: { value: "factor:attribute.construct" },
    });

    expect(screen.getByTestId("grouping-state")).toHaveTextContent(
      '"series":{"source":"factor","factorId":"attribute.construct"}',
    );
    expect(screen.getByTestId("appearance-state")).toHaveTextContent('"legendPosition":"right"');
    expect(screen.getByTestId("appearance-state")).toHaveTextContent('"palette":"condition"');
  });

  it("routes the series-style shortcut through the parent workspace", () => {
    const onEditSeriesStyles = vi.fn();
    render(<Harness onEditSeriesStyles={onEditSeriesStyles} />);

    fireEvent.click(screen.getByRole("button", { name: "系列の色・線・点を編集" }));

    expect(onEditSeriesStyles).toHaveBeenCalledTimes(1);
  });

  it("contains no fixed Japanese explanation for an ordered numeric axis in English", () => {
    act(() => setAppLocale("en"));
    const view = render(
      <Harness axes={{ ...baseAxes, xSemantic: "numeric_covariate", xTitle: "Dose" }} />,
    );

    expect(view.container).toHaveTextContent(
      "The X axis shows Dose; conditions are distinguished by color and symbol.",
    );
    expectNoJapaneseUi(view.container);
  });
});
