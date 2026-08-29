import assert from "node:assert/strict";
import test from "node:test";

import { CONDITION_STATUS, READOUT_KIND, createPrototypeState } from "./semantic-model.js";
import {
  MEASUREMENT_VIEW_MODE,
  applyIndependentCompactValues,
  buildMeasurementAxisColumns,
  buildMeasurementRecordView,
  buildConditionMeasurementSheets,
  compactMeasurementEditingDecision,
  describeMeasurementDerivationIssue,
  ensureConditionMeasurementRowCount,
  ensurePerformedConditionMeasurementRows,
  rowCountWithTrailingEntryRow,
  serializeIndependentCompactValues,
} from "./measurement-sheet-model.js";

function independentFixture() {
  return {
    fixtureId: "condition-sheet-unequal-n",
    conditionCells: [
      { id: "vehicle", label: "Vehicle", status: CONDITION_STATUS.PERFORMED },
      { id: "drug", label: "Drug", status: CONDITION_STATUS.PERFORMED },
      { id: "not-run", label: "Not run", status: CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN },
    ],
    readouts: [
      { id: "signal", label: "Signal", kind: READOUT_KIND.SCALAR, valueField: "value" },
      { id: "area", label: "Area", kind: READOUT_KIND.SCALAR, valueField: "area" },
    ],
    observations: [
      { id: "v1", conditionCellId: "vehicle", readoutId: "signal", entityId: "dish-v1", fields: { value: 10, note: "keep-v1" } },
      { id: "v2", conditionCellId: "vehicle", readoutId: "signal", entityId: "dish-v2", fields: { value: 12, note: "keep-v2" } },
      { id: "d1", conditionCellId: "drug", readoutId: "signal", entityId: "dish-d1", fields: { value: 6 } },
      { id: "d2", conditionCellId: "drug", readoutId: "signal", entityId: "dish-d2", fields: { value: 7 } },
      { id: "d3", conditionCellId: "drug", readoutId: "signal", entityId: "dish-d3", fields: { value: 8 } },
      { id: "area-v1", conditionCellId: "vehicle", readoutId: "area", entityId: "dish-v1", fields: { area: 201 } },
      { id: "retained-not-run", conditionCellId: "not-run", readoutId: "signal", entityId: "legacy", fields: { value: 99 } },
    ],
    questions: [],
  };
}

function nestedFixture() {
  return {
    fixtureId: "condition-sheet-nested",
    conditionCells: [
      { id: "control", label: "Control", status: CONDITION_STATUS.PERFORMED },
      { id: "drug", label: "Drug", status: CONDITION_STATUS.PERFORMED },
    ],
    readouts: [{ id: "intensity", label: "Intensity", kind: READOUT_KIND.SCALAR }],
    observations: [
      {
        id: "cell-1",
        conditionCellId: "control",
        readoutId: "intensity",
        entityId: "dish-1",
        fields: { dish: "dish-1", field: "field-1", cell: "cell-1", value: 31, rawMetadata: { filename: "a.tif" } },
      },
      {
        id: "cell-2",
        conditionCellId: "control",
        readoutId: "intensity",
        entityId: "dish-1",
        fields: { dish: "dish-1", field: "field-1", cell: "cell-2", value: 34, rawMetadata: { filename: "a.tif" } },
      },
    ],
    questions: [],
  };
}

test("condition sheets preserve unequal n as separate unpadded row lists", () => {
  const state = createPrototypeState(independentFixture());
  const sheets = buildConditionMeasurementSheets(state, { readoutId: "signal" });

  assert.deepEqual(sheets.groups.map((group) => group.rowCount), [2, 3, 1]);
  assert.deepEqual(sheets.groups[0].rows.map((row) => row.entityId), ["dish-v1", "dish-v2"]);
  assert.deepEqual(sheets.groups[1].rows.map((row) => row.entityId), ["dish-d1", "dish-d2", "dish-d3"]);
  assert.equal(sheets.groups[2].editable, false);
  assert.equal(sheets.selectedObservationCount, 6);
  assert.equal(sheets.retainedObservationCount, 7);
  assert.deepEqual(sheets.unselectedObservationIds, ["area-v1"]);
  assert.equal("matrixRows" in sheets, false, "row position must not imply pairing across conditions");
});

