import type { AppLocale } from "../../app/appLocale";

export type MatchedRelationship =
  | Readonly<{ kind: "same_entity"; unitLabel: string }>
  | Readonly<{ kind: "shared_source"; unitLabel: string; sourceLabel: string }>;

export type StatisticsConditionOption = Readonly<{ id: string; label: string }>;

export function formatGraphStatisticNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 4 }).format(value);
}

export function formatGraphStatisticP(value: number): string {
  return value < 0.0001 ? value.toExponential(2) : formatGraphStatisticNumber(value);
}

const pairwiseComparisonFamilies = [
  "games_howell",
  "tukey_hsd",
  "dunnett",
  "planned_holm",
  "dunn_holm",
  "holm_welch",
  "holm_paired",
  "holm_wilcoxon",
] as const;

export function isPairwiseComparisonName(name: string): boolean {
  return pairwiseComparisonFamilies.some((family) => name.startsWith(`${family}:`));
}

export function comparisonDisplayLabel(
  name: string,
  conditionOptions: readonly StatisticsConditionOption[],
): string | null {
  const family = pairwiseComparisonFamilies.find((candidate) => name.startsWith(`${candidate}:`));
  if (!family) return null;
  const matches: Array<Readonly<{ firstIndex: number; secondIndex: number }>> = [];
  conditionOptions.forEach((first, firstIndex) => {
    conditionOptions.forEach((second, secondIndex) => {
      if (firstIndex === secondIndex) return;
      if (name === `${family}:${first.id}:${second.id}`) {
        matches.push({ firstIndex, secondIndex });
      }
    });
  });
  if (matches.length !== 1) return null;

  const match = matches[0]!;
  const displayLabel = (index: number): string | null => {
    const condition = conditionOptions[index];
    const label = condition?.label.trim();
    if (!label) return null;
    const duplicateLabelCount = conditionOptions.filter(
      (candidate) => candidate.label.trim() === label,
    ).length;
    return duplicateLabelCount > 1 ? `${label}（条件 ${index + 1}）` : label;
  };
  const firstLabel = displayLabel(match.firstIndex);
  const secondLabel = displayLabel(match.secondIndex);
  return firstLabel && secondLabel ? `${firstLabel} vs ${secondLabel}` : null;
}

export function estimateDisplayLabel(
  name: string,
  conditionOptions: readonly StatisticsConditionOption[],
): string {
  for (const first of conditionOptions) {
    for (const second of conditionOptions) {
      if (first.id === second.id) continue;
      if (name === `${first.id}_minus_${second.id}`) {
        return `${first.label} − ${second.label}`;
      }
    }
  }
  return name;
}

export const ENGLISH_METHOD_LABELS: Readonly<Record<string, string>> = {
  welch_tost: "Welch TOST for equivalence",
  paired_tost: "Paired TOST for equivalence",
  welch_t: "Welch's t-test",
  student_t: "Student's t-test",
  paired_t: "Paired t-test",
  mann_whitney: "Mann–Whitney test",
  wilcoxon_signed_rank: "Wilcoxon signed-rank test",
  welch_anova: "Welch's ANOVA",
  one_way_anova: "Ordinary one-way ANOVA",
  kruskal_wallis: "Kruskal–Wallis test",
  pearson: "Pearson correlation",
  spearman: "Spearman rank correlation",
};

