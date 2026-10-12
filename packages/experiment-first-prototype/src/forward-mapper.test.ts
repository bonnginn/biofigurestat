import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  EXPERIMENT_CANVAS_VERSION,
  experimentCanvasFromContract,
  type ExperimentCanvas,
} from "./experiment-canvas.ts";
import {
  OBSERVATION_PATTERN_VERSION,
  observationPatternFromContract,
  type ObservationPatternSet,
} from "./observation-pattern.ts";
import { compileGoldCase } from "./compiler.ts";
import type { StructureContract } from "./contract.ts";
import { loadGoldSet } from "./evaluation.ts";
import {
  RESOLVED_DESIGN_FACTS_VERSION,
  mapExperimentToStructureContract,
  type ResolvedDesignFacts,
} from "./forward-mapper.ts";

function scalarCanvas(): ExperimentCanvas {
  return {
    schemaVersion: EXPERIMENT_CANVAS_VERSION,
    experimentLabel: "Drug response",
    dimensions: [{
      key: "treatment",
      label: "Treatment",
      kind: "intervention",
      values: [
        { key: "control", label: "Control", parentValueKey: null },
        { key: "drug", label: "Drug", parentValueKey: null },
      ],
    }],
    conditionCells: [
      { key: "control", values: { treatment: "control" }, status: "performed" },
      { key: "drug", values: { treatment: "drug" }, status: "performed" },
    ],
    readouts: [{ key: "signal", label: "Signal", representation: "scalar", componentLabels: ["Value"] }],
  };
}

function independentPattern(): ObservationPatternSet {
  return {
    schemaVersion: OBSERVATION_PATTERN_VERSION,
    patternSetId: "independent",
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
      label: "Signal records",
      observedLevelKey: "dish",
      axisUses: [],
      coordinatePlan: "sparse_explicit",
      entryAlignment: { mode: "separate_lists", identityKey: null, completeSets: false },
    }],
    bindings: [{
      readoutKey: "signal",
      componentKeys: ["value"],
      conditionCellKeys: ["control", "drug"],
      status: "measured",
      recordSetKey: "signal_records",
    }],
  };
}

function independentFacts(): ResolvedDesignFacts {
  return {
    schemaVersion: RESOLVED_DESIGN_FACTS_VERSION,
    caseId: "FORWARD-01",
    experimentDescription: "Independent culture dishes received control or drug.",
    experimentalUnitLevelKey: "dish",
    units: [{ levelKey: "dish", role: "experimental_unit", parentLevelKeys: [] }],
    factors: [{
      dimensionKey: "treatment",
      unitRole: "between_unit",
      relationship: "independent",
      ordered: false,
      referenceValueKey: "control",
    }],
    matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
    readouts: [{ readoutKey: "signal", valueType: "continuous", referenceRole: "none" }],
    allowedMissingness: ["not_collected", "assay_failed", "unknown"],
    rawObservationGrain: "one row per culture dish",
  };
}

function codes(result: ReturnType<typeof mapExperimentToStructureContract>): string[] {
  return result.status === "stopped" ? result.issues.map((candidate) => candidate.code) : [];
}

function gold65() {
  const root = resolve(process.cwd(), "../..");
  return loadGoldSet(resolve(root, "docs/evaluation/experiment-to-structure-navigation-pilot/experiment-first/stress/gold-set-65.json"));
}

