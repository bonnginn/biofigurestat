import {
  AnalysisEngineRequestSchema,
  type AnalysisRecommendation,
  type AnalysisEngineRequest,
} from "@lsaa/analysis-contracts";
import { EntityIdSchema } from "@lsaa/domain";
import { resolveCanonicalReadoutValue } from "@lsaa/adaptive-input";

import {
  continuousSummary,
  experimentCellKey,
  hasSharedSourceConditionUnits,
  normalizeWithinExperiment,
  percentage,
  wbRatio,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type TimeAnalysisPlan,
} from "./experimentDraft";
import { repeatedFactorAssessmentText } from "./repeatedFactorTerminology";
import {
  draftUnitIdentityCorrection,
  incompleteMatchedSetDiagnostic,
  pairedDifferenceCorrection,
  type DraftAnalysisCorrection,
  type DraftAnalysisInputDiagnostic,
} from "./draftAnalysisDiagnostics";

type StatisticalMethod = AnalysisRecommendation["recommendedMethod"];
export type ContrastIntent =
  "all_pairs" | "control_vs_many" | "omnibus_only" | "planned_comparisons";

export type StatisticalMethodChoice = Readonly<{
  method: StatisticalMethod;
  level: "recommended" | "alternative" | "advanced";
  label: string;
  explanation: string;
  enabled: boolean;
  unavailableReason?: string;
}>;

export type DraftAnalysisAssessment = Readonly<{
  state: "ready" | "descriptive" | "insufficient" | "unsupported";
  title: string;
  reason: string;
  method: StatisticalMethod | null;
  recommendedMethod?: StatisticalMethod | null;
  methodChoices?: readonly StatisticalMethodChoice[];
  contrastIntent?: ContrastIntent | null;
  commonAlternative: string | null;
  nByCondition: readonly { conditionId: string; label: string; n: number }[];
  nDisplay?: string;
  statisticalNDefinition?: string;
  analysisSetSummary?: string;
  graphAnalysisSetDifference?: string;
  matchedAnalysisSet?: Readonly<{
    completePairCount: number;
    unmatchedObservationCount: number;
  }>;
  missingCount: number;
  notPlannedCount: number;
  request: AnalysisEngineRequest | null;
  correction?: DraftAnalysisCorrection;
  inputDiagnostics?: readonly DraftAnalysisInputDiagnostic[];
}>;

export function isDerivedTimeMetric(plan: TimeAnalysisPlan | undefined): boolean {
  return (
    plan !== undefined && plan.kind !== "selected_timepoint" && plan.kind !== "full_time_course"
  );
}

function declaredUnitIdentity(experiment: ExperimentSetDraft["experiments"][number]): string {
  // Older projects predate stableUnitId. Their durable experiment id remains
  // the declared identity; an explicitly cleared stableUnitId is not replaced.
  return experiment.stableUnitId === undefined
    ? experiment.id.trim()
    : experiment.stableUnitId.trim();
}

function engineUnitIds(
  experiments: ExperimentSetDraft["experiments"],
): ReadonlyMap<string, string> {
  const entries = experiments.map((experiment) => ({
    experimentId: experiment.id,
    identity: declaredUnitIdentity(experiment),
  }));
  const reserved = new Set(
    entries
      .filter(({ identity }) => EntityIdSchema.safeParse(identity).success)
      .map(({ identity }) => identity),
  );
  const result = new Map<string, string>();
  entries
    .filter(({ identity }) => EntityIdSchema.safeParse(identity).success)
    .forEach(({ experimentId, identity }) => result.set(experimentId, identity));

  let nextIndex = 1;
  [...entries]
    .filter(({ identity }) => !EntityIdSchema.safeParse(identity).success)
    .sort(
      (first, second) =>
        first.identity.localeCompare(second.identity) ||
        first.experimentId.localeCompare(second.experimentId),
    )
    .forEach(({ experimentId }) => {
      let candidate = `unit.draft.${nextIndex}`;
      while (reserved.has(candidate)) {
        nextIndex += 1;
        candidate = `unit.draft.${nextIndex}`;
      }
      result.set(experimentId, candidate);
      reserved.add(candidate);
      nextIndex += 1;
    });
  return result;
}

function analysisValue(cell: ExperimentCellMap[string]): number | null {
  if (!cell) return null;
  if (cell.availability === "not_planned") return null;
  if (cell.kind === "proportion") return percentage(cell);
  if (cell.kind === "categorical_counts") return null;
  if (cell.kind === "wb_ratio") return wbRatio(cell);
  return continuousSummary(cell.rawValues).mean;
}

/**
 * The legacy workspace projects independent groups onto one rectangular set of
 * experiment rows.  With unequal n, the shorter group therefore has projection
 * cells that never represented a planned biological unit.  Adaptive projects
 * retain the actual units in canonical observations, so use those records to
 * distinguish a real, explicitly retained missing value from rectangular
 * padding.  Matched/repeated designs deliberately keep the stricter rectangular
 * expectation because an absent partner is an incomplete matched set.
 */
function adaptiveIndependentExpectedUnitCount(input: {
  draft: ExperimentSetDraft;
  readoutId: string;
  conditions: readonly ExperimentSetDraft["conditions"][number][];
  timePointId?: string;
  usesDerivedTimeMetric: boolean;
}): number | null {
  if (input.draft.conditionAssignment.kind !== "independent") return null;
  const snapshot = input.draft.adaptiveInput;
  if (!snapshot) return null;
  const contract = snapshot.contract;
  const contractReadout = contract.readouts.find(({ key }) => `outcome.${key}` === input.readoutId);
  if (!contractReadout) return null;
  const identityKey = contract.identities.find(
    ({ unitLevelKey }) => unitLevelKey === contract.experimentalUnitLevelKey,
  )?.key;
  if (!identityKey) return null;

  const selectedConditionIds = new Set(input.conditions.map(({ id }) => id));
  const axis = contract.orderedAxes.length === 1 ? contract.orderedAxes[0] : null;
  const selectedPoint = input.timePointId
    ? input.draft.time.points.find(({ id }) => id === input.timePointId)
    : null;
  const relevantComponents =
    contractReadout.representation === "scalar"
      ? contractReadout.componentKeys.slice(0, 1)
      : contractReadout.componentKeys;
  const plannedUnits = new Map<string, boolean>();

  snapshot.canonicalObservations.forEach((row) => {
    if (row.readoutKey !== contractReadout.key) return;
    const condition = input.conditions.find((candidate) =>
      contract.factors.every(
        (factor) => row.factors[factor.key] === candidate.attributes[`factor.${factor.key}`],
      ),
    );
    if (!condition || !selectedConditionIds.has(condition.id)) return;
    if (
      !input.usesDerivedTimeMetric &&
      axis &&
      selectedPoint &&
      String(row.axes[axis.key]) !== String(selectedPoint.value)
    )
      return;
    const identity = row.identities[identityKey];
    if (!identity) return;
    const unitKey = `${condition.id}\u0000${identity}`;
    const rowIsNotPlanned =
      relevantComponents.length > 0 &&
      relevantComponents.every((component) => {
        const resolved = resolveCanonicalReadoutValue(contractReadout, row, component);
        return resolved.status === "resolved" && row.missingness[resolved.key] === "not_applicable";
      });
    plannedUnits.set(unitKey, (plannedUnits.get(unitKey) ?? false) || !rowIsNotPlanned);
  });

  if (plannedUnits.size === 0) return null;
  return [...plannedUnits.values()].filter(Boolean).length;
}

