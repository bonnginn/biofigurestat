import {
  STRUCTURE_CONTRACT_VERSION,
  type AdaptiveSurfaceId,
  type StructureContract,
} from "@lsaa/domain";

/**
 * Versioned boundary between researcher-facing entry choices and the
 * StructureContract compiler. This is deliberately separate from route names
 * and statistical methods so entry modules can later share one project shell.
 */
export const ENTRY_MODULE_REGISTRY_VERSION = "0.3.0" as const;
export const ENTRY_MODULE_UNSUPPORTED_POLICY =
  "preserve_input_and_stop_contract_compilation" as const;

export const ENTRY_MODULE_IDS = [
  "condition_canvas_general",
  "time_to_event",
  "ordered_curve_kinetics",
  "matrix_visualization",
  "graph_only_advanced",
] as const;

export type EntryModuleId = (typeof ENTRY_MODULE_IDS)[number];

export type EntrySurfaceId =
  | "condition_canvas"
  | "time_to_event_table"
  | "ordered_curve_table"
  | "matrix_visualization_grid"
  | "graph_data_sheet";

export type EntryModuleIngress = "experiment_first" | "advanced_schema_first";

export type EntryFactKey =
  | "ordered_axis_meaning"
  | "axis_material_relationship"
  | "axis_point_parent_relationship"
  | "ordered_curve_series_meaning"
  | "ordered_curve_series_parent_relationship"
  | "subject_unit_relationship"
  | "biological_structure_before_statistics";

export type ContractSemanticPath =
  | "experimentalUnitLevelKey"
  | "matching.kind"
  | "factors[].relationship"
  | "orderedAxes[].label"
  | "orderedAxes[].sampling"
  | "orderedAxes[].identityRetained"
  | "readouts[].representation"
  | "readouts[].componentKeys"
  | "allowedMissingness";

type SafeAutoInferenceBase<Path extends ContractSemanticPath, Value> = Readonly<{
  semanticPath: Path;
  value: Value;
  provenance: "explicit_entry_choice" | "explicit_targeted_fact";
  reasonCode: string;
}>;

export type SafeAutoInference =
  | SafeAutoInferenceBase<"experimentalUnitLevelKey", "subject_identity_level_from_surface">
  | SafeAutoInferenceBase<"matching.kind", StructureContract["matching"]["kind"]>
  | SafeAutoInferenceBase<"orderedAxes[].label", OrderedAxisMeaning | "follow_up_time">
  | SafeAutoInferenceBase<
      "orderedAxes[].sampling",
      StructureContract["orderedAxes"][number]["sampling"]
    >
  | SafeAutoInferenceBase<"orderedAxes[].identityRetained", boolean>
  | SafeAutoInferenceBase<
      "readouts[].representation",
      StructureContract["readouts"][number]["representation"]
    >
  | SafeAutoInferenceBase<"readouts[].componentKeys", readonly string[]>
  | SafeAutoInferenceBase<
      "allowedMissingness",
      readonly StructureContract["allowedMissingness"][number][]
    >;

export type TargetedFactChoice = Readonly<{
  value: string;
  label: Readonly<{ ja: string; en: string }>;
}>;

export type TargetedFactDeclaration = Readonly<{
  key: EntryFactKey;
  question: Readonly<{ ja: string; en: string }>;
  choices: readonly TargetedFactChoice[];
  changesSemanticPaths: readonly ContractSemanticPath[];
  whenUnresolved: "human_decision_required" | "defer_until_statistics";
}>;

export type ContractCapabilityDeclaration = Readonly<{
  mode:
    | "compile_after_entry"
    | "compile_after_targeted_facts"
    | "compile_after_general_interview"
    | "deferred_until_statistics";
  structureContractVersion: typeof STRUCTURE_CONTRACT_VERSION;
  safeStopReasonCodes: readonly string[];
  unsupportedPolicy: typeof ENTRY_MODULE_UNSUPPORTED_POLICY;
}>;

export type EntryModuleDefinition = Readonly<{
  schemaVersion: typeof ENTRY_MODULE_REGISTRY_VERSION;
  moduleId: EntryModuleId;
  ingress: EntryModuleIngress;
  researcherIntent: Readonly<{ ja: string; en: string }>;
  preferredSurface: Readonly<{
    entrySurfaceId: EntrySurfaceId;
    adaptiveSurfaceId: AdaptiveSurfaceId;
  }>;
  safeAutoInferences: readonly SafeAutoInference[];
  requiredTargetedFacts: readonly TargetedFactDeclaration[];
  contractCapability: ContractCapabilityDeclaration;
}>;

