import {
  getEntryModule,
  resolveEntryModule,
  type EntryFactKey,
  type EntryModuleFacts,
  type EntryModuleId,
  type EntryModuleResolution,
  type OrderedAxisMeaning,
  type TargetedFactDeclaration,
} from "@lsaa/adaptive-input";
import type { AdaptiveSurfaceId } from "@lsaa/domain";

export const ENTRY_MODULE_TARGETED_FACTS_STATE_VERSION = "0.3.0" as const;

export type EntryModuleLocale = "ja" | "en";

type LocalizedText = Readonly<{ ja: string; en: string }>;

export type EntryModuleTargetedFactsState = Readonly<{
  schemaVersion: typeof ENTRY_MODULE_TARGETED_FACTS_STATE_VERSION;
  moduleId: EntryModuleId;
  facts: EntryModuleFacts;
}>;

export type EntryModuleFactValidationIssue = Readonly<{
  code:
    | "TARGETED_FACT_NOT_DECLARED_FOR_MODULE"
    | "TARGETED_FACT_VALUE_INVALID"
    | "TARGETED_FACT_REQUIRES_SEPARATE_FLOW"
    | "ORDERED_AXIS_COUNT_NOT_APPLICABLE"
    | "ORDERED_AXIS_COUNT_INVALID"
    | "ORDERED_CURVE_SERIES_COUNT_NOT_APPLICABLE"
    | "ORDERED_CURVE_SERIES_COUNT_INVALID";
  key: EntryFactKey | "ordered_axis_count" | "ordered_curve_series_count";
  message: LocalizedText;
}>;

export type EntryModuleFactUpdateResult =
  | Readonly<{ ok: true; state: EntryModuleTargetedFactsState; issue: null }>
  | Readonly<{
      ok: false;
      state: EntryModuleTargetedFactsState;
      issue: EntryModuleFactValidationIssue;
    }>;

export type EntryModuleTargetedQuestionView = Readonly<{
  key: EntryFactKey;
  question: string;
  choices: readonly Readonly<{ value: string; label: string }>[];
  selectedValue: string | null;
  unresolved: boolean;
  whenUnresolved: TargetedFactDeclaration["whenUnresolved"];
}>;

export type EntryModuleSafeStop = Readonly<{
  kind: "invalid_state" | "human_decision_required" | "unsupported_structure";
  title: string;
  message: string;
  reasonCodes: readonly string[];
  preserveEnteredData: true;
  suggestedAlternative: Readonly<{
    moduleId: EntryModuleId;
    label: string;
    autoNavigate: false;
  }> | null;
}>;

export type EntryModuleContractDeferral = Readonly<{
  title: string;
  message: string;
  reasonCodes: readonly string[];
  preserveEnteredData: true;
  until: "experiment_structure_is_required";
}>;

export type EntryModuleTargetedFactsViewModel = Readonly<{
  moduleId: EntryModuleId;
  locale: EntryModuleLocale;
  researcherIntent: string;
  status:
    | "ready"
    | "needs_answer"
    | "human_decision_required"
    | "safe_unsupported"
    | "contract_deferred"
    | "invalid";
  statusLabel: string;
  summary: string;
  questions: readonly EntryModuleTargetedQuestionView[];
  orderedAxisCountControl: Readonly<{
    label: string;
    help: string;
    value: number;
  }> | null;
  preferredSurface: Readonly<{
    entrySurfaceId: EntryModuleResolution["preferredSurface"]["entrySurfaceId"];
    adaptiveSurfaceId: AdaptiveSurfaceId;
    label: string;
  }>;
  canOpenPreferredSurface: boolean;
  canCompileStructureContract: boolean;
  validationIssues: readonly EntryModuleFactValidationIssue[];
  reasonCodes: readonly string[];
  safeStop: EntryModuleSafeStop | null;
  contractDeferral: EntryModuleContractDeferral | null;
  resolution: EntryModuleResolution | null;
}>;

