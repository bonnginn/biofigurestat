import {
  validateExperimentCanvas,
  type ExperimentCanvas,
} from "./experiment-canvas.ts";
import {
  OBSERVATION_PATTERN_VERSION,
  observationPatternReadinessIssues,
  validateObservationPatternSet,
  type AxisIdentityBehavior,
  type ObservationAxis,
  type ObservationAxisUse,
  type ObservationIdentity,
  type ObservationLevel,
  type ObservationLevelKind,
  type ObservationPatternSet,
  type ObservationRecordSet,
  type PlannedMultiplicity,
  type ReadoutCellBinding,
} from "./observation-pattern.ts";

export const OBSERVATION_INTERVIEW_VERSION = "0.1.0-prototype" as const;

export interface ObservationQuestionDefinition {
  id: ObservationQuestionId;
  wording: string;
  options: string[];
  researcherFactOnly: true;
}

export type ObservationQuestionId =
  | "ASK_OBSERVED_ITEM"
  | "ASK_PARENT_ITEM"
  | "ASK_MULTIPLICITY"
  | "ASK_CONDITION_ALIGNMENT"
  | "ASK_LINKAGE_IDENTITY"
  | "ASK_AXIS_ENTITY_BEHAVIOR"
  | "ASK_AXIS_MATERIAL_BEHAVIOR"
  | "ASK_COORDINATE_PLAN"
  | "ASK_READOUT_COVERAGE";

/**
 * Researcher-facing copy. Option IDs are compiled deterministically; labels and
 * free text are retained as provenance and never semantically parsed.
 */