export function diagnosticLabel(
  code: string,
  matchedRelationship?: MatchedRelationship,
  locale: AppLocale = "ja",
): string {
  if (locale === "en") {
    if (code === "assumptions_not_fully_evaluated")
      return "Normality is not established by a significance test in a small sample. Review the experimental-unit distribution and design as well.";
    if (code === "variance_robust_multi_group_default")
      return "This multi-group comparison does not assume equal variances. Independence of experimental units is still required.";
    if (code === "very_small_biological_n")
      return "At least one condition has fewer than three experimental units. Estimates and assumption checks are highly uncertain.";
    if (code === "equal_variance_assumption_selected")
      return "The selected method assumes equal variances. This stronger assumption will be recorded in the result and Methods.";
    if (code === "rank_distribution_test_semantics")
      return "Mann–Whitney evaluates ranks and distributional ordering. Without additional assumptions, do not interpret it as only a test of medians.";
    if (code === "paired_rank_test_semantics")
      return matchedRelationship?.kind === "shared_source"
        ? `Wilcoxon evaluates the signs and ranks of differences between condition-specific ${matchedRelationship.unitLabel}s explicitly matched by a shared ${matchedRelationship.sourceLabel} ID. The condition-specific units remain separate experimental units.`
        : "Wilcoxon evaluates the signs and ranks of within-unit differences matched by stable IDs.";
    if (code === "paired_difference_distribution")
      return "The analysis calculates the between-condition difference for each matched experimental unit and evaluates the distribution of those differences. It does not test the two original condition distributions as independent groups.";
    if (code === "paired_tost_complete_pairs")
      return "Paired TOST evaluates second-condition minus first-condition differences from complete stable-ID pairs.";
    if (code === "paired_tost_incomplete_pairs_excluded")
      return "Incomplete pairs were retained in Data and Graph but excluded from paired TOST; their IDs are reported with the equivalence result.";
    if (code === "equivalence_margin_prespecified")
      return "The equivalence bounds came from the saved prespecified plan and were not estimated from these observations.";
    if (code === "omnibus_only_no_posthoc")
      return "Only the overall difference was evaluated. Unrequested pairwise comparisons were not generated.";
    if (code === "planned_pairwise_no_simultaneous_ci")
      return "Only prespecified condition pairs were adjusted with Holm's method. Simultaneous confidence intervals are not shown for this option.";
  }
  if (code === "assumptions_not_fully_evaluated") {
    return "少数例の有意差検定だけで正規性を断定していません。実験単位の分布と実験設計も確認してください。";
  }
  if (code === "variance_robust_multi_group_default") {
    return "等分散を前提にしない多群比較です。実験単位同士が独立していることは別途必要です。";
  }
  if (code === "very_small_biological_n") {
    return "一部の条件で実験単位が3未満です。推定値と前提の評価には大きな不確実性があります。";
  }
  if (code === "equal_variance_assumption_selected") {
    return "等分散を仮定する方法を選択しています。このより強い仮定を結果とMethodsに記録します。";
  }
  if (code === "rank_distribution_test_semantics") {
    return "Mann–Whitneyは順位と分布の並び方を評価します。追加仮定なしに単なる中央値の検定とは解釈しません。";
  }
  if (code === "paired_rank_test_semantics") {
    if (matchedRelationship?.kind === "shared_source") {
      return `Wilcoxonは、共有IDで対応した同じ${matchedRelationship.sourceLabel}由来の条件別${matchedRelationship.unitLabel}の差の符号と順位を評価します。条件別${matchedRelationship.unitLabel}は別の実験単位です。`;
    }
    return "Wilcoxonは、安定IDで対応した各実験単位内の差の符号と順位を評価します。";
  }
  if (code === "paired_difference_distribution") {
    return "対応する各実験単位について条件間の差を計算し、その差の分布を評価します。元の2条件それぞれの分布を独立群として検定するものではありません。";
  }
  if (code === "paired_tost_complete_pairs") {
    return "安定IDでそろった完全な対応組について、第2条件−第1条件の差を対応のあるTOSTで評価しました。";
  }
  if (code === "paired_tost_incomplete_pairs_excluded") {
    return "不完全な対応組はDataとGraphに保持し、対応のあるTOSTから除外しました。除外IDは同等性解析結果に表示します。";
  }
  if (code === "equivalence_margin_prespecified") {
    return "同等性の上下限は保存済みの事前計画から使用し、観測データから推定していません。";
  }
  if (code === "omnibus_only_no_posthoc") {
    return "全体差のみを評価しました。未検証の条件間比較は自動生成していません。";
  }
  if (code === "planned_pairwise_no_simultaneous_ci") {
    return "事前に選んだ条件ペアだけをHolm法で補正しました。この方式では同時信頼区間を表示しません。";
  }
  return code;
}
