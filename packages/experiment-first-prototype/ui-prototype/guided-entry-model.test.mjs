import assert from "node:assert/strict";
import test from "node:test";
import {
  GUIDED_ENTRY_VERSION,
  buildNestedLevels,
  buildGuidedPrototypeDefinition,
  buildPastedConditionDefinition,
  comparisonScopeSuggestions,
  deriveObservationGuideShape,
  evaluateSourceLinkage,
  mapObservationGuide,
  parseGuidedValueEntries,
  parseGuidedValues,
  prepareGuideExampleForVisibleStep,
} from "./guided-entry-model.js";
import { CONDITION_STATUS, READOUT_KIND } from "./semantic-model.js";

function answers(overrides = {}) {
  return {
    schemaVersion: GUIDED_ENTRY_VERSION,
    experimentLabel: "siRNA and Dox",
    dimensions: [
      { label: "siRNA", kind: "nominal", valuesText: "control\nGene A: #1, #2, #3\nGene B: #1, #2, #3" },
      { label: "Dox", kind: "nominal", valuesText: "−\n+" },
    ],
    combinationAnswer: "all_performed",
    measurement: { label: "Ciliated cells", form: "positive_total" },
    observation: { shape: "multiple_inside", sequenceIdentity: null, axisValuesText: "" },
    ...overrides,
  };
}

test("group headings do not become selectable condition values", () => {
  const parsed = parseGuidedValues("control\nGene A: #1, #2, #3\nGene B: #1, #2, #3", "sirna");
  assert.equal(parsed.status, "ready");
  assert.equal(parsed.values.length, 7);
  assert.deepEqual(parsed.groups.map((group) => group.label), ["Gene A", "Gene B"]);
  assert.equal(parsed.values.some((value) => value.label === "Gene A"), false);
  assert.deepEqual(parsed.values.filter((value) => value.groupLabel === "Gene A").map((value) => value.label), ["#1", "#2", "#3"]);
});

test("structured simple condition labels keep punctuation instead of becoming groups", () => {
  const parsed = parseGuidedValueEntries([
    { label: "Time: 0 h", groupLabel: null },
    { label: "Ratio：baseline", groupLabel: null },
  ], "treatment");
  assert.equal(parsed.status, "ready");
  assert.deepEqual(parsed.groups, []);
  assert.deepEqual(parsed.values.map((value) => value.label), ["Time: 0 h", "Ratio：baseline"]);
});

test("structured grouped entries retain headings while only members become values", () => {
  const parsed = parseGuidedValueEntries([
    { label: "Vehicle", groupLabel: null },
    { label: "#1", groupLabel: "Gene A" },
    { label: "#2", groupLabel: "Gene A" },
    { label: "#1", groupLabel: "Gene B" },
  ], "sirna");
  assert.equal(parsed.status, "ready");
  assert.deepEqual(parsed.groups.map((group) => group.label), ["Gene A", "Gene B"]);
  assert.deepEqual(parsed.values.map((value) => value.displayLabel), ["Vehicle", "Gene A #1", "Gene A #2", "Gene B #1"]);
});

test("guided hierarchy keeps Dish to Field to Cell order without planned counts", () => {
  assert.deepEqual(buildNestedLevels(["Dish", "Field", "Cell"]), [
    { key: "nest_0", label: "Dish" },
    { key: "nest_1", label: "Field" },
    { key: "nest_2", label: "Cell" },
  ]);
});

test("duplicate concrete conditions stop instead of silently merging", () => {
  const parsed = parseGuidedValues("Vehicle\nVehicle", "treatment");
  assert.equal(parsed.status, "needs_information");
  assert.ok(parsed.issues.some((issue) => issue.code === "DUPLICATE_VALUE"));
});

