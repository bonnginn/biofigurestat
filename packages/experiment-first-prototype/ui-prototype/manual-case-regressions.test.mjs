import assert from "node:assert/strict";
import test from "node:test";

import {
  GUIDED_ENTRY_VERSION,
  buildGuidedPrototypeDefinition,
  buildPastedConditionDefinition,
  comparisonScopeSuggestions,
} from "./guided-entry-model.js";
import {
  CONDITION_STATUS,
  READOUT_KIND,
  buildIndependentConditionSeries,
  createPrototypeState,
  deriveGraphDatum,
  findObservationCoordinateConflicts,
} from "./semantic-model.js";
import { buildConditionMeasurementSheets } from "./measurement-sheet-model.js";

function guidedAnswers(overrides = {}) {
  return {
    schemaVersion: GUIDED_ENTRY_VERSION,
    conditionChangeCount: "1",
    experimentLabel: "Manual-case regression",
    dimensions: [{ label: "Treatment", kind: "nominal", valuesText: "Vehicle\nDrug" }],
    combinationAnswer: "all_performed",
    measurement: { label: "Signal", form: "scalar" },
    observation: { shape: "one_each", identityKind: "same_type_only" },
    ...overrides,
  };
}

function readyDefinition(answers) {
  const result = buildGuidedPrototypeDefinition(answers);
  assert.equal(result.status, "ready");
  return result.definition;
}

test("sparse factorial positive/total records retain the omitted cell and raw counts without completing the grid", () => {
  const built = buildPastedConditionDefinition({
    experimentLabel: "Sparse siRNA by Dox",
    rowLabel: "siRNA",
    columnLabel: "Dox",
    measurementLabel: "Ciliated cells",
    measurementForm: "positive_total",
    matrixText: "siRNA\tDox −\tDox +\ncontrol\t実施\t最初からなし\nGene X\t実施\t実施",
  });
  assert.equal(built.status, "ready");

  const definition = built.definition;
  const readout = definition.fixture.readouts[0];
  assert.equal(readout.kind, READOUT_KIND.POSITIVE_TOTAL);
  assert.deepEqual(
    definition.fixture.conditionCells.map((cell) => cell.status),
    [
      CONDITION_STATUS.PERFORMED,
      CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN,
      CONDITION_STATUS.PERFORMED,
      CONDITION_STATUS.PERFORMED,
    ],
  );

  const observations = definition.fixture.conditionCells.map((cell, index) => ({
    id: `count-${index + 1}`,
    conditionCellId: cell.id,
    readoutId: readout.id,
    entityId: `Field-${index + 1}`,
    fields: { positive: 10 + index, total: 40 + index },
  }));
  const state = createPrototypeState({ ...definition.fixture, observations });
  const graph = buildIndependentConditionSeries(state, { readoutId: readout.id });

  assert.equal(graph.rawObservationCount, 4, "a retained record under the omitted cell must not be deleted");
  assert.equal(graph.activeGraphPointCount, 3, "the omitted cell must not become an active fourth combination");
  assert.deepEqual(
    graph.excluded.map((item) => [item.observation.id, item.reason]),
    [["count-2", "condition_not_performed_by_design"]],
  );
  assert.deepEqual(
    graph.series.flatMap((series) => series.points.map((point) => point.derivation.kind)),
    ["ratio", "ratio", "ratio"],
  );

  const scopes = comparisonScopeSuggestions(definition, state);
  assert.ok(scopes.some((scope) => scope.id === "full-unavailable" && scope.unavailable));
  assert.equal(scopes.some((scope) => scope.id === "full"), false);
});

