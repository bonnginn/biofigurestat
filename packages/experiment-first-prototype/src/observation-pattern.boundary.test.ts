import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPERIMENT_CANVAS_VERSION,
  type ExperimentCanvas,
} from "./experiment-canvas.ts";
import {
  OBSERVATION_PATTERN_VERSION,
  observationPatternReadinessIssues,
  validateObservationPatternSet,
  type ObservationPatternSet,
} from "./observation-pattern.ts";
import { selectSurfaceFromCanvasAndPattern } from "./observation-surface.ts";

function canvas(
  conditionCells: ExperimentCanvas["conditionCells"] = [
    { key: "control", values: { treatment: "control" }, status: "performed" },
    { key: "drug", values: { treatment: "drug" }, status: "performed" },
  ],
  readouts: ExperimentCanvas["readouts"] = [
    { key: "signal", label: "Signal", representation: "scalar", componentLabels: ["signal"] },
  ],
): ExperimentCanvas {
  return {
    schemaVersion: EXPERIMENT_CANVAS_VERSION,
    experimentLabel: "Observation boundary fixture",
    dimensions: [{
      key: "treatment",
      label: "Treatment",
      kind: "intervention",
      values: [
        { key: "control", label: "Control", parentValueKey: null },
        { key: "drug", label: "Drug", parentValueKey: null },
      ],
    }],
    conditionCells,
    readouts,
  };
}

function independentPattern(): ObservationPatternSet {
  return {
    schemaVersion: OBSERVATION_PATTERN_VERSION,
    patternSetId: "independent-unequal-n",
    canvasSchemaVersion: EXPERIMENT_CANVAS_VERSION,
    levels: [{
      key: "dish",
      label: "Culture dish",
      kind: "biological_or_experimental_entity",
      parentKey: null,
      plannedMultiplicity: { mode: "variable", suggestedCount: null },
    }],
    identities: [{
      key: "dish_id",
      label: "Dish ID",
      levelKey: "dish",
      uniquenessScopeLevelKey: null,
      purpose: "instance_key",
      availability: "to_be_collected",
      origin: "app_assigned_before_entry",
    }],
    axes: [],
    recordSets: [{
      key: "signal_records",
      label: "Signal observations",
      observedLevelKey: "dish",
      axisUses: [],
      coordinatePlan: "sparse_explicit",
      entryAlignment: { mode: "separate_lists", identityKey: null, completeSets: false },
    }],
    bindings: [{
      readoutKey: "signal",
      componentKeys: ["signal"],
      conditionCellKeys: ["control", "drug"],
      status: "measured",
      recordSetKey: "signal_records",
    }],
  };
}

