import {
  AnalysisEngineRequestSchema, AnalysisEngineResultSchema, requireAnalysisRequestRecommendation,
  type AnalysisEngineRequest,
} from "@lsaa/analysis-contracts";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { describe, expect, it } from "vitest";

import { experimentCellKey, type ExperimentSetDraft } from "./experimentDraft";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import {
  createExperimentWorkspaceProject, rehydrateExperimentWorkspace, type WorkspaceGraphState,
} from "./experimentWorkspaceProject";
import { buildExistingDataWorkspace, parseExistingDataText } from "./existingDataImport";

const now = "2026-10-08T00:00:00.000Z";
const groups = [
  { sample: "S1", condition: "Control", values: [1, 3], mean: 2 },
  { sample: "S1", condition: "Drug", values: [4, 6, 8], mean: 6 },
  { sample: "S2", condition: "Control", values: [2, 6], mean: 4 },
  { sample: "S2", condition: "Drug", values: [8, 12, 16], mean: 12 },
  { sample: "S3", condition: "Control", values: [5], mean: 5 },
  { sample: "S3", condition: "Drug", values: [15, 20, 25], mean: 20 },
];
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
  return request.observations.map(({ value }) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("FIXTURE_REQUIRES_FINITE_UNIT_MEANS");
    }
    return value;
  }).sort((first, second) => first - second);
}

