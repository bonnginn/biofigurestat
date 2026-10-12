import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { ProjectStateSchema } from "@lsaa/project";
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { ExperimentGraphWorkbench } from "../components/graph/ExperimentGraphWorkbench";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import {
  createExperimentWorkspaceProject,
  type WorkspaceGraphState,
} from "./experimentWorkspaceProject";
import {
  rebindAnalysisAnnotationReferences,
  synchronizeSavedWorkspaceGraphAnalyses,
} from "./savedWorkspaceGraphAnalyses";
import { createPairedTwoConditionFixture } from "./syntheticFixtures";

const now = "2026-10-08T00:00:00.000Z";
const appearance: WorkspaceGraphState["appearance"] = {
  errorBar: "sd",
  palette: "single",
  pointSize: 6,
  pointOpacity: 0.9,
  axisLineWidth: 1.4,
  hierarchicalLabels: true,
  jitter: 12,
  fontFamily: "arial",
  graphTitleFontSize: 18,
  axisTitleFontSize: 17,
  tickFontSize: 15,
  hierarchyFontSize: 15,
  legendFontSize: 15,
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
};

function annotation(
  id: string,
  analysisId?: string,
): NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number] {
  return {
    id,
    ...(analysisId ? { analysisId } : {}),
    testIndex: 0,
    mode: "exact_p",
    showNonSignificant: true,
    presentation: "bracket",
    legendLabel: "Original label",
  };
}

function fixture() {
  const { draft, cells } = createPairedTwoConditionFixture();
  const assessment = assessDraftGraphAnalysis({
    draft,
    cells,
    readoutId: draft.readouts[0]!.id,
    conditionIds: draft.conditions.map(({ id }) => id),
  });
  if (assessment.state !== "ready" || !assessment.request) {
    throw new Error("FIXTURE_SETUP_FAILED: paired synthetic analysis must be executable");
  }
  const result: AnalysisEngineResult = {
    protocolVersion: assessment.request.protocolVersion,
    requestId: assessment.request.requestId,
    status: "ok",
    engine: { name: "synthetic-sync-fixture", version: "1", packages: {} },
    estimates: [],
    tests: [
      {
        name: "paired_t_test",
        statisticName: "t",
        statistic: 3,
        degreesOfFreedom: [3],
        pValue: 0.02,
        adjustedPValue: null,
        effectSizeName: "dz",
        effectSize: 1.2,
      },
    ],
    diagnostics: [],
    warnings: [],
    completedAt: now,
  };
  const conditionIds = draft.conditions.map(({ id }) => id);
  const submitted: WorkspaceGraphState = {
    id: "graph.saved-sync",
    displayName: "Synthetic paired signal",
    analysisRunId: null,
    selectedReadoutId: draft.readouts[0]!.id,
    sourceMode: "raw_readout",
    selectedConditionIds: conditionIds,
    analysisConditionIds: conditionIds,
    selectedTimePointIds: [],
    analysisTimePointId: null,
    analysisMetric: { kind: "selected_timepoint" },
    graphType: "paired_dot",
    dataSets: {
      displaySet: { conditionIds, timePointIds: [] },
      analysisSet: { conditionIds, timePointIds: [] },
      comparisonSet: [],
      annotationSet: [],
    },
    layers: {
      raw: false,
      distribution: false,
      experiment: true,
      overall: true,
      violin: false,
      box: false,
      errorBar: true,
      connectingLine: true,
    },
    appearance,
    axes: {
      xSemantic: "categorical",
      xTitle: "Phase",
      xUnit: "",
      yTitle: "Signal",
      yRangeMode: "auto",
      yMin: null,
      yMax: null,
      yScale: "linear",
      showCategoryLabels: true,
      hierarchyOrder: ["attribute.phase"],
      spacing: 1,
      yTickMode: "auto",
      yTickInterval: null,
    },
    statisticsAnnotation: { mode: "exact_p", testIndex: 0 },
    statisticsAnnotations: [annotation("annotation.matching", assessment.request.requestId)],
    analysis: { request: assessment.request, result },
  };
  // This single construction creates a schema-valid authoritative saved run.
  // No repeated nonadaptive serialization is used in these pure-helper tests.
  const savedState = ProjectStateSchema.parse(
    createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [submitted],
      now,
    }),
  );
  expect(savedState.analysisRuns, "fixture: exactly one persisted run").toHaveLength(1);
  const run = savedState.analysisRuns[0]!;
  expect(run.request.requestId, "fixture: the save assigns a canonical request ID").not.toBe(
    submitted.analysis!.request.requestId,
  );
  return { draft, cells, submitted, savedState, run, savedJson: JSON.stringify(savedState) };
}

