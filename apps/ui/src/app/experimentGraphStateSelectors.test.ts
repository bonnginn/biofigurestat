import { describe, expect, it } from "vitest";

import type { WorkspaceGraphAnalysis } from "./experimentWorkspaceProject";
import {
  createWorkspaceGraphStateSnapshot,
  type WorkspaceGraphStateSnapshotInput,
} from "./experimentGraphStateSelectors";

const baseInput = (): WorkspaceGraphStateSnapshotInput => ({
  selectedReadoutId: "readout.response",
  sourceMode: "raw_readout",
  selectedConditionIds: ["condition.vehicle", "condition.drug"],
  analysisConditionIds: ["condition.vehicle", "condition.drug"],
  selectedTimePointIds: ["time.0", "time.24"],
  analysisTimePointId: null,
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
  layers: {
    raw: true,
    distribution: true,
    experiment: true,
    overall: true,
    violin: false,
    box: false,
    errorBar: true,
    connectingLine: false,
  },
  appearance: {
    errorBar: "sd",
    palette: "single",
    pointSize: 6,
    pointOpacity: 0.9,
    axisLineWidth: 1.4,
    hierarchicalLabels: true,
    jitter: 12,
    fontFamily: "arial",
    graphTitleFontSize: 20,
    axisTitleFontSize: 19,
    tickFontSize: 17,
    hierarchyFontSize: 17,
    legendFontSize: 16,
    legendPosition: "hidden",
    seriesColors: {},
    seriesStyles: {},
    distributionFill: "white",
    distributionFillColor: "#ffffff",
    distributionOutlineColor: "#111111",
    barWidth: 0.72,
    withinGroupSpacing: 0.72,
    betweenGroupSpacing: 1.35,
    rawPointColor: "#8a96a3",
    summaryColor: "#111111",
    errorBarColor: "#111111",
    connectingLineColor: "#4b5563",
    summaryLineWidth: 2,
    errorBarLineWidth: 1.5,
    connectingLineWidth: 1.5,
    distributionLineWidth: 1.2,
    canvasPreset: "standard",
    sidePadding: 72,
  },
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
});

describe("workspace Graph state selector", () => {
  const equivalencePlan = {
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
  };

  it("keeps display and analysis selections distinct without inferring scientific structure", () => {
    const input = baseInput();
    const snapshot = createWorkspaceGraphStateSnapshot({
      ...input,
      analysisConditionIds: ["condition.vehicle"],
      analysisTimePointId: "time.24",
    });

    expect(snapshot.selectedConditionIds).toEqual([
      "condition.vehicle",
      "condition.drug",
    ]);
    expect(snapshot.dataSets).toMatchObject({
      displaySet: {
        conditionIds: ["condition.vehicle", "condition.drug"],
        timePointIds: ["time.0", "time.24"],
      },
      analysisSet: {
        conditionIds: ["condition.vehicle"],
        timePointIds: ["time.24"],
      },
    });
    expect(snapshot.analysisRunId).toBeNull();
  });

  it("preserves planned and annotated comparisons and links annotations only with endpoints", () => {
    const snapshot = createWorkspaceGraphStateSnapshot({
      ...baseInput(),
      plannedContrastConditionIds: [["condition.vehicle", "condition.drug"]],
      statisticsAnnotations: [
        {
          id: "annotation.result",
          comparisonId: "comparison.result",
          testIndex: 0,
          mode: "exact_p",
          showNonSignificant: true,
          endpoints: [
            { conditionId: "condition.vehicle" },
            { conditionId: "condition.drug" },
          ],
        },
        {
          id: "annotation.no-endpoints",
          testIndex: 1,
          mode: "symbol",
          showNonSignificant: false,
        },
      ],
    });

    expect(snapshot.dataSets?.comparisonSet).toEqual([
      {
        id: "planned.1",
        conditionIds: ["condition.vehicle", "condition.drug"],
      },
      {
        id: "comparison.result",
        conditionIds: ["condition.vehicle", "condition.drug"],
      },
    ]);
    expect(snapshot.dataSets?.annotationSet).toEqual([
      { comparisonId: "comparison.result" },
    ]);
  });

  it("persists the scientific comparison goal without manufacturing an analysis", () => {
    const snapshot = createWorkspaceGraphStateSnapshot({
      ...baseInput(),
      comparisonGoal: "equivalence",
      equivalencePlan,
    });

    expect(snapshot.comparisonGoal).toBe("equivalence");
    expect(snapshot.equivalencePlan).toEqual(equivalencePlan);
    expect(snapshot.analysis).toBeNull();
    expect(snapshot.analysisRunId).toBeNull();
  });

  it("does not persist an equivalence plan under an ordinary difference goal", () => {
    const snapshot = createWorkspaceGraphStateSnapshot({
      ...baseInput(),
      comparisonGoal: "difference",
      equivalencePlan,
    });

    expect(snapshot.equivalencePlan).toBeUndefined();
  });

  it("retains an existing analysis-run reference only while analysis remains attached", () => {
    const analysis = {} as WorkspaceGraphAnalysis;
    expect(
      createWorkspaceGraphStateSnapshot({
        ...baseInput(),
        initialAnalysisRunId: "analysis.run.1",
        analysis,
      }).analysisRunId,
    ).toBe("analysis.run.1");
    expect(
      createWorkspaceGraphStateSnapshot({
        ...baseInput(),
        initialAnalysisRunId: "analysis.run.1",
        analysis: null,
      }).analysisRunId,
    ).toBeNull();
  });

  it("copies selection arrays so later editor mutations cannot rewrite an emitted snapshot", () => {
    const selectedConditionIds = ["condition.vehicle", "condition.drug"];
    const input = { ...baseInput(), selectedConditionIds };
    const snapshot = createWorkspaceGraphStateSnapshot(input);

    selectedConditionIds.push("condition.later");

    expect(snapshot.selectedConditionIds).toEqual([
      "condition.vehicle",
      "condition.drug",
    ]);
    expect(snapshot.dataSets?.displaySet.conditionIds).toEqual([
      "condition.vehicle",
      "condition.drug",
    ]);
  });
});
