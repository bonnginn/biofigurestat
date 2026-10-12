import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExperimentWorkspace } from "../pages/ExperimentWorkspace";
import type { AnalysisRunner } from "./analysisClient";
import { experimentCellKey, type ExperimentCellMap, type ExperimentSetDraft } from "./experimentDraft";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
  type WorkspaceGraphState,
} from "./experimentWorkspaceProject";
import type { SaveProjectAction } from "./projectActions";
import { createPairedTwoConditionFixture } from "./syntheticFixtures";
import { setUsageConsent } from "./usageTelemetry";

const firstTime = "2026-10-08T00:00:00.000Z";
const noopTime = "2026-10-08T01:00:00.000Z";
const editTime = "2026-10-08T02:00:00.000Z";
const executionTime = "2026-10-08T03:00:00.000Z";
const originalNumerators = [28, 34, 31, 37, 42, 39, 49, 45];
const editedNumerators = [28, 34, 31, 37, 46, 39, 49, 45];
const percentages = (numerators: number[]) => numerators.map((value) => (value / 100) * 100)
  .sort((first, second) => first - second);
const historyKeys = [
  "rawRevisions", "designRevisions", "unitInstances", "observations", "analysisRuns",
  "graphs", "transformations", "derivedDatasetRevisions", "derivedValues", "provenanceEvents",
] as const;
const appearance: WorkspaceGraphState["appearance"] = {
  errorBar: "sd", palette: "single", pointSize: 6, pointOpacity: 0.9,
  axisLineWidth: 1.4, hierarchicalLabels: true, jitter: 12, fontFamily: "arial",
  graphTitleFontSize: 18, axisTitleFontSize: 17, tickFontSize: 15,
  hierarchyFontSize: 15, legendFontSize: 15, legendPosition: "hidden",
  seriesColors: {}, seriesStyles: {}, distributionFill: "white",
  distributionFillColor: "#ffffff", distributionOutlineColor: "#111111",
  barWidth: 0.72, withinGroupSpacing: 0.72, betweenGroupSpacing: 1.35,
  rawPointColor: "#8a96a3", summaryColor: "#111111", errorBarColor: "#111111",
  connectingLineColor: "#4b5563", summaryLineWidth: 2, errorBarLineWidth: 1.5,
  connectingLineWidth: 1.5, distributionLineWidth: 1.2,
  canvasPreset: "standard", sidePadding: 72,
};

function legacyFixture() {
  // This existing fixture constructs a legacy draft directly; no adaptive fields are stripped.
  const fixture = createPairedTwoConditionFixture();
  expect(fixture.draft.adaptiveInput, "fixture: legacy input has no adaptive companion").toBeUndefined();
  expect(fixture.draft.experiments).toHaveLength(4);
  expect(fixture.draft.conditionAssignment.kind).toBe("matched");
  const controlConditionId = fixture.draft.conditions[0]!.id;
  const draft: ExperimentSetDraft = { ...fixture.draft, controlConditionId };
  return { draft, cells: fixture.cells };
}

function numericValues(request: AnalysisEngineRequest) {
  return request.observations.map(({ value }) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("FIXTURE_REQUIRES_FINITE_PROPORTION_PERCENTAGES");
    }
    return value;
  }).sort((first, second) => first - second);
}

function syntheticResult(request: AnalysisEngineRequest, completedAt: string): AnalysisEngineResult {
  // No statistical engine or numerical test is invoked by these persistence tests.
  return {
    protocolVersion: request.protocolVersion, requestId: request.requestId,
    status: "ok", engine: { name: "synthetic-legacy-noop-fixture", version: "1", packages: {} },
    estimates: [], tests: [], diagnostics: [], warnings: [], completedAt,
  };
}

function assessedExecution(
  draft: ExperimentSetDraft, cells: ExperimentCellMap, completedAt: string, numerators: number[],
) {
  const assessment = assessDraftGraphAnalysis({
    draft, cells, readoutId: draft.readouts[0]!.id,
    conditionIds: draft.conditions.map(({ id }) => id),
  });
  if (assessment.state !== "ready" || !assessment.request) {
    throw new Error("FIXTURE_SETUP_FAILED: the declared four paired individuals must be executable");
  }
  expect(assessment.nByCondition.map(({ n }) => n), "fixture: biological n per condition").toEqual([4, 4]);
  expect(assessment.request).toMatchObject({
    protocolVersion: "0.1.0", templateId: "D02", method: "paired_t",
    contrastConditionIds: draft.conditions.map(({ id }) => id),
    options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
  });
  expect(numericValues(assessment.request), "fixture: actual request uses the current positive / eligible counts")
    .toEqual(percentages(numerators));
  return { request: assessment.request, result: syntheticResult(assessment.request, completedAt) };
}

