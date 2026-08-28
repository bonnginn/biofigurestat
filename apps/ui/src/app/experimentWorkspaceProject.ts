import {
  appendAnalysisExecution,
  appendDerivedDatasetArtifacts,
  appendDesignRevision,
  appendRawRevision,
  createInitialProjectState,
  ExperimentWorkspaceStateSchema,
  ProjectStateSchema,
  type ExperimentWorkspaceState,
  type ProjectState,
} from "@lsaa/project";
import {
  measurementNumericValue,
  type DerivedDatasetRevision,
  type DerivedScalarValue,
  type ExperimentDesign,
  type MeasurementValue,
  type Observation,
  type RawDatasetRevision,
  type TransformationSpec,
  type UnitInstance,
} from "@lsaa/domain";
import {
  AnalysisEngineRequestSchema,
  AnalysisEngineResultSchema,
  type AnalysisEngineRequest,
  type AnalysisEngineResult,
  type AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import {
  createNestedScalarDerivedDataset,
  createTimeSeriesMetricDerivedDataset,
  type TimeSeriesMetric,
  type TimeSeriesScalarInput,
} from "@lsaa/data-sheet";
import { GraphSpecSchema } from "@lsaa/graph-spec";

import {
  experimentCellKey,
  hasSharedSourceConditionUnits,
  normalizeWithinExperiment,
  orderedAxisSemantic,
  orderedAxisTitle,
  orderedAxisUnit,
  plannedExperimentalUnitCount,
  wbCorrectedBandValue,
  type ExperimentCellMap,
  type ExperimentSetDraft,
} from "./experimentDraft";
import { repeatedFactorCanonicalExplanation } from "./repeatedFactorTerminology";
import { synchronizeAdaptiveDraft } from "./adaptiveCanonicalStore";
import {
  assertDualWriteEquivalence,
  projectContractToExperimentDesign,
} from "@lsaa/adaptive-input";

type PersistedWorkspaceGraphState = ExperimentWorkspaceState["graphs"][number];

export type WorkspaceGraphAnalysis = Readonly<{
  request: AnalysisEngineRequest;
  result: AnalysisEngineResult;
  recommendedMethod?: AnalysisRecommendation["recommendedMethod"];
  recommendation?: AnalysisRecommendation;
}>;

export type WorkspaceGraphState = PersistedWorkspaceGraphState &
  Readonly<{ analysis?: WorkspaceGraphAnalysis | null }>;

type CanonicalWorkspaceRecords = Readonly<{
  rawRevision: RawDatasetRevision;
  unitInstances: UnitInstance[];
  observations: Observation[];
}>;

/**
 * Scientific revision decisions must not depend on object insertion order.
 * Volatile schema timestamps are removed at their known typed boundaries,
 * never recursively (a source column named "createdAt" is still real data).
 */
function semanticFingerprint(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return candidate;
  };
  return JSON.stringify(normalize(value));
}

function adaptiveRawPayload(snapshot: NonNullable<ExperimentSetDraft["adaptiveInput"]>) {
  const mapping = snapshot.mapping
    ? (({ confirmedAt: _confirmedAt, ...semantic }) => semantic)(snapshot.mapping)
    : null;
  const rawLineage = snapshot.rawLineage
    ? (({ importedAt: _importedAt, ...semantic }) => semantic)(snapshot.rawLineage)
    : null;
  return {
    canonicalObservations: snapshot.canonicalObservations,
    mapping,
    rawLineage,
  };
}

function designSemanticPayload(design: ExperimentDesign | undefined) {
  if (!design) return null;
  const { createdAt: _createdAt, ...semantic } = design;
  return semantic;
}

function activeCanonicalRecords(state: ProjectState): CanonicalWorkspaceRecords {
  const rawRevision = state.rawRevisions.find(({ id }) => id === state.activeRawRevisionId);
  if (!rawRevision) throw new Error("ACTIVE_RAW_REVISION_MISSING");
  return {
    rawRevision,
    // Unit IDs are immutable across raw revisions. Keeping the complete unit
    // registry lets analysis preparation resolve every active observation's
    // parent chain without manufacturing another raw revision.
    unitInstances: state.unitInstances,
    observations: state.observations.filter(
      ({ rawRevisionId }) => rawRevisionId === state.activeRawRevisionId,
    ),
  };
}

function nextWorkspaceArtifactRevisionIndex(state: ProjectState): number {
  const ids = [
    ...state.unitInstances.map(({ id }) => id),
    ...state.observations.map(({ id }) => id),
    ...state.transformations.map(({ id }) => id),
    ...state.derivedDatasetRevisions.map(({ id }) => id),
    ...state.derivedValues.map(({ id }) => id),
    ...state.analysisRuns.flatMap((run) => [run.id, run.request.requestId]),
    ...state.graphs.flatMap((graph) => [graph.id, graph.spec.id]),
  ];
  const highestPersistedIndex = ids.reduce((highest, id) => {
    const index = Number(id.match(/\.r(\d+)(?:\.|$)/)?.[1] ?? 0);
    return Math.max(highest, index);
  }, state.rawRevisions.length);
  return highestPersistedIndex + 1;
}

function pendingAnalysisGraphs(
  graphs: readonly WorkspaceGraphState[],
  existingState: ProjectState | undefined,
  upstreamChanged: boolean,
): WorkspaceGraphState[] {
  if (!existingState || upstreamChanged) return [...graphs];
  const persistedGraphs = new Map(
    (existingState.experimentWorkspace?.graphs ?? []).map((graph) => [graph.id, graph]),
  );
  return graphs.filter((graph) => {
    const persistedGraph = persistedGraphs.get(graph.id);
    if (!persistedGraph) return true;
    const derivationPayload = (candidate: WorkspaceGraphState | PersistedWorkspaceGraphState) => ({
      selectedReadoutId: candidate.selectedReadoutId,
      selectedConditionIds: candidate.selectedConditionIds,
      selectedTimePointIds: candidate.selectedTimePointIds,
      analysisTimePointId: candidate.analysisTimePointId,
      analysisMetric: candidate.analysisMetric,
    });
    if (
      semanticFingerprint(derivationPayload(graph)) !==
      semanticFingerprint(derivationPayload(persistedGraph))
    )
      return true;
    if (!graph.analysis) return false;
    const persistedRun = persistedGraph?.analysisRunId
      ? existingState.analysisRuns.find(({ id }) => id === persistedGraph.analysisRunId)
      : undefined;
    if (!persistedRun) return true;
    return (
      semanticFingerprint({
        request: graph.analysis.request,
        result: graph.analysis.result,
        recommendation: graph.analysis.recommendation ?? null,
        recommendedMethod: graph.analysis.recommendedMethod ?? null,
      }) !==
      semanticFingerprint({
        request: persistedRun.request,
        result: persistedRun.result,
        recommendation: persistedRun.recommendation,
        recommendedMethod: persistedRun.recommendation.recommendedMethod,
      })
    );
  });
}

const adaptiveUnitToken = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "unit";

