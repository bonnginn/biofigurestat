import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createSimpleIndependentContinuousFixture } from "../../app/syntheticFixtures";
import { useExperimentGraphDataSelectionState } from "./useExperimentGraphDataSelectionState";

describe("useExperimentGraphDataSelectionState", () => {
  it("shows reference conditions while excluding them from the default analysis set", () => {
    const { draft: baseDraft } = createSimpleIndependentContinuousFixture();
    const draft = {
      ...baseDraft,
      conditions: baseDraft.conditions.map((condition, index) =>
        index === 0 ? { ...condition, role: "auxiliary_reference" as const } : condition,
      ),
    };
    const { result } = renderHook(() => useExperimentGraphDataSelectionState({ draft }));
    expect(result.current.selectedConditionIds).toEqual(draft.conditions.map(({ id }) => id));
    expect(result.current.analysisConditionIds).toEqual(
      draft.conditions.slice(1).map(({ id }) => id),
    );
  });

  it("keeps display and analysis identities as independently owned arrays", () => {
    const { draft } = createSimpleIndependentContinuousFixture();
    const { result } = renderHook(() => useExperimentGraphDataSelectionState({ draft }));
    const analysisBefore = [...result.current.analysisConditionIds];
    act(() => result.current.setSelectedConditionIds([draft.conditions[0]!.id]));
    expect(result.current.selectedConditionIds).toEqual([draft.conditions[0]!.id]);
    expect(result.current.analysisConditionIds).toEqual(analysisBefore);
  });
});
