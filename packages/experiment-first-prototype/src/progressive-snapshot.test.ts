import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPERIMENT_PLAN_ANSWER_VERSION,
  buildExperimentCanvas,
  type ExperimentPlanAnswers,
} from "./experiment-canvas-builder.ts";
import {
  OBSERVATION_INTERVIEW_VERSION,
  mapObservationInterviewToPattern,
  type ObservationInterviewAnswers,
} from "./observation-interview.ts";
import {
  createProgressiveEntrySnapshot,
  parseProgressiveEntrySnapshot,
  serializeProgressiveEntrySnapshot,
  validateProgressiveEntrySnapshot,
  type ProgressiveEntrySnapshot,
  type StagedObservationInput,
} from "./progressive-snapshot.ts";
import {
  ANALYSIS_SCOPE_VERSION,
  createAnalysisScope,
  type AnalysisScopeRequest,
} from "./analysis-scope.ts";

function fixture() {
  const plan: ExperimentPlanAnswers = {
    schemaVersion: EXPERIMENT_PLAN_ANSWER_VERSION,
    planId: "snapshot-plan",
    experimentLabel: "Vehicle and Drug",
    dimensions: [{
      key: "treatment",
      label: "Treatment",
      kind: "intervention",
      groups: [],
      values: [
        { key: "vehicle", label: "Vehicle", groupKey: null },
        { key: "drug", label: "Drug", groupKey: null },
      ],
    }],
    combinationPlan: {
      kind: "explicit",
      cells: [{ values: { treatment: "drug" }, status: "not_performed_by_design" }],
      unlistedStatus: "performed",
    },
    measurements: [{ key: "signal", label: "Signal", recordForm: "one_number", componentLabels: [] }],
  };
  const canvasResult = buildExperimentCanvas(plan);
  assert.equal(canvasResult.status, "mapped");
  if (canvasResult.status !== "mapped") throw new Error("Expected Canvas");
  const canvas = canvasResult.canvas;
  const answers: ObservationInterviewAnswers = {
    schemaVersion: OBSERVATION_INTERVIEW_VERSION,
    answerSetId: "snapshot-pattern",
    canvasSchemaVersion: canvas.schemaVersion,
    items: [{ key: "dish", label: "Culture dish", kind: "biological_or_experimental_entity", parentKey: null, multiplicity: { kind: "from_input" } }],
    identities: [{ key: "dish_id", label: "Dish ID", itemKey: "dish", uniquenessScopeItemKey: null, availability: { state: "available", origin: "researcher_supplied" } }],
    axes: [],
    readouts: [{ readoutKey: "signal", observedItemKey: "dish", alignment: { kind: "separate_entities" }, axisUses: [], coordinatePlan: "sparse_explicit", coverage: { kind: "all_performed" } }],
  };
  const patternResult = mapObservationInterviewToPattern(canvas, answers);
  assert.equal(patternResult.status, "mapped");
  if (patternResult.status !== "mapped") throw new Error("Expected Pattern");
  return { canvas, pattern: patternResult.pattern };
}

function records(recordSetKey: string): StagedObservationInput[] {
  return [
    {
      recordId: "record-vehicle",
      readoutKey: "signal",
      recordSetKey,
      conditionCellKey: "treatment-vehicle",
      identities: { dish_id: "D1" },
      coordinates: {},
      hierarchy: {},
      values: { value: 1.2 },
      missingness: {},
      sourceRow: 2,
      mappingState: "mapped",
    },
    {
      recordId: "record-drug-retained",
      readoutKey: "signal",
      recordSetKey,
      conditionCellKey: "treatment-drug",
      identities: { dish_id: "D2" },
      coordinates: {},
      hierarchy: {},
      values: { value: 2.4 },
      missingness: {},
      sourceRow: 3,
      mappingState: "mapped",
    },
  ];
}

function snapshot(): ProgressiveEntrySnapshot {
  const { canvas, pattern } = fixture();
  return createProgressiveEntrySnapshot({
    projectId: "project.snapshot",
    savedAt: "2026-08-27T00:00:00.000Z",
    canvas,
    activePattern: pattern,
    records: records(pattern.recordSets[0]!.key),
    rawLineage: {
      sourceKind: "tsv",
      sourceLabel: "values.tsv",
      rawText: "Condition\tDishID\tValue\nVehicle\tD1\t1.2\nDrug\tD2\t2.4",
      sha256: null,
      transformations: ["mapped headers explicitly"],
    },
  });
}

