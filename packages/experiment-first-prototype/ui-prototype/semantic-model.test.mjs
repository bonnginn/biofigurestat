import assert from "node:assert/strict";
import test from "node:test";

import {
  CONDITION_STATUS,
  READOUT_KIND,
  buildIndependentConditionSeries,
  createPrototypeState,
  deriveGraphDatum,
  evaluateComparisonScopeReadiness,
  evaluateReadiness,
  findObservationCoordinateConflicts,
  isResolvedAnswer,
  mergeExampleObservations,
  observationCoordinateKey,
  resetPrototypeState,
  setConditionStatus,
  setQuestionAnswer,
  upsertObservation,
  validatePrototypeFixture,
} from "./semantic-model.js";

function scalarFixture() {
  return {
    fixtureId: "unequal-independent",
    conditionCells: [
      { id: "vehicle", label: "Vehicle", status: CONDITION_STATUS.PERFORMED },
      { id: "drug", label: "Drug", status: CONDITION_STATUS.PERFORMED },
    ],
    readouts: [{ id: "signal", label: "Signal", kind: READOUT_KIND.SCALAR }],
    observations: [
      { id: "v1", conditionCellId: "vehicle", entityId: "dish-v1", readoutId: "signal", fields: { value: 10 } },
      { id: "v2", conditionCellId: "vehicle", entityId: "dish-v2", readoutId: "signal", fields: { value: 12 } },
      { id: "d1", conditionCellId: "drug", entityId: "dish-d1", readoutId: "signal", fields: { value: 6 } },
      { id: "d2", conditionCellId: "drug", entityId: "dish-d2", readoutId: "signal", fields: { value: 7 } },
      { id: "d3", conditionCellId: "drug", entityId: "dish-d3", readoutId: "signal", fields: { value: 8 } },
    ],
    questions: [
      { id: "source", requiredFor: ["statistics"], unresolvedAnswers: ["not_sure"] },
    ],
    answers: { source: "unknown" },
  };
}

test("condition cells have three explicit states and raw records survive exclusion", () => {
  const initial = createPrototypeState(scalarFixture());
  const changed = setConditionStatus(initial, "drug", CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN);
  const graph = buildIndependentConditionSeries(changed, { readoutId: "signal" });

  assert.equal(initial.conditionCells.find((cell) => cell.id === "drug").status, CONDITION_STATUS.PERFORMED);
  assert.equal(changed.observations.length, 5, "changing the plan must not erase raw data");
  assert.deepEqual(graph.series.map((series) => series.conditionCellId), ["vehicle"]);
  assert.equal(graph.activeGraphPointCount, 2);
  assert.equal(graph.rawObservationCount, 5);
  assert.deepEqual(
    graph.excluded.filter((item) => item.reason === "condition_not_performed_by_design").map((item) => item.observation.id),
    ["d1", "d2", "d3"],
  );

  const unknown = setConditionStatus(initial, "drug", CONDITION_STATUS.UNKNOWN);
  assert.equal(buildIndependentConditionSeries(unknown, { readoutId: "signal" }).excluded[0].reason, "condition_status_unknown");
});

test("reset restores an immutable fixture snapshot even after working state is mutated", () => {
  const inputFixture = scalarFixture();
  const initial = createPrototypeState(inputFixture);
  const changed = setQuestionAnswer(
    setConditionStatus(initial, "drug", CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN),
    "source",
    "different_dishes",
  );
  changed.observations[0].fields.value = 999;
  changed.conditionCells[0].label = "changed label";

  const reset = resetPrototypeState(changed);
  assert.equal(reset.observations[0].fields.value, 10);
  assert.equal(reset.conditionCells[0].label, "Vehicle");
  assert.equal(reset.conditionCells[1].status, CONDITION_STATUS.PERFORMED);
  assert.equal(reset.answers.source, "unknown");
  assert.equal(inputFixture.observations[0].fields.value, 10, "caller fixture must remain untouched");
  assert.equal(Object.isFrozen(reset.baseline), true);
  assert.equal(Object.isFrozen(reset.baseline.observations[0].fields), true);
});

