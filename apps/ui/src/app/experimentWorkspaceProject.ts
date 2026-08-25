import {
  appendAnalysisExecution,
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
  normalizeWithinExperiment,
  orderedAxisSemantic,
  orderedAxisTitle,
  orderedAxisUnit,
  wbCorrectedBandValue,
  type ExperimentCellMap,
  type ExperimentSetDraft,
} from "./experimentDraft";
import { repeatedFactorCanonicalExplanation } from "./repeatedFactorTerminology";

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
    plannedN: draft.experiments.length,
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
    const selectedRaw = input.records.observations.filter(
      (observation) =>
        observation.outcomeId === graph.selectedReadoutId &&
        observation.sourceLocation !== undefined &&
        sourceKeys.has(observation.sourceLocation.replace(/^workspace:/, "")),
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
        const unit = input.records.unitInstances.find(
          ({ id }) => id === observation.unitInstanceId,
        );
        const experimentalUnitId = unit?.parentUnitId ?? observation.unitInstanceId;
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
        const unit = input.records.unitInstances.find(
          ({ id }) => id === observation.unitInstanceId,
        );
        const experimentalUnitId = unit?.parentUnitId ?? observation.unitInstanceId;
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
        ...(input.design.pairing.kind === "matched" ? { pairId: value.experimentalUnitId } : {}),
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
        ...(input.design.pairing.kind === "matched" ? { pairId: value.experimentalUnitId } : {}),
      }));
    } else {
      analysisObservations = selectedRaw.map((observation) => ({
        observationId: observation.id,
        conditionId: observation.conditionId,
        value: measurementNumericValue(observation.measurement),
        experimentalUnitId: observation.unitInstanceId,
        ...(input.design.pairing.kind === "matched" ? { pairId: observation.unitInstanceId } : {}),
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
        x: variableConditionIds?.[0] ?? "conditionId",
        xHierarchy:
          graph.grouping?.x.source === "factor"
            ? (graph.grouping.x.factorIds ??
              (graph.grouping.x.factorId ? [graph.grouping.x.factorId] : []))
            : [],
        y: "value",
        ...(request.templateId === "D09" ? {} : { color: "conditionId" }),
        ...(request.templateId === "D02" || request.templateId === "D09"
          ? { pair: "experimentalUnitId" }
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
      },
      axes: {
        yStartAtZero: readout?.shape === "proportion",
        yScale: "linear",
        xLabel:
          request.templateId === "D09"
            ? (input.draft.conditions.find(({ id }) => id === variableConditionIds?.[0])?.label ??
              "X")
            : "Condition",
        yLabel:
          request.templateId === "D09"
            ? (input.draft.conditions.find(({ id }) => id === variableConditionIds?.[1])?.label ??
              "Y")
            : (readout?.label ?? "Value"),
        showMinorTicks: graph.axes.showMinorTicks ?? true,
      },
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
  existingState?: ProjectState;
  now?: string;
}): ProjectState {
  const now = input.now ?? new Date().toISOString();
  const actor = "local-user";
  const revisionIndex = (input.existingState?.rawRevisions.length ?? 0) + 1;
  const rawRevision: RawDatasetRevision = {
    id: `raw.workspace.${revisionIndex}`,
    previousRevisionId: input.existingState?.activeRawRevisionId ?? null,
    sourceKind: input.existingState ? "project_edit" : "manual",
    createdAt: now,
    createdBy: actor,
    note: "Experiment workspace data",
  };
  const records = createCanonicalRecords(input.draft, input.cells, rawRevision, revisionIndex);
  const design = input.existingState
    ? (input.existingState.designRevisions.find(
        (revision) => revision.id === input.existingState?.activeDesignRevisionId,
      )?.design ?? createExperimentWorkspaceDesign(input.draft, now))
    : createExperimentWorkspaceDesign(input.draft, now);
  const projectId =
    input.existingState?.metadata.projectId ?? `project.workspace.${Date.parse(now)}`;
  const prepared = prepareWorkspaceAnalyses({
    draft: input.draft,
    graphs: input.graphs,
    records,
    design,
    projectId,
    revisionIndex,
    now,
    actor,
  });
  let state: ProjectState;
  if (input.existingState) {
    state = appendRawRevision(
      input.existingState,
      records.rawRevision,
      records.unitInstances,
      records.observations,
      actor,
      prepared.transformations,
      prepared.derivedDatasetRevisions,
      prepared.derivedValues,
    );
    state = ProjectStateSchema.parse({
      ...state,
      metadata: {
        ...state.metadata,
        projectName: input.draft.name,
        experimentDate:
          input.draft.experiments.find((experiment) => experiment.date)?.date ??
          state.metadata.experimentDate,
      },
    });
  } else {
    const firstDate = input.draft.experiments.find((experiment) => experiment.date)?.date;
    state = createInitialProjectState({
      metadata: {
        projectId,
        projectName: input.draft.name,
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
  const linkedGraphs = input.graphs.map((graph) => ({
    ...graph,
    analysisRunId: graphRunIds.get(graph.id) ?? null,
  }));
  return ProjectStateSchema.parse({
    ...state,
    experimentWorkspace: createWorkspaceSnapshot(input.draft, input.cells, linkedGraphs),
  });
}

export function rehydrateExperimentWorkspace(state: ProjectState): {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  graphs: WorkspaceGraphState[];
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
  };
  const cells: Record<string, ExperimentCellMap[string]> = {};
  state.observations
    .filter((observation) => observation.rawRevisionId === state.activeRawRevisionId)
    .forEach((observation) => {
      const unit = state.unitInstances.find(
        (candidate) => candidate.id === observation.unitInstanceId,
      );
      const parent = unit?.parentUnitId
        ? state.unitInstances.find((candidate) => candidate.id === unit.parentUnitId)
        : unit;
      const experimentId = parent?.metadata.experimentSessionId;
      if (typeof experimentId !== "string") return;
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
  return { draft, cells, graphs };
}