export function deriveTimeMetricValue(input: {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  experimentId: string;
  conditionId: string;
  readoutId: string;
  plan: TimeAnalysisPlan;
}): number | null {
  const points = [...input.draft.time.points]
    .filter(
      ({ value }) =>
        (input.plan.windowStart === undefined || value >= input.plan.windowStart) &&
        (input.plan.windowEnd === undefined || value <= input.plan.windowEnd),
    )
    .sort((first, second) => first.value - second.value)
    .map((point) => ({
      time: point.value,
      value: analysisValue(
        input.cells[
          experimentCellKey({
            experimentId: input.experimentId,
            conditionId: input.conditionId,
            readoutId: input.readoutId,
            timePointId: point.id,
          })
        ],
      ),
    }));
  if (points.length === 0) return null;
  const endpoint = points.at(-1);
  if (!endpoint || endpoint.value === null) return null;
  if (input.plan.kind === "endpoint") return endpoint.value;
  if (input.plan.kind === "change_from_baseline" || input.plan.kind === "f_over_f0") {
    const baseline =
      input.plan.baselineTime === undefined
        ? points[0]
        : points.find(({ time }) => time === input.plan.baselineTime);
    if (!baseline || baseline.value === null) return null;
    if (input.plan.kind === "change_from_baseline") return endpoint.value - baseline.value;
    return baseline.value === 0 ? null : endpoint.value / baseline.value;
  }
  if (points.some(({ value }) => value === null)) return null;
  const complete = points as Array<{ time: number; value: number }>;
  if (input.plan.kind === "maximum") return Math.max(...complete.map(({ value }) => value));
  if (input.plan.kind === "minimum") return Math.min(...complete.map(({ value }) => value));
  if (input.plan.kind === "auc") {
    if (complete.length < 2) return null;
    return complete.slice(1).reduce((area, current, index) => {
      const previous = complete[index];
      return area + ((current.value + previous.value) / 2) * (current.time - previous.time);
    }, 0);
  }
  return null;
}

