import type { AnalysisEngineRequest } from "@lsaa/analysis-contracts";

/** Existing t/regression engines compute central intervals independently of p direction. */
export function usesCentralTwoConditionTInterval(request: AnalysisEngineRequest | null): boolean {
  return (
    (request?.protocolVersion === "0.1.0" &&
    ["welch_t", "student_t", "paired_t"].includes(request.method)) ||
    request?.protocolVersion === "0.9.0" || request?.protocolVersion === "0.13.0"
  );
}

export function twoConditionAlternativeText(request: AnalysisEngineRequest | null): string | null {
  if (request?.protocolVersion === "0.9.0" || request?.protocolVersion === "0.13.0") {
    const target = request.protocolVersion === "0.9.0" ? `平均値 ${request.conditionId} と基準値 ${request.nullValue}` : "回帰の傾きと0";
    return request.options.alternative === "two_sided"
      ? "検定方向：両側"
      : `検定方向：片側（${target}：${request.options.alternative === "less" ? "小さい" : "大きい"}）。片側の研究仮説は事前に指定してください。`;
  }
  if (request?.protocolVersion !== "0.1.0") return null;
  const [first, second] = request.contrastConditionIds;
  if (request.options.alternative === "two_sided") return "検定方向：両側";
  return `検定方向：片側（第1条件 ${first} ${request.options.alternative === "less" ? "<" : ">"} 第2条件 ${second}）。片側の研究仮説は事前に指定してください。`;
}

export function twoConditionIntervalNote(request: AnalysisEngineRequest | null): string | null {
  if (!usesCentralTwoConditionTInterval(request)) return null;
  const target = request?.protocolVersion === "0.9.0" ? "平均差は平均値 − 基準値。" : request?.protocolVersion === "0.13.0" ? "推定対象は回帰の傾き。" : "平均差は第1条件 − 第2条件。";
  return `${target}CIは両側の推定区間です。${request?.options.alternative === "two_sided" ? "" : "片側p値と同じ棄却境界を表す区間ではありません。"}`;
}
