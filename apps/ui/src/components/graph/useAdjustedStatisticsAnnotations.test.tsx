import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceGraphAnalysis } from "../../app/experimentWorkspaceProject";
import { useAdjustedStatisticsAnnotations } from "./useAdjustedStatisticsAnnotations";

function successfulResult(requestId: string) {
  return { status: "ok", requestId, tests: [] } as unknown as WorkspaceGraphAnalysis["result"];
}

describe("adjusted Statistics annotations", () => {
  it("does not replace restored annotations for the initial request", () => {
    const setStatisticsAnnotations = vi.fn();
    renderHook(() =>
      useAdjustedStatisticsAnnotations({
        initialRequestId: "request.saved",
        analysisResult: successfulResult("request.saved"),
        adjustedAnnotations: [],
        setStatisticsAnnotations,
      }),
    );
    expect(setStatisticsAnnotations).not.toHaveBeenCalled();
  });

  it("applies each new successful request once", () => {
    const setStatisticsAnnotations = vi.fn();
    const annotation = {
      id: "annotation.1",
      analysisId: "request.new",
    } as never;
    const { rerender } = renderHook(
      (props: { result: WorkspaceGraphAnalysis["result"] | null }) =>
        useAdjustedStatisticsAnnotations({
          initialRequestId: null,
          analysisResult: props.result,
          adjustedAnnotations: [annotation],
          setStatisticsAnnotations,
        }),
      { initialProps: { result: null as WorkspaceGraphAnalysis["result"] | null } },
    );

    const result = successfulResult("request.new");
    rerender({ result });
    expect(setStatisticsAnnotations).toHaveBeenCalledOnce();
    expect(setStatisticsAnnotations).toHaveBeenCalledWith([annotation]);
    rerender({ result });
    expect(setStatisticsAnnotations).toHaveBeenCalledOnce();
  });
});
