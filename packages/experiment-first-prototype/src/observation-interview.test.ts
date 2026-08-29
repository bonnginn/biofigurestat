import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPERIMENT_CANVAS_VERSION,
  type ExperimentCanvas,
} from "./experiment-canvas.ts";
import {
  OBSERVATION_INTERVIEW_QUESTIONS,
  OBSERVATION_INTERVIEW_VERSION,
  mapObservationInterviewToPattern,
  nextObservationQuestion,
  type ObservationInterviewAnswers,
} from "./observation-interview.ts";
import { selectSurfaceFromCanvasAndPattern, selectSurfacePlanFromCanvasAndPattern } from "./observation-surface.ts";
import {
  RESOLVED_DESIGN_FACTS_VERSION,
  mapExperimentToStructureContract,
  type ResolvedDesignFacts,
} from "./forward-mapper.ts";

function scalarCanvas(): ExperimentCanvas {
  return {
    schemaVersion: EXPERIMENT_CANVAS_VERSION,
    experimentLabel: "Vehicle and Drug",
    dimensions: [{
      key: "treatment",
      label: "Treatment",
      kind: "intervention",
      values: [
        { key: "vehicle", label: "Vehicle", parentValueKey: null },
        { key: "drug", label: "Drug", parentValueKey: null },
      ],
    }],
    conditionCells: [
      { key: "vehicle", values: { treatment: "vehicle" }, status: "performed" },
      { key: "drug", values: { treatment: "drug" }, status: "performed" },
    ],
    readouts: [{ key: "signal", label: "Signal", representation: "scalar", componentLabels: ["Value"] }],
  };
}

