import {
  ADAPTIVE_DESIGN_TEMPLATE_VERSION,
  AdaptiveDesignTemplateSchema,
  type AdaptiveDesignTemplate,
  type AdaptiveInputSnapshot,
} from "@lsaa/domain";
import type { ExperimentEntrySourceHistory } from "@lsaa/project";

export const EXPERIMENT_DRAFT_VERSION = "0.1.0" as const;

export type ExperimentContext =
  | "cell_culture"
  | "microscopy_imaging"
  | "protein_biochemical"
  | "animal"
  | "general_assay"
  | "existing_data";

export type ReadoutShape = "proportion" | "nested_continuous" | "categorical_counts" | "wb_ratio";
export type TimeSampling = "none" | "cross_sectional" | "longitudinal";
export type TimeUnit = "sec" | "min" | "h" | "day";
export type OrderedAxisSemantic = "time" | "numeric_covariate";
export type ConditionAssignmentKind = "independent" | "matched";
export type MatchedConditionTopology =
  | Readonly<{ kind: "same_entity_across_conditions" }>
  | Readonly<{
      kind: "distinct_condition_units_shared_source";
      sourceUnitLabel: string;
      sourceIdentityLabel: string;
      sourceRole: "block" | "sample";
    }>;
export type FactorScientificRole =
  | "intervention"
  | "genotype"
  | "time"
  | "state"
  | "rescue"
  | "control_reference"
  | "readout"
  | "other";
export type FactorUnitRole = "within_unit" | "between_unit";
export type FactorRelationshipKind = "independent" | "repeated" | "paired";
export type FactorVisualRole =
  "x" | "series" | "facet" | "annotation" | "auxiliary_reference" | "none";
export type AnalysisIntent =
  | Readonly<{ kind: "group_comparison" }>
  | Readonly<{
      kind: "single_cohort";
      mode: "descriptive" | "one_sample";
      referenceValue?: number;
    }>
  | Readonly<{
      kind: "correlation";
      relationshipForm: "linear" | "monotonic_or_ranked";
    }>;
export type TimeAnalysisPlan = Readonly<{
  kind:
    | "selected_timepoint"
    | "full_time_course"
    | "endpoint"
    | "maximum"
    | "minimum"
    | "auc"
    | "change_from_baseline"
    | "f_over_f0";
  windowStart?: number;
  windowEnd?: number;
  baselineTime?: number;
}>;

export type ConditionAssignmentDraft = Readonly<{
  kind: ConditionAssignmentKind;
  unitLabel: string;
  /**
   * Optional because historical matched drafts meant the literal same entity.
   * New adaptive drafts set it explicitly so matched sibling samples are not
   * presented or persisted as repeated measurements of one physical unit.
   */
  matchedTopology?: MatchedConditionTopology;
}>;

export type ConditionAttributeDraft = Readonly<{
  id: string;
  label: string;
  scientificRole?: FactorScientificRole;
  unitRole?: FactorUnitRole;
  relationship?: FactorRelationshipKind;
  proposedVisualRole?: FactorVisualRole;
}>;

export type ConditionDraft = Readonly<{
  id: string;
  label: string;
  attributes: Readonly<Record<string, string>>;
  role?: "primary" | "auxiliary_reference";
  sourceProvenance?: string;
}>;

export type ReadoutDraft = Readonly<{
  id: string;
  label: string;
  shape: ReadoutShape;
  unit?: string;
  categories?: readonly Readonly<{ id: string; label: string }>[];
  referenceLabel?: string;
  wbInputMode?: "corrected_value" | "imagej_mean_background_area";
  nestedInputMode?: "unit_summary" | "nested_observations";
  withinExperimentNormalization?: Readonly<{
    method: "control_equals_one" | "per_unit_maximum";
    baselineConditionId?: string;
  }>;
}>;

export type TimePointDraft = Readonly<{
  id: string;
  value: number;
}>;