function createAdaptiveCanonicalRecords(
  draft: ExperimentSetDraft,
  rawRevision: RawDatasetRevision,
  revisionIndex: number,
): CanonicalWorkspaceRecords | null {
  const snapshot = draft.adaptiveInput;
  if (!snapshot) return null;
  const contract = snapshot.contract;
  const combinations = contract.factors.reduce<Array<Record<string, string>>>(
    (rows, factor) =>
      rows.flatMap((row) => factor.levels.map((level) => ({ ...row, [factor.key]: level }))),
    [{}],
  );
  const unitInstances: UnitInstance[] = [];
  const observations: Observation[] = [];
  const unitIds = new Map<string, string>();
  const levels = new Map(contract.unitLevels.map((level) => [level.key, level]));
  const identityForLevel = new Map(
    contract.identities.map((identity) => [identity.unitLevelKey, identity.key]),
  );
  const experimentalIdentityKey =
    identityForLevel.get(contract.experimentalUnitLevelKey) ?? contract.identities[0]!.key;
  const sharedSourceConditionUnits = hasSharedSourceConditionUnits(draft);
  const sessionIdentityKey =
    draft.conditionAssignment.kind === "matched"
      ? (contract.matching.identityKey ?? experimentalIdentityKey)
      : experimentalIdentityKey;
  const experimentSessionFor = (
    row: (typeof snapshot.canonicalObservations)[number],
    conditionIndex: number,
  ) => {
    const semanticIdentity = row.identities[sessionIdentityKey];
    if (!semanticIdentity) return undefined;
    if (draft.conditionAssignment.kind === "matched") {
      return draft.experiments.find(
        ({ stableUnitId, label }) =>
          stableUnitId === semanticIdentity || label === semanticIdentity,
      )?.id;
    }
    const combination = combinations[conditionIndex]!;
    const identities = [
      ...new Set(
        snapshot.canonicalObservations
          .filter((candidate) =>
            contract.factors.every(
              (factor) => candidate.factors[factor.key] === combination[factor.key],
            ),
          )
          .map((candidate) => candidate.identities[experimentalIdentityKey])
          .filter((candidate): candidate is string => Boolean(candidate)),
      ),
    ];
    const sessionIndex = identities.indexOf(semanticIdentity);
    return sessionIndex >= 0 ? draft.experiments[sessionIndex]?.id : undefined;
  };
  const rowUnit = (
    row: (typeof snapshot.canonicalObservations)[number],
    levelKey: string,
    conditionIndex: number,
  ): string => {
    const level = levels.get(levelKey);
    if (!level) throw new Error(`ADAPTIVE_UNKNOWN_UNIT_LEVEL:${levelKey}`);
    const parentId = level.parentKey ? rowUnit(row, level.parentKey, conditionIndex) : null;
    const identityKey = identityForLevel.get(levelKey);
    const semanticIdentity =
      (identityKey ? row.identities[identityKey] : undefined) ??
      row.hierarchy[levelKey] ??
      (levelKey === contract.experimentalUnitLevelKey
        ? row.identities[contract.identities[0]!.key]
        : undefined);
    if (!semanticIdentity)
      throw new Error(`ADAPTIVE_UNIT_IDENTITY_MISSING:${levelKey}:${row.observationId}`);
    const conditionScope =
      levelKey === contract.experimentalUnitLevelKey &&
      (draft.conditionAssignment.kind !== "matched" || sharedSourceConditionUnits)
        ? `|condition.${conditionIndex + 1}`
        : "";
    const composite = `${levelKey}|${parentId ?? "root"}|${semanticIdentity}${conditionScope}`;
    const existing = unitIds.get(composite);
    if (existing) return existing;
    const id = `unit.adaptive.${adaptiveUnitToken(levelKey)}.${unitIds.size + 1}.r${revisionIndex}`;
    unitIds.set(composite, id);
    const experimentSessionId =
      levelKey === contract.experimentalUnitLevelKey
        ? experimentSessionFor(row, conditionIndex)
        : undefined;
    unitInstances.push({
      id,
      levelId: `unit-level.${levelKey}`,
      parentUnitId: parentId,
      label: semanticIdentity,
      metadata: {
        semanticIdentity,
        semanticLevel: levelKey,
        ...(experimentSessionId ? { experimentSessionId } : {}),
      },
    });
    return id;
  };
  const component = (
    row: (typeof snapshot.canonicalObservations)[number],
    readoutKey: string,
    key: string,
  ) => row.values[`${readoutKey}_${key}`] ?? row.values[key];
  for (const row of snapshot.canonicalObservations) {
    const readout = contract.readouts.find(({ key }) => key === row.readoutKey);
    if (!readout) throw new Error(`ADAPTIVE_UNKNOWN_READOUT:${row.readoutKey}`);
    let measurement: MeasurementValue | null = null;
    if (readout.representation === "scalar") {
      const value = row.values[readout.key];
      if (typeof value === "number" && Number.isFinite(value))
        measurement = { kind: "scalar", value };
    } else if (readout.representation === "proportion_counts") {
      const numerator = component(row, readout.key, readout.componentKeys[0]!);
      const denominator = component(row, readout.key, readout.componentKeys[1]!);
      if (typeof numerator === "number" && typeof denominator === "number")
        measurement = { kind: "proportion", numerator, denominator };
    } else if (readout.representation === "category_counts") {
      const counts = Object.fromEntries(
        readout.componentKeys.flatMap((key) => {
          const value = component(row, readout.key, key);
          return typeof value === "number" ? [[key, value]] : [];
        }),
      );
      if (Object.keys(counts).length >= 2) measurement = { kind: "categorical_counts", counts };
    } else if (readout.representation === "target_reference") {
      const target = component(row, readout.key, "target");
      const reference = component(row, readout.key, "reference");
      if (typeof target === "number" && typeof reference === "number" && reference > 0)
        measurement = {
          kind: "loading_control_ratio",
          target,
          loadingControl: reference,
          transformationVersion: "0.1.0",
        };
    }
    if (!measurement) continue;
    const conditionIndex = combinations.findIndex((combination) =>
      contract.factors.every((factor) => combination[factor.key] === row.factors[factor.key]),
    );
    if (conditionIndex < 0) throw new Error(`ADAPTIVE_CONDITION_MISMATCH:${row.observationId}`);
    const axisValue = contract.orderedAxes[0] ? row.axes[contract.orderedAxes[0].key] : undefined;
    observations.push({
      id: `observation.adaptive.${observations.length + 1}.r${revisionIndex}`,
      rawRevisionId: rawRevision.id,
      unitInstanceId: rowUnit(row, readout.observationLevelKey, conditionIndex),
      conditionId: `condition.${conditionIndex + 1}`,
      outcomeId: `outcome.${readout.key}`,
      measurement,
      ...(typeof axisValue === "number" ? { time: axisValue } : {}),
      sourceLocation: `adaptive:${row.observationId}:row-${row.sourceRow ?? "unknown"}`,
    });
  }
  return { rawRevision, unitInstances, observations };
}

type PreparedAnalysis = Readonly<{
  graphId: string;
  request: AnalysisEngineRequest;
  result: AnalysisEngineResult;
  recommendation: AnalysisRecommendation;
  graphSpec: ReturnType<typeof GraphSpecSchema.parse>;
  derivedDatasetRevisionId: string | null;
}>;

type PreparedWorkspaceAnalyses = Readonly<{
  transformations: TransformationSpec[];
  derivedDatasetRevisions: DerivedDatasetRevision[];
  derivedValues: DerivedScalarValue[];
  analyses: PreparedAnalysis[];
}>;

function purposeFor(context: ExperimentSetDraft["context"]): ExperimentDesign["purpose"] {
  if (context === "protein_biochemical") return "western_blot";
  if (context === "animal") return "animal";
  if (context === "general_assay") return "general_assay";
  if (context === "microscopy_imaging") return "microscopy";
  if (context === "cell_culture") return "custom";
  return "custom";
}

