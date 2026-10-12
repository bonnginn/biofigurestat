import { buildStructureContract, validateCanonicalObservationsForContract } from "@lsaa/adaptive-input";
import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { CanonicalAdaptiveObservationSchema } from "@lsaa/domain";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { describe, expect, it } from "vitest";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { experimentCellKey, type ExperimentCellMap, type ExperimentSetDraft } from "./experimentDraft";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
  type WorkspaceGraphState,
} from "./experimentWorkspaceProject";

const firstTime = "2026-10-08T00:00:00.000Z";
const secondTime = "2026-10-08T01:00:00.000Z";
const editTime = "2026-10-08T02:00:00.000Z";
const thirdTime = "2026-10-08T03:00:00.000Z";
const originalPercentages = [8, 16, 20, 24, 48, 80];
// Retain the existing percentage arithmetic, including its IEEE-754 result.
const editedPercentages = [8, 16, 20, (7 / 25) * 100, 48, 80];
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

function numericValues(request: AnalysisEngineRequest) {
  return request.observations.map((observation) => {
    if (typeof observation.value !== "number" || !Number.isFinite(observation.value)) {
      throw new Error("FIXTURE_REQUIRES_FINITE_PROPORTION_PERCENTAGES");
    }
    return observation.value;
  }).sort((first, second) => first - second);
}

function syntheticResult(request: AnalysisEngineRequest, completedAt: string): AnalysisEngineResult {
  // Exercise actual request preparation and persistence, without invoking an engine.
  return {
    protocolVersion: request.protocolVersion, requestId: request.requestId,
    status: "ok", engine: { name: "synthetic-artifact-advance-fixture", version: "1", packages: {} },
    estimates: [], tests: [], diagnostics: [], warnings: [], completedAt,
  };
}

function assessedExecution(
  draft: ExperimentSetDraft, cells: ExperimentCellMap,
  completedAt: string, expectedPercentages: number[],
) {
  const assessment = assessDraftGraphAnalysis({
    draft, cells, readoutId: draft.readouts[0]!.id,
    conditionIds: draft.conditions.map(({ id }) => id),
  });
  if (assessment.state !== "ready" || !assessment.request) {
    throw new Error("FIXTURE_SETUP_FAILED: three declared matched samples must be executable");
  }
  expect(assessment.nByCondition.map(({ n }) => n), "fixture: biological n per condition").toEqual([3, 3]);
  expect(assessment.request).toMatchObject({
    protocolVersion: "0.1.0", templateId: "D02", method: "paired_t",
    contrastConditionIds: draft.conditions.map(({ id }) => id),
    options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
  });
  expect(numericValues(assessment.request), "fixture: actual request contains the current typed-count percentages")
    .toEqual(expectedPercentages);
  return { request: assessment.request, result: syntheticResult(assessment.request, completedAt) };
}