/** Regression-only projection from an already-complete semantic answer. */
function resolvedFactsFromContract(contract: StructureContract): ResolvedDesignFacts {
  return {
    schemaVersion: RESOLVED_DESIGN_FACTS_VERSION,
    caseId: contract.caseId,
    experimentDescription: contract.experimentDescription,
    experimentalUnitLevelKey: contract.experimentalUnitLevelKey,
    units: contract.unitLevels.map((level) => ({
      levelKey: level.key,
      role: level.role,
      parentLevelKeys: level.parentKey === null ? [] : [level.parentKey],
    })),
    factors: contract.factors.map((factor) => ({
      dimensionKey: factor.key,
      unitRole: factor.unitRole,
      relationship: factor.relationship,
      ordered: factor.ordered,
      // Contract-to-Canvas regression projection preserves labels as value keys.
      referenceValueKey: factor.referenceLevel,
    })),
    matching: { ...contract.matching },
    readouts: contract.readouts.map((readout) => ({
      readoutKey: readout.key,
      valueType: readout.valueType,
      referenceRole: readout.referenceRole,
    })),
    allowedMissingness: [...contract.allowedMissingness],
    rawObservationGrain: contract.rawObservationGrain,
  };
}

describe("experiment-first forward mapper", () => {
  it("maps independent scalar observations without deriving pairing from rectangular Canvas cells", () => {
    const result = mapExperimentToStructureContract(scalarCanvas(), independentPattern(), independentFacts());

    assert.equal(result.status, "mapped");
    if (result.status !== "mapped") return;
    assert.equal(result.contract.experimentalUnitLevelKey, "dish");
    assert.equal(result.contract.matching.kind, "independent");
    assert.equal(result.contract.factors[0]?.unitRole, "between_unit");
    assert.equal(result.contract.factors[0]?.referenceLevel, "Control");
    assert.equal(result.contract.readouts[0]?.observationLevelKey, "dish");
  });

  it("maps matched sibling samples through an explicit shared source identity", () => {
    const canvas = scalarCanvas();
    const pattern = independentPattern();
    pattern.levels = [
      { key: "donor", label: "Donor", kind: "biological_or_experimental_entity", parentKey: null, plannedMultiplicity: { mode: "from_input" } },
      { key: "sample", label: "Condition-specific sample", kind: "material_source", parentKey: "donor", plannedMultiplicity: { mode: "fixed_plan", count: 2 } },
    ];
    pattern.identities = [
      { key: "donor_id", label: "Donor ID", levelKey: "donor", uniquenessScopeLevelKey: null, purpose: "both", availability: "available", origin: "researcher_supplied" },
      { key: "sample_id", label: "Sample ID", levelKey: "sample", uniquenessScopeLevelKey: "donor", purpose: "instance_key", availability: "available", origin: "researcher_supplied" },
    ];
    pattern.recordSets[0] = {
      ...pattern.recordSets[0]!,
      observedLevelKey: "sample",
      entryAlignment: { mode: "shared_linkage", identityKey: "donor_id", completeSets: true },
    };
    const facts = independentFacts();
    facts.experimentalUnitLevelKey = "sample";
    facts.units = [
      { levelKey: "donor", role: "block", parentLevelKeys: [] },
      { levelKey: "sample", role: "experimental_unit", parentLevelKeys: ["donor"] },
    ];
    facts.factors[0] = { ...facts.factors[0]!, unitRole: "between_unit", relationship: "paired" };
    facts.matching = { kind: "matched", identityKey: "donor_id", completeSetsRequired: true };
    facts.rawObservationGrain = "one row per donor-specific condition sample";

    const result = mapExperimentToStructureContract(canvas, pattern, facts);

    assert.equal(result.status, "mapped");
    if (result.status !== "mapped") return;
    assert.equal(result.contract.experimentalUnitLevelKey, "sample");
    assert.equal(result.contract.unitLevels.find((level) => level.key === "donor")?.role, "block");
    assert.equal(result.contract.unitLevels.find((level) => level.key === "sample")?.role, "experimental_unit");
    assert.deepEqual(result.contract.factors[0] && {
      unitRole: result.contract.factors[0].unitRole,
      relationship: result.contract.factors[0].relationship,
    }, { unitRole: "between_unit", relationship: "paired" });
    assert.equal(result.contract.matching.identityKey, "donor_id");
    assert.equal(result.contract.readouts[0]?.observationLevelKey, "sample");
    assert.equal(result.contract.unitLevels.find((level) => level.key === "sample")?.parentKey, "donor");
  });

  it("maps a fixed same-entity repeated axis only when scientific identity and material continuity are explicit", () => {
    const canvas = scalarCanvas();
    const pattern = independentPattern();
    pattern.identities[0] = {
      ...pattern.identities[0]!,
      key: "cell_id",
      label: "Cell ID",
      purpose: "both",
      availability: "available",
      origin: "instrument_supplied",
    };
    pattern.axes = [{
      key: "time",
      label: "Time",
      unit: "min",
      source: { kind: "within_condition_record" },
      kind: "ordered_quantity",
      ordering: "ordered",
      valuePlan: { mode: "fixed_global", values: [0, 10, 30] },
    }];
    pattern.recordSets[0] = {
      ...pattern.recordSets[0]!,
      axisUses: [{
        axisKey: "time",
        identityBehavior: { kind: "same_entity", retainedLevelKey: "dish", identityKey: "cell_id" },
        materialBehavior: "same_preparation",
      }],
      coordinatePlan: "cartesian_plan",
      entryAlignment: { mode: "same_entity", identityKey: "cell_id", completeSets: false },
    };
    const facts = independentFacts();
    facts.matching = { kind: "matched", identityKey: "cell_id", completeSetsRequired: false };

    const result = mapExperimentToStructureContract(canvas, pattern, facts);

    assert.equal(result.status, "mapped");
    if (result.status !== "mapped") return;
    assert.deepEqual(result.contract.orderedAxes[0], {
      key: "time",
      label: "Time",
      unit: "min",
      levels: [0, 10, 30],
      sampling: "repeated_same_identity",
      identityRetained: true,
    });
    assert.deepEqual(result.contract.readouts[0]?.axisKeys, ["time"]);
  });

  it("maps nested raw observations without promoting fields or cells to biological n", () => {
    const canvas = scalarCanvas();
    const pattern = independentPattern();
    pattern.levels = [
      { key: "dish", label: "Culture dish", kind: "biological_or_experimental_entity", parentKey: null, plannedMultiplicity: { mode: "from_input" } },
      { key: "field", label: "Field", kind: "sampling_location", parentKey: "dish", plannedMultiplicity: { mode: "variable", suggestedCount: null } },
      { key: "cell", label: "Cell", kind: "observed_entity", parentKey: "field", plannedMultiplicity: { mode: "variable", suggestedCount: null } },
    ];
    pattern.identities.push(
      { key: "field_id", label: "Field ID", levelKey: "field", uniquenessScopeLevelKey: "dish", purpose: "instance_key", availability: "available", origin: "instrument_supplied" },
      { key: "cell_id", label: "Cell ID", levelKey: "cell", uniquenessScopeLevelKey: "field", purpose: "instance_key", availability: "available", origin: "instrument_supplied" },
    );
    pattern.recordSets[0] = { ...pattern.recordSets[0]!, observedLevelKey: "cell" };
    const facts = independentFacts();
    facts.units = [
      { levelKey: "dish", role: "experimental_unit", parentLevelKeys: [] },
      { levelKey: "field", role: "sampling_location", parentLevelKeys: ["dish"] },
      { levelKey: "cell", role: "subsample", parentLevelKeys: ["field"] },
    ];
    facts.rawObservationGrain = "one row per Cell with Dish ID and Field ID";

    const result = mapExperimentToStructureContract(canvas, pattern, facts);

    assert.equal(result.status, "mapped");
    if (result.status !== "mapped") return;
    assert.equal(result.contract.experimentalUnitLevelKey, "dish");
    assert.deepEqual(result.contract.unitLevels.map((level) => level.role), ["experimental_unit", "sampling_location", "subsample"]);
    assert.equal(result.contract.readouts[0]?.observationLevelKey, "cell");
  });

  it("maps positive and total counts as one typed proportion record", () => {
    const canvas = scalarCanvas();
    canvas.readouts = [{
      key: "ciliated_fraction",
      label: "Ciliated cells",
      representation: "proportion_counts",
      componentLabels: ["Ciliated cells", "Total cells"],
    }];
    const pattern = independentPattern();
    pattern.bindings = [{
      readoutKey: "ciliated_fraction",
      componentKeys: ["positive", "total"],
      conditionCellKeys: ["control", "drug"],
      status: "measured",
      recordSetKey: "signal_records",
    }];
    const facts = independentFacts();
    facts.readouts = [{ readoutKey: "ciliated_fraction", valueType: "proportion_from_counts", referenceRole: "none" }];

    const result = mapExperimentToStructureContract(canvas, pattern, facts);

    assert.equal(result.status, "mapped");
    if (result.status !== "mapped") return;
    assert.equal(result.contract.readouts[0]?.representation, "proportion_counts");
    assert.deepEqual(result.contract.readouts[0]?.componentKeys, ["positive", "total"]);
  });

  it("safe-stops unknown, recoverable, and irrecoverable scientific linkage instead of inventing matching", () => {
    for (const availability of ["unknown", "recoverable", "irrecoverable"] as const) {
      const canvas = scalarCanvas();
      const pattern = independentPattern();
      pattern.identities[0] = {
        ...pattern.identities[0]!,
        purpose: "both",
        availability,
        origin: "external_link_table",
      };
      pattern.recordSets[0]!.entryAlignment = { mode: "shared_linkage", identityKey: "dish_id", completeSets: false };
      const facts = independentFacts();
      facts.factors[0] = { ...facts.factors[0]!, unitRole: "within_unit", relationship: "paired" };
      facts.matching = { kind: "matched", identityKey: "dish_id", completeSetsRequired: false };

      const result = mapExperimentToStructureContract(canvas, pattern, facts);

      assert.equal(result.status, "stopped");
      assert.ok(codes(result).includes(
        availability === "unknown"
          ? "LINKAGE_IDENTITY_UNKNOWN"
          : availability === "recoverable"
            ? "LINKAGE_MAPPING_REQUIRED"
            : "LINKAGE_IDENTITY_IRRECOVERABLE",
      ));
    }
  });

  it("safe-stops a multi-parent hierarchy rather than flattening it", () => {
    const facts = independentFacts();
    facts.units = [{ levelKey: "dish", role: "experimental_unit", parentLevelKeys: ["source_a", "source_b"] }];

    const result = mapExperimentToStructureContract(scalarCanvas(), independentPattern(), facts);

    assert.equal(result.status, "stopped");
    assert.ok(codes(result).includes("MULTI_PARENT_HIERARCHY_NOT_REPRESENTABLE"));
  });

  it("safe-stops a nominal acquisition channel instead of converting it to ordered time", () => {
    const canvas = scalarCanvas();
    const pattern = independentPattern();
    pattern.axes = [{
      key: "channel",
      label: "Channel",
      unit: null,
      source: { kind: "within_condition_record" },
      kind: "acquisition_channel",
      ordering: "nominal",
      valuePlan: { mode: "fixed_global", values: ["GFP", "DAPI"] },
    }];
    pattern.recordSets[0] = {
      ...pattern.recordSets[0]!,
      axisUses: [{ axisKey: "channel", identityBehavior: { kind: "not_identity_bearing" }, materialBehavior: "same_preparation" }],
      coordinatePlan: "cartesian_plan",
    };

    const result = mapExperimentToStructureContract(canvas, pattern, independentFacts());

    assert.equal(result.status, "stopped");
    assert.ok(codes(result).includes("NOMINAL_AXIS_NOT_REPRESENTABLE"));
  });

  it("safe-stops condition-specific record grains that the legacy readout cannot bind", () => {
    const pattern = independentPattern();
    pattern.recordSets.push({
      ...pattern.recordSets[0]!,
      key: "drug_signal_records",
      label: "Drug signal records",
    });
    pattern.bindings = [
      { readoutKey: "signal", componentKeys: ["value"], conditionCellKeys: ["control"], status: "measured", recordSetKey: "signal_records" },
      { readoutKey: "signal", componentKeys: ["value"], conditionCellKeys: ["drug"], status: "measured", recordSetKey: "drug_signal_records" },
    ];

    const result = mapExperimentToStructureContract(scalarCanvas(), pattern, independentFacts());

    assert.equal(result.status, "stopped");
    assert.ok(codes(result).includes("CONDITION_SPECIFIC_RECORD_SET_NOT_REPRESENTABLE"));
  });

  it("safe-stops a sparse two-axis schedule instead of implying a complete Cartesian grid", () => {
    const pattern = independentPattern();
    pattern.identities[0] = { ...pattern.identities[0]!, purpose: "both", availability: "available", origin: "researcher_supplied" };
    pattern.axes = [
      { key: "time", label: "Time", unit: "min", source: { kind: "within_condition_record" }, kind: "ordered_quantity", ordering: "ordered", valuePlan: { mode: "fixed_global", values: [0, 30] } },
      { key: "distance", label: "Distance", unit: "µm", source: { kind: "within_condition_record" }, kind: "spatial_coordinate", ordering: "ordered", valuePlan: { mode: "fixed_global", values: [0, 10] } },
    ];
    pattern.recordSets[0] = {
      ...pattern.recordSets[0]!,
      coordinatePlan: "sparse_explicit",
      entryAlignment: { mode: "same_entity", identityKey: "dish_id", completeSets: false },
      axisUses: [
        { axisKey: "time", identityBehavior: { kind: "same_entity", retainedLevelKey: "dish", identityKey: "dish_id" }, materialBehavior: "same_preparation" },
        { axisKey: "distance", identityBehavior: { kind: "coordinate_within_entity", retainedLevelKey: "dish", identityKey: "dish_id" }, materialBehavior: "same_preparation" },
      ],
    };
    const facts = independentFacts();
    facts.matching = { kind: "matched", identityKey: "dish_id", completeSetsRequired: false };

    const result = mapExperimentToStructureContract(scalarCanvas(), pattern, facts);

    assert.equal(result.status, "stopped");
    assert.ok(codes(result).includes("SPARSE_MULTI_AXIS_NOT_REPRESENTABLE"));
  });

  it("safe-stops sparse condition cells that StructureContract 0.1.0 would expand into a false full factorial", () => {
    const canvas = scalarCanvas();
    canvas.conditionCells[1] = { ...canvas.conditionCells[1]!, status: "not_performed_by_design" };
    const pattern = independentPattern();
    pattern.bindings = [
      { readoutKey: "signal", componentKeys: ["value"], conditionCellKeys: ["control"], status: "measured", recordSetKey: "signal_records" },
      { readoutKey: "signal", componentKeys: ["value"], conditionCellKeys: ["drug"], status: "not_measured_by_design", recordSetKey: null },
    ];

    const result = mapExperimentToStructureContract(canvas, pattern, independentFacts());

    assert.equal(result.status, "stopped");
    assert.ok(codes(result).includes("SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE"));
  });

  it("safe-stops an omitted condition combination even when every listed cell was performed", () => {
    const canvas = scalarCanvas();
    canvas.dimensions.push({
      key: "induction",
      label: "Induction",
      kind: "intervention",
      values: [
        { key: "minus", label: "−", parentValueKey: null },
        { key: "plus", label: "+", parentValueKey: null },
      ],
    });
    canvas.conditionCells = [
      { key: "control-minus", values: { treatment: "control", induction: "minus" }, status: "performed" },
      { key: "drug-minus", values: { treatment: "drug", induction: "minus" }, status: "performed" },
      { key: "drug-plus", values: { treatment: "drug", induction: "plus" }, status: "performed" },
    ];
    const pattern = independentPattern();
    pattern.bindings[0]!.conditionCellKeys = canvas.conditionCells.map((cell) => cell.key);
    const facts = independentFacts();
    facts.factors.push({
      dimensionKey: "induction",
      unitRole: "between_unit",
      relationship: "independent",
      ordered: false,
      referenceValueKey: "minus",
    });

    const result = mapExperimentToStructureContract(canvas, pattern, facts);

    assert.equal(result.status, "stopped");
    assert.ok(codes(result).includes("SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE"));
  });

  it("keeps non-selectable condition grouping in Canvas instead of silently dropping it", () => {
    const canvas = scalarCanvas();
    canvas.dimensions[0]!.groups = [{ key: "target_gene", label: "Target gene" }];
    canvas.dimensions[0]!.values[1] = {
      ...canvas.dimensions[0]!.values[1]!,
      groupKey: "target_gene",
    };

    const result = mapExperimentToStructureContract(canvas, independentPattern(), independentFacts());

    assert.equal(result.status, "stopped");
    assert.ok(codes(result).includes("FACTOR_VALUE_GROUPING_NOT_REPRESENTABLE"));
  });

  it("maps retained biological identity with new material while preserving material semantics in the Pattern sidecar", () => {
    const canvas = scalarCanvas();
    const pattern = independentPattern();
    pattern.identities[0] = { ...pattern.identities[0]!, purpose: "both", availability: "available", origin: "researcher_supplied" };
    pattern.axes = [{ key: "week", label: "Week", unit: "week", source: { kind: "within_condition_record" }, kind: "ordered_quantity", ordering: "ordered", valuePlan: { mode: "fixed_global", values: [0, 2, 4] } }];
    pattern.recordSets[0] = {
      ...pattern.recordSets[0]!,
      axisUses: [{
        axisKey: "week",
        identityBehavior: { kind: "same_entity", retainedLevelKey: "dish", identityKey: "dish_id" },
        materialBehavior: "new_material_each_value",
      }],
      coordinatePlan: "cartesian_plan",
      entryAlignment: { mode: "same_entity", identityKey: "dish_id", completeSets: false },
    };
    const facts = independentFacts();
    facts.matching = { kind: "matched", identityKey: "dish_id", completeSetsRequired: false };

    const result = mapExperimentToStructureContract(canvas, pattern, facts);

    assert.equal(result.status, "mapped");
    if (result.status !== "mapped") return;
    assert.equal(result.contract.orderedAxes[0]?.identityRetained, true);
    assert.equal(result.contract.orderedAxes[0]?.sampling, "repeated_same_identity");
    assert.ok(result.notes.some((note) => note.code === "MATERIAL_CONTINUITY_RETAINED_IN_PATTERN"));
  });

  it("safe-stops when the experimental unit fact is missing instead of using condition or row counts", () => {
    const facts = independentFacts();
    facts.units[0] = { ...facts.units[0]!, role: "sample" };

    const result = mapExperimentToStructureContract(scalarCanvas(), independentPattern(), facts);

    assert.equal(result.status, "stopped");
    assert.ok(codes(result).includes("EXPERIMENTAL_UNIT_UNRESOLVED"));
  });

  it("round-trips all representable Gold-65 contracts and isolates the one nominal-axis gap", () => {
    const stops: Array<{ caseId: string; codes: string[] }> = [];
    let mapped = 0;

    for (const item of gold65().cases) {
      const contract = compileGoldCase(item);
      const canvas = experimentCanvasFromContract(contract);
      const pattern = observationPatternFromContract(contract, canvas);
      const result = mapExperimentToStructureContract(canvas, pattern, resolvedFactsFromContract(contract));
      if (result.status === "stopped") {
        stops.push({ caseId: contract.caseId, codes: result.issues.map((candidate) => candidate.code) });
        continue;
      }
      mapped += 1;
      assert.deepEqual(result.contract, contract, contract.caseId);
    }

    assert.equal(mapped, 64);
    assert.deepEqual(stops, [{ caseId: "EFS-064", codes: ["NOMINAL_AXIS_NOT_REPRESENTABLE"] }]);
  });
});
