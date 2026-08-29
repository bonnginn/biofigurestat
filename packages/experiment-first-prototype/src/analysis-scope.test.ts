import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANALYSIS_SCOPE_VERSION,
  createAnalysisScope,
  scopeResolvedDesignFacts,
} from "./analysis-scope.ts";
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
  RESOLVED_DESIGN_FACTS_VERSION,
  mapExperimentToStructureContract,
  type ResolvedDesignFacts,
} from "./forward-mapper.ts";

function sparseExperiment() {
  const plan: ExperimentPlanAnswers = {
    schemaVersion: EXPERIMENT_PLAN_ANSWER_VERSION,
    planId: "scope-plan",
    experimentLabel: "siRNA by Dox ciliation experiment",
    dimensions: [
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
    ],
    combinationPlan: {
      kind: "explicit",
      cells: [{ values: { sirna: "control", dox: "plus" }, status: "not_performed_by_design" }],
      unlistedStatus: "performed",
    },
    measurements: [{
      key: "cilia",
      label: "Ciliated cells",
      recordForm: "positive_and_total",
      componentLabels: ["Ciliated", "Total"],
    }],
  };
  const canvasResult = buildExperimentCanvas(plan);
  assert.equal(canvasResult.status, "mapped");
  if (canvasResult.status !== "mapped") throw new Error("Expected Canvas");
  const canvas = canvasResult.canvas;

  const observationAnswers: ObservationInterviewAnswers = {
    schemaVersion: OBSERVATION_INTERVIEW_VERSION,
    answerSetId: "scope-observations",
    canvasSchemaVersion: canvas.schemaVersion,
    items: [
      { key: "dish", label: "Culture dish", kind: "biological_or_experimental_entity", parentKey: null, multiplicity: { kind: "from_input" } },
      { key: "field", label: "Microscope field", kind: "sampling_location", parentKey: "dish", multiplicity: { kind: "variable", suggestedCount: null } },
    ],
    identities: [
      { key: "dish_id", label: "Dish ID", itemKey: "dish", uniquenessScopeItemKey: null, availability: { state: "to_be_collected", origin: "app_assigned_before_entry" } },
      { key: "field_id", label: "Field ID", itemKey: "field", uniquenessScopeItemKey: "dish", availability: { state: "to_be_collected", origin: "app_assigned_before_entry" } },
    ],
    axes: [],
    readouts: [{
      readoutKey: "cilia",
      observedItemKey: "field",
      alignment: { kind: "separate_entities" },
      axisUses: [],
      coordinatePlan: "sparse_explicit",
      coverage: { kind: "all_performed" },
    }],
  };
  const patternResult = mapObservationInterviewToPattern(canvas, observationAnswers);
  assert.equal(patternResult.status, "mapped");
  if (patternResult.status !== "mapped") throw new Error("Expected PatternSet");

  const facts: ResolvedDesignFacts = {
    schemaVersion: RESOLVED_DESIGN_FACTS_VERSION,
    caseId: "SCOPE-SIRNA-DOX",
    experimentDescription: "Grouped siRNA sequences crossed with Dox; control plus was not performed.",
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
    rawObservationGrain: "one row per microscope field with parent Dish ID",
  };
  return { canvas, pattern: patternResult.pattern, facts };
}