export const OBSERVATION_INTERVIEW_QUESTIONS: ObservationQuestionDefinition[] = [
  {
    id: "ASK_OBSERVED_ITEM",
    wording: "各条件でこの測定値は、dish・動物・視野・Cellなど、何1つにつき1組記録しましたか？",
    options: ["dish・動物・試料など1つにつき1組", "1つの親から得た各Cell・視野・切片につき1組", "まだ分からない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_PARENT_ITEM",
    wording: "そのCell・視野・切片などは、どのdish・動物・試料から得たものですか？",
    options: ["直前に挙げた親から得た", "別の親を追加する", "対応が分からない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_MULTIPLICITY",
    wording: "1つの親から得る数は、1つ、決まった数、毎回異なる、dataに入っている数のどれですか？",
    options: ["1つ", "決まった数", "毎回異なる", "dataに入っている数", "まだ分からない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_CONDITION_ALIGNMENT",
    wording: "条件が違う記録どうしは、同じ対象、同じ元から分けた別対象、対応づけない別対象のどれですか？",
    options: ["対応づけない別対象", "同じ対象", "同じ元から分けた別対象", "一部だけ対応", "まだ分からない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_LINKAGE_IDENTITY",
    wording: "同じ対象・同じ由来だと確かめるIDは、data内、別file、復元可能、復元不能、不明のどれですか？",
    options: ["data内にある", "入力時に付ける", "別fileにある", "復元できる", "記録されておらず復元できない", "まだ分からない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_AXIS_ENTITY_BEHAVIOR",
    wording: "時間・濃度・距離などの各値で、同じ対象を続けて測りましたか、それとも値ごとに別の対象を測りましたか？",
    options: ["同じ対象を続けて測った", "値ごとに別の対象を測った", "同じ対象内の別位置を測った", "生存・発症などを同じ対象で追った", "対象の対応はない", "まだ分からない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_AXIS_MATERIAL_BEHAVIOR",
    wording: "各値で測定に使った材料は、同じものを読み直しましたか、それとも毎回新しく採取・調製しましたか？",
    options: ["同じ材料を測り直した", "毎回新しく採取・調製した", "材料の区別は当てはまらない", "まだ分からない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_COORDINATE_PLAN",
    wording: "複数の時間・位置などがある場合、全組合せ、実際にある組合せだけ、対象ごとに異なる予定のどれですか？",
    options: ["全組合せ", "実際にある組合せだけ", "対象ごとに異なる", "まだ分からない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_READOUT_COVERAGE",
    wording: "この測定を行わなかった条件はありますか？",
    options: ["実施した全条件で測定した", "測定しなかった条件がある", "まだ分からない"],
    researcherFactOnly: true,
  },
];

export type MultiplicityAnswer =
  | { kind: "one" }
  | { kind: "fixed"; count: number }
  | { kind: "variable"; suggestedCount: number | null }
  | { kind: "from_input" }
  | { kind: "unknown" };

export interface ObservationItemAnswer {
  key: string;
  label: string;
  kind: ObservationLevelKind;
  parentKey: string | null;
  multiplicity: MultiplicityAnswer;
}

export type IdentityAvailabilityAnswer =
  | { state: "available"; origin: "researcher_supplied" | "instrument_supplied" | "external_link_table" }
  | { state: "to_be_collected"; origin: "app_assigned_before_entry" | "researcher_supplied" }
  | { state: "recoverable"; origin: "external_link_table" }
  | { state: "unknown"; origin: "researcher_supplied" | "instrument_supplied" | "external_link_table" }
  | { state: "irrecoverable"; origin: "external_link_table" };

export interface ObservationIdentityAnswer {
  key: string;
  label: string;
  itemKey: string;
  uniquenessScopeItemKey: string | null;
  availability: IdentityAvailabilityAnswer;
}

export type CompletenessAnswer = "all_planned_present" | "may_be_incomplete" | "unknown";

export type ConditionAlignmentAnswer =
  | { kind: "separate_entities" }
  | { kind: "same_entity"; identityKey: string; completeness: CompletenessAnswer }
  | { kind: "different_children_same_source"; identityKey: string; completeness: CompletenessAnswer }
  | { kind: "mixed"; identityKey: string; completeness: CompletenessAnswer }
  | { kind: "crossover"; identityKey: string; completeness: CompletenessAnswer }
  | { kind: "unknown" };

export type AxisEntityAnswer =
  | { kind: "same_entity"; retainedItemKey: string; identityKey: string }
  | { kind: "distinct_entity_each_value"; variedItemKey: string; sharedParentItemKey: string | null }
  | { kind: "coordinate_within_entity"; retainedItemKey: string; identityKey: string }
  | { kind: "event_subject"; subjectItemKey: string; identityKey: string }
  | { kind: "not_identity_bearing" }
  | { kind: "unknown"; candidateItemKey: string | null }
  | { kind: "irrecoverable"; intended: "same_entity" | "coordinate_within_entity" | "event_subject" | null };

export interface ObservationAxisAnswer {
  key: string;
  label: string;
  unit: string | null;
  source:
    | { kind: "canvas_dimension"; dimensionKey: string }
    | { kind: "within_condition_record" };
  kind: ObservationAxis["kind"];
  ordering: ObservationAxis["ordering"];
  /** Canvas dimensions derive their values from the editable condition matrix. */
  valuePlan: ObservationAxis["valuePlan"] | null;
}

export interface ObservationAxisUseAnswer {
  axisKey: string;
  entity: AxisEntityAnswer;
  material: ObservationAxisUse["materialBehavior"];
}

export type ConditionCoverageAnswer =
  | { kind: "all_performed" }
  | {
      kind: "explicit";
      cells: Array<{
        conditionCellKey: string;
        status: ReadoutCellBinding["status"];
      }>;
    }
  | { kind: "unknown" };

export interface ReadoutObservationAnswer {
  readoutKey: string;
  observedItemKey: string;
  alignment: ConditionAlignmentAnswer;
  axisUses: ObservationAxisUseAnswer[];
  coordinatePlan: ObservationRecordSet["coordinatePlan"];
  coverage: ConditionCoverageAnswer;
}

export interface ObservationInterviewAnswers {
  schemaVersion: typeof OBSERVATION_INTERVIEW_VERSION;
  answerSetId: string;
  canvasSchemaVersion: string;
  items: ObservationItemAnswer[];
  identities: ObservationIdentityAnswer[];
  axes: ObservationAxisAnswer[];
  readouts: ReadoutObservationAnswer[];
}

export type ObservationInterviewIssueCode =
  | "INVALID_CANVAS"
  | "INVALID_ANSWER_SET"
  | "OBSERVED_ITEM_REQUIRED"
  | "PARENT_ITEM_REQUIRED"
  | "MULTIPLICITY_REQUIRED"
  | "READOUT_ANSWER_MISSING"
  | "READOUT_ANSWER_DUPLICATE"
  | "CONDITION_ALIGNMENT_REQUIRED"
  | "LINKAGE_IDENTITY_REQUIRED"
  | "AXIS_ANSWER_INVALID"
  | "AXIS_ENTITY_BEHAVIOR_REQUIRED"
  | "AXIS_MATERIAL_BEHAVIOR_REQUIRED"
  | "COORDINATE_PLAN_REQUIRED"
  | "READOUT_COVERAGE_REQUIRED"
  | "CONDITION_BINDING_INCOMPLETE"
  | "INVALID_OBSERVATION_PATTERN";

export interface ObservationInterviewIssue {
  code: ObservationInterviewIssueCode;
  path: string;
  message: string;
  questionId: ObservationQuestionId | null;
}

export interface ObservationInterviewInference {
  ruleId:
    | "CANVAS_AXIS_VALUES"
    | "SCIENTIFIC_IDENTITY_PURPOSE"
    | "COORDINATE_USES_SAME_PREPARATION"
    | "DISTINCT_ENTITY_USES_NEW_MATERIAL"
    | "MATERIAL_NOT_APPLICABLE";
  targetPath: string;
  message: string;
}

export type ObservationInterviewMappingResult =
  | {
      status: "mapped";
      pattern: ObservationPatternSet;
      readinessIssues: string[];
      inferences: ObservationInterviewInference[];
    }
  | {
      status: "needs_information" | "stopped";
      issues: ObservationInterviewIssue[];
    };

const OBSERVATION_QUESTION_ORDER = OBSERVATION_INTERVIEW_QUESTIONS.map((question) => question.id);

/** Returns at most one structure-changing question for progressive disclosure. */
export function nextObservationQuestion(result: ObservationInterviewMappingResult): ObservationQuestionId | null {
  if (result.status === "mapped") {
    return result.readinessIssues.some((candidate) => candidate.startsWith("identity_unknown:"))
      ? "ASK_LINKAGE_IDENTITY"
      : null;
  }
  const candidateIds = new Set(result.issues.map((candidate) => candidate.questionId).filter((candidate): candidate is ObservationQuestionId => candidate !== null));
  return OBSERVATION_QUESTION_ORDER.find((questionId) => candidateIds.has(questionId)) ?? null;
}

function issue(
  code: ObservationInterviewIssueCode,
  path: string,
  message: string,
  questionId: ObservationQuestionId | null,
): ObservationInterviewIssue {
  return { code, path, message, questionId };
}

function duplicateKeys(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function plannedMultiplicity(answer: MultiplicityAnswer): PlannedMultiplicity | null {
  if (answer.kind === "unknown") return null;
  if (answer.kind === "fixed") return { mode: "fixed_plan", count: answer.count };
  if (answer.kind === "variable") return { mode: "variable", suggestedCount: answer.suggestedCount };
  if (answer.kind === "from_input") return { mode: "from_input" };
  return { mode: "one" };
}

function completeness(value: CompletenessAnswer): boolean | null {
  return value === "all_planned_present" ? true : value === "may_be_incomplete" ? false : null;
}

function componentKey(value: string, index: number): string {
  const key = value.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return key || `component_${index + 1}`;
}

function alignment(answer: ConditionAlignmentAnswer): ObservationRecordSet["entryAlignment"] | null {
  if (answer.kind === "unknown") return null;
  if (answer.kind === "separate_entities") return { mode: "separate_lists", identityKey: null, completeSets: false };
  return {
    mode: answer.kind === "same_entity"
      ? "same_entity"
      : answer.kind === "different_children_same_source"
        ? "shared_linkage"
        : answer.kind,
    identityKey: answer.identityKey,
    completeSets: completeness(answer.completeness),
  };
}

function axisEntityBehavior(
  answer: AxisEntityAnswer,
  identityByKey: Map<string, ObservationIdentity>,
): AxisIdentityBehavior | null {
  if (answer.kind === "unknown") return null;
  if (answer.kind === "irrecoverable") return { kind: "irrecoverable", intendedBehavior: answer.intended };
  if (answer.kind === "not_identity_bearing") return { kind: "not_identity_bearing" };
  if (answer.kind === "distinct_entity_each_value") {
    return { kind: "distinct_entity_each_value", variedLevelKey: answer.variedItemKey, sharedParentLevelKey: answer.sharedParentItemKey };
  }
  const identity = identityByKey.get(answer.identityKey);
  if (identity?.availability === "irrecoverable") {
    return {
      kind: "irrecoverable",
      intendedBehavior: answer.kind === "event_subject" ? "event_subject" : answer.kind,
    };
  }
  if (answer.kind === "event_subject") {
    return { kind: "event_subject", subjectLevelKey: answer.subjectItemKey, identityKey: answer.identityKey };
  }
  if (answer.kind === "coordinate_within_entity") {
    return { kind: "coordinate_within_entity", retainedLevelKey: answer.retainedItemKey, identityKey: answer.identityKey };
  }
  return { kind: "same_entity", retainedLevelKey: answer.retainedItemKey, identityKey: answer.identityKey };
}

function resolvedMaterialBehavior(
  answer: ObservationAxisUse["materialBehavior"],
  behavior: AxisIdentityBehavior,
): { value: ObservationAxisUse["materialBehavior"] | null; ruleId: ObservationInterviewInference["ruleId"] | null } {
  if (answer !== "unknown") return { value: answer, ruleId: null };
  if (behavior.kind === "coordinate_within_entity" || (behavior.kind === "irrecoverable" && behavior.intendedBehavior === "coordinate_within_entity")) {
    return { value: "same_preparation", ruleId: "COORDINATE_USES_SAME_PREPARATION" };
  }
  if (behavior.kind === "distinct_entity_each_value") {
    return { value: "new_material_each_value", ruleId: "DISTINCT_ENTITY_USES_NEW_MATERIAL" };
  }
  if (behavior.kind === "event_subject" || behavior.kind === "not_identity_bearing" || (behavior.kind === "irrecoverable" && behavior.intendedBehavior === "event_subject")) {
    return { value: "not_applicable", ruleId: "MATERIAL_NOT_APPLICABLE" };
  }
  return { value: null, ruleId: null };
}

function identityAnswer(
  answer: ObservationIdentityAnswer,
  scientificKeys: Set<string>,
): ObservationIdentity {
  return {
    key: answer.key,
    label: answer.label,
    levelKey: answer.itemKey,
    uniquenessScopeLevelKey: answer.uniquenessScopeItemKey,
    purpose: scientificKeys.has(answer.key) ? "both" : "instance_key",
    availability: answer.availability.state,
    origin: answer.availability.origin,
  };
}

function bindingStatuses(
  canvas: ExperimentCanvas,
  coverage: ConditionCoverageAnswer,
  path: string,
): { statuses: Map<string, ReadoutCellBinding["status"]>; issues: ObservationInterviewIssue[] } {
  if (coverage.kind === "unknown") {
    return {
      statuses: new Map(),
      issues: [issue("READOUT_COVERAGE_REQUIRED", path, "Whether the readout was measured in each condition is unresolved.", "ASK_READOUT_COVERAGE")],
    };
  }
  if (coverage.kind === "all_performed") {
    return {
      statuses: new Map(canvas.conditionCells.map((cell) => [
        cell.key,
        cell.status === "performed" ? "measured" : cell.status === "not_performed_by_design" ? "not_measured_by_design" : "unknown",
      ])),
      issues: [],
    };
  }
  const duplicates = duplicateKeys(coverage.cells.map((cell) => cell.conditionCellKey));
  const known = new Set(canvas.conditionCells.map((cell) => cell.key));
  const supplied = new Set(coverage.cells.map((cell) => cell.conditionCellKey));
  const missing = [...known].filter((key) => !supplied.has(key));
  const extra = [...supplied].filter((key) => !known.has(key));
  if (duplicates.length || missing.length || extra.length) {
    return {
      statuses: new Map(),
      issues: [issue(
        "CONDITION_BINDING_INCOMPLETE",
        path,
        `Every condition requires one readout status. Duplicate: ${duplicates.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}; unknown: ${extra.join(", ") || "none"}.`,
        "ASK_READOUT_COVERAGE",
      )],
    };
  }
  return { statuses: new Map(coverage.cells.map((cell) => [cell.conditionCellKey, cell.status])), issues: [] };
}

function groupBindings(
  readoutKey: string,
  componentKeys: string[],
  recordSetKey: string,
  statuses: Map<string, ReadoutCellBinding["status"]>,
): ReadoutCellBinding[] {
  const byStatus = new Map<ReadoutCellBinding["status"], string[]>();
  for (const [conditionCellKey, status] of statuses) {
    const cells = byStatus.get(status) ?? [];
    cells.push(conditionCellKey);
    byStatus.set(status, cells);
  }
  return [...byStatus.entries()].map(([status, conditionCellKeys]) => ({
    readoutKey,
    componentKeys,
    conditionCellKeys,
    status,
    recordSetKey: status === "measured" ? recordSetKey : null,
  }));
}

/**
 * Compiles structured answers to observation semantics only. It deliberately
 * does not infer experimental unit, biological n, pairing, or a statistical
 * design from row counts, condition count, or rectangularity.
 */
export function mapObservationInterviewToPattern(
  canvas: ExperimentCanvas,
  answers: ObservationInterviewAnswers,
): ObservationInterviewMappingResult {
  try {
    validateExperimentCanvas(canvas);
  } catch (error) {
    return { status: "stopped", issues: [issue("INVALID_CANVAS", "canvas", error instanceof Error ? error.message : String(error), null)] };
  }
  if (
    answers.schemaVersion !== OBSERVATION_INTERVIEW_VERSION ||
    answers.canvasSchemaVersion !== canvas.schemaVersion ||
    !answers.answerSetId.trim()
  ) {
    return { status: "stopped", issues: [issue("INVALID_ANSWER_SET", "answers", "Answer-set version, Canvas version, or ID is invalid.", null)] };
  }

  const structuralIssues: ObservationInterviewIssue[] = [];
  const informationIssues: ObservationInterviewIssue[] = [];
  const inferences: ObservationInterviewInference[] = [];
  const itemDuplicates = duplicateKeys(answers.items.map((item) => item.key));
  const identityDuplicates = duplicateKeys(answers.identities.map((identity) => identity.key));
  const axisDuplicates = duplicateKeys(answers.axes.map((axis) => axis.key));
  if (itemDuplicates.length || identityDuplicates.length || axisDuplicates.length) {
    structuralIssues.push(issue("INVALID_ANSWER_SET", "answers", "Item, identity, and axis keys must be unique.", null));
  }
  const itemKeys = new Set(answers.items.map((item) => item.key));
  const levels: ObservationLevel[] = [];
  for (const item of answers.items) {
    if (item.parentKey !== null && !itemKeys.has(item.parentKey)) {
      structuralIssues.push(issue("PARENT_ITEM_REQUIRED", `answers.items.${item.key}.parentKey`, `Unknown parent item: ${item.parentKey}.`, "ASK_PARENT_ITEM"));
    }
    const multiplicity = plannedMultiplicity(item.multiplicity);
    if (!multiplicity) {
      informationIssues.push(issue("MULTIPLICITY_REQUIRED", `answers.items.${item.key}.multiplicity`, `Multiplicity is unresolved for ${item.label}.`, "ASK_MULTIPLICITY"));
      continue;
    }
    levels.push({ key: item.key, label: item.label, kind: item.kind, parentKey: item.parentKey, plannedMultiplicity: multiplicity });
  }

  const canvasReadoutKeys = new Set(canvas.readouts.map((readout) => readout.key));
  const readoutDuplicates = duplicateKeys(answers.readouts.map((readout) => readout.readoutKey));
  if (readoutDuplicates.length) {
    structuralIssues.push(issue("READOUT_ANSWER_DUPLICATE", "answers.readouts", `Readouts answered more than once: ${readoutDuplicates.join(", ")}.`, null));
  }
  const answeredReadoutKeys = new Set(answers.readouts.map((readout) => readout.readoutKey));
  const missingReadouts = [...canvasReadoutKeys].filter((key) => !answeredReadoutKeys.has(key));
  const extraReadouts = [...answeredReadoutKeys].filter((key) => !canvasReadoutKeys.has(key));
  if (missingReadouts.length || extraReadouts.length) {
    structuralIssues.push(issue("READOUT_ANSWER_MISSING", "answers.readouts", `Missing readouts: ${missingReadouts.join(", ") || "none"}; unknown readouts: ${extraReadouts.join(", ") || "none"}.`, "ASK_OBSERVED_ITEM"));
  }

  const axisByKey = new Map(answers.axes.map((axis) => [axis.key, axis]));
  const axes: ObservationAxis[] = [];
  for (const axis of answers.axes) {
    let valuePlan = axis.valuePlan;
    if (axis.source.kind === "canvas_dimension") {
      const dimensionKey = axis.source.dimensionKey;
      const dimension = canvas.dimensions.find((candidate) => candidate.key === dimensionKey);
      if (!dimension || axis.key !== dimension.key) {
        structuralIssues.push(issue("AXIS_ANSWER_INVALID", `answers.axes.${axis.key}.source`, "The axis does not reference its matching Canvas dimension.", null));
        continue;
      }
      valuePlan = { mode: "fixed_global", values: dimension.values.map((value) => value.label) };
      inferences.push({
        ruleId: "CANVAS_AXIS_VALUES",
        targetPath: `pattern.axes.${axis.key}.valuePlan`,
        message: "Axis values were copied from the researcher-edited condition dimension.",
      });
    }
    if (!valuePlan) {
      informationIssues.push(issue("AXIS_ANSWER_INVALID", `answers.axes.${axis.key}.valuePlan`, "The within-condition axis values or input mode are unresolved.", "ASK_COORDINATE_PLAN"));
      continue;
    }
    axes.push({ key: axis.key, label: axis.label, unit: axis.unit, source: axis.source, kind: axis.kind, ordering: axis.ordering, valuePlan });
  }

  const scientificKeys = new Set<string>();
  for (const readout of answers.readouts) {
    if (readout.alignment.kind !== "separate_entities" && readout.alignment.kind !== "unknown") scientificKeys.add(readout.alignment.identityKey);
    for (const use of readout.axisUses) {
      if (["same_entity", "coordinate_within_entity", "event_subject"].includes(use.entity.kind)) scientificKeys.add((use.entity as { identityKey: string }).identityKey);
    }
  }
  const identities = answers.identities.map((answer) => identityAnswer(answer, scientificKeys));
  for (const identity of identities.filter((candidate) => scientificKeys.has(candidate.key))) {
    inferences.push({
      ruleId: "SCIENTIFIC_IDENTITY_PURPOSE",
      targetPath: `pattern.identities.${identity.key}.purpose`,
      message: "Scientific-linkage purpose was derived because the answer explicitly uses this ID to connect observations.",
    });
  }
  const identityByKey = new Map(identities.map((identity) => [identity.key, identity]));
  for (const identity of identities) {
    if (!itemKeys.has(identity.levelKey) || (identity.uniquenessScopeLevelKey !== null && !itemKeys.has(identity.uniquenessScopeLevelKey))) {
      structuralIssues.push(issue("INVALID_ANSWER_SET", `answers.identities.${identity.key}`, "Identity references an unknown item or scope.", null));
    }
  }

  const recordSetBySignature = new Map<string, ObservationRecordSet>();
  const recordSetKeyByReadout = new Map<string, string>();
  const coverageByReadout = new Map<string, Map<string, ReadoutCellBinding["status"]>>();
  for (const readout of answers.readouts) {
    const path = `answers.readouts.${readout.readoutKey}`;
    if (!itemKeys.has(readout.observedItemKey)) {
      structuralIssues.push(issue("OBSERVED_ITEM_REQUIRED", `${path}.observedItemKey`, "The measured item is not defined.", "ASK_OBSERVED_ITEM"));
      continue;
    }
    const mappedAlignment = alignment(readout.alignment);
    if (!mappedAlignment) {
      informationIssues.push(issue("CONDITION_ALIGNMENT_REQUIRED", `${path}.alignment`, "How records correspond across conditions is unresolved.", "ASK_CONDITION_ALIGNMENT"));
      continue;
    }
    if (mappedAlignment.identityKey && !identityByKey.has(mappedAlignment.identityKey)) {
      structuralIssues.push(issue("LINKAGE_IDENTITY_REQUIRED", `${path}.alignment.identityKey`, "The condition linkage identity is not defined.", "ASK_LINKAGE_IDENTITY"));
    }
    if (readout.coordinatePlan === "unknown") {
      informationIssues.push(issue("COORDINATE_PLAN_REQUIRED", `${path}.coordinatePlan`, "The coordinate plan is unresolved.", "ASK_COORDINATE_PLAN"));
    }
    const axisUses: ObservationAxisUse[] = [];
    for (const use of readout.axisUses) {
      const axis = axisByKey.get(use.axisKey);
      if (!axis) {
        structuralIssues.push(issue("AXIS_ANSWER_INVALID", `${path}.axisUses.${use.axisKey}`, "The readout references an unknown axis.", null));
        continue;
      }
      const behavior = axisEntityBehavior(use.entity, identityByKey);
      if (!behavior) {
        informationIssues.push(issue("AXIS_ENTITY_BEHAVIOR_REQUIRED", `${path}.axisUses.${use.axisKey}.entity`, "Whether the same entity is retained along the axis is unresolved.", "ASK_AXIS_ENTITY_BEHAVIOR"));
        continue;
      }
      const identityKey = "identityKey" in behavior ? behavior.identityKey : null;
      if (identityKey && !identityByKey.has(identityKey)) {
        structuralIssues.push(issue("LINKAGE_IDENTITY_REQUIRED", `${path}.axisUses.${use.axisKey}.identityKey`, "The axis linkage identity is not defined.", "ASK_LINKAGE_IDENTITY"));
      }
      const material = resolvedMaterialBehavior(use.material, behavior);
      if (!material.value) {
        informationIssues.push(issue("AXIS_MATERIAL_BEHAVIOR_REQUIRED", `${path}.axisUses.${use.axisKey}.material`, "Whether the same physical material was measured along the axis is unresolved.", "ASK_AXIS_MATERIAL_BEHAVIOR"));
      } else if (material.ruleId) {
        inferences.push({
          ruleId: material.ruleId,
          targetPath: `pattern.recordSets.${readout.readoutKey}.axisUses.${use.axisKey}.materialBehavior`,
          message: "Physical-material behavior follows uniquely from the explicit entity/coordinate operation.",
        });
      }
      axisUses.push({ axisKey: use.axisKey, identityBehavior: behavior, materialBehavior: material.value ?? "unknown" });
    }
    const coverage = bindingStatuses(canvas, readout.coverage, `${path}.coverage`);
    informationIssues.push(...coverage.issues);
    coverageByReadout.set(readout.readoutKey, coverage.statuses);
    const signature = JSON.stringify({ observedItemKey: readout.observedItemKey, alignment: mappedAlignment, axisUses, coordinatePlan: readout.coordinatePlan });
    let recordSet = recordSetBySignature.get(signature);
    if (!recordSet) {
      recordSet = {
        key: `records-${recordSetBySignature.size + 1}`,
        label: canvas.readouts.find((candidate) => candidate.key === readout.readoutKey)?.label ?? readout.readoutKey,
        observedLevelKey: readout.observedItemKey,
        axisUses,
        coordinatePlan: readout.coordinatePlan,
        entryAlignment: mappedAlignment,
      };
      recordSetBySignature.set(signature, recordSet);
    }
    recordSetKeyByReadout.set(readout.readoutKey, recordSet.key);
  }

  const usedAxisKeys = new Set([...recordSetBySignature.values()].flatMap((recordSet) => recordSet.axisUses.map((use) => use.axisKey)));
  const unusedAxes = answers.axes.filter((axis) => !usedAxisKeys.has(axis.key));
  if (unusedAxes.length) {
    structuralIssues.push(issue("AXIS_ANSWER_INVALID", "answers.axes", `Axes are defined but unused: ${unusedAxes.map((axis) => axis.key).join(", ")}.`, null));
  }
  if (structuralIssues.length) return { status: "stopped", issues: structuralIssues };
  if (informationIssues.length) return { status: "needs_information", issues: informationIssues };

  const bindings: ReadoutCellBinding[] = [];
  for (const canvasReadout of canvas.readouts) {
    const statuses = coverageByReadout.get(canvasReadout.key)!;
    const componentLabels = canvasReadout.componentLabels.length ? canvasReadout.componentLabels : ["value"];
    const componentKeys = componentLabels.map(componentKey);
    bindings.push(...groupBindings(canvasReadout.key, componentKeys, recordSetKeyByReadout.get(canvasReadout.key)!, statuses));
  }
  const pattern: ObservationPatternSet = {
    schemaVersion: OBSERVATION_PATTERN_VERSION,
    patternSetId: answers.answerSetId,
    canvasSchemaVersion: canvas.schemaVersion,
    levels,
    identities,
    axes,
    recordSets: [...recordSetBySignature.values()],
    bindings,
  };
  try {
    validateObservationPatternSet(pattern, canvas);
  } catch (error) {
    return {
      status: "stopped",
      issues: [issue("INVALID_OBSERVATION_PATTERN", "pattern", error instanceof Error ? error.message : String(error), null)],
    };
  }
  return { status: "mapped", pattern, readinessIssues: observationPatternReadinessIssues(pattern), inferences };
}