test("positive and total counts are one typed record with an explicit derived ratio", () => {
  const readout = {
    id: "positive_rate",
    label: "Ciliated-cell rate",
    kind: READOUT_KIND.POSITIVE_TOTAL,
    numeratorField: "ciliatedCells",
    denominatorField: "totalCells",
  };
  const datum = deriveGraphDatum({ fields: { ciliatedCells: 15, totalCells: 60 } }, readout);
  assert.equal(datum.ok, true);
  assert.equal(datum.value, 0.25);
  assert.equal(datum.percent, 25);
  assert.deepEqual(datum.derivation, {
    kind: "ratio",
    numeratorField: "ciliatedCells",
    denominatorField: "totalCells",
    numerator: 15,
    denominator: 60,
    formula: "ciliatedCells / totalCells",
  });
  assert.deepEqual(deriveGraphDatum({ fields: { ciliatedCells: 5, totalCells: 0 } }, readout), {
    ok: false,
    reason: "total_must_be_positive",
  });
  assert.deepEqual(deriveGraphDatum({ fields: { ciliatedCells: 61, totalCells: 60 } }, readout), {
    ok: false,
    reason: "positive_must_be_between_zero_and_total",
  });
});

test("independent unequal-n conditions remain separate unpadded lists", () => {
  const state = createPrototypeState(scalarFixture());
  const graph = buildIndependentConditionSeries(state, { readoutId: "signal" });
  assert.equal(graph.mode, "independent_condition_lists");
  assert.deepEqual(graph.series.map((series) => series.points.length), [2, 3]);
  assert.deepEqual(graph.series[0].points.map((point) => point.entityId), ["dish-v1", "dish-v2"]);
  assert.deepEqual(graph.series[1].points.map((point) => point.entityId), ["dish-d1", "dish-d2", "dish-d3"]);
  assert.equal("rows" in graph, false, "the model must not imply pairing by rectangular row position");
});

test("unknown and undecided answers never count as statistics-ready", () => {
  let state = createPrototypeState(scalarFixture());
  assert.equal(evaluateReadiness(state, { intent: "graph", readoutId: "signal" }).ready, true);
  assert.deepEqual(evaluateReadiness(state, { intent: "statistics", readoutId: "signal" }), {
    intent: "statistics",
    ready: false,
    graphReady: true,
    unresolvedQuestionIds: ["source"],
    unknownConditionCellIds: [],
  });
  for (const answer of ["", "不明", "まだ決めていない", "別の順序", "not_sure"]) {
    assert.equal(isResolvedAnswer(answer, state.questions[0]), false, answer);
  }

  state = setQuestionAnswer(state, "source", "different_dishes");
  assert.equal(evaluateReadiness(state, { intent: "statistics", readoutId: "signal" }).ready, true);

  state = setConditionStatus(state, "drug", CONDITION_STATUS.UNKNOWN);
  const readiness = evaluateReadiness(state, { intent: "statistics", readoutId: "signal" });
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.unknownConditionCellIds, ["drug"]);
});

test("upsert and validation stop unknown bindings instead of coercing them", () => {
  const state = createPrototypeState(scalarFixture());
  const updated = upsertObservation(state, {
    id: "d3",
    conditionCellId: "drug",
    entityId: "dish-d3",
    readoutId: "signal",
    fields: { value: 9 },
  });
  assert.equal(updated.observations.find((item) => item.id === "d3").fields.value, 9);
  assert.equal(state.observations.find((item) => item.id === "d3").fields.value, 8);

  assert.throws(() => upsertObservation(state, {
    id: "orphan",
    conditionCellId: "invented-condition",
    entityId: "dish-x",
    readoutId: "signal",
    fields: { value: 3 },
  }), /unknown condition cell/);
  assert.throws(() => validatePrototypeFixture({
    ...scalarFixture(),
    conditionCells: [{ id: "vehicle", status: "maybe" }],
  }), /unsupported condition status/);
});