export type OrderedAxisMeaning =
  | "elapsed_time"
  | "substrate_concentration"
  | "treatment_concentration"
  | "temperature"
  | "distance"
  | "other_ordered_quantity";

export type AxisMaterialRelationship =
  "same_physical_material_across_axis" | "separate_material_per_axis_value" | "unknown";

export type AxisPointParentRelationship =
  "no_shared_parent_or_matching" | "shared_parent_or_matching" | "unknown";

export type OrderedCurveSeriesMeaning =
  "experimental_conditions" | "replicate_runs_or_units" | "different_readouts" | "unknown";

export type OrderedCurveSeriesParentRelationship =
  "no_shared_parent_or_matching" | "shared_parent_or_matching" | "unknown";

export type TimeToEventPattern =
  | "single_terminal_event_or_censoring"
  | "recurrent_events"
  | "competing_events"
  | "interval_censoring"
  | "multi_state";

export type SubjectUnitRelationship =
  "subject_is_experimental_unit" | "nested_in_parent" | "unknown";

/**
 * Only semantic facts that can change module capability belong here. Labels,
 * factor values, identities, and measurements are collected by the selected
 * surface and supplied to the full StructureContract compiler separately.
 */
export type EntryModuleFacts = Readonly<{
  orderedAxisMeaning?: OrderedAxisMeaning;
  axisMaterialRelationship?: AxisMaterialRelationship;
  axisPointParentRelationship?: AxisPointParentRelationship;
  orderedAxisCount?: number;
  orderedCurveSeriesCount?: number;
  orderedCurveSeriesMeaning?: OrderedCurveSeriesMeaning;
  orderedCurveSeriesParentRelationship?: OrderedCurveSeriesParentRelationship;
  timeToEventPattern?: TimeToEventPattern;
  subjectUnitRelationship?: SubjectUnitRelationship;
  statisticsRequested?: boolean;
  conditionPlan?: "complete_combinations" | "explicit_sparse_combinations";
  hierarchyShape?: "tree" | "many_to_many";
}>;

export type EntryModuleResolutionStatus =
  | "surface_ready"
  | "needs_targeted_facts"
  | "contract_deferred"
  /** Raw input must be preserved, but StructureContract compilation must stop. */
  | "safe_unsupported";

export type EntryModuleResolution = Readonly<{
  schemaVersion: typeof ENTRY_MODULE_REGISTRY_VERSION;
  moduleId: EntryModuleId;
  status: EntryModuleResolutionStatus;
  preferredSurface: EntryModuleDefinition["preferredSurface"];
  safeAutoInferences: readonly SafeAutoInference[];
  unresolvedTargetedFacts: readonly TargetedFactDeclaration[];
  capabilityReasonCodes: readonly string[];
  /** An alternative is advisory only; callers must never auto-route to it. */
  suggestedAlternativeModuleId: EntryModuleId | null;
}>;

const axisMeaningFact: TargetedFactDeclaration = {
  key: "ordered_axis_meaning",
  question: {
    ja: "実験で段階的に変えたものは何ですか？",
    en: "What did you vary in order along the horizontal direction?",
  },
  choices: [
    { value: "elapsed_time", label: { ja: "経過時間", en: "Elapsed time" } },
    {
      value: "substrate_concentration",
      label: { ja: "基質濃度", en: "Substrate concentration" },
    },
    {
      value: "treatment_concentration",
      label: { ja: "薬剤・処理の濃度", en: "Treatment concentration" },
    },
    { value: "temperature", label: { ja: "温度", en: "Temperature" } },
    { value: "distance", label: { ja: "距離・位置", en: "Distance or position" } },
    {
      value: "other_ordered_quantity",
      label: { ja: "その他の順序をもつ量", en: "Another ordered quantity" },
    },
  ],
  changesSemanticPaths: ["orderedAxes[].label"],
  whenUnresolved: "human_decision_required",
};

