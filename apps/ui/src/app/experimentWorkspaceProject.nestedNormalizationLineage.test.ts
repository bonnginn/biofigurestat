import { buildStructureContract, validateCanonicalObservationsForContract } from "@lsaa/adaptive-input";
import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { CanonicalAdaptiveObservationSchema, type DerivedScalarValue } from "@lsaa/domain";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { describe, expect, it } from "vitest";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import type { ExperimentSetDraft } from "./experimentDraft";
import { assessDraftGraphAnalysis } from "./experimentDraftAnalysis";
import {
  createExperimentWorkspaceProject,
  rehydrateExperimentWorkspace,
  type WorkspaceGraphState,
} from "./experimentWorkspaceProject";

const now = "2026-10-08T00:00:00.000Z";
const normalizedValues = [1, 1, 1, 3, 3, 4];
const rawGroups = [
  { sample: "S1", condition: "Control", values: [1, 3], mean: 2 },
  { sample: "S1", condition: "Drug", values: [4, 6, 8], mean: 6 },
  { sample: "S2", condition: "Control", values: [2, 6], mean: 4 },
  { sample: "S2", condition: "Drug", values: [8, 12, 16], mean: 12 },
  { sample: "S3", condition: "Control", values: [5], mean: 5 },
  { sample: "S3", condition: "Drug", values: [15, 20, 25], mean: 20 },
];
const historyKeys = [
  "analysisRuns", "graphs", "transformations", "derivedDatasetRevisions", "derivedValues",
  "rawRevisions", "designRevisions", "unitInstances", "observations", "provenanceEvents",
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

function syntheticResult(request: AnalysisEngineRequest, completedAt: string): AnalysisEngineResult {
  // No engine or statistical calculation is invoked by this persistence test.
  return {
    protocolVersion: request.protocolVersion, requestId: request.requestId,
    status: "ok", engine: { name: "synthetic-nested-lineage-fixture", version: "1", packages: {} },
    estimates: [], tests: [], diagnostics: [], warnings: [], completedAt,
  };
}

function numericValues(request: AnalysisEngineRequest) {
  return request.observations.map((observation) => {
    if (typeof observation.value !== "number" || !Number.isFinite(observation.value)) {
      throw new Error("NESTED_FIXTURE_REQUIRES_FINITE_SCALAR_OBSERVATIONS");
    }
    return observation.value;
  }).sort((first, second) => first - second);
}

function fixture() {
  const contract = buildStructureContract({
    experimentName: "Anonymous nested normalization",
    experimentDescription: "Three declared samples were measured under both conditions; ROIs are subsamples.",
    experimentalUnitLabel: "Sample", identityLabel: "Sample ID",
    readoutLabel: "Signal", readoutRepresentation: "scalar",
    factorName: "Treatment", factorLevels: ["Control", "Drug"],
    sameIdentityAcrossConditions: true, nestedObservationLabel: "ROI",
  });
  const sampleIdentity = contract.identities.find(({ unitLevelKey }) =>
    unitLevelKey === contract.experimentalUnitLevelKey)!.key;
  const roiLevel = contract.readouts[0]!.observationLevelKey;
  const roiIdentity = contract.identities.find(({ unitLevelKey }) => unitLevelKey === roiLevel)!.key;
  const observations = rawGroups.flatMap((group, groupIndex) => group.values.map((value, roiIndex) => {
    // Condition-specific ROI identities never declare the same child across conditions.
    const roi = `${group.sample}-${group.condition}-ROI-${roiIndex + 1}`;
    return CanonicalAdaptiveObservationSchema.parse({
      observationId: `nested-normalization.${groupIndex + 1}.${roiIndex + 1}`,
      readoutKey: contract.readouts[0]!.key,
      identities: { [sampleIdentity]: group.sample, [roiIdentity]: roi },
      factors: { treatment: group.condition }, axes: {}, hierarchy: { [roiLevel]: roi },
      values: { signal: value }, missingness: {}, sourceRow: groupIndex * 3 + roiIndex + 2,
    });
  }));
  expect(observations, "fixture: fourteen explicitly identified ROI measurements").toHaveLength(14);
  expect(new Set(observations.map((row) => row.identities[roiIdentity])).size,
    "fixture: every ROI identity is distinct").toBe(14);
  expect(validateCanonicalObservationsForContract(contract, observations),
    "fixture: the nested observations must satisfy the declared contract").toEqual([]);
  const workspace = createAdaptiveWorkspace({ contract, observations, mapping: null, lineage: null, now });
  if (workspace.status !== "ready" || !workspace.draft) {
    throw new Error(`FIXTURE_SETUP_FAILED: ${workspace.diagnostics.join(" / ")}`);
  }
  const controlConditionId = workspace.draft.conditions.find(({ label }) => label === "Control")!.id;
  const draft: ExperimentSetDraft = {
    ...workspace.draft, controlConditionId,
    readouts: workspace.draft.readouts.map((readout) => ({
      ...readout, withinExperimentNormalization: { method: "control_equals_one", baselineConditionId: controlConditionId },
    })),
  };
  expect(draft.experiments, "fixture: ROI count must not become biological n").toHaveLength(3);
  expect(draft.readouts[0]!.shape).toBe("nested_continuous");
  const assessment = assessDraftGraphAnalysis({
    draft, cells: workspace.cells, readoutId: draft.readouts[0]!.id,
    conditionIds: draft.conditions.map(({ id }) => id),
  });
  if (assessment.state !== "ready" || !assessment.request) {
    throw new Error("FIXTURE_SETUP_FAILED: normalized paired analysis must be executable");
  }
  expect(assessment.nByCondition.map(({ n }) => n), "fixture: declared biological n per condition").toEqual([3, 3]);
  expect(assessment.request).toMatchObject({ protocolVersion: "0.1.0", templateId: "D02", method: "paired_t" });
  expect(numericValues(assessment.request),
    "fixture: request already contains per-sample control-normalized means").toEqual(normalizedValues);
  const graph: WorkspaceGraphState = {
    id: "graph.nested-normalization", displayName: "Nested normalized signal", analysisRunId: null,
    selectedReadoutId: draft.readouts[0]!.id,
    selectedConditionIds: draft.conditions.map(({ id }) => id), selectedTimePointIds: [],
    analysisTimePointId: null, analysisMetric: { kind: "selected_timepoint" }, graphType: "paired_dot",
    layers: { raw: false, distribution: false, experiment: true, overall: true,
      violin: false, box: false, errorBar: true, connectingLine: true },
    appearance,
    axes: { xSemantic: "categorical", xTitle: "Treatment", xUnit: "", yTitle: "Signal / Control mean",
      yRangeMode: "auto", yMin: null, yMax: null, yScale: "linear",
      showCategoryLabels: true, hierarchyOrder: ["factor.treatment"], spacing: 1,
      yTickMode: "auto", yTickInterval: null },
    statisticsAnnotation: { mode: "hidden", testIndex: 0 },
    analysis: { request: assessment.request, result: syntheticResult(assessment.request, now) },
  };
  return { draft, cells: workspace.cells, graph, controlConditionId };
}

function expectPairedUnits(state: ProjectState, runIndex: number, controlConditionId: string) {
  const request = state.analysisRuns[runIndex]!.request;
  const biologicalUnits = state.unitInstances.filter(({ levelId }) => levelId === "unit-level.sample");
  const rois = state.unitInstances.filter(({ levelId }) => levelId === "unit-level.roi");
  expect(biologicalUnits).toHaveLength(3);
  expect(rois).toHaveLength(14);
  expect(new Set(rois.map(({ id }) => id)).size).toBe(14);
  expect(new Set(rois.map(({ parentUnitId }) => parentUnitId))).toEqual(new Set(biologicalUnits.map(({ id }) => id)));
  expect(request).toMatchObject({ protocolVersion: "0.1.0", templateId: "D02", method: "paired_t" });
  expect(request.observations).toHaveLength(6);
  expect(new Set(request.observations.map(({ experimentalUnitId }) => experimentalUnitId)))
    .toEqual(new Set(biologicalUnits.map(({ id }) => id)));
  expect(request.observations.every(({ pairId, experimentalUnitId }) => pairId === experimentalUnitId)).toBe(true);
  for (const condition of state.experimentWorkspace!.conditions) {
    expect(request.observations.filter(({ conditionId }) => conditionId === condition.id)).toHaveLength(3);
  }
  expect(numericValues(request)).toEqual(normalizedValues);
  expect(state.experimentWorkspace!.controlConditionId).toBe(controlConditionId);
}

function expectExactRawLineage(state: ProjectState, means: DerivedScalarValue[], normalized: DerivedScalarValue[]) {
  const units = new Map(state.unitInstances.map((unit) => [unit.id, unit]));
  const conditions = new Map(state.experimentWorkspace!.conditions.map((condition) => [condition.id, condition.label]));
  const meansByCoordinate = new Map(means.map((value) => [`${value.experimentalUnitId}\u0000${value.conditionId}`, value]));
  const rawIds = new Set(state.observations.map(({ id }) => id));
  expect(means).toHaveLength(6);
  expect(normalized).toHaveLength(6);
  expect(means.reduce((sum, value) => sum + value.subsampleCount, 0)).toBe(14);
  expect(normalized.reduce((sum, value) => sum + value.subsampleCount, 0)).toBe(14);
  for (const value of normalized) {
    const mean = meansByCoordinate.get(`${value.experimentalUnitId}\u0000${value.conditionId}`)!;
    const sample = units.get(value.experimentalUnitId)!.label;
    const condition = conditions.get(value.conditionId)!;
    const facts = rawGroups.find((group) => group.sample === sample && group.condition === condition)!;
    const raw = state.observations.filter((observation) =>
      observation.conditionId === value.conditionId &&
      units.get(observation.unitInstanceId)!.parentUnitId === value.experimentalUnitId)
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(mean.value, `${sample}/${condition}: unnormalized ROI mean`).toBe(facts.mean);
    expect(mean.sourceObservationIds).toEqual(raw.map(({ id }) => id));
    expect(mean.sourceUnitIds).toEqual(raw.map(({ unitInstanceId }) => unitInstanceId));
    expect(mean.subsampleCount).toBe(facts.values.length);
    expect(value.sourceObservationIds, "normalization retains the preceding mean's exact raw observation sources")
      .toEqual(mean.sourceObservationIds);
    expect(value.sourceUnitIds, "normalization retains the preceding mean's exact ROI sources").toEqual(mean.sourceUnitIds);
    expect(value.subsampleCount, "normalization must not union denominator ROIs into this value's count").toBe(mean.subsampleCount);
    expect(value.sourceObservationIds.every((id) => rawIds.has(id))).toBe(true);
    const control = means.find((candidate) => candidate.experimentalUnitId === value.experimentalUnitId &&
      conditions.get(candidate.conditionId) === "Control")!;
    expect(value.value).toBe(mean.value / control.value);
  }
}

describe("nested mean followed by within-experiment normalization persistence", () => {
  it("saves fourteen raw ROIs, retains exact mean lineage through normalization, and preserves history across no-op and new execution", () => {
    const input = fixture();
    const fixtureJson = JSON.stringify(input);
    let first!: ProjectState;
    expect(() => {
      first = createExperimentWorkspaceProject({ draft: input.draft, cells: input.cells, graphs: [input.graph], now });
    }, "product: a valid nested mean → control=1 chain must save under the existing raw-only lineage schema").not.toThrow();
    expect(ProjectStateSchema.safeParse(first).success, "product: saved state must satisfy the official schema").toBe(true);
    expect(first.observations).toHaveLength(14);
    expect(first.rawRevisions).toHaveLength(1);
    expect(first.analysisRuns).toHaveLength(1);
    expect(first.transformations).toHaveLength(2);
    expect(first.derivedDatasetRevisions).toHaveLength(2);
    expect(first.derivedValues).toHaveLength(12);
    const meanTransformation = first.transformations.find(({ method }) => method === "replicate_summary")!;
    const normalization = first.transformations.find(({ method }) => method === "control_equals_one")!;
    const meanRevision = first.derivedDatasetRevisions.find(({ transformationId }) => transformationId === meanTransformation.id)!;
    const normalizedRevision = first.derivedDatasetRevisions.find(({ transformationId }) => transformationId === normalization.id)!;
    const means = first.derivedValues.filter(({ derivedDatasetRevisionId }) => derivedDatasetRevisionId === meanRevision.id);
    const normalized = first.derivedValues.filter(({ derivedDatasetRevisionId }) => derivedDatasetRevisionId === normalizedRevision.id);
    expect(meanTransformation.parameters).toMatchObject({ center: "mean" });
    expect(normalization.parameters).toMatchObject({ scope: "within_experiment", method: "control_equals_one",
      baselineConditionId: input.controlConditionId });
    expect(meanTransformation.inputRevisionIds).toEqual([first.activeRawRevisionId]);
    expect(normalization.inputRevisionIds, "the unchanged schema requires raw revision inputs").toEqual([first.activeRawRevisionId]);
    expect(normalization.version).toBe("0.2.0");
    expect(normalization.parameters).toMatchObject({
      inputDerivedDatasetRevisionId: meanRevision.id,
      inputTransformationId: meanTransformation.id,
      sourceRawRevisionId: first.activeRawRevisionId,
      outcomeId: normalizedRevision.outcomeId,
    });
    const dependencies = normalization.parameters.valueDependencies as Array<{
      normalizedValueId: string; numeratorDerivedValueId: string; denominatorDerivedValueId: string;
      experimentSessionId: string; baselineConditionId: string;
    }>;
    expect(dependencies).toHaveLength(6);
    const unitsById = new Map(first.unitInstances.map((unit) => [unit.id, unit]));
    for (const value of normalized) {
      const numerator = means.find((mean) => mean.experimentalUnitId === value.experimentalUnitId &&
        mean.conditionId === value.conditionId)!;
      const denominator = means.find((mean) => mean.experimentalUnitId === value.experimentalUnitId &&
        mean.conditionId === input.controlConditionId)!;
      const unit = unitsById.get(value.experimentalUnitId)!;
      const explicitSession = typeof unit.metadata.experimentSessionId === "string"
        ? unit.metadata.experimentSessionId : value.experimentalUnitId;
      expect(dependencies.filter(({ normalizedValueId }) => normalizedValueId === value.id)).toEqual([{
        normalizedValueId: value.id, numeratorDerivedValueId: numerator.id,
        denominatorDerivedValueId: denominator.id, experimentSessionId: explicitSession,
        baselineConditionId: input.controlConditionId,
      }]);
    }
    expect(first.analysisRuns[0]!.inputDerivedDatasetRevisionId).toBe(normalizedRevision.id);
    expectPairedUnits(first, 0, input.controlConditionId);
    expectExactRawLineage(first, means, normalized);

    const firstJson = JSON.stringify(first);
    const reopened = rehydrateExperimentWorkspace(first);
    if (!reopened) throw new Error("PRODUCT_REHYDRATION_FAILED: saved nested normalization must reopen");
    expect(reopened.draft.readouts[0]!.withinExperimentNormalization)
      .toEqual(input.draft.readouts[0]!.withinExperimentNormalization);
    const noop = createExperimentWorkspaceProject({ ...reopened, existingState: first, now: "2026-10-08T00:01:00.000Z" });
    for (const key of historyKeys) expect(noop[key], `unedited reopen/save retains ${key} exactly`).toEqual(first[key]);
    expect(noop.activeRawRevisionId).toBe(first.activeRawRevisionId);
    expect(noop.activeDesignRevisionId).toBe(first.activeDesignRevisionId);
    expect(noop.experimentWorkspace!.graphs).toEqual(first.experimentWorkspace!.graphs);

    const assessment = assessDraftGraphAnalysis({
      draft: reopened.draft, cells: reopened.cells, readoutId: reopened.draft.readouts[0]!.id,
      conditionIds: reopened.draft.conditions.map(({ id }) => id),
    });
    if (!assessment.request) throw new Error("PRODUCT_REHYDRATION_FAILED: reopened normalized request is missing");
    expect(numericValues(assessment.request)).toEqual(normalizedValues);
    const graph: WorkspaceGraphState = { ...reopened.graphs[0]!, analysisRunId: null,
      analysis: { request: assessment.request, result: syntheticResult(assessment.request, "2026-10-08T00:02:00.000Z") } };
    const next = createExperimentWorkspaceProject({ ...reopened, graphs: [graph], existingState: noop,
      now: "2026-10-08T00:02:00.000Z" });
    expect(ProjectStateSchema.safeParse(next).success).toBe(true);
    expect(next.analysisRuns).toHaveLength(2);
    expect(next.derivedDatasetRevisions).toHaveLength(4);
    expect(next.derivedValues).toHaveLength(24);
    for (const key of historyKeys) {
      expect(next[key].slice(0, first[key].length), `new execution retains historical ${key} exactly`).toEqual(first[key]);
    }
    for (const key of ["rawRevisions", "designRevisions", "unitInstances", "observations"] as const) {
      expect(next[key]).toEqual(first[key]);
    }
    expect(new Set(next.derivedValues.map(({ id }) => id)).size).toBe(24);
    expectPairedUnits(next, 1, input.controlConditionId);
    expect(JSON.stringify(first), "old persisted ProjectState must remain immutable").toBe(firstJson);
    expect(JSON.stringify(input), "scientific fixture must remain immutable").toBe(fixtureJson);
  });
});
