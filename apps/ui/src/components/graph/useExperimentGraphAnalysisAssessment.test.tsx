import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assessDraftGraphAnalysis } from "../../app/experimentDraftAnalysis";
import { useExperimentGraphAnalysisAssessment } from "./useExperimentGraphAnalysisAssessment";

vi.mock("../../app/experimentDraftAnalysis", () => ({
  assessDraftGraphAnalysis: vi.fn(() => ({ state: "ready", request: { requestId: "request.1" } })),
}));

const mockedAssessment = vi.mocked(assessDraftGraphAnalysis);

describe("useExperimentGraphAnalysisAssessment", () => {
  beforeEach(() => mockedAssessment.mockClear());

  it("reassesses only when a semantic analysis input changes", () => {
    const base = {
      draft: {},
      cells: {},
      readoutId: "readout.1",
      conditionIds: ["condition.1", "condition.2"],
      timePointId: "time.1" as string,
      timeAnalysis: { kind: "selected_timepoint" },
      selectedMethod: "welch_t",
      contrastIntent: "all_pairs",
      plannedContrastConditionIds: [],
      withinFactor: { role: "categorical", title: "Treatment", unit: "" },
    } as const;
    const { result, rerender } = renderHook(
      ({ input }) => useExperimentGraphAnalysisAssessment(input as never),
      { initialProps: { input: base } },
    );

    expect(result.current).toMatchObject({ state: "ready" });
    expect(mockedAssessment).toHaveBeenCalledOnce();
    rerender({ input: base });
    expect(mockedAssessment).toHaveBeenCalledOnce();

    rerender({ input: { ...base, timePointId: "time.2" } });
    expect(mockedAssessment).toHaveBeenCalledTimes(2);
    expect(mockedAssessment.mock.calls[1][0]).toMatchObject({ timePointId: "time.2" });
  });
});
