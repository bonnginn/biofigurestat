import type { ExperimentSetDraft } from "./experimentDraft";

export type DraftAnalysisCorrection = Readonly<{
  code:
    | "MISSING_EXPERIMENTAL_UNIT_ID"
    | "DUPLICATE_EXPERIMENTAL_UNIT_ID"
    | "INCOMPLETE_MATCHED_SET"
    | "PAIRED_DIFFERENCES_HAVE_ZERO_VARIANCE"
    | "NESTED_CONDITION_SOURCE_RELATIONSHIP_UNCONFIRMED";
  target: "data_identity" | "data_values" | "experiment_structure";
  title: string;
  message: string;
  actionLabel: string;
  suggestedMethod?: "wilcoxon_signed_rank";
  experimentIds: readonly string[];
  focusExperimentId: string | null;
}>;

export type IncompleteMatchedSetDetail = Readonly<{
  pairId: string;
  experimentId: string;
  experimentLabel: string;
  missingConditions: readonly Readonly<{
    conditionId: string;
    label: string;
  }>[];
}>;

export type DraftAnalysisInputDiagnostic = Readonly<{
  code: "INCOMPLETE_MATCHED_SET";
  title: string;
  message: string;
  incompleteMatchedSets: readonly IncompleteMatchedSetDetail[];
  correction?: DraftAnalysisCorrection;
}>;

export type NestedIndependentSourceContext = Readonly<{
  unitLabel: string;
  nestedObservationLabel: string;
}>;

/**
 * Nested observations establish the parent biological n, but they do not by
 * themselves prove that parent units in different conditions came from
 * independent source preparations. That relationship needs one targeted
 * confirmation before running an independent-groups model.
 */
export function nestedIndependentSourceContext(input: {
  draft: ExperimentSetDraft;
  readoutId: string;
}): NestedIndependentSourceContext | null {
  if (input.draft.conditionAssignment.kind !== "independent") return null;
  const readout = input.draft.readouts.find(({ id }) => id === input.readoutId);
  if (readout?.nestedInputMode !== "nested_observations") return null;
  const contract = input.draft.adaptiveInput?.contract;
  if (!contract) return null;
  const contractReadout = contract.readouts.find(({ key }) => `outcome.${key}` === input.readoutId);
  if (!contractReadout || contractReadout.observationLevelKey === contract.experimentalUnitLevelKey)
    return null;
  const nestedObservationLabel =
    contract.unitLevels.find(({ key }) => key === contractReadout.observationLevelKey)?.label ??
    "下位の観測";
  return {
    unitLabel: input.draft.conditionAssignment.unitLabel,
    nestedObservationLabel,
  };
}

export function nestedIndependentSourceCorrection(
  context: NestedIndependentSourceContext,
): DraftAnalysisCorrection {
  return {
    code: "NESTED_CONDITION_SOURCE_RELATIONSHIP_UNCONFIRMED",
    target: "experiment_structure",
    title: "条件間のrun/source preparationを確認してください",
    message: `各${context.unitLabel}内の${context.nestedObservationLabel}は親${context.unitLabel}へ集約します。ただし、条件別${context.unitLabel}が同じrun/source preparationから分けられた組か、別々の独立材料かは下位観測だけから決められません。単に同日という理由ではpairにしません。`,
    actionLabel: "共通材料・実験回を確認",
    experimentIds: [],
    focusExperimentId: null,
  };
}

/**
 * Describe every incomplete matched set by its researcher-facing stable ID.
 * The caller supplies only finite analysis observations, so a condition absent
 * here can remain untouched in the draft while being excluded from a complete-
 * set request. No row is reclassified as independent.
 */
export function incompleteMatchedSetDiagnostic(input: {
  draft: ExperimentSetDraft;
  conditions: readonly Readonly<{ id: string; label: string }>[];
  observations: readonly Readonly<{
    conditionId: string;
    sourceExperimentId: string;
  }>[];
}): DraftAnalysisInputDiagnostic | null {
  if (input.draft.conditionAssignment.kind !== "matched" || input.conditions.length < 2) {
    return null;
  }

  const observedConditionsByExperiment = new Map<string, Set<string>>();
  input.observations.forEach(({ conditionId, sourceExperimentId }) => {
    const observed = observedConditionsByExperiment.get(sourceExperimentId) ?? new Set<string>();
    observed.add(conditionId);
    observedConditionsByExperiment.set(sourceExperimentId, observed);
  });

  const incompleteMatchedSets = input.draft.experiments.flatMap((experiment) => {
    const observed = observedConditionsByExperiment.get(experiment.id) ?? new Set<string>();
    const missingConditions = input.conditions
      .filter(({ id }) => !observed.has(id))
      .map(({ id, label }) => ({ conditionId: id, label }));
    if (missingConditions.length === 0) return [];
    const declaredIdentity =
      experiment.stableUnitId === undefined ? experiment.id.trim() : experiment.stableUnitId.trim();
    return [
      {
        pairId: declaredIdentity || `${experiment.label}（ID未入力）`,
        experimentId: experiment.id,
        experimentLabel: experiment.label,
        missingConditions,
      },
    ];
  });
  if (incompleteMatchedSets.length === 0) return null;

  const experimentIds = incompleteMatchedSets.map(({ experimentId }) => experimentId);
  return {
    code: "INCOMPLETE_MATCHED_SET",
    title: `対応がそろっていない組が${incompleteMatchedSets.length}組あります`,
    message:
      "stable unit / pair IDごとに、解析値がそろっていない条件を示します。完全な組だけを対応解析に使い、不完全な組の入力値と実験設計は保持します。独立群には読み替えません。",
    incompleteMatchedSets,
    correction: {
      code: "INCOMPLETE_MATCHED_SET",
      target: "data_values",
      title: "対応データの不足条件を確認してください",
      message:
        "表の値は保持したままです。欠けている条件の値を追加するか、欠測のまま完全な組だけを解析するかを確認できます。対応関係は変更しません。",
      actionLabel: "データで欠けた対応値を確認",
      experimentIds,
      focusExperimentId: experimentIds[0] ?? null,
    },
  };
}