const materialRelationshipFact: TargetedFactDeclaration = {
  key: "axis_material_relationship",
  question: {
    ja: "各点は同じ反応・同じ対象を続けて測りましたか、それとも点ごとに別の反応・試料を用意しましたか？",
    en: "Did you follow the same reaction or subject across points, or prepare separate material for each point?",
  },
  choices: [
    {
      value: "same_physical_material_across_axis",
      label: { ja: "同じ反応・対象を続けて測った", en: "Followed the same reaction or subject" },
    },
    {
      value: "separate_material_per_axis_value",
      label: {
        ja: "各点に別の反応・試料を用意した",
        en: "Prepared separate material for each point",
      },
    },
    { value: "unknown", label: { ja: "判断できない", en: "Not sure" } },
  ],
  changesSemanticPaths: ["orderedAxes[].sampling", "orderedAxes[].identityRetained"],
  whenUnresolved: "human_decision_required",
};

const axisPointParentRelationshipFact: TargetedFactDeclaration = {
  key: "axis_point_parent_relationship",
  question: {
    ja: "点ごとに別の試料を用意した場合、それらに同じ由来（同じdonor・animal・dish・実験run・batchなど）を共有する組がありますか？",
    en: "Among the separately prepared point samples, do any share the same source, such as a donor, animal, dish, experimental run, or batch?",
  },
  choices: [
    {
      value: "no_shared_parent_or_matching",
      label: {
        ja: "共有する由来や対応関係はない",
        en: "No shared source or matching relationship",
      },
    },
    {
      value: "shared_parent_or_matching",
      label: {
        ja: "同じ由来から分けた試料、または対応のある組がある",
        en: "Some samples share a source or form matched sets",
      },
    },
    { value: "unknown", label: { ja: "判断できない", en: "Not sure" } },
  ],
  changesSemanticPaths: ["experimentalUnitLevelKey", "matching.kind"],
  whenUnresolved: "human_decision_required",
};

const orderedCurveSeriesMeaningFact: TargetedFactDeclaration = {
  key: "ordered_curve_series_meaning",
  question: {
    ja: "Series列で分けた名前は、何を表しますか？",
    en: "What do the names in the Series column represent?",
  },
  choices: [
    {
      value: "experimental_conditions",
      label: { ja: "比較する実験条件", en: "Experimental conditions to compare" },
    },
    {
      value: "replicate_runs_or_units",
      label: {
        ja: "同じ条件で行った別run・別replicate・別個体",
        en: "Separate runs, replicates, or subjects under the same condition",
      },
    },
    {
      value: "different_readouts",
      label: {
        ja: "同じ試料で測った別の測定項目",
        en: "Different readouts measured from the same material",
      },
    },
    { value: "unknown", label: { ja: "判断できない", en: "Not sure" } },
  ],
  changesSemanticPaths: ["factors[].relationship", "readouts[].representation"],
  whenUnresolved: "human_decision_required",
};

const orderedCurveSeriesParentRelationshipFact: TargetedFactDeclaration = {
  key: "ordered_curve_series_parent_relationship",
  question: {
    ja: "異なるSeriesの試料に、同じ由来（同じdonor・animal・dish・実験run・batchなど）を共有する組がありますか？",
    en: "Across Series, do any samples share the same source, such as a donor, animal, dish, experimental run, or batch?",
  },
  choices: [
    {
      value: "no_shared_parent_or_matching",
      label: {
        ja: "共有する由来や対応関係はない",
        en: "No shared source or matching relationship",
      },
    },
    {
      value: "shared_parent_or_matching",
      label: {
        ja: "同じ由来から分けた試料、または対応のある組がある",
        en: "Some samples share a source or form matched sets",
      },
    },
    { value: "unknown", label: { ja: "判断できない", en: "Not sure" } },
  ],
  changesSemanticPaths: ["factors[].relationship", "matching.kind"],
  whenUnresolved: "human_decision_required",
};

const biologicalStructureBeforeStatisticsFact: TargetedFactDeclaration = {
  key: "biological_structure_before_statistics",
  question: {
    ja: "統計へ進む前に、どの試料が独立した1例で、どの値が同じ対象から得られたかを確認します。",
    en: "Before statistics, identify which samples are independent cases and which values came from the same subject.",
  },
  choices: [],
  changesSemanticPaths: ["experimentalUnitLevelKey", "matching.kind"],
  whenUnresolved: "defer_until_statistics",
};

