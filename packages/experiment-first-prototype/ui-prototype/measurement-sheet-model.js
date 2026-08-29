/**
 * DOM-independent helpers for the spreadsheet-like measurement surface.
 *
 * A sheet is a presentation of canonical observations, not a second data
 * model. Independent condition groups deliberately remain separate lists:
 * their row positions never imply pairing and unequal n is never padded into
 * a rectangular biological relationship.
 */

import {
  CONDITION_STATUS,
  READOUT_KIND,
  deriveGraphDatum,
  findObservationCoordinateConflicts,
  validatePrototypeFixture,
} from "./semantic-model.js";

export const CONDITION_MEASUREMENT_SHEET_VERSION =
  "condition-measurement-sheet/0.1.0-prototype";

export const MEASUREMENT_RECORD_VIEW_VERSION =
  "measurement-record-view/0.1.0-prototype";

export const MEASUREMENT_VIEW_MODE = Object.freeze({
  COMPACT: "compact",
  DETAIL: "detail",
});

/**
 * Minimum rows needed to keep one blank spreadsheet row immediately after a
 * typed or pasted range. This is presentation-only and never equalizes n
 * across independent condition groups.
 */
export function rowCountWithTrailingEntryRow({
  currentRowCount,
  startRowIndex,
  enteredRowCount,
} = {}) {
  for (const [name, value] of Object.entries({ currentRowCount, startRowIndex, enteredRowCount })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative safe integer`);
    }
  }
  return Math.max(currentRowCount, startRowIndex + enteredRowCount + 1);
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function requireReadout(state, readoutId) {
  const resolvedId = readoutId ?? state.readouts[0]?.id;
  const readout = state.readouts.find((candidate) => candidate.id === resolvedId);
  if (!readout) throw new RangeError(`unknown readout: ${resolvedId ?? "(missing)"}`);
  return readout;
}

function requireConditionCell(state, conditionCellId) {
  const cell = state.conditionCells.find((candidate) => candidate.id === conditionCellId);
  if (!cell) throw new RangeError(`unknown condition cell: ${conditionCellId}`);
  return cell;
}

function blankReadoutFields(readout) {
  if (readout.kind === READOUT_KIND.POSITIVE_TOTAL) {
    return {
      [readout.numeratorField ?? "positive"]: "",
      [readout.denominatorField ?? "total"]: "",
    };
  }
  if (readout.kind === READOUT_KIND.RELATED_VALUES) {
    return Object.fromEntries((readout.fields ?? []).map((field) => [field.key, ""]));
  }
  return { [readout.valueField ?? "value"]: "" };
}

function idPart(value) {
  return encodeURIComponent(String(value)).replaceAll("%", "_");
}

function nextBlankObservationId(reservedIds, conditionCellId, readoutId, startAt) {
  const base = `adaptive-sheet--${idPart(conditionCellId)}--${idPart(readoutId)}`;
  let ordinal = Math.max(1, startAt);
  while (reservedIds.has(`${base}--${ordinal}`)) ordinal += 1;
  return { id: `${base}--${ordinal}`, nextOrdinal: ordinal + 1 };
}

/**
 * Project observations into one spreadsheet block per condition.
 *
 * Every selected observation becomes exactly one row, in original order.
 * No identity, nested-child value, metadata field, or duplicate raw record is
 * merged. Inactive condition groups remain visible but are marked read-only so
 * retained data is not mistaken for deleted data.
 */
export function buildConditionMeasurementSheets(state, { readoutId } = {}) {
  validatePrototypeFixture(state);
  const readout = requireReadout(state, readoutId);
  const groups = state.conditionCells.map((cell) => {
    const rows = state.observations
      .filter((observation) =>
        observation.conditionCellId === cell.id && observation.readoutId === readout.id,
      )
      .map(clone);
    return {
      conditionCell: clone(cell),
      editable: cell.status === CONDITION_STATUS.PERFORMED,
      rowCount: rows.length,
      rows,
    };
  });
  const selectedObservationIds = new Set(
    groups.flatMap((group) => group.rows.map((observation) => observation.id)),
  );

  return {
    schemaVersion: CONDITION_MEASUREMENT_SHEET_VERSION,
    readout: clone(readout),
    groups,
    selectedObservationCount: selectedObservationIds.size,
    retainedObservationCount: state.observations.length,
    unselectedObservationIds: state.observations
      .filter((observation) => !selectedObservationIds.has(observation.id))
      .map((observation) => observation.id),
  };
}

/**
 * Add only the blank rows missing from one performed condition sheet.
 *
 * Existing observations are never changed or replaced. `blankFields` is for
 * generic structural columns such as dish/field/cell; it is copied into each
 * newly appended row in addition to the readout's empty raw-value fields.
 */
export function ensureConditionMeasurementRowCount(
  state,
  {
    conditionCellId,
    readoutId,
    minimumRowCount,
    blankFields = {},
  } = {},
) {
  validatePrototypeFixture(state);
  if (!Number.isSafeInteger(minimumRowCount) || minimumRowCount < 0) {
    throw new TypeError("minimumRowCount must be a non-negative safe integer");
  }
  if (!blankFields || typeof blankFields !== "object" || Array.isArray(blankFields)) {
    throw new TypeError("blankFields must be an object");
  }

  const cell = requireConditionCell(state, conditionCellId);
  if (cell.status !== CONDITION_STATUS.PERFORMED) {
    throw new RangeError(`cannot add measurement rows to unresolved or unperformed condition: ${cell.id}`);
  }
  const readout = requireReadout(state, readoutId);
  const currentRows = state.observations.filter((observation) =>
    observation.conditionCellId === cell.id && observation.readoutId === readout.id,
  );
  const missingCount = Math.max(0, minimumRowCount - currentRows.length);
  if (missingCount === 0) return state;

  const reservedIds = new Set(state.observations.map((observation) => observation.id));
  const appended = [];
  let ordinal = currentRows.length + 1;
  for (let index = 0; index < missingCount; index += 1) {
    const generated = nextBlankObservationId(
      reservedIds,
      cell.id,
      readout.id,
      ordinal,
    );
    ordinal = generated.nextOrdinal;
    reservedIds.add(generated.id);
    appended.push({
      id: generated.id,
      conditionCellId: cell.id,
      readoutId: readout.id,
      entityId: "",
      fields: {
        ...blankReadoutFields(readout),
        ...clone(blankFields),
      },
      placeholder: true,
      provenance: {
        sourceKind: "adaptive_sheet_blank_row",
        surfaceVersion: CONDITION_MEASUREMENT_SHEET_VERSION,
      },
    });
  }

  const candidate = {
    ...state,
    observations: [...state.observations, ...appended],
  };
  validatePrototypeFixture(candidate);
  return candidate;
}

/** Ensure a minimum number of editable rows independently for every performed condition. */
export function ensurePerformedConditionMeasurementRows(
  state,
  { readoutId, minimumRowCount = 1, blankFields = {} } = {},
) {
  validatePrototypeFixture(state);
  const readout = requireReadout(state, readoutId);
  return state.conditionCells
    .filter((cell) => cell.status === CONDITION_STATUS.PERFORMED)
    .reduce(
      (current, cell) => ensureConditionMeasurementRowCount(current, {
        conditionCellId: cell.id,
        readoutId: readout.id,
        minimumRowCount,
        blankFields,
      }),
      state,
    );
}

function present(value) {
  return value != null && (typeof value !== "string" || value.trim() !== "");
}

function readoutValueFields(readout) {
  if (readout.kind === READOUT_KIND.POSITIVE_TOTAL) {
    return [readout.numeratorField ?? "positive", readout.denominatorField ?? "total"];
  }
  if (readout.kind === READOUT_KIND.RELATED_VALUES) {
    return (readout.fields ?? []).map((field) => field.key);
  }
  return [readout.valueField ?? "value"];
}

/**
 * Translate a failed graph derivation into a researcher-facing, actionable
 * input issue. The raw observation is never repaired or discarded here.
 */
export function describeMeasurementDerivationIssue(observation, readout) {
  const untouchedEntryAffordance = observation.placeholder === true
    && !present(observation.entityId)
    && Object.values(observation.fields ?? {}).every((value) => !present(value));
  if (untouchedEntryAffordance) return null;
  const result = deriveGraphDatum(observation, readout);
  if (result.ok) return null;

  const common = {
    derivationReason: result.reason,
    rawValuesRetained: true,
    excludedFrom: ["graph", "statistics"],
  };
  if (readout.kind === READOUT_KIND.POSITIVE_TOTAL) {
    const numeratorField = readout.numeratorField ?? "positive";
    const denominatorField = readout.denominatorField ?? "total";
    const numeratorRaw = observation.fields?.[numeratorField];
    const denominatorRaw = observation.fields?.[denominatorField];
    if (!present(numeratorRaw) || !present(denominatorRaw)) {
      return {
        ...common,
        code: "incomplete_raw_components",
        message: "陽性数または総数が未入力です。",
      };
    }
    const numerator = Number(numeratorRaw);
    const denominator = Number(denominatorRaw);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
      return {
        ...common,
        code: "raw_components_must_be_numeric",
        message: "陽性数と総数には数値を入力してください。",
      };
    }
    if (denominator <= 0) {
      return {
        ...common,
        code: "total_must_be_positive",
        message: "総数は0より大きい値が必要です。",
      };
    }
    if (numerator < 0) {
      return {
        ...common,
        code: "numerator_must_not_be_negative",
        message: "陽性数は0以上の値が必要です。",
      };
    }
    if (numerator > denominator) {
      return {
        ...common,
        code: "numerator_exceeds_denominator",
        message: "陽性数が総数を超えています。",
      };
    }
  }

  const hasAnyRawValue = readoutValueFields(readout)
    .some((field) => present(observation.fields?.[field]));
  return {
    ...common,
    code: hasAnyRawValue ? "raw_value_invalid" : "raw_value_incomplete",
    message: hasAnyRawValue
      ? "測定値を数値として読み取れません。"
      : "測定値が未入力です。",
  };
}

function uniquePresentValues(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!present(value)) continue;
    const normalized = String(value);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isEntryAffordance(observation, { axisField, nestedFieldKeys }) {
  if (observation.placeholder !== true) return false;
  return ![
    observation.entityId,
    observation.fields?.[axisField],
    observation.fields?.sourceSampleId,
    ...nestedFieldKeys.map((key) => observation.fields?.[key]),
  ].some(present);
}

function nestedPath(observation, nestedFieldKeys) {
  if (!nestedFieldKeys.length) return null;
  const values = nestedFieldKeys.map((key) =>
    present(observation.fields?.[key]) ? String(observation.fields[key]) : null,
  );
  return values.some((value) => value != null) ? values : null;
}

function coordinateKey(conditionCellId, entityId, axisValue) {
  return JSON.stringify([conditionCellId, entityId, axisValue ?? null]);
}

/**
 * Build the ordered-axis columns shown by the complete record table.
 *
 * Declared values retain their declared order. Values found only in canonical
 * observations are appended as explicit, undeclared columns so an import can
 * never become invisible or silently redefine the planned sequence.
 */
export function buildMeasurementAxisColumns(
  records,
  { axisField = "time", declaredAxisValues = [] } = {},
) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  if (!Array.isArray(declaredAxisValues)) {
    throw new TypeError("declaredAxisValues must be an array");
  }

  const columns = [];
  const seen = new Set();
  for (const raw of declaredAxisValues) {
    const value = String(raw);
    if (seen.has(value)) continue;
    seen.add(value);
    columns.push({ value, declared: true });
  }
  for (const record of records) {
    const raw = record?.fields?.[axisField];
    if (!present(raw)) continue;
    const value = String(raw);
    if (seen.has(value)) continue;
    seen.add(value);
    columns.push({ value, declared: false });
  }
  return columns;
}

export function compactMeasurementEditingDecision({
  patternId = "one_per_record",
  readoutKind = READOUT_KIND.SCALAR,
  records = [],
} = {}) {
  if (!Array.isArray(records)) throw new TypeError("records must be an array");
  if (patternId === "one_per_record" && readoutKind === READOUT_KIND.SCALAR) {
    if (records.some((record) => present(record.entityId))) {
      return {
        status: "detail_required",
        reasonCode: "explicit_identity_requires_fixed_row_edit",
        rowPositionImpliesMatch: false,
      };
    }
    const localSourceKinds = new Set([
      "adaptive_sheet_blank_row",
      "compact_condition_paste",
    ]);
    if (records.some((record) =>
      !localSourceKinds.has(record.provenance?.sourceKind)
      || record.provenance?.sourceRow != null
      || record.sourceRow != null,
    )) {
      return {
        status: "detail_required",
        reasonCode: "source_lineage_requires_fixed_row_edit",
        rowPositionImpliesMatch: false,
      };
    }
    return {
      status: "editable",
      rowSemantics: "independent_records_within_condition",
      rowPositionImpliesMatch: false,
    };
  }
  const reasonByPattern = {
    typed_record: "typed_components_require_explicit_columns",
    same_entity_conditions: "identity_rows_required_for_cross_condition_matching",
    matched_source_conditions: "source_and_condition_sample_ids_required",
    same_entity_sequence: "identity_and_axis_coordinates_required",
    distinct_entity_sequence: "sample_id_and_axis_coordinates_required",
    nested_records: "parent_child_columns_required",
    nested_sequence: "parent_child_identity_and_axis_required",
  };
  return {
    status: "detail_required",
    reasonCode: reasonByPattern[patternId] ?? "structured_coordinates_required",
    rowPositionImpliesMatch: false,
  };
}

export function serializeIndependentCompactValues(state, { conditionCellId, readoutId } = {}) {
  validatePrototypeFixture(state);
  requireConditionCell(state, conditionCellId);
  const readout = requireReadout(state, readoutId);
  const valueFields = readoutValueFields(readout);
  const rows = state.observations.filter((record) =>
    record.conditionCellId === conditionCellId && record.readoutId === readout.id,
  );
  let lastMeaningfulRow = rows.length - 1;
  while (lastMeaningfulRow >= 0) {
    const record = rows[lastMeaningfulRow];
    if (
      record.placeholder !== true
      || present(record.entityId)
      || valueFields.some((field) => present(record.fields?.[field]))
    ) break;
    lastMeaningfulRow -= 1;
  }
  return rows
    .slice(0, lastMeaningfulRow + 1)
    .map((record) => valueFields.map((field) => String(record.fields?.[field] ?? "")).join("\t"))
    .join("\n");
}

/**
 * Apply newline/TSV values to an independent condition list. Existing record
 * IDs, identities, metadata, and non-value fields are retained. Additional
 * lines append canonical rows; removing lines blanks value fields but never
 * deletes a record. Callers must first require an `editable` decision above.
 */
export function applyIndependentCompactValues(
  state,
  { conditionCellId, readoutId, text, patternId = "one_per_record" } = {},
) {
  validatePrototypeFixture(state);
  const conditionCell = requireConditionCell(state, conditionCellId);
  if (conditionCell.status !== CONDITION_STATUS.PERFORMED) {
    throw new RangeError(`cannot edit compact values for an unperformed condition: ${conditionCellId}`);
  }
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const readout = requireReadout(state, readoutId);
  const existing = state.observations.filter((record) =>
    record.conditionCellId === conditionCellId && record.readoutId === readout.id,
  );
  const decision = compactMeasurementEditingDecision({
    patternId,
    readoutKind: readout.kind,
    records: existing,
  });
  if (decision.status !== "editable") {
    throw new RangeError(`compact editing requires detail: ${decision.reasonCode}`);
  }
  const valueFields = readoutValueFields(readout);
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized === "" ? [] : normalized.split("\n");
  while (lines.at(-1) === "") lines.pop();
  const values = lines.map((line, rowIndex) => {
    const cells = line.split("\t");
    if (cells.length > valueFields.length) {
      throw new RangeError(
        `${rowIndex + 1}行目に${cells.length}列ありますが、この測定は${valueFields.length}列です`,
      );
    }
    return valueFields.map((_, index) => cells[index] ?? "");
  });

  const reservedIds = new Set(state.observations.map((record) => record.id));
  const replacements = new Map();
  const created = [];
  const affectedRecordIds = [];
  const targetCount = Math.max(existing.length, values.length);
  let nextOrdinal = existing.length + 1;
  for (let index = 0; index < targetCount; index += 1) {
    const rowValues = values[index] ?? valueFields.map(() => "");
    const original = existing[index];
    if (original) {
      const next = {
        ...original,
        placeholder: false,
        fields: {
          ...original.fields,
          ...Object.fromEntries(valueFields.map((field, fieldIndex) => [field, rowValues[fieldIndex]])),
        },
      };
      replacements.set(original.id, next);
      affectedRecordIds.push(original.id);
      continue;
    }
    const generated = nextBlankObservationId(
      reservedIds,
      conditionCellId,
      readout.id,
      nextOrdinal,
    );
    nextOrdinal = generated.nextOrdinal;
    reservedIds.add(generated.id);
    const record = {
      id: generated.id,
      conditionCellId,
      readoutId: readout.id,
      entityId: "",
      fields: Object.fromEntries(
        valueFields.map((field, fieldIndex) => [field, rowValues[fieldIndex]]),
      ),
      placeholder: false,
      provenance: {
        sourceKind: "compact_condition_paste",
        surfaceVersion: MEASUREMENT_RECORD_VIEW_VERSION,
      },
    };
    created.push(record);
    affectedRecordIds.push(record.id);
  }

  const candidate = {
    ...state,
    observations: [
      ...state.observations.map((record) => replacements.get(record.id) ?? record),
      ...created,
    ],
  };
  validatePrototypeFixture(candidate);
  return {
    state: candidate,
    affectedRecordIds,
    createdRecordIds: created.map((record) => record.id),
    inputRowCount: values.length,
    valueFields,
  };
}

function alignmentSummary(
  records,
  conditionCells,
  {
    patternId,
    axisField,
    axisValues,
    valueFields,
    nestedFieldKeys,
  },
) {
  const modeByPattern = {
    same_entity_conditions: "same_entity_across_conditions",
    matched_source_conditions: "shared_source_across_conditions",
    same_entity_sequence: "same_entity_across_axis",
    nested_sequence: "nested_entity_across_axis",
  };
  const kind = modeByPattern[patternId] ?? "none";
  const identityIds = uniquePresentValues(records.map((record) => record.entityId));
  if (kind === "none") {
    return {
      kind,
      identityIds,
      rowPositionImpliesMatch: false,
      expectedCoordinateCount: null,
      absentCoordinates: [],
      incompleteCoordinates: [],
      duplicateCoordinates: findObservationCoordinateConflicts(records, {
        patternId,
        axisField,
        valueFields,
      }),
      missingConditionSampleIds: [],
    };
  }

  const performedConditionIds = conditionCells
    .filter((cell) => cell.status === CONDITION_STATUS.PERFORMED)
    .map((cell) => cell.id);
  const expected = [];
  if (["same_entity_across_conditions", "shared_source_across_conditions"].includes(kind)) {
    for (const identityId of identityIds) {
      for (const conditionCellId of performedConditionIds) {
        expected.push({ conditionCellId, identityId, axisValue: null });
      }
    }
  } else {
    for (const conditionCellId of performedConditionIds) {
      const conditionIdentities = uniquePresentValues(
        records
          .filter((record) => record.conditionCellId === conditionCellId)
          .map((record) => record.entityId),
      );
      for (const identityId of conditionIdentities) {
        for (const axisValue of axisValues) {
          expected.push({ conditionCellId, identityId, axisValue: String(axisValue) });
        }
      }
    }
  }

  const recordsByCoordinate = new Map();
  for (const record of records) {
    const axisValue = kind.endsWith("across_axis")
      ? String(record.fields?.[axisField] ?? "")
      : null;
    const key = coordinateKey(record.conditionCellId, String(record.entityId ?? ""), axisValue);
    if (!recordsByCoordinate.has(key)) recordsByCoordinate.set(key, []);
    recordsByCoordinate.get(key).push(record);
  }

  const absentCoordinates = [];
  const incompleteCoordinates = [];
  for (const coordinate of expected) {
    const recordsAtCoordinate = recordsByCoordinate.get(
      coordinateKey(coordinate.conditionCellId, coordinate.identityId, coordinate.axisValue),
    ) ?? [];
    if (!recordsAtCoordinate.length) {
      absentCoordinates.push(coordinate);
      continue;
    }
    if (!recordsAtCoordinate.some((record) => valueFields.every((field) => present(record.fields?.[field])))) {
      incompleteCoordinates.push({
        ...coordinate,
        recordIds: recordsAtCoordinate.map((record) => record.id),
      });
    }
  }

  return {
    kind,
    identityIds,
    rowPositionImpliesMatch: false,
    expectedCoordinateCount: expected.length,
    absentCoordinates,
    incompleteCoordinates,
    duplicateCoordinates: findObservationCoordinateConflicts(records, {
      patternId,
      axisField,
      valueFields,
    }),
    missingConditionSampleIds: kind === "shared_source_across_conditions"
      ? records
          .filter((record) => !present(record.fields?.sourceSampleId))
          .map((record) => record.id)
      : [],
    nestedFieldKeys: [...nestedFieldKeys],
  };
}

/**
 * Project one canonical observation set into either a compact audit summary or
 * the complete editable rows. Switching modes never aggregates, pads, merges,
 * deletes, or re-identifies a record: `canonicalRecordIds` is identical in
 * both projections and every compact count carries the contributing row IDs.
 */
export function buildMeasurementRecordView(
  state,
  {
    readoutId,
    mode = MEASUREMENT_VIEW_MODE.COMPACT,
    patternId = "one_per_record",
    axisField = "time",
    axisValues = [],
    nestedFieldKeys = [],
  } = {},
) {
  validatePrototypeFixture(state);
  if (!Object.values(MEASUREMENT_VIEW_MODE).includes(mode)) {
    throw new TypeError(`unsupported measurement view mode: ${mode}`);
  }
  if (!Array.isArray(axisValues) || !Array.isArray(nestedFieldKeys)) {
    throw new TypeError("axisValues and nestedFieldKeys must be arrays");
  }
  const readout = requireReadout(state, readoutId);
  const valueFields = readoutValueFields(readout);
  const records = state.observations.filter((record) => record.readoutId === readout.id);
  const canonicalRecordIds = records.map((record) => record.id);
  const base = {
    schemaVersion: MEASUREMENT_RECORD_VIEW_VERSION,
    mode,
    readout: clone(readout),
    valueFields,
    canonicalRecordIds,
    canonicalRecordCount: canonicalRecordIds.length,
    retainedObservationCount: state.observations.length,
    unselectedObservationIds: state.observations
      .filter((record) => record.readoutId !== readout.id)
      .map((record) => record.id),
  };

  if (mode === MEASUREMENT_VIEW_MODE.DETAIL) {
    const detail = buildConditionMeasurementSheets(state, { readoutId: readout.id });
    return { ...base, groups: detail.groups };
  }

  const groups = state.conditionCells.map((conditionCell) => {
    const groupRecords = records.filter((record) => record.conditionCellId === conditionCell.id);
    const entryAffordances = groupRecords.filter((record) =>
      isEntryAffordance(record, { axisField, nestedFieldKeys }),
    );
    const summarizedRecords = groupRecords.filter((record) => !entryAffordances.includes(record));
    const fieldCoverage = valueFields.map((field) => ({
      field,
      presentRecordIds: summarizedRecords
        .filter((record) => present(record.fields?.[field]))
        .map((record) => record.id),
      missingRecordIds: summarizedRecords
        .filter((record) => !present(record.fields?.[field]))
        .map((record) => record.id),
    }));
    const completeRecordIds = summarizedRecords
      .filter((record) => valueFields.every((field) => present(record.fields?.[field])))
      .map((record) => record.id);
    const partialRecordIds = summarizedRecords
      .filter((record) => {
        const presentCount = valueFields.filter((field) => present(record.fields?.[field])).length;
        return presentCount > 0 && presentCount < valueFields.length;
      })
      .map((record) => record.id);
    const missingValueRecordIds = summarizedRecords
      .filter((record) => valueFields.every((field) => !present(record.fields?.[field])))
      .map((record) => record.id);
    const identityIds = uniquePresentValues(summarizedRecords.map((record) => record.entityId));
    const missingIdentityRecordIds = summarizedRecords
      .filter((record) => !present(record.entityId))
      .map((record) => record.id);
    const paths = [];
    const seenPaths = new Set();
    for (const record of summarizedRecords) {
      const values = nestedPath(record, nestedFieldKeys);
      if (!values) continue;
      const key = JSON.stringify(values);
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);
      paths.push({ values, recordIds: summarizedRecords
        .filter((candidate) => JSON.stringify(nestedPath(candidate, nestedFieldKeys)) === key)
        .map((candidate) => candidate.id) });
    }
    const observedAxisValues = uniquePresentValues(
      summarizedRecords.map((record) => record.fields?.[axisField]),
    );
    const declaredAxisValues = axisValues.map(String);
    const derived = summarizedRecords.map((record) => {
      const result = deriveGraphDatum(record, readout);
      return {
        recordId: record.id,
        result,
        issue: result.ok ? null : describeMeasurementDerivationIssue(record, readout),
      };
    });
    return {
      conditionCell: clone(conditionCell),
      canonicalRecordIds: groupRecords.map((record) => record.id),
      observationN: summarizedRecords.length,
      completeValueN: completeRecordIds.length,
      completeRecordIds,
      partialRecordIds,
      missingValueRecordIds,
      entryAffordanceRecordIds: entryAffordances.map((record) => record.id),
      fieldCoverage,
      identity: {
        ids: identityIds,
        distinctCount: identityIds.length,
        missingRecordIds: missingIdentityRecordIds,
      },
      verifiedIndependentUnitCount:
        patternId === "one_per_record"
        && summarizedRecords.length > 0
        && missingIdentityRecordIds.length === 0
        && identityIds.length === summarizedRecords.length
          ? identityIds.length
          : null,
      conditionSampleIdentity: {
        ids: uniquePresentValues(summarizedRecords.map((record) => record.fields?.sourceSampleId)),
        missingRecordIds: summarizedRecords
          .filter((record) => !present(record.fields?.sourceSampleId))
          .map((record) => record.id),
      },
      nesting: {
        fieldKeys: [...nestedFieldKeys],
        paths,
        missingByField: nestedFieldKeys.map((field) => ({
          field,
          recordIds: summarizedRecords
            .filter((record) => !present(record.fields?.[field]))
            .map((record) => record.id),
        })),
      },
      axis: {
        field: axisField,
        declaredValues: declaredAxisValues,
        observedValues: observedAxisValues,
        unexpectedValues: observedAxisValues.filter((value) => !declaredAxisValues.includes(value)),
      },
      derivation: {
        validRecordIds: derived
          .filter((item) => item.result.ok)
          .map((item) => item.recordId),
        invalid: derived
          .filter((item) => !item.result.ok)
          .map((item) => ({
            recordId: item.recordId,
            reason: item.result.reason,
            issue: item.issue,
          })),
      },
    };
  });

  return {
    ...base,
    groups,
    alignment: alignmentSummary(records, state.conditionCells, {
      patternId,
      axisField,
      axisValues,
      valueFields,
      nestedFieldKeys,
    }),
  };
}
