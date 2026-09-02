import type { AppLocale } from "./appLocale";
import { localizedText } from "./appLocale";

export function biologicalWorkspaceStopMessage(
  diagnostics: readonly string[],
  locale: AppLocale = "ja",
): string {
  const mixedGrain = diagnostics.some((diagnostic) =>
    diagnostic.includes("heterogeneous_readout_grains"),
  );
  const mixedAxis = diagnostics.some((diagnostic) =>
    diagnostic.includes("heterogeneous_readout_axes"),
  );
  if (mixedGrain && mixedAxis) {
    return localizedText(
      locale,
      "測定項目ごとに、Cell・ROIなど個別の値か試料全体の値か、また時間・距離の系列で測ったかが異なります。現在の入力画面は違いを1つの表へ強制せず、ここで停止しました。回答と条件表は保持されています。",
      "Readouts use different observation levels and ordered-axis structures. This workflow stopped instead of forcing them into one table; answers and the condition table were retained.",
    );
  }
  if (mixedGrain) {
    return localizedText(
      locale,
      "測定項目ごとに、Cell・ROIなど個別の値か試料全体の値かが異なります。現在の入力画面は違いを1つの表へ強制せず、ここで停止しました。回答と条件表は保持されています。",
      "Readouts use different observation levels. This workflow stopped instead of forcing them into one table; answers and the condition table were retained.",
    );
  }
  if (mixedAxis) {
    return localizedText(
      locale,
      "時間・距離の系列で測った項目と、系列の最後などで1回だけ測った項目が混在しています。現在の入力画面は違いを1つの表へ強制せず、ここで停止しました。回答と条件表は保持されています。",
      "Ordered-series and single-time readouts are mixed. This workflow stopped instead of forcing them into one table; answers and the condition table were retained.",
    );
  }
  return localizedText(
    locale,
    "この実験内容は現在の入力画面へ安全に変換できません。入力内容は保持されています。",
    "This experiment cannot be converted safely to the current worksheet. Entered information was retained.",
  );
}

export function biologicalHandoffStopMessage(
  locale: AppLocale,
  kind: "presentation" | "table_promotion" | "graph_rebind" | "unexpected",
  japaneseReason = "",
): string {
  const japanese = {
    presentation:
      "条件表と実験構造の対応を安全に確認できませんでした。入力内容は保持されています。",
    table_promotion: japaneseReason,
    graph_rebind: japaneseReason,
    unexpected: "入力画面の準備中に実験内容を確認できませんでした。入力内容は保持されています。",
  }[kind];
  const english = {
    presentation:
      "The condition table could not be matched safely to the experimental structure. Entered information was retained.",
    table_promotion:
      "The Graph-only table could not be promoted safely to a statistical worksheet. The source table and entered biological information were retained.",
    graph_rebind:
      "The saved Graph could not be linked safely to the revised experimental structure. The source table and entered biological information were retained.",
    unexpected:
      "The experiment could not be validated while preparing the worksheet. Entered information was retained.",
  }[kind];
  return localizedText(locale, japanese, english);
}