describe("progressive entry semantic snapshot", () => {
  it("retains raw records but excludes a record bound to a non-performed condition", () => {
    const result = snapshot();
    assert.equal(result.records.length, 2);
    assert.deepEqual(result.records.map((record) => record.eligibility), ["active", "excluded_condition_or_binding"]);
    assert.equal(result.records[1]?.values.value, 2.4);
  });

  it("round-trips Canvas, Pattern, raw lineage, records, and a stopped design projection", () => {
    const result = snapshot();
    result.designProjection = {
      status: "stopped",
      issues: [{
        code: "SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE",
        path: "canvas.conditionCells",
        message: "Legacy Contract cannot preserve the sparse condition plan.",
      }],
    };
    const reopened = parseProgressiveEntrySnapshot(serializeProgressiveEntrySnapshot(result));
    assert.deepEqual(reopened, result);
    assert.equal(reopened.rawLineage.rawText?.includes("Drug\tD2\t2.4"), true);
    assert.equal(reopened.designProjection.status, "stopped");
  });

  it("retains an unconfirmed pattern revision without applying its aligned surface", () => {
    const base = snapshot();
    const pending = structuredClone(base.activePattern);
    pending.patternSetId = "pending-same-entity";
    pending.identities[0]!.purpose = "both";
    pending.recordSets[0]!.entryAlignment = { mode: "same_entity", identityKey: "dish_id", completeSets: true };
    const next = createProgressiveEntrySnapshot({
      projectId: base.projectId,
      savedAt: base.savedAt,
      canvas: base.canvas,
      activePattern: base.activePattern,
      pendingPattern: pending,
      records: base.records.map(({ eligibility: _eligibility, ...record }) => ({ ...record, mappingState: "pending_remap" })),
      rawLineage: base.rawLineage,
    });
    assert.equal(next.pendingPattern?.patternSetId, "pending-same-entity");
    assert.equal(next.surfacePlan.sections[0]?.surfaceId, "factor_observation_table");
    assert.ok(next.records.every((record) => record.eligibility === "pending_remap"));
  });

  it("rejects a stale eligibility flag instead of silently including excluded data", () => {
    const result = snapshot();
    result.records[1]!.eligibility = "active";
    assert.throws(() => validateProgressiveEntrySnapshot(result), /eligibility is stale/);
  });

  it("round-trips an active comparison scope with its fixed-condition context", () => {
    const base = snapshot();
    const request: AnalysisScopeRequest = {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "vehicle-only",
      conditionCellKeys: ["treatment-vehicle"],
      readoutKeys: ["signal"],
    };
    const saved = createProgressiveEntrySnapshot({
      projectId: base.projectId,
      savedAt: base.savedAt,
      canvas: base.canvas,
      activePattern: base.activePattern,
      records: base.records.map(({ eligibility: _eligibility, ...record }) => record),
      rawLineage: base.rawLineage,
      analysisScopes: [{ request }],
    });
    assert.equal(saved.analysisScopes[0]?.state, "active");
    if (saved.analysisScopes[0]?.state !== "active") return;
    assert.deepEqual(saved.analysisScopes[0].provenance.fixedConditionContext.map((context) => [context.dimensionLabel, context.valueLabel]), [
      ["Treatment", "Vehicle"],
    ]);
    const reopened = parseProgressiveEntrySnapshot(serializeProgressiveEntrySnapshot(saved));
    assert.deepEqual(reopened.analysisScopes, saved.analysisScopes);
  });

  it("retains prior scope provenance while marking a now-invalid scope inactive", () => {
    const base = snapshot();
    const request: AnalysisScopeRequest = {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "vehicle-and-drug",
      conditionCellKeys: ["treatment-vehicle", "treatment-drug"],
      readoutKeys: ["signal"],
    };
    const previousCanvas = structuredClone(base.canvas);
    previousCanvas.conditionCells.find((cell) => cell.key === "treatment-drug")!.status = "performed";
    const previousPattern = structuredClone(base.activePattern);
    const measured = previousPattern.bindings.find((binding) => binding.status === "measured")!;
    measured.conditionCellKeys.push("treatment-drug");
    previousPattern.bindings = previousPattern.bindings.filter((binding) => binding.status !== "not_measured_by_design");
    const previousScope = createAnalysisScope(previousCanvas, previousPattern, request);
    assert.equal(previousScope.status, "ready");
    if (previousScope.status !== "ready") return;

    const saved = createProgressiveEntrySnapshot({
      projectId: base.projectId,
      savedAt: base.savedAt,
      canvas: base.canvas,
      activePattern: base.activePattern,
      records: base.records.map(({ eligibility: _eligibility, ...record }) => record),
      rawLineage: base.rawLineage,
      analysisScopes: [{ request, previousProvenance: previousScope.provenance }],
    });
    assert.equal(saved.analysisScopes[0]?.state, "invalidated");
    if (saved.analysisScopes[0]?.state !== "invalidated") return;
    assert.ok(saved.analysisScopes[0].issues.some((candidate) => candidate.code === "SELECTED_CONDITION_NOT_PERFORMED"));
    assert.deepEqual(saved.analysisScopes[0].previousProvenance, previousScope.provenance);
    assert.equal(saved.records.length, 2);
    assert.equal(saved.records[1]?.values.value, 2.4);
    assert.doesNotThrow(() => parseProgressiveEntrySnapshot(serializeProgressiveEntrySnapshot(saved)));
  });
});