test("an unanswered condition-change count stops at the first-use question", () => {
  const result = buildGuidedPrototypeDefinition(answers({ conditionChangeCount: "unknown" }));
  assert.equal(result.status, "needs_information");
  assert.ok(result.issues.some((issue) => issue.code === "CONDITION_CHANGE_COUNT_REQUIRED"));
});

test("three or more condition dimensions stop without dropping a dimension", () => {
  const result = buildGuidedPrototypeDefinition(answers({ conditionChangeCount: "3plus" }));
  assert.equal(result.status, "needs_information");
  assert.ok(result.issues.some((issue) => issue.code === "TOO_MANY_DIMENSIONS_FOR_WIRE"));
});

test("multiple related source values become explicit raw fields without collapsing them", () => {
  const result = buildGuidedPrototypeDefinition(answers({
    measurement: {
      label: "ERK phosphorylation",
      form: "multiple_related",
      relatedFieldsText: "pERK\ntotal ERK\ntotal protein",
    },
  }));
  assert.equal(result.status, "ready");
  const readout = result.definition.fixture.readouts[0];
  assert.equal(readout.kind, READOUT_KIND.RELATED_VALUES);
  assert.deepEqual(readout.fields.map((field) => field.label), ["pERK", "total ERK", "total protein"]);
  assert.equal(readout.graphField, readout.fields[0].key);
  assert.equal("valueField" in readout, false);
});

test("multiple related source values require two distinct named fields", () => {
  const oneField = buildGuidedPrototypeDefinition(answers({
    measurement: { label: "ERK", form: "multiple_related", relatedFieldsText: "pERK" },
  }));
  assert.equal(oneField.status, "needs_information");
  assert.ok(oneField.issues.some((issue) => issue.code === "RELATED_FIELDS_REQUIRED"));

  const duplicate = buildGuidedPrototypeDefinition(answers({
    measurement: { label: "ERK", form: "multiple_related", relatedFieldsText: "pERK\npERK" },
  }));
  assert.equal(duplicate.status, "needs_information");
  assert.ok(duplicate.issues.some((issue) => issue.code === "RELATED_FIELD_DUPLICATE"));
});

test("guided answers build a two-dimensional condition matrix and nested typed entry", () => {
  const result = buildGuidedPrototypeDefinition(answers());
  assert.equal(result.status, "ready");
  assert.equal(result.definition.fixture.conditionCells.length, 14);
  assert.equal(result.definition.defaultPattern, "nested_records");
  assert.equal(result.definition.fixture.readouts[0].kind, "positive_total");
  assert.ok(result.definition.fixture.conditionCells.every((cell) => cell.status === CONDITION_STATUS.PERFORMED));
});

test("blank optional experiment title is generated without blocking guided entry", () => {
  const result = buildGuidedPrototypeDefinition(answers({ experimentLabel: "" }));
  assert.equal(result.status, "ready");
  assert.equal(result.definition.title, "siRNA × DoxでのCiliated cells");
  assert.equal(result.definition.titleSource, "generated");
  assert.match(result.definition.fixture.fixtureId, /^guided-/);
});

test("review-each never assumes an unconfirmed combination was performed", () => {
  const result = buildGuidedPrototypeDefinition(answers({ combinationAnswer: "review_each" }));
  assert.equal(result.status, "ready");
  assert.ok(result.definition.fixture.conditionCells.every((cell) => cell.status === CONDITION_STATUS.UNKNOWN));
});

test("the condition canvas can be built before observation questions are answered", () => {
  const result = buildGuidedPrototypeDefinition(answers({
    experimentLabel: "pending observation",
    dimensions: [{ label: "Treatment", kind: "nominal", valuesText: "Control\nDrug" }],
    combinationAnswer: "unknown",
    measurement: { label: "Signal", form: "scalar" },
    observation: { shape: "unknown" },
  }));
  assert.equal(result.status, "ready");
  assert.equal(result.definition.observationPending, true);
  assert.equal(result.definition.combinationPending, true);
  assert.ok(result.definition.fixture.conditionCells.every((cell) => cell.status === CONDITION_STATUS.UNKNOWN));
});