test("related-value readouts keep every named raw field while graph selection remains an explicit projection", () => {
  const definition = readyDefinition(guidedAnswers({
    experimentLabel: "Donor-linked WB bundle",
    measurement: {
      label: "Phosphorylation panel",
      form: "multiple_related",
      relatedFieldsText: "pERK\ntotal ERK\npAKT\ntotal AKT\ntotal protein",
    },
    observation: { shape: "one_each", identityKind: "same_type_only" },
  }));
  assert.equal(definition.defaultPattern, "typed_record");

  const readout = definition.fixture.readouts[0];
  assert.equal(readout.kind, READOUT_KIND.RELATED_VALUES);
  assert.deepEqual(
    readout.fields.map((field) => [field.key, field.label]),
    [
      ["perk", "pERK"],
      ["total-erk", "total ERK"],
      ["pakt", "pAKT"],
      ["total-akt", "total AKT"],
      ["total-protein", "total protein"],
    ],
  );

  const firstCondition = definition.fixture.conditionCells[0];
  const rawFields = {
    perk: "121.5",
    "total-erk": "302.0",
    pakt: "88.4",
    "total-akt": "276.2",
    "total-protein": "910.0",
  };
  const observation = {
    id: "lane-1",
    conditionCellId: firstCondition.id,
    readoutId: readout.id,
    entityId: "Donor-1",
    fields: { laneId: "Lane-1", ...rawFields },
  };
  const state = createPrototypeState({ ...definition.fixture, observations: [observation] });
  const before = structuredClone(state.observations[0].fields);
  const datum = deriveGraphDatum(state.observations[0], readout);
  const sheet = buildConditionMeasurementSheets(state, { readoutId: readout.id });

  assert.deepEqual(state.observations[0].fields, before, "derivation must not replace the WB source values");
  assert.deepEqual(sheet.groups[0].rows[0].fields, { laneId: "Lane-1", ...rawFields });
  assert.deepEqual(datum, {
    ok: true,
    value: 121.5,
    derivation: { kind: "selected_related_value", valueField: "perk", rawValue: "121.5" },
  });
});

test("an ordered numeric dose axis preserves raw labels, numeric order, zero, and unit metadata separately", () => {
  const expectedRaw = ["0", "0.03", "0.1", "0.3", "1", "3", "10"];
  const expectedNumeric = [0, 0.03, 0.1, 0.3, 1, 3, 10];
  const definition = readyDefinition(guidedAnswers({
    experimentLabel: "Drug E dose response",
    dimensions: [{
      label: "Drug E dose",
      kind: "ordered",
      unit: "µM",
      valuesText: expectedRaw.join("\n"),
    }],
    measurement: { label: "Viability", form: "scalar" },
    observation: { shape: "one_each", identityKind: "shared_source_separate_samples" },
  }));

  const dose = definition.dimensionMetadata[0];
  const rawLabels = dose.values.map((value) => value.label);
  assert.equal(dose.kind, "ordered");
  assert.equal(dose.unit, "µM");
  assert.deepEqual(rawLabels, expectedRaw);
  assert.deepEqual(rawLabels.map(Number), expectedNumeric);
  assert.ok(rawLabels.every((value) => value !== "" && Number.isFinite(Number(value))));
  assert.deepEqual(
    definition.fixture.conditionCells.map((cell) => cell.label),
    expectedRaw.map((value) => `${value} µM`),
  );
  assert.equal(definition.fixture.conditionCells[0].label, "0 µM", "numeric zero must not be treated as empty");
});