function graphFor(draft: ExperimentSetDraft, cells: ExperimentCellMap): WorkspaceGraphState {
  return {
    id: "graph.legacy-noop", displayName: "Synthetic paired responders", analysisRunId: null,
    selectedReadoutId: draft.readouts[0]!.id,
    selectedConditionIds: draft.conditions.map(({ id }) => id), selectedTimePointIds: [],
    analysisTimePointId: null, analysisMetric: { kind: "selected_timepoint" }, graphType: "paired_dot",
    layers: { raw: false, distribution: false, experiment: true, overall: true,
      violin: false, box: false, errorBar: true, connectingLine: true },
    appearance,
    axes: { xSemantic: "categorical", xTitle: "Condition", xUnit: "", yTitle: "Responders (%)",
      yRangeMode: "auto", yMin: null, yMax: null, yScale: "linear",
      showCategoryLabels: true, hierarchyOrder: ["attribute.phase"], spacing: 1,
      yTickMode: "auto", yTickInterval: null },
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    analysis: assessedExecution(draft, cells, firstTime, originalNumerators),
  };
}

function reopen(state: ProjectState) {
  const result = rehydrateExperimentWorkspace(ProjectStateSchema.parse(JSON.parse(JSON.stringify(state))));
  if (!result) throw new Error("FIXTURE_SETUP_FAILED: the saved legacy workspace must reopen");
  return result;
}

function expectWholeHistory(previous: ProjectState, next: ProjectState) {
  for (const key of historyKeys) {
    expect(next[key], `product: unedited legacy Save preserves the entire ${key}`).toEqual(previous[key]);
  }
  expect(next.activeRawRevisionId).toBe(previous.activeRawRevisionId);
  expect(next.activeDesignRevisionId).toBe(previous.activeDesignRevisionId);
  expect(next.metadata.projectId).toBe(previous.metadata.projectId);
  expect(next.metadata.createdAt).toBe(previous.metadata.createdAt);
}

function requestCoordinates(request: AnalysisEngineRequest, state: ProjectState) {
  return request.observations.map(({ conditionId, experimentalUnitId }) => {
    const unit = state.unitInstances.find(({ id }) => id === experimentalUnitId);
    if (!unit) throw new Error("PRODUCT_REQUEST_UNIT_MUST_EXIST_IN_CANONICAL_REGISTRY");
    return { conditionId, label: unit.label, stableUnitId: unit.metadata.stableUnitId,
      sessionId: unit.metadata.sessionId, experimentSessionId: unit.metadata.experimentSessionId };
  });
}