export type TimePlanDraft = Readonly<{
  sampling: TimeSampling;
  unit: TimeUnit;
  points: readonly TimePointDraft[];
  /** Optional additive metadata; absent legacy drafts retain time semantics. */
  axisSemantic?: OrderedAxisSemantic;
  axisTitle?: string;
  axisUnit?: string;
  scientificRole?: FactorScientificRole;
  unitRole?: FactorUnitRole;
  relationship?: FactorRelationshipKind;
  proposedVisualRole?: FactorVisualRole;
}>;

export type ExperimentComparisonDraft = Readonly<{
  id: string;
  label: string;
  role: "primary" | "auxiliary";
  conditionIds: readonly [string, string];
}>;

export function orderedAxisSemantic(time: TimePlanDraft): OrderedAxisSemantic {
  return time.axisSemantic ?? "time";
}

export function orderedAxisTitle(time: TimePlanDraft): string {
  return time.axisTitle?.trim() || (orderedAxisSemantic(time) === "time" ? "Time" : "Numeric axis");
}

export function orderedAxisUnit(time: TimePlanDraft): string {
  return time.axisUnit?.trim() || (orderedAxisSemantic(time) === "time" ? time.unit : "");
}

export type ExperimentSessionDraft = Readonly<{
  id: string;
  label: string;
  /** Independently performed run/date/batch identity. */
  sessionId?: string;
  /** Stable biological/statistical unit identity; never inferred from date or row order. */
  stableUnitId?: string;
  date: string;
  note: string;
}>;

export type ExperimentSetDraft = Readonly<{
  version: typeof EXPERIMENT_DRAFT_VERSION;
  dataOrigin: "research" | "synthetic_demo";
  context: ExperimentContext;
  entryRoute?: string;
  name: string;
  readouts: readonly ReadoutDraft[];
  attributes: readonly ConditionAttributeDraft[];
  conditions: readonly ConditionDraft[];
  /** Explicit researcher-selected control. Never inferred from a visible label. */
  controlConditionId?: string;
  comparisons?: readonly ExperimentComparisonDraft[];
  analysisIntent: AnalysisIntent;
  conditionAssignment: ConditionAssignmentDraft;
  time: TimePlanDraft;
  experiments: readonly ExperimentSessionDraft[];
  importProvenance?: Readonly<{
    sourceLabel: string;
    importedAt: string;
    headers: readonly string[];
    sourceRows: readonly (readonly string[])[];
    mapping: Readonly<Record<string, string | number | null>>;
    excludedRowNumbers: readonly number[];
    duplicateDecision: "none" | "nested_observations";
    transformations?: readonly string[];
  }>;
  /** Feature-flagged Alpha companion. Legacy drafts omit it. */
  adaptiveInput?: AdaptiveInputSnapshot;
  /** Read-only evidence from a promoted entry project; never analysis authority. */
  entrySourceHistory?: ExperimentEntrySourceHistory;
  /** Data-free, versioned StructureContract template used only for design reuse. */
  adaptiveTemplate?: AdaptiveDesignTemplate;
}>;

export type ProportionCellDraft = Readonly<{
  kind: "proportion";
  positive: number | null;
  eligible: number | null;
  availability?: "planned" | "not_planned";
}>;

export type NestedContinuousCellDraft = Readonly<{
  kind: "nested_continuous";
  rawValues: readonly number[];
  source: "manual" | "paste";
  sourceLocations?: readonly string[];
  /** Stable lower-level identity, preserved across time/series when explicitly supplied. */
  observationUnitIds?: readonly string[];
  availability?: "planned" | "not_planned";
}>;

export type CategoricalCountsCellDraft = Readonly<{
  kind: "categorical_counts";
  counts: Readonly<Record<string, number | null>>;
  availability?: "planned" | "not_planned";
}>;