const subjectUnitRelationshipFact: TargetedFactDeclaration = {
  key: "subject_unit_relationship",
  question: {
    ja: "表の各対象IDはそれぞれ独立した1例ですか、それとも同じdish・animalなどに含まれるCellやROIですか？",
    en: "Is each subject ID an independent case, or is it a Cell or ROI nested within the same dish, animal, or other parent?",
  },
  choices: [
    {
      value: "subject_is_experimental_unit",
      label: {
        ja: "各IDが独立した1例",
        en: "Each ID is an independent case",
      },
    },
    {
      value: "nested_in_parent",
      label: {
        ja: "複数のIDが同じdish・animalなどに含まれる",
        en: "Multiple IDs belong to the same dish, animal, or other parent",
      },
    },
    {
      value: "unknown",
      label: { ja: "判断できない", en: "Not sure" },
    },
  ],
  changesSemanticPaths: ["experimentalUnitLevelKey", "matching.kind"],
  whenUnresolved: "human_decision_required",
};

const registry = {
  condition_canvas_general: {
    schemaVersion: ENTRY_MODULE_REGISTRY_VERSION,
    moduleId: "condition_canvas_general",
    ingress: "experiment_first",
    researcherIntent: {
      ja: "条件や試料の組み合わせを組み立てる実験",
      en: "An experiment built from combinations of conditions and samples",
    },
    preferredSurface: {
      entrySurfaceId: "condition_canvas",
      adaptiveSurfaceId: "factor_observation_table",
    },
    safeAutoInferences: [],
    requiredTargetedFacts: [],
    contractCapability: {
      mode: "compile_after_general_interview",
      structureContractVersion: STRUCTURE_CONTRACT_VERSION,
      safeStopReasonCodes: [
        "SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE",
        "MANY_TO_MANY_HIERARCHY_NOT_REPRESENTABLE",
      ],
      unsupportedPolicy: ENTRY_MODULE_UNSUPPORTED_POLICY,
    },
  },
  time_to_event: {
    schemaVersion: ENTRY_MODULE_REGISTRY_VERSION,
    moduleId: "time_to_event",
    ingress: "experiment_first",
    researcherIntent: {
      ja: "各対象について、ある出来事までの時間または観察終了を記録した実験",
      en: "An experiment recording time to an event or end of observation for each subject",
    },
    preferredSurface: {
      entrySurfaceId: "time_to_event_table",
      adaptiveSurfaceId: "typed_record_table",
    },
    safeAutoInferences: [
      {
        semanticPath: "readouts[].representation",
        value: "event_censoring",
        provenance: "explicit_entry_choice",
        reasonCode: "TIME_TO_EVENT_ENTRY_SELECTED",
      },
      {
        semanticPath: "readouts[].componentKeys",
        value: ["follow_up", "event_observed"],
        provenance: "explicit_entry_choice",
        reasonCode: "TIME_TO_EVENT_COLUMNS_FIXED",
      },
      {
        semanticPath: "orderedAxes[].sampling",
        value: "event_follow_up",
        provenance: "explicit_entry_choice",
        reasonCode: "ONE_EVENT_RECORD_PER_SUBJECT",
      },
      {
        semanticPath: "orderedAxes[].identityRetained",
        value: true,
        provenance: "explicit_entry_choice",
        reasonCode: "SUBJECT_ID_RETAINED_TO_EVENT_OR_CENSORING",
      },
      {
        semanticPath: "allowedMissingness",
        value: ["censored", "not_collected", "unknown"],
        provenance: "explicit_entry_choice",
        reasonCode: "CENSORING_RETAINED_AS_TYPED_STATUS",
      },
    ],
    requiredTargetedFacts: [subjectUnitRelationshipFact],
    contractCapability: {
      mode: "compile_after_targeted_facts",
      structureContractVersion: STRUCTURE_CONTRACT_VERSION,
      safeStopReasonCodes: [
        "RECURRENT_EVENTS_NOT_REPRESENTABLE",
        "COMPETING_EVENTS_NOT_REPRESENTABLE",
        "INTERVAL_CENSORING_NOT_REPRESENTABLE",
        "MULTI_STATE_EVENT_PROCESS_NOT_REPRESENTABLE",
        "NESTED_EVENT_SUBJECT_REQUIRES_PARENT_STRUCTURE",
      ],
      unsupportedPolicy: ENTRY_MODULE_UNSUPPORTED_POLICY,
    },
  },
  ordered_curve_kinetics: {
    schemaVersion: ENTRY_MODULE_REGISTRY_VERSION,
    moduleId: "ordered_curve_kinetics",
    ingress: "experiment_first",
    researcherIntent: {
      ja: "時間・濃度などを順番に変え、応答の曲線を記録した実験",
      en: "An experiment recording a response curve over time, concentration, or another ordered quantity",
    },
    preferredSurface: {
      entrySurfaceId: "ordered_curve_table",
      adaptiveSurfaceId: "factor_observation_table",
    },
    safeAutoInferences: [
      {
        semanticPath: "readouts[].representation",
        value: "scalar",
        provenance: "explicit_entry_choice",
        reasonCode: "ORDERED_RESPONSE_RETAINED_AS_VALUE_PLUS_AXIS",
      },
      {
        semanticPath: "readouts[].componentKeys",
        value: ["value"],
        provenance: "explicit_entry_choice",
        reasonCode: "ORDERED_RESPONSE_VALUE_COLUMN",
      },
    ],
    requiredTargetedFacts: [
      axisMeaningFact,
      materialRelationshipFact,
      axisPointParentRelationshipFact,
      orderedCurveSeriesMeaningFact,
      orderedCurveSeriesParentRelationshipFact,
    ],
    contractCapability: {
      mode: "compile_after_targeted_facts",
      structureContractVersion: STRUCTURE_CONTRACT_VERSION,
      safeStopReasonCodes: [
        "MULTIPLE_ORDERED_AXES_REQUIRE_GENERAL_ENTRY",
        "AXIS_MATERIAL_RELATIONSHIP_UNRESOLVED",
        "AXIS_POINT_PARENT_RELATIONSHIP_UNRESOLVED",
        "SEPARATE_AXIS_MATERIAL_HAS_SHARED_PARENT_REQUIRES_HIERARCHY",
        "ORDERED_CURVE_SERIES_MEANING_UNRESOLVED",
        "ORDERED_CURVE_SERIES_REPLICATES_REQUIRE_RESHAPING",
        "ORDERED_CURVE_MULTIPLE_READOUTS_REQUIRE_TYPED_READOUTS",
        "ORDERED_CURVE_SERIES_PARENT_RELATIONSHIP_UNRESOLVED",
        "ORDERED_CURVE_SERIES_SHARED_PARENT_REQUIRES_HIERARCHY",
      ],
      unsupportedPolicy: ENTRY_MODULE_UNSUPPORTED_POLICY,
    },
  },
  matrix_visualization: {
    schemaVersion: ENTRY_MODULE_REGISTRY_VERSION,
    moduleId: "matrix_visualization",
    ingress: "advanced_schema_first",
    researcherIntent: {
      ja: "既存の数値行列を、その配置を保ったまま可視化する",
      en: "Visualize an existing numeric matrix while preserving its layout",
    },
    preferredSurface: {
      entrySurfaceId: "matrix_visualization_grid",
      adaptiveSurfaceId: "factor_observation_table",
    },
    safeAutoInferences: [],
    requiredTargetedFacts: [biologicalStructureBeforeStatisticsFact],
    contractCapability: {
      mode: "deferred_until_statistics",
      structureContractVersion: STRUCTURE_CONTRACT_VERSION,
      safeStopReasonCodes: ["MATRIX_LAYOUT_DOES_NOT_ESTABLISH_EXPERIMENT_STRUCTURE"],
      unsupportedPolicy: ENTRY_MODULE_UNSUPPORTED_POLICY,
    },
  },
  graph_only_advanced: {
    schemaVersion: ENTRY_MODULE_REGISTRY_VERSION,
    moduleId: "graph_only_advanced",
    ingress: "advanced_schema_first",
    researcherIntent: {
      ja: "手元の値から、まずGraphを作る",
      en: "Create a graph first from existing values",
    },
    preferredSurface: {
      entrySurfaceId: "graph_data_sheet",
      adaptiveSurfaceId: "factor_observation_table",
    },
    safeAutoInferences: [],
    requiredTargetedFacts: [biologicalStructureBeforeStatisticsFact],
    contractCapability: {
      mode: "deferred_until_statistics",
      structureContractVersion: STRUCTURE_CONTRACT_VERSION,
      safeStopReasonCodes: ["GRAPH_VALUES_DO_NOT_ESTABLISH_EXPERIMENT_STRUCTURE"],
      unsupportedPolicy: ENTRY_MODULE_UNSUPPORTED_POLICY,
    },
  },
} as const satisfies Readonly<Record<EntryModuleId, EntryModuleDefinition>>;

