import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createExperimentSetDraft } from "../app/experimentDraft";
import { WorkspaceAnalysisPreparation } from "./WorkspaceAnalysisPreparation";

describe("explicit current-entry analysis preparation", () => {
  it("requires an explicit finite reference, accepts zero, and preserves the input draft", () => {
    const base = createExperimentSetDraft("general_assay", "nested_continuous");
    const draft = { ...base, conditions: base.conditions.slice(0, 1) };
    const original = structuredClone(draft);
    const ready = vi.fn();
    render(<WorkspaceAnalysisPreparation draft={draft} onReady={ready} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "既知の基準値と比較する" }));
    const next = screen.getByRole("button", { name: "この設定で入力表へ進む" });
    expect(next).toBeDisabled();
    expect(ready).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "one-sample基準値" }), {
      target: { value: "0" },
    });
    fireEvent.click(next);
    expect(ready.mock.calls[0][0].analysisIntent).toEqual({
      kind: "single_cohort",
      mode: "one_sample",
      referenceValue: 0,
    });
    expect(ready.mock.calls[0][0].conditions).toEqual(draft.conditions);
    expect(draft).toEqual(original);
  });

  it("defaults one condition to descriptive output without an invented reference", () => {
    const base = createExperimentSetDraft("general_assay", "nested_continuous");
    const ready = vi.fn();
    render(
      <WorkspaceAnalysisPreparation
        draft={{ ...base, conditions: base.conditions.slice(0, 1) }}
        onReady={ready}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "この設定で入力表へ進む" }));
    expect(ready.mock.calls[0][0].analysisIntent).toEqual({
      kind: "single_cohort",
      mode: "descriptive",
    });
  });

  it("uses an explicitly selected matched WB control and leaves raw input configuration unchanged", () => {
    const base = createExperimentSetDraft("protein_biochemical", "wb_ratio");
    const draft = {
      ...base,
      conditions: base.conditions.slice(0, 2),
      conditionAssignment: { kind: "matched" as const, unitLabel: "block" },
    };
    const ready = vi.fn();
    render(<WorkspaceAnalysisPreparation draft={draft} onReady={ready} onBack={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "標的タンパク質の追加正規化" }), {
      target: { value: "control_equals_one" },
    });
    expect(screen.getByRole("button", { name: "この設定で入力表へ進む" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "標的タンパク質の正規化対照" }), {
      target: { value: draft.conditions[1].id },
    });
    fireEvent.click(screen.getByRole("button", { name: "この設定で入力表へ進む" }));
    expect(ready.mock.calls[0][0].readouts[0]).toEqual({
      ...draft.readouts[0],
      withinExperimentNormalization: {
        method: "control_equals_one",
        baselineConditionId: draft.conditions[1].id,
      },
    });
    expect(draft.readouts[0].withinExperimentNormalization).toBeUndefined();
    expect(ready.mock.calls[0][0].conditionAssignment).toEqual(draft.conditionAssignment);
  });

  it("does not infer WB block matching from independent rows", () => {
    const draft = createExperimentSetDraft("protein_biochemical", "wb_ratio");
    render(<WorkspaceAnalysisPreparation draft={draft} onReady={vi.fn()} onBack={vi.fn()} />);
    expect(
      screen.getByRole("option", { name: "同じ実験単位・ブロック内の対照＝1" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "同じ実験単位・ブロック内の最大値＝1" }),
    ).toBeDisabled();
  });
});