test("projection never aggregates nested children that share the same parent identity", () => {
  const state = createPrototypeState(nestedFixture());
  const before = JSON.stringify(state.observations);
  const sheets = buildConditionMeasurementSheets(state, { readoutId: "intensity" });

  assert.equal(sheets.groups[0].rowCount, 2);
  assert.deepEqual(sheets.groups[0].rows.map((row) => row.id), ["cell-1", "cell-2"]);
  assert.deepEqual(sheets.groups[0].rows.map((row) => row.entityId), ["dish-1", "dish-1"]);
  assert.equal(JSON.stringify(state.observations), before);

  sheets.groups[0].rows[0].fields.rawMetadata.filename = "changed-in-view.tif";
  assert.equal(state.observations[0].fields.rawMetadata.filename, "a.tif", "sheet projection must not alias raw data");
});

test("growing one condition appends only missing blank rows without overwriting raw records", () => {
  const state = createPrototypeState(independentFixture());
  const original = structuredClone(state.observations);
  const grown = ensureConditionMeasurementRowCount(state, {
    conditionCellId: "vehicle",
    readoutId: "signal",
    minimumRowCount: 4,
  });

  assert.deepEqual(state.observations, original, "input state must remain unchanged");
  assert.deepEqual(grown.observations.slice(0, original.length), original, "existing identities and raw fields must be byte-for-byte equivalent");
  assert.equal(buildConditionMeasurementSheets(grown, { readoutId: "signal" }).groups[0].rowCount, 4);
  assert.equal(buildConditionMeasurementSheets(grown, { readoutId: "signal" }).groups[1].rowCount, 3);
  const added = grown.observations.slice(original.length);
  assert.equal(added.length, 2);
  assert.equal(new Set(added.map((row) => row.id)).size, 2);
  assert.ok(added.every((row) => row.conditionCellId === "vehicle" && row.entityId === ""));
  assert.ok(added.every((row) => row.fields.value === "" && row.placeholder === true));
  assert.ok(added.every((row) => row.provenance.sourceKind === "adaptive_sheet_blank_row"));
});

test("each performed condition can receive its own minimum rows without equalizing larger groups", () => {
  const state = createPrototypeState(independentFixture());
  const grown = ensurePerformedConditionMeasurementRows(state, {
    readoutId: "signal",
    minimumRowCount: 3,
  });
  const sheets = buildConditionMeasurementSheets(grown, { readoutId: "signal" });

  assert.deepEqual(sheets.groups.map((group) => group.rowCount), [3, 3, 1]);
  assert.equal(sheets.groups[2].editable, false);
  assert.deepEqual(grown.observations.find((row) => row.id === "retained-not-run").fields, { value: 99 });
});

test("nested blank columns and positive/total raw fields are created without inferred identities", () => {
  const nested = createPrototypeState(nestedFixture());
  const grownNested = ensureConditionMeasurementRowCount(nested, {
    conditionCellId: "drug",
    readoutId: "intensity",
    minimumRowCount: 2,
    blankFields: { dish: "", field: "", cell: "" },
  });
  const nestedRows = buildConditionMeasurementSheets(grownNested, { readoutId: "intensity" }).groups[1].rows;
  assert.equal(nestedRows.length, 2);
  assert.deepEqual(nestedRows[0].fields, { value: "", dish: "", field: "", cell: "" });
  assert.equal(nestedRows[0].entityId, "");

  const typed = createPrototypeState({
    fixtureId: "typed-sheet",
    conditionCells: [{ id: "control", label: "Control", status: CONDITION_STATUS.PERFORMED }],
    readouts: [{ id: "rate", label: "Positive rate", kind: READOUT_KIND.POSITIVE_TOTAL, numeratorField: "positiveCells", denominatorField: "totalCells" }],
    observations: [],
    questions: [],
  });
  const grownTyped = ensureConditionMeasurementRowCount(typed, {
    conditionCellId: "control",
    readoutId: "rate",
    minimumRowCount: 1,
  });
  assert.deepEqual(grownTyped.observations[0].fields, { positiveCells: "", totalCells: "" });
});

