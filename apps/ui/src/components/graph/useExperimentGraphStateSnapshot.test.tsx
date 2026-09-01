import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { WorkspaceGraphStateSnapshotInput } from "../../app/experimentGraphStateSelectors";
import { DEFAULT_GRAPH_APPEARANCE, DEFAULT_GRAPH_LAYERS } from "./useExperimentGraphPresentationState";
import { useExperimentGraphStateSnapshot } from "./useExperimentGraphStateSnapshot";

function input(): WorkspaceGraphStateSnapshotInput {
  return {
    selectedReadoutId: "readout.response",
    sourceMode: "raw_readout",
    selectedConditionIds: ["condition.vehicle", "condition.drug"],
    analysisConditionIds: ["condition.vehicle"],
    selectedTimePointIds: ["time.0", "time.24"],
    analysisTimePointId: "time.24",
    analysisMetric: { kind: "selected_timepoint" },
    comparisonGoal: "difference",
    plannedContrastConditionIds: [],
    graphType: "dot",
    grouping: {
      x: { source: "condition" },
      series: { source: "none" },
      color: { source: "none" },
      shape: { source: "none" },
      facet: null,
    },
    layers: DEFAULT_GRAPH_LAYERS,
    appearance: DEFAULT_GRAPH_APPEARANCE,
    axes: {
      xSemantic: "categorical",
      xTitle: "Treatment",
      xUnit: "",
      yTitle: "Response",
      yRangeMode: "auto",
      yMin: null,
      yMax: null,
      yScale: "linear",
      showCategoryLabels: true,
      hierarchyOrder: [],
      spacing: 1,
      yTickMode: "auto",
      yTickInterval: null,
    },
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    statisticsAnnotations: [],
    initialAnalysisRunId: null,
    analysis: null,
  };
}

describe("useExperimentGraphStateSnapshot", () => {
  it("projects display and analysis sets without sharing the input arrays", () => {
    const source = input();
    const { result } = renderHook(() => useExperimentGraphStateSnapshot(source));

    expect(result.current.dataSets).toMatchObject({
      displaySet: {
        conditionIds: ["condition.vehicle", "condition.drug"],
        timePointIds: ["time.0", "time.24"],
      },
      analysisSet: {
        conditionIds: ["condition.vehicle"],
        timePointIds: ["time.24"],
      },
    });
    expect(result.current.selectedConditionIds).not.toBe(source.selectedConditionIds);
  });

  it("keeps the memoized snapshot until a persisted input changes", () => {
    const first = input();
    const { result, rerender } = renderHook(
      ({ value }: { value: WorkspaceGraphStateSnapshotInput }) =>
        useExperimentGraphStateSnapshot(value),
      { initialProps: { value: first } },
    );
    const initialSnapshot = result.current;
    rerender({ value: { ...first } });
    expect(result.current).toBe(initialSnapshot);
    rerender({ value: { ...first, graphType: "bar" } });
    expect(result.current).not.toBe(initialSnapshot);
    expect(result.current.graphType).toBe("bar");
  });

  it("recomputes when the prespecified equivalence plan changes", () => {
    const first = {
      ...input(),
      comparisonGoal: "equivalence" as const,
      equivalencePlan: {
        schemaVersion: "0.1.0" as const,
        margin: {
          scale: "raw_difference" as const,
          lowerBound: -0.2,
          upperBound: 0.2,
          unit: "AU",
          declaredAsPrespecified: true as const,
        },
        alpha: 0.05 as const,
        claimMode: "single_primary_comparison" as const,
        primaryComparisonId: "condition.vehicle:condition.drug",
      },
    };
    const { result, rerender } = renderHook(
      ({ value }: { value: WorkspaceGraphStateSnapshotInput }) =>
        useExperimentGraphStateSnapshot(value),
      { initialProps: { value: first } },
    );
    const initialSnapshot = result.current;
    rerender({
      value: {
        ...first,
        equivalencePlan: {
          ...first.equivalencePlan,
          margin: { ...first.equivalencePlan.margin, upperBound: 0.3 },
        },
      },
    });

    expect(result.current).not.toBe(initialSnapshot);
    expect(result.current.equivalencePlan?.margin.upperBound).toBe(0.3);
  });
});
