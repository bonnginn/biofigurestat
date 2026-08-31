import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchmarkGraphConfigurationInput } from "./experimentGraphInstrumentation";
import { useBenchmarkGraphConfigurationEffects } from "./useBenchmarkGraphConfigurationEffects";

const recordBenchmarkEvent = vi.fn();
vi.mock("../../app/benchmarkEvaluation", () => ({
  recordBenchmarkEvent: (...args: unknown[]) => recordBenchmarkEvent(...args),
}));
vi.mock("../../app/evaluationMode", () => ({
  evaluationMode: { enabled: true },
  evaluationModeIsConfigured: () => true,
}));

const configuration = {
  graphType: "dot",
  selectedReadoutId: "readout.response",
  sourceMode: "raw_readout",
  selectedConditionIds: ["vehicle", "drug"],
  analysisConditionIds: ["vehicle", "drug"],
  selectedTimePointIds: [],
  timeAnalysis: { kind: "selected_timepoint" },
  selectedStatisticalMethod: "welch_t",
  statisticsAnnotation: { mode: "hidden", testIndex: 0 },
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
} satisfies BenchmarkGraphConfigurationInput;

const identity = {
  benchmarkVersion: "1.0.0",
  caseId: "D01",
  track: "track_A" as const,
  runId: "run.1",
};

describe("benchmark Graph configuration effects", () => {
  beforeEach(() => recordBenchmarkEvent.mockClear());

  it("records open once and later analysis-only changes with the same identity", () => {
    const { rerender } = renderHook(
      (props: {
        renderedState: string;
        analysisState: string;
        configuration: BenchmarkGraphConfigurationInput;
      }) =>
        useBenchmarkGraphConfigurationEffects({
          identity,
          ...props,
        }),
      {
        initialProps: {
          renderedState: "rendered.1",
          analysisState: "analysis.1",
          configuration,
        },
      },
    );

    expect(recordBenchmarkEvent).toHaveBeenCalledWith(
      "graph_workspace_opened",
      { selectedGraph: "dot", readoutId: "readout.response" },
      "non_rendering_ui",
    );

    rerender({
      renderedState: "rendered.1",
      analysisState: "analysis.2",
      configuration,
    });
    expect(recordBenchmarkEvent).toHaveBeenLastCalledWith(
      "analysis_configuration_changed",
      expect.objectContaining({ selectedMethod: "welch_t" }),
      "analysis_only",
    );
  });
});