export function createExperimentWorkspaceDesign(
  draft: ExperimentSetDraft,
  createdAt: string,
): ExperimentDesign {
  if (hasSharedSourceConditionUnits(draft)) {
    if (draft.adaptiveInput) {
      return projectContractToExperimentDesign(
        draft.adaptiveInput.contract,
        plannedExperimentalUnitCount(draft),
        createdAt,
      );
    }
    throw new Error("SHARED_SOURCE_REQUIRES_ADAPTIVE_CONTRACT_PROJECTION");
  }
  const factors = draft.attributes.flatMap((attribute) => {
    const values = [
      ...new Set(
        draft.conditions
          .map((condition) => condition.attributes[attribute.id]?.trim())
          .filter(Boolean),
      ),
    ];
    if (values.length < 2) return [];
    return [
      {
        id: `factor.${attribute.id}`,
        key: attribute.id,
        label: attribute.label,
        scientificRole: attribute.scientificRole,
        unitRole: attribute.unitRole,
        relationship: attribute.relationship
          ? {
              kind: attribute.relationship,
              ...(attribute.unitRole === "within_unit"
                ? { unitLevelId: "unit-level.experimental-unit" }
                : {}),
            }
          : undefined,
        proposedVisualRole: attribute.proposedVisualRole,
        levels: values.map((value, index) => ({
          id: `level.${attribute.id}.${index + 1}`,
          label: value,
          order: index,
        })),
      },
    ];
  });
  const effectiveFactors =
    factors.length > 0
      ? factors
      : [
          {
            id: "factor.condition",
            key: "condition",
            label: "条件",
            scientificRole: "other" as const,
            unitRole: "between_unit" as const,
            relationship: { kind: "independent" as const },
            proposedVisualRole: "x" as const,
            levels: draft.conditions.map((condition, index) => ({
              id: `level.condition.${index + 1}`,
              label: condition.label,
              order: index,
            })),
          },
        ];
  return {
    schemaVersion: "0.2.0",
    id: "design.experiment-workspace",
    name: draft.name,
    purpose: purposeFor(draft.context),
    outcomes: draft.readouts.map((readout) => ({
      id: readout.id,
      key: readout.id,
      label: readout.label,
      type:
        readout.shape === "proportion"
          ? "proportion_counts"
          : readout.shape === "categorical_counts"
            ? "categorical_counts"
            : "continuous",
      ...(readout.unit ? { unit: readout.unit } : {}),
    })),
    factors: effectiveFactors,
    observationFactors:
      draft.time.points.length > 0
        ? [
            {
              id: "factor.time",
              key: "time",
              label: orderedAxisTitle(draft.time),
              scientificRole: draft.time.scientificRole ?? "time",
              unitRole:
                draft.time.unitRole ??
                (draft.time.sampling === "longitudinal" ? "within_unit" : "between_unit"),
              relationship: {
                kind:
                  draft.time.relationship ??
                  (draft.time.sampling === "longitudinal" ? "repeated" : "independent"),
              },
              proposedVisualRole:
                draft.time.proposedVisualRole ??
                (draft.time.sampling === "cross_sectional" ? "series" : "x"),
              levels: draft.time.points.map((point, index) => ({
                id: `level.time.${index + 1}`,
                label: `${point.value} ${orderedAxisUnit(draft.time)}`.trim(),
                order: index,
              })),
            },
          ]
        : undefined,
    conditions: draft.conditions.map((condition, conditionIndex) => ({
      id: condition.id,
      label: condition.label,
      factorLevels: Object.fromEntries(
        effectiveFactors.map((factor) => {
          if (factor.id === "factor.condition") {
            return [factor.id, factor.levels[conditionIndex].id];
          }
          const attributeId = factor.key;
          const value = condition.attributes[attributeId]?.trim();
          const level = factor.levels.find((candidate) => candidate.label === value);
          return [factor.id, level?.id ?? factor.levels[0].id];
        }),
      ),
      role: condition.role,
      sourceProvenance: condition.sourceProvenance,
    })),
    unitLevels: [
      {
        id: "unit-level.experimental-unit",
        key: "experimental_unit",
        label: "実験単位",
        role: "experimental_unit",
        parentLevelId: null,
      },
      {
        id: "unit-level.observation",
        key: "observation",
        label: "細胞・ROI",
        role: "subsample",
        parentLevelId: "unit-level.experimental-unit",
      },
    ],
    experimentalUnitLevelId: "unit-level.experimental-unit",
    pairing:
      draft.conditionAssignment.kind === "matched"
        ? {
            kind: "matched",
            matchLevelId: "unit-level.experimental-unit",
            completePairsRequired: true,
          }
        : { kind: "independent" },
    plannedN: plannedExperimentalUnitCount(draft),
    normalizationPlans: draft.readouts.flatMap((readout) => [
      ...(readout.shape === "wb_ratio"
        ? [
            {
              id: `normalization.${readout.id}`,
              method: "loading_control" as const,
              parameters: {
                outcomeId: readout.id,
                referenceLabel: readout.referenceLabel ?? "reference",
                formula: "target/reference",
                inputMode: readout.wbInputMode ?? "corrected_value",
                ...(readout.wbInputMode === "imagej_mean_background_area"
                  ? {
                      bandCorrectionFormula: "(mean intensity - mean background) * area",
                      bandCorrectionVersion: "0.1.0",
                    }
                  : {}),
              },
            },
          ]
        : []),
      ...(readout.withinExperimentNormalization
        ? [
            {
              id: `normalization.${readout.id}.within-experiment`,
              method: readout.withinExperimentNormalization.method,
              parameters: {
                outcomeId: readout.id,
                scope: "within_experiment",
                ...(readout.withinExperimentNormalization.baselineConditionId
                  ? {
                      baselineConditionId:
                        readout.withinExperimentNormalization.baselineConditionId,
                    }
                  : {}),
              },
            },
          ]
        : []),
    ]),
    primaryContrast: (() => {
      const declaredPrimary = draft.comparisons?.find(({ role }) => role === "primary");
      const primaryConditions = draft.conditions.filter(
        ({ role }) => role !== "auxiliary_reference",
      );
      return declaredPrimary
        ? {
            id: declaredPrimary.id,
            label: declaredPrimary.label,
            conditionIds: [...declaredPrimary.conditionIds] as [string, string],
          }
        : primaryConditions.length >= 2
          ? {
              id: "contrast.primary",
              label: `${primaryConditions[0].label} vs ${primaryConditions[1].label}`,
              conditionIds: [primaryConditions[0].id, primaryConditions[1].id] as [string, string],
            }
          : null;
    })(),
    comparisons: draft.comparisons?.map((comparison) => ({
      ...comparison,
      conditionIds: [...comparison.conditionIds] as [string, string],
    })),
    wizardRuleVersion: "experiment-workspace.0.1.0",
    wizardDecisions: [
      ...(draft.analysisIntent.kind === "correlation"
        ? [
            { questionId: "workspace.analysis.intent", answer: "correlation" },
            {
              questionId: "correlation.relationship_form",
              answer: draft.analysisIntent.relationshipForm,
            },
          ]
        : draft.analysisIntent.kind === "single_cohort"
          ? [
              { questionId: "workspace.analysis.intent", answer: "single_cohort" },
              { questionId: "workspace.single_cohort.mode", answer: draft.analysisIntent.mode },
              ...(draft.analysisIntent.referenceValue === undefined
                ? []
                : [
                    {
                      questionId: "workspace.single_cohort.reference_value",
                      answer: draft.analysisIntent.referenceValue,
                    },
                  ]),
            ]
          : [{ questionId: "workspace.analysis.intent", answer: "group_comparison" }]),
      { questionId: "workspace.time.sampling", answer: draft.time.sampling },
      { questionId: "workspace.ordered_axis.semantic", answer: orderedAxisSemantic(draft.time) },
      { questionId: "workspace.ordered_axis.title", answer: orderedAxisTitle(draft.time) },
      { questionId: "workspace.ordered_axis.unit", answer: orderedAxisUnit(draft.time) },
      {
        questionId: "workspace.condition.assignment",
        answer: draft.conditionAssignment.kind,
      },
      { questionId: "workspace.time.unit", answer: draft.time.unit },
      {
        questionId: "workspace.time.points",
        answer: draft.time.points.map((point) => String(point.value)),
      },
    ],
    createdAt,
  };
}

function createWorkspaceSnapshot(
  draft: ExperimentSetDraft,
  cells: ExperimentCellMap,
  graphs: readonly WorkspaceGraphState[],
  dataViewMode: "compact" | "expanded",
): ExperimentWorkspaceState {
  return ExperimentWorkspaceStateSchema.parse({
    version: "0.1.0",
    dataOrigin: draft.dataOrigin,
    context: draft.context,
    entryRoute: draft.entryRoute,
    readoutDefinitions: draft.readouts,
    conditionAttributes: draft.attributes,
    conditions: draft.conditions,
    controlConditionId: draft.controlConditionId,
    comparisons: draft.comparisons,
    analysisIntent: draft.analysisIntent,
    conditionAssignment: draft.conditionAssignment,
    timePlan: draft.time,
    experimentSessions: draft.experiments,
    importProvenance: draft.importProvenance,
    entrySourceHistory: draft.entrySourceHistory ?? null,
    dataViewMode,
    adaptiveInput: draft.adaptiveInput ?? null,
    notPlannedCellKeys: Object.entries(cells)
      .filter(([, cell]) => cell.availability === "not_planned")
      .map(([key]) => key),
    graphs: graphs.map(({ analysis: _analysis, ...graph }) => graph),
  });
}

