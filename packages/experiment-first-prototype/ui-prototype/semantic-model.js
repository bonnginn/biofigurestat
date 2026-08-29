/**
 * Pure semantic state helpers for the isolated experiment-first UI prototype.
 *
 * This module deliberately has no DOM dependency. The same functions can be
 * imported by the browser prototype and by Node's test runner.
 */

export const CONDITION_STATUS = Object.freeze({
  PERFORMED: "performed",
  NOT_PERFORMED_BY_DESIGN: "not_performed_by_design",
  UNKNOWN: "unknown",
});

export const READOUT_KIND = Object.freeze({
  SCALAR: "scalar",
  POSITIVE_TOTAL: "positive_total",
  RELATED_VALUES: "related_values",
});

export const DEFAULT_UNRESOLVED_ANSWERS = Object.freeze([
  "",
  "unknown",
  "unresolved",
  "not_decided",
  "select",
  "不明",
  "未確認",
  "未選択",
  "選択してください",
  "まだ決めていない",
  "別の順序",
]);

const CONDITION_STATUS_VALUES = new Set(Object.values(CONDITION_STATUS));
const READOUT_KIND_VALUES = new Set(Object.values(READOUT_KIND));
const EXAMPLE_SOURCE_KIND = "prototype_example";
const COORDINATE_PATTERN_KINDS = Object.freeze({
  same_entity_sequence: "condition_entity_axis",
  nested_sequence: "condition_entity_axis",
  distinct_entity_sequence: "condition_entity_axis",
  same_entity_conditions: "condition_entity",
  matched_source_conditions: "condition_entity",
});
const DEFAULT_NON_VALUE_FIELDS = new Set([
  "time",
  "axisValue",
  "conditionCellId",
  "conditionId",
  "entityId",
  "dish",
  "field",
  "cell",
]);

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizedAnswer(value) {
  return value == null ? "" : String(value).trim().toLocaleLowerCase();
}

function isPresentRawValue(value) {
  return value != null && (typeof value !== "string" || value.trim() !== "");
}

function normalizedCoordinatePart(value) {
  return isPresentRawValue(value) ? String(value).trim() : null;
}

function observationHasMeaningfulValue(observation, { axisField, valueFields } = {}) {
  const fields = observation?.fields;
  if (!fields || typeof fields !== "object") return false;
  if (Array.isArray(valueFields)) {
    return valueFields.some((field) => isPresentRawValue(fields[field]));
  }
  return Object.entries(fields).some(([field, value]) =>
    field !== axisField && !DEFAULT_NON_VALUE_FIELDS.has(field) && isPresentRawValue(value),
  );
}

/**
 * Build a collision-safe coordinate key only for patterns where one entered
 * value is expected at a particular repeated or matched coordinate.
 * Incomplete coordinates and independent/nested patterns deliberately return
 * null rather than implying a relationship that the researcher did not state.
 */
export function observationCoordinateKey(
  observation,
  { patternId, axisField = "time" } = {},
) {
  const coordinateKind = COORDINATE_PATTERN_KINDS[patternId];
  if (!coordinateKind) return null;

  const conditionCellId = normalizedCoordinatePart(observation?.conditionCellId);
  const entityId = normalizedCoordinatePart(observation?.entityId);
  if (conditionCellId == null || entityId == null) return null;

  if (coordinateKind === "condition_entity_axis") {
    const axisValue = normalizedCoordinatePart(
      observation?.axisValue ?? observation?.fields?.[axisField] ?? observation?.fields?.axisValue,
    );
    if (axisValue == null) return null;
    return JSON.stringify([patternId, conditionCellId, entityId, axisValue]);
  }

  return JSON.stringify([patternId, conditionCellId, entityId]);
}

/**
 * Detect duplicate values at repeated/matched coordinates without rewriting,
 * merging, or deleting any raw observation. Empty placeholder rows do not
 * count as values. `valueFields` may be supplied for typed readouts; otherwise
 * non-structural raw fields are inspected.
 */
