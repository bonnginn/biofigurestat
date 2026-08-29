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
import { selectSurfacePlanFromCanvasAndPattern } from "./observation-surface.ts";
import {
  RESOLVED_DESIGN_FACTS_VERSION,
  mapExperimentToStructureContract,
  type ResolvedDesignFacts,
} from "./forward-mapper.ts";

function canvas(plan: ExperimentPlanAnswers) {
  const result = buildExperimentCanvas(plan);
  assert.equal(result.status, "mapped");
  if (result.status !== "mapped") throw new Error("Expected Canvas");
  return result.canvas;
}

function pattern(experiment: ReturnType<typeof canvas>, answers: ObservationInterviewAnswers) {
  const result = mapObservationInterviewToPattern(experiment, answers);
  assert.equal(result.status, "mapped");
  if (result.status !== "mapped") throw new Error("Expected observation pattern");
  return result.pattern;
}

function basePlan(): ExperimentPlanAnswers {
  return {
    schemaVersion: EXPERIMENT_PLAN_ANSWER_VERSION,
    planId: "stress-plan",
    experimentLabel: "Stress experiment",
    dimensions: [{
      key: "treatment",
      label: "Treatment",
      kind: "intervention",
      groups: [],
      values: [
        { key: "control", label: "Control", groupKey: null },
        { key: "drug", label: "Drug", groupKey: null },
      ],
    }],
    combinationPlan: { kind: "all_performed" },
    measurements: [{ key: "signal", label: "Signal", recordForm: "one_number", componentLabels: [] }],
  };
}

function oneLevelAnswers(experiment: ReturnType<typeof canvas>): ObservationInterviewAnswers {
  return {
    schemaVersion: OBSERVATION_INTERVIEW_VERSION,
    answerSetId: "stress-observations",
    canvasSchemaVersion: experiment.schemaVersion,
    items: [{ key: "dish", label: "Culture dish", kind: "biological_or_experimental_entity", parentKey: null, multiplicity: { kind: "from_input" } }],
    identities: [{ key: "dish_id", label: "Dish ID", itemKey: "dish", uniquenessScopeItemKey: null, availability: { state: "to_be_collected", origin: "app_assigned_before_entry" } }],
    axes: [],
    readouts: experiment.readouts.map((readout) => ({
      readoutKey: readout.key,
      observedItemKey: "dish",
      alignment: { kind: "separate_entities" },
      axisUses: [],
      coordinatePlan: "sparse_explicit",
      coverage: { kind: "all_performed" },
    })),
  };
}