function importedFixture(withTime: boolean) {
  const sourceRows = (withTime ? [0, 24] : [null]).flatMap((time) => groups.flatMap((group) =>
    group.values.map((value) => [
      "Run-1", group.sample, group.condition, ...(time === null ? [] : [String(time)]),
      String(value + (time === 0 ? 100 : 0)),
    ]),
  ));
  const headers = ["Session", "Unit", "Condition", ...(withTime ? ["Time"] : []), "Mean"];
  const parsed = parseExistingDataText([headers, ...sourceRows].map((row) => row.join("\t")).join("\n"));
  expect(parsed.headers, "fixture: the real TSV parser preserves headers").toEqual(headers);
  expect(parsed.rows, "fixture: the real TSV parser preserves every anonymous source row").toEqual(sourceRows);
  const mapping = {
    experimentColumn: 0, sessionColumn: 0, unitColumn: 1, conditionColumn: 2,
    timeColumn: withTime ? 3 : null, valueColumn: withTime ? 4 : 3,
    timeSampling: withTime ? "longitudinal" as const : "none" as const,
    readoutLabel: "Signal", readoutUnit: "a.u.", duplicateHandling: "nested_observations" as const,
    sourceLabel: "anonymous-source-backed-fixture", importedAt: now,
  };
  const imported = buildExistingDataWorkspace(parsed, mapping);
  const controlConditionId = imported.draft.conditions.find(({ label }) => label === "Control")!.id;
  const draft: ExperimentSetDraft = { ...imported.draft, dataOrigin: "synthetic_demo", controlConditionId };
  expect(draft.adaptiveInput).toBeUndefined();
  expect(draft.experiments).toHaveLength(3);
  expect(draft.conditionAssignment.kind).toBe("matched");
  expect(new Set(draft.experiments.map(({ stableUnitId }) => stableUnitId)).size).toBe(3);
  expect(draft.importProvenance).toMatchObject({
    duplicateDecision: "nested_observations", sourceRows, excludedRowNumbers: [],
    mapping: { sessionColumn: 0, unitColumn: 1, conditionColumn: 2,
      timeColumn: mapping.timeColumn, valueColumn: mapping.valueColumn },
  });
  expect(Object.keys(imported.cells)).toHaveLength(withTime ? 12 : 6);
  const sourceLocations = Object.values(imported.cells).flatMap((cell) => {
    if (cell.kind !== "nested_continuous" || !cell.rawValues.every(Number.isFinite) ||
      cell.rawValues.length === 0 || cell.sourceLocations?.length !== cell.rawValues.length) {
      throw new Error("FIXTURE_SETUP_FAILED: every imported raw value requires its position-matched source location");
    }
    expect(cell.source).toBe("paste");
    return cell.sourceLocations;
  });
  expect(sourceLocations).toHaveLength(withTime ? 28 : 14);
  expect(new Set(sourceLocations).size).toBe(withTime ? 28 : 14);
  const analysisTimePointId = withTime ? draft.time.points.find(({ value }) => value === 24)!.id : null;
  const assessment = assessDraftGraphAnalysis({
    draft, cells: imported.cells, readoutId: draft.readouts[0]!.id,
    conditionIds: draft.conditions.map(({ id }) => id),
    ...(analysisTimePointId ? { timePointId: analysisTimePointId } : {}),
  });
  if (assessment.state !== "ready" || !assessment.request) {
    throw new Error("FIXTURE_SETUP_FAILED: actual imported matched-unit assessment must be ready");
  }
  expect(assessment.nByCondition.map(({ n }) => n), "fixture: raw rows are subsamples, not biological n").toEqual([3, 3]);
  const request = AnalysisEngineRequestSchema.parse(assessment.request);
  expect(request).toMatchObject({ protocolVersion: "0.1.0", templateId: "D02", method: "paired_t",
    contrastConditionIds: draft.conditions.map(({ id }) => id),
    options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null } });
  expect(request.observations).toHaveLength(6);
  expect(numericValues(request)).toEqual([2, 4, 5, 6, 12, 20]);
  const pairs = [...new Set(request.observations.map(({ pairId }) => pairId))];
  expect(pairs).toHaveLength(3);
  const differences = pairs.map((pairId) => {
    const paired = request.observations.filter((observation) => observation.pairId === pairId);
    expect(paired).toHaveLength(2);
    const control = paired.find(({ conditionId }) => conditionId === controlConditionId)!.value;
    const drug = paired.find(({ conditionId }) => conditionId !== controlConditionId)!.value;
    if (typeof control !== "number" || typeof drug !== "number") throw new Error("FIXTURE_REQUIRES_TWO_NUMERIC_PAIRED_MEANS");
    return drug - control;
  }).sort((first, second) => first - second);
  expect(differences, "fixture: the nonzero, nonconstant paired differences avoid a diagnostic correction").toEqual([4, 8, 15]);
  const result = AnalysisEngineResultSchema.parse({
    protocolVersion: request.protocolVersion, requestId: request.requestId,
    status: "ok", engine: { name: "synthetic-source-backed-fixture", version: "1", packages: {} },
    estimates: [], tests: [], diagnostics: [], warnings: [], completedAt: now,
  });
  const graph: WorkspaceGraphState = {
    id: withTime ? "graph.source-backed-time" : "graph.source-backed-no-time",
    displayName: "Source-backed matched means", analysisRunId: null,
    selectedReadoutId: draft.readouts[0]!.id, sourceMode: "raw_readout",
    selectedConditionIds: draft.conditions.map(({ id }) => id),
    selectedTimePointIds: draft.time.points.map(({ id }) => id), analysisTimePointId,
    analysisMetric: { kind: "selected_timepoint" }, graphType: withTime ? "line" : "paired_dot",
    layers: { raw: false, distribution: false, experiment: true, overall: true,
      violin: false, box: false, errorBar: true, connectingLine: true },
    appearance,
    axes: { xSemantic: withTime ? "time" : "categorical", xTitle: withTime ? "Time" : "Treatment",
      xUnit: withTime ? "h" : "", yTitle: "Signal (a.u.)", yRangeMode: "auto", yMin: null, yMax: null,
      yScale: "linear", showCategoryLabels: true, hierarchyOrder: draft.attributes.map(({ id }) => id),
      spacing: 1, yTickMode: "auto", yTickInterval: null },
    statisticsAnnotation: { mode: "hidden", testIndex: 0 }, analysis: { request, result },
  };
  const identity = { projectId: withTime ? "project.source-backed-time" : "project.source-backed-no-time", createdAt: now };
  return { draft, cells: imported.cells, graph, request, result, identity, withTime, sourceRows };
}