/**
 * Validate the researcher-declared identity before shaping an engine request.
 * A duplicate row must never be silently discarded as an "incomplete pair" or
 * promoted to another independent biological replicate.
 */
export function draftUnitIdentityCorrection(input: {
  draft: ExperimentSetDraft;
  contributingExperimentIds: ReadonlySet<string>;
}): DraftAnalysisCorrection | null {
  const contributing = input.draft.experiments.filter(({ id }) =>
    input.contributingExperimentIds.has(id),
  );
  const identityFor = ({ id, stableUnitId }: (typeof contributing)[number]) =>
    stableUnitId === undefined ? id.trim() : stableUnitId.trim();
  const missing = contributing.filter((experiment) => !identityFor(experiment));
  const sharedSource =
    input.draft.conditionAssignment.matchedTopology?.kind ===
    "distinct_condition_units_shared_source";
  if (missing.length > 0) {
    const labels = missing.map(({ label }) => label).join("、");
    return {
      code: "MISSING_EXPERIMENTAL_UNIT_ID",
      target: sharedSource ? "experiment_structure" : "data_identity",
      title: "実験単位IDが空欄です",
      message: `${labels}のIDが空欄です。どの値が同じ対象・同じ由来かを行順から推測せず、解析requestを作成しません。測定値は保持されています。`,
      actionLabel: sharedSource ? "実験の組み立てで共有IDを確認" : "データでIDを入力",
      experimentIds: missing.map(({ id }) => id),
      focusExperimentId: missing[0]?.id ?? null,
    };
  }

  const byIdentity = new Map<string, typeof contributing>();
  contributing.forEach((experiment) => {
    const identity = identityFor(experiment);
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), experiment]);
  });
  const duplicated = [...byIdentity.entries()].find(([, experiments]) => experiments.length > 1);
  if (!duplicated) return null;
  const [identity, experiments] = duplicated;
  const labels = experiments.map(({ label }) => label).join("、");
  const matched = input.draft.conditionAssignment.kind === "matched";
  return {
    code: "DUPLICATE_EXPERIMENTAL_UNIT_ID",
    target: sharedSource ? "experiment_structure" : "data_identity",
    title: "実験単位IDが重複しています",
    message: `ID「${identity}」が${labels}で重複しています。${
      matched
        ? "同じ条件の値が1つの対応IDへ複数入り、完全なpairを一意に作れません。"
        : "同じ条件で1つの実験単位が複数回数えられるため、独立群の解析requestは無効になります。"
    } 別の対象を表す行には別のIDを入力してください。測定値は保持されています。`,
    actionLabel: sharedSource ? "実験の組み立てで共有IDを確認" : "データで重複IDを修正",
    experimentIds: experiments.map(({ id }) => id),
    focusExperimentId: experiments[1]?.id ?? experiments[0]?.id ?? null,
  };
}

export function pairedDifferenceCorrection(input: {
  draft: ExperimentSetDraft;
  conditionIds: readonly [string, string];
  observations: readonly Readonly<{
    conditionId: string;
    value: number;
    pairId?: string;
    sourceExperimentId: string;
  }>[];
}): DraftAnalysisCorrection | null {
  const [firstConditionId, secondConditionId] = input.conditionIds;
  const byPair = new Map<string, { values: Map<string, number>; experimentIds: Set<string> }>();
  input.observations.forEach((observation) => {
    if (!observation.pairId) return;
    const pair = byPair.get(observation.pairId) ?? {
      values: new Map<string, number>(),
      experimentIds: new Set<string>(),
    };
    pair.values.set(observation.conditionId, observation.value);
    pair.experimentIds.add(observation.sourceExperimentId);
    byPair.set(observation.pairId, pair);
  });
  const complete = [...byPair.values()].filter(
    ({ values }) => values.has(firstConditionId) && values.has(secondConditionId),
  );
  if (complete.length < 2) return null;
  const differences = complete.map(
    ({ values }) => values.get(firstConditionId)! - values.get(secondConditionId)!,
  );
  const firstDifference = differences[0]!;
  if (!differences.every((difference) => difference === firstDifference)) return null;
  const conditionLabel = (conditionId: string) =>
    input.draft.conditions.find(({ id }) => id === conditionId)?.label ?? conditionId;
  const experimentIds = [...new Set(complete.flatMap(({ experimentIds: ids }) => [...ids]))];
  return {
    code: "PAIRED_DIFFERENCES_HAVE_ZERO_VARIANCE",
    target: "data_values",
    title: "すべての対応差が同じため、対応のあるt検定を計算できません",
    message: `${conditionLabel(firstConditionId)} − ${conditionLabel(
      secondConditionId,
    )} の差が全${complete.length}組で ${firstDifference} です。差のSDと標準誤差が0になるため、t値・信頼区間を有限値として定義できません。入力値を確認してください。値が正しい場合も、別の値へ変更したり独立群へ読み替えたりはしません。`,
    actionLabel: "データで対応値を確認",
    ...(firstDifference === 0 ? {} : { suggestedMethod: "wilcoxon_signed_rank" as const }),
    experimentIds,
    focusExperimentId: experimentIds[0] ?? null,
  };
}
