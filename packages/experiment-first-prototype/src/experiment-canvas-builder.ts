import {
  EXPERIMENT_CANVAS_VERSION,
  validateExperimentCanvas,
  type CanvasCellStatus,
  type CanvasDimension,
  type CanvasReadout,
  type CanvasValueGroup,
  type ExperimentCanvas,
} from "./experiment-canvas.ts";
import type { ReadoutRepresentation } from "./contract.ts";

export const EXPERIMENT_PLAN_ANSWER_VERSION = "0.1.0-prototype" as const;

export type CanvasBuilderQuestionId =
  | "ASK_EXPERIMENT_CHANGE"
  | "ASK_CHANGE_VALUES"
  | "ASK_VALUE_GROUPING"
  | "ASK_COMBINATION_PLAN"
  | "ASK_MEASUREMENT"
  | "ASK_MEASUREMENT_RECORD_FORM";

export interface CanvasBuilderQuestion {
  id: CanvasBuilderQuestionId;
  wording: string;
  options: string[];
  researcherFactOnly: true;
}

export const CANVAS_BUILDER_QUESTIONS: CanvasBuilderQuestion[] = [
  {
    id: "ASK_EXPERIMENT_CHANGE",
    wording: "この実験で条件として変えたものはありますか？ 例：薬剤、siRNA、Dox、genotype、時間、濃度",
    options: ["あるので追加する", "条件は1種類だけ"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_CHANGE_VALUES",
    wording: "その条件では、具体的にどの種類・量・時点を試しましたか？",
    options: ["名前を入力する", "数値と単位を入力する", "まだ分からない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_VALUE_GROUPING",
    wording: "複数の処理を、同じ標的や目的ごとにまとめて表示しますか？ 例：Gene AのsiRNA #1〜#3",
    options: ["まとめない", "まとめ名を追加する"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_COMBINATION_PLAN",
    wording: "作成した条件の組合せは、すべて実施しましたか？",
    options: ["すべて実施した", "実施していない組合せがある", "まだ分からない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_MEASUREMENT",
    wording: "この実験で何を測りましたか？",
    options: ["測定名を入力する", "別の測定も追加する", "まだ決まっていない"],
    researcherFactOnly: true,
  },
  {
    id: "ASK_MEASUREMENT_RECORD_FORM",
    wording: "測定の元の値は、どの組で記録しましたか？",
    options: ["1つの数値", "陽性数と総数", "targetとreference", "2つの関連する値", "追跡期間とeventの有無", "doseとresponse", "categoryと個数", "その他の関連値"],
    researcherFactOnly: true,
  },
];

export interface ConditionValueAnswer {
  key: string;
  label: string;
  groupKey: string | null;
}

export interface ConditionDimensionAnswer {
  key: string;
  label: string;
  kind: CanvasDimension["kind"];
  groups: CanvasValueGroup[];
  values: ConditionValueAnswer[];
}

export type MeasurementRecordForm =
  | "one_number"
  | "positive_and_total"
  | "target_and_reference"
  | "two_related_values"
  | "follow_up_and_event"
  | "dose_and_response"
  | "category_and_count"
  | "other_related_values";

export interface MeasurementAnswer {
  key: string;
  label: string;
  recordForm: MeasurementRecordForm;
  /** Required for typed forms; one_number may leave this empty. */
  componentLabels: string[];
}

export type CombinationPlanAnswer =
  | { kind: "all_performed" }
  | {
      kind: "explicit";
      cells: Array<{ values: Record<string, string>; status: CanvasCellStatus }>;
      /** Omission receives only the status the researcher explicitly chose for unlisted cells. */
      unlistedStatus: CanvasCellStatus;
    }
  | { kind: "unknown" };

export interface ExperimentPlanAnswers {
  schemaVersion: typeof EXPERIMENT_PLAN_ANSWER_VERSION;
  planId: string;
  experimentLabel: string;
  dimensions: ConditionDimensionAnswer[];
  combinationPlan: CombinationPlanAnswer;
  measurements: MeasurementAnswer[];
}

export type CanvasBuilderIssueCode =
  | "INVALID_PLAN"
  | "CONDITION_VALUES_REQUIRED"
  | "COMBINATION_PLAN_REQUIRED"
  | "CONDITION_CELL_DUPLICATE"
  | "CONDITION_CELL_INVALID"
  | "MEASUREMENT_REQUIRED"
  | "MEASUREMENT_COMPONENTS_REQUIRED"
  | "INVALID_CANVAS";

export interface CanvasBuilderIssue {
  code: CanvasBuilderIssueCode;
  path: string;
  message: string;
  questionId: CanvasBuilderQuestionId | null;
}

export type CanvasBuilderResult =
  | { status: "mapped"; canvas: ExperimentCanvas; inferences: CanvasBuilderInference[] }
  | { status: "needs_information" | "stopped"; issues: CanvasBuilderIssue[] };

export interface CanvasBuilderInference {
  ruleId: "CARTESIAN_CONDITION_EXPANSION" | "UNLISTED_CELL_STATUS" | "SCALAR_VALUE_COMPONENT";
  targetPath: string;
  message: string;
}

function issue(
  code: CanvasBuilderIssueCode,
  path: string,
  message: string,
  questionId: CanvasBuilderQuestionId | null,
): CanvasBuilderIssue {
  return { code, path, message, questionId };
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function combinations(dimensions: ConditionDimensionAnswer[]): Array<Record<string, string>> {
  return dimensions.reduce<Array<Record<string, string>>>(
    (rows, dimension) => rows.flatMap((row) => dimension.values.map((value) => ({ ...row, [dimension.key]: value.key }))),
    [{}],
  );
}

function signature(values: Record<string, string>, dimensions: ConditionDimensionAnswer[]): string {
  return dimensions.map((dimension) => `${dimension.key}=${values[dimension.key] ?? ""}`).join("|");
}

function cellKey(values: Record<string, string>, dimensions: ConditionDimensionAnswer[], index: number): string {
  if (!dimensions.length) return "condition-1";
  const joined = dimensions.map((dimension) => `${dimension.key}-${values[dimension.key]}`).join("__");
  return joined || `condition-${index + 1}`;
}

function readoutRepresentation(form: MeasurementRecordForm): ReadoutRepresentation {
  if (form === "positive_and_total") return "proportion_counts";
  if (form === "target_and_reference") return "target_reference";
  if (form === "two_related_values") return "paired_readouts";
  if (form === "follow_up_and_event") return "event_censoring";
  if (form === "dose_and_response") return "dose_response";
  if (form === "category_and_count") return "category_counts";
  if (form === "other_related_values") return "other_typed_bundle";
  return "scalar";
}

function defaultComponents(form: MeasurementRecordForm): string[] | null {
  if (form === "one_number") return ["Value"];
  return null;
}

export function nextCanvasBuilderQuestion(result: CanvasBuilderResult): CanvasBuilderQuestionId | null {
  if (result.status === "mapped") return null;
  const order = CANVAS_BUILDER_QUESTIONS.map((question) => question.id);
  const present = new Set(result.issues.map((candidate) => candidate.questionId).filter((candidate): candidate is CanvasBuilderQuestionId => candidate !== null));
  return order.find((questionId) => present.has(questionId)) ?? null;
}

/**
 * Both guided questions and a directly edited matrix serialize to this answer
 * object, so neither route gains hidden semantic privileges.
 */
export function buildExperimentCanvas(answers: ExperimentPlanAnswers): CanvasBuilderResult {
  if (
    answers.schemaVersion !== EXPERIMENT_PLAN_ANSWER_VERSION ||
    !answers.planId.trim() ||
    !answers.experimentLabel.trim() ||
    duplicates(answers.dimensions.map((dimension) => dimension.key)).length ||
    duplicates(answers.measurements.map((measurement) => measurement.key)).length
  ) {
    return { status: "stopped", issues: [issue("INVALID_PLAN", "answers", "Plan version, IDs, labels, and keys must be valid and unique.", null)] };
  }

  const structuralIssues: CanvasBuilderIssue[] = [];
  const informationIssues: CanvasBuilderIssue[] = [];
  for (const dimension of answers.dimensions) {
    if (!dimension.values.length) {
      informationIssues.push(issue("CONDITION_VALUES_REQUIRED", `answers.dimensions.${dimension.key}.values`, `No concrete values were entered for ${dimension.label}.`, "ASK_CHANGE_VALUES"));
    }
    if (duplicates(dimension.values.map((value) => value.key)).length || duplicates(dimension.groups.map((group) => group.key)).length) {
      structuralIssues.push(issue("INVALID_PLAN", `answers.dimensions.${dimension.key}`, "Condition values and groups require unique keys.", null));
    }
    const groupKeys = new Set(dimension.groups.map((group) => group.key));
    if (dimension.values.some((value) => value.groupKey !== null && !groupKeys.has(value.groupKey))) {
      structuralIssues.push(issue("INVALID_PLAN", `answers.dimensions.${dimension.key}.groups`, "A condition value references an unknown group.", "ASK_VALUE_GROUPING"));
    }
  }
  if (!answers.measurements.length) {
    informationIssues.push(issue("MEASUREMENT_REQUIRED", "answers.measurements", "At least one measurement is required.", "ASK_MEASUREMENT"));
  }

  const inferences: CanvasBuilderInference[] = [];
  const readouts: CanvasReadout[] = [];
  for (const measurement of answers.measurements) {
    const fallback = defaultComponents(measurement.recordForm);
    const componentLabels = measurement.componentLabels.length ? measurement.componentLabels : fallback;
    if (!componentLabels) {
      informationIssues.push(issue("MEASUREMENT_COMPONENTS_REQUIRED", `answers.measurements.${measurement.key}.componentLabels`, `The related raw values for ${measurement.label} are not named.`, "ASK_MEASUREMENT_RECORD_FORM"));
      continue;
    }
    if (!measurement.componentLabels.length && fallback) {
      inferences.push({
        ruleId: "SCALAR_VALUE_COMPONENT",
        targetPath: `canvas.readouts.${measurement.key}.componentLabels`,
        message: "A single scalar record receives one generated Value component.",
      });
    }
    readouts.push({
      key: measurement.key,
      label: measurement.label,
      representation: readoutRepresentation(measurement.recordForm),
      componentLabels,
    });
  }
  if (answers.combinationPlan.kind === "unknown") {
    informationIssues.push(issue("COMBINATION_PLAN_REQUIRED", "answers.combinationPlan", "Whether each condition combination was performed is unresolved.", "ASK_COMBINATION_PLAN"));
  }
  if (structuralIssues.length) return { status: "stopped", issues: structuralIssues };
  if (informationIssues.length) return { status: "needs_information", issues: informationIssues };

  const planned = combinations(answers.dimensions);
  const statusBySignature = new Map<string, CanvasCellStatus>();
  if (answers.combinationPlan.kind === "explicit") {
    const explicitSignatures = answers.combinationPlan.cells.map((cell) => signature(cell.values, answers.dimensions));
    const repeated = duplicates(explicitSignatures);
    if (repeated.length) {
      return { status: "stopped", issues: [issue("CONDITION_CELL_DUPLICATE", "answers.combinationPlan.cells", `Condition combinations were entered more than once: ${repeated.join(", ")}.`, null)] };
    }
    const plannedSignatures = new Set(planned.map((values) => signature(values, answers.dimensions)));
    const invalid = explicitSignatures.filter((candidate) => !plannedSignatures.has(candidate));
    if (invalid.length) {
      return { status: "stopped", issues: [issue("CONDITION_CELL_INVALID", "answers.combinationPlan.cells", `Condition combinations reference unknown values: ${invalid.join(", ")}.`, null)] };
    }
    for (const cell of answers.combinationPlan.cells) statusBySignature.set(signature(cell.values, answers.dimensions), cell.status);
  }
  const conditionCells = planned.map((values, index) => {
    let status: CanvasCellStatus = "performed";
    if (answers.combinationPlan.kind === "explicit") {
      const explicit = statusBySignature.get(signature(values, answers.dimensions));
      status = explicit ?? answers.combinationPlan.unlistedStatus;
      if (!explicit) {
        inferences.push({
          ruleId: "UNLISTED_CELL_STATUS",
          targetPath: `canvas.conditionCells.${cellKey(values, answers.dimensions, index)}.status`,
          message: `An unlisted condition was expanded using the explicitly selected ${answers.combinationPlan.unlistedStatus} rule.`,
        });
      }
    }
    return { key: cellKey(values, answers.dimensions, index), values, status };
  });
  inferences.unshift({
    ruleId: "CARTESIAN_CONDITION_EXPANSION",
    targetPath: "canvas.conditionCells",
    message: "The condition matrix was expanded mechanically from the entered dimension values; no unlisted cell was assumed performed.",
  });

  const canvas: ExperimentCanvas = {
    schemaVersion: EXPERIMENT_CANVAS_VERSION,
    experimentLabel: answers.experimentLabel,
    dimensions: answers.dimensions.map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      kind: dimension.kind,
      groups: dimension.groups.map((group) => ({ ...group })),
      values: dimension.values.map((value) => ({
        key: value.key,
        label: value.label,
        parentValueKey: null,
        groupKey: value.groupKey,
      })),
    })),
    conditionCells,
    readouts,
  };
  try {
    validateExperimentCanvas(canvas);
  } catch (error) {
    return { status: "stopped", issues: [issue("INVALID_CANVAS", "canvas", error instanceof Error ? error.message : String(error), null)] };
  }
  return { status: "mapped", canvas, inferences };
}