test("example observations never overwrite raw records and refresh only their explicit example set", () => {
  const initial = createPrototypeState(scalarFixture());
  const examples = [
    {
      id: "v1",
      conditionCellId: "vehicle",
      entityId: "example-vehicle",
      readoutId: "signal",
      fields: { value: 101 },
    },
    {
      id: "demo-drug",
      conditionCellId: "drug",
      entityId: "example-drug",
      readoutId: "signal",
      fields: { value: 202 },
    },
  ];
  const before = JSON.stringify(initial);
  const first = mergeExampleObservations(initial, examples, { exampleSetId: "starter" });

  assert.equal(JSON.stringify(initial), before, "example merge must not mutate current state");
  assert.equal(examples[0].provenance, undefined, "example payload must not be mutated");
  assert.equal(first.observations.find((item) => item.id === "v1").fields.value, 10);
  const collidingExample = first.observations.find((item) =>
    item.provenance?.exampleSetId === "starter" && item.entityId === "example-vehicle",
  );
  assert.equal(collidingExample.id, "v1--example-2");
  assert.equal(collidingExample.provenance.sourceKind, "prototype_example");
  assert.equal(first.observations.length, initial.observations.length + 2);

  const otherSet = mergeExampleObservations(first, [{
    id: "other-demo",
    conditionCellId: "vehicle",
    entityId: "other-example",
    readoutId: "signal",
    fields: { value: 303 },
  }], { exampleSetId: "other" });
  const refreshed = mergeExampleObservations(otherSet, [{
    id: "demo-drug",
    conditionCellId: "drug",
    entityId: "replacement-example",
    readoutId: "signal",
    fields: { value: 404 },
  }], { exampleSetId: "starter" });

  assert.equal(refreshed.observations.filter((item) => item.provenance?.exampleSetId === "starter").length, 1);
  assert.equal(refreshed.observations.find((item) => item.entityId === "replacement-example").fields.value, 404);
  assert.equal(refreshed.observations.some((item) => item.entityId === "example-vehicle"), false);
  assert.equal(refreshed.observations.some((item) => item.entityId === "example-drug"), false);
  assert.equal(refreshed.observations.some((item) => item.entityId === "other-example"), true);
  for (const original of initial.observations) {
    assert.equal(
      refreshed.observations.find((item) => item.id === original.id).fields.value,
      original.fields.value,
      `raw observation ${original.id} must survive`,
    );
  }
});

