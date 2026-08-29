import { CONDITION_STATUS, READOUT_KIND } from "./semantic-model.js";

export const GUIDED_ENTRY_VERSION = "guided-entry/0.1.0-prototype";

const OBSERVATION_LAYOUTS = new Set([
  "one_each",
  "multiple_inside",
  "sequence",
  "combined",
]);

/**
 * Example buttons are shortcuts for the visible condition/readout step only.
 * Scientific material-flow and observation-shape answers must always come
 * from the researcher after the condition canvas has been reviewed.
 */
export function prepareGuideExampleForVisibleStep(example = {}) {
  return {
    experimentLabel: String(example.experimentLabel ?? ""),
    conditionChangeCount: example.conditionChangeCount,
    dimensions: Array.isArray(example.dimensions)
      ? example.dimensions.map((dimension) => ({ ...dimension }))
      : [],
    combinationAnswer: example.combinationAnswer,
    measurement: { ...(example.measurement ?? {}) },
    observation: {
      shape: "unknown",
      sourceRelation: "unknown",
      sourceLinkage: "unknown",
      sequenceIdentity: "unknown",
    },
  };
}

/**
 * Do not infer "one value" merely because no child/axis detail was entered.
 * The layout is a structure-changing biological fact and therefore requires
 * an explicit answer.
 */
export function deriveObservationGuideShape({ sourceLabel = "", layout = "unknown" } = {}) {
  if (!String(sourceLabel).trim()) return "unknown";
  return OBSERVATION_LAYOUTS.has(layout) ? layout : "unknown";
}

/** Pairing/matching may only be created when its source linkage is recoverable. */
export function evaluateSourceLinkage({ sourceRelation = "unknown", sourceLinkage = "unknown" } = {}) {
  const linkageRequired = ["literal_same_entity", "shared_source_separate_samples"].includes(sourceRelation);
  if (!linkageRequired) return { status: "ready", required: false };
  if (["existing_id", "enter_together"].includes(sourceLinkage)) {
    return { status: "ready", required: true, mode: sourceLinkage };
  }
  if (sourceLinkage === "irrecoverable") {
    return {
      status: "safe_unsupported",
      questionId: "ASK_SOURCE_LINKAGE",
      message: "条件間の対応を復元できない値を、行番号だけで同じ対象として結びません。",
    };
  }
  return { status: "needs_information", questionId: "ASK_SOURCE_LINKAGE" };
}