function createCanonicalRecords(
  draft: ExperimentSetDraft,
  cells: ExperimentCellMap,
  rawRevision: RawDatasetRevision,
  revisionIndex: number,
): CanonicalWorkspaceRecords {
  const adaptive = createAdaptiveCanonicalRecords(draft, rawRevision, revisionIndex);
  if (adaptive) return adaptive;
  const unitInstances: UnitInstance[] = [];
  const observations: Observation[] = [];
  for (const experiment of draft.experiments) {
    const stableUnitId = experiment.stableUnitId ?? experiment.id;
    const sessionId = experiment.sessionId ?? experiment.id;
    const matchedUnitId = `unit.${stableUnitId}.matched.r${revisionIndex}`;
    if (draft.conditionAssignment.kind === "matched") {
      const matchedUnit: UnitInstance = {
        id: matchedUnitId,
        levelId: "unit-level.experimental-unit",
        parentUnitId: null,
        label: `${experiment.label} · ${draft.conditionAssignment.unitLabel}`,
        metadata: {
          experimentSessionId: experiment.id,
          sessionId,
          stableUnitId,
          experimentSessionLabel: experiment.label,
          experimentSessionNote: experiment.note,
          conditionAssignment: "matched",
        },
      };
      if (!unitInstances.some(({ id }) => id === matchedUnit.id)) unitInstances.push(matchedUnit);
    }
    for (const condition of draft.conditions) {
      const unitId =
        draft.conditionAssignment.kind === "matched"
          ? matchedUnitId
          : `unit.${stableUnitId}.${condition.id}.r${revisionIndex}`;
      const metadata = {
        experimentSessionId: experiment.id,
        sessionId,
        stableUnitId:
          draft.conditionAssignment.kind === "matched"
            ? stableUnitId
            : `${stableUnitId}.${condition.id}`,
        experimentSessionLabel: experiment.label,
        experimentSessionNote: experiment.note,
        conditionId: condition.id,
      };
      if (draft.conditionAssignment.kind === "independent") {
        const independentUnit: UnitInstance = {
          id: unitId,
          levelId: "unit-level.experimental-unit",
          parentUnitId: null,
          label: `${experiment.label} · ${condition.label}`,
          metadata,
        };
        if (!unitInstances.some(({ id }) => id === independentUnit.id))
          unitInstances.push(independentUnit);
      }
      const timePoints = draft.time.points.length > 0 ? draft.time.points : [undefined];
      for (const readout of draft.readouts) {
        for (const timePoint of timePoints) {
          const key = experimentCellKey({
            experimentId: experiment.id,
            conditionId: condition.id,
            readoutId: readout.id,
            timePointId: timePoint?.id,
          });
          const cell = cells[key];
          if (cell?.availability === "not_planned") continue;
          const common = {
            rawRevisionId: rawRevision.id,
            conditionId: condition.id,
            outcomeId: readout.id,
            ...(experiment.date ? { experimentDate: experiment.date } : {}),
            ...(timePoint ? { time: timePoint.value } : {}),
            sourceLocation: `workspace:${key}`,
          };
          if (cell?.kind === "proportion") {
            if (
              cell.positive === null ||
              cell.eligible === null ||
              cell.eligible <= 0 ||
              cell.positive > cell.eligible
            )
              continue;
            observations.push({
              id: `observation.${observations.length + 1}.r${revisionIndex}`,
              unitInstanceId: unitId,
              measurement: {
                kind: "proportion",
                numerator: cell.positive,
                denominator: cell.eligible,
              },
              ...common,
            });
          }
          if (cell?.kind === "nested_continuous") {
            cell.rawValues.filter(Number.isFinite).forEach((value, valueIndex) => {
              const observationUnitId = `${unitId}.observation.${condition.id}.${readout.id}.${timePoint?.id ?? "none"}.${valueIndex + 1}`;
              unitInstances.push({
                id: observationUnitId,
                levelId: "unit-level.observation",
                parentUnitId: unitId,
                label: `${condition.label} · ${valueIndex + 1}`,
                metadata,
              });
              observations.push({
                id: `observation.${observations.length + 1}.r${revisionIndex}`,
                unitInstanceId: observationUnitId,
                measurement: { kind: "scalar", value },
                ...common,
                sourceLocation: cell.sourceLocations?.[valueIndex]
                  ? `workspace:${key}#source=${encodeURIComponent(cell.sourceLocations[valueIndex])}`
                  : common.sourceLocation,
              });
            });
          }
          if (cell?.kind === "categorical_counts") {
            const counts = Object.fromEntries(
              Object.entries(cell.counts).filter(
                (entry): entry is [string, number] =>
                  entry[1] !== null && Number.isFinite(entry[1]),
              ),
            );
            if (Object.keys(counts).length >= 2) {
              observations.push({
                id: `observation.${observations.length + 1}.r${revisionIndex}`,
                unitInstanceId: unitId,
                measurement: { kind: "categorical_counts", counts },
                ...common,
              });
            }
          }
          if (
            cell?.kind === "wb_ratio" &&
            wbCorrectedBandValue(cell, "target") !== null &&
            wbCorrectedBandValue(cell, "reference") !== null &&
            (wbCorrectedBandValue(cell, "reference") ?? 0) > 0
          ) {
            const correctedTarget = wbCorrectedBandValue(cell, "target") as number;
            const correctedReference = wbCorrectedBandValue(cell, "reference") as number;
            const targetSource = cell.targetSource;
            const referenceSource = cell.referenceSource;
            observations.push({
              id: `observation.${observations.length + 1}.r${revisionIndex}`,
              unitInstanceId: unitId,
              measurement: {
                kind: "loading_control_ratio",
                target: correctedTarget,
                loadingControl: correctedReference,
                transformationVersion: "0.1.0",
                ...((cell.inputMode ?? "corrected_value") === "imagej_mean_background_area" &&
                targetSource?.intensity != null &&
                targetSource.background != null &&
                targetSource.area != null &&
                referenceSource?.intensity != null &&
                referenceSource.background != null &&
                referenceSource.area != null
                  ? {
                      sourceMeasurements: {
                        method: "mean_intensity_minus_mean_background_times_area" as const,
                        version: "0.1.0" as const,
                        target: {
                          intensity: targetSource.intensity,
                          background: targetSource.background,
                          area: targetSource.area,
                        },
                        loadingControl: {
                          intensity: referenceSource.intensity,
                          background: referenceSource.background,
                          area: referenceSource.area,
                        },
                      },
                    }
                  : {}),
              },
              ...common,
            });
          }
        }
      }
    }
  }
  return { rawRevision, unitInstances, observations };
}

export function createWorkspaceRecommendation(
  request: AnalysisEngineRequest,
  design: ExperimentDesign,
): AnalysisRecommendation {
  const statisticalNDefinition = `Independent units at level ${design.experimentalUnitLevelId}`;
  if (request.templateId === "D01") {
    return {
      templateId: "D01",
      templateVersion: request.templateVersion,
      recommendedMethod: "welch_t",
      alternativeMethods: ["mann_whitney", "student_t"],
      reasonCode: "two_independent_condition_groups",
      explanation:
        "Two selected conditions were compared using separate experimental units without an explicit matched correspondence.",
      statisticalNDefinition,
    };
  }
  if (request.templateId === "D02") {
    return {
      templateId: "D02",
      templateVersion: request.templateVersion,
      recommendedMethod: "paired_t",
      alternativeMethods: ["wilcoxon_signed_rank"],
      reasonCode: "same_or_matched_unit_in_both_conditions",
      explanation:
        "Each explicitly matched experimental unit contributes one value to both selected conditions.",
      statisticalNDefinition: `Complete matched units at level ${design.experimentalUnitLevelId}`,
    };
  }
  if (request.templateId === "D03") {
    return {
      templateId: "D03",
      templateVersion: request.templateVersion,
      recommendedMethod: "welch_anova",
      alternativeMethods: ["one_way_anova", "kruskal_wallis"],
      reasonCode: "three_or_more_independent_groups_one_factor",
      explanation:
        "Three or more selected groups were compared with a variance-robust omnibus test and multiplicity-adjusted pairwise comparisons.",
      statisticalNDefinition,
      multiplicityMethod: "games_howell_all_pairs",
    };
  }
  if (request.templateId === "D04") {
    return {
      templateId: "D04",
      templateVersion: request.templateVersion,
      recommendedMethod: "repeated_measures_anova",
      alternativeMethods: ["friedman"],
      reasonCode: "three_or_more_complete_matched_groups",
      explanation:
        "Every explicitly matched experimental unit contributes one value to every selected condition; pairwise comparisons use Holm adjustment.",
      statisticalNDefinition: `Complete matched units at level ${design.experimentalUnitLevelId}`,
      multiplicityMethod: "holm_paired_all_pairs",
    };
  }
  if (request.templateId === "D05") {
    return {
      templateId: "D05",
      templateVersion: request.templateVersion,
      recommendedMethod: "two_way_anova",
      alternativeMethods: [],
      reasonCode: "complete_two_factor_independent_design",
      explanation:
        "All combinations of two factors use independent experimental units; interaction and main effects are evaluated before adjusted cell comparisons.",
      statisticalNDefinition: `${statisticalNDefinition} within each factorial cell`,
      multiplicityMethod: "holm_all_cell_pairs",
    };
  }
  if (request.templateId === "D06") {
    return {
      templateId: "D06",
      templateVersion: request.templateVersion,
      recommendedMethod: "mixed_anova",
      alternativeMethods: ["mixed_model"],
      reasonCode: "balanced_condition_by_time_repeated_design",
      explanation: repeatedFactorCanonicalExplanation(
        request.protocolVersion === "0.6.0" ? request.withinFactor : undefined,
      ),
      statisticalNDefinition: `Complete stable units at level ${design.experimentalUnitLevelId} within each condition`,
      multiplicityMethod: null,
    };
  }
  if (request.templateId === "D07") {
    return {
      templateId: "D07",
      templateVersion: request.templateVersion,
      recommendedMethod: "two_way_anova",
      alternativeMethods: [],
      reasonCode: "balanced_independent_condition_by_within_factor",
      explanation:
        "Every condition-by-factor cell uses separate biological units; interaction and main effects are evaluated with an independent factorial error model.",
      statisticalNDefinition: `${statisticalNDefinition} within each condition-by-factor cell`,
      multiplicityMethod: null,
    };
  }
  if (request.templateId === "D09") {
    return {
      templateId: "D09",
      templateVersion: request.templateVersion,
      recommendedMethod: request.method,
      alternativeMethods: [request.method === "pearson" ? "spearman" : "pearson"],
      reasonCode:
        request.method === "pearson"
          ? "two_complete_continuous_variables_linear_question"
          : "two_complete_variables_monotonic_or_ranked_question",
      explanation:
        request.method === "pearson"
          ? "The same experimental units provide complete X-Y pairs for a linear association question."
          : "The same experimental units provide complete X-Y pairs for a monotonic or rank-based association question.",
      statisticalNDefinition: `Complete X-Y pairs at level ${design.experimentalUnitLevelId}`,
      multiplicityMethod: null,
    };
  }
  throw new Error(`Workspace analysis ${request.templateId} is not supported for persistence`);
}

