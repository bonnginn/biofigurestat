import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { useExperimentGraphWorkspaceEffects } from "./useExperimentGraphWorkspaceEffects";

const snapshot = { graphType: "dot" } as Omit<WorkspaceGraphState, "id" | "displayName">;

describe("Graph workspace state effects", () => {
  it("selects the mode inspector, clears absent analysis, and emits the snapshot", () => {
    const setInspectorTarget = vi.fn();
    const setAnalysis = vi.fn();
    const setStatisticsAnnotation = vi.fn();
    const setStatisticsAnnotations = vi.fn();
    const onStateChange = vi.fn();

    renderHook(() =>
      useExperimentGraphWorkspaceEffects({
        workspaceMode: "graph",
        initialAnalysis: null,
        graphStateSnapshot: snapshot,
        onStateChange,
        setInspectorTarget,
        setAnalysis,
        setStatisticsAnnotation,
        setStatisticsAnnotations,
      }),
    );

    expect(setInspectorTarget).toHaveBeenCalledWith("data");
    expect(setAnalysis).toHaveBeenCalledWith(null);
    expect(setStatisticsAnnotation).toHaveBeenCalledWith({ mode: "hidden", testIndex: 0 });
    expect(setStatisticsAnnotations).toHaveBeenCalledWith([]);
    expect(onStateChange).toHaveBeenCalledWith(snapshot);
  });

  it("uses the latest callback and does not clear a restored analysis", () => {
    const setters = {
      setInspectorTarget: vi.fn(),
      setAnalysis: vi.fn(),
      setStatisticsAnnotation: vi.fn(),
      setStatisticsAnnotations: vi.fn(),
    };
    const first = vi.fn();
    const second = vi.fn();
    const restoredAnalysis = {} as Parameters<typeof useExperimentGraphWorkspaceEffects>[0]["initialAnalysis"];
    const { rerender } = renderHook(
      (props: { mode: "combined" | "statistics"; state: typeof snapshot; callback: typeof first }) =>
        useExperimentGraphWorkspaceEffects({
          workspaceMode: props.mode,
          initialAnalysis: restoredAnalysis,
          graphStateSnapshot: props.state,
          onStateChange: props.callback,
          ...setters,
        }),
      { initialProps: { mode: "combined", state: snapshot, callback: first } },
    );
    expect(setters.setAnalysis).not.toHaveBeenCalled();

    const next = { ...snapshot, graphType: "bar" as const };
    rerender({ mode: "statistics", state: next, callback: second });
    expect(setters.setInspectorTarget).toHaveBeenLastCalledWith("statistics");
    expect(second).toHaveBeenCalledWith(next);
  });
});