test("visible examples never answer material flow or observation shape for the researcher", () => {
  const examples = [
    {
      experimentLabel: "Drug",
      dimensions: [{ label: "Treatment", valuesText: "Control\nDrug", kind: "nominal" }],
      combinationAnswer: "all_performed",
      measurement: { label: "Signal", form: "scalar" },
      observation: { shape: "one_each", outerLabel: "dish", sourceRelation: "separate" },
    },
    {
      experimentLabel: "Microscopy",
      dimensions: [{ label: "Treatment", valuesText: "Control\nDrug", kind: "nominal" }],
      combinationAnswer: "all_performed",
      measurement: { label: "Positive cells", form: "positive_total" },
      observation: { shape: "multiple_inside", childLabels: "Field, Cell" },
    },
    {
      experimentLabel: "Time course",
      dimensions: [{ label: "Treatment", valuesText: "Control\nDrug", kind: "nominal" }],
      combinationAnswer: "all_performed",
      measurement: { label: "Signal", form: "scalar" },
      observation: { shape: "sequence", hasSequence: true, sequenceIdentity: "same" },
    },
  ];

  for (const raw of examples) {
    const visible = prepareGuideExampleForVisibleStep(raw);
    assert.deepEqual(visible.observation, {
      shape: "unknown",
      sourceRelation: "unknown",
      sourceLinkage: "unknown",
      sequenceIdentity: "unknown",
    });
    const result = buildGuidedPrototypeDefinition({
      schemaVersion: GUIDED_ENTRY_VERSION,
      conditionChangeCount: String(visible.dimensions.length),
      ...visible,
    });
    assert.equal(result.status, "ready");
    assert.equal(result.definition.observationPending, true);
  }
});

test("matched structures require recoverable source linkage and never infer it from row order", () => {
  assert.deepEqual(evaluateSourceLinkage({ sourceRelation: "separate" }), {
    status: "ready",
    required: false,
  });
  assert.deepEqual(evaluateSourceLinkage({ sourceRelation: "shared_source_separate_samples" }), {
    status: "needs_information",
    questionId: "ASK_SOURCE_LINKAGE",
  });
  assert.deepEqual(evaluateSourceLinkage({
    sourceRelation: "shared_source_separate_samples",
    sourceLinkage: "existing_id",
  }), {
    status: "ready",
    required: true,
    mode: "existing_id",
  });
  const irrecoverable = evaluateSourceLinkage({
    sourceRelation: "literal_same_entity",
    sourceLinkage: "irrecoverable",
  });
  assert.equal(irrecoverable.status, "safe_unsupported");
  assert.equal(irrecoverable.questionId, "ASK_SOURCE_LINKAGE");
});

test("observation shape remains unknown until the within-source layout is explicitly selected", () => {
  assert.equal(deriveObservationGuideShape({ sourceLabel: "culture dish" }), "unknown");
  assert.equal(deriveObservationGuideShape({ sourceLabel: "", layout: "one_each" }), "unknown");
  assert.equal(deriveObservationGuideShape({ sourceLabel: "culture dish", layout: "one_each" }), "one_each");
  assert.equal(deriveObservationGuideShape({ sourceLabel: "culture dish", layout: "multiple_inside" }), "multiple_inside");
  assert.equal(deriveObservationGuideShape({ sourceLabel: "Cell", layout: "sequence" }), "sequence");
  assert.equal(deriveObservationGuideShape({ sourceLabel: "dish", layout: "combined" }), "combined");
  assert.deepEqual(mapObservationGuide({ shape: deriveObservationGuideShape({ sourceLabel: "dish" }) }), {
    status: "needs_information",
    questionId: "ASK_RECORD_SHAPE",
  });
});