test("comparison scope ignores outside cells and normalizes duplicate selection to plan order", () => {
  const fixture = scalarFixture();
  fixture.conditionCells.splice(1, 0,
    { id: "unused", label: "Not checked", status: CONDITION_STATUS.UNKNOWN },
  );
  fixture.answers.source = "different_dishes";
  const state = createPrototypeState(fixture);
  const before = JSON.stringify(state);
  const readiness = evaluateComparisonScopeReadiness(state, {
    conditionCellIds: ["drug", "vehicle", "drug"],
    readoutId: "signal",
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.graphReady, true);
  assert.deepEqual(readiness.selectedConditionCellIds, ["vehicle", "drug"]);
  assert.deepEqual(readiness.unknownConditionCellIds, []);
  assert.deepEqual(readiness.notPerformedConditionCellIds, []);
  assert.deepEqual(readiness.unmeasuredConditionCellIds, []);
  assert.equal(JSON.stringify(state), before, "scope readiness must not mutate state or normalize in place");
});

test("comparison scope blocks unknown, not-performed, and unmeasured selected cells only", () => {
  const fixture = scalarFixture();
  fixture.conditionCells.push(
    { id: "unknown-cell", label: "Unknown", status: CONDITION_STATUS.UNKNOWN },
    { id: "not-performed", label: "Not performed", status: CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN },
    { id: "empty-performed", label: "Empty", status: CONDITION_STATUS.PERFORMED },
  );
  fixture.answers.source = "different_dishes";
  const state = createPrototypeState(fixture);

  const unknown = evaluateComparisonScopeReadiness(state, {
    conditionCellIds: ["unknown-cell"],
    readoutId: "signal",
  });
  assert.equal(unknown.ready, false);
  assert.deepEqual(unknown.unknownConditionCellIds, ["unknown-cell"]);
  assert.deepEqual(unknown.unmeasuredConditionCellIds, []);

  const notPerformed = evaluateComparisonScopeReadiness(state, {
    conditionCellIds: ["not-performed"],
    readoutId: "signal",
  });
  assert.equal(notPerformed.ready, false);
  assert.deepEqual(notPerformed.notPerformedConditionCellIds, ["not-performed"]);
  assert.deepEqual(notPerformed.unmeasuredConditionCellIds, []);

  const unmeasured = evaluateComparisonScopeReadiness(state, {
    conditionCellIds: ["empty-performed"],
    readoutId: "signal",
  });
  assert.equal(unmeasured.ready, false);
  assert.deepEqual(unmeasured.unmeasuredConditionCellIds, ["empty-performed"]);

  const validOutsideFailures = evaluateComparisonScopeReadiness(state, {
    conditionCellIds: ["vehicle", "drug"],
    readoutId: "signal",
  });
  assert.equal(validOutsideFailures.ready, true, "failures outside the explicit scope must not block it");
  assert.throws(() => evaluateComparisonScopeReadiness(state, {
    conditionCellIds: ["invented"],
    readoutId: "signal",
  }), /unknown condition cell/);
});

test("repeated and matched coordinate conflicts are detected without changing raw observations", () => {
  const observations = [
    { id: "r1", conditionCellId: "drug", entityId: "Cell-1", fields: { time: "5 min", value: 2 } },
    { id: "r2", conditionCellId: "drug", entityId: "Cell-1", fields: { time: "5 min", value: 3 } },
    { id: "r3", conditionCellId: "drug", entityId: "Cell-1", fields: { time: "10 min", value: 4 } },
    { id: "r4", conditionCellId: "drug", entityId: "Cell-2", fields: { time: "5 min", value: 5 } },
  ];
  const before = JSON.stringify(observations);

  const repeated = findObservationCoordinateConflicts(observations, {
    patternId: "same_entity_sequence",
  });
  assert.deepEqual(repeated, [{
    key: JSON.stringify(["same_entity_sequence", "drug", "Cell-1", "5 min"]),
    patternId: "same_entity_sequence",
    conditionCellId: "drug",
    entityId: "Cell-1",
    axisValue: "5 min",
    observationIds: ["r1", "r2"],
  }]);
  assert.equal(JSON.stringify(observations), before, "conflict detection must not mutate or merge raw rows");

  const matched = findObservationCoordinateConflicts([
    { id: "m1", conditionCellId: "vehicle", entityId: "Donor-1", fields: { value: 7 } },
    { id: "m2", conditionCellId: "vehicle", entityId: "Donor-1", fields: { value: 8 } },
  ], { patternId: "matched_source_conditions" });
  assert.deepEqual(matched[0].observationIds, ["m1", "m2"]);
  assert.equal(matched[0].axisValue, null);
});

test("coordinate conflict detection ignores nonduplicates, empty placeholders, and unrelated patterns", () => {
  const observations = [
    { id: "empty", conditionCellId: "drug", entityId: "Cell-1", placeholder: true, fields: { time: "5", value: "" } },
    { id: "one", conditionCellId: "drug", entityId: "Cell-1", fields: { time: 5, value: 2 } },
    { id: "other-entity", conditionCellId: "drug", entityId: "Cell-2", fields: { time: "5", value: 3 } },
    { id: "other-axis", conditionCellId: "drug", entityId: "Cell-1", fields: { time: "10", value: 4 } },
  ];

  assert.deepEqual(findObservationCoordinateConflicts(observations, {
    patternId: "distinct_entity_sequence",
  }), []);
  assert.deepEqual(findObservationCoordinateConflicts(observations, {
    patternId: "one_per_record",
  }), []);
  assert.deepEqual(findObservationCoordinateConflicts(observations, {
    patternId: "nested_records",
  }), []);
  assert.equal(observationCoordinateKey(observations[1], {
    patternId: "same_entity_sequence",
  }), JSON.stringify(["same_entity_sequence", "drug", "Cell-1", "5"]));
  assert.equal(observationCoordinateKey({ conditionCellId: "drug", entityId: "", fields: { time: 5 } }, {
    patternId: "same_entity_sequence",
  }), null);
});

test("typed value fields determine whether a coordinate contains a meaningful observation", () => {
  const observations = [
    { id: "p1", conditionCellId: "drug", entityId: "Cell-1", fields: { time: "5", positive: "", total: "" } },
    { id: "p2", conditionCellId: "drug", entityId: "Cell-1", fields: { time: "5", positive: 8, total: 20 } },
    { id: "p3", conditionCellId: "drug", entityId: "Cell-1", fields: { time: "5", positive: 9, total: 20 } },
  ];
  const conflicts = findObservationCoordinateConflicts(observations, {
    patternId: "same_entity_sequence",
    valueFields: ["positive", "total"],
  });

  assert.deepEqual(conflicts[0].observationIds, ["p2", "p3"]);
  assert.throws(() => findObservationCoordinateConflicts(observations, {
    patternId: "same_entity_sequence",
    valueFields: "value",
  }), /valueFields must be an array/);
});