describe("legacy workspace no-op saves", () => {
  afterEach(cleanup);

  it("preserves reopened paired history exactly, revisions only a true count edit, and appends its fresh execution once", () => {
    const fixture = legacyFixture();
    const fixtureJson = JSON.stringify(fixture);
    const graph = graphFor(fixture.draft, fixture.cells);
    const first = ProjectStateSchema.parse(createExperimentWorkspaceProject({
      ...fixture, graphs: [graph], now: firstTime,
    }));
    expect(first.rawRevisions, "fixture: first saved revision").toHaveLength(1);
    expect(first.observations, "fixture: canonical raw counts").toHaveLength(8);
    expect(first.unitInstances, "fixture: four paired biological units").toHaveLength(4);
    expect(first.analysisRuns).toHaveLength(1);
    expect(first.graphs).toHaveLength(1);
    expect(first.analysisRuns[0]!.state).toBe("current");
    expect(first.analysisRuns[0]!.inputDerivedDatasetRevisionId).toBeNull();
    expect(first.adaptiveInput ?? null).toBeNull();
    expect(first.experimentWorkspace!.adaptiveInput ?? null).toBeNull();
    const firstJson = JSON.stringify(first);
    const reopened = reopen(first);
    const noop = ProjectStateSchema.parse(createExperimentWorkspaceProject({
      draft: reopened.draft, cells: reopened.cells, graphs: reopened.graphs,
      existingState: first, now: noopTime,
    }));
    // This is the before-fix product boundary, after the formal fixture and real reopen have succeeded.
    expectWholeHistory(first, noop);
    expect(noop.experimentWorkspace!.graphs[0]!.analysisRunId).toBe(first.analysisRuns[0]!.id);
    expect(noop.analysisRuns[0]!.state).toBe("current");
    const editSource = reopen(noop);
    const changedCellKey = experimentCellKey({
      experimentId: editSource.draft.experiments[0]!.id,
      conditionId: editSource.draft.conditions[1]!.id, readoutId: editSource.draft.readouts[0]!.id,
    });
    expect(editSource.cells[changedCellKey], "fixture: original Animal 1 / After count").toEqual({
      kind: "proportion", positive: 42, eligible: 100,
    });
    const editedCells: ExperimentCellMap = {
      ...editSource.cells, [changedCellKey]: { kind: "proportion", positive: 46, eligible: 100 },
    };
    assessedExecution(editSource.draft, editedCells, executionTime, editedNumerators);
    const rawEdited = ProjectStateSchema.parse(createExperimentWorkspaceProject({
      draft: editSource.draft, cells: editedCells,
      graphs: [{ ...editSource.graphs[0]!, analysisRunId: null, analysis: null }],
      existingState: noop, now: editTime,
    }));
    expect(rawEdited.rawRevisions).toHaveLength(2);
    expect(rawEdited.rawRevisions[0]).toEqual(first.rawRevisions[0]);
    expect(rawEdited.rawRevisions[1]!.previousRevisionId).toBe(first.activeRawRevisionId);
    expect(rawEdited.designRevisions).toEqual(first.designRevisions);
    expect(rawEdited.unitInstances.slice(0, 4)).toEqual(first.unitInstances);
    expect(rawEdited.unitInstances).toHaveLength(8);
    expect(rawEdited.unitInstances.slice(4).map(({ id: _id, ...identity }) => identity))
      .toEqual(first.unitInstances.map(({ id: _id, ...identity }) => identity));
    expect(rawEdited.observations.slice(0, 8)).toEqual(first.observations);
    expect(rawEdited.observations).toHaveLength(16);
    const activeObservations = rawEdited.observations.filter(({ rawRevisionId }) => rawRevisionId === rawEdited.activeRawRevisionId);
    expect(activeObservations).toHaveLength(8);
    expect(activeObservations.filter(({ measurement }) => measurement.kind === "proportion" &&
      measurement.numerator === 46 && measurement.denominator === 100)).toHaveLength(1);
    const activeUnitIds = new Set(activeObservations.map(({ unitInstanceId }) => unitInstanceId));
    expect(activeUnitIds.size).toBe(4);
    const staleReason = `Raw data changed from ${first.activeRawRevisionId} to ${rawEdited.activeRawRevisionId}`;
    expect(rawEdited.analysisRuns, "old scientific payload is exact while canonical stale fields change")
      .toEqual(first.analysisRuns.map((run) => ({ ...run, state: "stale", staleReason })));
    expect(rawEdited.graphs).toEqual(first.graphs.map((savedGraph) => ({ ...savedGraph, state: "stale", staleReason })));
    expect(rawEdited.provenanceEvents.slice(0, first.provenanceEvents.length)).toEqual(first.provenanceEvents);
    expect(rawEdited.experimentWorkspace!.graphs[0]!.analysisRunId).toBeNull();
    const rawEditedJson = JSON.stringify(rawEdited);
    const afterEdit = reopen(rawEdited);
    expect(afterEdit.graphs[0]!.analysis).toBeNull();
    const analysis = assessedExecution(afterEdit.draft, afterEdit.cells, executionTime, editedNumerators);
    const executed = ProjectStateSchema.parse(createExperimentWorkspaceProject({
      draft: afterEdit.draft, cells: afterEdit.cells,
      graphs: [{ ...afterEdit.graphs[0]!, analysisRunId: null, analysis }],
      existingState: rawEdited, now: executionTime,
    }));
    expect(executed.rawRevisions, "new execution over saved raw data does not add another raw revision").toEqual(rawEdited.rawRevisions);
    expect(executed.activeRawRevisionId).toBe(rawEdited.activeRawRevisionId);
    for (const key of historyKeys) {
      expect(executed[key].slice(0, rawEdited[key].length), `product: prior edited ${key} stays exact`).toEqual(rawEdited[key]);
    }
    expect(executed.analysisRuns).toHaveLength(2);
    expect(executed.graphs).toHaveLength(2);
    const run = executed.analysisRuns[1]!;
    expect(run).toMatchObject({ state: "current", staleReason: null,
      inputRawRevisionId: rawEdited.activeRawRevisionId, inputDerivedDatasetRevisionId: null });
    const oldRequest = first.analysisRuns[0]!.request;
    const { requestId: _oldRequestId, analysisId: _oldAnalysisId, observations: _oldObservations, ...oldFamily } = oldRequest;
    const { requestId: _newRequestId, analysisId: _newAnalysisId, observations: _newObservations, ...newFamily } = run.request;
    expect(newFamily, "protocol, scientific family, contrast, project identity and options stay exact").toEqual(oldFamily);
    expect(run.recommendation).toEqual(first.analysisRuns[0]!.recommendation);
    expect(numericValues(run.request)).toEqual(percentages(editedNumerators));
    expect(requestCoordinates(run.request, executed)).toEqual(requestCoordinates(oldRequest, first));
    expect(new Set(run.request.observations.map(({ experimentalUnitId }) => experimentalUnitId))).toEqual(activeUnitIds);
    expect(run.request.observations.every(({ pairId, experimentalUnitId }) => pairId === experimentalUnitId)).toBe(true);
    for (const condition of executed.experimentWorkspace!.conditions) {
      expect(run.request.observations.filter(({ conditionId }) => conditionId === condition.id)).toHaveLength(4);
    }
    expect(run.result).toEqual(syntheticResult(run.request, executionTime));
    for (const key of historyKeys) {
      expect(new Set(executed[key].map(({ id }) => id)).size, `product: ${key} IDs are unique`).toBe(executed[key].length);
    }
    expect(new Set(executed.analysisRuns.map(({ request }) => request.requestId)).size).toBe(2);
    expect(new Set(executed.analysisRuns.map(({ request }) => request.analysisId)).size).toBe(2);
    expect(executed.experimentWorkspace!.graphs[0]!.analysisRunId).toBe(run.id);
    for (const key of ["controlConditionId", "conditions", "conditionAssignment", "readoutDefinitions", "analysisIntent"] as const) {
      expect(executed.experimentWorkspace![key]).toEqual(first.experimentWorkspace![key]);
    }
    expect(executed.transformations).toEqual([]);
    expect(executed.derivedDatasetRevisions).toEqual([]);
    expect(executed.derivedValues).toEqual([]);
    expect(JSON.stringify(first)).toBe(firstJson);
    expect(JSON.stringify(rawEdited)).toBe(rawEditedJson);
    expect(JSON.stringify(fixture)).toBe(fixtureJson);
  });

  it("keeps history when the real UI fills a reopened planned missing count cell with its default blank", async () => {
    localStorage.clear();
    setUsageConsent("opted_out");
    window.history.replaceState({}, "", "/");
    const fixture = legacyFixture();
    const missingCellKey = experimentCellKey({
      experimentId: fixture.draft.experiments[3]!.id,
      conditionId: fixture.draft.conditions[1]!.id, readoutId: fixture.draft.readouts[0]!.id,
    });
    const cells = Object.fromEntries(Object.entries(fixture.cells).filter(([key]) => key !== missingCellKey));
    const assessment = assessDraftGraphAnalysis({
      draft: fixture.draft, cells, readoutId: fixture.draft.readouts[0]!.id,
      conditionIds: fixture.draft.conditions.map(({ id }) => id),
    });
    // The current assessment explicitly restricts inference to complete pairs.
    // This fixture saves raw data without creating any execution or result.
    expect(assessment.state, "fixture: current complete-pair policy remains unchanged").toBe("ready");
    expect(assessment.nByCondition.map(({ n }) => n)).toEqual([3, 3]);
    expect(assessment.request?.observations).toHaveLength(6);
    const first = ProjectStateSchema.parse(createExperimentWorkspaceProject({
      draft: fixture.draft, cells, graphs: [], now: firstTime,
    }));
    expect(first.rawRevisions, "fixture: valid persisted legacy project with one planned missing cell").toHaveLength(1);
    expect(first.observations).toHaveLength(7);
    expect(first.unitInstances).toHaveLength(4);
    expect(first.analysisRuns).toEqual([]);
    expect(first.graphs).toEqual([]);
    expect(first.experimentWorkspace!.notPlannedCellKeys).toEqual([]);
    const firstJson = JSON.stringify(first);
    const reopened = reopen(first);
    expect(Object.keys(reopened.cells)).toHaveLength(7);
    expect(reopened.cells[missingCellKey]).toBeUndefined();
    const target = "C:/synthetic-acceptance/legacy-planned-missing.lsa";
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state: ProjectStateSchema.parse(JSON.parse(JSON.stringify(state))), target,
    }));
    const analysisRunner = vi.fn<AnalysisRunner>(async () => {
      throw new Error("NO_ENGINE_EXECUTION_EXPECTED");
    });
    // This mounts the actual createCellsForDraft + initialCells initializer; no helper is duplicated.
    render(createElement(ExperimentWorkspace, {
      initialDraft: reopened.draft, initialCells: reopened.cells, initialGraphs: reopened.graphs,
      initialProject: { state: first, target }, onBack: () => undefined,
      saveProject, analysisAvailable: false, analysisRunner,
    }));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject, "product: actual UI Save submits a formal project").toHaveBeenCalledTimes(1));
    await screen.findByText("プロジェクトを保存しました。次回もこの入力画面で再編集できます。");
    const saved = ProjectStateSchema.parse(saveProject.mock.calls[0]![0]);
    expectWholeHistory(first, saved);
    expect(saved.experimentWorkspace!.notPlannedCellKeys).toEqual([]);
    expect(saved.experimentWorkspace!.controlConditionId).toBe(first.experimentWorkspace!.controlConditionId);
    expect(saved.observations).toHaveLength(7);
    expect(analysisRunner).not.toHaveBeenCalled();
    expect(JSON.stringify(first)).toBe(firstJson);
  }, 15000);
});
