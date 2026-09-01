import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createSimpleIndependentContinuousFixture } from "../../app/syntheticFixtures";
import {
  DEFAULT_GRAPH_APPEARANCE,
  useExperimentGraphPresentationState,
} from "./useExperimentGraphPresentationState";

describe("useExperimentGraphPresentationState", () => {
  it("starts unresolved table rows without an implied summary or error bar", () => {
    const { draft } = createSimpleIndependentContinuousFixture();
    const { result } = renderHook(() =>
      useExperimentGraphPresentationState({
        draft,
        semanticReadiness: "unresolved_descriptive",
        workspaceMode: "graph",
      }),
    );
    expect(result.current.layers.experiment).toBe(true);
    expect(result.current.layers.raw).toBe(false);
    expect(result.current.layers.overall).toBe(false);
    expect(result.current.layers.errorBar).toBe(false);
    expect(result.current.inspectorTarget).toBe("data");
  });

  it("keeps presentation updates separate from the draft and Statistics entry target", () => {
    const { draft } = createSimpleIndependentContinuousFixture();
    const { result } = renderHook(() =>
      useExperimentGraphPresentationState({
        draft,
        semanticReadiness: "resolved",
        workspaceMode: "statistics",
      }),
    );
    act(() => result.current.setAppearance({ ...result.current.appearance, pointSize: 9 }));
    act(() => result.current.setFitOverview(true));
    expect(result.current.appearance.pointSize).toBe(9);
    expect(result.current.fitOverview).toBe(true);
    expect(result.current.inspectorTarget).toBe("statistics");
    expect(draft.readouts[0]?.label).toBeTruthy();
    expect(DEFAULT_GRAPH_APPEARANCE.pointSize).toBe(6);
  });
});