export const ENTRY_MODULE_REGISTRY: Readonly<Record<EntryModuleId, EntryModuleDefinition>> =
  registry;

export function listEntryModules(): readonly EntryModuleDefinition[] {
  return ENTRY_MODULE_IDS.map((moduleId) => ENTRY_MODULE_REGISTRY[moduleId]);
}

export function getEntryModule(moduleId: EntryModuleId): EntryModuleDefinition {
  return ENTRY_MODULE_REGISTRY[moduleId];
}

export function parseEntryModuleId(value: string): EntryModuleId {
  if (!ENTRY_MODULE_IDS.includes(value as EntryModuleId)) {
    throw new Error(`UNKNOWN_ENTRY_MODULE:${value}`);
  }
  return value as EntryModuleId;
}

function resolvedPreferredSurface(
  definition: EntryModuleDefinition,
  facts: EntryModuleFacts,
): EntryModuleDefinition["preferredSurface"] {
  if (definition.moduleId !== "ordered_curve_kinetics") {
    return definition.preferredSurface;
  }
  return {
    entrySurfaceId: "ordered_curve_table",
    adaptiveSurfaceId:
      facts.axisMaterialRelationship === "same_physical_material_across_axis"
        ? "repeated_axis_matrix"
        : "factor_observation_table",
  };
}