test("nested same-entity sequences retain explicit missing later coordinates without zero fill or identity replacement", () => {
  const definition = readyDefinition(guidedAnswers({
    experimentLabel: "Live-cell tracking",
    dimensions: [{ label: "Treatment", kind: "nominal", valuesText: "Vehicle\nStimulus N" }],
    measurement: { label: "Nuclear fluorescence", form: "scalar" },
    observation: {
      shape: "combined",
      sequenceIdentity: "same",
      axisLabel: "Time",
      axisUnit: "min",
      axisValuesText: "0, 5, 15, 30, 60",
    },
  }));
  assert.equal(definition.defaultPattern, "nested_sequence");
  assert.deepEqual(definition.axisRawValues, ["0", "5", "15", "30", "60"]);
  assert.deepEqual(definition.axisValues, ["0 min", "5 min", "15 min", "30 min", "60 min"]);

  const condition = definition.fixture.conditionCells[0];
  const readout = definition.fixture.readouts[0];
  const observations = [];
  for (const [cellId, values] of Object.entries({
    "Cell-1": [11, 12, 14, 16, 17],
    "Cell-2": [21, 23, 24, "", ""],
  })) {
    for (const [index, time] of definition.axisValues.entries()) {
      const missing = values[index] === "";
      observations.push({
        id: `${cellId}-${index}`,
        conditionCellId: condition.id,
        readoutId: readout.id,
        entityId: cellId,
        fields: {
          dish: "Dish-1",
          cell: cellId,
          time,
          value: values[index],
          ...(missing ? { missingReason: "track_left_field" } : {}),
        },
      });
    }
  }

  const state = createPrototypeState({ ...definition.fixture, observations });
  const sheet = buildConditionMeasurementSheets(state, { readoutId: readout.id });
  const graph = buildIndependentConditionSeries(state, { readoutId: readout.id });
  const missingRows = sheet.groups[0].rows.filter((row) => row.fields.value === "");

  assert.equal(sheet.groups[0].rowCount, 10, "missing coordinates remain explicit raw rows");
  assert.deepEqual(missingRows.map((row) => row.fields.time), ["30 min", "60 min"]);
  assert.ok(missingRows.every((row) => row.entityId === "Cell-2"));
  assert.ok(missingRows.every((row) => row.fields.value !== 0 && row.fields.missingReason === "track_left_field"));
  assert.equal(graph.activeGraphPointCount, 8, "blank later values must not become plotted zeroes");
  assert.deepEqual(
    findObservationCoordinateConflicts(state.observations, {
      patternId: "nested_sequence",
      valueFields: ["value"],
    }),
    [],
  );
});

test("matched-source observations retain both shared source identity and condition-specific sample identity", () => {
  const definition = readyDefinition(guidedAnswers({
    experimentLabel: "Donor split across treatments",
    dimensions: [{
      label: "Treatment",
      kind: "nominal",
      valuesText: "Vehicle\nDrug A\nDrug B\nDrug C",
    }],
    measurement: { label: "IL-6", form: "scalar" },
    observation: { shape: "one_each", identityKind: "shared_source_separate_samples" },
  }));
  assert.equal(definition.defaultPattern, "matched_source_conditions");

  const readout = definition.fixture.readouts[0];
  const observations = ["Donor-1", "Donor-2"].flatMap((sourceId, sourceIndex) =>
    definition.fixture.conditionCells.map((condition, conditionIndex) => ({
      id: `${sourceId}-${conditionIndex + 1}`,
      conditionCellId: condition.id,
      readoutId: readout.id,
      entityId: sourceId,
      fields: {
        sourceSampleId: `${sourceId}-Dish-${conditionIndex + 1}`,
        value: 20 + sourceIndex * 10 + conditionIndex,
      },
    })),
  );
  const state = createPrototypeState({ ...definition.fixture, observations });
  const sheet = buildConditionMeasurementSheets(state, { readoutId: readout.id });
  const projected = sheet.groups.flatMap((group) => group.rows);

  assert.deepEqual(new Set(projected.map((row) => row.entityId)), new Set(["Donor-1", "Donor-2"]));
  assert.equal(new Set(projected.map((row) => row.fields.sourceSampleId)).size, 8);
  assert.ok(projected.every((row) => row.fields.sourceSampleId.startsWith(`${row.entityId}-Dish-`)));
  assert.ok(projected.every((row) => row.fields.sourceSampleId !== row.entityId));
  assert.deepEqual(
    findObservationCoordinateConflicts(projected, {
      patternId: "matched_source_conditions",
      valueFields: ["value"],
    }),
    [],
  );
});