function expectRawFixture(state: ProjectState, fixture: ReturnType<typeof importedFixture>) {
  expect(state.rawRevisions, "fixture: canonical raw-only reference is formally valid").toHaveLength(1);
  expect(state.observations).toHaveLength(fixture.withTime ? 28 : 14);
  const parents = state.unitInstances.filter(({ levelId }) => levelId === "unit-level.experimental-unit");
  const children = state.unitInstances.filter(({ levelId }) => levelId === "unit-level.observation");
  expect(parents).toHaveLength(3);
  expect(children).toHaveLength(fixture.withTime ? 28 : 14);
  expect(new Set(children.map(({ parentUnitId }) => parentUnitId))).toEqual(new Set(parents.map(({ id }) => id)));
  const expected = fixture.draft.experiments.flatMap((experiment) => fixture.draft.conditions.flatMap((condition) =>
    (fixture.withTime ? fixture.draft.time.points : [null]).flatMap((point) => {
      const key = experimentCellKey({ experimentId: experiment.id, conditionId: condition.id,
        readoutId: fixture.draft.readouts[0]!.id, ...(point ? { timePointId: point.id } : {}) });
      const cell = fixture.cells[key];
      if (cell?.kind !== "nested_continuous") throw new Error("FIXTURE_REQUIRES_NESTED_CELL_FOR_EVERY_COORDINATE");
      return cell.rawValues.map((value, index) => ({ conditionId: condition.id,
        measurement: { kind: "scalar", value }, time: point?.value ?? null,
        sourceLocation: `workspace:${key}#source=${encodeURIComponent(cell.sourceLocations![index]!)}` }));
    }),
  ));
  expect(state.observations.map(({ conditionId, measurement, time, sourceLocation }) =>
    ({ conditionId, measurement, time: time ?? null, sourceLocation })),
  "fixture: canonical values, source row positions and declared time/condition coordinates are exact").toEqual(expected);
  expect(state.experimentWorkspace!.importProvenance).toEqual(fixture.draft.importProvenance);
  expect(state.experimentWorkspace!.importProvenance!.sourceRows).toEqual(fixture.sourceRows);
  expect(state.observations.every(({ sourceLocation }) => sourceLocation!.includes("#source="))).toBe(true);
  expect(state.analysisRuns).toEqual([]);
  expect(state.graphs).toEqual([]);
}