test("row growth safely rejects unknown or non-performed condition groups", () => {
  const state = createPrototypeState(independentFixture());
  assert.throws(() => ensureConditionMeasurementRowCount(state, {
    conditionCellId: "missing",
    readoutId: "signal",
    minimumRowCount: 1,
  }), /unknown condition cell/);
  assert.throws(() => ensureConditionMeasurementRowCount(state, {
    conditionCellId: "not-run",
    readoutId: "signal",
    minimumRowCount: 2,
  }), /cannot add measurement rows/);
  assert.throws(() => ensureConditionMeasurementRowCount(state, {
    conditionCellId: "vehicle",
    readoutId: "signal",
    minimumRowCount: 1.5,
  }), /minimumRowCount/);
});

test("typing or pasting reserves one trailing row without equalizing other conditions", () => {
  assert.equal(rowCountWithTrailingEntryRow({
    currentRowCount: 1,
    startRowIndex: 0,
    enteredRowCount: 1,
  }), 2);
  assert.equal(rowCountWithTrailingEntryRow({
    currentRowCount: 2,
    startRowIndex: 0,
    enteredRowCount: 5,
  }), 6);
  assert.equal(rowCountWithTrailingEntryRow({
    currentRowCount: 8,
    startRowIndex: 2,
    enteredRowCount: 2,
  }), 8);
  assert.throws(() => rowCountWithTrailingEntryRow({
    currentRowCount: 1,
    startRowIndex: -1,
    enteredRowCount: 1,
  }), /startRowIndex/);
});

test("compact and detail views reference the same unequal-n independent records without pairing rows", () => {
  const fixture = independentFixture();
  fixture.observations.push({
    id: "d4-missing",
    conditionCellId: "drug",
    readoutId: "signal",
    entityId: "dish-d4",
    fields: { value: "", note: "explicitly retained missing value" },
  });
  const state = createPrototypeState(fixture);
  const before = JSON.stringify(state.observations);
  const compact = buildMeasurementRecordView(state, {
    readoutId: "signal",
    mode: MEASUREMENT_VIEW_MODE.COMPACT,
    patternId: "one_per_record",
  });
  const detail = buildMeasurementRecordView(state, {
    readoutId: "signal",
    mode: MEASUREMENT_VIEW_MODE.DETAIL,
    patternId: "one_per_record",
  });

  assert.deepEqual(compact.canonicalRecordIds, detail.canonicalRecordIds);
  assert.equal(new Set(compact.canonicalRecordIds).size, compact.canonicalRecordCount);
  assert.deepEqual(compact.groups.map((group) => group.observationN), [2, 4, 1]);
  assert.deepEqual(compact.groups[1].fieldCoverage[0].missingRecordIds, ["d4-missing"]);
  assert.deepEqual(compact.groups[1].identity.ids, ["dish-d1", "dish-d2", "dish-d3", "dish-d4"]);
  assert.equal(compact.groups[0].verifiedIndependentUnitCount, 2);
  assert.equal(compact.alignment.kind, "none");
  assert.equal(compact.alignment.rowPositionImpliesMatch, false);
  assert.equal(detail.groups[1].editable, true);
  assert.deepEqual(detail.groups[1].rows.map((row) => row.id), ["d1", "d2", "d3", "d4-missing"]);
  assert.equal(JSON.stringify(state.observations), before, "changing projection density must not rewrite records");
});

