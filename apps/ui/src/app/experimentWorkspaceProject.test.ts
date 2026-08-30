import { describe, expect, it } from "vitest";
import {
  requireAnalysisRequestRecommendation,
  type AnalysisEngineResult,
} from "@lsaa/analysis-contracts";
import { buildStructureContract } from "@lsaa/adaptive-input";
import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";
import { ProjectStateSchema } from "@lsaa/project";

import {
  createExperimentSetDraft,
  experimentCellKey,
  type ExperimentCellMap,
  type ExperimentSetDraft,
} from "./experimentDraft";
import {
  createExperimentWorkspaceDesign,
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
  type WorkspaceGraphState,
} from "./experimentWorkspaceProject";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import { buildExistingDataWorkspace, parseExistingDataText } from "./existingDataImport";
import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import {
  createComplexProportionFixture,
  createCategoricalCompositionFixture,
  createInternalAlphaCoreFixture,
  createLongitudinalFixture,
  createMultipleReadoutFixture,
  createNestedContinuousFixture,
  createWbReferenceFixture,
  createXyCorrelationFixture,
} from "./syntheticFixtures";

const TEST_APPEARANCE: WorkspaceGraphState["appearance"] = {
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

function testAxes(yTitle: string, hierarchyOrder: readonly string[]): WorkspaceGraphState["axes"] {
  return {
    xSemantic: "categorical",
    xTitle: "",
    xUnit: "",
    yTitle,
    yRangeMode: "auto",
    yMin: null,
    yMax: null,
    yScale: "linear",
    showCategoryLabels: true,
    hierarchyOrder: [...hierarchyOrder],
    spacing: 1,
    yTickMode: "auto",
    yTickInterval: null,
  };
}

function fixture(): {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  graph: WorkspaceGraphState;
} {
  const base = createExperimentSetDraft("cell_culture", "proportion");
  const draft: ExperimentSetDraft = {
    ...base,
    name: "Ndel1 proportion",
    attributes: [
      { id: "attribute.sirna", label: "siRNA" },
      { id: "attribute.dox", label: "Dox" },
    ],
    conditions: [
      {
        id: "condition.control.minus",
        label: "control / -",
        attributes: { "attribute.sirna": "control", "attribute.dox": "-" },
      },
      {
        id: "condition.ndel1.plus",
        label: "Ndel1 #1 / +",
        attributes: { "attribute.sirna": "Ndel1 #1", "attribute.dox": "+" },
      },
    ],
    controlConditionId: "condition.control.minus",
    time: {
      sampling: "cross_sectional",
      unit: "h",
      points: [
        { id: "time.24", value: 24 },
        { id: "time.48", value: 48 },
      ],
    },
    experiments: [
      { id: "experiment.1", label: "Exp 1", date: "2026-08-01", note: "passage 10" },
      { id: "experiment.2", label: "Exp 2", date: "2026-08-08", note: "passage 11" },
    ],
  };
  const key = experimentCellKey({
    experimentId: "experiment.1",
    conditionId: "condition.control.minus",
    readoutId: "readout.1",
    timePointId: "time.24",
  });
  const cells: ExperimentCellMap = {
    [key]: { kind: "proportion", positive: 42, eligible: 100 },
    [experimentCellKey({
      experimentId: "experiment.2",
      conditionId: "condition.ndel1.plus",
      readoutId: "readout.1",
      timePointId: "time.48",
    })]: {
      kind: "proportion",
      positive: null,
      eligible: null,
      availability: "not_planned",
    },
  };
  const graph: WorkspaceGraphState = {
    id: "graph.1",
    displayName: "24–48 h comparison",
    analysisRunId: null,
    selectedReadoutId: "readout.1",
    selectedConditionIds: draft.conditions.map(({ id }) => id),
    selectedTimePointIds: ["time.24", "time.48"],
    graphType: "dot",
    layers: {
      raw: true,
      distribution: true,
      experiment: true,
      overall: true,
      violin: false,
      box: true,
      errorBar: true,
      connectingLine: false,
    },
    appearance: TEST_APPEARANCE,
    axes: testAxes(
      "陽性率",
      draft.attributes.map(({ id }) => id),
    ),
  };
  return { draft, cells, graph };
}

describe("experiment workspace project adapter", () => {
  it("compact／expandedの表示選択を科学的データとは別に保存・復元する", () => {
    const { draft, cells } = fixture();
    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [],
      dataViewMode: "expanded",
      now: "2026-08-21T02:00:00.000Z",
    });

    expect(state.experimentWorkspace?.dataViewMode).toBe("expanded");
    expect(rehydrateExperimentWorkspace(state)?.dataViewMode).toBe("expanded");
    const legacyCompatible = ProjectStateSchema.parse({
      ...state,
      experimentWorkspace: {
        ...state.experimentWorkspace!,
        dataViewMode: undefined,
      },
    });
    expect(legacyCompatible.experimentWorkspace?.dataViewMode).toBe("compact");
  });

  it("実験回IDと安定した生物学的単位IDを保存・再読込で分離して保つ", () => {
    const fixture = createLongitudinalFixture();
    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [],
      now: "2026-08-21T03:00:00.000Z",
    });

    expect(state.experimentWorkspace?.experimentSessions).toEqual(
      fixture.draft.experiments.map((experiment) =>
        expect.objectContaining({
          id: experiment.id,
          sessionId: experiment.sessionId,
          stableUnitId: experiment.stableUnitId,
        }),
      ),
    );
    const reopened = rehydrateExperimentWorkspace(state);
    expect(
      reopened?.draft.experiments.map(({ sessionId, stableUnitId }) => ({
        sessionId,
        stableUnitId,
      })),
    ).toEqual(
      fixture.draft.experiments.map(({ sessionId, stableUnitId }) => ({
        sessionId,
        stableUnitId,
      })),
    );
  });
  it("条件属性・実験回・時間・raw counts・graph stateをcanonical projectから再編集できる", () => {
    const { draft, cells, graph } = fixture();
    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [graph],
      now: "2026-08-21T04:00:00.000Z",
    });

    expect(state.schemaVersion).toBe("0.3.0");
    expect(state.observations[0]?.measurement).toEqual({
      kind: "proportion",
      numerator: 42,
      denominator: 100,
    });
    const reopened = rehydrateExperimentWorkspace(state);
    expect(reopened?.draft.attributes).toEqual(draft.attributes);
    expect(reopened?.draft.conditions).toEqual(draft.conditions);
    expect(reopened?.draft.controlConditionId).toBe("condition.control.minus");
    expect(reopened?.draft.experiments).toEqual(draft.experiments);
    expect(reopened?.draft.time).toEqual(draft.time);
    expect(reopened?.cells).toEqual(cells);
    expect(reopened?.graphs).toEqual([{ ...graph, analysis: null }]);
  });

  it("上書き保存では以前のraw revisionを残して新しいrevisionを追加する", () => {
    const { draft, cells, graph } = fixture();
    const first = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [graph],
      now: "2026-08-21T04:00:00.000Z",
    });
    const key = Object.keys(cells)[0];
    const second = createExperimentWorkspaceProject({
      draft,
      cells: { ...cells, [key]: { kind: "proportion", positive: 50, eligible: 100 } },
      graphs: [{ ...graph, displayName: "Updated graph" }],
      existingState: first,
      now: "2026-08-21T05:00:00.000Z",
    });

    expect(second.rawRevisions).toHaveLength(2);
    expect(second.rawRevisions[1]?.previousRevisionId).toBe(first.activeRawRevisionId);
    expect(second.observations).toHaveLength(2);
    expect(rehydrateExperimentWorkspace(second)?.graphs[0]?.displayName).toBe("Updated graph");
    expect(rehydrateExperimentWorkspace(second)?.graphs[0]).toMatchObject({
      graphType: "dot",
      appearance: { jitter: 12 },
      axes: {
        yTitle: "陽性率",
        hierarchyOrder: draft.attributes.map(({ id }) => id),
      },
    });
  });

  it("同じ数値の時点でも保存時のcell keyから別々に復元する", () => {
    const { draft, graph } = fixture();
    const duplicateTimeDraft = {
      ...draft,
      time: {
        ...draft.time,
        points: [
          { id: "time.before", value: 0 },
          { id: "time.after", value: 0 },
        ],
      },
    };
    const beforeKey = experimentCellKey({
      experimentId: "experiment.1",
      conditionId: "condition.control.minus",
      readoutId: "readout.1",
      timePointId: "time.before",
    });
    const afterKey = experimentCellKey({
      experimentId: "experiment.1",
      conditionId: "condition.control.minus",
      readoutId: "readout.1",
      timePointId: "time.after",
    });
    const state = createExperimentWorkspaceProject({
      draft: duplicateTimeDraft,
      cells: {
        [beforeKey]: { kind: "proportion", positive: 10, eligible: 100 },
        [afterKey]: { kind: "proportion", positive: 20, eligible: 100 },
      },
      graphs: [{ ...graph, selectedTimePointIds: ["time.before", "time.after"] }],
      now: "2026-08-21T04:00:00.000Z",
    });

    expect(rehydrateExperimentWorkspace(state)?.cells).toMatchObject({
      [beforeKey]: { kind: "proportion", positive: 10, eligible: 100 },
      [afterKey]: { kind: "proportion", positive: 20, eligible: 100 },
    });
  });

  it("workspace graphが存在しない条件を参照するprojectを拒否する", () => {
    const { draft, cells, graph } = fixture();
    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [graph],
      now: "2026-08-21T04:00:00.000Z",
    });

    expect(() =>
      ProjectStateSchema.parse({
        ...state,
        experimentWorkspace: {
          ...state.experimentWorkspace,
          graphs: [{ ...graph, selectedConditionIds: ["condition.unknown"] }],
        },
      }),
    ).toThrow(/Workspace graph condition/);
    expect(() =>
      ProjectStateSchema.parse({
        ...state,
        experimentWorkspace: {
          ...state.experimentWorkspace,
          notPlannedCellKeys: ["experiment.unknown::condition.control.minus::time.24::readout.1"],
        },
      }),
    ).toThrow(/Not-planned workspace cell/);
  });

  it("実行済み解析をcanonical runとして保存し同じグラフへ復元する", () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const draft: ExperimentSetDraft = {
      ...base,
      conditions: base.conditions.slice(0, 2).map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Control" : "Treatment",
        attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
      })),
      time: { sampling: "none", unit: "h", points: [] },
    };
    const cells: ExperimentCellMap = Object.fromEntries(
      draft.experiments.flatMap((experiment, experimentIndex) =>
        draft.conditions.map((condition, conditionIndex) => [
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: draft.readouts[0].id,
          }),
          {
            kind: "proportion" as const,
            positive: 30 + experimentIndex * 3 + conditionIndex * 10,
            eligible: 100,
          },
        ]),
      ),
    );
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });
    if (!assessment.request) throw new Error("fixture should be analyzable");
    const result: AnalysisEngineResult = {
      protocolVersion: assessment.request.protocolVersion,
      requestId: assessment.request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-21T04:30:00.000Z",
    };
    const graph: WorkspaceGraphState = {
      id: "graph.analysis",
      displayName: "保存する解析",
      analysisRunId: null,
      selectedReadoutId: draft.readouts[0].id,
      selectedConditionIds: draft.conditions.map(({ id }) => id),
      selectedTimePointIds: [],
      graphType: "dot",
      layers: {
        raw: true,
        distribution: true,
        experiment: true,
        overall: true,
        violin: false,
        box: true,
        errorBar: true,
        connectingLine: false,
      },
      appearance: TEST_APPEARANCE,
      axes: testAxes(
        draft.readouts[0].label,
        draft.attributes.map(({ id }) => id),
      ),
      analysis: { request: assessment.request, result },
    };

    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [graph],
      now: "2026-08-21T05:00:00.000Z",
    });

    expect(state.analysisRuns).toHaveLength(1);
    expect(state.graphs).toHaveLength(1);
    expect(state.analysisRuns[0]?.request.projectId).toBe(state.metadata.projectId);
    expect(state.analysisRuns[0]?.request.observations[0]?.observationId).toMatch(/^observation\./);
    const reopened = rehydrateExperimentWorkspace(state);
    expect(reopened?.graphs[0]?.analysis?.result.status).toBe("ok");
    expect(reopened?.graphs[0]?.analysisRunId).toBe(state.analysisRuns[0]?.id);
  });

  it("多因子のX・系列・色・点形と軸設定をGraphSpecへlosslessに投影する", () => {
    const fixture = createNestedContinuousFixture();
    const timePointId = fixture.draft.time.points[0]!.id;
    const assessment = assessDraftGraphAnalysis({
      draft: fixture.draft,
      cells: fixture.cells,
      readoutId: fixture.draft.readouts[0].id,
      conditionIds: fixture.draft.conditions.map(({ id }) => id),
      timePointId,
    });
    if (!assessment.request) throw new Error("factorial fixture should be analyzable");
    const result: AnalysisEngineResult = {
      protocolVersion: assessment.request.protocolVersion,
      requestId: assessment.request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-21T04:45:00.000Z",
    };
    const appearance: WorkspaceGraphState["appearance"] = {
      ...TEST_APPEARANCE,
      palette: "condition",
      legendPosition: "top",
      seriesStyles: {
        "attribute.treatment:+": {
          color: "#cc6677",
          pointStyle: "triangle",
          legendLabel: "Treatment +",
          visible: true,
        },
      },
    };
    const axes: WorkspaceGraphState["axes"] = {
      ...testAxes("Fluorescence intensity", ["attribute.group"]),
      xTitle: "Group",
      tickDirection: "outside",
      showCategoryGroupSeparators: true,
    };
    const graph: WorkspaceGraphState = {
      id: "graph.factorial.channels",
      displayName: "Group × Treatment",
      analysisRunId: null,
      selectedReadoutId: fixture.draft.readouts[0].id,
      selectedConditionIds: fixture.draft.conditions.map(({ id }) => id),
      selectedTimePointIds: [timePointId],
      analysisTimePointId: timePointId,
      graphType: "dot",
      grouping: {
        x: {
          source: "factor",
          factorId: "attribute.group",
          factorIds: ["attribute.group"],
        },
        series: { source: "factor", factorId: "attribute.treatment" },
        color: { source: "factor", factorId: "attribute.group" },
        shape: { source: "factor", factorId: "attribute.treatment" },
        facet: null,
      },
      layers: {
        raw: true,
        distribution: false,
        experiment: true,
        overall: true,
        violin: false,
        box: false,
        errorBar: true,
        connectingLine: false,
      },
      appearance,
      axes,
      analysis: { request: assessment.request, result },
    };

    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [graph],
      now: "2026-08-21T04:45:00.000Z",
    });

    expect(state.graphs[0]?.spec).toMatchObject({
      mappings: {
        x: "attribute.group",
        xHierarchy: ["attribute.group"],
        series: "attribute.treatment",
        color: "attribute.group",
        shape: "attribute.treatment",
      },
      appearance: {
        seriesStyles: {
          "attribute.treatment:+": {
            pointStyle: "triangle",
            legendLabel: "Treatment +",
          },
        },
      },
      axes: {
        xLabel: "Group",
        tickDirection: "outside",
        showCategoryGroupSeparators: true,
      },
    });
    expect(rehydrateExperimentWorkspace(state)?.graphs[0]?.grouping).toMatchObject({
      x: { factorId: "attribute.group" },
      series: { factorId: "attribute.treatment" },
      color: { factorId: "attribute.group" },
      shape: { factorId: "attribute.treatment" },
    });
  });

  it("細胞・ROIの解析は実験単位平均のderived lineageを保存する", () => {
    const base = createExperimentSetDraft("cell_culture", "nested_continuous");
    const draft: ExperimentSetDraft = {
      ...base,
      conditions: base.conditions.slice(0, 2).map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Control" : "Treatment",
        attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
      })),
      time: { sampling: "none", unit: "h", points: [] },
    };
    const cells: ExperimentCellMap = Object.fromEntries(
      draft.experiments.flatMap((experiment, experimentIndex) =>
        draft.conditions.map((condition, conditionIndex) => [
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: draft.readouts[0].id,
          }),
          {
            kind: "nested_continuous" as const,
            source: "paste" as const,
            rawValues: [10 + experimentIndex + conditionIndex, 12 + experimentIndex],
          },
        ]),
      ),
    );
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });
    if (!assessment.request) throw new Error("fixture should be analyzable");
    const result: AnalysisEngineResult = {
      protocolVersion: assessment.request.protocolVersion,
      requestId: assessment.request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-21T04:30:00.000Z",
    };
    const graph: WorkspaceGraphState = {
      id: "graph.nested",
      displayName: "細胞強度",
      analysisRunId: null,
      selectedReadoutId: draft.readouts[0].id,
      selectedConditionIds: draft.conditions.map(({ id }) => id),
      selectedTimePointIds: [],
      graphType: "violin",
      layers: {
        raw: true,
        distribution: true,
        experiment: true,
        overall: true,
        violin: false,
        box: true,
        errorBar: true,
        connectingLine: false,
      },
      appearance: TEST_APPEARANCE,
      axes: testAxes(
        draft.readouts[0].label,
        draft.attributes.map(({ id }) => id),
      ),
      analysis: { request: assessment.request, result },
    };

    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [graph],
      now: "2026-08-21T05:00:00.000Z",
    });

    expect(state.derivedDatasetRevisions).toHaveLength(1);
    expect(state.derivedValues).toHaveLength(6);
    expect(state.analysisRuns[0]?.inputDerivedDatasetRevisionId).toBe(
      state.derivedDatasetRevisions[0]?.id,
    );
    expect(state.analysisRuns[0]?.request.observations).toHaveLength(6);
    expect(state.observations).toHaveLength(12);
  });

  it("合成デモの印と測定予定なしを保存後も区別する", () => {
    const fixture = createComplexProportionFixture();
    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [],
      now: "2026-08-21T05:00:00.000Z",
    });
    const reopened = rehydrateExperimentWorkspace(state);

    expect(reopened?.draft.dataOrigin).toBe("synthetic_demo");
    expect(
      Object.values(reopened?.cells ?? {}).filter((cell) => cell.availability === "not_planned"),
    ).toHaveLength(1);
    expect(state.observations).toHaveLength(70);
  });

  it("明示した条件間の対応を同じ実験単位IDとして保存し再編集できる", () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const draft: ExperimentSetDraft = {
      ...base,
      conditionAssignment: { kind: "matched", unitLabel: "動物" },
      conditions: base.conditions.slice(0, 2).map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Before" : "After",
        attributes: { "attribute.1": index === 0 ? "Before" : "After" },
      })),
    };
    const cells: ExperimentCellMap = Object.fromEntries(
      draft.experiments.flatMap((experiment, experimentIndex) =>
        draft.conditions.map((condition, conditionIndex) => [
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: draft.readouts[0].id,
          }),
          {
            kind: "proportion" as const,
            // Keep paired differences non-degenerate; an identical difference
            // correctly has no finite paired-t standard error.
            positive: 30 + experimentIndex + conditionIndex * (experimentIndex + 1),
            eligible: 100,
          },
        ]),
      ),
    );
    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [],
      now: "2026-08-21T05:00:00.000Z",
    });
    const design = state.designRevisions[0]?.design;
    expect(design?.pairing).toMatchObject({
      kind: "matched",
      matchLevelId: "unit-level.experimental-unit",
    });
    const conditionUnitIds = new Map<string, Set<string>>();
    state.observations.forEach((observation) => {
      const ids = conditionUnitIds.get(observation.conditionId) ?? new Set<string>();
      ids.add(observation.unitInstanceId);
      conditionUnitIds.set(observation.conditionId, ids);
    });
    expect([...conditionUnitIds.values()].map((ids) => [...ids].sort())).toEqual([
      ["unit.unit.1.matched.r1", "unit.unit.2.matched.r1", "unit.unit.3.matched.r1"],
      ["unit.unit.1.matched.r1", "unit.unit.2.matched.r1", "unit.unit.3.matched.r1"],
    ]);
    expect(rehydrateExperimentWorkspace(state)?.draft.conditionAssignment).toEqual({
      kind: "matched",
      unitLabel: "動物",
    });

    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
    });
    if (!assessment.request) throw new Error("paired fixture should be analyzable");
    const result: AnalysisEngineResult = {
      protocolVersion: assessment.request.protocolVersion,
      requestId: assessment.request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-21T05:00:00.000Z",
    };
    const analyzedState = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [
        {
          id: "graph.paired",
          displayName: "Before / After",
          analysisRunId: null,
          selectedReadoutId: draft.readouts[0].id,
          selectedConditionIds: draft.conditions.map(({ id }) => id),
          selectedTimePointIds: [],
          analysisTimePointId: null,
          graphType: "paired_dot",
          layers: {
            raw: false,
            distribution: false,
            experiment: true,
            overall: false,
            violin: false,
            box: false,
            errorBar: false,
            connectingLine: true,
          },
          appearance: TEST_APPEARANCE,
          axes: testAxes(
            "割合",
            draft.attributes.map(({ id }) => id),
          ),
          statisticsAnnotation: { mode: "exact_p", testIndex: 0 },
          analysis: { request: assessment.request, result },
        },
      ],
      now: "2026-08-21T05:30:00.000Z",
    });
    expect(analyzedState.analysisRuns[0]?.request).toMatchObject({
      templateId: "D02",
      observations: expect.arrayContaining([
        expect.objectContaining({ pairId: "unit.unit.1.matched.r1" }),
      ]),
    });
    expect(analyzedState.graphs[0]?.spec).toMatchObject({
      type: "paired_dot",
      appearance: { showPairedLines: true },
    });
  });

  it("全時間を表示するグラフと単一時点の解析範囲を別々に保存する", () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const draft: ExperimentSetDraft = {
      ...base,
      conditions: base.conditions.slice(0, 2).map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Control" : "Treatment",
        attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
      })),
      time: {
        sampling: "cross_sectional",
        unit: "h",
        points: [
          { id: "time.24", value: 24 },
          { id: "time.48", value: 48 },
        ],
      },
    };
    const cells: ExperimentCellMap = Object.fromEntries(
      draft.experiments.flatMap((experiment, experimentIndex) =>
        draft.conditions.flatMap((condition, conditionIndex) =>
          draft.time.points.map((timePoint, timeIndex) => [
            experimentCellKey({
              experimentId: experiment.id,
              conditionId: condition.id,
              readoutId: draft.readouts[0].id,
              timePointId: timePoint.id,
            }),
            {
              kind: "proportion" as const,
              positive: 20 + experimentIndex + conditionIndex * 10 + timeIndex * 20,
              eligible: 100,
            },
          ]),
        ),
      ),
    );
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      timePointId: "time.24",
    });
    if (!assessment.request) throw new Error("time subset should be analyzable");
    const result: AnalysisEngineResult = {
      protocolVersion: assessment.request.protocolVersion,
      requestId: assessment.request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-21T06:00:00.000Z",
    };
    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [
        {
          id: "graph.full-time",
          displayName: "Full time course",
          analysisRunId: null,
          selectedReadoutId: draft.readouts[0].id,
          selectedConditionIds: draft.conditions.map(({ id }) => id),
          selectedTimePointIds: draft.time.points.map(({ id }) => id),
          analysisTimePointId: "time.24",
          graphType: "line",
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
          appearance: TEST_APPEARANCE,
          axes: testAxes(
            "割合",
            draft.attributes.map(({ id }) => id),
          ),
          statisticsAnnotation: { mode: "hidden", testIndex: 0 },
          analysis: { request: assessment.request, result },
        },
      ],
      now: "2026-08-21T06:00:00.000Z",
    });
    expect(state.analysisRuns[0]?.request.observations).toHaveLength(6);
    expect(rehydrateExperimentWorkspace(state)?.graphs[0]).toMatchObject({
      selectedTimePointIds: ["time.24", "time.48"],
      analysisTimePointId: "time.24",
    });
  });

  it("複数の測定項目を別outcomeとraw lineageとして保存・再編集する", () => {
    const fixture = createMultipleReadoutFixture();
    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [],
      now: "2026-08-21T06:30:00.000Z",
    });
    expect(state.designRevisions[0]?.design.outcomes).toHaveLength(2);
    expect(new Set(state.observations.map(({ outcomeId }) => outcomeId))).toEqual(
      new Set(["readout.multi.proportion", "readout.multi.intensity"]),
    );
    expect(rehydrateExperimentWorkspace(state)?.draft.readouts).toEqual(fixture.draft.readouts);
  });

  it("Internal Alpha Core fixtureのstable unit・時点・2 readoutをround tripする", () => {
    const fixture = createInternalAlphaCoreFixture();
    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [],
      now: "2026-08-22T00:00:00.000Z",
    });
    const reopened = rehydrateExperimentWorkspace(ProjectStateSchema.parse(state));
    expect(reopened?.draft.experiments.map(({ stableUnitId }) => stableUnitId)).toEqual(
      fixture.draft.experiments.map(({ stableUnitId }) => stableUnitId),
    );
    expect(reopened?.draft.time).toEqual(fixture.draft.time);
    expect(reopened?.draft.readouts).toEqual(fixture.draft.readouts);
    expect(reopened?.cells).toMatchObject(fixture.cells);
  });

  it("複数のGraphが異なるreadout・subset・解析を独立して保存・再編集する", () => {
    const baseFixture = createMultipleReadoutFixture();
    const thirdCondition = {
      id: "condition.multi.third",
      label: "Treatment 2",
      attributes: { "attribute.group": "Treatment 2" },
    };
    const draft: ExperimentSetDraft = {
      ...baseFixture.draft,
      conditions: [...baseFixture.draft.conditions, thirdCondition],
    };
    const cells: Record<string, ExperimentCellMap[string]> = { ...baseFixture.cells };
    draft.experiments.forEach((experiment, experimentIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: thirdCondition.id,
          readoutId: "readout.multi.proportion",
        })
      ] = { kind: "proportion", positive: 62 + experimentIndex, eligible: 100 };
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: thirdCondition.id,
          readoutId: "readout.multi.intensity",
        })
      ] = {
        kind: "nested_continuous",
        source: "manual",
        rawValues: [30 + experimentIndex, 31 + experimentIndex],
      };
    });
    const subsetA = draft.conditions.slice(0, 2).map(({ id }) => id);
    const subsetB = draft.conditions.slice(1, 3).map(({ id }) => id);
    const assessmentA = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: "readout.multi.proportion",
      conditionIds: subsetA,
    });
    const assessmentB = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: "readout.multi.intensity",
      conditionIds: subsetB,
    });
    if (!assessmentA.request || !assessmentB.request) {
      throw new Error("Both readouts should produce independent validated requests");
    }
    const resultFor = (
      request: NonNullable<typeof assessmentA.request>,
      pValue: number,
    ): AnalysisEngineResult => ({
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: { scipy: "1" } },
      estimates: [],
      tests: [
        {
          name: "welch_two_sample_t_test",
          statisticName: "t",
          statistic: 2,
          degreesOfFreedom: [3],
          pValue,
          adjustedPValue: null,
          effectSizeName: "hedges_g",
          effectSize: 1,
        },
      ],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-21T06:44:00.000Z",
    });
    const baseGraph = {
      analysisRunId: null,
      selectedTimePointIds: [] as string[],
      analysisTimePointId: null,
      analysisMetric: { kind: "selected_timepoint" as const },
      layers: {
        raw: false,
        distribution: false,
        experiment: true,
        overall: true,
        violin: false,
        box: false,
        errorBar: true,
        connectingLine: false,
      },
      appearance: TEST_APPEARANCE,
      statisticsAnnotation: { mode: "hidden" as const, testIndex: 0 },
    };
    const graphs: WorkspaceGraphState[] = [
      {
        ...baseGraph,
        id: "graph.readout.a",
        displayName: "Marker X",
        selectedReadoutId: "readout.multi.proportion",
        selectedConditionIds: subsetA,
        graphType: "dot",
        axes: testAxes("Marker X (%)", ["attribute.multi.condition"]),
        analysis: { request: assessmentA.request, result: resultFor(assessmentA.request, 0.041) },
      },
      {
        ...baseGraph,
        id: "graph.readout.b",
        displayName: "Intensity",
        selectedReadoutId: "readout.multi.intensity",
        selectedConditionIds: subsetB,
        graphType: "violin",
        axes: testAxes("Intensity (a.u.)", ["attribute.multi.condition"]),
        analysis: { request: assessmentB.request, result: resultFor(assessmentB.request, 0.012) },
      },
    ];
    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs,
      now: "2026-08-21T06:45:00.000Z",
    });
    const reopened = rehydrateExperimentWorkspace(state);

    expect(reopened?.graphs).toMatchObject([
      {
        id: "graph.readout.a",
        selectedReadoutId: "readout.multi.proportion",
        selectedConditionIds: subsetA,
        graphType: "dot",
        analysis: { result: { tests: [{ pValue: 0.041 }] } },
      },
      {
        id: "graph.readout.b",
        selectedReadoutId: "readout.multi.intensity",
        selectedConditionIds: subsetB,
        graphType: "violin",
        analysis: { result: { tests: [{ pValue: 0.012 }] } },
      },
    ]);
    expect(state.analysisRuns).toHaveLength(2);
    expect(new Set(state.analysisRuns.map(({ request }) => request.requestId)).size).toBe(2);
    expect(state.analysisRuns.map(({ request }) => request.observations[0]?.conditionId)).toEqual([
      subsetA[0],
      subsetB[0],
    ]);
  });

  it("shared-source解析の親pair IDと条件別child unit IDを保存・再表示でも分離する", () => {
    const now = "2026-08-26T00:00:00.000Z";
    const contract = buildStructureContract({
      experimentName: "Donor split",
      experimentDescription: "Each donor culture was split into vehicle and drug dishes.",
      experimentalUnitLabel: "condition dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
      conditionEntityRelationship: {
        kind: "distinct_condition_units_shared_source",
        sourceUnitLabel: "Donor",
        sourceIdentityLabel: "Donor ID",
        sourceRole: "block",
        completeSetsRequired: true,
      },
    });
    const observations = [
      ["D1", "dish-1", "Vehicle", 1],
      ["D1", "dish-1", "Drug", 2],
      ["D2", "dish-1", "Vehicle", 3],
      ["D2", "dish-1", "Drug", 5],
    ].map(([donor, dish, treatment, value], index) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `shared-source.${index + 1}`,
        readoutKey: "signal",
        identities: { donorid: donor, dishid: dish },
        factors: { treatment },
        axes: {},
        hierarchy: {},
        values: { signal: value },
        missingness: {},
        sourceRow: index + 2,
      }),
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping: null,
      lineage: null,
      now,
    });
    if (!workspace.draft) throw new Error("Shared-source workspace should be ready");
    const assessment = assessDraftGraphAnalysis({
      draft: workspace.draft,
      cells: workspace.cells,
      readoutId: workspace.draft.readouts[0].id,
      conditionIds: workspace.draft.conditions.map(({ id }) => id),
    });
    if (!assessment.request) throw new Error("Shared-source workspace should be analyzable");
    const result: AnalysisEngineResult = {
      protocolVersion: assessment.request.protocolVersion,
      requestId: assessment.request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: now,
    };
    const graph: WorkspaceGraphState = {
      id: "graph.shared-source",
      displayName: "Shared-source signal",
      analysisRunId: null,
      selectedReadoutId: workspace.draft.readouts[0].id,
      selectedConditionIds: workspace.draft.conditions.map(({ id }) => id),
      selectedTimePointIds: [],
      analysisTimePointId: null,
      graphType: "paired_dot",
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
      appearance: TEST_APPEARANCE,
      axes: testAxes("Signal", ["factor.treatment"]),
      statisticsAnnotation: { mode: "hidden", testIndex: 0 },
      analysis: { request: assessment.request, result },
    };

    const state = createExperimentWorkspaceProject({
      draft: workspace.draft,
      cells: workspace.cells,
      graphs: [graph],
      now,
    });
    const experimentalUnits = state.unitInstances.filter(
      ({ levelId }) => levelId === "unit-level.conditiondish",
    );
    const sourceUnits = state.unitInstances.filter(({ levelId }) => levelId === "unit-level.donor");
    expect(experimentalUnits).toHaveLength(4);
    expect(sourceUnits).toHaveLength(2);
    expect(new Set(experimentalUnits.map(({ parentUnitId }) => parentUnitId))).toEqual(
      new Set(sourceUnits.map(({ id }) => id)),
    );
    expect(new Set(experimentalUnits.map(({ metadata }) => metadata.experimentSessionId))).toEqual(
      new Set(workspace.draft.experiments.map(({ id }) => id)),
    );

    const persistedRequest = state.analysisRuns[0]?.request;
    expect(persistedRequest?.observations).toHaveLength(4);
    expect(
      new Set(persistedRequest?.observations.map(({ experimentalUnitId }) => experimentalUnitId)),
    ).toHaveProperty("size", 4);
    expect(new Set(persistedRequest?.observations.map(({ pairId }) => pairId))).toHaveProperty(
      "size",
      2,
    );
    expect(state.graphs[0]?.spec.mappings.pair).toBe("pairId");

    const reopened = rehydrateExperimentWorkspace(
      ProjectStateSchema.parse(JSON.parse(JSON.stringify(state))),
    );
    expect(reopened?.draft.conditionAssignment.matchedTopology).toEqual({
      kind: "distinct_condition_units_shared_source",
      sourceUnitLabel: "Donor",
      sourceIdentityLabel: "Donor ID",
      sourceRole: "block",
    });
    expect(
      new Set(reopened?.graphs[0]?.analysis?.request.observations.map(({ pairId }) => pairId)),
    ).toHaveProperty("size", 2);
  });

  it("adaptive 2x2 factorial uses the same canonical factor cells in Statistics and save", () => {
    const now = "2026-08-29T00:00:00.000Z";
    const contract = buildStructureContract({
      experimentName: "Knockdown rescue",
      experimentDescription: "Control or target siRNA with empty or rescue construct.",
      experimentalUnitLabel: "culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Relative cell viability",
      readoutRepresentation: "scalar",
      factorName: "siRNA",
      factorLevels: ["Control", "Target"],
      additionalFactors: [{ name: "Construct", levels: ["Empty", "Rescue"] }],
      sameIdentityAcrossConditions: false,
    });
    const identityKey = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )?.key;
    const readout = contract.readouts[0];
    if (!identityKey || !readout) throw new Error("Factorial fixture is incomplete");
    const combinations = [
      ["Control", "Empty"],
      ["Control", "Rescue"],
      ["Target", "Empty"],
      ["Target", "Rescue"],
    ] as const;
    const observations = combinations.flatMap(([sirna, construct], combinationIndex) =>
      Array.from({ length: 4 }, (_, replicateIndex) =>
        CanonicalAdaptiveObservationSchema.parse({
          observationId: `factorial.${combinationIndex + 1}.${replicateIndex + 1}`,
          readoutKey: readout.key,
          identities: { [identityKey]: `dish-${combinationIndex + 1}-${replicateIndex + 1}` },
          factors: { sirna, construct },
          axes: {},
          hierarchy: {},
          values: { [readout.key]: 1 + combinationIndex * 0.2 + replicateIndex * 0.01 },
          missingness: {},
          sourceRow: combinationIndex * 4 + replicateIndex + 2,
        }),
      ),
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping: null,
      lineage: null,
      now,
    });
    if (!workspace.draft) throw new Error("Factorial workspace should be ready");
    const adaptiveDraft = workspace.draft;
    const assessment = assessDraftGraphAnalysis({
      draft: adaptiveDraft,
      cells: workspace.cells,
      readoutId: adaptiveDraft.readouts[0].id,
      conditionIds: adaptiveDraft.conditions.map(({ id }) => id),
    });
    if (!assessment.request) throw new Error("Factorial workspace should be analyzable");
    const analysisRequest = assessment.request;
    const design = createExperimentWorkspaceDesign(adaptiveDraft, now);
    expect(() =>
      requireAnalysisRequestRecommendation(design, analysisRequest, {
        outcomeId: adaptiveDraft.readouts[0].id,
      }),
    ).not.toThrow();

    const result: AnalysisEngineResult = {
      protocolVersion: analysisRequest.protocolVersion,
      requestId: analysisRequest.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: now,
    };
    const graph: WorkspaceGraphState = {
      id: "graph.factorial.adaptive",
      displayName: "Knockdown rescue",
      analysisRunId: null,
      selectedReadoutId: adaptiveDraft.readouts[0].id,
      selectedConditionIds: adaptiveDraft.conditions.map(({ id }) => id),
      selectedTimePointIds: [],
      graphType: "dot",
      layers: {
        raw: true,
        distribution: false,
        experiment: true,
        overall: true,
        violin: false,
        box: false,
        errorBar: true,
        connectingLine: false,
      },
      appearance: TEST_APPEARANCE,
      axes: testAxes("Relative cell viability", adaptiveDraft.attributes.map(({ id }) => id)),
      analysis: { request: analysisRequest, result },
    };

    const state = createExperimentWorkspaceProject({
      draft: adaptiveDraft,
      cells: workspace.cells,
      graphs: [graph],
      now,
    });
    expect(state.analysisRuns[0]?.request.templateId).toBe("D05");
    expect(state.designRevisions[0]?.design.factors.map(({ id }) => id)).toEqual([
      "factor.sirna",
      "factor.construct",
    ]);
  });

  it("independent条件の同じ行番号を同一experiment sessionとして保存しない", () => {
    const now = "2026-08-26T00:00:00.000Z";
    const contract = buildStructureContract({
      experimentName: "Independent dishes",
      experimentDescription: "Separate dishes received vehicle or drug independently.",
      experimentalUnitLabel: "Culture dish",
      identityLabel: "Dish ID",
      readoutLabel: "Signal",
      readoutRepresentation: "scalar",
      factorName: "Treatment",
      factorLevels: ["Vehicle", "Drug"],
      sameIdentityAcrossConditions: false,
    });
    const experimentalIdentityKey = contract.identities.find(
      ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
    )?.key;
    const factor = contract.factors[0];
    const readout = contract.readouts[0];
    if (!experimentalIdentityKey || !factor || !readout)
      throw new Error("Independent contract should expose identity, factor, and readout keys");
    const observations = [
      ["vehicle-dish-1", "Vehicle", 1],
      ["vehicle-dish-2", "Vehicle", 2],
      ["drug-dish-1", "Drug", 3],
      ["drug-dish-2", "Drug", 4],
    ].map(([dish, treatment, value], index) =>
      CanonicalAdaptiveObservationSchema.parse({
        observationId: `independent.${index + 1}`,
        readoutKey: readout.key,
        identities: { [experimentalIdentityKey]: dish },
        factors: { [factor.key]: treatment },
        axes: {},
        hierarchy: {},
        values: { [readout.key]: value },
        missingness: {},
        sourceRow: index + 2,
      }),
    );
    const workspace = createAdaptiveWorkspace({
      contract,
      observations,
      mapping: null,
      lineage: null,
      now,
    });
    if (!workspace.draft) throw new Error("Independent workspace should be ready");

    const state = createExperimentWorkspaceProject({
      draft: workspace.draft,
      cells: workspace.cells,
      graphs: [],
      now,
    });
    const experimentalUnits = state.unitInstances.filter(
      ({ levelId }) => levelId === `unit-level.${contract.experimentalUnitLevelKey}`,
    );
    expect(experimentalUnits).toHaveLength(4);
    expect(
      experimentalUnits.every(({ metadata }) => metadata.experimentSessionId === undefined),
    ).toBe(true);
    const reopened = rehydrateExperimentWorkspace(
      ProjectStateSchema.parse(JSON.parse(JSON.stringify(state))),
    );
    expect(reopened?.draft.experiments.every(({ sessionId }) => sessionId === undefined)).toBe(
      true,
    );
    expect(reopened?.draft.experiments.every(({ date }) => date === "")).toBe(true);
  });

  it("D09 scatter解析とX-Y対応を保存し同じworkspaceへ戻せる", () => {
    const fixture = createXyCorrelationFixture();
    const assessment = assessDraftGraphAnalysis({
      draft: fixture.draft,
      cells: fixture.cells,
      readoutId: fixture.draft.readouts[0].id,
      conditionIds: fixture.draft.conditions.map(({ id }) => id),
    });
    if (!assessment.request) throw new Error("XY fixture should be analyzable");
    const result: AnalysisEngineResult = {
      protocolVersion: "0.5.0",
      requestId: assessment.request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-21T07:00:00.000Z",
    };
    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [
        {
          id: "graph.xy",
          displayName: "Area vs intensity",
          analysisRunId: null,
          selectedReadoutId: fixture.draft.readouts[0].id,
          selectedConditionIds: fixture.draft.conditions.map(({ id }) => id),
          selectedTimePointIds: [],
          analysisTimePointId: null,
          graphType: "scatter",
          layers: {
            raw: false,
            distribution: false,
            experiment: true,
            overall: false,
            violin: false,
            box: false,
            errorBar: false,
            connectingLine: false,
          },
          appearance: TEST_APPEARANCE,
          axes: testAxes("Fluorescence intensity (a.u.)", ["attribute.variable"]),
          statisticsAnnotation: { mode: "hidden", testIndex: 0 },
          analysis: { request: assessment.request, result },
        },
      ],
      now: "2026-08-21T07:00:00.000Z",
    });
    expect(state.analysisRuns[0]?.request).toMatchObject({ templateId: "D09", method: "pearson" });
    expect(state.graphs[0]?.spec).toMatchObject({
      type: "scatter",
      mappings: { pair: "experimentalUnitId" },
      axes: { xLabel: "Cell area (µm²)", yLabel: "Fluorescence intensity (a.u.)" },
    });
    expect(rehydrateExperimentWorkspace(state)?.draft.analysisIntent).toEqual(
      fixture.draft.analysisIntent,
    );
  });

  it("カテゴリ別countを1つのsource-preserving measurementとして保存・再編集する", () => {
    const fixture = createCategoricalCompositionFixture();
    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [],
      now: "2026-08-21T07:30:00.000Z",
    });
    expect(state.designRevisions[0]?.design.outcomes[0]?.type).toBe("categorical_counts");
    expect(state.observations[0]?.measurement).toMatchObject({
      kind: "categorical_counts",
      counts: { "category.phase.1": 55, "category.phase.4": 2 },
    });
    const reopened = rehydrateExperimentWorkspace(state);
    expect(reopened?.draft.readouts[0]?.categories).toEqual(fixture.draft.readouts[0]?.categories);
    expect(reopened?.cells).toEqual(fixture.cells);
  });

  it("WBの標的とreferenceの生値を保存し、同じ入力画面へ復元する", () => {
    const base = createExperimentSetDraft("protein_biochemical", "wb_ratio");
    const draft: ExperimentSetDraft = {
      ...base,
      readouts: [
        {
          ...base.readouts[0],
          withinExperimentNormalization: {
            method: "control_equals_one",
            baselineConditionId: base.conditions[0].id,
          },
        },
      ],
      conditions: base.conditions.slice(0, 2).map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Control" : "Treatment",
        attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
      })),
    };
    const key = experimentCellKey({
      experimentId: draft.experiments[0].id,
      conditionId: draft.conditions[0].id,
      readoutId: draft.readouts[0].id,
    });
    const cells: ExperimentCellMap = {
      [key]: { kind: "wb_ratio", target: 120, reference: 30 },
    };
    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [],
      now: "2026-08-21T08:00:00.000Z",
    });

    expect(state.designRevisions[0]?.design.normalizationPlans[0]).toMatchObject({
      method: "loading_control",
      parameters: { referenceLabel: "GAPDH", formula: "target/reference" },
    });
    expect(state.designRevisions[0]?.design.normalizationPlans[1]).toMatchObject({
      method: "control_equals_one",
      parameters: { scope: "within_experiment", baselineConditionId: base.conditions[0].id },
    });
    expect(state.observations[0]?.measurement).toEqual({
      kind: "loading_control_ratio",
      target: 120,
      loadingControl: 30,
      transformationVersion: "0.1.0",
    });
    expect(rehydrateExperimentWorkspace(state)?.cells[key]).toEqual(cells[key]);
    expect(
      rehydrateExperimentWorkspace(state)?.draft.readouts[0]?.withinExperimentNormalization,
    ).toEqual(draft.readouts[0]?.withinExperimentNormalization);
  });

  it("WBの背景補正元測定値・式・補正値を保存し、再編集用に復元する", () => {
    const base = createExperimentSetDraft("protein_biochemical", "wb_ratio");
    const draft: ExperimentSetDraft = {
      ...base,
      readouts: [{ ...base.readouts[0], wbInputMode: "imagej_mean_background_area" }],
      conditions: base.conditions.slice(0, 2).map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Control" : "Treatment",
        attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
      })),
    };
    const key = experimentCellKey({
      experimentId: draft.experiments[0].id,
      conditionId: draft.conditions[0].id,
      readoutId: draft.readouts[0].id,
    });
    const cells: ExperimentCellMap = {
      [key]: {
        kind: "wb_ratio",
        target: null,
        reference: null,
        inputMode: "imagej_mean_background_area",
        targetSource: { intensity: 20, background: 5, area: 60 },
        referenceSource: { intensity: 14, background: 4, area: 60 },
      },
    };
    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [],
      now: "2026-08-22T01:00:00.000Z",
    });
    expect(state.observations[0]?.measurement).toMatchObject({
      kind: "loading_control_ratio",
      target: 900,
      loadingControl: 600,
      sourceMeasurements: {
        method: "mean_intensity_minus_mean_background_times_area",
        target: { intensity: 20, background: 5, area: 60 },
        loadingControl: { intensity: 14, background: 4, area: 60 },
      },
    });
    expect(rehydrateExperimentWorkspace(state)?.cells[key]).toEqual(cells[key]);
    expect(rehydrateExperimentWorkspace(state)?.draft.readouts[0]?.wbInputMode).toBe(
      "imagej_mean_background_area",
    );
  });

  it("WB比の機械精度差を許容して解析済みprojectを再読込する", () => {
    const fixture = createWbReferenceFixture();
    const assessment = assessDraftGraphAnalysis({
      draft: fixture.draft,
      cells: fixture.cells,
      readoutId: fixture.draft.readouts[0].id,
      conditionIds: fixture.draft.conditions.map(({ id }) => id),
    });
    if (!assessment.request) throw new Error("WB fixture should be analyzable");
    const result: AnalysisEngineResult = {
      protocolVersion: assessment.request.protocolVersion,
      requestId: assessment.request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-22T08:00:00.000Z",
    };
    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [
        {
          id: "graph.wb.ratio",
          displayName: "WB ratio",
          analysisRunId: null,
          selectedReadoutId: fixture.draft.readouts[0].id,
          selectedConditionIds: fixture.draft.conditions.map(({ id }) => id),
          selectedTimePointIds: [],
          graphType: "dot",
          layers: {
            raw: false,
            distribution: false,
            experiment: true,
            overall: true,
            violin: false,
            box: false,
            errorBar: true,
            connectingLine: false,
          },
          appearance: TEST_APPEARANCE,
          axes: testAxes(
            "Target/GAPDH",
            fixture.draft.attributes.map(({ id }) => id),
          ),
          analysis: { request: assessment.request, result },
        },
      ],
      now: "2026-08-22T08:10:00.000Z",
    });
    expect(state.analysisRuns[0]?.inputDerivedDatasetRevisionId).toBeNull();
    const reopened = structuredClone(state);
    reopened.analysisRuns[0]!.request.observations[5]!.value! += Number.EPSILON * 4;
    expect(ProjectStateSchema.safeParse(reopened).success).toBe(true);
  });

  it("WBの明示したcontrol=1解析をderived lineageとして保存する", () => {
    const base = createExperimentSetDraft("protein_biochemical", "wb_ratio");
    const conditions = base.conditions.slice(0, 2).map((condition, index) => ({
      ...condition,
      label: index === 0 ? "Control" : "Treatment",
      attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
    }));
    const draft: ExperimentSetDraft = {
      ...base,
      conditions,
      readouts: [
        {
          ...base.readouts[0],
          withinExperimentNormalization: {
            method: "control_equals_one",
            baselineConditionId: conditions[0].id,
          },
        },
      ],
    };
    const cells: Record<string, ExperimentCellMap[string]> = {};
    draft.experiments.forEach((experiment) => {
      conditions.forEach((condition, conditionIndex) => {
        cells[
          experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: draft.readouts[0].id,
          })
        ] = {
          kind: "wb_ratio",
          target: conditionIndex === 0 ? 20 : 40,
          reference: 10,
        };
      });
    });
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells,
      readoutId: draft.readouts[0].id,
      conditionIds: conditions.map(({ id }) => id),
    });
    if (!assessment.request) throw new Error("WB fixture should be analyzable");
    const result: AnalysisEngineResult = {
      protocolVersion: assessment.request.protocolVersion,
      requestId: assessment.request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-21T10:00:00.000Z",
    };
    const graph: WorkspaceGraphState = {
      id: "graph.wb.normalized",
      displayName: "Relative WB",
      analysisRunId: null,
      selectedReadoutId: draft.readouts[0].id,
      selectedConditionIds: conditions.map(({ id }) => id),
      selectedTimePointIds: [],
      graphType: "dot",
      layers: {
        raw: false,
        distribution: false,
        experiment: true,
        overall: true,
        violin: false,
        box: false,
        errorBar: true,
        connectingLine: false,
      },
      appearance: TEST_APPEARANCE,
      axes: testAxes(
        "Relative target/GAPDH",
        draft.attributes.map(({ id }) => id),
      ),
      analysis: { request: assessment.request, result },
    };
    const state = createExperimentWorkspaceProject({
      draft,
      cells,
      graphs: [graph],
      now: "2026-08-21T10:10:00.000Z",
    });

    expect(state.transformations.at(-1)).toMatchObject({
      method: "control_equals_one",
      parameters: { scope: "within_experiment", baselineConditionId: conditions[0].id },
    });
    expect(state.derivedValues.map(({ value }) => value).sort()).toEqual([1, 1, 1, 2, 2, 2]);
    expect(
      state.analysisRuns[0]?.request.observations.every(({ observationId }) =>
        observationId.startsWith("derived-value.workspace.graph.wb.normalized.within-experiment"),
      ),
    ).toBe(true);
  });

  it("AUCの解析windowとraw時系列lineageを保存する", () => {
    const fixture = createLongitudinalFixture();
    const assessment = assessDraftGraphAnalysis({
      draft: fixture.draft,
      cells: fixture.cells,
      readoutId: fixture.draft.readouts[0].id,
      conditionIds: fixture.draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "auc", windowStart: 0, windowEnd: 24 },
    });
    if (!assessment.request) throw new Error("Longitudinal fixture should produce an AUC request");
    const result: AnalysisEngineResult = {
      protocolVersion: assessment.request.protocolVersion,
      requestId: assessment.request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-21T09:30:00.000Z",
    };
    const graph: WorkspaceGraphState = {
      id: "graph.auc",
      displayName: "Time course + AUC",
      analysisRunId: null,
      selectedReadoutId: fixture.draft.readouts[0].id,
      selectedConditionIds: fixture.draft.conditions.map(({ id }) => id),
      selectedTimePointIds: fixture.draft.time.points.map(({ id }) => id),
      analysisTimePointId: null,
      analysisMetric: { kind: "auc", windowStart: 0, windowEnd: 24 },
      graphType: "line",
      layers: {
        raw: true,
        distribution: false,
        experiment: true,
        overall: true,
        violin: false,
        box: false,
        errorBar: true,
        connectingLine: true,
      },
      appearance: TEST_APPEARANCE,
      axes: testAxes("Reporter intensity (a.u.)", ["attribute.group"]),
      statisticsAnnotation: { mode: "hidden", testIndex: 0 },
      analysis: { request: assessment.request, result },
    };
    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [graph],
      now: "2026-08-21T09:30:00.000Z",
    });

    expect(state.transformations).toContainEqual(
      expect.objectContaining({
        method: "time_series_metric",
        parameters: expect.objectContaining({ metric: "auc", windowStart: 0, windowEnd: 24 }),
      }),
    );
    expect(state.derivedValues).toHaveLength(8);
    expect(state.derivedValues[0]?.sourceObservationIds).toHaveLength(4);
    expect(state.experimentWorkspace?.graphs[0]?.analysisMetric).toEqual({
      kind: "auc",
      windowStart: 0,
      windowEnd: 24,
    });
  });

  it("JCB018 deterministic provenance: Radius identityと軸semanticを時間へ偽装せず保存する", () => {
    const longitudinal = createLongitudinalFixture();
    const draft = {
      ...longitudinal.draft,
      conditionAssignment: { kind: "independent" as const, unitLabel: "sample" },
      time: {
        ...longitudinal.draft.time,
        axisSemantic: "numeric_covariate" as const,
        axisTitle: "Radius",
        axisUnit: "µm",
      },
    };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells: longitudinal.cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "full_time_course" },
      withinFactor: { role: "numeric_covariate", title: "Radius", unit: "µm" },
    });
    if (!assessment.request || assessment.request.protocolVersion !== "0.6.0")
      throw new Error("Balanced longitudinal fixture should produce D06");
    const axes = {
      ...testAxes("Reporter intensity (a.u.)", ["attribute.group"]),
      xSemantic: "numeric_covariate" as const,
      xTitle: "Radius",
      xUnit: "µm",
    };
    const graph: WorkspaceGraphState = {
      id: "graph.d06",
      displayName: "Condition by radius",
      analysisRunId: null,
      selectedReadoutId: draft.readouts[0].id,
      sourceMode: "raw_readout",
      selectedConditionIds: draft.conditions.map(({ id }) => id),
      selectedTimePointIds: draft.time.points.map(({ id }) => id),
      analysisTimePointId: null,
      analysisMetric: { kind: "full_time_course" },
      graphType: "line",
      layers: { ...fixture().graph.layers, connectingLine: true },
      appearance: TEST_APPEARANCE,
      axes,
      statisticsAnnotation: { mode: "exact_p", testIndex: 0 },
      analysis: {
        request: assessment.request,
        result: {
          protocolVersion: "0.6.0",
          requestId: assessment.request.requestId,
          status: "ok",
          engine: { name: "fixture", version: "1", packages: {} },
          estimates: [],
          tests: [],
          diagnostics: [],
          warnings: [],
          completedAt: "2026-08-24T00:00:00.000Z",
        },
      },
    };
    const state = createExperimentWorkspaceProject({
      draft,
      cells: longitudinal.cells,
      graphs: [graph],
      now: "2026-08-24T00:00:00.000Z",
    });

    expect(state.derivedDatasetRevisions).toHaveLength(1);
    expect(state.derivedValues).toHaveLength(assessment.request.observations.length);
    expect(state.analysisRuns[0]?.request).toMatchObject({ protocolVersion: "0.6.0" });
    expect(state.analysisRuns[0]?.recommendation.explanation).toContain("Radius");
    expect(state.analysisRuns[0]?.recommendation.explanation.toLowerCase()).not.toMatch(/\btime\b/);
    expect(assessment.title).toContain("条件×Radius");
    expect(assessment.reason).toContain("Radius");
    expect(`${assessment.title}${assessment.reason}`).not.toContain("時間");
    const persistedRequest = state.analysisRuns[0]?.request;
    expect(
      persistedRequest?.protocolVersion === "0.6.0" &&
        persistedRequest.observations.every(
          ({ pairId, experimentalUnitId, timePointId }) =>
            pairId === experimentalUnitId && Boolean(timePointId),
        ),
    ).toBe(true);
    expect(rehydrateExperimentWorkspace(state)?.graphs[0]).toMatchObject({
      analysisMetric: { kind: "full_time_course" },
      axes: { xSemantic: "numeric_covariate", xTitle: "Radius", xUnit: "µm" },
    });
    expect(rehydrateExperimentWorkspace(state)?.draft.time).toMatchObject({
      axisSemantic: "numeric_covariate",
      axisTitle: "Radius",
      axisUnit: "µm",
    });
  });

  it("D07の独立セルidentityと推奨provenanceを保存する", () => {
    const longitudinal = createLongitudinalFixture();
    const draft = {
      ...longitudinal.draft,
      time: { ...longitudinal.draft.time, sampling: "cross_sectional" as const },
      conditionAssignment: { kind: "independent" as const, unitLabel: "sample" },
    };
    const assessment = assessDraftGraphAnalysis({
      draft,
      cells: longitudinal.cells,
      readoutId: draft.readouts[0].id,
      conditionIds: draft.conditions.map(({ id }) => id),
      timeAnalysis: { kind: "full_time_course" },
      withinFactor: { role: "time", title: "Time", unit: "h" },
    });
    if (!assessment.request || assessment.request.protocolVersion !== "0.7.0")
      throw new Error("Balanced cross-sectional fixture should produce D07");
    const recommendation = {
      templateId: "D07" as const,
      templateVersion: "0.1.0",
      recommendedMethod: "two_way_anova" as const,
      alternativeMethods: [],
      reasonCode: "balanced_independent_condition_by_axis_design",
      explanation: assessment.reason,
      statisticalNDefinition: "Independent experimental units in each condition-by-axis cell",
      multiplicityMethod: null,
      decision: { kind: "accepted" as const, selectedMethod: "two_way_anova" as const },
    };
    const graph: WorkspaceGraphState = {
      id: "graph.d07",
      displayName: "Independent condition by time",
      analysisRunId: null,
      selectedReadoutId: draft.readouts[0].id,
      sourceMode: "raw_readout",
      selectedConditionIds: draft.conditions.map(({ id }) => id),
      selectedTimePointIds: draft.time.points.map(({ id }) => id),
      analysisTimePointId: null,
      analysisMetric: { kind: "full_time_course" },
      graphType: "line",
      layers: { ...fixture().graph.layers, connectingLine: false },
      appearance: TEST_APPEARANCE,
      axes: testAxes("Reporter intensity (a.u.)", ["attribute.group"]),
      statisticsAnnotation: { mode: "exact_p", testIndex: 0 },
      analysis: {
        request: assessment.request,
        recommendation,
        result: {
          protocolVersion: "0.7.0",
          requestId: assessment.request.requestId,
          status: "ok",
          engine: { name: "fixture", version: "1", packages: {} },
          estimates: [],
          tests: [],
          diagnostics: [],
          warnings: [],
          completedAt: "2026-08-24T00:00:00.000Z",
        },
      },
    };
    const state = createExperimentWorkspaceProject({
      draft,
      cells: longitudinal.cells,
      graphs: [graph],
      now: "2026-08-24T00:00:00.000Z",
    });
    const persistedRequest = state.analysisRuns[0]?.request;
    const canonicalRecommendation = {
      ...requireAnalysisRequestRecommendation(
        createExperimentWorkspaceDesign(draft, "2026-08-24T00:00:00.000Z"),
        assessment.request,
        { outcomeId: draft.readouts[0].id },
      ),
      decision: recommendation.decision,
    };

    expect(persistedRequest).toMatchObject({ protocolVersion: "0.7.0", templateId: "D07" });
    expect(
      persistedRequest?.protocolVersion === "0.7.0" &&
        new Set(persistedRequest.observations.map(({ experimentalUnitId }) => experimentalUnitId))
          .size === persistedRequest.observations.length &&
        persistedRequest.observations.every(
          ({ pairId, blockId, withinFactorLevelId }) =>
            pairId === undefined && blockId === undefined && Boolean(withinFactorLevelId),
        ),
    ).toBe(true);
    expect(state.analysisRuns[0]?.recommendation).toEqual(canonicalRecommendation);
    expect(state.analysisRuns[0]?.recommendation.explanation).not.toBe(recommendation.explanation);
    expect(rehydrateExperimentWorkspace(state)?.graphs[0]?.analysis?.recommendation).toEqual(
      canonicalRecommendation,
    );
  });

  it("endpoint由来のpaired requestとstable-unit lineageを保存後に再構築する", () => {
    const fixture = createLongitudinalFixture();
    const analysisMetric = { kind: "endpoint" as const, windowStart: 0, windowEnd: 24 };
    const assessment = assessDraftGraphAnalysis({
      draft: fixture.draft,
      cells: fixture.cells,
      readoutId: fixture.draft.readouts[0].id,
      conditionIds: fixture.draft.conditions.map(({ id }) => id),
      timeAnalysis: analysisMetric,
    });
    if (!assessment.request)
      throw new Error("Longitudinal endpoint should produce a paired request");
    const graph: WorkspaceGraphState = {
      id: "graph.endpoint",
      displayName: "Time course + endpoint",
      analysisRunId: null,
      selectedReadoutId: fixture.draft.readouts[0].id,
      sourceMode: "derived_metric",
      selectedConditionIds: fixture.draft.conditions.map(({ id }) => id),
      selectedTimePointIds: fixture.draft.time.points.map(({ id }) => id),
      analysisTimePointId: null,
      analysisMetric,
      graphType: "line",
      layers: {
        raw: true,
        distribution: false,
        experiment: true,
        overall: true,
        violin: false,
        box: false,
        errorBar: true,
        connectingLine: true,
      },
      appearance: TEST_APPEARANCE,
      axes: testAxes("Reporter intensity (a.u.)", ["attribute.group"]),
      statisticsAnnotation: { mode: "hidden", testIndex: 0 },
      analysis: {
        request: assessment.request,
        result: {
          protocolVersion: assessment.request.protocolVersion,
          requestId: assessment.request.requestId,
          status: "ok",
          engine: { name: "fixture", version: "1", packages: {} },
          estimates: [],
          tests: [],
          diagnostics: [],
          warnings: [],
          completedAt: "2026-08-23T00:00:00.000Z",
        },
      },
    };
    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [graph],
      now: "2026-08-23T00:00:00.000Z",
    });
    const reopened = rehydrateExperimentWorkspace(state);
    const rebuilt = reopened
      ? assessDraftGraphAnalysis({
          draft: reopened.draft,
          cells: reopened.cells,
          readoutId: reopened.draft.readouts[0].id,
          conditionIds: reopened.draft.conditions.map(({ id }) => id),
          timeAnalysis: reopened.graphs[0]?.analysisMetric ?? analysisMetric,
        })
      : null;
    expect(reopened?.graphs[0]?.analysisMetric).toEqual(analysisMetric);
    expect(rebuilt?.request?.observations).toEqual(assessment.request.observations);
    expect(state.derivedValues).toHaveLength(8);
    const persistedUnitIds = new Set(
      state.derivedValues.map(({ experimentalUnitId }) => experimentalUnitId),
    );
    expect(persistedUnitIds.size).toBe(4);
    expect(
      fixture.draft.experiments.every(({ stableUnitId }) =>
        [...persistedUnitIds].some((persistedId) => persistedId.includes(stableUnitId ?? "")),
      ),
    ).toBe(true);
  });

  it("解析未実行でも派生時間指標をGraph sourceとして永続化する", () => {
    const fixture = createLongitudinalFixture();
    const graph: WorkspaceGraphState = {
      id: "graph.auc.source",
      displayName: "AUC per unit",
      analysisRunId: null,
      selectedReadoutId: fixture.draft.readouts[0].id,
      sourceMode: "derived_metric",
      selectedConditionIds: fixture.draft.conditions.map(({ id }) => id),
      selectedTimePointIds: fixture.draft.time.points.map(({ id }) => id),
      analysisTimePointId: null,
      analysisMetric: { kind: "auc", windowStart: 0, windowEnd: 24 },
      graphType: "paired_dot",
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
      appearance: TEST_APPEARANCE,
      axes: testAxes("AUC", ["attribute.group"]),
      statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    };
    const state = createExperimentWorkspaceProject({
      draft: fixture.draft,
      cells: fixture.cells,
      graphs: [graph],
      now: "2026-08-21T09:45:00.000Z",
    });

    expect(state.analysisRuns).toHaveLength(0);
    expect(state.derivedDatasetRevisions).toHaveLength(1);
    expect(state.derivedValues).toHaveLength(8);
    expect(state.derivedValues[0]).toMatchObject({
      experimentalUnitId: expect.stringContaining("unit.cell"),
      sourceObservationIds: expect.any(Array),
    });
    expect(rehydrateExperimentWorkspace(state)?.graphs[0]).toMatchObject({
      sourceMode: "derived_metric",
      analysisMetric: { kind: "auc", windowStart: 0, windowEnd: 24 },
      selectedReadoutId: fixture.draft.readouts[0].id,
    });
  });

  it("既存表のsource rowをcanonical observationと再編集cellに保持する", () => {
    const imported = buildExistingDataWorkspace(
      parseExistingDataText(
        "Experiment\tCondition\tMean\nE1\tControl\t10\nE1\tTreatment\t20\nE2\tControl\t11\nE2\tTreatment\t21",
      ),
      {
        experimentColumn: 0,
        sessionColumn: 0,
        unitColumn: 0,
        conditionColumn: 1,
        timeColumn: null,
        valueColumn: 2,
        timeSampling: "none",
        readoutLabel: "Intensity",
        readoutUnit: "a.u.",
        sourceLabel: "source.tsv",
        importedAt: "2026-08-21T09:55:00.000Z",
      },
    );
    const state = createExperimentWorkspaceProject({
      draft: imported.draft,
      cells: imported.cells,
      graphs: [],
      now: "2026-08-21T10:00:00.000Z",
    });
    expect(state.observations[0]?.sourceLocation).toContain("#source=clipboard%3AMean%3Arow%3A1");
    expect(state.metadata.experimentDate).toBe("");
    expect(Object.values(rehydrateExperimentWorkspace(state)?.cells ?? {})[0]).toMatchObject({
      sourceLocations: ["clipboard:Mean:row:1"],
    });
    expect(rehydrateExperimentWorkspace(state)?.draft.importProvenance).toMatchObject({
      sourceLabel: "source.tsv",
      importedAt: "2026-08-21T09:55:00.000Z",
      mapping: { sessionColumn: 0, unitColumn: 0, conditionColumn: 1, valueColumn: 2 },
      duplicateDecision: "none",
    });
    expect(rehydrateExperimentWorkspace(state)?.draft.experiments.every(({ date }) => !date)).toBe(
      true,
    );
  });
});
