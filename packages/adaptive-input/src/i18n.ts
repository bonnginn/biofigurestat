export type AdaptiveLocale = "ja" | "en";

const messages = {
  ja: {
    entryTitle: "実験構造から入力を始める",
    structureSummary: "実験構造の確認",
    pasteLabel: "表を貼り付ける",
    importFile: "CSV / TSVを読み込む",
    unsupported: "この構造は現在の解析へ安全に変換できません",
    continue: "この入力面を使う",
  },
  en: {
    entryTitle: "Start from experiment structure",
    structureSummary: "Structure summary",
    pasteLabel: "Paste a table",
    importFile: "Import CSV / TSV",
    unsupported: "This structure cannot be safely converted to a current analysis",
    continue: "Use this input surface",
  },
} as const;

export type AdaptiveMessageKey = keyof typeof messages.en;
export const adaptiveMessage = (locale: AdaptiveLocale, key: AdaptiveMessageKey): string => messages[locale][key];
