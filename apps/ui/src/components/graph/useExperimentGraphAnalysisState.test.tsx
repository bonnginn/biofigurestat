import { act, renderHook, waitFor } from "@testing-library/react";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { describe, expect, it } from "vitest";

import type { WorkspaceGraphAnalysis } from "../../app/experimentWorkspaceProject";
import { useExperimentGraphAnalysisState } from "./useExperimentGraphAnalysisState";

function successfulAnalysis(requestId: string): WorkspaceGraphAnalysis {
  return {
    request: {},
    result: {
      status: "ok",
      requestId,
      tests: [
        {
          name: "dunnett:condition.vehicle:condition.drug",
          adjustedPValue: 0.01,
        },
      ],
    } as AnalysisEngineResult,
  } as WorkspaceGraphAnalysis;
}

describe("useExperimentGraphAnalysisState", () => {
  it("keeps a restored analysis and its saved annotations unchanged", () => {
    const analysis = successfulAnalysis("request.saved");
    const savedAnnotation = {
      id: "annotation.saved",
      analysisId: "request.saved",
      comparisonId: "dunnett:condition.vehicle:condition.drug",
      testIndex: 0,
      mode: "stars",
      showNonSignificant: false,
      presentation: "bracket",
      endpoints: [
        { conditionId: "condition.vehicle" },
        { conditionId: "condition.drug" },
      ],
    } as const;
    const { result } = renderHook(() =>
      useExperimentGraphAnalysisState({
        initialState: {
          analysis,
          statisticsAnnotation: { mode: "hidden", testIndex: 0 },
          statisticsAnnotations: [savedAnnotation],
        } as never,
        sourceMode: "raw_readout",
        timeAnalysis: { kind: "selected_timepoint" },
        analysisTimePointId: null,
      }),
    );

    expect(result.current.analysis).toBe(analysis);
    expect(result.current.statisticsAnnotations).toEqual([savedAnnotation]);
  });

  it("creates adjusted annotations once for a newly completed analysis", async () => {
    const { result } = renderHook(() =>
      useExperimentGraphAnalysisState({
        sourceMode: "derived_metric",
        timeAnalysis: { kind: "auc", windowStart: 0, windowEnd: 24 },
        analysisTimePointId: "time.24",
      }),
    );

    act(() => result.current.setAnalysis(successfulAnalysis("request.new")));
    await waitFor(() => expect(result.current.statisticsAnnotations).toHaveLength(1));
    expect(result.current.statisticsAnnotations[0]).toMatchObject({
      analysisId: "request.new",
      comparisonId: "dunnett:condition.vehicle:condition.drug",
      pValueStatus: "adjusted",
      lineage: { derivedMetric: "auc", timePointId: "time.24", endpoint: "auc" },
    });
  });
});