function baseAnswers(): ObservationInterviewAnswers {
  return {
    schemaVersion: OBSERVATION_INTERVIEW_VERSION,
    answerSetId: "observation-interview-fixture",
    canvasSchemaVersion: EXPERIMENT_CANVAS_VERSION,
    items: [{
      key: "dish",
      label: "Culture dish",
      kind: "biological_or_experimental_entity",
      parentKey: null,
      multiplicity: { kind: "from_input" },
    }],
    identities: [{
      key: "dish_id",
      label: "Dish ID",
      itemKey: "dish",
      uniquenessScopeItemKey: null,
      availability: { state: "to_be_collected", origin: "app_assigned_before_entry" },
    }],
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
}

function mapped(canvas = scalarCanvas(), answers = baseAnswers()) {
  const result = mapObservationInterviewToPattern(canvas, answers);
  assert.equal(result.status, "mapped");
  if (result.status !== "mapped") throw new Error("Expected mapped observation interview");
  return result;
}

describe("observation-only biological interview mapper", () => {
  it("uses only questions a researcher can answer from what was done", () => {
    assert.ok(OBSERVATION_INTERVIEW_QUESTIONS.every((question) => question.researcherFactOnly));
    const wording = OBSERVATION_INTERVIEW_QUESTIONS.map((question) => question.wording).join("\n");
    for (const forbidden of ["factor", "level", "scalar", "ordered axis", "nested observation"]) {
      assert.equal(wording.toLowerCase().includes(forbidden), false, forbidden);
    }
  });

  it("maps one record per item to separate condition lists without inferring biological n", () => {
    const result = mapped();
    assert.equal(result.pattern.recordSets[0]?.entryAlignment.mode, "separate_lists");
    assert.equal(result.pattern.levels[0]?.plannedMultiplicity.mode, "from_input");
    assert.deepEqual(selectSurfaceFromCanvasAndPattern(scalarCanvas(), result.pattern), {
      surfaceId: "factor_observation_table",
      reasonCodes: ["separate_condition_record_lists"],
    });
  });

  it("maps the same item across conditions only through an explicit usable ID", () => {
    const answers = baseAnswers();
    answers.identities[0]!.availability = { state: "available", origin: "researcher_supplied" };
    answers.readouts[0]!.alignment = { kind: "same_entity", identityKey: "dish_id", completeness: "all_planned_present" };
    const result = mapped(scalarCanvas(), answers);
    assert.equal(result.pattern.identities[0]?.purpose, "both");
    assert.deepEqual(selectSurfaceFromCanvasAndPattern(scalarCanvas(), result.pattern), {
      surfaceId: "compact_unit_matrix",
      reasonCodes: ["small_complete_aligned_set"],
    });
  });

  it("maps a same-item time sequence to an identity by time matrix", () => {
    const answers = baseAnswers();
    answers.identities[0]!.availability = { state: "available", origin: "instrument_supplied" };
    answers.axes = [{
      key: "time",
      label: "Time",
      unit: "min",
      source: { kind: "within_condition_record" },
      kind: "ordered_quantity",
      ordering: "ordered",
      valuePlan: { mode: "fixed_global", values: [0, 10, 30] },
    }];
    answers.readouts[0]!.axisUses = [{
      axisKey: "time",
      entity: { kind: "same_entity", retainedItemKey: "dish", identityKey: "dish_id" },
      material: "same_preparation",
    }];
    answers.readouts[0]!.coordinatePlan = "cartesian_plan";
    const result = mapped(scalarCanvas(), answers);
    assert.equal(result.pattern.recordSets[0]?.axisUses[0]?.identityBehavior.kind, "same_entity");
    assert.equal(selectSurfaceFromCanvasAndPattern(scalarCanvas(), result.pattern).surfaceId, "repeated_axis_matrix");
  });

  it("keeps destructive time as distinct entities rather than repeated measurements", () => {
    const answers = baseAnswers();
    answers.axes = [{
      key: "harvest_time",
      label: "Harvest time",
      unit: "h",
      source: { kind: "within_condition_record" },
      kind: "ordered_quantity",
      ordering: "ordered",
      valuePlan: { mode: "fixed_global", values: [0, 6, 24] },
    }];
    answers.readouts[0]!.axisUses = [{
      axisKey: "harvest_time",
      entity: { kind: "distinct_entity_each_value", variedItemKey: "dish", sharedParentItemKey: null },
      material: "unknown",
    }];
    const result = mapped(scalarCanvas(), answers);
    assert.equal(result.pattern.recordSets[0]?.axisUses[0]?.identityBehavior.kind, "distinct_entity_each_value");
    assert.equal(result.pattern.recordSets[0]?.axisUses[0]?.materialBehavior, "new_material_each_value");
    assert.ok(result.inferences.some((candidate) => candidate.ruleId === "DISTINCT_ENTITY_USES_NEW_MATERIAL"));
    assert.equal(selectSurfaceFromCanvasAndPattern(scalarCanvas(), result.pattern).surfaceId, "factor_observation_table");
  });

  it("infers same preparation for explicit coordinates within one entity", () => {
    const answers = baseAnswers();
    answers.identities[0]!.availability = { state: "available", origin: "instrument_supplied" };
    answers.axes = [{
      key: "radius",
      label: "Radius",
      unit: "µm",
      source: { kind: "within_condition_record" },
      kind: "spatial_coordinate",
      ordering: "ordered",
      valuePlan: { mode: "fixed_global", values: [10, 20, 30] },
    }];
    answers.readouts[0]!.axisUses = [{
      axisKey: "radius",
      entity: { kind: "coordinate_within_entity", retainedItemKey: "dish", identityKey: "dish_id" },
      material: "unknown",
    }];
    const result = mapped(scalarCanvas(), answers);
    assert.equal(result.pattern.recordSets[0]?.axisUses[0]?.materialBehavior, "same_preparation");
    assert.ok(result.inferences.some((candidate) => candidate.ruleId === "COORDINATE_USES_SAME_PREPARATION"));
  });

  it("maps dish to field to Cell records without promoting children to condition rows", () => {
    const answers = baseAnswers();
    answers.items.push(
      { key: "field", label: "Field", kind: "sampling_location", parentKey: "dish", multiplicity: { kind: "variable", suggestedCount: null } },
      { key: "cell", label: "Cell", kind: "observed_entity", parentKey: "field", multiplicity: { kind: "variable", suggestedCount: null } },
    );
    answers.identities.push(
      { key: "field_id", label: "Field ID", itemKey: "field", uniquenessScopeItemKey: "dish", availability: { state: "available", origin: "instrument_supplied" } },
      { key: "cell_id", label: "Cell ID", itemKey: "cell", uniquenessScopeItemKey: "field", availability: { state: "available", origin: "instrument_supplied" } },
    );
    answers.readouts[0]!.observedItemKey = "cell";
    const result = mapped(scalarCanvas(), answers);
    assert.deepEqual(result.pattern.levels.map((level) => level.parentKey), [null, "dish", "field"]);
    assert.equal(selectSurfaceFromCanvasAndPattern(scalarCanvas(), result.pattern).surfaceId, "nested_observation_table");
  });

  it("keeps positive and total as one typed record", () => {
    const canvas = scalarCanvas();
    canvas.readouts[0] = {
      key: "positive_fraction",
      label: "Ciliated cells",
      representation: "proportion_counts",
      componentLabels: ["Positive", "Total"],
    };
    const answers = baseAnswers();
    answers.readouts[0]!.readoutKey = "positive_fraction";
    const result = mapped(canvas, answers);
    assert.deepEqual(result.pattern.bindings[0]?.componentKeys, ["positive", "total"]);
    assert.equal(selectSurfaceFromCanvasAndPattern(canvas, result.pattern).surfaceId, "typed_record_table");
  });

  it("creates separate record sets for readouts measured at different grains", () => {
    const canvas = scalarCanvas();
    canvas.readouts = [
      { key: "dish_total", label: "Dish total", representation: "scalar", componentLabels: ["Value"] },
      { key: "cell_signal", label: "Cell signal", representation: "scalar", componentLabels: ["Value"] },
    ];
    const answers = baseAnswers();
    answers.items.push({ key: "cell", label: "Cell", kind: "observed_entity", parentKey: "dish", multiplicity: { kind: "variable", suggestedCount: null } });
    answers.readouts = [
      { ...answers.readouts[0]!, readoutKey: "dish_total", observedItemKey: "dish" },
      { ...answers.readouts[0]!, readoutKey: "cell_signal", observedItemKey: "cell" },
    ];
    const result = mapped(canvas, answers);
    assert.deepEqual(result.pattern.recordSets.map((recordSet) => recordSet.observedLevelKey), ["dish", "cell"]);
    assert.deepEqual(selectSurfaceFromCanvasAndPattern(canvas, result.pattern), {
      surfaceId: "factor_observation_table",
      reasonCodes: ["multiple_readout_grains"],
    });
    assert.deepEqual(
      selectSurfacePlanFromCanvasAndPattern(canvas, result.pattern).sections.map((section) => ({ readoutKeys: section.readoutKeys, surfaceId: section.surfaceId })),
      [
        { readoutKeys: ["dish_total"], surfaceId: "factor_observation_table" },
        { readoutKeys: ["cell_signal"], surfaceId: "nested_observation_table" },
      ],
    );
  });

  it("expands sparse condition status into explicit readout bindings", () => {
    const canvas = scalarCanvas();
    canvas.conditionCells[1] = { ...canvas.conditionCells[1]!, status: "not_performed_by_design" };
    const result = mapped(canvas, baseAnswers());
    assert.deepEqual(result.pattern.bindings.map((binding) => [binding.status, binding.conditionCellKeys]), [
      ["measured", ["vehicle"]],
      ["not_measured_by_design", ["drug"]],
    ]);
  });

  it("asks a targeted question when cross-condition alignment is unknown", () => {
    const answers = baseAnswers();
    answers.readouts[0]!.alignment = { kind: "unknown" };
    const result = mapObservationInterviewToPattern(scalarCanvas(), answers);
    assert.equal(result.status, "needs_information");
    if (result.status !== "needs_information") return;
    assert.deepEqual(result.issues.map((candidate) => candidate.questionId), ["ASK_CONDITION_ALIGNMENT"]);
    assert.equal(nextObservationQuestion(result), "ASK_CONDITION_ALIGNMENT");
  });

  it("shows only the earliest structure-changing question when several answers are unresolved", () => {
    const answers = baseAnswers();
    answers.items[0]!.multiplicity = { kind: "unknown" };
    answers.readouts[0]!.alignment = { kind: "unknown" };
    answers.readouts[0]!.coverage = { kind: "unknown" };
    const result = mapObservationInterviewToPattern(scalarCanvas(), answers);
    assert.equal(result.status, "needs_information");
    assert.equal(nextObservationQuestion(result), "ASK_MULTIPLICITY");
  });

  it("retains an irrecoverable intended match but refuses an aligned matrix", () => {
    const answers = baseAnswers();
    answers.identities[0]!.availability = { state: "irrecoverable", origin: "external_link_table" };
    answers.readouts[0]!.alignment = { kind: "same_entity", identityKey: "dish_id", completeness: "all_planned_present" };
    const result = mapped(scalarCanvas(), answers);
    assert.deepEqual(result.readinessIssues, ["identity_irrecoverable:dish_id"]);
    assert.deepEqual(selectSurfaceFromCanvasAndPattern(scalarCanvas(), result.pattern), {
      surfaceId: "factor_observation_table",
      reasonCodes: ["scientific_linkage_not_ready"],
    });
  });

  it("does not select a sequence surface while physical-material continuity is unknown", () => {
    const answers = baseAnswers();
    answers.identities[0]!.availability = { state: "available", origin: "researcher_supplied" };
    answers.axes = [{
      key: "time",
      label: "Time",
      unit: "min",
      source: { kind: "within_condition_record" },
      kind: "ordered_quantity",
      ordering: "ordered",
      valuePlan: { mode: "fixed_global", values: [0, 30] },
    }];
    answers.readouts[0]!.axisUses = [{
      axisKey: "time",
      entity: { kind: "same_entity", retainedItemKey: "dish", identityKey: "dish_id" },
      material: "unknown",
    }];
    const result = mapObservationInterviewToPattern(scalarCanvas(), answers);
    assert.equal(result.status, "needs_information");
    if (result.status !== "needs_information") return;
    assert.ok(result.issues.some((candidate) => candidate.questionId === "ASK_AXIS_MATERIAL_BEHAVIOR"));
  });

  it("is deterministic for the same Canvas and answer payload", () => {
    assert.deepEqual(
      mapObservationInterviewToPattern(scalarCanvas(), baseAnswers()),
      mapObservationInterviewToPattern(scalarCanvas(), baseAnswers()),
    );
  });

  it("continues from observation answers to an equivalent design only after statistics facts are supplied", () => {
    const canvas = scalarCanvas();
    const observation = mapped(canvas, baseAnswers());
    const facts: ResolvedDesignFacts = {
      schemaVersion: RESOLVED_DESIGN_FACTS_VERSION,
      caseId: "INTERVIEW-END-TO-END",
      experimentDescription: "Independent culture dishes received Vehicle or Drug.",
      experimentalUnitLevelKey: "dish",
      units: [{ levelKey: "dish", role: "experimental_unit", parentLevelKeys: [] }],
      factors: [{
        dimensionKey: "treatment",
        unitRole: "between_unit",
        relationship: "independent",
        ordered: false,
        referenceValueKey: "vehicle",
      }],
      matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
      readouts: [{ readoutKey: "signal", valueType: "continuous", referenceRole: "none" }],
      allowedMissingness: ["not_collected", "assay_failed", "unknown"],
      rawObservationGrain: "one row per culture dish",
    };

    const result = mapExperimentToStructureContract(canvas, observation.pattern, facts);
    assert.equal(result.status, "mapped");
    if (result.status !== "mapped") return;
    assert.equal(result.contract.experimentalUnitLevelKey, "dish");
    assert.equal(result.contract.matching.kind, "independent");
    assert.equal(result.contract.readouts[0]?.observationLevelKey, "dish");
  });
});