function stableKey(label, fallback) {
  const normalized = String(label ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/(^|\s)\+(?=\s|$)/g, " plus ")
    .replace(/(^|\s)-(?=\s|$)/g, " minus ")
    .replace(/[−–]/g, " minus ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function splitMembers(text) {
  return text.split(/[、,\t]/).map((value) => value.trim()).filter(Boolean);
}

function normalizedUnit(value) {
  const unit = String(value ?? "").trim();
  return unit || null;
}

function generatedExperimentTitle(dimensions, measurementLabel) {
  const conditionLabels = dimensions.map((dimension) => dimension?.label).filter(Boolean);
  if (conditionLabels.length && measurementLabel) return `${conditionLabels.join(" × ")}での${measurementLabel}`;
  if (measurementLabel) return `${measurementLabel}の実験`;
  if (conditionLabels.length) return `${conditionLabels.join(" × ")}の実験`;
  return "新しい実験";
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Add a display-only unit suffix without changing the researcher-entered raw label. */
function withUnitSuffix(value, unit) {
  const label = String(value ?? "").trim();
  const suffix = normalizedUnit(unit);
  if (!label || !suffix) return label;
  const normalizedLabel = label.normalize("NFKC");
  const normalizedSuffix = suffix.normalize("NFKC");
  const suffixPattern = new RegExp(
    `(?:^|[^\\p{L}])${escapeRegularExpression(normalizedSuffix)}(?:\\s*[)\\]])?$`,
    "iu",
  );
  return suffixPattern.test(normalizedLabel) ? label : `${label} ${suffix}`;
}

function parseRelatedValueFields(text) {
  const labels = String(text ?? "")
    .replace(/\r/g, "")
    .split(/[\n\t、,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (labels.length < 2) {
    return {
      status: "needs_information",
      issues: [{
        code: "RELATED_FIELDS_REQUIRED",
        questionId: "ASK_RELATED_FIELDS",
        message: "同じ試料から記録した元の値を2つ以上、1行に1つ入力してください。",
      }],
    };
  }
  const fields = labels.map((label, index) => ({
    key: stableKey(label, `field-${index + 1}`),
    label,
  }));
  const duplicateKeys = fields.filter(
    (field, index) => fields.findIndex((candidate) => candidate.key === field.key) !== index,
  );
  if (duplicateKeys.length) {
    return {
      status: "needs_information",
      issues: [{
        code: "RELATED_FIELD_DUPLICATE",
        questionId: "ASK_RELATED_FIELDS",
        message: "関連する元の値に同じ名前があります。列を区別できる名前にしてください。",
      }],
    };
  }
  return { status: "ready", fields };
}

/**
 * Researcher-facing value syntax:
 *   control
 *   Gene A: #1, #2, #3
 * The group name is a non-selectable heading; only concrete members become
 * condition values.
 */
export function parseGuidedValues(text, dimensionKey = "condition") {
  const entries = [];
  const issues = [];
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  for (const [lineIndex, line] of lines.entries()) {
    const separator = line.search(/[:：]/);
    if (separator >= 0) {
      const groupLabel = line.slice(0, separator).trim();
      const members = splitMembers(line.slice(separator + 1));
      if (!groupLabel || !members.length) {
        issues.push({ code: "INVALID_GROUP_LINE", line: lineIndex + 1, message: "まとめ名と、その中の具体的な処理を入力してください。" });
        continue;
      }
      for (const member of members) entries.push({ label: member, groupLabel });
      continue;
    }
    const members = splitMembers(line);
    for (const member of members) entries.push({ label: member, groupLabel: null });
  }
  if (issues.length) return { status: "needs_information", issues };
  return parseGuidedValueEntries(entries, dimensionKey);
}

/**
 * Structured entry path used by the spreadsheet UI. Unlike the legacy text
 * syntax, punctuation such as ':' remains part of a simple condition label.
 */
export function parseGuidedValueEntries(entries, dimensionKey = "condition") {
  const issues = [];
  const groups = [];
  const values = [];
  const groupByLabel = new Map();
  for (const [entryIndex, entry] of (Array.isArray(entries) ? entries : []).entries()) {
    const label = String(entry?.label ?? "").trim();
    const groupLabel = String(entry?.groupLabel ?? "").trim() || null;
    if (!label) {
      issues.push({ code: "EMPTY_VALUE", line: entryIndex + 1, message: "空の条件があります。条件名を入力するか、その行を削除してください。" });
      continue;
    }
    let groupKey = null;
    if (groupLabel) {
      const normalizedGroup = groupLabel.normalize("NFKC").toLocaleLowerCase();
      let group = groupByLabel.get(normalizedGroup);
      if (!group) {
        group = { key: `${dimensionKey}-group-${stableKey(groupLabel, String(groups.length + 1))}`, label: groupLabel };
        groupByLabel.set(normalizedGroup, group);
        groups.push(group);
      }
      groupKey = group.key;
    }
    values.push({
      key: groupLabel
        ? `${dimensionKey}-${stableKey(groupLabel, String(entryIndex + 1))}-${stableKey(label, String(entryIndex + 1))}`
        : `${dimensionKey}-${stableKey(label, String(entryIndex + 1))}`,
      label,
      displayLabel: groupLabel ? `${groupLabel} ${label}` : label,
      groupKey,
      groupLabel,
    });
  }
  const duplicateGroupKeys = groups.filter((group, index) => groups.findIndex((candidate) => candidate.key === group.key) !== index);
  const duplicateValueKeys = values.filter((value, index) => values.findIndex((candidate) => candidate.key === value.key) !== index);
  if (duplicateGroupKeys.length) issues.push({ code: "DUPLICATE_GROUP", line: null, message: "同じまとめ名が複数回あります。1行にまとめてください。" });
  if (duplicateValueKeys.length) issues.push({ code: "DUPLICATE_VALUE", line: null, message: "同じ条件が複数回あります。名前を区別してください。" });
  if (!values.length) issues.push({ code: "VALUES_REQUIRED", line: null, message: "実際に行った条件を1つ以上入力してください。" });
  return issues.length ? { status: "needs_information", issues } : { status: "ready", groups, values };
}

/** Stable ID columns for a researcher-entered material path such as Dish → Field → Cell. */
export function buildNestedLevels(labels) {
  return (Array.isArray(labels) ? labels : [])
    .map((label) => String(label ?? "").trim())
    .filter(Boolean)
    .map((label, index) => ({ key: `nest_${index}`, label }));
}

function conditionCells(rows, columns, status) {
  return rows.flatMap((row) => columns.map((column) => ({
    id: `${row.id}__${column.id}`,
    label: columns.length === 1 ? row.displayLabel : `${row.displayLabel} / ${column.displayLabel}`,
    rowId: row.id,
    columnId: column.id,
    status,
  })));
}

function statisticsQuestions(conditionCount) {
  const questions = [{
    id: "independent_runs",
    wording: "別々に始めた実験は何回ありますか？",
    options: [["select", "選択してください"], ["one", "1回"], ["two", "2回"], ["three", "3回"], ["four", "4回"], ["five_plus", "5回以上"], ["unknown", "不明"]],
    resolvedAnswers: ["one", "two", "three", "four", "five_plus"],
    requiredFor: ["statistics"],
  }];
  if (conditionCount > 1) {
    questions.push({
      id: "source_split",
      wording: "この比較に使う条件は、同じ元の材料を分けて作りましたか？",
      options: [["select", "選択してください"], ["split", "同じ元から分けた"], ["separate", "別々に準備した"], ["mixed", "両方が含まれる"], ["unknown", "不明"]],
      resolvedAnswers: ["split", "separate", "mixed"],
      requiredFor: ["statistics"],
    });
  }
  return questions;
}

export function mapObservationGuide(answer, readoutKind = READOUT_KIND.SCALAR) {
  const shape = answer?.shape ?? "unknown";
  if (shape === "unknown") return { status: "needs_information", questionId: "ASK_RECORD_SHAPE" };
  if (shape === "one_each") {
    const identityKind = answer?.identityKind ?? "unknown";
    if (identityKind === "literal_same_entity") return { status: "ready", patternId: "same_entity_conditions" };
    if (identityKind === "shared_source_separate_samples") return { status: "ready", patternId: "matched_source_conditions" };
    const typed = readoutKind === READOUT_KIND.POSITIVE_TOTAL || readoutKind === READOUT_KIND.RELATED_VALUES;
    return { status: "ready", patternId: typed ? "typed_record" : "one_per_record" };
  }
  if (shape === "same_across_conditions") {
    const identityKind = answer?.identityKind ?? "unknown";
    if (identityKind === "literal_same_entity") return { status: "ready", patternId: "same_entity_conditions" };
    if (identityKind === "shared_source_separate_samples") return { status: "ready", patternId: "matched_source_conditions" };
    if (identityKind === "same_type_only") return { status: "ready", patternId: "one_per_record" };
    return { status: "needs_information", questionId: "ASK_CONDITION_IDENTITY_KIND" };
  }
  if (shape === "multiple_inside") return { status: "ready", patternId: "nested_records" };
  if (shape === "combined") {
    const sequenceIdentity = answer?.sequenceIdentity ?? "unknown";
    if (sequenceIdentity === "same") return { status: "ready", patternId: "nested_sequence" };
    if (sequenceIdentity === "unknown") {
      return { status: "needs_information", questionId: "ASK_SEQUENCE_IDENTITY" };
    }
    return {
      status: "safe_unsupported",
      questionId: "ASK_COMBINED_OBSERVATION_DETAIL",
      message: "階層内で時点ごとに別の試料を使う構造は、同じ対象の反復表へ単純化しません。",
    };
  }
  if (shape === "sequence") {
    if (!answer.sequenceIdentity || answer.sequenceIdentity === "unknown") {
      return { status: "needs_information", questionId: "ASK_SEQUENCE_IDENTITY" };
    }
    return {
      status: "ready",
      patternId: answer.sequenceIdentity === "same" ? "same_entity_sequence" : "distinct_entity_sequence",
    };
  }
  return { status: "needs_information", questionId: "ASK_RECORD_SHAPE" };
}

/** Builds the same condition model whether values came from prompts or direct editing. */
export function buildGuidedPrototypeDefinition(answers) {
  const issues = [];
  if (answers?.schemaVersion !== GUIDED_ENTRY_VERSION) issues.push({ code: "VERSION", questionId: null, message: "この入力versionは読み取れません。" });
  const experimentLabel = String(answers?.experimentLabel ?? "").trim();
  if (answers?.conditionChangeCount === "unknown") {
    issues.push({ code: "CONDITION_CHANGE_COUNT_REQUIRED", questionId: "ASK_CONDITION_CHANGE_COUNT", message: "条件として変えたものの数を選んでください。" });
  }
  if (answers?.conditionChangeCount === "3plus") {
    issues.push({ code: "TOO_MANY_DIMENSIONS_FOR_WIRE", questionId: "ASK_CONDITION_CHANGE_COUNT", message: "3つ以上の条件要素は省略せず保持しますが、この画面prototypeではまだ条件表を生成できません。" });
  }
  const dimensionAnswers = Array.isArray(answers?.dimensions) ? answers.dimensions.slice(0, 2) : [];
  if ((answers?.dimensions?.length ?? 0) > 2) issues.push({ code: "TOO_MANY_DIMENSIONS_FOR_WIRE", questionId: null, message: "この画面prototypeでは条件の軸は2つまでです。" });
  const parsedDimensions = dimensionAnswers.map((dimension, index) => {
    const label = String(dimension.label ?? "").trim();
    if (!label) issues.push({ code: "DIMENSION_LABEL_REQUIRED", questionId: `ASK_DIMENSION_${index + 1}`, message: `${index + 1}つ目の条件名を入力してください。` });
    const key = `dimension-${index + 1}-${stableKey(label, String(index + 1))}`;
    const parsed = Array.isArray(dimension.entries)
      ? parseGuidedValueEntries(dimension.entries, key)
      : parseGuidedValues(dimension.valuesText, key);
    if (parsed.status !== "ready") {
      for (const candidate of parsed.issues) issues.push({ ...candidate, questionId: `ASK_DIMENSION_${index + 1}` });
      return null;
    }
    const kind = dimension.kind === "ordered" ? "ordered" : "nominal";
    const unit = kind === "ordered" ? normalizedUnit(dimension.unit) : null;
    return {
      key,
      label,
      kind,
      unit,
      groups: parsed.groups,
      values: parsed.values.map((value) => ({
        ...value,
        displayLabel: kind === "ordered" ? withUnitSuffix(value.displayLabel, unit) : value.displayLabel,
      })),
    };
  }).filter(Boolean);
  const measurementLabel = String(answers?.measurement?.label ?? "").trim();
  if (!measurementLabel) issues.push({ code: "MEASUREMENT_REQUIRED", questionId: "ASK_MEASUREMENT", message: "何を測ったか入力してください。" });
  const form = answers?.measurement?.form;
  let relatedFields = [];
  if (form === "multiple_related") {
    const parsedRelated = parseRelatedValueFields(answers?.measurement?.relatedFieldsText);
    if (parsedRelated.status !== "ready") issues.push(...parsedRelated.issues);
    else relatedFields = parsedRelated.fields;
  } else if (!["scalar", "positive_total"].includes(form)) {
    issues.push({ code: "MEASUREMENT_FORM_REQUIRED", questionId: "ASK_MEASUREMENT_FORM", message: "元の測定値の形を選んでください。どれにも当てはまらない場合は推測せず停止します。" });
  }
  const title = experimentLabel || generatedExperimentTitle(parsedDimensions, measurementLabel);
  const combinationAnswer = answers?.combinationAnswer;
  const combinationPending = !["all_performed", "review_each"].includes(combinationAnswer);
  const readoutKind = form === "positive_total"
    ? READOUT_KIND.POSITIVE_TOTAL
    : form === "multiple_related"
      ? READOUT_KIND.RELATED_VALUES
      : READOUT_KIND.SCALAR;
  const observation = mapObservationGuide(answers?.observation, readoutKind);
  if (issues.length) return { status: "needs_information", issues };

  const only = { id: "only", label: "実施", displayLabel: "実施", groupKey: null, groupLabel: null };
  const rows = parsedDimensions[0]?.values.map((value) => ({ id: value.key, label: value.label, displayLabel: value.displayLabel, groupLabel: value.groupLabel })) ?? [{ id: "one-condition", label: "この実験", displayLabel: "この実験", groupLabel: null }];
  const columns = parsedDimensions[1]?.values.map((value) => ({ id: value.key, label: value.label, displayLabel: value.displayLabel, groupLabel: value.groupLabel })) ?? [only];
  const initialStatus = combinationAnswer === "all_performed" ? CONDITION_STATUS.PERFORMED : CONDITION_STATUS.UNKNOWN;
  const cells = conditionCells(rows, columns, initialStatus);
  const axisRawValues = String(answers?.observation?.axisValuesText ?? "")
    .split(/[、,\t\n]/).map((value) => value.trim()).filter(Boolean);
  const axisUnit = normalizedUnit(answers?.observation?.axisUnit);
  const axisValues = axisRawValues.map((value) => withUnitSuffix(value, axisUnit));
  const fallbackPattern = readoutKind === READOUT_KIND.SCALAR ? "one_per_record" : "typed_record";
  const patternId = observation.status === "ready" ? observation.patternId : fallbackPattern;
  return {
    status: "ready",
    definition: {
      title,
      titleSource: experimentLabel ? "researcher" : "generated",
      rowLabel: parsedDimensions[0]?.label ?? "実験",
      rows,
      columns,
      help: combinationAnswer === "all_performed"
        ? "回答から条件表を作りました。実際と違うマスは状態を選び直せます。"
        : "各マスで、実施した・実施していない・まだ不明を確認してください。",
      defaultPattern: patternId,
      observationPending: observation.status !== "ready",
      combinationPending,
      patternCandidates: [...new Set([
        patternId,
        "one_per_record",
        "same_entity_conditions",
        "matched_source_conditions",
        "nested_records",
        "nested_sequence",
        "same_entity_sequence",
        "distinct_entity_sequence",
      ])],
      axisValues,
      axisRawValues,
      axisUnit,
      dimensionMetadata: parsedDimensions,
      fixture: {
        fixtureId: `guided-${stableKey(title, "experiment")}`,
        conditionCells: cells,
        readouts: [{
          id: `readout-${stableKey(measurementLabel, "value")}`,
          label: measurementLabel,
          kind: readoutKind,
          ...(readoutKind === READOUT_KIND.POSITIVE_TOTAL
            ? { numeratorField: "positive", denominatorField: "total" }
            : readoutKind === READOUT_KIND.RELATED_VALUES
              ? { fields: relatedFields, graphField: relatedFields[0].key }
              : { valueField: "value" }),
        }],
        observations: [],
        questions: statisticsQuestions(cells.length),
      },
      demo(model) {
        return model.conditionCells.filter((cell) => cell.status === CONDITION_STATUS.PERFORMED).map((cell, index) => ({
          id: `guided-demo-${index + 1}`,
          conditionCellId: cell.id,
          readoutId: model.readouts[0].id,
          entityId: `Example-${index + 1}`,
          fields: readoutKind === READOUT_KIND.POSITIVE_TOTAL
            ? { positive: 18 + index * 3, total: 50 + index * 5 }
            : readoutKind === READOUT_KIND.RELATED_VALUES
              ? Object.fromEntries(relatedFields.map((field, fieldIndex) => [field.key, 10 + index * 2 + fieldIndex]))
              : { value: 10 + index * 2 },
        }));
      },
    },
  };
}

const DIRECT_STATUS = new Map([
  ["実施", CONDITION_STATUS.PERFORMED],
  ["実施した", CONDITION_STATUS.PERFORMED],
  ["行った", CONDITION_STATUS.PERFORMED],
  ["performed", CONDITION_STATUS.PERFORMED],
  ["yes", CONDITION_STATUS.PERFORMED],
  ["✓", CONDITION_STATUS.PERFORMED],
  ["非実施", CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN],
  ["最初からなし", CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN],
  ["最初から作らなかった", CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN],
  ["行っていない", CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN],
  ["not performed", CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN],
  ["no", CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN],
  ["—", CONDITION_STATUS.NOT_PERFORMED_BY_DESIGN],
  ["不明", CONDITION_STATUS.UNKNOWN],
  ["まだ不明", CONDITION_STATUS.UNKNOWN],
  ["未確認", CONDITION_STATUS.UNKNOWN],
  ["unknown", CONDITION_STATUS.UNKNOWN],
  ["?", CONDITION_STATUS.UNKNOWN],
  ["", CONDITION_STATUS.UNKNOWN],
]);

function splitDirectLine(line, delimiter) {
  return line.split(delimiter).map((value) => value.trim());
}

/**
 * Parse a researcher-authored condition table. The matrix contains condition
 * plan facts only; numeric observations are deliberately handled later.
 */
export function buildPastedConditionDefinition(input) {
  const text = String(input?.matrixText ?? "").replace(/\r/g, "").trimEnd();
  const delimiter = text.includes("\t") ? "\t" : ",";
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    return { status: "needs_information", issues: [{ code: "DIRECT_ROWS_REQUIRED", questionId: "ASK_DIRECT_MATRIX", message: "見出しと1行以上の条件を貼り付けてください。" }] };
  }
  const header = splitDirectLine(lines[0], delimiter);
  if (header.length < 2 || header.slice(1).some((value) => !value)) {
    return { status: "needs_information", issues: [{ code: "DIRECT_COLUMNS_REQUIRED", questionId: "ASK_DIRECT_MATRIX", message: "1列目を行の名前、2列目以降を列条件の名前にしてください。" }] };
  }
  const dataRows = lines.slice(1).map((line) => splitDirectLine(line, delimiter));
  if (dataRows.some((row) => row.length !== header.length || !row[0])) {
    return { status: "needs_information", issues: [{ code: "DIRECT_RECTANGLE_REQUIRED", questionId: "ASK_DIRECT_MATRIX", message: "すべての行を同じ列数にし、1列目に条件名を入れてください。" }] };
  }
  const statusRows = [];
  for (const [rowIndex, row] of dataRows.entries()) {
    const statuses = [];
    for (const [columnIndex, raw] of row.slice(1).entries()) {
      const normalized = raw.normalize("NFKC").trim().toLocaleLowerCase();
      const status = DIRECT_STATUS.get(normalized);
      if (!status) {
        return {
          status: "needs_information",
          issues: [{
            code: "DIRECT_STATUS_UNRECOGNIZED",
            questionId: "ASK_DIRECT_MATRIX",
            message: `${rowIndex + 2}行${columnIndex + 2}列の「${raw}」は、実施・非実施・不明のいずれかにしてください。`,
          }],
        };
      }
      statuses.push(status);
    }
    statusRows.push(statuses);
  }

  const built = buildGuidedPrototypeDefinition({
    schemaVersion: GUIDED_ENTRY_VERSION,
    experimentLabel: input?.experimentLabel,
    dimensions: [
      {
        label: input?.rowLabel || header[0],
        valuesText: dataRows.map((row) => row[0]).join("\n"),
        entries: dataRows.map((row) => ({ label: row[0], groupLabel: null })),
        kind: "nominal",
      },
      {
        label: input?.columnLabel || "列条件",
        valuesText: header.slice(1).join("\n"),
        entries: header.slice(1).map((label) => ({ label, groupLabel: null })),
        kind: "nominal",
      },
    ],
    combinationAnswer: "review_each",
    measurement: {
      label: input?.measurementLabel,
      form: input?.measurementForm ?? "scalar",
      relatedFieldsText: input?.relatedFieldsText ?? "",
    },
    observation: { shape: "unknown" },
  });
  if (built.status !== "ready") return built;
  const cells = built.definition.fixture.conditionCells.map((cell, index) => ({
    ...cell,
    status: statusRows[Math.floor(index / (header.length - 1))][index % (header.length - 1)],
  }));
  return {
    status: "ready",
    definition: {
      ...built.definition,
      help: "貼り付けた条件表を読み取りました。読み違いがないか、各マスを確認してください。",
      fixture: { ...built.definition.fixture, conditionCells: cells },
      directEntryProvenance: { delimiter: delimiter === "\t" ? "tsv" : "csv", rowCount: dataRows.length, columnCount: header.length - 1 },
    },
  };
}

function combinations(values, choose) {
  const result = [];
  const visit = (start, current) => {
    if (current.length === choose) { result.push([...current]); return; }
    for (let index = start; index < values.length; index += 1) {
      current.push(values[index]); visit(index + 1, current); current.pop();
    }
  };
  visit(0, []);
  return result;
}

/** Condition-topology suggestions only. Statistical readiness is checked later. */
export function comparisonScopeSuggestions(definition, state, options = {}) {
  const activePatternId = options.patternId ?? definition.defaultPattern;
  const performed = new Set(state.conditionCells.filter((cell) => cell.status === CONDITION_STATUS.PERFORMED).map((cell) => cell.id));
  const cellByCoordinate = new Map(state.conditionCells.map((cell) => [`${cell.rowId}|${cell.columnId}`, cell]));
  const rows = definition.rows.map((row) => row.id);
  const columns = definition.columns.map((column) => column.id);
  const scopes = [];
  if (columns.length > 1) {
    for (const row of definition.rows) {
      const ids = definition.columns
        .map((column) => cellByCoordinate.get(`${row.id}|${column.id}`)?.id)
        .filter((id) => id && performed.has(id));
      if (ids.length >= 2) scopes.push({ id: `row-${row.id}`, label: `${row.displayLabel}の中で ${ids.length}条件を比べる`, conditionCellIds: ids, topology: "complete_row" });
    }
  }
  if (rows.length > 1) {
    for (const column of definition.columns) {
      const ids = definition.rows
        .map((row) => cellByCoordinate.get(`${row.id}|${column.id}`)?.id)
        .filter((id) => id && performed.has(id));
      if (ids.length >= 2) scopes.push({ id: `column-${column.id}`, label: `${column.displayLabel}の中で ${ids.length}条件を比べる`, conditionCellIds: ids, topology: "complete_column" });
    }
  }
  const allIds = state.conditionCells.map((cell) => cell.id);
  const fullReady = allIds.length > 1 && allIds.every((id) => performed.has(id));
  if (fullReady) scopes.unshift({ id: "full", label: "実施した条件表全体を比べる", conditionCellIds: allIds, topology: "complete_full" });
  if (!fullReady && rows.length > 1 && columns.length > 1) {
    scopes.push({ id: "full-unavailable", label: "条件表全体の組合せを見る", conditionCellIds: allIds, topology: "incomplete_full", unavailable: true, reason: "実施していない、または不明な組合せがあります。条件同士の組合せ全体を一度に確かめる範囲としては扱いません。" });
  }
  const canCompareWithinSingleCondition = ["same_entity_sequence", "distinct_entity_sequence", "nested_sequence"].includes(activePatternId)
    && (definition.axisValues?.length ?? 0) > 1;
  if (!scopes.some((scope) => !scope.unavailable) && performed.size === 1 && canCompareWithinSingleCondition) {
    const id = [...performed][0];
    scopes.unshift({ id: "single-condition", label: "この1条件内の順序・時点を扱う", conditionCellIds: [id], topology: "single_condition" });
  }
  const seen = new Set();
  return scopes.filter((scope) => {
    const signature = `${scope.unavailable ? "unavailable" : "available"}|${[...scope.conditionCellIds].sort().join("|")}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function allNonEmptySubsets(values) {
  return Array.from({ length: values.length }, (_unused, sizeIndex) => combinations(values, sizeIndex + 1)).flat();
}