function prepareWorkspaceAnalyses(input: {
  draft: ExperimentSetDraft;
  graphs: readonly WorkspaceGraphState[];
  records: CanonicalWorkspaceRecords;
  design: ExperimentDesign;
  projectId: string;
  revisionIndex: number;
  now: string;
  actor: string;
}): PreparedWorkspaceAnalyses {
  const transformations: TransformationSpec[] = [];
  const derivedDatasetRevisions: DerivedDatasetRevision[] = [];
  const derivedValues: DerivedScalarValue[] = [];
  const analyses: PreparedAnalysis[] = [];

  input.graphs.forEach((graph) => {
    const executedAnalysis = graph.analysis?.result.status === "ok" ? graph.analysis : null;
    const timeAnalysis = graph.analysisMetric ?? { kind: "selected_timepoint" as const };
    const usesFullTimeCourse = timeAnalysis.kind === "full_time_course";
    const usesTimeMetric = timeAnalysis.kind !== "selected_timepoint" && !usesFullTimeCourse;
    const materializeDerivedGraphSource = graph.sourceMode === "derived_metric" && usesTimeMetric;
    if (!executedAnalysis && !materializeDerivedGraphSource) return;
    const selectedTimePointId =
      graph.analysisTimePointId ??
      (graph.selectedTimePointIds.length === 1 ? graph.selectedTimePointIds[0] : undefined);
    if (
      input.draft.time.points.length > 0 &&
      !selectedTimePointId &&
      !usesTimeMetric &&
      !usesFullTimeCourse
    )
      return;
    const analysisTimePoints = usesFullTimeCourse
      ? input.draft.time.points
      : usesTimeMetric
        ? input.draft.time.points.filter(
            ({ value }) =>
              (timeAnalysis.windowStart === undefined || value >= timeAnalysis.windowStart) &&
              (timeAnalysis.windowEnd === undefined || value <= timeAnalysis.windowEnd),
          )
        : input.draft.time.points.filter(({ id }) => id === selectedTimePointId);
    const sourceKeys = new Set(
      input.draft.experiments.flatMap((experiment) =>
        graph.selectedConditionIds.flatMap((conditionId) =>
          analysisTimePoints.length > 0
            ? analysisTimePoints.map((timePoint) =>
                experimentCellKey({
                  experimentId: experiment.id,
                  conditionId,
                  readoutId: graph.selectedReadoutId,
                  timePointId: timePoint.id,
                }),
              )
            : [
                experimentCellKey({
                  experimentId: experiment.id,
                  conditionId,
                  readoutId: graph.selectedReadoutId,
                }),
              ],
        ),
      ),
    );
    const unitById = new Map(input.records.unitInstances.map((unit) => [unit.id, unit]));
    const sourceExperimentId = (unitId: string) => {
      let unit = unitById.get(unitId);
      const visited = new Set<string>();
      while (unit && !visited.has(unit.id)) {
        visited.add(unit.id);
        const experimentSessionId = unit.metadata.experimentSessionId;
        if (typeof experimentSessionId === "string") return experimentSessionId;
        unit = unit.parentUnitId ? unitById.get(unit.parentUnitId) : undefined;
      }
      return undefined;
    };
    const unitAtLevel = (unitId: string, levelId: string) => {
      let unit = unitById.get(unitId);
      const visited = new Set<string>();
      while (unit && !visited.has(unit.id)) {
        visited.add(unit.id);
        if (unit.levelId === levelId) return unit.id;
        unit = unit.parentUnitId ? unitById.get(unit.parentUnitId) : undefined;
      }
      return undefined;
    };
    const experimentalUnitIdFor = (unitId: string) => {
      const experimentalUnitId = unitAtLevel(unitId, input.design.experimentalUnitLevelId);
      if (!experimentalUnitId) {
        throw new Error(
          `EXPERIMENTAL_UNIT_ANCESTOR_NOT_FOUND:${unitId}:${input.design.experimentalUnitLevelId}`,
        );
      }
      return experimentalUnitId;
    };
    const matchedPairIdFor = (experimentalUnitId: string) => {
      if (input.design.pairing.kind !== "matched") return undefined;
      const pairId = unitAtLevel(experimentalUnitId, input.design.pairing.matchLevelId);
      if (!pairId) {
        throw new Error(
          `MATCH_LEVEL_ANCESTOR_NOT_FOUND:${experimentalUnitId}:${input.design.pairing.matchLevelId}`,
        );
      }
      return pairId;
    };
    const selectedExperimentIds = new Set(input.draft.experiments.map(({ id }) => id));
    const selectedTimes = new Set(analysisTimePoints.map(({ value }) => value));
    const selectedRaw = input.records.observations.filter(
      (observation) =>
        observation.outcomeId === graph.selectedReadoutId &&
        observation.sourceLocation !== undefined &&
        (sourceKeys.has(observation.sourceLocation.replace(/^workspace:/, "")) ||
          (observation.sourceLocation.startsWith("adaptive:") &&
            graph.selectedConditionIds.includes(observation.conditionId) &&
            selectedExperimentIds.has(sourceExperimentId(observation.unitInstanceId) ?? "") &&
            (analysisTimePoints.length === 0 ||
              (observation.time !== undefined && selectedTimes.has(observation.time))))),
    );
    if (selectedRaw.length === 0) return;

    const readout = input.draft.readouts.find(({ id }) => id === graph.selectedReadoutId);
    let analysisObservations: Array<{
      observationId: string;
      conditionId: string;
      value: number;
      experimentalUnitId: string;
      pairId?: string;
      timePointId?: string;
      withinFactorLevelId?: string;
    }>;
    let derivedDatasetRevisionId: string | null = null;
    if (usesFullTimeCourse) {
      derivedDatasetRevisionId = `derived.workspace.${graph.id}.longitudinal.r${input.revisionIndex}`;
      const transformationId = `transformation.workspace.${graph.id}.longitudinal.r${input.revisionIndex}`;
      const grouped = new Map<
        string,
        {
          observations: Observation[];
          experimentalUnitId: string;
          conditionId: string;
          time: number;
        }
      >();
      selectedRaw.forEach((observation) => {
        if (observation.time === undefined) return;
        const experimentalUnitId = experimentalUnitIdFor(observation.unitInstanceId);
        const key = `${experimentalUnitId}\u0000${observation.conditionId}\u0000${observation.time}`;
        const current = grouped.get(key);
        grouped.set(key, {
          observations: [...(current?.observations ?? []), observation],
          experimentalUnitId,
          conditionId: observation.conditionId,
          time: observation.time,
        });
      });
      const longitudinalValues: DerivedScalarValue[] = [...grouped.values()].map((group, index) => {
        const numeric = group.observations.map((observation) =>
          measurementNumericValue(observation.measurement),
        );
        const timePoint = input.draft.time.points.find(({ value }) => value === group.time);
        if (!timePoint) throw new Error("Full-course source does not match a declared axis point");
        const statisticalUnitId =
          executedAnalysis?.request.protocolVersion === "0.7.0"
            ? `${group.experimentalUnitId}.${group.conditionId}.${timePoint.id}`
            : group.experimentalUnitId;
        return {
          id: `derived-value.workspace.${graph.id}.longitudinal.${index + 1}.r${input.revisionIndex}`,
          derivedDatasetRevisionId: derivedDatasetRevisionId!,
          experimentalUnitId: statisticalUnitId,
          conditionId: group.conditionId,
          outcomeId: graph.selectedReadoutId,
          value: numeric.reduce((sum, value) => sum + value, 0) / numeric.length,
          sourceObservationIds: group.observations.map(({ id }) => id),
          sourceUnitIds: group.observations.map(({ unitInstanceId }) => unitInstanceId),
          subsampleCount: group.observations.length,
        };
      });
      transformations.push({
        id: transformationId,
        version: "0.1.0",
        method: "replicate_summary",
        inputRevisionIds: [input.records.rawRevision.id],
        parameters: {
          center: "mean",
          grouping: ["experimentalUnitId", "conditionId", "time"],
          stableUnitIdentity: "preserved",
        },
      });
      derivedDatasetRevisions.push({
        id: derivedDatasetRevisionId,
        previousRevisionId: null,
        sourceRawRevisionId: input.records.rawRevision.id,
        sourceQcRevisionId: null,
        outcomeId: graph.selectedReadoutId,
        transformationId,
        createdAt: input.now,
        createdBy: input.actor,
        state: "current",
        staleReason: null,
      });
      derivedValues.push(...longitudinalValues);
      analysisObservations = [...grouped.values()].map((group, index) => {
        const value = longitudinalValues[index];
        const timePoint = input.draft.time.points.find(({ value: time }) => time === group.time);
        if (!value || !timePoint)
          throw new Error("Longitudinal analysis source does not match a declared axis point");
        return {
          observationId: value.id,
          conditionId: value.conditionId,
          value: value.value,
          ...(executedAnalysis?.request.protocolVersion === "0.7.0"
            ? {
                experimentalUnitId: value.experimentalUnitId,
                withinFactorLevelId: timePoint.id,
              }
            : {
                experimentalUnitId: value.experimentalUnitId,
                pairId: value.experimentalUnitId,
                timePointId: timePoint.id,
              }),
        };
      });
    } else if (usesTimeMetric) {
      derivedDatasetRevisionId = `derived.workspace.${graph.id}.r${input.revisionIndex}`;
      const grouped = new Map<string, Observation[]>();
      selectedRaw.forEach((observation) => {
        if (observation.time === undefined) return;
        const experimentalUnitId = experimentalUnitIdFor(observation.unitInstanceId);
        const key = `${experimentalUnitId}\u0000${observation.conditionId}\u0000${observation.time}`;
        grouped.set(key, [...(grouped.get(key) ?? []), observation]);
      });
      const scalarInputs: TimeSeriesScalarInput[] = [...grouped.entries()].flatMap(
        ([key, observations], groupIndex) => {
          const [experimentalUnitId, conditionId, timeText] = key.split("\u0000");
          const numeric = observations.flatMap((observation) => {
            try {
              return [measurementNumericValue(observation.measurement)];
            } catch {
              return [];
            }
          });
          if (numeric.length === 0) return [];
          return [
            {
              id: `time-input.${graph.id}.${groupIndex + 1}`,
              experimentalUnitId,
              conditionId,
              outcomeId: graph.selectedReadoutId,
              time: Number(timeText),
              value: numeric.reduce((sum, value) => sum + value, 0) / numeric.length,
              sourceObservationIds: observations.map(({ id }) => id),
              sourceUnitIds: observations.map(({ unitInstanceId }) => unitInstanceId),
            },
          ];
        },
      );
      const derived = createTimeSeriesMetricDerivedDataset({
        derivedDatasetRevisionId,
        rawRevisionId: input.records.rawRevision.id,
        outcomeId: graph.selectedReadoutId,
        values: scalarInputs,
        parameters: {
          metric: timeAnalysis.kind as TimeSeriesMetric,
          ...(timeAnalysis.windowStart === undefined
            ? {}
            : { windowStart: timeAnalysis.windowStart }),
          ...(timeAnalysis.windowEnd === undefined ? {} : { windowEnd: timeAnalysis.windowEnd }),
          ...(timeAnalysis.baselineTime === undefined
            ? {}
            : { baselineTime: timeAnalysis.baselineTime }),
        },
        createdAt: input.now,
        createdBy: input.actor,
      });
      transformations.push(derived.transformation);
      derivedDatasetRevisions.push(derived.revision);
      derivedValues.push(...derived.values);
      analysisObservations = derived.values.map((value) => ({
        observationId: value.id,
        conditionId: value.conditionId,
        value: value.value,
        experimentalUnitId: value.experimentalUnitId,
        ...(input.design.pairing.kind === "matched"
          ? { pairId: matchedPairIdFor(value.experimentalUnitId) }
          : {}),
      }));
    } else if (readout?.shape === "nested_continuous") {
      derivedDatasetRevisionId = `derived.workspace.${graph.id}.r${input.revisionIndex}`;
      const derived = createNestedScalarDerivedDataset({
        derivedDatasetRevisionId,
        rawRevisionId: input.records.rawRevision.id,
        outcomeId: graph.selectedReadoutId,
        experimentalUnitLevelId: input.design.experimentalUnitLevelId,
        method: "mean",
        observations: selectedRaw,
        unitInstances: input.records.unitInstances,
        createdAt: input.now,
        createdBy: input.actor,
      });
      transformations.push(derived.transformation);
      derivedDatasetRevisions.push(derived.revision);
      derivedValues.push(...derived.values);
      analysisObservations = derived.values.map((value) => ({
        observationId: value.id,
        conditionId: value.conditionId,
        value: value.value,
        experimentalUnitId: value.experimentalUnitId,
        ...(input.design.pairing.kind === "matched"
          ? { pairId: matchedPairIdFor(value.experimentalUnitId) }
          : {}),
      }));
    } else {
      analysisObservations = selectedRaw.map((observation) => ({
        observationId: observation.id,
        conditionId: observation.conditionId,
        value: measurementNumericValue(observation.measurement),
        experimentalUnitId: experimentalUnitIdFor(observation.unitInstanceId),
        ...(input.design.pairing.kind === "matched"
          ? { pairId: matchedPairIdFor(experimentalUnitIdFor(observation.unitInstanceId)) }
          : {}),
      }));
    }

    if (!executedAnalysis) return;

    if (readout?.withinExperimentNormalization) {
      const sourceDatasetId = derivedDatasetRevisionId ?? input.records.rawRevision.id;
      const normalizationId = `transformation.workspace.${graph.id}.within-experiment.r${input.revisionIndex}`;
      const normalizedRevisionId = `derived.workspace.${graph.id}.within-experiment.r${input.revisionIndex}`;
      const byExperimentSession = new Map<string, typeof analysisObservations>();
      analysisObservations.forEach((observation) => {
        const unit = input.records.unitInstances.find(
          ({ id }) => id === observation.experimentalUnitId,
        );
        const sessionId =
          typeof unit?.metadata.experimentSessionId === "string"
            ? unit.metadata.experimentSessionId
            : observation.experimentalUnitId;
        byExperimentSession.set(sessionId, [
          ...(byExperimentSession.get(sessionId) ?? []),
          observation,
        ]);
      });
      const normalizedValues: DerivedScalarValue[] = [];
      analysisObservations = [...byExperimentSession.values()].flatMap((unitObservations) => {
        const valuesByCondition = Object.fromEntries(
          unitObservations.map(({ conditionId, value }) => [conditionId, value]),
        );
        return unitObservations.flatMap((observation) => {
          const value = normalizeWithinExperiment(
            observation.value,
            valuesByCondition,
            observation.conditionId,
            readout,
          );
          if (value === null) return [];
          normalizedValues.push({
            id: `derived-value.workspace.${graph.id}.within-experiment.${normalizedValues.length + 1}`,
            derivedDatasetRevisionId: normalizedRevisionId,
            experimentalUnitId: observation.experimentalUnitId,
            conditionId: observation.conditionId,
            outcomeId: graph.selectedReadoutId,
            value,
            sourceObservationIds: [observation.observationId],
            sourceUnitIds: [observation.experimentalUnitId],
            subsampleCount: 1,
          });
          return [{ ...observation, observationId: normalizedValues.at(-1)!.id, value }];
        });
      });
      transformations.push({
        id: normalizationId,
        version: "0.1.0",
        method: readout.withinExperimentNormalization.method,
        inputRevisionIds: [sourceDatasetId],
        parameters: {
          scope: "within_experiment",
          method: readout.withinExperimentNormalization.method,
          ...(readout.withinExperimentNormalization.baselineConditionId
            ? { baselineConditionId: readout.withinExperimentNormalization.baselineConditionId }
            : {}),
        },
      });
      derivedDatasetRevisions.push({
        id: normalizedRevisionId,
        previousRevisionId: null,
        sourceRawRevisionId: input.records.rawRevision.id,
        sourceQcRevisionId: null,
        outcomeId: graph.selectedReadoutId,
        transformationId: normalizationId,
        createdAt: input.now,
        createdBy: input.actor,
        state: "current",
        staleReason: null,
      });
      derivedValues.push(...normalizedValues);
      derivedDatasetRevisionId = normalizedRevisionId;
    }

    const requestId = `request.workspace.${graph.id}.r${input.revisionIndex}`;
    const request = AnalysisEngineRequestSchema.parse({
      ...executedAnalysis.request,
      requestId,
      projectId: input.projectId,
      analysisId: `analysis.workspace.${graph.id}.r${input.revisionIndex}`,
      observations: analysisObservations,
    });
    const result = AnalysisEngineResultSchema.parse({
      ...executedAnalysis.result,
      requestId,
    });
    const variableConditionIds =
      request.protocolVersion === "0.5.0" ? request.variableConditionIds : null;
    const interval = graph.appearance.errorBar;
    const xFactorIds =
      graph.grouping?.x.source === "factor"
        ? (graph.grouping.x.factorIds ??
          (graph.grouping.x.factorId ? [graph.grouping.x.factorId] : []))
        : [];
    const visualMapping = (
      channel:
        | NonNullable<WorkspaceGraphState["grouping"]>["series"]
        | NonNullable<NonNullable<WorkspaceGraphState["grouping"]>["color"]>
        | NonNullable<NonNullable<WorkspaceGraphState["grouping"]>["shape"]>
        | undefined,
    ) =>
      channel?.source === "factor"
        ? channel.factorId
        : channel?.source === "time"
          ? "time"
          : undefined;
    const seriesMapping = visualMapping(graph.grouping?.series);
    const colorMapping = visualMapping(graph.grouping?.color) ?? seriesMapping ?? "conditionId";
    const shapeMapping = visualMapping(graph.grouping?.shape) ?? seriesMapping;
    const facetMapping = graph.grouping?.facet?.factorId;
    const graphSpec = GraphSpecSchema.parse({
      id: `${graph.id}.r${input.revisionIndex}`,
      version: "0.1.0",
      type:
        request.templateId === "D09"
          ? "scatter"
          : readout?.shape === "nested_continuous"
            ? "raw_and_replicate_summary"
            : request.templateId === "D01"
              ? "dot_summary"
              : request.templateId === "D02"
                ? "paired_dot"
                : "grouped_dot",
      dataSource: derivedDatasetRevisionId
        ? { kind: "derived_dataset", id: derivedDatasetRevisionId, revision: "0.1.0" }
        : { kind: "raw_revision", id: input.records.rawRevision.id, revision: "0.1.0" },
      analysisResultId: requestId,
      dataSets: graph.dataSets ?? {
        displaySet: {
          conditionIds: graph.selectedConditionIds,
          timePointIds: graph.selectedTimePointIds,
        },
        analysisSet: {
          conditionIds: graph.analysisConditionIds ?? graph.selectedConditionIds,
          timePointIds: graph.analysisTimePointId ? [graph.analysisTimePointId] : [],
        },
        comparisonSet: [
          ...(request.protocolVersion === "0.2.0"
            ? (request.plannedContrastConditionIds ?? []).map((conditionIds, index) => ({
                id: `planned.${index + 1}`,
                conditionIds,
              }))
            : []),
          ...(graph.statisticsAnnotations ?? []).flatMap((annotation) =>
            annotation.endpoints
              ? [
                  {
                    id: annotation.comparisonId ?? annotation.id,
                    conditionIds: [
                      annotation.endpoints[0].conditionId,
                      annotation.endpoints[1].conditionId,
                    ] as [string, string],
                  },
                ]
              : [],
          ),
        ],
        annotationSet: (graph.statisticsAnnotations ?? []).flatMap((annotation) =>
          annotation.endpoints ? [{ comparisonId: annotation.comparisonId ?? annotation.id }] : [],
        ),
      },
      mappings: {
        x: variableConditionIds?.[0] ?? xFactorIds[0] ?? "conditionId",
        xHierarchy: xFactorIds,
        y: "value",
        ...(request.templateId === "D09"
          ? {}
          : {
              ...(seriesMapping ? { series: seriesMapping } : {}),
              color: colorMapping,
              ...(shapeMapping ? { shape: shapeMapping } : {}),
              ...(facetMapping ? { facet: facetMapping } : {}),
            }),
        ...(request.templateId === "D02" || request.templateId === "D09"
          ? {
              pair:
                input.design.pairing.kind === "matched" &&
                input.design.pairing.matchLevelId !== input.design.experimentalUnitLevelId
                  ? "pairId"
                  : "experimentalUnitId",
            }
          : {}),
      },
      summary:
        request.templateId === "D09"
          ? { center: "none", interval: "none" }
          : { center: "mean", interval },
      appearance: {
        palette:
          graph.appearance.palette === "condition"
            ? ["#245c8a", "#c26532", "#3e7c67", "#735a8d", "#9a7628", "#467681"]
            : ["#245c8a"],
        pointSize: graph.appearance.pointSize,
        opacity: 0.9,
        showRawPoints: true,
        showPairedLines: request.templateId === "D02",
        barOutline: graph.appearance.barOutline ?? true,
        barMeanMarker: graph.appearance.barMeanMarker ?? false,
        boxWhiskerMode: graph.appearance.boxWhiskerMode ?? "tukey_1_5_iqr",
        uncertaintyStyle: graph.appearance.uncertaintyStyle ?? "error_bars",
        ribbonOpacity: graph.appearance.ribbonOpacity ?? 0.18,
        seriesStyles: graph.appearance.seriesStyles,
      },
      axes: {
        yStartAtZero: readout?.shape === "proportion",
        yScale: "linear",
        xLabel:
          request.templateId === "D09"
            ? (input.draft.conditions.find(({ id }) => id === variableConditionIds?.[0])?.label ??
              "X")
            : graph.axes.xTitle.trim() ||
              input.draft.attributes.find(({ id }) => id === xFactorIds[0])?.label ||
              "Condition",
        yLabel:
          request.templateId === "D09"
            ? (input.draft.conditions.find(({ id }) => id === variableConditionIds?.[1])?.label ??
              "Y")
            : (readout?.label ?? "Value"),
        showMinorTicks: graph.axes.showMinorTicks ?? true,
        tickDirection: graph.axes.tickDirection,
        showCategoryGroupSeparators: graph.axes.showCategoryGroupSeparators,
      },
      ...(graph.grouping?.facet
        ? {
            facet: {
              factorId: graph.grouping.facet.factorId,
              levelOrder: graph.grouping.facet.levelOrder,
              axisPolicy: graph.grouping.facet.axisPolicy,
            },
          }
        : {}),
    });
    analyses.push({
      graphId: graph.id,
      request,
      result,
      recommendation: graph.analysis?.recommendation ?? {
        ...createWorkspaceRecommendation(request, input.design),
        ...(graph.analysis?.recommendedMethod
          ? { recommendedMethod: graph.analysis.recommendedMethod }
          : {}),
      },
      graphSpec,
      derivedDatasetRevisionId,
    });
  });

  return { transformations, derivedDatasetRevisions, derivedValues, analyses };
}

