import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";

export type AnalysisValidationFeedback = Readonly<{
  title: string;
  message: string;
  nextAction: string;
}>;

const feedbackRules: readonly Readonly<{
  pattern: RegExp;
  feedback: AnalysisValidationFeedback;
  feedbackEn: AnalysisValidationFeedback;
}>[] = [
  {
    pattern: /Each independent D01 unit can contribute only one analyzed value/i,
    feedback: {
      title: "独立群の実験単位IDが重複しています",
      message:
        "同じ実験単位IDが、独立群の解析request内で複数の値に使われています。cellやROIの行数をbiological nへ読み替えず、親の実験単位を1回だけ数えます。",
      nextAction:
        "データ表の実験単位ID（入れ子データならDish IDなど）と親子関係を確認してください。測定値は保持されています。",
    },
    feedbackEn: {
      title: "An experimental-unit ID is duplicated in independent groups",
      message:
        "The same experimental-unit ID is attached to multiple values in an independent-group request. Cell or ROI row counts are not promoted to biological n; each parent experimental unit is counted once.",
      nextAction:
        "Review experimental-unit IDs and parent-child relationships in Data, such as Dish ID for nested data. Measurements are retained.",
    },
  },
  {
    pattern: /Each D02 pair requires exactly one analyzed value per condition/i,
    feedback: {
      title: "対応IDに同じ条件の値が複数あります",
      message:
        "1つの対応IDに、同じ条件の解析値が複数入っているため、1対1のpairを作れません。行順で片方を選ぶ処理は行っていません。",
      nextAction:
        "データ表で対応IDと条件を確認し、別の実験単位なら別IDへ修正してください。測定値は保持されています。",
    },
    feedbackEn: {
      title: "A matched ID has multiple values for the same condition",
      message:
        "A matched ID contains more than one analyzed value for a condition, so a one-to-one pair cannot be formed. The app does not choose one by row order.",
      nextAction:
        "Review matched IDs and conditions in Data. If they are different experimental units, assign different IDs. Measurements are retained.",
    },
  },
  {
    pattern: /requires both conditions for every matched unit/i,
    feedback: {
      title: "対応IDの片方の条件が不足しています",
      message:
        "完全な対応組に必要な2条件のうち、片方の解析値がない対応IDがあります。別の行を自動的に組み合わせてはいません。",
      nextAction: "対応ID、条件、欠測区分をデータ表で確認してください。入力値は保持されています。",
    },
    feedbackEn: {
      title: "A matched ID is missing one condition",
      message:
        "A matched ID lacks an analyzed value for one of the two required conditions. The app has not paired it with another row automatically.",
      nextAction:
        "Review matched IDs, conditions, and missingness in Data. Entered values are retained.",
    },
  },
  {
    pattern: /requires at least two complete matched units/i,
    feedback: {
      title: "完全な対応組が不足しています",
      message: "両条件の値がそろった対応組が2組未満のため、対応解析を計算できません。",
      nextAction: "対応IDと欠測を確認してください。独立群へ自動変換はしません。",
    },
    feedbackEn: {
      title: "There are not enough complete matched pairs",
      message: "Fewer than two matched pairs have analyzed values for both conditions.",
      nextAction:
        "Review matched IDs and missingness. The design will not be converted to independent groups automatically.",
    },
  },
  {
    pattern: /Paired t-test is undefined when every paired difference is identical/i,
    feedback: {
      title: "すべての対応差が同じため、対応のあるt検定を計算できません",
      message:
        "対応差のSDと標準誤差が0になり、t値と信頼区間を有限値として定義できません。これはエンジン停止ではなく、入力値から決まる統計的な制約です。",
      nextAction:
        "データ表で対応値を確認してください。値が正しければ、提示された検証済み代替法を明示的に選べます。",
    },
    feedbackEn: {
      title: "The paired t-test is undefined because every paired difference is identical",
      message:
        "The SD and standard error of the paired differences are zero, so a finite t statistic and confidence interval cannot be defined. This is a statistical constraint determined by the input, not an engine failure.",
      nextAction:
        "Review the matched values in Data. If they are correct, you may explicitly select the offered validated alternative.",
    },
  },
  {
    pattern: /Welch t-test is undefined when both conditions have zero variance/i,
    feedback: {
      title: "両条件の群内分散が0です",
      message: "各条件のすべての解析値が同じで、Welch検定に必要な標準誤差を定義できません。",
      nextAction: "実験単位ごとの値と、入れ子測定の集約単位をデータ表で確認してください。",
    },
    feedbackEn: {
      title: "Within-group variance is zero in both conditions",
      message:
        "Every analyzed value within each condition is identical, so the standard error required for Welch's test cannot be defined.",
      nextAction:
        "Review values per experimental unit and the aggregation unit for nested measurements in Data.",
    },
  },
  {
    pattern: /requires at least two independent units per condition/i,
    feedback: {
      title: "独立した実験単位が不足しています",
      message: "少なくとも一方の条件で、解析可能な独立実験単位が2個未満です。",
      nextAction:
        "条件別の実験単位ID、欠測、入れ子データの親単位を確認してください。cell数をbiological nへ昇格しません。",
    },
    feedbackEn: {
      title: "There are not enough independent experimental units",
      message:
        "At least one condition has fewer than two analyzable independent experimental units.",
      nextAction:
        "Review experimental-unit IDs, missingness, and parent units for nested data. Cell counts are not promoted to biological n.",
    },
  },
];

export function analysisValidationFeedback(
  result: AnalysisEngineResult,
  locale: "ja" | "en" = "ja",
): AnalysisValidationFeedback | null {
  if (result.status === "ok") return null;
  const messages = [...result.diagnostics, ...result.warnings].map(({ message }) => message);
  for (const rule of feedbackRules) {
    if (messages.some((message) => rule.pattern.test(message))) {
      return locale === "en" ? rule.feedbackEn : rule.feedback;
    }
  }
  return null;
}