function resolvedAxisInferences(facts: EntryModuleFacts): SafeAutoInference[] {
  const relationship = facts.axisMaterialRelationship;
  if (!facts.orderedAxisMeaning || !relationship || relationship === "unknown") {
    return [];
  }
  return [
    {
      semanticPath: "orderedAxes[].label",
      value: facts.orderedAxisMeaning,
      provenance: "explicit_targeted_fact",
      reasonCode: "ORDERED_AXIS_MEANING_CONFIRMED",
    },
    {
      semanticPath: "orderedAxes[].sampling",
      value:
        relationship === "same_physical_material_across_axis"
          ? "repeated_same_identity"
          : "cross_sectional",
      provenance: "explicit_targeted_fact",
      reasonCode: "AXIS_MATERIAL_RELATIONSHIP_CONFIRMED",
    },
    {
      semanticPath: "orderedAxes[].identityRetained",
      value: relationship === "same_physical_material_across_axis",
      provenance: "explicit_targeted_fact",
      reasonCode: "AXIS_IDENTITY_BEHAVIOR_CONFIRMED",
    },
  ];
}

function unsupportedTimeToEventReason(pattern: TimeToEventPattern | undefined): string | null {
  if (!pattern || pattern === "single_terminal_event_or_censoring") return null;
  return {
    recurrent_events: "RECURRENT_EVENTS_NOT_REPRESENTABLE",
    competing_events: "COMPETING_EVENTS_NOT_REPRESENTABLE",
    interval_censoring: "INTERVAL_CENSORING_NOT_REPRESENTABLE",
    multi_state: "MULTI_STATE_EVENT_PROCESS_NOT_REPRESENTABLE",
  }[pattern];
}

function resolvedTimeToEventUnitInferences(facts: EntryModuleFacts): SafeAutoInference[] {
  if (facts.subjectUnitRelationship !== "subject_is_experimental_unit") return [];
  return [
    {
      semanticPath: "experimentalUnitLevelKey",
      value: "subject_identity_level_from_surface",
      provenance: "explicit_targeted_fact",
      reasonCode: "SUBJECT_CONFIRMED_AS_EXPERIMENTAL_UNIT",
    },
    {
      semanticPath: "matching.kind",
      value: "independent",
      provenance: "explicit_targeted_fact",
      reasonCode: "DISTINCT_EXPERIMENTAL_UNIT_IDENTITIES_ARE_INDEPENDENT",
    },
  ];
}

/**
 * Resolves only generic semantic boundaries. It never inspects free text,
 * guesses a statistical method, or silently redirects an unsupported design.
 */