function pairedAdaptiveFixture() {
  const contract = buildStructureContract({
    experimentName: "Synthetic paired artifact revision advance",
    experimentDescription: "Three explicitly declared samples measured under both conditions.",
    experimentalUnitLabel: "Sample", identityLabel: "Sample ID",
    readoutLabel: "Positive fraction", readoutRepresentation: "proportion_counts",
    factorName: "Treatment", factorLevels: ["Control", "Drug"],
    sameIdentityAcrossConditions: true,
    conditionEntityRelationship: { kind: "same_entity_across_conditions" },
  });
  const identityKey = contract.matching.identityKey!;
  const factorKey = contract.factors[0]!.key;
  const readoutKey = contract.readouts[0]!.key;
  const observations = [[2, 6], [4, 12], [5, 20]].flatMap((counts, sampleIndex) =>
    counts.map((numerator, conditionIndex) => CanonicalAdaptiveObservationSchema.parse({
      observationId: `artifact-advance.${sampleIndex + 1}.${conditionIndex + 1}`,
      readoutKey, identities: { [identityKey]: `sample-${sampleIndex + 1}` },
      factors: { [factorKey]: conditionIndex === 0 ? "Control" : "Drug" },
      axes: {}, hierarchy: {},
      values: { [`${readoutKey}_numerator`]: numerator, [`${readoutKey}_denominator`]: 25 },
      missingness: {}, sourceRow: sampleIndex * 2 + conditionIndex + 2,
    })),
  );
  expect(validateCanonicalObservationsForContract(contract, observations),
    "fixture: explicit identities and count components satisfy the contract").toEqual([]);
  const workspace = createAdaptiveWorkspace({ contract, observations, mapping: null, lineage: null, now: firstTime });
  if (workspace.status !== "ready" || !workspace.draft) {
    throw new Error(`FIXTURE_SETUP_FAILED: ${workspace.diagnostics.join(" / ")}`);
  }
  const controlConditionId = workspace.draft.conditions.find(({ label }) => label === "Control")!.id;
  const draft: ExperimentSetDraft = { ...workspace.draft, controlConditionId };
  expect(draft.experiments).toHaveLength(3);
  expect(draft.readouts[0]!.shape).toBe("proportion");
  expect(draft.readouts[0]!.withinExperimentNormalization).toBeUndefined();
  expect(Object.values(workspace.cells)).toHaveLength(6);
  const graph: WorkspaceGraphState = {
    id: "graph.artifact-advance", displayName: "Paired positive fraction", analysisRunId: null,
    selectedReadoutId: draft.readouts[0]!.id,
    selectedConditionIds: draft.conditions.map(({ id }) => id), selectedTimePointIds: [],
    analysisTimePointId: null, analysisMetric: { kind: "selected_timepoint" }, graphType: "paired_dot",
    layers: { raw: false, distribution: false, experiment: true, overall: true,
      violin: false, box: false, errorBar: true, connectingLine: true },
    appearance,
    axes: { xSemantic: "categorical", xTitle: "Treatment", xUnit: "", yTitle: "Positive fraction (%)",
      yRangeMode: "auto", yMin: null, yMax: null, yScale: "linear",
      showCategoryLabels: true, hierarchyOrder: [`factor.${factorKey}`], spacing: 1,
      yTickMode: "auto", yTickInterval: null },
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    analysis: assessedExecution(draft, workspace.cells, firstTime, originalPercentages),
  };
  return { draft, cells: workspace.cells, graphs: [graph] };
}

function reopen(state: ProjectState) {
  const reopened = rehydrateExperimentWorkspace(ProjectStateSchema.parse(JSON.parse(JSON.stringify(state))));
  if (!reopened) throw new Error("FIXTURE_SETUP_FAILED: saved workspace must reopen");
  return reopened;
}

function historyWithTwoExecutions() {
  const fixture = pairedAdaptiveFixture();
  const fixtureJson = JSON.stringify(fixture);
  const first = ProjectStateSchema.parse(createExperimentWorkspaceProject({ ...fixture, now: firstTime }));
  expect(first.rawRevisions, "fixture: first raw revision").toHaveLength(1);
  expect(first.unitInstances, "fixture: biological units, not pooled count rows").toHaveLength(3);
  expect(first.observations).toHaveLength(6);
  expect(first.analysisRuns).toHaveLength(1);
  expect(first.analysisRuns[0]!.request.requestId).toMatch(/\.r1$/u);
  const firstJson = JSON.stringify(first);
  const reopened = reopen(first);
  const second = ProjectStateSchema.parse(createExperimentWorkspaceProject({
    draft: reopened.draft, cells: reopened.cells,
    graphs: [{ ...reopened.graphs[0]!, analysisRunId: null,
      analysis: assessedExecution(reopened.draft, reopened.cells, secondTime, originalPercentages) }],
    existingState: first, now: secondTime,
  }));
  expect(second.rawRevisions, "fixture: another execution does not edit raw data").toEqual(first.rawRevisions);
  expect(second.activeRawRevisionId).toBe(first.activeRawRevisionId);
  expect(second.analysisRuns, "fixture: artifact r2 is already used on raw r1").toHaveLength(2);
  expect(second.analysisRuns[1]!.request.requestId).toMatch(/\.r2$/u);
  for (const key of historyKeys) {
    expect(second[key].slice(0, first[key].length), `fixture: unchanged-raw prior ${key} is exact`).toEqual(first[key]);
  }
  expect(JSON.stringify(first), "fixture: saving a new execution does not mutate the prior project").toBe(firstJson);
  expect(JSON.stringify(fixture)).toBe(fixtureJson);
  return second;
}

