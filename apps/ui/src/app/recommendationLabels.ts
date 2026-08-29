import type { AnalysisRecommendation } from "@lsaa/analysis-contracts";

const METHOD_LABELS: Record<AnalysisRecommendation["recommendedMethod"], string> = {
  welch_t: "Welchの2標本t検定",
  student_t: "Studentの2標本t検定",
  mann_whitney: "Mann–WhitneyのU検定",
  paired_t: "対応のあるt検定",
  wilcoxon_signed_rank: "Wilcoxonの符号付順位検定",
  one_way_anova: "一元配置分散分析（ANOVA）",
  welch_anova: "Welchの分散分析",
  kruskal_wallis: "Kruskal–Wallis検定",
  repeated_measures_anova: "反復測定分散分析",
  friedman: "Friedman検定",
  two_way_anova: "二元配置分散分析",
  mixed_anova: "条件×反復軸の反復測定分散分析",
  mixed_model: "混合効果モデル",
  pearson: "Pearsonの相関",
  spearman: "Spearmanの順位相関",
  one_sample_t: "one-sample t-test",
  log_rank: "log-rank検定",
  fisher_exact: "Fisherの正確確率検定",
  pearson_chi_square: "Pearsonのカイ二乗検定",
  mcnemar_exact: "正確McNemar検定",
  simple_linear_regression: "単回帰（OLS）",
  nonlinear_xy_fit: "非線形XYフィッティング",
};

export function methodLabel(method: AnalysisRecommendation["recommendedMethod"]) {
  return METHOD_LABELS[method];
}

export function templateLabel(templateId: AnalysisRecommendation["templateId"]) {
  if (templateId === "D01") return "D01 · 独立群の比較";
  if (templateId === "D02") return "D02 · 対応のある比較";
  if (templateId === "D03") return "D03 · 3条件以上の独立群";
  if (templateId === "D04") return "D04 · 3条件以上の繰り返し測定";
  if (templateId === "D05") return "D05 · 2因子の要因配置";
  if (templateId === "D06") return "D06 · 条件×反復軸の反復測定";
  if (templateId === "D07") return "D07 · 条件×順序軸の独立測定";
  if (templateId === "D09") return "D09 · 2つの測定値の相関";
  if (templateId === "D11") return "D11 · 生存・time-to-event";
  if (templateId === "D12") return "D12 · 単一コホートと基準値";
  if (templateId === "D13") return "D13 · 条件×反復カテゴリ状態";
  if (templateId === "D14") return "D14 · カテゴリcount";
  if (templateId === "D15") return "D15 · 反復ノンパラメトリック";
  if (templateId === "D16") return "D16 · 単回帰";
  if (templateId === "D17") return "D17 · 非線形XYフィッティング";
  return `${templateId} · 解析テンプレート`;
}

export function recommendationExplanation(recommendation: AnalysisRecommendation) {
  if (recommendation.reasonCode === "two_independent_condition_groups") {
    return "2つの条件は別々の実験単位に割り当てられており、明示的な対応付けやブロックはありません。";
  }
  if (recommendation.reasonCode === "same_or_matched_unit_in_both_conditions") {
    return "各対応単位から、両条件に1つずつ値が得られます。";
  }
  if (recommendation.reasonCode === "explicit_complete_block_correspondence") {
    return "実験計画で完全なブロック単位の対応が明示されています。";
  }
  if (recommendation.reasonCode === "three_or_more_independent_groups_one_factor") {
    return "3つ以上の条件を、1つの因子の独立した実験単位へ割り当てています。全群比較後に多重性を調整したペア比較を行います。";
  }
  if (recommendation.reasonCode === "control_vs_many_independent_groups_one_factor") {
    return "3つ以上の独立群について、明示した対照群と各群の比較を1つの比較族として評価します。";
  }
  if (recommendation.reasonCode === "planned_comparisons_independent_groups_one_factor") {
    return "3つ以上の独立群のうち、事前に指定した条件ペアだけを1つの比較族として評価します。";
  }
  if (recommendation.reasonCode === "omnibus_only_independent_groups_one_factor") {
    return "3つ以上の独立群に全体差があるかを評価し、指定されていない条件間比較は追加しません。";
  }
  if (recommendation.reasonCode === "three_or_more_complete_matched_groups") {
    return "同じ対応単位からすべての条件に1つずつ値が得られます。全体比較後に対応のあるペア比較の多重性を調整します。";
  }
  if (recommendation.reasonCode === "complete_two_factor_independent_design") {
    return "2つの因子の全組み合わせを、各条件で独立した実験単位に割り当てています。交互作用を先に確認し、条件間の比較は多重性を調整します。";
  }
  if (recommendation.reasonCode === "balanced_condition_by_time_repeated_design") {
    return "条件間では独立した実験単位を用い、各単位を指定された反復軸内で追跡します。条件×反復軸の交互作用を最初に評価します。";
  }
  if (recommendation.reasonCode === "balanced_independent_condition_by_axis_design") {
    return "順序軸の各水準で別々の実験単位を用い、条件、順序軸、両者の交互作用を評価します。反復測定としては扱いません。";
  }
  if (recommendation.reasonCode === "planned_comparisons_across_independent_condition_cells") {
    return "独立した条件セルのうち、事前に指定した比較だけを評価します。因子の主効果や交互作用へ読み替えません。";
  }
  if (recommendation.reasonCode === "two_complete_continuous_variables_linear_question") {
    return "同じ実験単位からXとYを1つずつ測定し、直線的な関係を評価します。各単位を対応付けた散布図として扱います。";
  }
  if (recommendation.reasonCode === "two_complete_variables_monotonic_or_ranked_question") {
    return "同じ実験単位からXとYを1つずつ測定し、単調または順位の関係を評価します。各単位を対応付けた散布図として扱います。";
  }
  return "実験デザインの構造に基づいて推奨されています。";
}

export function statisticalNLabel(recommendation: AnalysisRecommendation) {
  if (recommendation.reasonCode === "two_independent_condition_groups") {
    return "独立した実験単位の数";
  }
  if (recommendation.reasonCode === "same_or_matched_unit_in_both_conditions") {
    return "対応のある独立単位の数";
  }
  if (recommendation.reasonCode === "three_or_more_independent_groups_one_factor") {
    return "各条件の独立した実験単位の数";
  }
  if (
    recommendation.reasonCode === "control_vs_many_independent_groups_one_factor" ||
    recommendation.reasonCode === "planned_comparisons_independent_groups_one_factor" ||
    recommendation.reasonCode === "omnibus_only_independent_groups_one_factor"
  ) {
    return "各条件の独立した実験単位の数";
  }
  if (recommendation.reasonCode === "three_or_more_complete_matched_groups") {
    return "すべての条件が揃った対応単位の数";
  }
  if (recommendation.reasonCode === "complete_two_factor_independent_design") {
    return "各組み合わせ条件の独立した実験単位の数";
  }
  if (recommendation.reasonCode === "balanced_independent_condition_by_axis_design") {
    return "各条件×順序軸セルの独立した実験単位の数";
  }
  if (recommendation.reasonCode === "planned_comparisons_across_independent_condition_cells") {
    return "各条件セルの独立した実験単位の数";
  }
  if (
    recommendation.reasonCode === "two_complete_continuous_variables_linear_question" ||
    recommendation.reasonCode === "two_complete_variables_monotonic_or_ranked_question"
  ) {
    return "XとYの両方が揃った同じ実験単位の数";
  }
  return "独立ブロックの数";
}