test("paired and repeated compact summaries expose exact identities and missing coordinates", () => {
  const paired = createPrototypeState({
    fixtureId: "paired-density",
    conditionCells: [
      { id: "dark", label: "Dark", status: CONDITION_STATUS.PERFORMED },
      { id: "lit", label: "Lit", status: CONDITION_STATUS.PERFORMED },
    ],
    readouts: [{ id: "signal", label: "Signal", kind: READOUT_KIND.SCALAR }],
    observations: [
      { id: "p1-dark", conditionCellId: "dark", readoutId: "signal", entityId: "Cell-1", fields: { value: 2 } },
      { id: "p1-lit", conditionCellId: "lit", readoutId: "signal", entityId: "Cell-1", fields: { value: 5 } },
      { id: "p2-dark", conditionCellId: "dark", readoutId: "signal", entityId: "Cell-2", fields: { value: 3 } },
      { id: "p2-lit-missing", conditionCellId: "lit", readoutId: "signal", entityId: "Cell-2", fields: { value: "" }, placeholder: true },
    ],
    questions: [],
  });
  const pairedCompact = buildMeasurementRecordView(paired, {
    readoutId: "signal",
    patternId: "same_entity_conditions",
  });
  assert.deepEqual(pairedCompact.alignment.identityIds, ["Cell-1", "Cell-2"]);
  assert.equal(pairedCompact.alignment.expectedCoordinateCount, 4);
  assert.deepEqual(pairedCompact.alignment.absentCoordinates, []);
  assert.deepEqual(pairedCompact.alignment.incompleteCoordinates, [{
    conditionCellId: "lit",
    identityId: "Cell-2",
    axisValue: null,
    recordIds: ["p2-lit-missing"],
  }]);

  const repeated = createPrototypeState({
    fixtureId: "repeated-density",
    conditionCells: [{ id: "drug", label: "Drug", status: CONDITION_STATUS.PERFORMED }],
    readouts: [{ id: "signal", label: "Signal", kind: READOUT_KIND.SCALAR }],
    observations: [
      { id: "r1-0", conditionCellId: "drug", readoutId: "signal", entityId: "Cell-1", fields: { time: "0", value: 1 } },
      { id: "r1-5", conditionCellId: "drug", readoutId: "signal", entityId: "Cell-1", fields: { time: "5", value: 2 } },
      { id: "r1-15-missing", conditionCellId: "drug", readoutId: "signal", entityId: "Cell-1", fields: { time: "15", value: "" }, placeholder: true },
      { id: "r2-0", conditionCellId: "drug", readoutId: "signal", entityId: "Cell-2", fields: { time: "0", value: 4 } },
      { id: "r2-5", conditionCellId: "drug", readoutId: "signal", entityId: "Cell-2", fields: { time: "5", value: 6 } },
    ],
    questions: [],
  });
  const repeatedCompact = buildMeasurementRecordView(repeated, {
    readoutId: "signal",
    patternId: "same_entity_sequence",
    axisValues: ["0", "5", "15"],
  });
  assert.deepEqual(repeatedCompact.groups[0].axis.observedValues, ["0", "5", "15"]);
  assert.equal(repeatedCompact.alignment.expectedCoordinateCount, 6);
  assert.deepEqual(repeatedCompact.alignment.incompleteCoordinates[0].recordIds, ["r1-15-missing"]);
  assert.deepEqual(repeatedCompact.alignment.absentCoordinates, [{
    conditionCellId: "drug",
    identityId: "Cell-2",
    axisValue: "15",
  }]);
});