const adaptiveSurfaceLabels: Readonly<Record<AdaptiveSurfaceId, LocalizedText>> = {
  compact_unit_matrix: {
    ja: "少数の測定値を並べるコンパクト表",
    en: "Compact table for a small set of measurements",
  },
  factor_observation_table: {
    ja: "各測定を1行ずつ記録する表",
    en: "One-row-per-measurement table",
  },
  repeated_axis_matrix: {
    ja: "同じ対象を順序点に沿って記録する表",
    en: "Same-subject table across ordered points",
  },
  nested_observation_table: {
    ja: "試料内の測定値を階層ごとに記録する表",
    en: "Table for measurements nested within samples",
  },
  typed_record_table: {
    ja: "種類の決まった項目を1例ずつ記録する表",
    en: "One-record-per-case typed table",
  },
};

const statusLabels: Readonly<Record<EntryModuleTargetedFactsViewModel["status"], LocalizedText>> = {
  ready: { ja: "入力表を準備できます", en: "The input table is ready" },
  needs_answer: { ja: "実験について確認が必要です", en: "One or more experiment facts are needed" },
  human_decision_required: {
    ja: "試料の対応を確認してください",
    en: "Check how the samples correspond",
  },
  safe_unsupported: {
    ja: "この入口では安全に表現できません",
    en: "This entry path cannot represent the experiment safely",
  },
  contract_deferred: {
    ja: "実験構造の確認を後に回せます",
    en: "Experiment-structure confirmation can be deferred",
  },
  invalid: { ja: "入力内容を確認してください", en: "Check the entered information" },
};

function localized(text: LocalizedText, locale: EntryModuleLocale): string {
  return text[locale];
}

function declaredFact(
  moduleId: EntryModuleId,
  key: EntryFactKey,
): TargetedFactDeclaration | undefined {
  return getEntryModule(moduleId).requiredTargetedFacts.find((fact) => fact.key === key);
}

function selectedFactValue(state: EntryModuleTargetedFactsState, key: EntryFactKey): string | null {
  if (key === "ordered_axis_meaning") return state.facts.orderedAxisMeaning ?? null;
  if (key === "axis_material_relationship") {
    return state.facts.axisMaterialRelationship ?? null;
  }
  if (key === "axis_point_parent_relationship") {
    return state.facts.axisPointParentRelationship ?? null;
  }
  if (key === "ordered_curve_series_meaning") {
    return state.facts.orderedCurveSeriesMeaning ?? null;
  }
  if (key === "ordered_curve_series_parent_relationship") {
    return state.facts.orderedCurveSeriesParentRelationship ?? null;
  }
  return null;
}

function withFactValue(
  state: EntryModuleTargetedFactsState,
  key: EntryFactKey,
  value: string | undefined,
): EntryModuleTargetedFactsState {
  if (key === "ordered_axis_meaning") {
    return {
      ...state,
      facts: { ...state.facts, orderedAxisMeaning: value as OrderedAxisMeaning | undefined },
    };
  }
  if (key === "axis_material_relationship") {
    return {
      ...state,
      facts: {
        ...state.facts,
        axisMaterialRelationship: value as EntryModuleFacts["axisMaterialRelationship"] | undefined,
        axisPointParentRelationship:
          value === "separate_material_per_axis_value"
            ? state.facts.axisPointParentRelationship
            : undefined,
      },
    };
  }
  if (key === "axis_point_parent_relationship") {
    return {
      ...state,
      facts: {
        ...state.facts,
        axisPointParentRelationship: value as
          EntryModuleFacts["axisPointParentRelationship"] | undefined,
      },
    };
  }
  if (key === "ordered_curve_series_meaning") {
    return {
      ...state,
      facts: {
        ...state.facts,
        orderedCurveSeriesMeaning: value as
          EntryModuleFacts["orderedCurveSeriesMeaning"] | undefined,
        orderedCurveSeriesParentRelationship:
          value === "experimental_conditions"
            ? state.facts.orderedCurveSeriesParentRelationship
            : undefined,
      },
    };
  }
  if (key === "ordered_curve_series_parent_relationship") {
    return {
      ...state,
      facts: {
        ...state.facts,
        orderedCurveSeriesParentRelationship: value as
          EntryModuleFacts["orderedCurveSeriesParentRelationship"] | undefined,
      },
    };
  }
  return state;
}

