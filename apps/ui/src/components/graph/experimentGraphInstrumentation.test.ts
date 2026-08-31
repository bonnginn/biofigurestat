import { describe, expect, it } from "vitest";
import {
  createBenchmarkAnalysisState,
  createBenchmarkRenderedState,
  createGraphUsageState,
} from "./experimentGraphInstrumentation";

const grouping = {
  x: { source: "condition" as const },
  series: { source: "none" as const },
  color: { source: "none" as const },
  shape: { source: "none" as const },
  facet: null,
};
const layers = {
  raw: true,
  distribution: true,
  experiment: true,
  overall: true,
  violin: false,
  box: false,
  errorBar: true,
  connectingLine: false,
};
const appearance = {
  errorBar: "sd" as const,
  palette: "single" as const,
  pointSize: 6,
  pointOpacity: 0.9,
  axisLineWidth: 1.4,
  hierarchicalLabels: true,
  jitter: 12,
  fontFamily: "arial" as const,
  graphTitleFontSize: 20,
  axisTitleFontSize: 19,
  tickFontSize: 17,
  hierarchyFontSize: 17,
  legendFontSize: 16,
  legendPosition: "hidden" as const,
  seriesColors: {},
  seriesStyles: {},
  distributionFill: "white" as const,
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
  canvasPreset: "standard" as const,
  sidePadding: 72,
};
const axes = {
  xSemantic: "categorical" as const,
  xTitle: "Treatment",
  xUnit: "",
  yTitle: "Response",
  yRangeMode: "auto" as const,
  yMin: null,
  yMax: null,
  yScale: "linear" as const,
  showCategoryLabels: true,
  hierarchyOrder: [],
  spacing: 1,
  yTickMode: "auto" as const,
  yTickInterval: null,
};
const shared = {
  selectedReadoutId: "readout.response",
  sourceMode: "raw_readout" as const,
  selectedConditionIds: ["condition.vehicle", "condition.drug"],
  analysisConditionIds: ["condition.vehicle", "condition.drug"],
  selectedTimePointIds: ["time.0", "time.24"],
};

describe("Graph instrumentation projections", () => {
  it("keeps rendered configuration separate from analysis configuration", () => {
    const rendered = JSON.parse(
      createBenchmarkRenderedState({
        ...shared,
        graphType: "dot",
        grouping,
        layers,
        appearance,
        axes,
        statisticsAnnotation: { mode: "hidden", testIndex: 0 },
        statisticsAnnotations: [],
        timeAnalysis: { kind: "selected_timepoint" },
      }),
    ) as Record<string, unknown>;
    const analysis = JSON.parse(
      createBenchmarkAnalysisState({
        ...shared,
        analysisTimePointId: "time.24",
        timeAnalysis: { kind: "selected_timepoint" },
        selectedStatisticalMethod: "welch_t",
        correlationMethod: undefined,
        contrastIntent: "all_pairs",
        plannedContrastConditionIds: [],
        analysis: null,
      }),
    ) as Record<string, unknown>;

    expect(rendered).toMatchObject({
      graphType: "dot",
      displayedDerivedMetric: null,
    });
    expect(rendered).not.toHaveProperty("selectedStatisticalMethod");
    expect(analysis).toMatchObject({
      selectedStatisticalMethod: "welch_t",
      executedMethod: null,
      executedProtocolVersion: null,
    });
    expect(analysis).not.toHaveProperty("appearance");
  });

  it("records a displayed derived metric only when it is the Graph source", () => {
    const rendered = JSON.parse(
      createBenchmarkRenderedState({
        ...shared,
        sourceMode: "derived_metric",
        graphType: "line",
        grouping,
        layers,
        appearance,
        axes,
        statisticsAnnotation: { mode: "hidden", testIndex: 0 },
        statisticsAnnotations: [],
        timeAnalysis: { kind: "auc", windowStart: 0, windowEnd: 24 },
      }),
    ) as { displayedDerivedMetric: unknown };

    expect(rendered.displayedDerivedMetric).toEqual({
      kind: "auc",
      windowStart: 0,
      windowEnd: 24,
    });
  });

  it("creates stable category fingerprints for usage telemetry", () => {
    const usage = createGraphUsageState({
      graphType: "dot",
      selectedReadoutId: shared.selectedReadoutId,
      sourceMode: shared.sourceMode,
      selectedConditionIds: shared.selectedConditionIds,
      selectedTimePointIds: shared.selectedTimePointIds,
      grouping,
      axes,
      layers,
      appearance,
      statisticsAnnotation: { mode: "hidden", testIndex: 0 },
      statisticsAnnotations: [],
    });

    expect(JSON.parse(usage.series)).toMatchObject({
      selectedReadoutId: "readout.response",
      selectedConditionIds: ["condition.vehicle", "condition.drug"],
    });
    expect(JSON.parse(usage.axes)).toMatchObject({ yTitle: "Response" });
    expect(JSON.parse(usage.annotation)).toMatchObject({
      statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    });
  });
});
