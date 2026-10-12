import type { AnalysisEngineRequest } from "@lsaa/analysis-contracts";

/** Describes only the existing, executed D03 Dunnett contract. */
export function controlComparisonInferenceText(
  request: AnalysisEngineRequest | null,
): string | null {
  if (
    request?.protocolVersion !== "0.2.0" ||
    request.method !== "one_way_anova" ||
    request.contrastIntent !== "control_vs_many" ||
    request.options.multiplicityMethod !== "dunnett_control_vs_many" ||
    request.options.alternative !== "two_sided" ||
    !request.controlConditionId ||
    !request.conditionIds.includes(request.controlConditionId)
  )
    return null;
  const confidencePercent = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 10 }).format(
    request.options.confidenceLevel * 100,
  );
  return `対照比較：各条件 − 明示した対照（${request.controlConditionId}）の平均差。正の値は各条件の平均が対照より大きいことを表します。Dunnettの${confidencePercent}%同時信頼区間と調整済みp値は、この実行の対照以外の全条件と対照との${request.conditionIds.length - 1}件の比較をまとめて調整します。対照以外の条件同士の比較は含みません。分散はこの実行の全群からプールします。検定方向は両側です。p値と区間は多変量t分布の数値積分による近似値です（乱数シード固定）。独立した実験単位、各群の正規性、等分散を前提とします。この解析は前提が満たされたことを証明せず、区間が0を含むことだけで同等性を示しません。`;
}
