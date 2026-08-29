import { PRODUCT_IDENTITY } from "./productIdentity";

export const EXTERNAL_LLM_GUIDE_VERSION = "0.1.0" as const;
export const EXTERNAL_LLM_GUIDE_URL =
  "https://raw.githubusercontent.com/bonnginn/life-science-analysis-app/main/docs/help/EXTERNAL_LLM_ASSIST_GUIDE_v0.1.md";

export type ExternalLlmImprovementRequest = Readonly<{
  placement: "experiment_setup" | "statistics";
  requestedChange?: string;
  externalLlmResponse?: string;
}>;

export function createExternalLlmImprovementRequest(
  input: ExternalLlmImprovementRequest,
): string {
  const placement =
    input.placement === "statistics" ? "Statistics（統計の選択・解釈）" : "Experiment setup（実験入力）";
  return [
    "Life Science Analysis App（LSA）の改善要望です。",
    `対象アプリ: ${PRODUCT_IDENTITY.displayNameJa} ${PRODUCT_IDENTITY.version}（build ${PRODUCT_IDENTITY.buildRevision}）`,
    `対象画面: ${placement}`,
    "",
    "実装してほしい内容:",
    input.requestedChange?.trim() || "（利用者による記載なし）",
    "",
    "外部LLMから得た回答（参考情報・未検証）:",
    input.externalLlmResponse?.trim() || "（添付なし）",
    "",
    "注意:",
    "- 外部LLMの回答は提案であり、LSAの仕様や科学的妥当性を保証するものではありません。",
    "- 実装前に、既存仕様、scientific semantics、再現可能なgeneric issueかを確認してください。",
    "- この文章は利用者が内容を確認して手動で共有したものです。LSAから自動送信されていません。",
  ].join("\n");
}

const line = (label: string, value: string | null | undefined): string =>
  `- ${label}: ${value?.trim() || "まだ回答していません"}`;

export type ExperimentConsultationContext = Readonly<{
  title?: string;
  conditionFactors: readonly Readonly<{ name: string; levels: readonly string[] }>[];
  measurement?: string;
  valueForm?: string;
  receiver?: string;
  relationship?: string;
  nestedObservation?: string;
  orderedAxis?: string;
}>;

export function createExperimentConsultationPrompt(
  context: ExperimentConsultationContext,
): string {
  const factorText = context.conditionFactors.length
    ? context.conditionFactors
        .map(
          ({ name, levels }, index) =>
            `${index + 1}. ${name.trim() || "名称未入力"}: ${levels.filter(Boolean).join(" / ") || "条件未入力"}`,
        )
        .join("\n")
    : "まだ入力していません";
  return [
    "Life Science Analysis App（LSA）への実験入力について相談します。",
    "最初に次のLSA使用ガイドを参照してください。ソースコード全体を推測で解釈しないでください。",
    EXTERNAL_LLM_GUIDE_URL,
    `対象アプリ: ${PRODUCT_IDENTITY.displayNameJa} ${PRODUCT_IDENTITY.version}（build ${PRODUCT_IDENTITY.buildRevision}）`,
    "",
    "あなたの役割:",
    "1. 私が実際に行った実験について、生命科学の言葉で一度に1問ずつ質問してください。",
    "2. biological n、同じ対象の反復、共通材料から分けた別試料、Cell/ROI等の階層を混同しないでください。",
    "3. 分からない意味は推測せず、結果が変わる点だけ確認してください。",
    "4. 情報が揃ったら、LSA画面の各欄へ何を入力・選択するかを順番に示してください。",
    "5. 現在LSAが安全に表現できない構造なら、近い別設計へ置き換えず、その制限を明示してください。",
    "6. 統計手法名から実験構造を逆算しないでください。",
    "",
    "現在までに入力した内容:",
    line("実験タイトル", context.title),
    "- 処理・群分け:",
    factorText,
    line("測定したもの", context.measurement),
    line("記録した値の形", context.valueForm),
    line("各条件を実施した対象・試料", context.receiver),
    line("条件間の対象・試料の関係", context.relationship),
    line("その中で個別に測ったもの", context.nestedObservation),
    line("時間・濃度などの順序に沿った測定", context.orderedAxis),
    "",
    "まず、正しく案内するために最も重要な未確認事項を1つだけ質問してください。",
  ].join("\n");
}

export type StatisticsConsultationContext = Readonly<{
  conditions: readonly string[];
  methodTitle: string;
  methodReason: string;
  nByCondition: Readonly<Record<string, number>>;
  missingCount: number;
  notPlannedCount: number;
  relationship?: string;
  selectedMethod?: string | null;
}>;

export function createStatisticsConsultationPrompt(
  context: StatisticsConsultationContext,
): string {
  const nText = Object.entries(context.nByCondition)
    .map(([condition, n]) => `${condition}: n=${n}`)
    .join(" / ");
  return [
    "Life Science Analysis App（LSA）で選ぶ統計について相談します。",
    "最初に次のLSA使用ガイドを参照してください。ソースコード全体を推測で解釈しないでください。",
    EXTERNAL_LLM_GUIDE_URL,
    `対象アプリ: ${PRODUCT_IDENTITY.displayNameJa} ${PRODUCT_IDENTITY.version}（build ${PRODUCT_IDENTITY.buildRevision}）`,
    "",
    "重要:",
    "- 以下には測定値そのものを含めていません。",
    "- あなたは統計値を計算せず、実験構造、比較目的、前提、LSAでの選択を案内してください。",
    "- biological n、対応、階層、反復を行番号から推測しないでください。",
    "- 不足情報があれば、一度に1問ずつ質問してください。",
    "- LSAが提供しない解析を、近い別手法へ無理に置き換えないでください。",
    "",
    "LSAに現在表示されている内容:",
    line("条件", context.conditions.join(" / ")),
    line("条件ごとの実験単位数", nText),
    line("条件間の関係", context.relationship),
    line("LSAの推奨表示", context.methodTitle),
    line("推奨理由", context.methodReason),
    line("現在選択中の方法", context.selectedMethod ?? null),
    `- 空欄・無効値: ${context.missingCount}件`,
    `- 実施していない測定: ${context.notPlannedCount}件`,
    "",
    "私が科学的に何と何を比較したいかを最初に質問し、その目的に現在の選択が合うか確認してください。",
    "最後に、LSAのStatistics画面で選ぶ項目と、結果を解釈するときの注意を具体的に示してください。",
  ].join("\n");
}
