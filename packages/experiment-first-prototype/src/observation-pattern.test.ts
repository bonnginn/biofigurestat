import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { compileGoldCase } from "./compiler.ts";
import { EXPERIMENT_CANVAS_VERSION, experimentCanvasFromContract } from "./experiment-canvas.ts";
import { loadGoldSet } from "./evaluation.ts";
import {
  OBSERVATION_PATTERN_VERSION,
  observationPatternFromContract,
  observationPatternReadinessIssues,
  validateObservationPatternSet,
  type ObservationPatternSet,
} from "./observation-pattern.ts";
import { selectSurfaceFromCanvasAndPattern, selectSurfacePlanFromCanvasAndPattern } from "./observation-surface.ts";

const scalarReadout = [{
  key: "intensity",
  label: "Intensity",
  valueType: "continuous",
  representation: "scalar" as const,
  componentKeys: ["intensity"],
  referenceRole: "none" as const,
  observationLevelKey: "dish",
  axisKeys: [],
}];

function gold65() {
  const root = resolve(process.cwd(), "../..");
  return loadGoldSet(resolve(root, "docs/evaluation/experiment-to-structure-navigation-pilot/experiment-first/stress/gold-set-65.json"));
}

describe("condition canvas plus observation pattern set", () => {
  it("projects all 65 completed contracts into valid observation pattern sets", () => {
    for (const item of gold65().cases) {
      const contract = compileGoldCase(item);
      const canvas = experimentCanvasFromContract(contract);
      const pattern = observationPatternFromContract(contract, canvas);
      assert.equal(validateObservationPatternSet(pattern, canvas), pattern);
      assert.ok(pattern.bindings.length >= contract.readouts.length);
    }
  });

  it("reproduces the frozen adaptive surface for all 65 from canvas plus observation pattern", () => {
    const mismatches = gold65().cases.flatMap((item) => {
      const contract = compileGoldCase(item);
      const canvas = experimentCanvasFromContract(contract);
      const selected = selectSurfaceFromCanvasAndPattern(canvas, observationPatternFromContract(contract, canvas)).surfaceId;
      return selected === item.natural_input_surface.surface_id ? [] : [{ caseId: item.case_id, expected: item.natural_input_surface.surface_id, selected }];
    });
    assert.deepEqual(mismatches, []);
  });

  it("creates exactly one adaptive section for every distinct Gold-65 record grain", () => {
    const multiSectionCases: string[] = [];
    for (const item of gold65().cases) {
      const contract = compileGoldCase(item);
      const canvas = experimentCanvasFromContract(contract);
      const pattern = observationPatternFromContract(contract, canvas);
      const plan = selectSurfacePlanFromCanvasAndPattern(canvas, pattern);
      assert.equal(plan.sections.length, pattern.recordSets.length, contract.caseId);
      const coveredReadouts = [...new Set(plan.sections.flatMap((section) => section.readoutKeys))].sort();
      assert.deepEqual(coveredReadouts, contract.readouts.map((readout) => readout.key).sort(), contract.caseId);
      if (plan.sections.length > 1) multiSectionCases.push(contract.caseId);
    }
    assert.deepEqual(multiSectionCases, ["EFS-065"]);
  });

  it("selects different input surfaces for the same conditions when observations differ", () => {
    const baseContract = {
      schemaVersion: "0.1.0-prototype" as const,
      caseId: "same-canvas",
      experimentDescription: "Vehicle and Drug",
      unitLevels: [{ key: "dish", label: "Dish", role: "experimental_unit" as const, parentKey: null }],
      experimentalUnitLevelKey: "dish",
      identities: [{ key: "dish_id", label: "DishID", unitLevelKey: "dish", required: true }],
      factors: [{ key: "treatment", label: "Treatment", levels: ["Vehicle", "Drug"], unitRole: "between_unit" as const, relationship: "independent" as const, ordered: false, referenceLevel: "Vehicle" }],
      matching: { kind: "independent" as const, identityKey: null, completeSetsRequired: null },
      orderedAxes: [],
      readouts: scalarReadout,
      allowedMissingness: ["not_collected" as const],
      rawObservationGrain: "one value",
    };
    const canvas = experimentCanvasFromContract(baseContract);
    const scalarPattern = observationPatternFromContract(baseContract, canvas);
    const nestedPattern: ObservationPatternSet = validateObservationPatternSet({
      ...scalarPattern,
      patternSetId: "nested",
      levels: [
        ...scalarPattern.levels,
        { key: "field", label: "Field", kind: "sampling_location", parentKey: "dish", plannedMultiplicity: { mode: "variable", suggestedCount: null } },
        { key: "cell", label: "Cell", kind: "observed_entity", parentKey: "field", plannedMultiplicity: { mode: "variable", suggestedCount: null } },
      ],
      identities: [
        ...scalarPattern.identities,
        { key: "field_id", label: "FieldID", levelKey: "field", uniquenessScopeLevelKey: "dish", purpose: "both", availability: "available", origin: "researcher_supplied" },
        { key: "cell_id", label: "CellID", levelKey: "cell", uniquenessScopeLevelKey: "field", purpose: "both", availability: "available", origin: "researcher_supplied" },
      ],
      recordSets: scalarPattern.recordSets.map((recordSet) => ({ ...recordSet, observedLevelKey: "cell" })),
    }, canvas);
    assert.equal(selectSurfaceFromCanvasAndPattern(canvas, scalarPattern).surfaceId, "factor_observation_table");
    assert.equal(selectSurfaceFromCanvasAndPattern(canvas, nestedPattern).surfaceId, "nested_observation_table");
  });

  it("rejects a same-entity sequence that uses an app row surrogate", () => {
    const canvas = {
      schemaVersion: EXPERIMENT_CANVAS_VERSION,
      experimentLabel: "time",
      dimensions: [],
      conditionCells: [{ key: "condition-1", values: {}, status: "performed" as const }],
      readouts: [{ key: "signal", label: "Signal", representation: "scalar" as const, componentLabels: ["signal"] }],
    };
    const invalid: ObservationPatternSet = {
      schemaVersion: OBSERVATION_PATTERN_VERSION,
      patternSetId: "invalid-time",
      canvasSchemaVersion: canvas.schemaVersion,
      levels: [{ key: "cell", label: "Cell", kind: "observed_entity", parentKey: null, plannedMultiplicity: { mode: "variable", suggestedCount: null } }],
      identities: [{ key: "row_id", label: "Row", levelKey: "cell", uniquenessScopeLevelKey: null, purpose: "instance_key", availability: "available", origin: "app_row_surrogate" }],
      axes: [{ key: "time", label: "Time", unit: "minute", source: { kind: "within_condition_record" }, kind: "ordered_quantity", ordering: "ordered", valuePlan: { mode: "fixed_global", values: [0, 5] } }],
      recordSets: [{ key: "records", label: "Signal", observedLevelKey: "cell", coordinatePlan: "cartesian_plan", entryAlignment: { mode: "separate_lists", identityKey: null, completeSets: null }, axisUses: [{ axisKey: "time", identityBehavior: { kind: "same_entity", retainedLevelKey: "cell", identityKey: "row_id" }, materialBehavior: "same_preparation" }] }],
      bindings: [{ readoutKey: "signal", componentKeys: ["signal"], conditionCellKeys: ["condition-1"], status: "measured", recordSetKey: "records" }],
    };
    assert.throws(() => validateObservationPatternSet(invalid, canvas), /Scientific linkage identity required/);
  });

  it("does not equate retained animal identity with same physical material", () => {
    const item = gold65().cases.find((candidate) => candidate.case_id === "EFS-047")!;
    const contract = compileGoldCase(item);
    const canvas = experimentCanvasFromContract(contract);
    const pattern = observationPatternFromContract(contract, canvas);
    assert.equal(pattern.recordSets[0]!.axisUses[0]!.materialBehavior, "unknown");
  });

  it("reports recoverable and irrecoverable scientific identities through readiness", () => {
    const item = gold65().cases.find((candidate) => candidate.case_id === "EFX-022")!;
    const contract = compileGoldCase(item);
    const canvas = experimentCanvasFromContract(contract);
    const pattern = observationPatternFromContract(contract, canvas);
    const requiredKey = pattern.recordSets[0]!.axisUses[0]!.identityBehavior;
    assert.ok(requiredKey.kind === "same_entity" || requiredKey.kind === "coordinate_within_entity");
    const identityKey = requiredKey.kind === "same_entity" || requiredKey.kind === "coordinate_within_entity" ? requiredKey.identityKey : "";
    const identity = pattern.identities.find((candidate) => candidate.key === identityKey)!;
    identity.availability = "irrecoverable";
    assert.ok(observationPatternReadinessIssues(pattern).includes(`identity_irrecoverable:${identityKey}`));
  });
});