function issue(
  code: EntryModuleFactValidationIssue["code"],
  key: EntryModuleFactValidationIssue["key"],
): EntryModuleFactValidationIssue {
  const messages: Readonly<Record<EntryModuleFactValidationIssue["code"], LocalizedText>> = {
    TARGETED_FACT_NOT_DECLARED_FOR_MODULE: {
      ja: "この実験入口では使わない回答です。",
      en: "This answer is not used by the selected experiment entry.",
    },
    TARGETED_FACT_VALUE_INVALID: {
      ja: "用意された選択肢から回答してください。",
      en: "Choose one of the available answers.",
    },
    TARGETED_FACT_REQUIRES_SEPARATE_FLOW: {
      ja: "この確認は選択肢だけでは完了できません。",
      en: "This confirmation cannot be completed by a single choice.",
    },
    ORDERED_AXIS_COUNT_NOT_APPLICABLE: {
      ja: "この実験入口では順序をもつ量の数を指定しません。",
      en: "This experiment entry does not use an ordered-quantity count.",
    },
    ORDERED_AXIS_COUNT_INVALID: {
      ja: "順序をもつ量の数は1以上の整数で指定してください。",
      en: "The number of ordered quantities must be a whole number of at least one.",
    },
    ORDERED_CURVE_SERIES_COUNT_NOT_APPLICABLE: {
      ja: "この実験入口ではSeries数を指定しません。",
      en: "This experiment entry does not use an ordered-curve Series count.",
    },
    ORDERED_CURVE_SERIES_COUNT_INVALID: {
      ja: "Series数は0以上の整数で指定してください。",
      en: "The Series count must be a whole number of zero or greater.",
    },
  };
  return { code, key, message: messages[code] };
}

export function createEntryModuleTargetedFactsState(
  moduleId: EntryModuleId,
  initialFacts: EntryModuleFacts = {},
): EntryModuleTargetedFactsState {
  return {
    schemaVersion: ENTRY_MODULE_TARGETED_FACTS_STATE_VERSION,
    moduleId,
    facts:
      moduleId === "ordered_curve_kinetics" && initialFacts.orderedAxisCount === undefined
        ? { ...initialFacts, orderedAxisCount: 1 }
        : { ...initialFacts },
  };
}

/**
 * Applies only declared researcher-facing choices. Invalid or stale values do
 * not replace the last valid answer, which keeps a loaded draft recoverable.
 */
export function updateEntryModuleTargetedFact(
  state: EntryModuleTargetedFactsState,
  key: EntryFactKey,
  value: string | null,
): EntryModuleFactUpdateResult {
  const declaration = declaredFact(state.moduleId, key);
  if (!declaration) {
    return {
      ok: false,
      state,
      issue: issue("TARGETED_FACT_NOT_DECLARED_FOR_MODULE", key),
    };
  }
  if (declaration.choices.length === 0) {
    return {
      ok: false,
      state,
      issue: issue("TARGETED_FACT_REQUIRES_SEPARATE_FLOW", key),
    };
  }
  if (value !== null && !declaration.choices.some((choice) => choice.value === value)) {
    return { ok: false, state, issue: issue("TARGETED_FACT_VALUE_INVALID", key) };
  }
  return { ok: true, state: withFactValue(state, key, value ?? undefined), issue: null };
}

export function updateEntryModuleOrderedAxisCount(
  state: EntryModuleTargetedFactsState,
  value: number,
): EntryModuleFactUpdateResult {
  if (state.moduleId !== "ordered_curve_kinetics") {
    return {
      ok: false,
      state,
      issue: issue("ORDERED_AXIS_COUNT_NOT_APPLICABLE", "ordered_axis_count"),
    };
  }
  if (!Number.isInteger(value) || value < 1) {
    return {
      ok: false,
      state,
      issue: issue("ORDERED_AXIS_COUNT_INVALID", "ordered_axis_count"),
    };
  }
  return {
    ok: true,
    state: { ...state, facts: { ...state.facts, orderedAxisCount: value } },
    issue: null,
  };
}