export type WbRatioCellDraft = Readonly<{
  kind: "wb_ratio";
  target: number | null;
  reference: number | null;
  inputMode?: "corrected_value" | "imagej_mean_background_area";
  targetSource?: WbBandSourceDraft;
  referenceSource?: WbBandSourceDraft;
  availability?: "planned" | "not_planned";
}>;

export type WbBandSourceDraft = Readonly<{
  intensity: number | null;
  background: number | null;
  area: number | null;
}>;

export type ExperimentCellDraft =
  ProportionCellDraft | NestedContinuousCellDraft | CategoricalCountsCellDraft | WbRatioCellDraft;
export type ExperimentCellMap = Readonly<Record<string, ExperimentCellDraft>>;

export const EXPERIMENT_CONTEXT_OPTIONS: ReadonlyArray<{
  id: ExperimentContext;
  title: string;
  description: string;
  available: boolean;
}> = [
  {
    id: "cell_culture",
    title: "細胞・培養",
    description: "細胞数、陽性率、強度、大きさ、形態など",
    available: true,
  },
  {
    id: "microscopy_imaging",
    title: "顕微鏡・画像解析",
    description: "蛍光強度、Cell・ROI、形態、移動、trackingなど",
    available: true,
  },
  {
    id: "protein_biochemical",
    title: "タンパク質・生化学",
    description: "WB、タンパク質量、活性、比率など",
    available: true,
  },
  {
    id: "animal",
    title: "動物",
    description: "個体、組織、繰り返し測定など",
    available: true,
  },
  {
    id: "general_assay",
    title: "その他の定量測定",
    description: "吸光度、発光、活性、濃度など",
    available: true,
  },
  {
    id: "existing_data",
    title: "既存データを取り込む",
    description: "Excel、CSV、ImageJ Resultsなど",
    available: true,
  },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createExperimentSetDraft(
  context: ExperimentContext,
  shape: ReadoutShape,
): ExperimentSetDraft {
  const readout =
    shape === "proportion"
      ? { id: "readout.1", label: "Marker X陽性率", shape }
      : shape === "categorical_counts"
        ? {
            id: "readout.1",
            label: "カテゴリ構成",
            shape,
            categories: [
              { id: "category.1", label: "Category A" },
              { id: "category.2", label: "Category B" },
              { id: "category.3", label: "Category C" },
            ],
          }
        : shape === "wb_ratio"
          ? {
              id: "readout.1",
              label: "標的タンパク質",
              shape,
              unit: "ratio",
              referenceLabel: "GAPDH",
              wbInputMode: "corrected_value" as const,
            }
          : {
              id: "readout.1",
              label: "細胞強度",
              shape,
              unit: "a.u.",
              nestedInputMode: "unit_summary" as const,
            };
  return {
    version: EXPERIMENT_DRAFT_VERSION,
    dataOrigin: "research",
    context,
    name: "新しい実験",
    readouts: [readout],
    attributes: [{ id: "attribute.1", label: "条件" }],
    conditions: Array.from({ length: 10 }, (_, index) => ({
      id: `condition.${index + 1}`,
      label: "",
      attributes: { "attribute.1": "" },
    })),
    analysisIntent: { kind: "group_comparison" },
    conditionAssignment: { kind: "independent", unitLabel: "実験単位" },
    time: { sampling: "none", unit: "h", points: [] },
    experiments: Array.from({ length: 3 }, (_, index) => ({
      id: `experiment.${index + 1}`,
      label: `Exp ${index + 1}`,
      sessionId: `session.${index + 1}`,
      stableUnitId: `unit.${index + 1}`,
      date: today(),
      note: "",
    })),
  };
}

export function conditionHasContent(condition: ConditionDraft): boolean {
  return Object.values(condition.attributes).some((value) => value.trim() !== "");
}

export function activeConditions(draft: ExperimentSetDraft): ConditionDraft[] {
  return draft.conditions.filter(conditionHasContent);
}

/** Number of physically distinct units that receive the declared conditions. */
export function plannedExperimentalUnitCount(draft: ExperimentSetDraft): number {
  const conditionCount = Math.max(1, draft.conditions.length);
  const separateConditionUnits =
    draft.conditionAssignment.kind === "independent" || hasSharedSourceConditionUnits(draft);
  return draft.experiments.length * (separateConditionUnits ? conditionCount : 1);
}

export function hasSharedSourceConditionUnits(draft: ExperimentSetDraft): boolean {
  return sharedSourceConditionTopology(draft) !== null;
}

export function sharedSourceConditionTopology(
  draft: ExperimentSetDraft,
): Extract<MatchedConditionTopology, { kind: "distinct_condition_units_shared_source" }> | null {
  const topology = draft.conditionAssignment.matchedTopology;
  return topology?.kind === "distinct_condition_units_shared_source" ? topology : null;
}

export function conditionDisplayLabel(
  condition: ConditionDraft,
  attributes: readonly ConditionAttributeDraft[],
): string {
  const values = attributes
    .map((attribute) => condition.attributes[attribute.id]?.trim() ?? "")
    .filter(Boolean);
  return values.join(" / ");
}

export function conditionAttributeLevels(
  draft: ExperimentSetDraft,
): Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> {
  return Object.fromEntries(
    draft.attributes.map((attribute) => {
      const levels: Record<string, string[]> = {};
      activeConditions(draft).forEach((condition) => {
        const value = condition.attributes[attribute.id]?.trim();
        if (!value) return;
        levels[value] = [...(levels[value] ?? []), condition.id];
      });
      return [attribute.id, levels];
    }),
  );
}

export function withActiveConditions(draft: ExperimentSetDraft): ExperimentSetDraft {
  const conditions = activeConditions(draft);
  const conditionIds = new Set(conditions.map(({ id }) => id));
  return {
    ...draft,
    conditions,
    controlConditionId: conditions.some(({ id }) => id === draft.controlConditionId)
      ? draft.controlConditionId
      : undefined,
    comparisons: draft.comparisons?.filter(({ conditionIds: pair }) =>
      pair.every((conditionId) => conditionIds.has(conditionId)),
    ),
  };
}

export function createExperimentSession(index: number): ExperimentSessionDraft {
  return {
    id: `experiment.${index}`,
    label: `Exp ${index}`,
    sessionId: `session.${index}`,
    stableUnitId: `unit.${index}`,
    date: today(),
    note: "",
  };
}

/**
 * Allocate the three linked draft identifiers as one collision-free set.
 *
 * Adaptive workspaces start with `adaptive-session.1` / `unit.1`.  Looking
 * only at `experiment.N` therefore used to allocate `experiment.1` / `unit.1`
 * for the first added row as well.  The graph could still draw both rows, but
 * D01/D02 correctly rejected the duplicate biological-unit identity.
 */
export function nextExperimentSessionIndex(experiments: readonly ExperimentSessionDraft[]): number {
  const usedExperimentIds = new Set(experiments.map(({ id }) => id));
  const usedSessionIds = new Set(experiments.map(({ sessionId }) => sessionId).filter(Boolean));
  const usedStableUnitIds = new Set(
    experiments.map(({ stableUnitId }) => stableUnitId).filter(Boolean),
  );
  let candidate = Math.max(1, experiments.length + 1);
  while (
    usedExperimentIds.has(`experiment.${candidate}`) ||
    usedSessionIds.has(`session.${candidate}`) ||
    usedStableUnitIds.has(`unit.${candidate}`)
  ) {
    candidate += 1;
  }
  return candidate;
}

/**
 * Canonical data-free boundary for every reusable design path.
 *
 * Reconstruct from an allow-list instead of deleting known fields from a live
 * draft.  This also scrubs legacy Favorites that may contain fields introduced
 * by older builds or future data-bearing entry extensions.
 */
export function sanitizeReusableExperimentDesign(draft: ExperimentSetDraft): ExperimentSetDraft {
  const templateCandidate = draft.adaptiveInput
    ? {
        schemaVersion: ADAPTIVE_DESIGN_TEMPLATE_VERSION,
        sourceSnapshotVersion: draft.adaptiveInput.schemaVersion,
        contract: draft.adaptiveInput.contract,
        surface: draft.adaptiveInput.surface,
        targetedConfirmations: draft.adaptiveInput.targetedConfirmations,
      }
    : draft.adaptiveTemplate
      ? draft.adaptiveTemplate
      : undefined;
  const parsedTemplate = templateCandidate
    ? AdaptiveDesignTemplateSchema.safeParse(templateCandidate)
    : null;
  const adaptiveTemplate: AdaptiveDesignTemplate | undefined = parsedTemplate?.success
    ? parsedTemplate.data
    : undefined;
  return {
    version: EXPERIMENT_DRAFT_VERSION,
    dataOrigin: "research",
    context: draft.context,
    ...(draft.entryRoute ? { entryRoute: draft.entryRoute } : {}),
    name: draft.name,
    readouts: draft.readouts,
    attributes: draft.attributes,
    conditions: draft.conditions,
    ...(draft.controlConditionId ? { controlConditionId: draft.controlConditionId } : {}),
    ...(draft.comparisons ? { comparisons: draft.comparisons } : {}),
    analysisIntent: draft.analysisIntent,
    conditionAssignment: draft.conditionAssignment,
    time: draft.time,
    ...(adaptiveTemplate ? { adaptiveTemplate } : {}),
    experiments: draft.experiments.map((experiment, index) => ({
      id: experiment.id,
      label: `Exp ${index + 1}`,
      sessionId: `session.${index + 1}`,
      stableUnitId: `unit.${index + 1}`,
      date: "",
      note: "",
    })),
  };
}

/** Copies reusable structure only. Measurement cells, graphs, and analysis history live elsewhere. */
export function reuseExperimentDesign(draft: ExperimentSetDraft): ExperimentSetDraft {
  const sanitized = sanitizeReusableExperimentDesign(draft);
  return {
    ...sanitized,
    name: `${draft.name}（設計再利用）`,
    experiments: sanitized.experiments.map((experiment) => ({
      ...experiment,
      date: today(),
    })),
  };
}

export function createTimePoint(index: number, value = index - 1): TimePointDraft {
  return { id: `time.${index}`, value };
}

export function experimentCellKey(input: {
  experimentId: string;
  conditionId: string;
  readoutId: string;
  timePointId?: string;
}): string {
  return [
    input.experimentId,
    input.conditionId,
    input.timePointId ?? "time.none",
    input.readoutId,
  ].join("::");
}

export function percentage(cell: ProportionCellDraft): number | null {
  if (cell.availability === "not_planned") return null;
  if (cell.positive === null || cell.eligible === null || cell.eligible <= 0) return null;
  if (cell.positive > cell.eligible) return null;
  return (cell.positive / cell.eligible) * 100;
}

export function cellIsNotPlanned(cell: ExperimentCellDraft | undefined): boolean {
  return cell?.availability === "not_planned";
}

export function categoricalTotal(cell: CategoricalCountsCellDraft): number | null {
  const values = Object.values(cell.counts);
  if (values.some((value) => value === null) || values.length < 2) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function categoricalPercentage(
  cell: CategoricalCountsCellDraft,
  categoryId: string,
): number | null {
  const total = categoricalTotal(cell);
  const value = cell.counts[categoryId];
  return total && value !== null && value !== undefined ? (value / total) * 100 : null;
}

export function wbRatio(cell: WbRatioCellDraft): number | null {
  if (cell.availability === "not_planned") return null;
  const target = wbCorrectedBandValue(cell, "target");
  const reference = wbCorrectedBandValue(cell, "reference");
  if (target === null || reference === null || reference <= 0) return null;
  return target / reference;
}

export function wbCorrectedBandValue(
  cell: WbRatioCellDraft,
  band: "target" | "reference",
): number | null {
  if ((cell.inputMode ?? "corrected_value") === "corrected_value") return cell[band];
  const source = band === "target" ? cell.targetSource : cell.referenceSource;
  if (
    !source ||
    source.intensity === null ||
    source.background === null ||
    source.area === null ||
    source.intensity < 0 ||
    source.background < 0 ||
    source.area <= 0
  ) {
    return null;
  }
  const corrected = (source.intensity - source.background) * source.area;
  return Number.isFinite(corrected) && corrected >= 0 ? corrected : null;
}

export function normalizeWithinExperiment(
  value: number | null,
  valuesByCondition: Readonly<Record<string, number | null>>,
  conditionId: string,
  readout: ReadoutDraft,
): number | null {
  if (value === null || !readout.withinExperimentNormalization) return value;
  const plan = readout.withinExperimentNormalization;
  const denominator =
    plan.method === "control_equals_one"
      ? (valuesByCondition[plan.baselineConditionId ?? ""] ?? null)
      : Math.max(
          ...Object.values(valuesByCondition).filter(
            (candidate): candidate is number => candidate !== null && Number.isFinite(candidate),
          ),
        );
  if (denominator === null || !Number.isFinite(denominator) || denominator === 0) return null;
  return valuesByCondition[conditionId] === null ? null : value / denominator;
}

export function continuousSummary(values: readonly number[]): Readonly<{
  n: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
}> {
  if (values.length === 0) return { n: 0, mean: null, median: null, sd: null };
  const ordered = [...values].sort((first, second) => first - second);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const middle = Math.floor(ordered.length / 2);
  const median =
    ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
  const sd =
    values.length < 2
      ? null
      : Math.sqrt(
          values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1),
        );
  return { n: values.length, mean, median, sd };
}

export function parseNumericPaste(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
}

export function expectedAnalysisLabel(draft: ExperimentSetDraft): string {
  if (draft.analysisIntent.kind === "single_cohort") {
    return draft.analysisIntent.mode === "descriptive"
      ? "単一コホートの分布と記述統計（比較なし）"
      : `単一コホートを明示した基準値 ${draft.analysisIntent.referenceValue ?? "未入力"} と比較`;
  }
  if (draft.analysisIntent.kind === "correlation") {
    return draft.analysisIntent.relationshipForm === "linear"
      ? "同じ実験単位から得たXとYの直線的な関係"
      : "同じ実験単位から得たXとYの順位・単調な関係";
  }
  if (draft.time.sampling === "longitudinal") {
    return draft.conditionAssignment.kind === "matched"
      ? "同じ単位を条件間・時間点間で追った解析候補"
      : "同じ単位を時間点間で追った解析候補";
  }
  if (draft.time.sampling === "cross_sectional") {
    return draft.conditionAssignment.kind === "matched"
      ? "時間点ごとの別サンプル内で、対応づけた条件を比較する解析候補"
      : "時間点ごとに別サンプルとして扱う条件と時間の比較候補";
  }
  if (draft.conditionAssignment.kind === "matched") {
    const sharedSourceTopology = sharedSourceConditionTopology(draft);
    if (sharedSourceTopology) {
      const sourceLabel = sharedSourceTopology.sourceUnitLabel;
      return activeConditions(draft).length > 2
        ? `同じ${sourceLabel}に由来する条件別${draft.conditionAssignment.unitLabel}の複数条件比較`
        : `同じ${sourceLabel}に由来する条件別${draft.conditionAssignment.unitLabel}の2条件比較`;
    }
    return activeConditions(draft).length > 2
      ? "同じ実験単位を対応づけた複数条件の比較"
      : "同じ実験単位を対応づけた2条件の比較";
  }
  if (activeConditions(draft).length > 2) return "独立した複数条件の比較";
  return "独立した2条件の比較";
}

export function timePointLabel(point: TimePointDraft, unit: string): string {
  return `${point.value} ${unit}`;
}