test("sequence asks only whether the same entity continues before choosing a surface", () => {
  assert.deepEqual(mapObservationGuide({ shape: "sequence", sequenceIdentity: "unknown" }), {
    status: "needs_information",
    questionId: "ASK_SEQUENCE_IDENTITY",
  });
  assert.equal(mapObservationGuide({ shape: "sequence", sequenceIdentity: "same" }).patternId, "same_entity_sequence");
  assert.equal(mapObservationGuide({ shape: "sequence", sequenceIdentity: "different" }).patternId, "distinct_entity_sequence");
});

test("condition-linked observations distinguish the literal entity, shared source, and type only", () => {
  assert.deepEqual(mapObservationGuide({ shape: "same_across_conditions" }), {
    status: "needs_information",
    questionId: "ASK_CONDITION_IDENTITY_KIND",
  });
  assert.deepEqual(mapObservationGuide({ shape: "same_across_conditions", identityKind: "unknown" }), {
    status: "needs_information",
    questionId: "ASK_CONDITION_IDENTITY_KIND",
  });
  assert.equal(
    mapObservationGuide({ shape: "same_across_conditions", identityKind: "literal_same_entity" }).patternId,
    "same_entity_conditions",
  );
  assert.equal(
    mapObservationGuide({ shape: "same_across_conditions", identityKind: "shared_source_separate_samples" }).patternId,
    "matched_source_conditions",
  );
  assert.equal(
    mapObservationGuide({ shape: "same_across_conditions", identityKind: "same_type_only" }).patternId,
    "one_per_record",
  );
});

test("one value per condition still honors an explicit cross-condition identity", () => {
  assert.equal(
    mapObservationGuide({ shape: "one_each", identityKind: "literal_same_entity" }).patternId,
    "same_entity_conditions",
  );
  assert.equal(
    mapObservationGuide({ shape: "one_each", identityKind: "shared_source_separate_samples" }).patternId,
    "matched_source_conditions",
  );
  assert.equal(
    mapObservationGuide({ shape: "one_each", identityKind: "same_type_only" }).patternId,
    "one_per_record",
  );
  assert.equal(
    mapObservationGuide({ shape: "one_each" }, READOUT_KIND.RELATED_VALUES).patternId,
    "typed_record",
  );
});

test("matched-source conditions are available as a generic guided pattern", () => {
  const result = buildGuidedPrototypeDefinition(answers({
    observation: { shape: "same_across_conditions", identityKind: "shared_source_separate_samples" },
  }));
  assert.equal(result.status, "ready");
  assert.equal(result.definition.defaultPattern, "matched_source_conditions");
  assert.ok(result.definition.patternCandidates.includes("matched_source_conditions"));
});

test("combined nested and repeated observations distinguish retained from replaced entities", () => {
  assert.deepEqual(mapObservationGuide({ shape: "combined", sequenceIdentity: "unknown" }), {
    status: "needs_information",
    questionId: "ASK_SEQUENCE_IDENTITY",
  });
  assert.deepEqual(mapObservationGuide({ shape: "combined", sequenceIdentity: "same" }), {
    status: "ready",
    patternId: "nested_sequence",
  });
  const distinct = mapObservationGuide({ shape: "combined", sequenceIdentity: "different" });
  assert.equal(distinct.status, "safe_unsupported");
  assert.equal(distinct.questionId, "ASK_COMBINED_OBSERVATION_DETAIL");
  assert.equal("patternId" in distinct, false);
});

test("ordered condition values retain a separate unit and avoid duplicate display suffixes", () => {
  const result = buildGuidedPrototypeDefinition(answers({
    experimentLabel: "Drug E concentration",
    dimensions: [{
      label: "Drug E concentration",
      kind: "ordered",
      unit: "µM",
      valuesText: "0\n0.03\n1µM\n10 µM",
    }],
    measurement: { label: "Viability", form: "scalar" },
    observation: { shape: "one_each" },
  }));
  assert.equal(result.status, "ready");
  assert.equal(result.definition.dimensionMetadata[0].unit, "µM");
  assert.deepEqual(result.definition.dimensionMetadata[0].values.map((value) => value.label), ["0", "0.03", "1µM", "10 µM"]);
  assert.deepEqual(result.definition.rows.map((row) => row.displayLabel), ["0 µM", "0.03 µM", "1µM", "10 µM"]);
  assert.deepEqual(result.definition.fixture.conditionCells.map((cell) => cell.label), ["0 µM", "0.03 µM", "1µM", "10 µM"]);
});