export function updateEntryModuleOrderedCurveSeriesCount(
  state: EntryModuleTargetedFactsState,
  value: number,
): EntryModuleFactUpdateResult {
  if (state.moduleId !== "ordered_curve_kinetics") {
    return {
      ok: false,
      state,
      issue: issue("ORDERED_CURVE_SERIES_COUNT_NOT_APPLICABLE", "ordered_curve_series_count"),
    };
  }
  if (!Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      state,
      issue: issue("ORDERED_CURVE_SERIES_COUNT_INVALID", "ordered_curve_series_count"),
    };
  }
  return {
    ok: true,
    state: {
      ...state,
      facts: {
        ...state.facts,
        orderedCurveSeriesCount: value,
        orderedCurveSeriesMeaning: value > 1 ? state.facts.orderedCurveSeriesMeaning : undefined,
        orderedCurveSeriesParentRelationship:
          value > 1 ? state.facts.orderedCurveSeriesParentRelationship : undefined,
      },
    },
    issue: null,
  };
}

export function validateEntryModuleTargetedFactsState(
  state: EntryModuleTargetedFactsState,
): readonly EntryModuleFactValidationIssue[] {
  const issues: EntryModuleFactValidationIssue[] = [];
  const axisCount = state.facts.orderedAxisCount;
  if (axisCount !== undefined) {
    if (state.moduleId !== "ordered_curve_kinetics") {
      issues.push(issue("ORDERED_AXIS_COUNT_NOT_APPLICABLE", "ordered_axis_count"));
    } else if (!Number.isInteger(axisCount) || axisCount < 1) {
      issues.push(issue("ORDERED_AXIS_COUNT_INVALID", "ordered_axis_count"));
    }
  }
  const seriesCount = state.facts.orderedCurveSeriesCount;
  if (seriesCount !== undefined) {
    if (state.moduleId !== "ordered_curve_kinetics") {
      issues.push(issue("ORDERED_CURVE_SERIES_COUNT_NOT_APPLICABLE", "ordered_curve_series_count"));
    } else if (!Number.isInteger(seriesCount) || seriesCount < 0) {
      issues.push(issue("ORDERED_CURVE_SERIES_COUNT_INVALID", "ordered_curve_series_count"));
    }
  }
  for (const key of [
    "ordered_axis_meaning",
    "axis_material_relationship",
    "axis_point_parent_relationship",
    "ordered_curve_series_meaning",
    "ordered_curve_series_parent_relationship",
  ] as const) {
    const value = selectedFactValue(state, key);
    if (value === null) continue;
    const declaration = declaredFact(state.moduleId, key);
    if (!declaration) {
      issues.push(issue("TARGETED_FACT_NOT_DECLARED_FOR_MODULE", key));
    } else if (!declaration.choices.some((choice) => choice.value === value)) {
      issues.push(issue("TARGETED_FACT_VALUE_INVALID", key));
    }
  }
  return issues;
}

function axisMeaningLabel(
  state: EntryModuleTargetedFactsState,
  locale: EntryModuleLocale,
): string | null {
  const value = state.facts.orderedAxisMeaning;
  if (!value) return null;
  const choice = declaredFact(state.moduleId, "ordered_axis_meaning")?.choices.find(
    (candidate) => candidate.value === value,
  );
  return choice ? localized(choice.label, locale) : null;
}