function expectSavedSourceBackedAnalysis(fixture: ReturnType<typeof importedFixture>) {
  const fixtureJson = JSON.stringify(fixture);
  const rawOnly = ProjectStateSchema.parse(createExperimentWorkspaceProject({
    draft: fixture.draft, cells: fixture.cells, graphs: [], now, newProjectIdentity: fixture.identity,
  }));
  expectRawFixture(rawOnly, fixture);
  const rawOnlyJson = JSON.stringify(rawOnly);
  const saved = ProjectStateSchema.parse(createExperimentWorkspaceProject({
    draft: fixture.draft, cells: fixture.cells, graphs: [fixture.graph], now, newProjectIdentity: fixture.identity,
  }));
  expect(saved.analysisRuns, "product: a valid completed analysis over source-backed raw rows must be persisted once")
    .toHaveLength(1);
  const run = saved.analysisRuns[0]!;
  expect(run).toMatchObject({ state: "current", staleReason: null,
    inputRawRevisionId: saved.activeRawRevisionId, inputDesignRevisionId: saved.activeDesignRevisionId });
  expect(saved.experimentWorkspace!.graphs[0]!.analysisRunId).toBe(run.id);
  for (const key of ["rawRevisions", "designRevisions", "unitInstances", "observations"] as const) {
    expect(saved[key], `product: ${key} retain the full source-backed raw-only reference, including existing metadata`).toEqual(rawOnly[key]);
  }
  expect(saved.provenanceEvents.slice(0, rawOnly.provenanceEvents.length)).toEqual(rawOnly.provenanceEvents);
  expect(saved.experimentWorkspace!.importProvenance).toEqual(rawOnly.experimentWorkspace!.importProvenance);
  expect(saved.experimentWorkspace!.controlConditionId).toBe(fixture.draft.controlConditionId);
  expect(saved.transformations).toHaveLength(1);
  expect(saved.derivedDatasetRevisions).toHaveLength(1);
  expect(saved.derivedValues).toHaveLength(6);
  const revision = saved.derivedDatasetRevisions[0]!;
  const transformation = saved.transformations[0]!;
  expect(revision).toMatchObject({ sourceRawRevisionId: saved.activeRawRevisionId,
    transformationId: transformation.id, state: "current", staleReason: null });
  expect(transformation).toMatchObject({ method: "replicate_summary", inputRevisionIds: [saved.activeRawRevisionId],
    parameters: { center: "mean" } });
  expect(run.inputDerivedDatasetRevisionId).toBe(revision.id);
  expect(saved.graphs).toHaveLength(1);
  expect(saved.graphs[0]!.spec.dataSource).toEqual({ kind: "derived_dataset", id: revision.id, revision: "0.1.0" });
  const unitsById = new Map(saved.unitInstances.map((unit) => [unit.id, unit]));
  const parents = saved.unitInstances.filter(({ levelId }) => levelId === "unit-level.experimental-unit");
  const parentLabels = new Map(parents.map((unit) => [unit.id,
    fixture.draft.experiments.find(({ id }) => id === unit.metadata.experimentSessionId)!.label]));
  const conditionLabels = new Map(fixture.draft.conditions.map(({ id, label }) => [id, label]));
  const selectedRaw = saved.observations.filter(({ time }) => !fixture.withTime || time === 24);
  expect(selectedRaw).toHaveLength(14);
  for (const value of saved.derivedValues) {
    const facts = groups.find((group) => group.sample === parentLabels.get(value.experimentalUnitId) &&
      group.condition === conditionLabels.get(value.conditionId));
    if (!facts) throw new Error("PRODUCT_MEAN_MUST_RESOLVE_TO_A_DECLARED_SAMPLE_AND_CONDITION");
    const sources = selectedRaw.filter((observation) => observation.conditionId === value.conditionId &&
      unitsById.get(observation.unitInstanceId)!.parentUnitId === value.experimentalUnitId)
      .sort((first, second) => first.id.localeCompare(second.id));
    expect(value).toMatchObject({ derivedDatasetRevisionId: revision.id, outcomeId: fixture.draft.readouts[0]!.id,
      value: facts.mean, subsampleCount: facts.values.length });
    expect(value.sourceObservationIds, "product: each mean retains its complete selected raw observation lineage")
      .toEqual(sources.map(({ id }) => id));
    expect(value.sourceUnitIds).toEqual(sources.map(({ unitInstanceId }) => unitInstanceId));
    expect(sources.map(({ measurement }) => {
      if (measurement.kind !== "scalar") throw new Error("PRODUCT_LINEAGE_REQUIRES_SCALAR_RAW_MEASUREMENTS");
      return measurement.value;
    }).sort((first, second) => first - second)).toEqual([...facts.values].sort((first, second) => first - second));
  }
  expect(saved.derivedValues.reduce((total, value) => total + value.subsampleCount, 0)).toBe(14);
  expect(new Set(saved.derivedValues.flatMap(({ sourceObservationIds }) => sourceObservationIds)))
    .toEqual(new Set(selectedRaw.map(({ id }) => id)));
  const { requestId: _originalRequestId, projectId: _originalProjectId, analysisId: _originalAnalysisId,
    observations: _originalObservations, ...originalFamily } = fixture.request;
  const { requestId: _savedRequestId, projectId: _savedProjectId, analysisId: _savedAnalysisId,
    observations: _savedObservations, ...savedFamily } = run.request;
  expect(savedFamily, "protocol, method, contrast, family and options stay exact through canonical rebinding").toEqual(originalFamily);
  expect(run.request.projectId).toBe(saved.metadata.projectId);
  expect(run.request.requestId).not.toBe(fixture.request.requestId);
  expect(run.result, "only result.requestId is rebound to the canonical request")
    .toEqual({ ...fixture.result, requestId: run.request.requestId });
  const design = rawOnly.designRevisions.find(({ id }) => id === rawOnly.activeDesignRevisionId)!.design;
  expect(run.recommendation).toEqual(requireAnalysisRequestRecommendation(design, fixture.request, {
    outcomeId: fixture.draft.readouts[0]!.id,
  }));
  expect(run.request.observations).toHaveLength(6);
  expect(numericValues(run.request)).toEqual([2, 4, 5, 6, 12, 20]);
  expect(new Set(run.request.observations.map(({ experimentalUnitId }) => experimentalUnitId)))
    .toEqual(new Set(parents.map(({ id }) => id)));
  expect(run.request.observations.every(({ pairId, experimentalUnitId }) => pairId === experimentalUnitId)).toBe(true);
  expect(new Set(run.request.observations.map(({ pairId }) => pairId)).size).toBe(3);
  const valuesById = new Map(saved.derivedValues.map((value) => [value.id, value]));
  for (const observation of run.request.observations) {
    const value = valuesById.get(observation.observationId)!;
    expect(value).toMatchObject({ experimentalUnitId: observation.experimentalUnitId,
      conditionId: observation.conditionId, value: observation.value });
    const parent = unitsById.get(observation.experimentalUnitId)!;
    const original = fixture.request.observations.find((candidate) =>
      candidate.conditionId === observation.conditionId && candidate.experimentalUnitId === parent.metadata.stableUnitId);
    expect(original, "canonical IDs map to the original declared sample and the same scientific value")
      .toMatchObject({ conditionId: observation.conditionId, value: observation.value });
  }
  for (const condition of fixture.draft.conditions) {
    expect(run.request.observations.filter(({ conditionId }) => conditionId === condition.id)).toHaveLength(3);
  }
  const savedJson = JSON.stringify(saved);
  const reopened = rehydrateExperimentWorkspace(ProjectStateSchema.parse(JSON.parse(savedJson)));
  if (!reopened) throw new Error("PRODUCT_SAVED_SOURCE_BACKED_WORKSPACE_MUST_REOPEN");
  expect(reopened.cells).toStrictEqual(fixture.cells);
  expect(reopened.graphs[0]!.analysis).toMatchObject({ request: run.request, result: run.result, recommendation: run.recommendation });
  expect(reopened.graphs[0]!.selectedTimePointIds).toEqual(fixture.graph.selectedTimePointIds);
  expect(reopened.graphs[0]!.analysisTimePointId).toBe(fixture.graph.analysisTimePointId);
  const noop = ProjectStateSchema.parse(createExperimentWorkspaceProject({
    draft: reopened.draft, cells: reopened.cells, graphs: reopened.graphs, existingState: saved,
    now: "2026-10-08T01:00:00.000Z",
  }));
  for (const key of historyKeys) {
    expect(noop[key], `product: reopened source-backed no-op preserves all ${key}`).toEqual(saved[key]);
  }
  expect(noop.activeRawRevisionId).toBe(saved.activeRawRevisionId);
  expect(noop.activeDesignRevisionId).toBe(saved.activeDesignRevisionId);
  expect(noop.experimentWorkspace!.graphs[0]!.analysisRunId).toBe(run.id);
  expect(JSON.stringify(saved)).toBe(savedJson);
  expect(JSON.stringify(rawOnly)).toBe(rawOnlyJson);
  expect(JSON.stringify(fixture)).toBe(fixtureJson);
}

describe("canonical analysis persistence over formally imported source-backed nested raw observations", () => {
  it("persists the completed no-time paired analysis with all fourteen raw sources and six biological means", () => {
    expectSavedSourceBackedAnalysis(importedFixture(false));
  });

  it("persists all twenty-eight raw sources while restricting selected-time means and lineage to the fourteen t24 observations", () => {
    expectSavedSourceBackedAnalysis(importedFixture(true));
  });
});