test("nested compact view retains every parent-child path and never promotes child rows to parent n", () => {
  const state = createPrototypeState(nestedFixture());
  const compact = buildMeasurementRecordView(state, {
    readoutId: "intensity",
    patternId: "nested_records",
    nestedFieldKeys: ["dish", "field", "cell"],
  });

  assert.equal(compact.groups[0].observationN, 2);
  assert.equal(compact.groups[0].identity.distinctCount, 1);
  assert.equal(compact.groups[0].verifiedIndependentUnitCount, null, "child record count is not biological n");
  assert.deepEqual(compact.groups[0].identity.ids, ["dish-1"]);
  assert.deepEqual(compact.groups[0].nesting.paths, [
    { values: ["dish-1", "field-1", "cell-1"], recordIds: ["cell-1"] },
    { values: ["dish-1", "field-1", "cell-2"], recordIds: ["cell-2"] },
  ]);
  assert.equal(compact.alignment.kind, "none");
});

test("positive-total compact view reports complete, partial, and missing raw components without replacing them by a ratio", () => {
  const state = createPrototypeState({
    fixtureId: "typed-density",
    conditionCells: [{ id: "control", label: "Control", status: CONDITION_STATUS.PERFORMED }],
    readouts: [{
      id: "rate",
      label: "Positive rate",
      kind: READOUT_KIND.POSITIVE_TOTAL,
      numeratorField: "positiveCells",
      denominatorField: "totalCells",
    }],
    observations: [
      { id: "complete", conditionCellId: "control", readoutId: "rate", entityId: "dish-1", fields: { positiveCells: 5, totalCells: 20 } },
      { id: "partial", conditionCellId: "control", readoutId: "rate", entityId: "dish-2", fields: { positiveCells: 7, totalCells: "" } },
      { id: "missing", conditionCellId: "control", readoutId: "rate", entityId: "dish-3", fields: { positiveCells: "", totalCells: "" } },
      { id: "zero-total", conditionCellId: "control", readoutId: "rate", entityId: "dish-4", fields: { positiveCells: 0, totalCells: 0 } },
      { id: "positive-over-total", conditionCellId: "control", readoutId: "rate", entityId: "dish-5", fields: { positiveCells: 21, totalCells: 20 } },
    ],
    questions: [],
  });
  const compact = buildMeasurementRecordView(state, { readoutId: "rate" });
  const group = compact.groups[0];

  assert.deepEqual(compact.valueFields, ["positiveCells", "totalCells"]);
  assert.equal(group.observationN, 5);
  assert.deepEqual(group.completeRecordIds, ["complete", "zero-total", "positive-over-total"]);
  assert.deepEqual(group.partialRecordIds, ["partial"]);
  assert.deepEqual(group.missingValueRecordIds, ["missing"]);
  assert.deepEqual(group.fieldCoverage[0].presentRecordIds, [
    "complete",
    "partial",
    "zero-total",
    "positive-over-total",
  ]);
  assert.deepEqual(group.fieldCoverage[1].missingRecordIds, ["partial", "missing"]);
  assert.deepEqual(group.derivation.validRecordIds, ["complete"]);
  assert.deepEqual(
    group.derivation.invalid.map((item) => [item.recordId, item.issue.code]),
    [
      ["partial", "incomplete_raw_components"],
      ["missing", "incomplete_raw_components"],
      ["zero-total", "total_must_be_positive"],
      ["positive-over-total", "numerator_exceeds_denominator"],
    ],
  );
  assert.ok(group.derivation.invalid.every((item) =>
    item.issue.rawValuesRetained
    && item.issue.excludedFrom.includes("graph")
    && item.issue.excludedFrom.includes("statistics"),
  ));
  assert.equal("mean" in group, false);
  assert.equal("ratio" in group, false);
});