function orderedCurveSummary(
  state: EntryModuleTargetedFactsState,
  locale: EntryModuleLocale,
  resolution: EntryModuleResolution,
): string {
  const count = state.facts.orderedAxisCount ?? 1;
  if (resolution.status === "safe_unsupported" && count > 1) {
    return locale === "ja"
      ? `${count}つの順序をもつ量があります。1つの軸へまとめず、両方を保持できる一般の実験設定で確認します。入力済みの内容は保持します。`
      : `This experiment has ${count} ordered quantities. They will not be collapsed into one axis; use the general experiment setup to retain both. Entered data will be preserved.`;
  }
  if (
    resolution.capabilityReasonCodes.includes("ORDERED_CURVE_SERIES_REPLICATES_REQUIRE_RESHAPING")
  ) {
    return locale === "ja"
      ? "Seriesは比較条件ではなく別run・replicate・個体を表しています。別条件へ読み替えず、Seriesを単位IDとして保持できる一般の実験設定で続けます。入力済みの内容は保持します。"
      : "Series represents separate runs, replicates, or subjects rather than comparison conditions. It will not be relabelled as conditions; continue in the general setup that retains Series as unit identity. Entered data will be preserved.";
  }
  if (
    resolution.capabilityReasonCodes.includes(
      "ORDERED_CURVE_MULTIPLE_READOUTS_REQUIRE_TYPED_READOUTS",
    )
  ) {
    return locale === "ja"
      ? "Seriesは別の測定項目を表しています。1つの条件へ読み替えず、複数readoutを区別できる一般の実験設定で続けます。入力済みの内容は保持します。"
      : "Series represents different readouts. It will not be relabelled as one condition; continue in the general setup that distinguishes multiple readouts. Entered data will be preserved.";
  }
  if (
    resolution.capabilityReasonCodes.includes(
      "ORDERED_CURVE_SERIES_SHARED_PARENT_REQUIRES_HIERARCHY",
    )
  ) {
    return locale === "ja"
      ? "異なるSeriesの試料に共通の由来または対応関係があります。独立した条件群へ読み替えず、親IDを保持できる一般の実験設定で続けます。入力済みの内容は保持します。"
      : "Samples across Series share a source or matching relationship. They will not be coerced into independent groups; continue in the general setup that retains parent IDs. Entered data will be preserved.";
  }
  if (
    resolution.status === "needs_targeted_facts" &&
    (state.facts.orderedCurveSeriesCount ?? 0) > 1 &&
    (!state.facts.orderedCurveSeriesMeaning || state.facts.orderedCurveSeriesMeaning === "unknown")
  ) {
    return locale === "ja"
      ? "複数のSeriesが、比較条件・別run/個体・別readoutのどれを表すかで実験構造が変わります。推測せず、入力済みの内容を保持して確認します。"
      : "The experiment structure changes depending on whether multiple Series represent conditions, separate runs/subjects, or readouts. The app will not guess and will preserve entered data.";
  }
  if (
    resolution.status === "needs_targeted_facts" &&
    state.facts.orderedCurveSeriesMeaning === "experimental_conditions"
  ) {
    return locale === "ja"
      ? "Seriesは比較条件です。異なるSeriesの試料が同じdonor・animal・dish・実験run・batchなどを共有するか確認してから、独立・対応・階層を決めます。"
      : "Series represents comparison conditions. Before deciding independence, matching, or hierarchy, confirm whether samples across Series share a donor, animal, dish, run, or batch.";
  }
  if (state.facts.axisMaterialRelationship === "unknown") {
    return locale === "ja"
      ? "各点が同じ対象の継続測定か、点ごとに別に用意した試料かで入力表の構造が変わります。推測せずここで止め、入力済みの内容は保持します。"
      : "The input structure changes depending on whether points follow the same subject or use separately prepared material. The app will stop rather than guess, and entered data will be preserved.";
  }
  if (
    state.facts.axisMaterialRelationship === "separate_material_per_axis_value" &&
    state.facts.axisPointParentRelationship === "unknown"
  ) {
    return locale === "ja"
      ? "別々に用意した試料が同じdonor・animal・dish・実験run・batchなどを共有するかで、独立したnと対応・階層の扱いが変わります。推測せず、入力済みの内容を保持して止めます。"
      : "Whether separately prepared samples share a donor, animal, dish, experimental run, or batch changes independence and hierarchy. The app will stop rather than guess and will preserve entered data.";
  }
  if (resolution.status === "needs_targeted_facts") {
    if (state.facts.axisMaterialRelationship === "separate_material_per_axis_value") {
      return locale === "ja"
        ? "点ごとに別の試料を用意しています。各Unit IDを独立した1例として扱う前に、同じdonor・animal・dish・実験run・batchなどを共有していないか確認してください。"
        : "Separate material was prepared for each point. Before treating each Unit ID as an independent case, confirm whether any share a donor, animal, dish, experimental run, or batch.";
    }
    return locale === "ja"
      ? "曲線の横方向の意味と、各点が同じ試料か別の試料かを確認すると、適切な入力表を準備できます。"
      : "Identify what the horizontal direction means and whether points use the same or separate material to prepare the appropriate input table.";
  }
  if (
    resolution.status === "safe_unsupported" &&
    state.facts.axisPointParentRelationship === "shared_parent_or_matching"
  ) {
    return locale === "ja"
      ? "別々の点の試料に共通の由来または対応関係があります。この簡易曲線表では独立した試料へ読み替えず、親IDを保持できる一般の実験設定で続けます。入力済みの内容は保持します。"
      : "Samples at separate points share a source or matching relationship. This simple curve table will not coerce them into independent samples; continue in the general experiment setup that retains parent IDs. Entered data will be preserved.";
  }
  const axis =
    axisMeaningLabel(state, locale) ?? (locale === "ja" ? "順序をもつ量" : "ordered quantity");
  if (state.facts.axisMaterialRelationship === "same_physical_material_across_axis") {
    return locale === "ja"
      ? `${axis}に沿って同じ反応・対象を繰り返し測る実験です。同じ対象を追えるIDを保った入力表を用意します。`
      : `This experiment repeatedly measures the same reaction or subject across ${axis}. The input table retains an ID that follows the same subject.`;
  }
  return locale === "ja"
    ? `${axis}の各点ごとに別の反応・試料を用意した実験です。共通の由来や対応関係がないという回答に基づき、各Unit IDを別の実験単位として1行ずつ保持します。`
    : `This experiment prepares separate reactions or material at each ${axis} point. Based on confirmation that there is no shared source or matching relationship, each Unit ID is retained as a separate experimental unit in its own row.`;
}