export function resolveEntryModule(
  moduleId: EntryModuleId,
  facts: EntryModuleFacts = {},
): EntryModuleResolution {
  const definition = getEntryModule(moduleId);
  const base = {
    schemaVersion: ENTRY_MODULE_REGISTRY_VERSION,
    moduleId,
    preferredSurface: resolvedPreferredSurface(definition, facts),
    suggestedAlternativeModuleId: null,
  } as const;

  if (moduleId === "condition_canvas_general") {
    if (facts.hierarchyShape === "many_to_many") {
      return {
        ...base,
        status: "safe_unsupported",
        safeAutoInferences: [],
        unresolvedTargetedFacts: [],
        capabilityReasonCodes: ["MANY_TO_MANY_HIERARCHY_NOT_REPRESENTABLE"],
      };
    }
    if (facts.conditionPlan === "explicit_sparse_combinations") {
      return {
        ...base,
        status: "safe_unsupported",
        safeAutoInferences: [],
        unresolvedTargetedFacts: [],
        capabilityReasonCodes: ["SPARSE_CONDITION_PLAN_NOT_REPRESENTABLE"],
      };
    }
    return {
      ...base,
      status: "surface_ready",
      safeAutoInferences: [],
      unresolvedTargetedFacts: [],
      capabilityReasonCodes: ["GENERAL_INTERVIEW_BUILDS_CONTRACT"],
    };
  }

  if (moduleId === "time_to_event") {
    const unsupportedReason = unsupportedTimeToEventReason(facts.timeToEventPattern);
    if (unsupportedReason) {
      return {
        ...base,
        status: "safe_unsupported",
        safeAutoInferences: definition.safeAutoInferences,
        unresolvedTargetedFacts: [],
        capabilityReasonCodes: [unsupportedReason],
      };
    }
    const subjectUnitInferences = resolvedTimeToEventUnitInferences(facts);
    if (facts.subjectUnitRelationship === "subject_is_experimental_unit") {
      return {
        ...base,
        status: "surface_ready",
        safeAutoInferences: [...definition.safeAutoInferences, ...subjectUnitInferences],
        unresolvedTargetedFacts: [],
        capabilityReasonCodes: ["STANDARD_TIME_TO_EVENT_CONTRACT_SEED_READY"],
      };
    }
    if (facts.subjectUnitRelationship === "nested_in_parent") {
      return {
        ...base,
        status: facts.statisticsRequested ? "needs_targeted_facts" : "contract_deferred",
        safeAutoInferences: definition.safeAutoInferences,
        unresolvedTargetedFacts: facts.statisticsRequested
          ? [biologicalStructureBeforeStatisticsFact]
          : [],
        capabilityReasonCodes: ["NESTED_EVENT_SUBJECT_REQUIRES_PARENT_STRUCTURE"],
        suggestedAlternativeModuleId: "condition_canvas_general",
      };
    }
    return {
      ...base,
      status: facts.statisticsRequested ? "needs_targeted_facts" : "contract_deferred",
      safeAutoInferences: definition.safeAutoInferences,
      unresolvedTargetedFacts: facts.statisticsRequested ? [subjectUnitRelationshipFact] : [],
      capabilityReasonCodes: ["SUBJECT_UNIT_RELATIONSHIP_NOT_YET_ESTABLISHED"],
    };
  }

  if (moduleId === "ordered_curve_kinetics") {
    if ((facts.orderedAxisCount ?? 1) > 1) {
      return {
        ...base,
        status: "safe_unsupported",
        safeAutoInferences: definition.safeAutoInferences,
        unresolvedTargetedFacts: [],
        capabilityReasonCodes: ["MULTIPLE_ORDERED_AXES_REQUIRE_GENERAL_ENTRY"],
        suggestedAlternativeModuleId: "condition_canvas_general",
      };
    }
    const unresolved = definition.requiredTargetedFacts.filter(({ key }) => {
      if (key === "ordered_axis_meaning") return !facts.orderedAxisMeaning;
      if (key === "axis_material_relationship") {
        return !facts.axisMaterialRelationship || facts.axisMaterialRelationship === "unknown";
      }
      if (key === "axis_point_parent_relationship") {
        return (
          facts.axisMaterialRelationship === "separate_material_per_axis_value" &&
          (!facts.axisPointParentRelationship || facts.axisPointParentRelationship === "unknown")
        );
      }
      if (key === "ordered_curve_series_meaning") {
        return (
          (facts.orderedCurveSeriesCount ?? 0) > 1 &&
          (!facts.orderedCurveSeriesMeaning || facts.orderedCurveSeriesMeaning === "unknown")
        );
      }
      if (key === "ordered_curve_series_parent_relationship") {
        return (
          (facts.orderedCurveSeriesCount ?? 0) > 1 &&
          facts.orderedCurveSeriesMeaning === "experimental_conditions" &&
          (!facts.orderedCurveSeriesParentRelationship ||
            facts.orderedCurveSeriesParentRelationship === "unknown")
        );
      }
      return false;
    });
    if (unresolved.length) {
      return {
        ...base,
        status: "needs_targeted_facts",
        safeAutoInferences: definition.safeAutoInferences,
        unresolvedTargetedFacts: unresolved,
        capabilityReasonCodes: unresolved.map(({ key }) =>
          key === "axis_material_relationship"
            ? "AXIS_MATERIAL_RELATIONSHIP_UNRESOLVED"
            : key === "axis_point_parent_relationship"
              ? "AXIS_POINT_PARENT_RELATIONSHIP_UNRESOLVED"
              : key === "ordered_curve_series_meaning"
                ? "ORDERED_CURVE_SERIES_MEANING_UNRESOLVED"
                : key === "ordered_curve_series_parent_relationship"
                  ? "ORDERED_CURVE_SERIES_PARENT_RELATIONSHIP_UNRESOLVED"
                  : "ORDERED_AXIS_MEANING_REQUIRED",
        ),
      };
    }
    if (
      facts.axisMaterialRelationship === "separate_material_per_axis_value" &&
      facts.axisPointParentRelationship === "shared_parent_or_matching"
    ) {
      return {
        ...base,
        status: "safe_unsupported",
        safeAutoInferences: [...definition.safeAutoInferences, ...resolvedAxisInferences(facts)],
        unresolvedTargetedFacts: [],
        capabilityReasonCodes: ["SEPARATE_AXIS_MATERIAL_HAS_SHARED_PARENT_REQUIRES_HIERARCHY"],
        suggestedAlternativeModuleId: "condition_canvas_general",
      };
    }
    if (
      (facts.orderedCurveSeriesCount ?? 0) > 1 &&
      facts.orderedCurveSeriesMeaning === "replicate_runs_or_units"
    ) {
      return {
        ...base,
        status: "safe_unsupported",
        safeAutoInferences: [...definition.safeAutoInferences, ...resolvedAxisInferences(facts)],
        unresolvedTargetedFacts: [],
        capabilityReasonCodes: ["ORDERED_CURVE_SERIES_REPLICATES_REQUIRE_RESHAPING"],
        suggestedAlternativeModuleId: "condition_canvas_general",
      };
    }
    if (
      (facts.orderedCurveSeriesCount ?? 0) > 1 &&
      facts.orderedCurveSeriesMeaning === "different_readouts"
    ) {
      return {
        ...base,
        status: "safe_unsupported",
        safeAutoInferences: [...definition.safeAutoInferences, ...resolvedAxisInferences(facts)],
        unresolvedTargetedFacts: [],
        capabilityReasonCodes: ["ORDERED_CURVE_MULTIPLE_READOUTS_REQUIRE_TYPED_READOUTS"],
        suggestedAlternativeModuleId: "condition_canvas_general",
      };
    }
    if (
      (facts.orderedCurveSeriesCount ?? 0) > 1 &&
      facts.orderedCurveSeriesMeaning === "experimental_conditions" &&
      facts.orderedCurveSeriesParentRelationship === "shared_parent_or_matching"
    ) {
      return {
        ...base,
        status: "safe_unsupported",
        safeAutoInferences: [...definition.safeAutoInferences, ...resolvedAxisInferences(facts)],
        unresolvedTargetedFacts: [],
        capabilityReasonCodes: ["ORDERED_CURVE_SERIES_SHARED_PARENT_REQUIRES_HIERARCHY"],
        suggestedAlternativeModuleId: "condition_canvas_general",
      };
    }
    return {
      ...base,
      status: "surface_ready",
      safeAutoInferences: [...definition.safeAutoInferences, ...resolvedAxisInferences(facts)],
      unresolvedTargetedFacts: [],
      capabilityReasonCodes: ["ORDERED_CURVE_CONTRACT_SEED_READY"],
    };
  }

  if (facts.statisticsRequested) {
    return {
      ...base,
      status: "needs_targeted_facts",
      safeAutoInferences: [],
      unresolvedTargetedFacts: definition.requiredTargetedFacts,
      capabilityReasonCodes: [
        moduleId === "matrix_visualization"
          ? "MATRIX_LAYOUT_DOES_NOT_ESTABLISH_EXPERIMENT_STRUCTURE"
          : "GRAPH_VALUES_DO_NOT_ESTABLISH_EXPERIMENT_STRUCTURE",
      ],
      suggestedAlternativeModuleId: "condition_canvas_general",
    };
  }
  return {
    ...base,
    status: "contract_deferred",
    safeAutoInferences: [],
    unresolvedTargetedFacts: [],
    capabilityReasonCodes: [
      moduleId === "matrix_visualization"
        ? "GRAPH_READY_WITHOUT_EXPERIMENT_STRUCTURE"
        : "GRAPH_FIRST_STRUCTURE_DEFERRED",
    ],
  };
}