export function assessDraftGraphAnalysis(input: {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  readoutId: string;
  conditionIds: readonly string[];
  timePointId?: string;
  timeAnalysis?: TimeAnalysisPlan;
  correlationMethod?: "pearson" | "spearman";
  selectedMethod?: StatisticalMethod;
  contrastIntent?: ContrastIntent;
  plannedContrastConditionIds?: readonly (readonly [string, string])[];
  withinFactor?: Readonly<{
    role: "time" | "numeric_covariate" | "categorical";
    title: string;
    unit: string;
  }>;
}): DraftAnalysisAssessment {
  const selected = new Set(input.conditionIds);
  const conditions = input.draft.conditions.filter((condition) => selected.has(condition.id));
  const sharedSource = hasSharedSourceConditionUnits(input.draft);
  const sharedSourceLabel =
    input.draft.conditionAssignment.matchedTopology?.kind ===
    "distinct_condition_units_shared_source"
      ? input.draft.conditionAssignment.matchedTopology.sourceUnitLabel
      : "共有した由来";
  const matchedSetDescription = sharedSource
    ? `同じ${sharedSourceLabel}に由来する条件別${input.draft.conditionAssignment.unitLabel}`
    : `同じ${input.draft.conditionAssignment.unitLabel}`;
  if (conditions.length < 1) {
    return {
      state: "unsupported",
      title: "条件を1つ以上選択してください",
      reason: "Graphまたは解析に使用するコホート・条件を選択してください。",
      method: null,
      commonAlternative: null,
      nByCondition: [],
      missingCount: 0,
      notPlannedCount: 0,
      request: null,
    };
  }
  if (conditions.length < 2 && input.draft.analysisIntent.kind !== "single_cohort") {
    return {
      state: "unsupported",
      title: "群比較には2条件以上が必要です",
      reason:
        "比較群を追加するか、比較を行わない単一コホートworkflowとして実験を作成してください。Graphだけの表示は続けられます。",
      method: null,
      commonAlternative: null,
      nByCondition: [],
      missingCount: 0,
      notPlannedCount: 0,
      request: null,
    };
  }
  const readout = input.draft.readouts.find(({ id }) => id === input.readoutId);
  if (readout?.shape === "categorical_counts") {
    return {
      state: "unsupported",
      title: "カテゴリ構成はグラフとして利用できます",
      reason:
        "カテゴリ別countと割合は保持しますが、連続値向けのt検定や分散分析には接続しません。カテゴリ構成の推論統計は別の検証済み契約を追加するまで実行しません。",
      method: null,
      commonAlternative: null,
      nByCondition: [],
      missingCount: 0,
      notPlannedCount: 0,
      request: null,
    };
  }
  const usesDerivedTimeMetric = isDerivedTimeMetric(input.timeAnalysis);
  if (
    usesDerivedTimeMetric &&
    input.timeAnalysis?.windowStart !== undefined &&
    input.timeAnalysis.windowEnd !== undefined &&
    input.timeAnalysis.windowStart > input.timeAnalysis.windowEnd
  ) {
    return {
      state: "unsupported",
      title: "解析windowを確認してください",
      reason: "開始時点は終了時点以前にしてください。",
      method: null,
      commonAlternative: null,
      nByCondition: [],
      missingCount: 0,
      notPlannedCount: 0,
      request: null,
    };
  }
  if (usesDerivedTimeMetric && input.draft.time.sampling !== "longitudinal") {
    return {
      state: "unsupported",
      title: "この派生値は同じ単位を追跡した時系列で使います",
      reason:
        "時点ごとに別のサンプルを測った場合、個々の実験単位のAUCやbaseline変化は定義できません。特定時点の比較を選んでください。",
      method: null,
      commonAlternative: null,
      nByCondition: [],
      missingCount: 0,
      notPlannedCount: 0,
      request: null,
    };
  }

  const varyingAttributes = input.draft.attributes.filter((attribute) => {
    const values = new Set(
      conditions
        .map((condition) => condition.attributes[attribute.id]?.trim())
        .filter((value): value is string => Boolean(value)),
    );
    return values.size > 1;
  });
  if (varyingAttributes.length > 2) {
    return {
      state: "unsupported",
      title: "3種類以上の処置を組み合わせた設計です",
      reason:
        "この設計では複数の処置とその組合せを分けて評価する必要があります。条件を一列の群として扱う解析は実行しません。グラフ表示は続けられます。",
      method: null,
      commonAlternative: null,
      nByCondition: [],
      missingCount: 0,
      notPlannedCount: 0,
      request: null,
    };
  }

  if (input.timeAnalysis?.kind === "full_time_course") {
    const timePoints = [...input.draft.time.points].sort((a, b) => a.value - b.value);
    if (timePoints.length < 2 || input.draft.time.sampling === "none") {
      return {
        state: "unsupported",
        title: "条件×軸モデルには2水準以上が必要です",
        reason: "同じ軸に属する測定水準を2つ以上指定してください。",
        method: null,
        commonAlternative: null,
        nByCondition: [],
        missingCount: 0,
        notPlannedCount: 0,
        request: null,
      };
    }
    if (input.draft.conditionAssignment.kind !== "independent") {
      return {
        state: "unsupported",
        title: "群間で独立した条件×軸設計に限定しています",
        reason:
          input.draft.time.sampling === "longitudinal"
            ? "現在の縦断モデルは、条件間は独立、軸内は同じ実験単位を追跡する完全なbalanced設計だけを扱います。"
            : "現在の独立二因子モデルは、すべての条件×軸セルで別々の実験単位を使う完全なbalanced設計だけを扱います。",
        method: null,
        commonAlternative: null,
        nByCondition: [],
        missingCount: 0,
        notPlannedCount: 0,
        request: null,
      };
    }
    if (readout?.withinExperimentNormalization) {
      return {
        state: "unsupported",
        title: "正規化を伴う条件×時間モデルは未接続です",
        reason:
          "時点内正規化と反復測定identityの両方を再現可能に保存する専用契約を追加するまで、この組合せを実行しません。",
        method: null,
        commonAlternative: null,
        nByCondition: [],
        missingCount: 0,
        notPlannedCount: 0,
        request: null,
      };
    }
    const withinFactor = {
      role: input.withinFactor?.role ?? ("time" as const),
      title: input.withinFactor?.title.trim() || "Time",
      unit: input.withinFactor?.unit.trim() || input.draft.time.unit,
    };
    const engineUnitIdByExperiment = engineUnitIds(input.draft.experiments);
    if (input.draft.time.sampling === "cross_sectional") {
      const observations: Array<{
        observationId: string;
        conditionId: string;
        value: number;
        experimentalUnitId: string;
        withinFactorLevelId: string;
      }> = [];
      let missingCount = 0;
      let notPlannedCount = 0;
      const cellCounts: number[] = [];
      const nByCondition = conditions.map((condition, conditionIndex) => {
        let minimumCellN = Number.POSITIVE_INFINITY;
        timePoints.forEach((timePoint, timeIndex) => {
          let cellN = 0;
          input.draft.experiments.forEach((experiment, experimentIndex) => {
            const cell =
              input.cells[
                experimentCellKey({
                  experimentId: experiment.id,
                  conditionId: condition.id,
                  readoutId: input.readoutId,
                  timePointId: timePoint.id,
                })
              ];
            if (cell?.availability === "not_planned") notPlannedCount += 1;
            const value = analysisValue(cell);
            if (value === null || !Number.isFinite(value)) {
              missingCount += 1;
              return;
            }
            const baseUnitId =
              engineUnitIdByExperiment.get(experiment.id) ?? `unit.draft.${experimentIndex + 1}`;
            observations.push({
              observationId: `observation.draft.${conditionIndex + 1}.${timeIndex + 1}.${experimentIndex + 1}`,
              conditionId: condition.id,
              value,
              experimentalUnitId: `${baseUnitId}.${condition.id}.${timePoint.id}`,
              withinFactorLevelId: timePoint.id,
            });
            cellN += 1;
          });
          cellCounts.push(cellN);
          minimumCellN = Math.min(minimumCellN, cellN);
        });
        return {
          conditionId: condition.id,
          label: condition.label,
          n: Number.isFinite(minimumCellN) ? minimumCellN : 0,
        };
      });
      if (
        missingCount > 0 ||
        cellCounts.some((count) => count < 2) ||
        new Set(cellCounts).size !== 1
      ) {
        return {
          state: "unsupported",
          title: "独立条件×軸モデルのbalanced条件を満たしません",
          reason:
            "すべての条件×軸水準で、別々の実験単位が同数かつ2以上必要です。欠測や不均衡を暗黙に除外しません。",
          method: null,
          commonAlternative: "不均衡を扱える検証済み一般化モデル（未接続）",
          nByCondition,
          missingCount,
          notPlannedCount,
          request: null,
        };
      }
      const request = AnalysisEngineRequestSchema.parse({
        protocolVersion: "0.7.0",
        requestId: "request.draft.graph",
        projectId: "project.draft",
        analysisId: "analysis.draft.graph",
        templateId: "D07",
        templateVersion: "0.1.0",
        method: "two_way_anova",
        conditionIds: conditions.map(({ id }) => id),
        withinFactor: {
          ...withinFactor,
          levels: timePoints.map(({ id, value }) => ({ levelId: id, value })),
        },
        observations,
        options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
      });
      return {
        state: "ready",
        title: `独立条件×${withinFactor.title}の二因子分散分析を推奨`,
        reason: `各条件×${withinFactor.title}水準で別々の${input.draft.conditionAssignment.unitLabel}を使い、交互作用と両主効果を評価します。反復測定とは扱いません。`,
        method: "two_way_anova",
        recommendedMethod: "two_way_anova",
        commonAlternative: null,
        nByCondition,
        nDisplay: `n=${cellCounts[0]} / 条件×${withinFactor.title}セル、独立した実験単位は全${observations.length}個`,
        statisticalNDefinition: `各条件×${withinFactor.title}セルで独立した実験単位 n=${cellCounts[0]}、全${observations.length}実験単位`,
        missingCount,
        notPlannedCount,
        request,
      };
    }
    const observations: Array<{
      observationId: string;
      conditionId: string;
      value: number;
      experimentalUnitId: string;
      pairId: string;
      timePointId: string;
    }> = [];
    let missingCount = 0;
    let notPlannedCount = 0;
    const nByCondition = conditions.map((condition, conditionIndex) => {
      let completeUnits = 0;
      input.draft.experiments.forEach((experiment, experimentIndex) => {
        const unitValues = timePoints.map((timePoint) => {
          const cell =
            input.cells[
              experimentCellKey({
                experimentId: experiment.id,
                conditionId: condition.id,
                readoutId: input.readoutId,
                timePointId: timePoint.id,
              })
            ];
          if (cell?.availability === "not_planned") notPlannedCount += 1;
          const valuesByCondition = Object.fromEntries(
            conditions.map(({ id }) => [
              id,
              analysisValue(
                input.cells[
                  experimentCellKey({
                    experimentId: experiment.id,
                    conditionId: id,
                    readoutId: input.readoutId,
                    timePointId: timePoint.id,
                  })
                ],
              ),
            ]),
          );
          return readout
            ? normalizeWithinExperiment(
                valuesByCondition[condition.id] ?? null,
                valuesByCondition,
                condition.id,
                readout,
              )
            : null;
        });
        if (unitValues.some((value) => value === null || !Number.isFinite(value))) {
          missingCount += unitValues.filter(
            (value) => value === null || !Number.isFinite(value),
          ).length;
          return;
        }
        completeUnits += 1;
        const baseUnitId =
          engineUnitIdByExperiment.get(experiment.id) ?? `unit.draft.${experimentIndex + 1}`;
        const pairId = `${baseUnitId}.${condition.id}`;
        timePoints.forEach((timePoint, timeIndex) => {
          observations.push({
            observationId: `observation.draft.${experimentIndex + 1}.${conditionIndex + 1}.${timeIndex + 1}`,
            conditionId: condition.id,
            value: unitValues[timeIndex] as number,
            experimentalUnitId: pairId,
            pairId,
            timePointId: timePoint.id,
          });
        });
      });
      return { conditionId: condition.id, label: condition.label, n: completeUnits };
    });
    const counts = nByCondition.map(({ n }) => n);
    if (missingCount > 0 || counts.some((count) => count < 2) || new Set(counts).size !== 1) {
      return {
        state: "unsupported",
        title: "条件×時間モデルのcomplete balanced条件を満たしません",
        reason:
          "各実験単位の全時点がそろい、各条件の実験単位数が等しく2以上である必要があります。不完全な単位を暗黙に除外しません。",
        method: null,
        commonAlternative: "欠測や不均衡を扱える検証済みmixed model（未接続）",
        nByCondition,
        missingCount,
        notPlannedCount,
        request: null,
      };
    }
    const request = AnalysisEngineRequestSchema.parse({
      protocolVersion: "0.6.0",
      requestId: "request.draft.graph",
      projectId: "project.draft",
      analysisId: "analysis.draft.graph",
      templateId: "D06",
      templateVersion: "0.1.0",
      method: "mixed_anova",
      withinFactor,
      conditionIds: conditions.map(({ id }) => id),
      timePoints: timePoints.map(({ id, value }) => ({ timePointId: id, value })),
      observations,
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    });
    const recommendationText = repeatedFactorAssessmentText(
      withinFactor,
      input.draft.conditionAssignment.unitLabel,
    );
    return {
      state: "ready",
      title: recommendationText.title,
      reason: recommendationText.reason,
      method: "mixed_anova",
      recommendedMethod: "mixed_anova",
      commonAlternative: "欠測や不均衡を扱えるmixed-effects model（未接続）",
      nByCondition,
      missingCount,
      notPlannedCount,
      request,
    };
  }

  const observations: Array<{
    observationId: string;
    conditionId: string;
    value: number;
    experimentalUnitId: string;
    pairId?: string;
    sourceExperimentId: string;
  }> = [];
  const engineUnitIdByExperiment = engineUnitIds(input.draft.experiments);
  const nByCondition = conditions.map((condition, conditionIndex) => {
    let n = 0;
    input.draft.experiments.forEach((experiment, experimentIndex) => {
      const valueFor = (conditionId: string) =>
        usesDerivedTimeMetric
          ? deriveTimeMetricValue({
              draft: input.draft,
              cells: input.cells,
              experimentId: experiment.id,
              conditionId,
              readoutId: input.readoutId,
              plan: input.timeAnalysis!,
            })
          : analysisValue(
              input.cells[
                experimentCellKey({
                  experimentId: experiment.id,
                  conditionId,
                  readoutId: input.readoutId,
                  timePointId: input.timePointId,
                })
              ],
            );
      const valuesByCondition = Object.fromEntries(conditions.map(({ id }) => [id, valueFor(id)]));
      const value = readout
        ? normalizeWithinExperiment(
            valuesByCondition[condition.id] ?? null,
            valuesByCondition,
            condition.id,
            readout,
          )
        : null;
      if (value === null || !Number.isFinite(value)) return;
      n += 1;
      const engineUnitId =
        engineUnitIdByExperiment.get(experiment.id) ?? `unit.draft.${experimentIndex + 1}`;
      const enginePairId = engineUnitId;
      observations.push({
        observationId: `observation.draft.${experimentIndex + 1}.${conditionIndex + 1}`,
        conditionId: condition.id,
        value,
        sourceExperimentId: experiment.id,
        experimentalUnitId:
          input.draft.conditionAssignment.kind === "matched" && !sharedSource
            ? engineUnitId
            : `${engineUnitId}.${condition.id}`,
        ...(input.draft.conditionAssignment.kind === "matched" ? { pairId: enginePairId } : {}),
      });
    });
    return { conditionId: condition.id, label: condition.label, n };
  });
  const notPlannedCount = conditions.reduce(
    (count, condition) =>
      count +
      input.draft.experiments.filter(
        (experiment) =>
          input.cells[
            experimentCellKey({
              experimentId: experiment.id,
              conditionId: condition.id,
              readoutId: input.readoutId,
              timePointId: input.timePointId,
            })
          ]?.availability === "not_planned",
      ).length,
    0,
  );
  const adaptiveExpectedCount = adaptiveIndependentExpectedUnitCount({
    draft: input.draft,
    readoutId: input.readoutId,
    conditions,
    timePointId: input.timePointId,
    usesDerivedTimeMetric,
  });
  const expectedCount =
    adaptiveExpectedCount ?? conditions.length * input.draft.experiments.length - notPlannedCount;
  const missingCount = Math.max(0, expectedCount - observations.length);
  const identityCorrection = draftUnitIdentityCorrection({
    draft: input.draft,
    contributingExperimentIds: new Set(
      observations.map(({ sourceExperimentId }) => sourceExperimentId),
    ),
  });
  if (identityCorrection) {
    return {
      state: "unsupported",
      title: identityCorrection.title,
      reason: identityCorrection.message,
      method: null,
      commonAlternative: null,
      nByCondition,
      missingCount,
      notPlannedCount,
      request: null,
      correction: identityCorrection,
    };
  }
  const incompleteMatchedDiagnostic = incompleteMatchedSetDiagnostic({
    draft: input.draft,
    conditions,
    observations,
  });
  const completePairIds =
    input.draft.conditionAssignment.kind === "matched"
      ? new Set(
          [...new Set(observations.flatMap((observation) => observation.pairId ?? []))].filter(
            (pairId) =>
              observations.filter((observation) => observation.pairId === pairId).length ===
              conditions.length,
          ),
        )
      : null;
  const unmatchedObservationCount = completePairIds
    ? observations.filter((observation) => !completePairIds.has(observation.pairId ?? "")).length
    : 0;
  const inputDiagnosticProperties = {
    ...(incompleteMatchedDiagnostic
      ? { inputDiagnostics: [incompleteMatchedDiagnostic] as const }
      : {}),
    ...(completePairIds
      ? {
          analysisSetSummary: `完全な対応組 ${completePairIds.size}組を統計解析に使います。対応相手がそろわない観測 ${unmatchedObservationCount}件は解析から除外します。`,
          graphAnalysisSetDifference:
            unmatchedObservationCount > 0
              ? "Graphには入力済みの観測を残します。統計解析だけが完全な対応組に限定されます。"
              : "Graphと統計解析は、同じ完全な対応組を使用します。",
          matchedAnalysisSet: {
            completePairCount: completePairIds.size,
            unmatchedObservationCount,
          },
        }
      : {}),
  };
  const requestObservations = completePairIds
    ? observations.filter((observation) => completePairIds.has(observation.pairId ?? ""))
    : observations;
  const effectiveNByCondition = completePairIds
    ? nByCondition.map((item) => ({ ...item, n: completePairIds.size }))
    : nByCondition;
  const insufficient = effectiveNByCondition.some(({ n }) => n < 2);
  const nText = effectiveNByCondition.map(({ label, n }) => `${label}: ${n}`).join("、");

  if (input.draft.analysisIntent.kind === "single_cohort") {
    const n = effectiveNByCondition[0]?.n ?? 0;
    if (input.draft.analysisIntent.mode === "descriptive") {
      return {
        state: "descriptive",
        title: "記述統計とGraphのみ",
        reason: `この単一コホートは比較群や基準値を仮定しません（${nText}）。分布、平均、中央値、SDを確認できます。`,
        method: null,
        commonAlternative: null,
        nByCondition: effectiveNByCondition,
        missingCount,
        notPlannedCount,
        request: null,
        ...inputDiagnosticProperties,
      };
    }
    if (n < 2) {
      return {
        state: "insufficient",
        title: "one-sample t-testに必要な実験単位が不足しています",
        reason: `現在のbiological nは${n}です。Graphは利用できますが、推定には2つ以上の独立した実験単位が必要です。`,
        method: null,
        commonAlternative: null,
        nByCondition: effectiveNByCondition,
        missingCount,
        notPlannedCount,
        request: null,
        ...inputDiagnosticProperties,
      };
    }
    const referenceValue = input.draft.analysisIntent.referenceValue;
    if (referenceValue === undefined || !Number.isFinite(referenceValue)) {
      return {
        state: "unsupported",
        title: "基準値を明示してください",
        reason: "one-sample推論ではnull/reference値を暗黙に0とせず、実験設計で明示します。",
        method: null,
        commonAlternative: null,
        nByCondition: effectiveNByCondition,
        missingCount,
        notPlannedCount,
        request: null,
        ...inputDiagnosticProperties,
      };
    }
    const request = AnalysisEngineRequestSchema.parse({
      protocolVersion: "0.9.0",
      requestId: "request.draft.graph",
      projectId: "project.draft",
      analysisId: "analysis.draft.graph",
      templateId: "D12",
      templateVersion: "0.1.0",
      method: "one_sample_t",
      conditionId: conditions[0].id,
      nullValue: referenceValue,
      observations: requestObservations,
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    });
    return {
      state: "ready",
      title: "one-sample t-test",
      reason: `${conditions[0].label}の独立した実験単位（n=${n}）の平均を、明示した基準値 ${referenceValue} と比較します。`,
      method: "one_sample_t",
      recommendedMethod: "one_sample_t",
      methodChoices: [
        {
          method: "one_sample_t",
          level: "recommended",
          label: "one-sample t-test",
          explanation: `平均と基準値 ${referenceValue} の差を95%信頼区間とともに評価します。`,
          enabled: true,
        },
      ],
      commonAlternative: null,
      nByCondition: effectiveNByCondition,
      missingCount,
      notPlannedCount,
      request,
      ...inputDiagnosticProperties,
    };
  }

  if (input.draft.analysisIntent.kind === "correlation") {
    const pairCount = completePairIds?.size ?? 0;
    if (conditions.length !== 2 || pairCount < 3) {
      return {
        state: "insufficient",
        title: "XとYがそろった実験単位が不足しています",
        reason: `現在、XとYの両方がそろった組は${pairCount}組です。相関解析には少なくとも3組必要ですが、散布図はこのまま利用できます。`,
        method: null,
        commonAlternative: null,
        nByCondition: effectiveNByCondition,
        missingCount,
        notPlannedCount,
        request: null,
        ...inputDiagnosticProperties,
      };
    }
    const recommendedMethod =
      input.draft.analysisIntent.relationshipForm === "linear" ? "pearson" : "spearman";
    const method =
      input.selectedMethod === "pearson" || input.selectedMethod === "spearman"
        ? input.selectedMethod
        : (input.correlationMethod ?? recommendedMethod);
    const request = AnalysisEngineRequestSchema.parse({
      protocolVersion: "0.5.0",
      requestId: "request.draft.graph",
      projectId: "project.draft",
      analysisId: "analysis.draft.graph",
      templateId: "D09",
      templateVersion: "0.1.0",
      method,
      variableConditionIds: [conditions[0].id, conditions[1].id],
      observations: requestObservations,
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    });
    return {
      state: "ready",
      title: recommendedMethod === "pearson" ? "Pearsonの相関を推奨" : "Spearmanの順位相関を推奨",
      reason:
        method === "pearson"
          ? `同じ${input.draft.conditionAssignment.unitLabel}から得た${pairCount}組のXとYについて、確認した直線的な関係を評価します。`
          : `同じ${input.draft.conditionAssignment.unitLabel}から得た${pairCount}組のXとYについて、順位・単調な関係を評価します。`,
      method,
      recommendedMethod,
      methodChoices: [
        {
          method: recommendedMethod,
          level: "recommended",
          label: recommendedMethod === "pearson" ? "Pearsonの相関" : "Spearmanの順位相関",
          explanation:
            recommendedMethod === "pearson"
              ? "直線的な関係の強さを評価します。"
              : "順位と単調な関係を評価します。",
          enabled: true,
        },
        {
          method: recommendedMethod === "pearson" ? "spearman" : "pearson",
          level: "alternative",
          label: recommendedMethod === "pearson" ? "Spearmanの順位相関" : "Pearsonの相関",
          explanation:
            recommendedMethod === "pearson"
              ? "順位と単調な関係を評価します。"
              : "直線的な関係の強さを評価します。",
          enabled: true,
        },
      ],
      commonAlternative:
        method === "pearson"
          ? "直線ではなく順位・単調な関係を評価する場合はSpearmanの順位相関"
          : "直線的な関係を評価する場合はPearsonの相関",
      nByCondition: effectiveNByCondition,
      missingCount,
      notPlannedCount,
      request,
      ...inputDiagnosticProperties,
    };
  }

  if (insufficient) {
    return {
      state: "insufficient",
      title: "解析に必要な実験単位が不足しています",
      reason: `現在の有効な実験単位数は ${nText} です。各条件で少なくとも2つ必要ですが、グラフはこのまま利用できます。`,
      method: null,
      commonAlternative: null,
      nByCondition: effectiveNByCondition,
      missingCount,
      notPlannedCount,
      request: null,
      ...inputDiagnosticProperties,
    };
  }

  if (input.draft.conditionAssignment.kind === "matched" && conditions.length >= 3) {
    if (varyingAttributes.length > 1) {
      return {
        state: "unsupported",
        title: "対応のある複数処置の組合せです",
        reason:
          "Coreの反復測定解析は、同じ単位を1種類の条件要因で3条件以上測った完全データに限定しています。混合モデル等は未実装のため、グラフだけを続けられます。",
        method: null,
        commonAlternative: null,
        nByCondition: effectiveNByCondition,
        missingCount,
        notPlannedCount,
        request: null,
        ...inputDiagnosticProperties,
      };
    }
    const request = AnalysisEngineRequestSchema.parse({
      protocolVersion: "0.3.0",
      requestId: "request.draft.graph",
      projectId: "project.draft",
      analysisId: "analysis.draft.graph",
      templateId: "D04",
      templateVersion: "0.1.0",
      method: "repeated_measures_anova",
      conditionIds: conditions.map(({ id }) => id),
      primaryContrastConditionIds: [conditions[0].id, conditions[1].id],
      observations: requestObservations,
      options: {
        alternative: "two_sided",
        confidenceLevel: 0.95,
        multiplicityMethod: "holm_paired_all_pairs",
      },
    });
    return {
      state: "ready",
      title: "反復測定の分散分析を推奨",
      reason: `${matchedSetDescription}の${conditions.length}条件を対応づけて比較します（完全な組 ${completePairIds?.size ?? 0}）。条件間比較はHolm法で調整します。${missingCount > 0 ? " 不完全な組は解析に含めません。" : ""}`,
      method: "repeated_measures_anova",
      recommendedMethod: "repeated_measures_anova",
      methodChoices: [
        {
          method: "repeated_measures_anova",
          level: "recommended",
          label: "推奨を採用：反復測定の分散分析 + Holm",
          explanation: `${matchedSetDescription}から得た完全な${conditions.length}条件の対応を保持します。`,
          enabled: true,
        },
      ],
      commonAlternative: "順位に基づくFriedman検定（実装準備中）",
      nByCondition: effectiveNByCondition,
      missingCount,
      notPlannedCount,
      request,
      ...inputDiagnosticProperties,
    };
  }

  if (varyingAttributes.length === 2 && input.contrastIntent !== "planned_comparisons") {
    if (input.draft.conditionAssignment.kind === "matched") {
      return {
        state: "unsupported",
        title: "対応のある二因子設計です",
        reason:
          "同じ単位を複数の処置組合せで測った二因子解析は、反復構造を含む専用モデルを接続してから実行します。グラフ表示は続けられます。",
        method: null,
        commonAlternative: null,
        nByCondition: effectiveNByCondition,
        missingCount,
        notPlannedCount,
        request: null,
        ...inputDiagnosticProperties,
      };
    }
    const factorLevels = varyingAttributes.map((attribute) => [
      ...new Set(
        conditions
          .map((condition) => condition.attributes[attribute.id]?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ]);
    const adaptiveFactorKeys = new Set(
      input.draft.adaptiveInput?.contract.factors.map(({ key }) => key) ?? [],
    );
    const canonicalFactorId = (attributeId: string): string => {
      const adaptiveKey = attributeId.startsWith("factor.")
        ? attributeId.slice("factor.".length)
        : "";
      return adaptiveKey && adaptiveFactorKeys.has(adaptiveKey)
        ? attributeId
        : `factor.${attributeId}`;
    };
    const canonicalLevelId = (attributeId: string, levelIndex: number): string => {
      const adaptiveKey = attributeId.startsWith("factor.")
        ? attributeId.slice("factor.".length)
        : "";
      return adaptiveKey && adaptiveFactorKeys.has(adaptiveKey)
        ? `level.${adaptiveKey}.${levelIndex + 1}`
        : `level.${attributeId}.${levelIndex + 1}`;
    };
    const factorialConditions = conditions.map((condition) => {
      const levelIndexes = varyingAttributes.map((attribute, factorIndex) =>
        factorLevels[factorIndex].indexOf(condition.attributes[attribute.id]?.trim() ?? ""),
      );
      return {
        conditionId: condition.id,
        factorALevelId: canonicalLevelId(varyingAttributes[0].id, levelIndexes[0]),
        factorBLevelId: canonicalLevelId(varyingAttributes[1].id, levelIndexes[1]),
      };
    });
    const combinations = new Set(
      factorialConditions.map(
        ({ factorALevelId, factorBLevelId }) => `${factorALevelId}\u0000${factorBLevelId}`,
      ),
    );
    const expectedCombinations = factorLevels[0].length * factorLevels[1].length;
    if (
      factorLevels.some((levels) => levels.length < 2) ||
      combinations.size !== expectedCombinations ||
      factorialConditions.length !== expectedCombinations
    ) {
      return {
        state: "unsupported",
        title: "処置の組合せがそろっていません",
        reason:
          "最初の二因子解析では、2種類の処置について全組合せが1条件ずつ必要です。欠けている組合せを確認してください。グラフ表示は続けられます。",
        method: null,
        commonAlternative: null,
        nByCondition,
        missingCount,
        notPlannedCount,
        request: null,
        ...inputDiagnosticProperties,
      };
    }
    const request = AnalysisEngineRequestSchema.parse({
      protocolVersion: "0.4.0",
      requestId: "request.draft.graph",
      projectId: "project.draft",
      analysisId: "analysis.draft.graph",
      templateId: "D05",
      templateVersion: "0.1.0",
      method: "two_way_anova",
      factors: varyingAttributes.map((attribute, factorIndex) => ({
        factorId: canonicalFactorId(attribute.id),
        levelIds: factorLevels[factorIndex].map((_level, levelIndex) =>
          canonicalLevelId(attribute.id, levelIndex),
        ),
      })),
      conditions: factorialConditions,
      primaryContrastConditionIds: [conditions[0].id, conditions[1].id],
      observations: requestObservations,
      options: {
        alternative: "two_sided",
        confidenceLevel: 0.95,
        multiplicityMethod: "holm_all_cell_pairs",
      },
    });
    return {
      state: "ready",
      title: "二因子の分散分析を推奨",
      reason: `2種類の処置の主効果と交互作用を先に評価し、条件間比較はHolm法で調整します（${nText}）。`,
      method: "two_way_anova",
      commonAlternative: null,
      nByCondition: effectiveNByCondition,
      missingCount,
      notPlannedCount,
      request,
      ...inputDiagnosticProperties,
    };
  }

  if (conditions.length === 2) {
    const matched = input.draft.conditionAssignment.kind === "matched";
    const recommendedMethod: StatisticalMethod = matched ? "paired_t" : "welch_t";
    const supportedMethods: StatisticalMethod[] = matched
      ? ["paired_t", "wilcoxon_signed_rank"]
      : ["welch_t", "mann_whitney", "student_t"];
    const method =
      input.selectedMethod && supportedMethods.includes(input.selectedMethod)
        ? input.selectedMethod
        : recommendedMethod;
    const pairedCorrection =
      method === "paired_t"
        ? pairedDifferenceCorrection({
            draft: input.draft,
            conditionIds: [conditions[0].id, conditions[1].id],
            observations: requestObservations,
          })
        : null;
    if (pairedCorrection) {
      return {
        state: "unsupported",
        title: pairedCorrection.title,
        reason: pairedCorrection.message,
        method,
        recommendedMethod,
        methodChoices: [
          {
            method: "paired_t",
            level: "recommended",
            label: "対応のあるt検定",
            explanation: "同じ実験単位内の差の平均を評価します。",
            enabled: false,
            unavailableReason: "すべての対応差が同じで、差の標準誤差が0です。",
          },
          {
            method: "wilcoxon_signed_rank",
            level: "alternative",
            label: "Wilcoxonの符号付順位検定",
            explanation:
              "対応する差の符号と順位を使う方法です。選ぶ前に、同じ差が並んだ入力が正しいか確認してください。",
            enabled: pairedCorrection.suggestedMethod === "wilcoxon_signed_rank",
            ...(pairedCorrection.suggestedMethod
              ? {}
              : {
                  unavailableReason:
                    "すべての対応差が0のため、Wilcoxonの符号付順位検定も定義できません。",
                }),
          },
        ],
        commonAlternative: pairedCorrection.suggestedMethod
          ? "入力値が正しい場合は、明示的な代替としてWilcoxonの符号付順位検定を確認できます。"
          : null,
        nByCondition: effectiveNByCondition,
        missingCount,
        notPlannedCount,
        request: null,
        correction: pairedCorrection,
        ...inputDiagnosticProperties,
      };
    }
    const request = AnalysisEngineRequestSchema.parse({
      protocolVersion: "0.1.0",
      requestId: "request.draft.graph",
      projectId: "project.draft",
      analysisId: "analysis.draft.graph",
      templateId: matched ? "D02" : "D01",
      templateVersion: "0.1.0",
      method,
      contrastConditionIds: [conditions[0].id, conditions[1].id],
      observations: requestObservations,
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    });
    return {
      state: "ready",
      title: matched ? "対応のあるt検定を推奨" : "Welchの2標本t検定を推奨",
      reason: matched
        ? `${matchedSetDescription}の2条件を対応づけて比較します（完全な組 ${completePairIds?.size ?? 0}）。`
        : `各条件を別々の実験単位として比較します（${nText}）。等分散を前提にしない方法を既定にしています。`,
      method,
      recommendedMethod,
      methodChoices: matched
        ? [
            {
              method: "paired_t",
              level: "recommended",
              label: "対応のあるt検定",
              explanation: sharedSource
                ? `同じ${sharedSourceLabel}に由来する条件別試料の差を評価します。`
                : "同じ実験単位内の差の平均を評価します。",
              enabled: true,
            },
            {
              method: "wilcoxon_signed_rank",
              level: "alternative",
              label: "Wilcoxonの符号付順位検定",
              explanation: "対応する差の符号と順位を使う方法です。",
              enabled: true,
            },
          ]
        : [
            {
              method: "welch_t",
              level: "recommended",
              label: "Welchの2標本t検定",
              explanation: "群の分散が等しいとは仮定しません。",
              enabled: true,
            },
            {
              method: "mann_whitney",
              level: "alternative",
              label: "Mann–WhitneyのU検定",
              explanation:
                "順位に基づき分布の並び方を評価します。単なる「中央値の検定」ではありません。",
              enabled: true,
            },
            {
              method: "student_t",
              level: "advanced",
              label: "Studentの2標本t検定",
              explanation: "群の分散が等しいというより強い仮定を置きます。",
              enabled: true,
            },
          ],
      contrastIntent: "all_pairs",
      commonAlternative: null,
      nByCondition: effectiveNByCondition,
      missingCount,
      notPlannedCount,
      request,
      ...inputDiagnosticProperties,
    };
  }

  const controlAvailable = conditions.some(({ id }) => id === input.draft.controlConditionId);
  const requestedIntent = input.contrastIntent ?? "all_pairs";
  const contrastIntent: ContrastIntent =
    requestedIntent === "control_vs_many" && !controlAvailable ? "all_pairs" : requestedIntent;
  const recommendedMethod: StatisticalMethod =
    contrastIntent === "all_pairs" ? "welch_anova" : "one_way_anova";
  const activeConditionIds = new Set(conditions.map(({ id }) => id));
  const plannedContrastConditionIds = (input.plannedContrastConditionIds ?? [])
    .filter(
      ([firstId, secondId]) =>
        firstId !== secondId && activeConditionIds.has(firstId) && activeConditionIds.has(secondId),
    )
    .map(([firstId, secondId]) => [firstId, secondId] as [string, string]);
  const supportedMethods: StatisticalMethod[] = ["welch_anova", "one_way_anova", "kruskal_wallis"];
  let method =
    input.selectedMethod && supportedMethods.includes(input.selectedMethod)
      ? input.selectedMethod
      : recommendedMethod;
  if (contrastIntent === "control_vs_many") method = "one_way_anova";
  if (contrastIntent === "planned_comparisons") method = "one_way_anova";
  if (method === "welch_anova" && contrastIntent !== "all_pairs") method = "one_way_anova";
  if (
    method === "kruskal_wallis" &&
    contrastIntent !== "omnibus_only" &&
    contrastIntent !== "all_pairs"
  )
    method = "one_way_anova";
  const effectiveIntent: ContrastIntent = contrastIntent;
  const multiplicityMethod =
    method === "welch_anova"
      ? "games_howell_all_pairs"
      : method === "kruskal_wallis"
        ? effectiveIntent === "all_pairs"
          ? "dunn_holm_all_pairs"
          : null
        : effectiveIntent === "control_vs_many"
          ? "dunnett_control_vs_many"
          : effectiveIntent === "planned_comparisons"
            ? "holm_planned_comparisons"
            : effectiveIntent === "omnibus_only"
              ? null
              : "tukey_hsd_all_pairs";
  const request = AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.2.0",
    requestId: "request.draft.graph",
    projectId: "project.draft",
    analysisId: "analysis.draft.graph",
    templateId: "D03",
    templateVersion: "0.1.0",
    method,
    conditionIds: conditions.map(({ id }) => id),
    controlConditionId: conditions.some(({ id }) => id === input.draft.controlConditionId)
      ? input.draft.controlConditionId
      : undefined,
    contrastIntent: effectiveIntent,
    plannedContrastConditionIds:
      effectiveIntent === "planned_comparisons" ? plannedContrastConditionIds : undefined,
    primaryContrastConditionIds: [conditions[0].id, conditions[1].id],
    observations: requestObservations,
    options: {
      alternative: "two_sided",
      confidenceLevel: 0.95,
      multiplicityMethod,
    },
  });
  return {
    state: "ready",
    title:
      effectiveIntent === "planned_comparisons"
        ? "事前指定した条件ペアの比較を推奨"
        : effectiveIntent === "control_vs_many"
          ? "対照群との比較を推奨"
          : effectiveIntent === "omnibus_only"
            ? "一元配置分散分析の全体比較を推奨"
            : "Welchの分散分析を推奨",
    reason:
      effectiveIntent === "planned_comparisons"
        ? `独立した${conditions.length}条件のうち、事前に選んだ${plannedContrastConditionIds.length}ペアだけを比較し、p値をHolm法で調整します（${nText}）。`
        : effectiveIntent === "control_vs_many"
          ? `明示した対照群と各処置をDunnett法で比較します（${nText}）。`
          : effectiveIntent === "omnibus_only"
            ? `独立した${conditions.length}条件について、条件間ペアを追加せず全体差だけを評価します（${nText}）。`
            : `独立した${conditions.length}条件を比較します（${nText}）。全体比較後の条件間比較にはGames–Howell法を使い、多重比較を扱います。${input.draft.controlConditionId ? "明示した対照群との比較を結果内で識別できます。" : "対照群は未指定です。"}`,
    method,
    recommendedMethod,
    methodChoices: [
      {
        method: "welch_anova",
        level: "recommended",
        label: "Welchの分散分析 + Games–Howell",
        explanation: "等分散を前提にせず、全条件の組を調整済みp値で比較します。",
        enabled: effectiveIntent === "all_pairs",
        ...(effectiveIntent === "all_pairs"
          ? {}
          : {
              unavailableReason:
                effectiveIntent === "planned_comparisons"
                  ? "現在の事前ペア比較は、等分散を仮定する一元配置モデルで実行します。"
                  : effectiveIntent === "omnibus_only"
                    ? "Welch + Games–Howellは全条件ペアを出力するため、全体差のみとは組み合わせません。"
                    : "対照対多のDunnett選択とは組み合わせません。",
            }),
      },
      {
        method: "one_way_anova",
        level: "alternative",
        label:
          effectiveIntent === "control_vs_many"
            ? "通常の一元配置分散分析 + Dunnett"
            : effectiveIntent === "planned_comparisons"
              ? "通常の一元配置分散分析 + 事前比較（Holm補正）"
              : effectiveIntent === "omnibus_only"
                ? "通常の一元配置分散分析（全体比較のみ）"
                : "通常の一元配置分散分析 + Tukey",
        explanation:
          effectiveIntent === "control_vs_many"
            ? "明示した対照と各処置を、Dunnett法で調整して比較します。"
            : effectiveIntent === "planned_comparisons"
              ? "研究者が事前に選んだ条件ペアだけを、等分散を仮定する比較とHolm法で調整します。"
              : effectiveIntent === "omnibus_only"
                ? "等分散を仮定し、全体差だけを評価します。"
                : "等分散を仮定し、全条件の組をTukey法で比較します。",
        enabled: true,
      },
      {
        method: "kruskal_wallis",
        level: "alternative",
        label:
          effectiveIntent === "all_pairs"
            ? "Kruskal–Wallis + Dunn（Holm補正）"
            : "Kruskal–Wallis検定（全体比較のみ）",
        explanation:
          effectiveIntent === "all_pairs"
            ? "順位に基づく全体検定後、全条件ペアをDunn法で比較しHolm補正します。"
            : "順位に基づく全体検定です。比較目的として全体差のみを選んだ場合に使います。",
        enabled: effectiveIntent === "omnibus_only" || effectiveIntent === "all_pairs",
        ...(effectiveIntent === "omnibus_only" || effectiveIntent === "all_pairs"
          ? {}
          : {
              unavailableReason: "対照対多または事前ペアには対応するパラメトリック比較を選びます。",
            }),
      },
    ],
    contrastIntent: effectiveIntent,
    commonAlternative: null,
    nByCondition: effectiveNByCondition,
    missingCount,
    notPlannedCount,
    request,
    ...inputDiagnosticProperties,
  };
}