function invalidSummary(locale: EntryModuleLocale): string {
  return locale === "ja"
    ? "保存されている回答の一部を解釈できません。以前の入力は変更せず、該当項目だけ確認してください。"
    : "Some saved answers cannot be interpreted. Previous input remains unchanged; review only the affected fields.";
}

function genericSummary(
  state: EntryModuleTargetedFactsState,
  locale: EntryModuleLocale,
  resolution: EntryModuleResolution,
): string {
  if (state.moduleId === "ordered_curve_kinetics") {
    return orderedCurveSummary(state, locale, resolution);
  }
  if (resolution.status === "contract_deferred") {
    return locale === "ja"
      ? "値を入力してGraphを作ることはできます。実験構造が必要になった時点で、独立した1例と同じ対象から得た値の対応を確認します。"
      : "You can enter values and create a graph now. When experiment structure is needed, the app will ask which cases are independent and which values came from the same subject.";
  }
  return localized(getEntryModule(state.moduleId).researcherIntent, locale);
}

function safeStopFor(
  state: EntryModuleTargetedFactsState,
  locale: EntryModuleLocale,
  resolution: EntryModuleResolution | null,
  validationIssues: readonly EntryModuleFactValidationIssue[],
): EntryModuleSafeStop | null {
  if (validationIssues.length > 0) {
    return {
      kind: "invalid_state",
      title: localized(statusLabels.invalid, locale),
      message: invalidSummary(locale),
      reasonCodes: validationIssues.map(({ code }) => code),
      preserveEnteredData: true,
      suggestedAlternative: null,
    };
  }
  if (!resolution) return null;
  const humanDecisionRequired =
    resolution.status === "needs_targeted_facts" &&
    (state.facts.axisMaterialRelationship === "unknown" ||
      state.facts.axisPointParentRelationship === "unknown" ||
      state.facts.orderedCurveSeriesMeaning === "unknown" ||
      state.facts.orderedCurveSeriesParentRelationship === "unknown");
  if (!humanDecisionRequired && resolution.status !== "safe_unsupported") return null;
  const alternative = resolution.suggestedAlternativeModuleId;
  return {
    kind: humanDecisionRequired ? "human_decision_required" : "unsupported_structure",
    title: localized(
      statusLabels[humanDecisionRequired ? "human_decision_required" : "safe_unsupported"],
      locale,
    ),
    message: genericSummary(state, locale, resolution),
    reasonCodes: resolution.capabilityReasonCodes,
    preserveEnteredData: true,
    suggestedAlternative: alternative
      ? {
          moduleId: alternative,
          label: localized(getEntryModule(alternative).researcherIntent, locale),
          autoNavigate: false,
        }
      : null,
  };
}