test("positive-total derivation issues distinguish incomplete, impossible totals, and numerator overflow", () => {
  const readout = {
    id: "rate",
    label: "Positive rate",
    kind: READOUT_KIND.POSITIVE_TOTAL,
    numeratorField: "positiveCells",
    denominatorField: "totalCells",
  };
  const issueFor = (positiveCells, totalCells) => describeMeasurementDerivationIssue(
    { fields: { positiveCells, totalCells } },
    readout,
  );

  assert.equal(issueFor(20, "").code, "incomplete_raw_components");
  assert.equal(issueFor(0, 0).code, "total_must_be_positive");
  assert.equal(issueFor(20, 10).code, "numerator_exceeds_denominator");
  assert.equal(issueFor(-1, 10).code, "numerator_must_not_be_negative");
  assert.equal(issueFor("abc", 10).code, "raw_components_must_be_numeric");
  assert.equal(issueFor(2, 10), null);
  assert.equal(describeMeasurementDerivationIssue({
    placeholder: true,
    entityId: "",
    fields: { positiveCells: "", totalCells: "" },
  }, readout), null, "an untouched spreadsheet entry row must not emit a warning");
  assert.equal(describeMeasurementDerivationIssue({
    placeholder: false,
    entityId: "Dish-1",
    fields: { positiveCells: "", totalCells: "" },
  }, readout).code, "incomplete_raw_components", "an identified row is an incomplete record, not an untouched entry affordance");
});

test("shared-source compact summary distinguishes source identity from condition-specific sample IDs", () => {
  const state = createPrototypeState({
    fixtureId: "shared-source-density",
    conditionCells: [
      { id: "vehicle", label: "Vehicle", status: CONDITION_STATUS.PERFORMED },
      { id: "drug", label: "Drug", status: CONDITION_STATUS.PERFORMED },
    ],
    readouts: [{ id: "signal", label: "Signal", kind: READOUT_KIND.SCALAR }],
    observations: [
      { id: "donor-1-vehicle", conditionCellId: "vehicle", readoutId: "signal", entityId: "Donor-1", fields: { sourceSampleId: "Dish-V1", value: 2 } },
      { id: "donor-1-drug", conditionCellId: "drug", readoutId: "signal", entityId: "Donor-1", fields: { sourceSampleId: "", value: 4 } },
    ],
    questions: [],
  });
  const compact = buildMeasurementRecordView(state, {
    readoutId: "signal",
    patternId: "matched_source_conditions",
  });

  assert.equal(compact.alignment.kind, "shared_source_across_conditions");
  assert.deepEqual(compact.alignment.identityIds, ["Donor-1"]);
  assert.deepEqual(compact.alignment.missingConditionSampleIds, ["donor-1-drug"]);
  assert.deepEqual(compact.groups[0].conditionSampleIdentity.ids, ["Dish-V1"]);
  assert.deepEqual(compact.groups[1].conditionSampleIdentity.missingRecordIds, ["donor-1-drug"]);
});

