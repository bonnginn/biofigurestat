import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CANVAS_BUILDER_QUESTIONS,
  EXPERIMENT_PLAN_ANSWER_VERSION,
  buildExperimentCanvas,
  nextCanvasBuilderQuestion,
  type ExperimentPlanAnswers,
} from "./experiment-canvas-builder.ts";
import {
  OBSERVATION_INTERVIEW_VERSION,
  mapObservationInterviewToPattern,
  type ObservationInterviewAnswers,
} from "./observation-interview.ts";
import { selectSurfaceFromCanvasAndPattern } from "./observation-surface.ts";

function basePlan(): ExperimentPlanAnswers {
  return {
    schemaVersion: EXPERIMENT_PLAN_ANSWER_VERSION,
    planId: "canvas-builder-fixture",
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
    combinationPlan: { kind: "all_performed" },
    measurements: [{ key: "signal", label: "Signal", recordForm: "one_number", componentLabels: [] }],
  };
}

function mapped(plan = basePlan()) {
  const result = buildExperimentCanvas(plan);
  assert.equal(result.status, "mapped");
  if (result.status !== "mapped") throw new Error("Expected mapped Canvas");
  return result;
}

describe("guided or matrix experiment-plan to ExperimentCanvas", () => {
  it("uses experiment-language questions rather than data-model terms", () => {
    assert.ok(CANVAS_BUILDER_QUESTIONS.every((question) => question.researcherFactOnly));
    const wording = CANVAS_BUILDER_QUESTIONS.map((question) => question.wording).join("\n").toLowerCase();
    for (const forbidden of ["factor", "level", "identity column", "nested", "scalar"]) {
      assert.equal(wording.includes(forbidden), false, forbidden);
    }
  });

  it("expands one entered change into a deterministic condition matrix", () => {
    const result = mapped();
    assert.deepEqual(result.canvas.conditionCells.map((cell) => cell.values), [
      { treatment: "vehicle" },
      { treatment: "drug" },
    ]);
    assert.ok(result.inferences.some((candidate) => candidate.ruleId === "SCALAR_VALUE_COMPONENT"));
    assert.deepEqual(result.canvas.readouts[0]?.componentLabels, ["Value"]);
  });

  it("creates one performed condition when the experiment has no changed condition", () => {
    const plan = basePlan();
    plan.dimensions = [];
    const result = mapped(plan);
    assert.deepEqual(result.canvas.conditionCells, [{ key: "condition-1", values: {}, status: "performed" }]);
  });

  it("keeps siRNA target groups as non-selectable headers in a sparse siRNA by Dox matrix", () => {
    const plan = basePlan();
    plan.experimentLabel = "siRNA and Dox";
    plan.dimensions = [
      {
        key: "sirna",
        label: "siRNA",
        kind: "intervention",
        groups: [
          { key: "gene_a", label: "Gene A" },
          { key: "gene_b", label: "Gene B" },
        ],
        values: [
          { key: "control", label: "control", groupKey: null },
          ...[1, 2, 3].map((number) => ({ key: `gene_a_${number}`, label: `#${number}`, groupKey: "gene_a" })),
          ...[1, 2, 3].map((number) => ({ key: `gene_b_${number}`, label: `#${number}`, groupKey: "gene_b" })),
        ],
      },
      {
        key: "dox",
        label: "Dox",
        kind: "intervention",
        groups: [],
        values: [
          { key: "minus", label: "−", groupKey: null },
          { key: "plus", label: "+", groupKey: null },
        ],
      },
    ];
    plan.combinationPlan = {
      kind: "explicit",
      cells: [{ values: { sirna: "control", dox: "plus" }, status: "not_performed_by_design" }],
      unlistedStatus: "performed",
    };
    plan.measurements = [{
      key: "ciliated_fraction",
      label: "Ciliated cells",
      recordForm: "positive_and_total",
      componentLabels: ["Ciliated cells", "Total cells"],
    }];

    const result = mapped(plan);
    assert.equal(result.canvas.conditionCells.length, 14);
    assert.equal(result.canvas.conditionCells.filter((cell) => cell.status === "not_performed_by_design").length, 1);
    assert.deepEqual(result.canvas.dimensions[0]?.values.map((value) => value.key), [
      "control", "gene_a_1", "gene_a_2", "gene_a_3", "gene_b_1", "gene_b_2", "gene_b_3",
    ]);
    assert.equal(result.canvas.dimensions[0]?.values.some((value) => value.key === "gene_a"), false);
    assert.equal(result.canvas.readouts[0]?.representation, "proportion_counts");
  });

  it("leaves unlisted combinations unknown unless another default was explicitly selected", () => {
    const plan = basePlan();
    plan.combinationPlan = {
      kind: "explicit",
      cells: [{ values: { treatment: "vehicle" }, status: "performed" }],
      unlistedStatus: "unknown",
    };
    const result = mapped(plan);
    assert.deepEqual(result.canvas.conditionCells.map((cell) => cell.status), ["performed", "unknown"]);
  });

  it("asks for typed raw components instead of collapsing them to a derived value", () => {
    const plan = basePlan();
    plan.measurements[0] = {
      key: "fraction",
      label: "Positive fraction",
      recordForm: "positive_and_total",
      componentLabels: [],
    };
    const result = buildExperimentCanvas(plan);
    assert.equal(result.status, "needs_information");
    assert.equal(nextCanvasBuilderQuestion(result), "ASK_MEASUREMENT_RECORD_FORM");
  });

  it("safe-stops a duplicated explicit condition rather than choosing one status", () => {
    const plan = basePlan();
    plan.combinationPlan = {
      kind: "explicit",
      cells: [
        { values: { treatment: "vehicle" }, status: "performed" },
        { values: { treatment: "vehicle" }, status: "not_performed_by_design" },
      ],
      unlistedStatus: "unknown",
    };
    const result = buildExperimentCanvas(plan);
    assert.equal(result.status, "stopped");
    assert.deepEqual(result.issues.map((candidate) => candidate.code), ["CONDITION_CELL_DUPLICATE"]);
  });

  it("exposes only the earliest missing experiment fact", () => {
    const plan = basePlan();
    plan.dimensions[0]!.values = [];
    plan.combinationPlan = { kind: "unknown" };
    plan.measurements = [];
    const result = buildExperimentCanvas(plan);
    assert.equal(result.status, "needs_information");
    assert.equal(nextCanvasBuilderQuestion(result), "ASK_CHANGE_VALUES");
  });

  it("hands the generated Canvas to the observation interview without adding statistical facts", () => {
    const canvas = mapped().canvas;
    const observationAnswers: ObservationInterviewAnswers = {
      schemaVersion: OBSERVATION_INTERVIEW_VERSION,
      answerSetId: "canvas-to-observation",
      canvasSchemaVersion: canvas.schemaVersion,
      items: [{
        key: "dish",
        label: "Culture dish",
        kind: "biological_or_experimental_entity",
        parentKey: null,
        multiplicity: { kind: "from_input" },
      }],
      identities: [],
      axes: [],
      readouts: [{
        readoutKey: "signal",
        observedItemKey: "dish",
        alignment: { kind: "separate_entities" },
        axisUses: [],
        coordinatePlan: "sparse_explicit",
        coverage: { kind: "all_performed" },
      }],
    };
    const observation = mapObservationInterviewToPattern(canvas, observationAnswers);
    assert.equal(observation.status, "mapped");
    if (observation.status !== "mapped") return;
    assert.equal(selectSurfaceFromCanvasAndPattern(canvas, observation.pattern).surfaceId, "factor_observation_table");
    assert.equal("experimentalUnitLevelKey" in observation.pattern, false);
  });
});