function viewStatus(
  state: EntryModuleTargetedFactsState,
  resolution: EntryModuleResolution | null,
  validationIssues: readonly EntryModuleFactValidationIssue[],
): EntryModuleTargetedFactsViewModel["status"] {
  if (validationIssues.length > 0 || !resolution) return "invalid";
  if (resolution.status === "surface_ready") return "ready";
  if (resolution.status === "contract_deferred") return "contract_deferred";
  if (resolution.status === "safe_unsupported") return "safe_unsupported";
  if (
    state.facts.axisMaterialRelationship === "unknown" ||
    state.facts.axisPointParentRelationship === "unknown" ||
    state.facts.orderedCurveSeriesMeaning === "unknown" ||
    state.facts.orderedCurveSeriesParentRelationship === "unknown"
  ) {
    return "human_decision_required";
  }
  return "needs_answer";
}

export function entryModuleTargetedFactsViewModel(
  state: EntryModuleTargetedFactsState,
  locale: EntryModuleLocale,
): EntryModuleTargetedFactsViewModel {
  const definition = getEntryModule(state.moduleId);
  const validationIssues = validateEntryModuleTargetedFactsState(state);
  const resolution =
    validationIssues.length === 0 ? resolveEntryModule(state.moduleId, state.facts) : null;
  const status = viewStatus(state, resolution, validationIssues);
  const fallbackSurface = definition.preferredSurface;
  const preferredSurface = resolution?.preferredSurface ?? fallbackSurface;
  const unresolvedKeys = new Set(resolution?.unresolvedTargetedFacts.map(({ key }) => key) ?? []);
  const questions = definition.requiredTargetedFacts
    .filter(({ key }) => {
      if (key === "axis_point_parent_relationship") {
        return state.facts.axisMaterialRelationship === "separate_material_per_axis_value";
      }
      if (key === "ordered_curve_series_meaning") {
        return (state.facts.orderedCurveSeriesCount ?? 0) > 1;
      }
      if (key === "ordered_curve_series_parent_relationship") {
        return (
          (state.facts.orderedCurveSeriesCount ?? 0) > 1 &&
          state.facts.orderedCurveSeriesMeaning === "experimental_conditions"
        );
      }
      return true;
    })
    .map((fact) => ({
      key: fact.key,
      question: localized(fact.question, locale),
      choices: fact.choices.map((choice) => ({
        value: choice.value,
        label: localized(choice.label, locale),
      })),
      selectedValue: selectedFactValue(state, fact.key),
      unresolved: unresolvedKeys.has(fact.key),
      whenUnresolved: fact.whenUnresolved,
    }));
  const safeStop = safeStopFor(state, locale, resolution, validationIssues);
  const contractDeferral =
    resolution?.status === "contract_deferred"
      ? {
          title: localized(statusLabels.contract_deferred, locale),
          message: genericSummary(state, locale, resolution),
          reasonCodes: resolution.capabilityReasonCodes,
          preserveEnteredData: true as const,
          until: "experiment_structure_is_required" as const,
        }
      : null;

  return {
    moduleId: state.moduleId,
    locale,
    researcherIntent: localized(definition.researcherIntent, locale),
    status,
    statusLabel: localized(statusLabels[status], locale),
    summary: resolution ? genericSummary(state, locale, resolution) : invalidSummary(locale),
    questions,
    orderedAxisCountControl:
      state.moduleId === "ordered_curve_kinetics"
        ? {
            label:
              locale === "ja"
                ? "順番をもつ量はいくつありますか？"
                : "How many ordered quantities did you vary?",
            help:
              locale === "ja"
                ? "時間と濃度を同時に変えた場合は2つです。"
                : "For example, varying both time and concentration means two.",
            value: state.facts.orderedAxisCount ?? 1,
          }
        : null,
    preferredSurface: {
      ...preferredSurface,
      label: localized(adaptiveSurfaceLabels[preferredSurface.adaptiveSurfaceId], locale),
    },
    canOpenPreferredSurface: status === "ready" || status === "contract_deferred",
    canCompileStructureContract: status === "ready",
    validationIssues,
    reasonCodes: resolution?.capabilityReasonCodes ?? validationIssues.map(({ code }) => code),
    safeStop,
    contractDeferral,
    resolution,
  };
}