function editCanonicalNumerator(state: ProjectState) {
  const reopened = reopen(state);
  const snapshot = reopened.draft.adaptiveInput;
  if (!snapshot) throw new Error("FIXTURE_SETUP_FAILED: adaptive snapshot must survive reopening");
  const readout = snapshot.contract.readouts[0]!;
  const numeratorKey = `${readout.key}_numerator`;
  const observations = snapshot.canonicalObservations.map((row) =>
    row.observationId === "artifact-advance.1.2"
      ? CanonicalAdaptiveObservationSchema.parse({ ...row, values: { ...row.values, [numeratorKey]: 7 } })
      : row);
  expect(observations.filter((row, index) => JSON.stringify(row) !== JSON.stringify(snapshot.canonicalObservations[index])),
    "fixture: edit precisely one canonical numerator").toHaveLength(1);
  expect(validateCanonicalObservationsForContract(snapshot.contract, observations)).toEqual([]);
  const workspace = createAdaptiveWorkspace({
    contract: snapshot.contract, observations, mapping: snapshot.mapping,
    lineage: snapshot.rawLineage, confirmedTargetedConfirmations: snapshot.targetedConfirmations, now: editTime,
  });
  if (workspace.status !== "ready" || !workspace.draft) {
    throw new Error(`FIXTURE_SETUP_FAILED: edited workspace ${workspace.diagnostics.join(" / ")}`);
  }
  // Keep saved design/selection identity while rebuilding cells from the edited canonical payload.
  const draft: ExperimentSetDraft = { ...reopened.draft, adaptiveInput: workspace.snapshot };
  const sample = draft.experiments.find(({ label }) => label === "sample-1")!;
  const drug = draft.conditions.find(({ label }) => label === "Drug")!;
  const changedCellKey = experimentCellKey({
    experimentId: sample.id, conditionId: drug.id, readoutId: draft.readouts[0]!.id,
  });
  expect(workspace.cells[changedCellKey], "fixture: workspace agrees with the actual canonical edit")
    .toMatchObject({ kind: "proportion", positive: 7, eligible: 25 });
  expect(Object.keys(workspace.cells).filter((key) =>
    JSON.stringify(workspace.cells[key]) !== JSON.stringify(reopened.cells[key])),
  "fixture: precisely one workspace count cell changes").toEqual([changedCellKey]);
  const analysis = assessedExecution(draft, workspace.cells, thirdTime, editedPercentages);
  return { draft, cells: workspace.cells, graph: reopened.graphs[0]!, analysis };
}

function expectHistoryAfterRawEdit(previous: ProjectState, next: ProjectState) {
  const staleReason = `Raw data changed from ${previous.activeRawRevisionId} to ${next.activeRawRevisionId}`;
  expect(next.rawRevisions.slice(0, previous.rawRevisions.length)).toEqual(previous.rawRevisions);
  expect(next.rawRevisions).toHaveLength(2);
  expect(next.rawRevisions[1]!.previousRevisionId).toBe(previous.activeRawRevisionId);
  expect(next.designRevisions).toEqual(previous.designRevisions);
  expect(next.activeDesignRevisionId).toBe(previous.activeDesignRevisionId);
  expect(next.unitInstances.slice(0, previous.unitInstances.length), "old canonical unit history stays exact")
    .toEqual(previous.unitInstances);
  expect(next.unitInstances).toHaveLength(6);
  expect(next.observations.slice(0, previous.observations.length)).toEqual(previous.observations);
  expect(next.observations).toHaveLength(12);
  const activeObservations = next.observations.filter(({ rawRevisionId }) => rawRevisionId === next.activeRawRevisionId);
  expect(activeObservations).toHaveLength(6);
  const activeUnitIds = new Set(activeObservations.map(({ unitInstanceId }) => unitInstanceId));
  expect(activeUnitIds.size, "raw r2 still contains three biological units").toBe(3);
  const activeUnits = next.unitInstances.filter(({ id }) => activeUnitIds.has(id));
  expect(activeUnits).toHaveLength(3);
  expect(activeUnits.map(({ id: _id, ...identity }) => identity),
    "new generation IDs preserve level, parent, sample label and semantic/session identity")
    .toEqual(previous.unitInstances.map(({ id: _id, ...identity }) => identity));
  for (const condition of next.experimentWorkspace!.conditions) {
    const conditionUnits = activeObservations.filter(({ conditionId }) => conditionId === condition.id)
      .map(({ unitInstanceId }) => unitInstanceId);
    expect(conditionUnits).toHaveLength(3);
    expect(new Set(conditionUnits)).toEqual(activeUnitIds);
  }
  expect(activeObservations.filter(({ measurement }) => measurement.kind === "proportion" &&
    measurement.numerator === 7 && measurement.denominator === 25)).toHaveLength(1);
  expect(next.analysisRuns.slice(0, previous.analysisRuns.length),
    "prior requests, results, recommendations, IDs and values stay exact; only stale fields change")
    .toEqual(previous.analysisRuns.map((run) => ({ ...run, state: "stale", staleReason })));
  expect(next.graphs.slice(0, previous.graphs.length))
    .toEqual(previous.graphs.map((graph) => ({ ...graph, state: "stale", staleReason })));
  expect(next.provenanceEvents.slice(0, previous.provenanceEvents.length)).toEqual(previous.provenanceEvents);
  expect(next.transformations).toEqual([]);
  expect(next.derivedDatasetRevisions).toEqual([]);
  expect(next.derivedValues).toEqual([]);
  expect(next.experimentWorkspace!.controlConditionId).toBe(previous.experimentWorkspace!.controlConditionId);
  for (const key of ["conditions", "conditionAttributes", "comparisons", "conditionAssignment", "readoutDefinitions", "analysisIntent"] as const) {
    expect(next.experimentWorkspace![key]).toEqual(previous.experimentWorkspace![key]);
  }
}