test("a repeated axis retains raw values, unit metadata, and unitized display values", () => {
  const result = buildGuidedPrototypeDefinition(answers({
    experimentLabel: "Time course",
    dimensions: [],
    measurement: { label: "Fluorescence", form: "scalar" },
    observation: {
      shape: "sequence",
      sequenceIdentity: "same",
      axisValuesText: "0, 5 min, 15",
      axisUnit: "min",
    },
  }));
  assert.equal(result.status, "ready");
  assert.equal(result.definition.axisUnit, "min");
  assert.deepEqual(result.definition.axisRawValues, ["0", "5 min", "15"]);
  assert.deepEqual(result.definition.axisValues, ["0 min", "5 min", "15 min"]);
});

test("nested same-entity sequences are offered and support a one-condition scope", () => {
  const result = buildGuidedPrototypeDefinition(answers({
    experimentLabel: "Cell tracking in dishes",
    dimensions: [],
    measurement: { label: "Fluorescence", form: "scalar" },
    observation: {
      shape: "combined",
      sequenceIdentity: "same",
      axisValuesText: "0, 5, 15",
      axisUnit: "min",
    },
  }));
  assert.equal(result.status, "ready");
  assert.equal(result.definition.defaultPattern, "nested_sequence");
  assert.ok(result.definition.patternCandidates.includes("nested_sequence"));
  const scopes = comparisonScopeSuggestions(result.definition, result.definition.fixture, { patternId: "nested_sequence" });
  assert.deepEqual(scopes.map((scope) => scope.topology), ["single_condition"]);
});

test("sparse two-dimensional plans offer valid row scopes but mark the full interaction unavailable", () => {
  const result = buildGuidedPrototypeDefinition(answers());
  assert.equal(result.status, "ready");
  const state = structuredClone(result.definition.fixture);
  state.conditionCells.find((cell) => cell.label === "control / +").status = CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN;
  const suggestions = comparisonScopeSuggestions(result.definition, state);
  assert.ok(suggestions.some((scope) => scope.label.includes("Gene A #1") && !scope.unavailable));
  assert.ok(suggestions.some((scope) => scope.id === "full-unavailable" && scope.unavailable));
});

test("one-condition sequence remains a valid scope candidate", () => {
  const result = buildGuidedPrototypeDefinition(answers({
    dimensions: [],
    measurement: { label: "Fluorescence", form: "scalar" },
    observation: { shape: "sequence", sequenceIdentity: "same", axisValuesText: "0, 5, 15" },
  }));
  assert.equal(result.status, "ready");
  const scopes = comparisonScopeSuggestions(result.definition, result.definition.fixture, { patternId: "same_entity_sequence" });
  assert.deepEqual(scopes.map((scope) => scope.topology), ["single_condition"]);
});

test("one-condition scalar input is not presented as a sequence comparison", () => {
  const result = buildGuidedPrototypeDefinition(answers({
    dimensions: [],
    measurement: { label: "Fluorescence", form: "scalar" },
    observation: { shape: "one_each" },
  }));
  assert.equal(result.status, "ready");
  assert.deepEqual(comparisonScopeSuggestions(result.definition, result.definition.fixture), []);
});