test("independent compact newline and TSV edits update the same canonical rows seen in detail", () => {
  let state = createPrototypeState({
    fixtureId: "fresh-compact-independent",
    conditionCells: [
      { id: "vehicle", label: "Vehicle", status: CONDITION_STATUS.PERFORMED },
      { id: "drug", label: "Drug", status: CONDITION_STATUS.PERFORMED },
    ],
    readouts: [{ id: "signal", label: "Signal", kind: READOUT_KIND.SCALAR }],
    observations: [],
    questions: [],
  });
  state = ensureConditionMeasurementRowCount(state, {
    conditionCellId: "vehicle",
    readoutId: "signal",
    minimumRowCount: 2,
    blankFields: { note: "keep-local-row" },
  });
  assert.equal(
    buildMeasurementRecordView(state, { readoutId: "signal" }).groups[0]
      .verifiedIndependentUnitCount,
    null,
    "an empty entry affordance must not be labelled as an ID-verified independent unit",
  );
  assert.equal(
    serializeIndependentCompactValues(state, { conditionCellId: "vehicle", readoutId: "signal" }),
    "",
  );
  const result = applyIndependentCompactValues(state, {
    conditionCellId: "vehicle",
    readoutId: "signal",
    text: "15\n\n18",
  });
  const next = result.state;

  assert.deepEqual(result.affectedRecordIds.slice(0, 2), [
    "adaptive-sheet--vehicle--signal--1",
    "adaptive-sheet--vehicle--signal--2",
  ]);
  assert.deepEqual(result.createdRecordIds, ["adaptive-sheet--vehicle--signal--3"]);
  assert.equal(next.observations.find((record) => record.id === "adaptive-sheet--vehicle--signal--1").entityId, "");
  assert.equal(next.observations.find((record) => record.id === "adaptive-sheet--vehicle--signal--1").fields.note, "keep-local-row");
  assert.equal(next.observations.find((record) => record.id === "adaptive-sheet--vehicle--signal--1").fields.value, "15");
  assert.equal(next.observations.find((record) => record.id === "adaptive-sheet--vehicle--signal--2").fields.value, "");
  assert.equal(next.observations.find((record) => record.id === result.createdRecordIds[0]).fields.value, "18");
  assert.equal(
    serializeIndependentCompactValues(next, { conditionCellId: "vehicle", readoutId: "signal" }),
    "15\n\n18",
  );
  const compact = buildMeasurementRecordView(next, {
    readoutId: "signal",
    mode: MEASUREMENT_VIEW_MODE.COMPACT,
  });
  const detail = buildMeasurementRecordView(next, {
    readoutId: "signal",
    mode: MEASUREMENT_VIEW_MODE.DETAIL,
  });
  assert.deepEqual(compact.canonicalRecordIds, detail.canonicalRecordIds);
  assert.deepEqual(detail.groups[0].rows.map((record) => record.id), [
    "adaptive-sheet--vehicle--signal--1",
    "adaptive-sheet--vehicle--signal--2",
    "adaptive-sheet--vehicle--signal--3",
  ]);

  const typed = createPrototypeState({
    fixtureId: "typed-compact-edit",
    conditionCells: [{ id: "control", label: "Control", status: CONDITION_STATUS.PERFORMED }],
    readouts: [{
      id: "rate",
      label: "Positive rate",
      kind: READOUT_KIND.POSITIVE_TOTAL,
      numeratorField: "positive",
      denominatorField: "total",
    }],
    observations: [],
    questions: [],
  });
  assert.throws(
    () => applyIndependentCompactValues(typed, {
      conditionCellId: "control",
      readoutId: "rate",
      text: "5\t20\n7\t25",
    }),
    /compact editing requires detail/,
  );
});

test("values-only compact edit cannot silently reassign records with explicit IDs or source lineage", () => {
  const identified = createPrototypeState(independentFixture());
  const identifiedRecords = identified.observations.filter((record) => record.readoutId === "signal");
  const identifiedDecision = compactMeasurementEditingDecision({
    patternId: "one_per_record",
    readoutKind: READOUT_KIND.SCALAR,
    records: identifiedRecords,
  });
  assert.equal(identifiedDecision.status, "detail_required");
  assert.equal(identifiedDecision.reasonCode, "explicit_identity_requires_fixed_row_edit");
  assert.throws(() => applyIndependentCompactValues(identified, {
    conditionCellId: "vehicle",
    readoutId: "signal",
    text: "12\n10",
  }), /compact editing requires detail/);
  assert.equal(identified.observations.find((record) => record.id === "v1").fields.value, 10);
  assert.equal(identified.observations.find((record) => record.id === "v2").fields.value, 12);

  const imported = createPrototypeState({
    fixtureId: "imported-independent",
    conditionCells: [{ id: "vehicle", label: "Vehicle", status: CONDITION_STATUS.PERFORMED }],
    readouts: [{ id: "signal", label: "Signal", kind: READOUT_KIND.SCALAR }],
    observations: [{
      id: "import-row-7",
      conditionCellId: "vehicle",
      readoutId: "signal",
      entityId: "",
      fields: { value: 10 },
      provenance: { sourceKind: "tsv", sourceRow: 7 },
    }],
    questions: [],
  });
  const importedDecision = compactMeasurementEditingDecision({
    patternId: "one_per_record",
    readoutKind: READOUT_KIND.SCALAR,
    records: imported.observations,
  });
  assert.equal(importedDecision.status, "detail_required");
  assert.equal(importedDecision.reasonCode, "source_lineage_requires_fixed_row_edit");
});