function synchronize(current: WorkspaceGraphState, context: ReturnType<typeof fixture>) {
  const submittedJson = JSON.stringify(context.submitted);
  const currentJson = JSON.stringify(current);
  const graphs = synchronizeSavedWorkspaceGraphAnalyses({
    currentGraphs: [current],
    submittedGraphs: [context.submitted],
    savedState: context.savedState,
  });
  expect(
    JSON.stringify(context.savedState),
    "persisted ProjectState must remain byte-for-byte JSON equivalent",
  ).toBe(context.savedJson);
  expect(JSON.stringify(context.submitted), "submitted graph must remain immutable").toBe(
    submittedJson,
  );
  expect(JSON.stringify(current), "live graph input must remain immutable").toBe(currentJson);
  return graphs[0]!;
}

const changedCurrentAnalyses: Array<{
  name: string;
  change: (submitted: WorkspaceGraphState) => WorkspaceGraphState;
}> = [
  {
    name: "a newer execution completed while saving",
    change: (submitted) => ({
      ...submitted,
      analysis: {
        ...submitted.analysis!,
        result: {
          ...submitted.analysis!.result,
          completedAt: "2026-10-08T00:01:00.000Z",
        },
      },
    }),
  },
  {
    name: "analysis was invalidated while saving",
    change: (submitted) => ({
      ...submitted,
      analysis: null,
      analysisRunId: null,
      statisticsAnnotations: [],
    }),
  },
  {
    name: "the scientific source mode changed while saving",
    change: (submitted) => ({
      ...submitted,
      sourceMode: "derived_metric",
    }),
  },
  {
    name: "the analysis data subset changed while saving",
    change: (submitted) => ({
      ...submitted,
      dataSets: {
        ...submitted.dataSets!,
        analysisSet: {
          ...submitted.dataSets!.analysisSet,
          conditionIds: [submitted.selectedConditionIds[0]!],
        },
      },
    }),
  },
  {
    name: "the analysis metric changed while saving",
    change: (submitted) => ({
      ...submitted,
      analysisMetric: { kind: "endpoint" },
    }),
  },
];