test("single-condition scope requires more than one ordered value", () => {
  const result = buildGuidedPrototypeDefinition(answers({
    dimensions: [],
    measurement: { label: "Fluorescence", form: "scalar" },
    observation: { shape: "sequence", sequenceIdentity: "different", axisValuesText: "0" },
  }));
  assert.equal(result.status, "ready");
  assert.deepEqual(
    comparisonScopeSuggestions(result.definition, result.definition.fixture, { patternId: "distinct_entity_sequence" }),
    [],
  );
});

test("a pasted condition table converges on the same explicit three-state canvas", () => {
  const result = buildPastedConditionDefinition({
    experimentLabel: "siRNA and Dox",
    rowLabel: "siRNA",
    columnLabel: "Dox",
    measurementLabel: "Ciliated cells",
    measurementForm: "positive_total",
    matrixText: "siRNA\tDox −\tDox +\ncontrol\t実施\t非実施\nGene A #1\t実施\t不明",
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.definition.fixture.conditionCells.map((cell) => cell.status), [
    CONDITION_STATUS.PERFORMED,
    CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN,
    CONDITION_STATUS.PERFORMED,
    CONDITION_STATUS.UNKNOWN,
  ]);
  assert.equal(result.definition.fixture.readouts[0].kind, "positive_total");
  assert.deepEqual(result.definition.directEntryProvenance, { delimiter: "tsv", rowCount: 2, columnCount: 2 });
});

test("blank optional title and punctuation in direct condition labels remain safe", () => {
  const result = buildPastedConditionDefinition({
    experimentLabel: "",
    rowLabel: "Treatment",
    columnLabel: "Batch",
    measurementLabel: "Signal",
    measurementForm: "scalar",
    matrixText: "Treatment\tBatch: morning\nTime: 0 h\t実施\nTime: 1 h\t実施",
  });
  assert.equal(result.status, "ready");
  assert.equal(result.definition.titleSource, "generated");
  assert.deepEqual(result.definition.rows.map((row) => row.label), ["Time: 0 h", "Time: 1 h"]);
  assert.deepEqual(result.definition.columns.map((column) => column.label), ["Batch: morning"]);
});

test("a pasted condition table forwards related raw field names", () => {
  const result = buildPastedConditionDefinition({
    experimentLabel: "ERK blot",
    rowLabel: "Treatment",
    columnLabel: "Batch",
    measurementLabel: "ERK phosphorylation",
    measurementForm: "multiple_related",
    relatedFieldsText: "pERK\ntotal ERK\ntotal protein",
    matrixText: "Treatment\tBatch 1\nVehicle\t実施\nDrug\t実施",
  });
  assert.equal(result.status, "ready");
  const readout = result.definition.fixture.readouts[0];
  assert.equal(readout.kind, READOUT_KIND.RELATED_VALUES);
  assert.deepEqual(readout.fields.map((field) => field.label), ["pERK", "total ERK", "total protein"]);
});

test("the direct spreadsheet accepts the full status wording shown in the UI", () => {
  const result = buildPastedConditionDefinition({
    experimentLabel: "status wording",
    rowLabel: "処理",
    columnLabel: "Dox",
    measurementLabel: "Signal",
    measurementForm: "scalar",
    matrixText: "条件\t−\t+\nControl\t実施した\t最初からなし\nDrug\tまだ不明\t実施",
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.definition.fixture.conditionCells.map((cell) => cell.status), [
    CONDITION_STATUS.PERFORMED,
    CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN,
    CONDITION_STATUS.UNKNOWN,
    CONDITION_STATUS.PERFORMED,
  ]);
});

test("pasted condition tables safe-stop on an unrecognized cell status", () => {
  const result = buildPastedConditionDefinition({
    experimentLabel: "bad status",
    rowLabel: "Treatment",
    columnLabel: "Dox",
    measurementLabel: "Signal",
    matrixText: "Treatment\t−\t+\nControl\t実施\tたぶん",
  });
  assert.equal(result.status, "needs_information");
  assert.equal(result.issues[0].code, "DIRECT_STATUS_UNRECOGNIZED");
});