export function createExperimentWorkspaceProject(input: {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  graphs: readonly WorkspaceGraphState[];
  dataViewMode?: "compact" | "expanded";
  existingState?: ProjectState;
  now?: string;
}): ProjectState {
  const now = input.now ?? new Date().toISOString();
  const draft = synchronizeAdaptiveDraft({ draft: input.draft, cells: input.cells, now });
  if (hasSharedSourceConditionUnits(draft) && !draft.adaptiveInput) {
    throw new Error("SHARED_SOURCE_REQUIRES_ADAPTIVE_CONTRACT_PROJECTION");
  }
  const actor = "local-user";
  const plannedN = plannedExperimentalUnitCount(draft);
  const adaptiveDesign = draft.adaptiveInput
    ? projectContractToExperimentDesign(draft.adaptiveInput.contract, plannedN, now)
    : null;
  if (adaptiveDesign && draft.adaptiveInput) {
    assertDualWriteEquivalence(draft.adaptiveInput.contract, adaptiveDesign, now);
  }
  const design =
    adaptiveDesign ??
    (input.existingState
      ? (input.existingState.designRevisions.find(
          (revision) => revision.id === input.existingState?.activeDesignRevisionId,
        )?.design ?? createExperimentWorkspaceDesign(draft, now))
      : createExperimentWorkspaceDesign(draft, now));
  const currentDesign = input.existingState?.designRevisions.find(
    (revision) => revision.id === input.existingState?.activeDesignRevisionId,
  )?.design;
  const designChanged = Boolean(
    input.existingState &&
    adaptiveDesign &&
    semanticFingerprint(designSemanticPayload(currentDesign)) !==
      semanticFingerprint(designSemanticPayload(adaptiveDesign)),
  );
  const persistedAdaptive =
    input.existingState?.adaptiveInput ?? input.existingState?.experimentWorkspace?.adaptiveInput;
  const rawChanged = input.existingState
    ? draft.adaptiveInput && persistedAdaptive
      ? semanticFingerprint(adaptiveRawPayload(draft.adaptiveInput)) !==
        semanticFingerprint(adaptiveRawPayload(persistedAdaptive))
      : true
    : true;
  const rawRevisionIndex = input.existingState
    ? input.existingState.rawRevisions.length + (rawChanged ? 1 : 0)
    : 1;
  const artifactRevisionIndex =
    input.existingState && !rawChanged
      ? nextWorkspaceArtifactRevisionIndex(input.existingState)
      : rawRevisionIndex;
  const rawRevision: RawDatasetRevision = rawChanged
    ? {
        id: `raw.workspace.${rawRevisionIndex}`,
        previousRevisionId: input.existingState?.activeRawRevisionId ?? null,
        sourceKind: input.existingState ? "project_edit" : "manual",
        createdAt: now,
        createdBy: actor,
        note: "Experiment workspace data",
      }
    : activeCanonicalRecords(input.existingState!).rawRevision;
  const records = rawChanged
    ? createCanonicalRecords(draft, input.cells, rawRevision, rawRevisionIndex)
    : activeCanonicalRecords(input.existingState!);
  const projectId =
    input.existingState?.metadata.projectId ?? `project.workspace.${Date.parse(now)}`;
  const analysesToPersist = pendingAnalysisGraphs(
    input.graphs,
    input.existingState,
    rawChanged || designChanged,
  );
  const prepared = prepareWorkspaceAnalyses({
    draft,
    graphs: analysesToPersist,
    records,
    design,
    projectId,
    revisionIndex: artifactRevisionIndex,
    now,
    actor,
  });
  let state: ProjectState;
  if (input.existingState) {
    const startingState = designChanged
      ? appendDesignRevision(input.existingState, adaptiveDesign!, actor, now, {
          adaptiveInput: draft.adaptiveInput ?? null,
          experimentWorkspace: createWorkspaceSnapshot(
            draft,
            input.cells,
            input.graphs,
            input.dataViewMode ??
              input.existingState.experimentWorkspace?.dataViewMode ??
              "compact",
          ),
        })
      : input.existingState;
    if (rawChanged) {
      state = appendRawRevision(
        startingState,
        records.rawRevision,
        records.unitInstances,
        records.observations,
        actor,
        prepared.transformations,
        prepared.derivedDatasetRevisions,
        prepared.derivedValues,
      );
    } else {
      state = appendDerivedDatasetArtifacts(startingState, {
        transformations: prepared.transformations,
        derivedDatasetRevisions: prepared.derivedDatasetRevisions,
        derivedValues: prepared.derivedValues,
        actor,
        occurredAt: now,
      });
    }
    state = ProjectStateSchema.parse({
      ...state,
      metadata: {
        ...state.metadata,
        projectName: draft.name,
        updatedAt: now,
        experimentDate:
          draft.experiments.find((experiment) => experiment.date)?.date ??
          state.metadata.experimentDate,
      },
    });
  } else {
    const firstDate = draft.experiments.find((experiment) => experiment.date)?.date;
    state = createInitialProjectState({
      metadata: {
        projectId,
        projectName: draft.name,
        experimentDate: firstDate ?? "",
        createdAt: now,
        updatedAt: now,
      },
      design,
      rawRevision: records.rawRevision,
      unitInstances: records.unitInstances,
      observations: records.observations,
      transformations: prepared.transformations,
      derivedDatasetRevisions: prepared.derivedDatasetRevisions,
      derivedValues: prepared.derivedValues,
      actor,
    });
  }

  prepared.analyses.forEach((analysis) => {
    state = appendAnalysisExecution(
      state,
      {
        recommendation: analysis.recommendation,
        request: analysis.request,
        result: analysis.result,
        graphSpec: analysis.graphSpec,
        inputDerivedDatasetRevisionId: analysis.derivedDatasetRevisionId,
      },
      actor,
    );
  });
  const graphRunIds = new Map(
    prepared.analyses.map((analysis) => [
      analysis.graphId,
      `analysis-run.${analysis.request.requestId}`,
    ]),
  );
  const previousGraphRunIds = new Map(
    (input.existingState?.experimentWorkspace?.graphs ?? []).map((graph) => [
      graph.id,
      graph.analysisRunId,
    ]),
  );
  const linkedGraphs = input.graphs.map((graph) => ({
    ...graph,
    analysisRunId:
      graphRunIds.get(graph.id) ??
      (graph.analysis ? (previousGraphRunIds.get(graph.id) ?? null) : null),
  }));
  return ProjectStateSchema.parse({
    ...state,
    experimentWorkspace: createWorkspaceSnapshot(
      draft,
      input.cells,
      linkedGraphs,
      input.dataViewMode ?? "compact",
    ),
    adaptiveInput: draft.adaptiveInput ?? null,
  });
}