test("compact editing safely requires detail when identity, axis, or hierarchy coordinates carry meaning", () => {
  assert.equal(compactMeasurementEditingDecision({
    patternId: "one_per_record",
    readoutKind: READOUT_KIND.SCALAR,
  }).status, "editable");
  for (const patternId of [
    "typed_record",
    "same_entity_conditions",
    "matched_source_conditions",
    "same_entity_sequence",
    "distinct_entity_sequence",
    "nested_records",
    "nested_sequence",
  ]) {
    const decision = compactMeasurementEditingDecision({
      patternId,
      readoutKind: patternId === "typed_record" ? READOUT_KIND.POSITIVE_TOTAL : READOUT_KIND.SCALAR,
    });
    assert.equal(decision.status, "detail_required", patternId);
    assert.equal(decision.rowPositionImpliesMatch, false, patternId);
    assert.match(decision.reasonCode, /(typed|identity|source|sample|parent|structured)/);
  }
});

test("unexpected repeated-axis records and duplicate coordinates stay visible without changing the declared order", () => {
  const state = createPrototypeState({
    fixtureId: "repeated-axis-import-safety",
    conditionCells: [{ id: "drug", label: "Drug", status: CONDITION_STATUS.PERFORMED }],
    readouts: [{ id: "signal", label: "Signal", kind: READOUT_KIND.SCALAR }],
    observations: [
      { id: "cell-1-t0", conditionCellId: "drug", readoutId: "signal", entityId: "Cell-1", fields: { time: "0", value: 1 } },
      { id: "cell-1-t5-a", conditionCellId: "drug", readoutId: "signal", entityId: "Cell-1", fields: { time: "5", value: 2 } },
      { id: "cell-1-t5-b", conditionCellId: "drug", readoutId: "signal", entityId: "Cell-1", fields: { time: "5", value: 2.5 } },
      { id: "cell-1-t99", conditionCellId: "drug", readoutId: "signal", entityId: "Cell-1", fields: { time: "99", value: 8 } },
    ],
    questions: [],
  });

  const compact = buildMeasurementRecordView(state, {
    readoutId: "signal",
    patternId: "same_entity_sequence",
    axisValues: ["0", "5"],
  });
  const detail = buildMeasurementRecordView(state, {
    readoutId: "signal",
    mode: MEASUREMENT_VIEW_MODE.DETAIL,
    patternId: "same_entity_sequence",
    axisValues: ["0", "5"],
  });
  const columns = buildMeasurementAxisColumns(detail.groups[0].rows, {
    axisField: "time",
    declaredAxisValues: ["0", "5"],
  });

  assert.deepEqual(compact.groups[0].axis.declaredValues, ["0", "5"]);
  assert.deepEqual(compact.groups[0].axis.unexpectedValues, ["99"]);
  assert.deepEqual(columns, [
    { value: "0", declared: true },
    { value: "5", declared: true },
    { value: "99", declared: false },
  ]);
  assert.deepEqual(detail.canonicalRecordIds, [
    "cell-1-t0",
    "cell-1-t5-a",
    "cell-1-t5-b",
    "cell-1-t99",
  ]);
  assert.deepEqual(compact.alignment.duplicateCoordinates, [{
    key: JSON.stringify(["same_entity_sequence", "drug", "Cell-1", "5"]),
    patternId: "same_entity_sequence",
    conditionCellId: "drug",
    entityId: "Cell-1",
    axisValue: "5",
    observationIds: ["cell-1-t5-a", "cell-1-t5-b"],
  }]);
});