describe("ObservationPatternSet v0.3 boundary invariants", () => {
  it("rejects a measured binding on a condition that was not performed", () => {
    const experiment = canvas([
      { key: "control", values: { treatment: "control" }, status: "performed" },
      { key: "drug", values: { treatment: "drug" }, status: "not_performed_by_design" },
    ]);
    const pattern = independentPattern();

    assert.throws(
      () => validateObservationPatternSet(pattern, experiment),
      /Not-performed condition cannot have measured binding/,
    );
  });

  it("rejects a measured binding while the condition itself remains unknown", () => {
    const experiment = canvas([
      { key: "control", values: { treatment: "control" }, status: "performed" },
      { key: "drug", values: { treatment: "drug" }, status: "unknown" },
    ]);
    const pattern = independentPattern();

    assert.throws(
      () => validateObservationPatternSet(pattern, experiment),
      /Unknown condition cannot have measured binding/,
    );
  });

  it("rejects duplicate readout-to-condition bindings", () => {
    const experiment = canvas();
    const pattern = independentPattern();
    pattern.bindings = [
      { readoutKey: "signal", componentKeys: ["signal"], conditionCellKeys: ["control"], status: "measured", recordSetKey: "signal_records" },
      { readoutKey: "signal", componentKeys: ["signal"], conditionCellKeys: ["control", "drug"], status: "measured", recordSetKey: "signal_records" },
    ];

    assert.throws(
      () => validateObservationPatternSet(pattern, experiment),
      /Readout and condition cell are bound more than once/,
    );
  });

  it("rejects an implicit missing readout-to-condition binding", () => {
    const experiment = canvas();
    const pattern = independentPattern();
    pattern.bindings[0]!.conditionCellKeys = ["control"];

    assert.throws(
      () => validateObservationPatternSet(pattern, experiment),
      /require an explicit binding: signal\|drug/,
    );
  });

  it("does not allow an app row surrogate to establish scientific linkage", () => {
    const experiment = canvas();
    const pattern = independentPattern();
    pattern.identities[0] = {
      ...pattern.identities[0]!,
      key: "row_id",
      purpose: "instance_key",
      origin: "app_row_surrogate",
    };
    pattern.recordSets[0]!.entryAlignment = {
      mode: "shared_linkage",
      identityKey: "row_id",
      completeSets: true,
    };

    assert.throws(
      () => validateObservationPatternSet(pattern, experiment),
      /Scientific linkage identity required/,
    );
  });

  it("rejects an aligned input plan with no scientific identity", () => {
    const experiment = canvas();
    const pattern = independentPattern();
    pattern.recordSets[0]!.entryAlignment = {
      mode: "same_entity",
      identityKey: null,
      completeSets: true,
    };

    assert.throws(
      () => validateObservationPatternSet(pattern, experiment),
      /requires a scientific linkage identity/,
    );
  });

  it("accepts variable numbers of nested observations", () => {
    const experiment = canvas();
    const pattern = independentPattern();
    pattern.levels = [
      { key: "dish", label: "Culture dish", kind: "biological_or_experimental_entity", parentKey: null, plannedMultiplicity: { mode: "from_input" } },
      { key: "field", label: "Microscope field", kind: "sampling_location", parentKey: "dish", plannedMultiplicity: { mode: "variable", suggestedCount: null } },
      { key: "cell", label: "Cell", kind: "observed_entity", parentKey: "field", plannedMultiplicity: { mode: "variable", suggestedCount: null } },
    ];
    pattern.identities.push(
      { key: "field_id", label: "Field ID", levelKey: "field", uniquenessScopeLevelKey: "dish", purpose: "instance_key", availability: "available", origin: "instrument_supplied" },
      { key: "cell_id", label: "Cell ID", levelKey: "cell", uniquenessScopeLevelKey: "field", purpose: "instance_key", availability: "available", origin: "instrument_supplied" },
    );
    pattern.recordSets[0]!.observedLevelKey = "cell";

    assert.equal(validateObservationPatternSet(pattern, experiment), pattern);
    assert.deepEqual(
      pattern.levels.slice(1).map((level) => level.plannedMultiplicity.mode),
      ["variable", "variable"],
    );
  });

  it("accepts explicitly sparse coordinates across multiple axes without assuming a Cartesian grid", () => {
    const experiment = canvas();
    const pattern = independentPattern();
    pattern.axes = [
      { key: "time", label: "Time", unit: "min", source: { kind: "within_condition_record" }, kind: "ordered_quantity", ordering: "ordered", valuePlan: { mode: "per_identity", suggestedValues: [0, 10, 30] } },
      { key: "position", label: "Position", unit: "µm", source: { kind: "within_condition_record" }, kind: "spatial_coordinate", ordering: "ordered", valuePlan: { mode: "from_input" } },
    ];
    pattern.identities[0] = {
      ...pattern.identities[0]!,
      purpose: "both",
      availability: "available",
      origin: "researcher_supplied",
    };
    pattern.recordSets[0] = {
      ...pattern.recordSets[0]!,
      coordinatePlan: "sparse_explicit",
      entryAlignment: { mode: "same_entity", identityKey: "dish_id", completeSets: false },
      axisUses: [
        { axisKey: "time", identityBehavior: { kind: "same_entity", retainedLevelKey: "dish", identityKey: "dish_id" }, materialBehavior: "same_preparation" },
        { axisKey: "position", identityBehavior: { kind: "coordinate_within_entity", retainedLevelKey: "dish", identityKey: "dish_id" }, materialBehavior: "same_preparation" },
      ],
    };

    assert.equal(validateObservationPatternSet(pattern, experiment), pattern);
    assert.equal(pattern.recordSets[0]!.coordinatePlan, "sparse_explicit");
  });

  it("accepts retained biological identity with newly collected material at each axis value", () => {
    const experiment = canvas();
    const pattern = independentPattern();
    pattern.levels[0] = {
      ...pattern.levels[0]!,
      key: "animal",
      label: "Animal",
    };
    pattern.identities[0] = {
      key: "animal_id",
      label: "Animal ID",
      levelKey: "animal",
      uniquenessScopeLevelKey: null,
      purpose: "both",
      availability: "available",
      origin: "researcher_supplied",
    };
    pattern.axes = [{
      key: "week",
      label: "Week",
      unit: "week",
      source: { kind: "within_condition_record" },
      kind: "ordered_quantity",
      ordering: "ordered",
      valuePlan: { mode: "fixed_global", values: [0, 2, 4] },
    }];
    pattern.recordSets[0] = {
      ...pattern.recordSets[0]!,
      observedLevelKey: "animal",
      axisUses: [{
        axisKey: "week",
        identityBehavior: { kind: "same_entity", retainedLevelKey: "animal", identityKey: "animal_id" },
        materialBehavior: "new_material_each_value",
      }],
      coordinatePlan: "per_identity_schedule",
      entryAlignment: { mode: "same_entity", identityKey: "animal_id", completeSets: false },
    };

    assert.equal(validateObservationPatternSet(pattern, experiment), pattern);
    assert.equal(pattern.recordSets[0]!.axisUses[0]!.materialBehavior, "new_material_each_value");
  });

  it("accepts independent conditions with unequal n as separate observation lists", () => {
    const experiment = canvas();
    const pattern = independentPattern();

    assert.equal(validateObservationPatternSet(pattern, experiment), pattern);
    assert.equal(pattern.recordSets[0]!.entryAlignment.mode, "separate_lists");
    assert.equal(pattern.recordSets[0]!.entryAlignment.completeSets, false);
    assert.equal(pattern.levels[0]!.plannedMultiplicity.mode, "variable");
  });

  it("accepts multiple readouts recorded at different grains", () => {
    const experiment = canvas(undefined, [
      { key: "dish_total", label: "Dish total", representation: "scalar", componentLabels: ["dish_total"] },
      { key: "cell_intensity", label: "Cell intensity", representation: "scalar", componentLabels: ["cell_intensity"] },
    ]);
    const pattern = independentPattern();
    pattern.levels.push({
      key: "cell",
      label: "Cell",
      kind: "observed_entity",
      parentKey: "dish",
      plannedMultiplicity: { mode: "variable", suggestedCount: null },
    });
    pattern.identities.push({
      key: "cell_id",
      label: "Cell ID",
      levelKey: "cell",
      uniquenessScopeLevelKey: "dish",
      purpose: "instance_key",
      availability: "available",
      origin: "instrument_supplied",
    });
    pattern.recordSets = [
      { ...pattern.recordSets[0]!, key: "dish_records", label: "Dish totals", observedLevelKey: "dish" },
      { ...pattern.recordSets[0]!, key: "cell_records", label: "Cell intensities", observedLevelKey: "cell" },
    ];
    pattern.bindings = [
      { readoutKey: "dish_total", componentKeys: ["dish_total"], conditionCellKeys: ["control", "drug"], status: "measured", recordSetKey: "dish_records" },
      { readoutKey: "cell_intensity", componentKeys: ["cell_intensity"], conditionCellKeys: ["control", "drug"], status: "measured", recordSetKey: "cell_records" },
    ];

    assert.equal(validateObservationPatternSet(pattern, experiment), pattern);
    assert.deepEqual(pattern.recordSets.map((recordSet) => recordSet.observedLevelKey), ["dish", "cell"]);
  });

  it("reports an irrecoverable identity as a readiness issue instead of coercing it", () => {
    const experiment = canvas();
    const pattern = independentPattern();
    pattern.identities[0] = {
      ...pattern.identities[0]!,
      purpose: "both",
      availability: "irrecoverable",
      origin: "external_link_table",
    };
    pattern.axes = [{
      key: "time",
      label: "Time",
      unit: "min",
      source: { kind: "within_condition_record" },
      kind: "ordered_quantity",
      ordering: "ordered",
      valuePlan: { mode: "fixed_global", values: [0, 30] },
    }];
    pattern.recordSets[0] = {
      ...pattern.recordSets[0]!,
      axisUses: [{
        axisKey: "time",
        identityBehavior: { kind: "same_entity", retainedLevelKey: "dish", identityKey: "dish_id" },
        materialBehavior: "same_preparation",
      }],
      entryAlignment: { mode: "same_entity", identityKey: "dish_id", completeSets: true },
    };

    assert.equal(validateObservationPatternSet(pattern, experiment), pattern);
    assert.deepEqual(observationPatternReadinessIssues(pattern), ["identity_irrecoverable:dish_id"]);
    assert.deepEqual(selectSurfaceFromCanvasAndPattern(experiment, pattern), {
      surfaceId: "factor_observation_table",
      reasonCodes: ["scientific_linkage_not_ready"],
    });
  });

  it("allows a scientific matching key to link sibling root grains", () => {
    const experiment = canvas();
    const pattern = independentPattern();
    pattern.levels = [
      { key: "left_sample", label: "Condition A sample", kind: "material_source", parentKey: null, plannedMultiplicity: { mode: "from_input" } },
      { key: "right_sample", label: "Condition B sample", kind: "material_source", parentKey: null, plannedMultiplicity: { mode: "from_input" } },
    ];
    pattern.identities = [{
      key: "match_id",
      label: "Matched source ID",
      levelKey: "left_sample",
      uniquenessScopeLevelKey: null,
      purpose: "scientific_linkage",
      availability: "available",
      origin: "external_link_table",
    }];
    pattern.recordSets[0] = {
      ...pattern.recordSets[0]!,
      observedLevelKey: "right_sample",
      entryAlignment: { mode: "shared_linkage", identityKey: "match_id", completeSets: false },
    };

    assert.equal(validateObservationPatternSet(pattern, experiment), pattern);
    assert.equal(pattern.recordSets[0]!.entryAlignment.identityKey, "match_id");
  });
});