describe("staged-entry combined biological stress cases", () => {
  it("retains sparse grouped siRNA by Dox with lower positive/total observations while legacy projection stops", () => {
    const plan = basePlan();
    plan.dimensions = [
      {
        key: "sirna",
        label: "siRNA",
        kind: "intervention",
        groups: [{ key: "gene_a", label: "Gene A" }],
        values: [
          { key: "control", label: "control", groupKey: null },
          { key: "gene_a_1", label: "#1", groupKey: "gene_a" },
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
    plan.measurements = [{ key: "cilia", label: "Ciliated cells", recordForm: "positive_and_total", componentLabels: ["Ciliated", "Total"] }];
    const experiment = canvas(plan);
    const answers = oneLevelAnswers(experiment);
    answers.items.push({ key: "field", label: "Microscope field", kind: "sampling_location", parentKey: "dish", multiplicity: { kind: "variable", suggestedCount: null } });
    answers.identities.push({ key: "field_id", label: "Field ID", itemKey: "field", uniquenessScopeItemKey: "dish", availability: { state: "to_be_collected", origin: "app_assigned_before_entry" } });
    answers.readouts[0]!.observedItemKey = "field";
    const observations = pattern(experiment, answers);

    assert.deepEqual(selectSurfacePlanFromCanvasAndPattern(experiment, observations).sections.map((section) => section.surfaceId), ["typed_record_table"]);
    assert.equal(observations.bindings.some((binding) => binding.status === "not_measured_by_design"), true);

    const facts: ResolvedDesignFacts = {
      schemaVersion: RESOLVED_DESIGN_FACTS_VERSION,
      caseId: "STRESS-SIRNA-DOX",
      experimentDescription: "Grouped siRNA sequences with Dox and field-level ciliated counts.",
      experimentalUnitLevelKey: "dish",
      units: [
        { levelKey: "dish", role: "experimental_unit", parentLevelKeys: [] },
        { levelKey: "field", role: "sampling_location", parentLevelKeys: ["dish"] },
      ],
      factors: [
        { dimensionKey: "sirna", unitRole: "between_unit", relationship: "independent", ordered: false, referenceValueKey: "control" },
        { dimensionKey: "dox", unitRole: "between_unit", relationship: "independent", ordered: false, referenceValueKey: "minus" },
      ],
      matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
      readouts: [{ readoutKey: "cilia", valueType: "proportion_from_counts", referenceRole: "none" }],
      allowedMissingness: ["not_applicable", "not_collected", "unknown"],
      rawObservationGrain: "one row per field with parent Dish ID",
    };
    const projected = mapExperimentToStructureContract(experiment, observations, facts);
    assert.equal(projected.status, "stopped");
    if (projected.status !== "stopped") return;
    const codes = projected.issues.map((candidate) => candidate.code);
    assert.ok(codes.includes("SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE"));
    assert.ok(codes.includes("FACTOR_VALUE_GROUPING_NOT_REPRESENTABLE"));
  });

  it("preserves pERK, total ERK, and total protein so either normalization can be derived later", () => {
    const plan = basePlan();
    plan.measurements = [{
      key: "erk_bundle",
      label: "ERK phosphorylation",
      recordForm: "other_related_values",
      componentLabels: ["pERK", "total ERK", "total protein"],
    }];
    const experiment = canvas(plan);
    const observations = pattern(experiment, oneLevelAnswers(experiment));
    assert.deepEqual(observations.bindings[0]?.componentKeys, ["perk", "total_erk", "total_protein"]);
    assert.equal(selectSurfacePlanFromCanvasAndPattern(experiment, observations).sections[0]?.surfaceId, "typed_record_table");
  });

  it("keeps multiple phosphorylation bundles from the same lane in one typed record section", () => {
    const plan = basePlan();
    plan.measurements = [
      { key: "erk", label: "ERK phosphorylation", recordForm: "other_related_values", componentLabels: ["pERK", "total ERK"] },
      { key: "akt", label: "AKT phosphorylation", recordForm: "other_related_values", componentLabels: ["pAKT", "total AKT"] },
    ];
    const experiment = canvas(plan);
    const answers = oneLevelAnswers(experiment);
    answers.items[0] = { key: "lane", label: "Blot lane", kind: "technical_record", parentKey: null, multiplicity: { kind: "from_input" } };
    answers.identities[0] = { key: "lane_id", label: "Lane ID", itemKey: "lane", uniquenessScopeItemKey: null, availability: { state: "available", origin: "researcher_supplied" } };
    for (const readout of answers.readouts) readout.observedItemKey = "lane";
    const observations = pattern(experiment, answers);
    const surfacePlan = selectSurfacePlanFromCanvasAndPattern(experiment, observations);
    assert.equal(observations.recordSets.length, 1);
    assert.deepEqual(surfacePlan.sections[0]?.readoutKeys, ["erk", "akt"]);
    assert.equal(surfacePlan.sections[0]?.surfaceId, "typed_record_table");
  });

  it("composes nested Cell records with same-Cell time tracking without promoting Cells to biological n", () => {
    const experiment = canvas(basePlan());
    const answers = oneLevelAnswers(experiment);
    answers.items.push({ key: "cell", label: "Cell", kind: "observed_entity", parentKey: "dish", multiplicity: { kind: "variable", suggestedCount: null } });
    answers.identities.push({ key: "cell_id", label: "Cell ID", itemKey: "cell", uniquenessScopeItemKey: "dish", availability: { state: "available", origin: "instrument_supplied" } });
    answers.axes = [{ key: "time", label: "Time", unit: "min", source: { kind: "within_condition_record" }, kind: "ordered_quantity", ordering: "ordered", valuePlan: { mode: "per_identity", suggestedValues: [0, 10, 30] } }];
    answers.readouts[0]!.observedItemKey = "cell";
    answers.readouts[0]!.axisUses = [{ axisKey: "time", entity: { kind: "same_entity", retainedItemKey: "cell", identityKey: "cell_id" }, material: "same_preparation" }];
    answers.readouts[0]!.coordinatePlan = "per_identity_schedule";
    const observations = pattern(experiment, answers);
    const section = selectSurfacePlanFromCanvasAndPattern(experiment, observations).sections[0]!;
    assert.equal(section.surfaceId, "nested_observation_table");
    assert.equal(observations.recordSets[0]?.observedLevelKey, "cell");
    assert.equal(observations.recordSets[0]?.axisUses[0]?.identityBehavior.kind, "same_entity");
  });

  it("distinguishes an ordered condition dimension from a sequence inside each condition", () => {
    const plan = basePlan();
    plan.dimensions = [{
      key: "harvest_time",
      label: "Harvest time",
      kind: "ordered_quantity",
      groups: [],
      values: [
        { key: "h0", label: "0", groupKey: null },
        { key: "h6", label: "6", groupKey: null },
        { key: "h24", label: "24", groupKey: null },
      ],
    }];
    const experiment = canvas(plan);
    const answers = oneLevelAnswers(experiment);
    answers.axes = [{ key: "harvest_time", label: "Harvest time", unit: "h", source: { kind: "canvas_dimension", dimensionKey: "harvest_time" }, kind: "ordered_quantity", ordering: "ordered", valuePlan: null }];
    answers.readouts[0]!.axisUses = [{ axisKey: "harvest_time", entity: { kind: "distinct_entity_each_value", variedItemKey: "dish", sharedParentItemKey: null }, material: "unknown" }];
    answers.readouts[0]!.coordinatePlan = "cartesian_plan";
    const observations = pattern(experiment, answers);
    assert.equal(observations.axes[0]?.source.kind, "canvas_dimension");
    assert.equal(selectSurfacePlanFromCanvasAndPattern(experiment, observations).sections[0]?.surfaceId, "factor_observation_table");

    const facts: ResolvedDesignFacts = {
      schemaVersion: RESOLVED_DESIGN_FACTS_VERSION,
      caseId: "STRESS-DESTRUCTIVE-AXIS",
      experimentDescription: "Different dishes were harvested at 0, 6, or 24 hours.",
      experimentalUnitLevelKey: "dish",
      units: [{ levelKey: "dish", role: "experimental_unit", parentLevelKeys: [] }],
      factors: [{ dimensionKey: "harvest_time", unitRole: "between_unit", relationship: "independent", ordered: true, referenceValueKey: "h0" }],
      matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
      readouts: [{ readoutKey: "signal", valueType: "continuous", referenceRole: "none" }],
      allowedMissingness: ["not_collected", "assay_failed", "unknown"],
      rawObservationGrain: "one row per destructively harvested dish",
    };
    const projected = mapExperimentToStructureContract(experiment, observations, facts);
    assert.equal(projected.status, "mapped");
    if (projected.status !== "mapped") return;
    assert.equal(projected.contract.orderedAxes[0]?.sampling, "cross_sectional");
    assert.equal(projected.contract.readouts[0]?.axisKeys[0], "harvest_time");
  });
});