function expectThirdExecution(previous: ProjectState, next: ProjectState) {
  expect(ProjectStateSchema.safeParse(next).success, "product: result satisfies the official project schema").toBe(true);
  expect(next.analysisRuns).toHaveLength(3);
  expect(next.graphs).toHaveLength(3);
  const run = next.analysisRuns[2]!;
  const oldRequest = previous.analysisRuns[1]!.request;
  expect(run.request.requestId).toMatch(/\.r3$/u);
  expect(run).toMatchObject({
    state: "current", staleReason: null,
    inputRawRevisionId: next.activeRawRevisionId, inputDesignRevisionId: next.activeDesignRevisionId,
    inputDerivedDatasetRevisionId: null,
  });
  const { requestId: _oldRequestId, analysisId: _oldAnalysisId, observations: _oldObservations, ...oldFamily } = oldRequest;
  const { requestId: _newRequestId, analysisId: _newAnalysisId, observations: _newObservations, ...newFamily } = run.request;
  expect(newFamily, "protocol, scientific family, contrast, options and project identity remain exact").toEqual(oldFamily);
  expect(run.recommendation).toEqual(previous.analysisRuns[1]!.recommendation);
  expect(numericValues(run.request)).toEqual(editedPercentages);
  expect(run.result).toEqual(syntheticResult(run.request, thirdTime));
  const coordinates = (request: AnalysisEngineRequest, state: ProjectState) => request.observations.map(
    ({ experimentalUnitId, conditionId }) => {
      const unit = state.unitInstances.find(({ id }) => id === experimentalUnitId);
      if (!unit) throw new Error("PRODUCT_REQUEST_UNIT_MUST_EXIST_IN_CANONICAL_REGISTRY");
      return { conditionId, semanticIdentity: unit.metadata.semanticIdentity,
        label: unit.label, experimentSessionId: unit.metadata.experimentSessionId };
    },
  );
  expect(coordinates(run.request, next), "condition and declared sample/session coordinates survive new raw unit IDs")
    .toEqual(coordinates(oldRequest, previous));
  for (const condition of next.experimentWorkspace!.conditions) {
    expect(run.request.observations.filter(({ conditionId }) => conditionId === condition.id)).toHaveLength(3);
  }
  expect(new Set(run.request.observations.map(({ experimentalUnitId }) => experimentalUnitId)).size).toBe(3);
  const activeUnitIds = new Set(next.observations.filter(({ rawRevisionId }) => rawRevisionId === next.activeRawRevisionId)
    .map(({ unitInstanceId }) => unitInstanceId));
  expect(new Set(run.request.observations.map(({ experimentalUnitId }) => experimentalUnitId)),
    "the new request uses exactly the active raw generation's biological units").toEqual(activeUnitIds);
  expect(run.request.observations.every(({ pairId, experimentalUnitId }) => pairId === experimentalUnitId)).toBe(true);
  for (const key of historyKeys) {
    expect(new Set(next[key].map(({ id }) => id)).size, `product: ${key} IDs must be unique`).toBe(next[key].length);
  }
  expect(new Set(next.analysisRuns.map(({ request }) => request.requestId)).size).toBe(3);
  expect(new Set(next.analysisRuns.map(({ request }) => request.analysisId)).size).toBe(3);
  expect(next.experimentWorkspace!.graphs[0]!.analysisRunId).toBe(run.id);
}

