import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { createInitialGraphGrouping } from "../../app/graphGrouping";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { createLongitudinalFixture } from "../../app/syntheticFixtures";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";
import { ExperimentGraphDataEditor } from "./ExperimentGraphDataEditor";

afterEach(() => act(() => resetAppLocaleForTests("ja")));

function Harness({ onReadoutChange = vi.fn() }: { onReadoutChange?: (id: string) => void }) {
  const { draft: baseDraft } = createLongitudinalFixture();
  const draft = {
    ...baseDraft,
    readouts: [
      ...baseDraft.readouts,
      { ...baseDraft.readouts[0]!, id: "readout.secondary", label: "Secondary response" },
    ],
  };
  const [grouping, setGrouping] = useState(() => createInitialGraphGrouping(draft));
  const [appearance, setAppearance] = useState<WorkspaceGraphState["appearance"]>(
    {} as WorkspaceGraphState["appearance"],
  );
  return (
    <>
      <ExperimentGraphDataEditor
        draft={draft}
        activeReadoutId={draft.readouts[0]!.id}
        axes={{ xSemantic: "time", xTitle: "Time" } as WorkspaceGraphState["axes"]}
        grouping={grouping}
        setGrouping={setGrouping}
        setAppearance={setAppearance}
        visualSeriesCount={1}
        sourceMode="raw_readout"
        timeAnalysis={{ kind: "auc" }}
        readoutLabel={draft.readouts[0]!.label}
        derivedLineageRows={[]}
        selectedTimePointIds={draft.time.points.map(({ id }) => id)}
        activeConditionIds={new Set(draft.conditions.map(({ id }) => id))}
        onReadoutChange={onReadoutChange}
        onSourceModeChange={vi.fn()}
        onAllTimePointsChange={vi.fn()}
        onTimePointChange={vi.fn()}
        onConditionChange={vi.fn()}
        onEditSeriesStyles={vi.fn()}
      />
      <output data-testid="appearance">{JSON.stringify(appearance)}</output>
    </>
  );
}

describe("ExperimentGraphDataEditor", () => {
  it("delegates the stable readout ID without changing the draft", () => {
    const onReadoutChange = vi.fn();
    render(<Harness onReadoutChange={onReadoutChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "測定項目" }), {
      target: { value: "readout.secondary" },
    });
    expect(onReadoutChange).toHaveBeenCalledWith("readout.secondary");
  });

  it("keeps the composed data-selection surface in English", () => {
    act(() => setAppLocale("en"));
    const view = render(<Harness />);
    expect(screen.getByRole("heading", { name: "Data to display" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Measured readout" })).toBeVisible();
    expectNoJapaneseUi(view.container);
  });
});