describe("comparison-scoped analysis projection", () => {
  it("maps a complete Gene A #1 Dox comparison while the sparse full experiment remains stopped", () => {
    const source = sparseExperiment();
    const fullProjection = mapExperimentToStructureContract(source.canvas, source.pattern, source.facts);
    assert.equal(fullProjection.status, "stopped");

    const scope = createAnalysisScope(source.canvas, source.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "gene-a-1-dox",
      conditionCellKeys: ["sirna-gene_a_1__dox-minus", "sirna-gene_a_1__dox-plus"],
      readoutKeys: ["cilia"],
    });
    assert.equal(scope.status, "ready");
    if (scope.status !== "ready") return;
    assert.deepEqual(scope.provenance.valueGroupContext, [{
      dimensionKey: "sirna",
      valueKey: "gene_a_1",
      groupKey: "gene_a",
      groupLabel: "Gene A",
    }]);
    assert.deepEqual(scope.provenance.excludedConditionCellKeys.sort(), [
      "sirna-control__dox-minus",
      "sirna-control__dox-plus",
    ]);

    const scopedFacts = scopeResolvedDesignFacts(source.facts, scope);
    assert.equal(scopedFacts.status, "ready");
    if (scopedFacts.status !== "ready") return;
    const projection = mapExperimentToStructureContract(
      scope.canvas,
      scope.pattern,
      scopedFacts.facts,
    );
    assert.equal(projection.status, "mapped");
    if (projection.status !== "mapped") return;
    assert.deepEqual(projection.contract.factors.map((factor) => [factor.label, factor.levels]), [
      ["Dox", ["−", "+"]],
    ]);
  });

  it("does not reinterpret all performed cells as a complete factorial", () => {
    const source = sparseExperiment();
    const scope = createAnalysisScope(source.canvas, source.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "unsafe-full-effect",
      conditionCellKeys: [
        "sirna-control__dox-minus",
        "sirna-gene_a_1__dox-minus",
        "sirna-gene_a_1__dox-plus",
      ],
      readoutKeys: ["cilia"],
    });
    assert.equal(scope.status, "safe_stop");
    if (scope.status !== "safe_stop") return;
    assert.deepEqual(scope.issues.map((candidate) => candidate.code), ["SELECTED_SCOPE_NOT_CARTESIAN"]);
    assert.match(scope.issues[0]!.message, /sirna=control\|dox=plus/);
  });

  it("refuses a condition that was not performed", () => {
    const source = sparseExperiment();
    const scope = createAnalysisScope(source.canvas, source.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "invented-control",
      conditionCellKeys: ["sirna-control__dox-minus", "sirna-control__dox-plus"],
      readoutKeys: ["cilia"],
    });
    assert.equal(scope.status, "safe_stop");
    if (scope.status !== "safe_stop") return;
    assert.ok(scope.issues.some((candidate) => candidate.code === "SELECTED_CONDITION_NOT_PERFORMED"));
    assert.ok(scope.issues.some((candidate) => candidate.code === "SELECTED_READOUT_NOT_MEASURED"));
  });

  it("rejects duplicate and unknown scope requests deterministically", () => {
    const source = sparseExperiment();
    const duplicate = createAnalysisScope(source.canvas, source.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "duplicate",
      conditionCellKeys: ["sirna-control__dox-minus", "sirna-control__dox-minus"],
      readoutKeys: ["cilia"],
    });
    assert.equal(duplicate.status, "safe_stop");
    if (duplicate.status === "safe_stop") assert.deepEqual(duplicate.issues.map((candidate) => candidate.code), ["INVALID_SCOPE_REQUEST"]);

    const unknown = createAnalysisScope(source.canvas, source.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "unknown",
      conditionCellKeys: ["sirna-control__dox-minus", "missing-condition"],
      readoutKeys: ["missing-readout"],
    });
    assert.equal(unknown.status, "safe_stop");
    if (unknown.status !== "safe_stop") return;
    assert.ok(unknown.issues.some((candidate) => candidate.code === "SELECTED_CONDITION_UNKNOWN"));
    assert.ok(unknown.issues.some((candidate) => candidate.code === "SELECTED_READOUT_UNKNOWN"));
  });

  it("leaves the full Canvas, PatternSet, and resolved facts byte-for-byte unchanged", () => {
    const source = sparseExperiment();
    const before = JSON.stringify(source);
    const scope = createAnalysisScope(source.canvas, source.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "immutable",
      conditionCellKeys: ["sirna-gene_a_1__dox-minus", "sirna-gene_a_1__dox-plus"],
      readoutKeys: ["cilia"],
    });
    assert.equal(scope.status, "ready");
    if (scope.status !== "ready") return;
    const scopedFacts = scopeResolvedDesignFacts(source.facts, scope);
    assert.equal(scopedFacts.status, "ready");
    if (scopedFacts.status !== "ready") return;
    scope.canvas.readouts[0]!.componentLabels[0] = "mutated component";
    scope.pattern.levels[0]!.label = "mutated level";
    scope.pattern.identities[0]!.label = "mutated identity";
    scope.pattern.bindings[0]!.componentKeys[0] = "mutated key";
    scopedFacts.facts.units[0]!.parentLevelKeys.push("mutated-parent");
    scopedFacts.facts.factors[0]!.referenceValueKey = "mutated-reference";
    scopedFacts.facts.readouts[0]!.valueType = "mutated-type";
    assert.equal(JSON.stringify(source), before);
  });

  it("does not flatten a comparison that spans multiple scientific value groups", () => {
    const source = sparseExperiment();
    const canvas = JSON.parse(JSON.stringify(source.canvas)) as typeof source.canvas;
    const pattern = JSON.parse(JSON.stringify(source.pattern)) as typeof source.pattern;
    canvas.dimensions[0]!.groups!.push({ key: "gene_b", label: "Gene B" });
    canvas.dimensions[0]!.values.push({ key: "gene_b_1", label: "B-seq-1", parentValueKey: null, groupKey: "gene_b" });
    canvas.conditionCells.push(
      { key: "sirna-gene_b_1__dox-minus", values: { sirna: "gene_b_1", dox: "minus" }, status: "performed" },
      { key: "sirna-gene_b_1__dox-plus", values: { sirna: "gene_b_1", dox: "plus" }, status: "performed" },
    );
    const measured = pattern.bindings.find((binding) => binding.status === "measured")!;
    measured.conditionCellKeys.push("sirna-gene_b_1__dox-minus", "sirna-gene_b_1__dox-plus");

    const scope = createAnalysisScope(canvas, pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "two-target-groups",
      conditionCellKeys: [
        "sirna-gene_a_1__dox-minus",
        "sirna-gene_a_1__dox-plus",
        "sirna-gene_b_1__dox-minus",
        "sirna-gene_b_1__dox-plus",
      ],
      readoutKeys: ["cilia"],
    });
    assert.equal(scope.status, "safe_stop");
    if (scope.status !== "safe_stop") return;
    assert.deepEqual(scope.issues.map((candidate) => candidate.code), ["GROUPED_SCOPE_NOT_REPRESENTABLE"]);
  });

  it("uses the requested scope ID in the projected case ID", () => {
    const source = sparseExperiment();
    const makeScope = (scopeId: string) => createAnalysisScope(source.canvas, source.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId,
      conditionCellKeys: ["sirna-gene_a_1__dox-minus", "sirna-gene_a_1__dox-plus"],
      readoutKeys: ["cilia"],
    });
    const first = makeScope("comparison-a");
    const second = makeScope("comparison-b");
    assert.equal(first.status, "ready");
    assert.equal(second.status, "ready");
    if (first.status !== "ready" || second.status !== "ready") return;
    const firstFacts = scopeResolvedDesignFacts(source.facts, first);
    const secondFacts = scopeResolvedDesignFacts(source.facts, second);
    assert.equal(firstFacts.status, "ready");
    assert.equal(secondFacts.status, "ready");
    if (firstFacts.status !== "ready" || secondFacts.status !== "ready") return;
    assert.equal(firstFacts.facts.caseId, "SCOPE-SIRNA-DOX--scope-comparison-a");
    assert.equal(secondFacts.facts.caseId, "SCOPE-SIRNA-DOX--scope-comparison-b");
  });

  it("allows one condition when the comparison varies on a within-condition time axis", () => {
    const canvasResult = buildExperimentCanvas({
      schemaVersion: EXPERIMENT_PLAN_ANSWER_VERSION,
      planId: "one-condition-time",
      experimentLabel: "One-condition live-cell time course",
      dimensions: [],
      combinationPlan: { kind: "all_performed" },
      measurements: [{ key: "signal", label: "Signal", recordForm: "one_number", componentLabels: [] }],
    });
    assert.equal(canvasResult.status, "mapped");
    if (canvasResult.status !== "mapped") return;
    const canvas = canvasResult.canvas;
    const mapped = mapObservationInterviewToPattern(canvas, {
      schemaVersion: OBSERVATION_INTERVIEW_VERSION,
      answerSetId: "one-condition-time-pattern",
      canvasSchemaVersion: canvas.schemaVersion,
      items: [{ key: "cell", label: "Cell", kind: "observed_entity", parentKey: null, multiplicity: { kind: "from_input" } }],
      identities: [{ key: "cell_id", label: "Cell ID", itemKey: "cell", uniquenessScopeItemKey: null, availability: { state: "available", origin: "instrument_supplied" } }],
      axes: [{
        key: "time",
        label: "Time",
        unit: "min",
        source: { kind: "within_condition_record" },
        kind: "ordered_quantity",
        ordering: "ordered",
        valuePlan: { mode: "fixed_global", values: [0, 10, 20] },
      }],
      readouts: [{
        readoutKey: "signal",
        observedItemKey: "cell",
        alignment: { kind: "separate_entities" },
        axisUses: [{ axisKey: "time", entity: { kind: "same_entity", retainedItemKey: "cell", identityKey: "cell_id" }, material: "same_preparation" }],
        coordinatePlan: "cartesian_plan",
        coverage: { kind: "all_performed" },
      }],
    });
    assert.equal(mapped.status, "mapped");
    if (mapped.status !== "mapped") return;
    const scope = createAnalysisScope(canvas, mapped.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "time-only",
      conditionCellKeys: ["condition-1"],
      readoutKeys: ["signal"],
    });
    assert.equal(scope.status, "ready");
    if (scope.status !== "ready") return;
    assert.equal(scope.canvas.dimensions.length, 0);
    assert.deepEqual(scope.pattern.axes[0]!.valuePlan, { mode: "fixed_global", values: [0, 10, 20] });
  });

  it("trims a Canvas-derived ordered axis to the selected condition values", () => {
    const canvasResult = buildExperimentCanvas({
      schemaVersion: EXPERIMENT_PLAN_ANSWER_VERSION,
      planId: "ordered-condition",
      experimentLabel: "Destructive time collection",
      dimensions: [{
        key: "time",
        label: "Time",
        kind: "ordered_quantity",
        groups: [],
        values: [
          { key: "t0", label: "0", groupKey: null },
          { key: "t5", label: "5", groupKey: null },
          { key: "t10", label: "10", groupKey: null },
        ],
      }],
      combinationPlan: { kind: "all_performed" },
      measurements: [{ key: "signal", label: "Signal", recordForm: "one_number", componentLabels: [] }],
    });
    assert.equal(canvasResult.status, "mapped");
    if (canvasResult.status !== "mapped") return;
    const canvas = canvasResult.canvas;
    const mapped = mapObservationInterviewToPattern(canvas, {
      schemaVersion: OBSERVATION_INTERVIEW_VERSION,
      answerSetId: "ordered-condition-pattern",
      canvasSchemaVersion: canvas.schemaVersion,
      items: [{ key: "dish", label: "Dish", kind: "biological_or_experimental_entity", parentKey: null, multiplicity: { kind: "from_input" } }],
      identities: [{ key: "dish_id", label: "Dish ID", itemKey: "dish", uniquenessScopeItemKey: null, availability: { state: "to_be_collected", origin: "app_assigned_before_entry" } }],
      axes: [{
        key: "time",
        label: "Time",
        unit: "h",
        source: { kind: "canvas_dimension", dimensionKey: "time" },
        kind: "ordered_quantity",
        ordering: "ordered",
        valuePlan: null,
      }],
      readouts: [{
        readoutKey: "signal",
        observedItemKey: "dish",
        alignment: { kind: "separate_entities" },
        axisUses: [{ axisKey: "time", entity: { kind: "distinct_entity_each_value", variedItemKey: "dish", sharedParentItemKey: null }, material: "new_material_each_value" }],
        coordinatePlan: "cartesian_plan",
        coverage: { kind: "all_performed" },
      }],
    });
    assert.equal(mapped.status, "mapped");
    if (mapped.status !== "mapped") return;
    const scope = createAnalysisScope(canvas, mapped.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "early-times",
      conditionCellKeys: ["time-t0", "time-t5"],
      readoutKeys: ["signal"],
    });
    assert.equal(scope.status, "ready");
    if (scope.status !== "ready") return;
    assert.deepEqual(scope.canvas.dimensions[0]!.values.map((value) => value.label), ["0", "5"]);
    assert.deepEqual(scope.pattern.axes[0]!.valuePlan, { mode: "fixed_global", values: ["0", "5"] });
  });

  it("prunes an unrelated observation grain when one readout is selected", () => {
    const canvasResult = buildExperimentCanvas({
      schemaVersion: EXPERIMENT_PLAN_ANSWER_VERSION,
      planId: "multi-grain-scope",
      experimentLabel: "Dish and Cell measurements",
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
      measurements: [
        { key: "dish_signal", label: "Dish signal", recordForm: "one_number", componentLabels: [] },
        { key: "cell_area", label: "Cell area", recordForm: "one_number", componentLabels: [] },
      ],
    });
    assert.equal(canvasResult.status, "mapped");
    if (canvasResult.status !== "mapped") return;
    const canvas = canvasResult.canvas;
    const mapped = mapObservationInterviewToPattern(canvas, {
      schemaVersion: OBSERVATION_INTERVIEW_VERSION,
      answerSetId: "multi-grain-pattern",
      canvasSchemaVersion: canvas.schemaVersion,
      items: [
        { key: "dish", label: "Dish", kind: "biological_or_experimental_entity", parentKey: null, multiplicity: { kind: "from_input" } },
        { key: "cell", label: "Cell", kind: "observed_entity", parentKey: "dish", multiplicity: { kind: "variable", suggestedCount: null } },
      ],
      identities: [
        { key: "dish_id", label: "Dish ID", itemKey: "dish", uniquenessScopeItemKey: null, availability: { state: "to_be_collected", origin: "app_assigned_before_entry" } },
        { key: "cell_id", label: "Cell ID", itemKey: "cell", uniquenessScopeItemKey: "dish", availability: { state: "to_be_collected", origin: "app_assigned_before_entry" } },
      ],
      axes: [],
      readouts: [
        { readoutKey: "dish_signal", observedItemKey: "dish", alignment: { kind: "separate_entities" }, axisUses: [], coordinatePlan: "sparse_explicit", coverage: { kind: "all_performed" } },
        { readoutKey: "cell_area", observedItemKey: "cell", alignment: { kind: "separate_entities" }, axisUses: [], coordinatePlan: "sparse_explicit", coverage: { kind: "all_performed" } },
      ],
    });
    assert.equal(mapped.status, "mapped");
    if (mapped.status !== "mapped") return;
    const scope = createAnalysisScope(canvas, mapped.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "dish-only",
      conditionCellKeys: ["treatment-vehicle", "treatment-drug"],
      readoutKeys: ["dish_signal"],
    });
    assert.equal(scope.status, "ready");
    if (scope.status !== "ready") return;
    assert.deepEqual(scope.pattern.recordSets.map((recordSet) => recordSet.observedLevelKey), ["dish"]);
    assert.deepEqual(scope.pattern.levels.map((level) => level.key), ["dish"]);
    assert.deepEqual(scope.pattern.identities.map((identity) => identity.key), ["dish_id"]);

    const facts: ResolvedDesignFacts = {
      schemaVersion: RESOLVED_DESIGN_FACTS_VERSION,
      caseId: "MULTI-GRAIN",
      experimentDescription: "Dish-level signal and nested Cell area were both measured.",
      experimentalUnitLevelKey: "dish",
      units: [
        { levelKey: "dish", role: "experimental_unit", parentLevelKeys: [] },
        { levelKey: "cell", role: "subsample", parentLevelKeys: ["dish"] },
      ],
      factors: [{ dimensionKey: "treatment", unitRole: "between_unit", relationship: "independent", ordered: false, referenceValueKey: "vehicle" }],
      matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
      readouts: [
        { readoutKey: "dish_signal", valueType: "continuous", referenceRole: "none" },
        { readoutKey: "cell_area", valueType: "continuous", referenceRole: "none" },
      ],
      allowedMissingness: ["not_collected", "unknown"],
      rawObservationGrain: "one row per Dish for dish signal or one row per Cell for cell area",
    };
    const scopedFacts = scopeResolvedDesignFacts(facts, scope);
    assert.equal(scopedFacts.status, "ready");
    if (scopedFacts.status !== "ready") return;
    assert.deepEqual(scopedFacts.facts.units.map((unit) => unit.levelKey), ["dish"]);
    assert.deepEqual(scopedFacts.facts.readouts.map((readout) => readout.readoutKey), ["dish_signal"]);
    assert.match(scopedFacts.facts.rawObservationGrain, /Dish/);
    assert.doesNotMatch(scopedFacts.facts.rawObservationGrain, /Cell/);
    assert.equal(scopedFacts.provenance.rawObservationGrain, "generated_from_scoped_pattern");
    assert.equal(mapExperimentToStructureContract(scope.canvas, scope.pattern, scopedFacts.facts).status, "mapped");
  });

  it("requests a scoped matching fact instead of copying mixed matching through semantic pruning", () => {
    const source = sparseExperiment();
    const scope = createAnalysisScope(source.canvas, source.pattern, {
      schemaVersion: ANALYSIS_SCOPE_VERSION,
      scopeId: "matching-must-be-resolved",
      conditionCellKeys: ["sirna-gene_a_1__dox-minus", "sirna-gene_a_1__dox-plus"],
      readoutKeys: ["cilia"],
    });
    assert.equal(scope.status, "ready");
    if (scope.status !== "ready") return;
    const mixedFacts: ResolvedDesignFacts = {
      ...source.facts,
      matching: { kind: "mixed", identityKey: "dish_id", completeSetsRequired: false },
    };
    const unresolved = scopeResolvedDesignFacts(mixedFacts, scope);
    assert.equal(unresolved.status, "needs_information");
    if (unresolved.status !== "needs_information") return;
    assert.deepEqual(unresolved.issues.map((candidate) => candidate.code), ["SCOPED_MATCHING_REQUIRED"]);

    const resolved = scopeResolvedDesignFacts(mixedFacts, scope, {
      matching: {
        value: { kind: "independent", identityKey: null, completeSetsRequired: null },
        provenance: "explicit_scoped_researcher_fact",
      },
    });
    assert.equal(resolved.status, "ready");
    if (resolved.status !== "ready") return;
    assert.equal(resolved.provenance.matching, "explicit_scoped_researcher_fact");
    assert.equal(resolved.facts.matching.kind, "independent");
    assert.equal(mapExperimentToStructureContract(scope.canvas, scope.pattern, resolved.facts).status, "mapped");
  });

  it("accepts exactly the complete rectangular subsets of a two-by-three condition plan", () => {
    const canvasResult = buildExperimentCanvas({
      schemaVersion: EXPERIMENT_PLAN_ANSWER_VERSION,
      planId: "rectangle-exhaustive",
      experimentLabel: "Two-by-three condition plan",
      dimensions: [
        {
          key: "drug",
          label: "Drug",
          kind: "intervention",
          groups: [],
          values: [
            { key: "vehicle", label: "Vehicle", groupKey: null },
            { key: "treated", label: "Treated", groupKey: null },
          ],
        },
        {
          key: "dose",
          label: "Dose",
          kind: "ordered_quantity",
          groups: [],
          values: [
            { key: "low", label: "Low", groupKey: null },
            { key: "mid", label: "Mid", groupKey: null },
            { key: "high", label: "High", groupKey: null },
          ],
        },
      ],
      combinationPlan: { kind: "all_performed" },
      measurements: [{ key: "signal", label: "Signal", recordForm: "one_number", componentLabels: [] }],
    });
    assert.equal(canvasResult.status, "mapped");
    if (canvasResult.status !== "mapped") return;
    const canvas = canvasResult.canvas;
    const mapped = mapObservationInterviewToPattern(canvas, {
      schemaVersion: OBSERVATION_INTERVIEW_VERSION,
      answerSetId: "rectangle-exhaustive-pattern",
      canvasSchemaVersion: canvas.schemaVersion,
      items: [{ key: "dish", label: "Dish", kind: "biological_or_experimental_entity", parentKey: null, multiplicity: { kind: "from_input" } }],
      identities: [{ key: "dish_id", label: "Dish ID", itemKey: "dish", uniquenessScopeItemKey: null, availability: { state: "to_be_collected", origin: "app_assigned_before_entry" } }],
      axes: [],
      readouts: [{ readoutKey: "signal", observedItemKey: "dish", alignment: { kind: "separate_entities" }, axisUses: [], coordinatePlan: "sparse_explicit", coverage: { kind: "all_performed" } }],
    });
    assert.equal(mapped.status, "mapped");
    if (mapped.status !== "mapped") return;

    for (let mask = 1; mask < 2 ** canvas.conditionCells.length; mask += 1) {
      const selected = canvas.conditionCells.filter((_cell, index) => (mask & (1 << index)) !== 0);
      const drugValues = new Set(selected.map((cell) => cell.values.drug));
      const doseValues = new Set(selected.map((cell) => cell.values.dose));
      const isCompleteRectangle = selected.length === drugValues.size * doseValues.size;
      const scope = createAnalysisScope(canvas, mapped.pattern, {
        schemaVersion: ANALYSIS_SCOPE_VERSION,
        scopeId: `subset-${mask}`,
        conditionCellKeys: selected.map((cell) => cell.key),
        readoutKeys: ["signal"],
      });
      assert.equal(scope.status === "ready", isCompleteRectangle, `unexpected result for subset ${mask}`);
      if (!isCompleteRectangle && scope.status === "safe_stop") {
        assert.deepEqual(scope.issues.map((candidate) => candidate.code), ["SELECTED_SCOPE_NOT_CARTESIAN"]);
      }
    }
  });
});