describe("artifact revision advance after executions on unchanged adaptive raw data", () => {
  it("saves a fresh analysis with a true raw edit after artifact r2 was already used on raw r1", () => {
    const previous = historyWithTwoExecutions();
    const previousJson = JSON.stringify(previous);
    const edited = editCanonicalNumerator(previous);
    let next!: ProjectState;
    expect(() => {
      next = createExperimentWorkspaceProject({
        draft: edited.draft, cells: edited.cells,
        graphs: [{ ...edited.graph, analysisRunId: null, analysis: edited.analysis }],
        existingState: previous, now: thirdTime,
      });
    }, "product: raw r2 must not reuse artifact r2 and reject an ordinary save").not.toThrow();
    expectHistoryAfterRawEdit(previous, next);
    expectThirdExecution(previous, next);
    const nextJson = JSON.stringify(next);
    const reopened = reopen(next);
    const noop = createExperimentWorkspaceProject({
      draft: reopened.draft, cells: reopened.cells, graphs: reopened.graphs,
      existingState: next, now: "2026-10-08T04:00:00.000Z",
    });
    expect(ProjectStateSchema.safeParse(noop).success).toBe(true);
    for (const key of historyKeys) {
      expect(noop[key], `product: reopened raw r2 / artifact r3 no-op preserves all ${key}`).toEqual(next[key]);
    }
    expect(noop.activeRawRevisionId).toBe(next.activeRawRevisionId);
    expect(noop.activeDesignRevisionId).toBe(next.activeDesignRevisionId);
    expect(noop.experimentWorkspace!.graphs[0]!.analysisRunId).toBe(next.analysisRuns[2]!.id);
    expect(JSON.stringify(next)).toBe(nextJson);
    expect(JSON.stringify(previous), "product: the previous saved project remains immutable").toBe(previousJson);
  });

  it("saves invalidated raw data first, then appends a fresh execution without another raw revision or artifact collision", () => {
    const previous = historyWithTwoExecutions();
    const previousJson = JSON.stringify(previous);
    const edited = editCanonicalNumerator(previous);
    let rawEdited!: ProjectState;
    expect(() => {
      rawEdited = createExperimentWorkspaceProject({
        draft: edited.draft, cells: edited.cells,
        graphs: [{ ...edited.graph, analysisRunId: null, analysis: null }],
        existingState: previous, now: editTime,
      });
    }, "product: invalidated graph saves the raw edit without an execution").not.toThrow();
    expectHistoryAfterRawEdit(previous, rawEdited);
    expect(rawEdited.analysisRuns).toHaveLength(2);
    expect(rawEdited.graphs).toHaveLength(2);
    expect(rawEdited.experimentWorkspace!.graphs[0]!.analysisRunId).toBeNull();
    const rawEditedJson = JSON.stringify(rawEdited);
    const reopened = reopen(rawEdited);
    expect(reopened.graphs[0]!.analysis).toBeNull();
    const analysis = assessedExecution(reopened.draft, reopened.cells, thirdTime, editedPercentages);
    let next!: ProjectState;
    expect(() => {
      next = createExperimentWorkspaceProject({
        draft: reopened.draft, cells: reopened.cells,
        graphs: [{ ...reopened.graphs[0]!, analysisRunId: null, analysis }],
        existingState: rawEdited, now: thirdTime,
      });
    }, "product: execution over saved raw r2 advances beyond existing artifact r2").not.toThrow();
    expect(next.rawRevisions).toEqual(rawEdited.rawRevisions);
    expect(next.activeRawRevisionId).toBe(rawEdited.activeRawRevisionId);
    for (const key of historyKeys) {
      expect(next[key].slice(0, rawEdited[key].length), `product: prior raw-edit ${key} stays exact`).toEqual(rawEdited[key]);
    }
    expectHistoryAfterRawEdit(previous, next);
    expectThirdExecution(previous, next);
    expect(JSON.stringify(previous)).toBe(previousJson);
    expect(JSON.stringify(rawEdited)).toBe(rawEditedJson);
  });
});