describe("synchronizeSavedWorkspaceGraphAnalyses", () => {
  it("adopts the canonical saved payload while keeping current appearance and hand-edited annotations", () => {
    const context = fixture();
    const oldRequestId = context.submitted.analysis!.request.requestId;
    const current: WorkspaceGraphState = {
      ...context.submitted,
      displayName: "Edited during save",
      graphType: "dot",
      appearance: { ...context.submitted.appearance, pointSize: 11, palette: "colorblind" },
      axes: { ...context.submitted.axes, yTitle: "Hand-edited axis" },
      layers: { ...context.submitted.layers, connectingLine: false },
      statisticsAnnotation: { mode: "symbol", testIndex: 0 },
      statisticsAnnotations: [
        {
          ...annotation("annotation.matching", oldRequestId),
          mode: "symbol",
          legendLabel: "Hand-edited label",
        },
        annotation("annotation.other-run", "request.other-run"),
        annotation("annotation.unbound"),
      ],
    };
    expect(synchronize(current, context)).toEqual({
      ...current,
      analysisRunId: context.run.id,
      analysis: {
        request: context.run.request,
        result: context.run.result,
        recommendedMethod: context.run.recommendation.recommendedMethod,
        recommendation: context.run.recommendation,
      },
      statisticsAnnotations: [
        { ...current.statisticsAnnotations![0]!, analysisId: context.run.request.requestId },
        current.statisticsAnnotations![1]!,
        current.statisticsAnnotations![2]!,
      ],
    });
  });

  it.each(changedCurrentAnalyses)("preserves current state when $name", ({ change }) => {
    const context = fixture();
    const current = change(context.submitted);
    expect(synchronize(current, context)).toEqual(current);
  });

  it("accepts the existing selected-timepoint default when the workbench makes it explicit", () => {
    const context = fixture();
    const submitted = { ...context.submitted, analysisMetric: undefined };
    const savedJson = JSON.stringify(context.savedState);
    const [graph] = synchronizeSavedWorkspaceGraphAnalyses({
      currentGraphs: [context.submitted],
      submittedGraphs: [submitted],
      savedState: context.savedState,
    });
    expect(graph!.analysisRunId).toBe(context.run.id);
    expect(graph!.analysis!.request).toEqual(context.run.request);
    expect(JSON.stringify(context.savedState)).toBe(savedJson);
  });

  it("keeps hand-edited annotations when the real workbench adopts saved IDs and emits its next state", async () => {
    const context = fixture();
    const oldRequestId = context.submitted.analysis!.request.requestId;
    const submitted: WorkspaceGraphState = {
      ...context.submitted,
      statisticsAnnotation: { mode: "symbol", testIndex: 0 },
      statisticsAnnotations: [
        {
          ...annotation("annotation.matching", oldRequestId),
          mode: "symbol",
          legendLabel: "Hand-edited matched annotation",
          showNonSignificant: false,
          endpoints: [
            { conditionId: context.submitted.selectedConditionIds[0]!, seriesKey: "Before" },
            { conditionId: context.submitted.selectedConditionIds[1]!, seriesKey: "After" },
          ],
          pValueStatus: "unadjusted",
          lineage: { derivedMetric: "selected_timepoint" },
        },
        {
          ...annotation("annotation.other-run", "request.other-run"),
          legendLabel: "Keep the other run",
          presentation: "symbol_only",
        },
        {
          ...annotation("annotation.unbound"),
          mode: "symbol",
          legendLabel: "Keep the unbound annotation",
        },
      ],
    };
    const submittedJson = JSON.stringify(submitted);
    const snapshots: Array<Omit<WorkspaceGraphState, "id" | "displayName">> = [];
    const props = {
      draft: context.draft,
      cells: context.cells,
      onClose: () => undefined,
      workspaceMode: "graph" as const,
      analysisAvailable: false,
      onStateChange: (state: Omit<WorkspaceGraphState, "id" | "displayName">) => {
        snapshots.push(state);
      },
    };
    const view = render(
      createElement(ExperimentGraphWorkbench, { ...props, initialState: submitted }),
    );
    const initialSnapshot = snapshots.at(-1)!;
    expect(
      initialSnapshot.analysis!.request.requestId,
      "fixture: mount retains the unsaved execution ID",
    ).toBe(oldRequestId);
    expect(
      initialSnapshot.statisticsAnnotations,
      "fixture: mount retains the hand-edited annotations",
    ).toEqual(submitted.statisticsAnnotations);

    const adopted = synchronize(submitted, { ...context, submitted });
    view.rerender(createElement(ExperimentGraphWorkbench, { ...props, initialState: adopted }));
    await waitFor(() => {
      const emitted = snapshots.at(-1)!;
      expect(emitted.analysisRunId).toBe(context.run.id);
      expect(emitted.analysis).toEqual(adopted.analysis);
      expect(emitted.statisticsAnnotation).toEqual(submitted.statisticsAnnotation);
      // The fixture has only an unadjusted primary test, so automatic adjusted
      // comparison generation would erase all three hand-edited annotations.
      expect(emitted.statisticsAnnotations).toEqual([
        { ...submitted.statisticsAnnotations![0]!, analysisId: context.run.request.requestId },
        submitted.statisticsAnnotations![1]!,
        submitted.statisticsAnnotations![2]!,
      ]);
      expect(emitted.appearance).toEqual(initialSnapshot.appearance);
    });
    expect(JSON.stringify(context.savedState)).toBe(context.savedJson);
    expect(JSON.stringify(submitted)).toBe(submittedJson);
    view.unmount();
  });
});

describe("rebindAnalysisAnnotationReferences", () => {
  it("changes only references to the submitted request and preserves hand edits and other runs", () => {
    const annotations = [
      {
        ...annotation("annotation.matching", "request.live"),
        mode: "symbol" as const,
        legendLabel: "Edited label",
      },
      annotation("annotation.other-run", "request.other-run"),
      annotation("annotation.unbound"),
    ];
    const originalJson = JSON.stringify(annotations);
    expect(
      rebindAnalysisAnnotationReferences(annotations, "request.live", "request.canonical"),
    ).toEqual([
      { ...annotations[0]!, analysisId: "request.canonical" },
      annotations[1]!,
      annotations[2]!,
    ]);
    expect(JSON.stringify(annotations)).toBe(originalJson);
  });

  it("preserves absent annotations and annotations without a request-ID transition", () => {
    const annotations = [annotation("annotation.matching", "request.canonical")];
    expect(
      rebindAnalysisAnnotationReferences(undefined, "request.live", "request.canonical"),
    ).toBeUndefined();
    expect(rebindAnalysisAnnotationReferences(annotations, undefined, "request.canonical")).toEqual(
      annotations,
    );
    expect(
      rebindAnalysisAnnotationReferences(annotations, "request.canonical", "request.canonical"),
    ).toEqual(annotations);
  });
});