export function findObservationCoordinateConflicts(
  observations,
  { patternId, axisField = "time", valueFields } = {},
) {
  if (!Array.isArray(observations)) throw new TypeError("observations must be an array");
  if (!COORDINATE_PATTERN_KINDS[patternId]) return [];
  if (valueFields != null && !Array.isArray(valueFields)) {
    throw new TypeError("valueFields must be an array when supplied");
  }

  const groups = new Map();
  for (const observation of observations) {
    if (!observationHasMeaningfulValue(observation, { axisField, valueFields })) continue;
    const key = observationCoordinateKey(observation, { patternId, axisField });
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(observation);
  }

  return [...groups.entries()].flatMap(([key, group]) => {
    if (group.length < 2) return [];
    const first = group[0];
    const coordinateKind = COORDINATE_PATTERN_KINDS[patternId];
    return [{
      key,
      patternId,
      conditionCellId: String(first.conditionCellId).trim(),
      entityId: String(first.entityId).trim(),
      axisValue: coordinateKind === "condition_entity_axis"
        ? String(first.axisValue ?? first.fields?.[axisField] ?? first.fields?.axisValue).trim()
        : null,
      observationIds: group.map((observation) => observation.id),
    }];
  });
}

function uniqueById(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || item.id.trim() === "") {
      throw new TypeError(`${label} must have a non-empty string id`);
    }
    if (ids.has(item.id)) throw new TypeError(`${label} id must be unique: ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

/**
 * Validate the JSON-compatible fixture boundary used by the prototype.
 * Throws rather than repairing semantic errors silently.
 */
export function validatePrototypeFixture(fixture) {
  if (!fixture || typeof fixture !== "object") throw new TypeError("fixture must be an object");
  const conditionCells = fixture.conditionCells ?? [];
  const readouts = fixture.readouts ?? [];
  const observations = fixture.observations ?? [];
  const questions = fixture.questions ?? [];
  if (!Array.isArray(conditionCells) || conditionCells.length === 0) {
    throw new TypeError("fixture.conditionCells must contain at least one condition cell");
  }
  if (!Array.isArray(readouts) || readouts.length === 0) {
    throw new TypeError("fixture.readouts must contain at least one readout");
  }
  if (!Array.isArray(observations) || !Array.isArray(questions)) {
    throw new TypeError("fixture observations and questions must be arrays");
  }

  const conditionIds = uniqueById(conditionCells, "condition cell");
  const readoutIds = uniqueById(readouts, "readout");
  uniqueById(observations, "observation");
  uniqueById(questions, "question");

  for (const cell of conditionCells) {
    if (!CONDITION_STATUS_VALUES.has(cell.status)) {
      throw new TypeError(`unsupported condition status for ${cell.id}: ${cell.status}`);
    }
  }
  for (const readout of readouts) {
    if (!READOUT_KIND_VALUES.has(readout.kind)) {
      throw new TypeError(`unsupported readout kind for ${readout.id}: ${readout.kind}`);
    }
    if (readout.kind === READOUT_KIND.POSITIVE_TOTAL) {
      const numeratorField = readout.numeratorField ?? "positive";
      const denominatorField = readout.denominatorField ?? "total";
      if (numeratorField === denominatorField) {
        throw new TypeError(`positive/total fields must be distinct for ${readout.id}`);
      }
    }
    if (readout.kind === READOUT_KIND.RELATED_VALUES) {
      if (!Array.isArray(readout.fields) || readout.fields.length < 2) {
        throw new TypeError(`related-value readout ${readout.id} must define at least two fields`);
      }
      const fieldKeys = new Set();
      for (const field of readout.fields) {
        if (!field || typeof field.key !== "string" || !field.key.trim() || typeof field.label !== "string" || !field.label.trim()) {
          throw new TypeError(`related-value readout ${readout.id} has an invalid field`);
        }
        if (fieldKeys.has(field.key)) throw new TypeError(`related-value field key must be unique: ${field.key}`);
        fieldKeys.add(field.key);
      }
      if (readout.graphField != null && !fieldKeys.has(readout.graphField)) {
        throw new TypeError(`related-value graph field is unknown: ${readout.graphField}`);
      }
    }
  }
  for (const observation of observations) {
    if (!conditionIds.has(observation.conditionCellId)) {
      throw new TypeError(`observation ${observation.id} references an unknown condition cell`);
    }
    if (!readoutIds.has(observation.readoutId)) {
      throw new TypeError(`observation ${observation.id} references an unknown readout`);
    }
    if (!observation.fields || typeof observation.fields !== "object") {
      throw new TypeError(`observation ${observation.id} must retain its raw fields`);
    }
  }
  return true;
}

function normalizedFixture(fixture) {
  validatePrototypeFixture(fixture);
  return {
    schemaVersion: fixture.schemaVersion ?? "experiment-first-ui-semantic-state/0.1.0",
    fixtureId: fixture.fixtureId ?? "anonymous-fixture",
    conditionCells: clone(fixture.conditionCells),
    readouts: clone(fixture.readouts),
    observations: clone(fixture.observations),
    questions: clone(fixture.questions ?? []),
    answers: clone(fixture.answers ?? {}),
  };
}

/**
 * Create working state plus a protected reset snapshot. The caller's fixture
 * is never mutated and the baseline cannot be changed accidentally.
 */
export function createPrototypeState(fixture) {
  const initial = normalizedFixture(fixture);
  const baseline = deepFreeze(clone(initial));
  return { ...clone(initial), baseline };
}

/** Restore the exact initial fixture without depending on mutable UI state. */
export function resetPrototypeState(state) {
  if (!state?.baseline) throw new TypeError("state has no immutable baseline");
  const restored = clone(state.baseline);
  return { ...restored, baseline: state.baseline };
}

function conditionCell(state, conditionCellId) {
  const cell = state.conditionCells.find((candidate) => candidate.id === conditionCellId);
  if (!cell) throw new RangeError(`unknown condition cell: ${conditionCellId}`);
  return cell;
}

/** Return new state; do not delete observations when a condition changes. */
export function setConditionStatus(state, conditionCellId, status) {
  if (!CONDITION_STATUS_VALUES.has(status)) throw new TypeError(`unsupported condition status: ${status}`);
  conditionCell(state, conditionCellId);
  return {
    ...state,
    conditionCells: state.conditionCells.map((cell) =>
      cell.id === conditionCellId ? { ...cell, status } : cell,
    ),
  };
}

/** Store a researcher answer without interpreting free text. */
export function setQuestionAnswer(state, questionId, answer) {
  if (!state.questions.some((question) => question.id === questionId)) {
    throw new RangeError(`unknown question: ${questionId}`);
  }
  return { ...state, answers: { ...state.answers, [questionId]: answer } };
}

/** Insert or replace one raw record, retaining its original field structure. */
export function upsertObservation(state, observation) {
  const candidate = {
    ...state,
    observations: state.observations.some((item) => item.id === observation.id)
      ? state.observations.map((item) => (item.id === observation.id ? clone(observation) : item))
      : [...state.observations, clone(observation)],
  };
  validatePrototypeFixture(candidate);
  return candidate;
}

function exampleObservationBelongsToSet(observation, exampleSetId) {
  return observation?.provenance?.sourceKind === EXAMPLE_SOURCE_KIND
    && observation.provenance.exampleSetId === exampleSetId;
}

function availableExampleObservationId(preferredId, reservedIds) {
  if (!reservedIds.has(preferredId)) return preferredId;
  let suffix = 2;
  while (reservedIds.has(`${preferredId}--example-${suffix}`)) suffix += 1;
  return `${preferredId}--example-${suffix}`;
}

/**
 * Add or refresh one named set of example records without deleting researcher
 * data. Only records carrying this helper's explicit provenance marker for the
 * same `exampleSetId` are replaced. Any incoming id that collides with a
 * preserved record receives a deterministic suffix instead of overwriting it.
 */
export function mergeExampleObservations(
  state,
  examples,
  { exampleSetId = "default" } = {},
) {
  if (!Array.isArray(examples)) throw new TypeError("examples must be an array");
  if (typeof exampleSetId !== "string" || exampleSetId.trim() === "") {
    throw new TypeError("exampleSetId must be a non-empty string");
  }

  const preserved = state.observations.filter(
    (observation) => !exampleObservationBelongsToSet(observation, exampleSetId),
  );
  const reservedIds = new Set(preserved.map((observation) => observation.id));
  const nextExamples = examples.map((example) => {
    if (!example || typeof example.id !== "string" || example.id.trim() === "") {
      throw new TypeError("example observation must have a non-empty string id");
    }
    const id = availableExampleObservationId(example.id, reservedIds);
    reservedIds.add(id);
    return {
      ...clone(example),
      id,
      provenance: {
        ...(clone(example.provenance ?? {})),
        sourceKind: EXAMPLE_SOURCE_KIND,
        exampleSetId,
      },
    };
  });

  const candidate = { ...state, observations: [...preserved, ...nextExamples] };
  validatePrototypeFixture(candidate);
  return candidate;
}

/**
 * Partition raw records according to the explicit condition plan. Records are
 * retained in both branches; only records bound to performed cells are active.
 */
export function partitionObservations(state) {
  const statusByCondition = new Map(state.conditionCells.map((cell) => [cell.id, cell.status]));
  const active = [];
  const excluded = [];
  for (const observation of state.observations) {
    const status = statusByCondition.get(observation.conditionCellId);
    if (status === CONDITION_STATUS.PERFORMED) {
      active.push(observation);
      continue;
    }
    excluded.push({
      observation,
      reason: status === CONDITION_STATUS.UNKNOWN
        ? "condition_status_unknown"
        : "condition_not_performed_by_design",
    });
  }
  return { active, excluded };
}

/** Derive one graphable value while preserving count provenance. */
export function deriveGraphDatum(observation, readout) {
  if (readout.kind === READOUT_KIND.SCALAR) {
    const valueField = readout.valueField ?? "value";
    const rawValue = observation.fields[valueField];
    const value = Number(rawValue);
    if (rawValue === "" || rawValue == null || !Number.isFinite(value)) {
      return { ok: false, reason: "scalar_value_missing_or_invalid" };
    }
    return {
      ok: true,
      value,
      derivation: { kind: "identity", valueField, rawValue },
    };
  }

  if (readout.kind === READOUT_KIND.POSITIVE_TOTAL) {
    const numeratorField = readout.numeratorField ?? "positive";
    const denominatorField = readout.denominatorField ?? "total";
    const numeratorRaw = observation.fields[numeratorField];
    const denominatorRaw = observation.fields[denominatorField];
    const numerator = Number(numeratorRaw);
    const denominator = Number(denominatorRaw);
    if (
      numeratorRaw === "" || numeratorRaw == null || !Number.isFinite(numerator)
      || denominatorRaw === "" || denominatorRaw == null || !Number.isFinite(denominator)
    ) {
      return { ok: false, reason: "positive_total_missing_or_invalid" };
    }
    if (denominator <= 0) return { ok: false, reason: "total_must_be_positive" };
    if (numerator < 0 || numerator > denominator) {
      return { ok: false, reason: "positive_must_be_between_zero_and_total" };
    }
    const value = numerator / denominator;
    return {
      ok: true,
      value,
      percent: value * 100,
      derivation: {
        kind: "ratio",
        numeratorField,
        denominatorField,
        numerator,
        denominator,
        formula: `${numeratorField} / ${denominatorField}`,
      },
    };
  }

  if (readout.kind === READOUT_KIND.RELATED_VALUES) {
    const valueField = readout.graphField ?? readout.fields?.[0]?.key;
    if (!valueField) return { ok: false, reason: "related_value_field_missing" };
    const rawValue = observation.fields[valueField];
    const value = Number(rawValue);
    if (rawValue === "" || rawValue == null || !Number.isFinite(value)) {
      return { ok: false, reason: "related_value_missing_or_invalid", valueField };
    }
    return {
      ok: true,
      value,
      derivation: { kind: "selected_related_value", valueField, rawValue },
    };
  }

  return { ok: false, reason: "unsupported_readout_kind" };
}

/**
 * Build separate, unpadded lists for independent conditions. Row position is
 * never used to invent pairing, and unequal sample sizes remain unequal.
 */
export function buildIndependentConditionSeries(state, { readoutId } = {}) {
  const readout = state.readouts.find((candidate) => candidate.id === readoutId)
    ?? (readoutId == null && state.readouts.length === 1 ? state.readouts[0] : undefined);
  if (!readout) throw new RangeError(`unknown or ambiguous readout: ${readoutId ?? "(not supplied)"}`);

  const { active, excluded } = partitionObservations(state);
  const series = state.conditionCells
    .filter((cell) => cell.status === CONDITION_STATUS.PERFORMED)
    .map((cell) => ({
      conditionCellId: cell.id,
      label: cell.label ?? cell.id,
      points: active
        .filter((observation) => observation.conditionCellId === cell.id && observation.readoutId === readout.id)
        .flatMap((observation) => {
          const datum = deriveGraphDatum(observation, readout);
          return datum.ok ? [{
            observationId: observation.id,
            entityId: observation.entityId ?? null,
            ...datum,
          }] : [];
        }),
    }));

  const invalid = active
    .filter((observation) => observation.readoutId === readout.id)
    .flatMap((observation) => {
      const datum = deriveGraphDatum(observation, readout);
      return datum.ok ? [] : [{ observation, reason: datum.reason }];
    });

  return {
    mode: "independent_condition_lists",
    readoutId: readout.id,
    series,
    excluded: [...excluded, ...invalid],
    rawObservationCount: state.observations.length,
    activeGraphPointCount: series.reduce((count, item) => count + item.points.length, 0),
  };
}

/** A question is complete only when its answer is explicitly resolved. */
export function isResolvedAnswer(answer, question = {}) {
  const value = normalizedAnswer(answer);
  const resolvedAnswers = (question.resolvedAnswers ?? []).map(normalizedAnswer);
  if (resolvedAnswers.length > 0) return resolvedAnswers.includes(value);
  const unresolved = new Set([
    ...DEFAULT_UNRESOLVED_ANSWERS.map(normalizedAnswer),
    ...(question.unresolvedAnswers ?? []).map(normalizedAnswer),
  ]);
  return !unresolved.has(value);
}

/**
 * Graph readiness is data-based. Statistics readiness additionally requires
 * all active semantic questions and every condition-plan cell to be resolved.
 */
export function evaluateReadiness(state, { intent = "statistics", readoutId } = {}) {
  const graph = buildIndependentConditionSeries(state, { readoutId });
  const graphReady = graph.activeGraphPointCount > 0;
  if (intent === "graph") {
    return {
      intent,
      ready: graphReady,
      graphReady,
      unresolvedQuestionIds: [],
      unknownConditionCellIds: [],
    };
  }

  const relevantQuestions = state.questions.filter((question) =>
    question.enabled !== false && (question.requiredFor ?? ["statistics"]).includes(intent),
  );
  const unresolvedQuestionIds = relevantQuestions
    .filter((question) => !isResolvedAnswer(state.answers[question.id], question))
    .map((question) => question.id);
  const unknownConditionCellIds = state.conditionCells
    .filter((cell) => cell.status === CONDITION_STATUS.UNKNOWN)
    .map((cell) => cell.id);

  return {
    intent,
    ready: graphReady && unresolvedQuestionIds.length === 0 && unknownConditionCellIds.length === 0,
    graphReady,
    unresolvedQuestionIds,
    unknownConditionCellIds,
  };
}

/**
 * Evaluate only an explicitly selected condition subset. The returned ids are
 * deduplicated and normalized to condition-plan order, so callers cannot imply
 * pairing or priority through selection order. Conditions outside the subset
 * never block this readiness result.
 *
 * This is a semantic-entry readiness check, not a claim that a statistical
 * model is applicable; the authoritative analysis layer must still validate
 * biological identity, sample size, contrasts, and model support.
 */
export function evaluateComparisonScopeReadiness(
  state,
  { conditionCellIds, readoutId } = {},
) {
  if (!Array.isArray(conditionCellIds) || conditionCellIds.length === 0) {
    throw new TypeError("conditionCellIds must contain at least one condition cell id");
  }
  const requestedIds = new Set();
  for (const id of conditionCellIds) {
    if (typeof id !== "string" || id.trim() === "") {
      throw new TypeError("conditionCellIds must contain non-empty strings");
    }
    requestedIds.add(id);
  }

  const knownIds = new Set(state.conditionCells.map((cell) => cell.id));
  const unknownRequestedIds = [...requestedIds].filter((id) => !knownIds.has(id));
  if (unknownRequestedIds.length > 0) {
    throw new RangeError(`unknown condition cell: ${unknownRequestedIds[0]}`);
  }

  const readout = state.readouts.find((candidate) => candidate.id === readoutId)
    ?? (readoutId == null && state.readouts.length === 1 ? state.readouts[0] : undefined);
  if (!readout) throw new RangeError(`unknown or ambiguous readout: ${readoutId ?? "(not supplied)"}`);

  const selectedCells = state.conditionCells.filter((cell) => requestedIds.has(cell.id));
  const selectedConditionCellIds = selectedCells.map((cell) => cell.id);
  const unknownConditionCellIds = selectedCells
    .filter((cell) => cell.status === CONDITION_STATUS.UNKNOWN)
    .map((cell) => cell.id);
  const notPerformedConditionCellIds = selectedCells
    .filter((cell) => cell.status === CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN)
    .map((cell) => cell.id);

  const validMeasuredConditionIds = new Set(
    state.observations
      .filter((observation) =>
        requestedIds.has(observation.conditionCellId) && observation.readoutId === readout.id,
      )
      .filter((observation) => deriveGraphDatum(observation, readout).ok)
      .map((observation) => observation.conditionCellId),
  );
  const unmeasuredConditionCellIds = selectedCells
    .filter((cell) =>
      cell.status === CONDITION_STATUS.PERFORMED && !validMeasuredConditionIds.has(cell.id),
    )
    .map((cell) => cell.id);

  const relevantQuestions = state.questions.filter((question) =>
    question.enabled !== false && (question.requiredFor ?? ["statistics"]).includes("statistics"),
  );
  const unresolvedQuestionIds = relevantQuestions
    .filter((question) => !isResolvedAnswer(state.answers[question.id], question))
    .map((question) => question.id);
  const graphReady = unknownConditionCellIds.length === 0
    && notPerformedConditionCellIds.length === 0
    && unmeasuredConditionCellIds.length === 0;

  return {
    intent: "comparison_scope",
    ready: graphReady && unresolvedQuestionIds.length === 0,
    graphReady,
    readoutId: readout.id,
    selectedConditionCellIds,
    unresolvedQuestionIds,
    unknownConditionCellIds,
    notPerformedConditionCellIds,
    unmeasuredConditionCellIds,
  };
}