export function rehydrateExperimentWorkspace(state: ProjectState): {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  graphs: WorkspaceGraphState[];
  dataViewMode: "compact" | "expanded";
} | null {
  const workspace = state.experimentWorkspace;
  if (!workspace) return null;
  const design = state.designRevisions.find(
    (revision) => revision.id === state.activeDesignRevisionId,
  )?.design;
  if (!design) return null;
  const draft: ExperimentSetDraft = {
    version: "0.1.0",
    dataOrigin: workspace.dataOrigin,
    context: workspace.context,
    entryRoute: workspace.entryRoute,
    name: state.metadata.projectName,
    readouts:
      workspace.readoutDefinitions.length > 0
        ? workspace.readoutDefinitions
        : design.outcomes.map((outcome) => ({
            id: outcome.id,
            label: outcome.label,
            shape: outcome.type === "proportion_counts" ? "proportion" : "nested_continuous",
            ...(outcome.unit ? { unit: outcome.unit } : {}),
          })),
    attributes: workspace.conditionAttributes,
    conditions: workspace.conditions,
    controlConditionId: workspace.controlConditionId,
    comparisons: workspace.comparisons,
    analysisIntent: workspace.analysisIntent,
    conditionAssignment: workspace.conditionAssignment,
    time: workspace.timePlan,
    experiments: workspace.experimentSessions,
    importProvenance: workspace.importProvenance,
    entrySourceHistory: workspace.entrySourceHistory ?? undefined,
    adaptiveInput: workspace.adaptiveInput ?? undefined,
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  const unitsById = new Map(state.unitInstances.map((unit) => [unit.id, unit]));
  const experimentalUnitFor = (unitId: string) => {
    let unit = unitsById.get(unitId);
    const visited = new Set<string>();
    while (
      unit &&
      unit.levelId !== design.experimentalUnitLevelId &&
      unit.parentUnitId &&
      !visited.has(unit.id)
    ) {
      visited.add(unit.id);
      unit = unitsById.get(unit.parentUnitId);
    }
    return unit?.levelId === design.experimentalUnitLevelId ? unit : undefined;
  };
  const activeObservations = state.observations.filter(
    (observation) => observation.rawRevisionId === state.activeRawRevisionId,
  );
  const unitOrderByCondition = new Map<string, string[]>();
  activeObservations.forEach((observation) => {
    const experimentalUnitId = experimentalUnitFor(observation.unitInstanceId)?.id;
    if (!experimentalUnitId) return;
    const order = unitOrderByCondition.get(observation.conditionId) ?? [];
    if (!order.includes(experimentalUnitId)) order.push(experimentalUnitId);
    unitOrderByCondition.set(observation.conditionId, order);
  });
  const resolveExperimentId = (observation: Observation) => {
    const experimentalUnit = experimentalUnitFor(observation.unitInstanceId);
    const stored = experimentalUnit?.metadata.experimentSessionId;
    if (typeof stored === "string") return stored;
    if (!experimentalUnit) return undefined;
    if (draft.conditionAssignment.kind === "matched") {
      const semanticIdentity =
        typeof experimentalUnit.metadata.semanticIdentity === "string"
          ? experimentalUnit.metadata.semanticIdentity
          : experimentalUnit.label;
      return draft.experiments.find(
        ({ stableUnitId, label }) =>
          stableUnitId === semanticIdentity || label === semanticIdentity,
      )?.id;
    }
    const legacyIndex =
      unitOrderByCondition.get(observation.conditionId)?.indexOf(experimentalUnit.id) ?? -1;
    return legacyIndex >= 0 ? draft.experiments[legacyIndex]?.id : undefined;
  };
  activeObservations.forEach((observation) => {
    const experimentId = resolveExperimentId(observation);
    if (!experimentId) return;
    const timePoint = draft.time.points.find((point) => point.value === observation.time);
    const persistedKey = observation.sourceLocation?.startsWith("workspace:")
      ? observation.sourceLocation.slice("workspace:".length).split("#source=")[0]
      : null;
    const key =
      persistedKey ??
      experimentCellKey({
        experimentId,
        conditionId: observation.conditionId,
        readoutId: observation.outcomeId,
        timePointId: timePoint?.id,
      });
    if (observation.measurement.kind === "proportion") {
      cells[key] = {
        kind: "proportion",
        positive: observation.measurement.numerator,
        eligible: observation.measurement.denominator,
      };
    }
    if (observation.measurement.kind === "scalar") {
      const existing = cells[key];
      const encodedSource = observation.sourceLocation?.split("#source=")[1];
      cells[key] = {
        kind: "nested_continuous",
        source: "paste",
        rawValues: [
          ...(existing?.kind === "nested_continuous" ? existing.rawValues : []),
          observation.measurement.value,
        ],
        sourceLocations: [
          ...(existing?.kind === "nested_continuous" ? (existing.sourceLocations ?? []) : []),
          ...(encodedSource ? [decodeURIComponent(encodedSource)] : []),
        ],
      };
    }
    if (observation.measurement.kind === "categorical_counts") {
      cells[key] = {
        kind: "categorical_counts",
        counts: observation.measurement.counts,
      };
    }
    if (observation.measurement.kind === "loading_control_ratio") {
      const source = observation.measurement.sourceMeasurements;
      cells[key] = {
        kind: "wb_ratio",
        target: source ? null : observation.measurement.target,
        reference: source ? null : observation.measurement.loadingControl,
        ...(source
          ? {
              inputMode: "imagej_mean_background_area" as const,
              targetSource: source.target,
              referenceSource: source.loadingControl,
            }
          : {}),
      };
    }
  });
  workspace.notPlannedCellKeys.forEach((key) => {
    const readoutId = key.split("::").at(-1);
    const readout = draft.readouts.find(({ id }) => id === readoutId);
    cells[key] =
      readout?.shape === "nested_continuous"
        ? {
            kind: "nested_continuous",
            source: "manual",
            rawValues: [],
            availability: "not_planned",
          }
        : readout?.shape === "wb_ratio"
          ? {
              kind: "wb_ratio",
              target: null,
              reference: null,
              availability: "not_planned",
            }
          : readout?.shape === "categorical_counts"
            ? {
                kind: "categorical_counts",
                counts: Object.fromEntries((readout.categories ?? []).map(({ id }) => [id, null])),
                availability: "not_planned",
              }
            : {
                kind: "proportion",
                positive: null,
                eligible: null,
                availability: "not_planned",
              };
  });
  const graphs: WorkspaceGraphState[] = workspace.graphs.map((graph) => {
    const analysis = graph.analysisRunId
      ? state.analysisRuns.find((run) => run.id === graph.analysisRunId)
      : undefined;
    return {
      ...graph,
      ...(analysis
        ? {
            analysis: {
              request: analysis.request,
              result: analysis.result,
              recommendedMethod: analysis.recommendation.recommendedMethod,
              recommendation: analysis.recommendation,
            },
          }
        : { analysis: null }),
    };
  });
  return { draft, cells, graphs, dataViewMode: workspace.dataViewMode };
}
