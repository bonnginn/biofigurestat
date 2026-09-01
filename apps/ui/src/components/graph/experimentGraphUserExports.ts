import { recordDiagnosticError } from "../../app/diagnostics";
import type { ControlledGraphExportResult } from "../../app/graphExportController";
import { localizedText, type AppLocale } from "../../app/appLocale";

export type GraphExportFeedback = Readonly<{
  kind: "success" | "error";
  text: string;
}>;

type GraphExportKind = "svg" | "png" | "csv" | "review";

const SAVED_TEXT: Record<GraphExportKind, Readonly<{ ja: string; en: string }>> = {
  svg: { ja: "SVGを保存しました。", en: "Saved the SVG." },
  png: {
    ja: "現在のグラフを白背景のPNGで書き出しました。",
    en: "Exported the current Graph as a white-background PNG.",
  },
  csv: { ja: "表示中のデータをCSVで保存しました。", en: "Saved the displayed data as CSV." },
  review: {
    ja: "解析レビューセットを保存しました。",
    en: "Saved the analysis review set.",
  },
};

const FAILED_TEXT: Record<GraphExportKind, Readonly<{ ja: string; en: string }>> = {
  svg: {
    ja: "SVGを保存できませんでした。グラフは保持されています。",
    en: "Could not save the SVG. The Graph is unchanged.",
  },
  png: {
    ja: "PNGを書き出せませんでした。グラフは保持されています。SVG書き出しを利用してください。",
    en: "Could not export the PNG. The Graph is unchanged. Use SVG export instead.",
  },
  csv: {
    ja: "CSVを保存できませんでした。グラフとデータは保持されています。",
    en: "Could not save the CSV. The Graph and data are unchanged.",
  },
  review: {
    ja: "解析レビューセットを保存できませんでした。グラフ・解析結果・データは保持されています。",
    en: "Could not save the analysis review set. The Graph, analysis result, and data are unchanged.",
  },
};

function message(locale: AppLocale, value: Readonly<{ ja: string; en: string }>): string {
  return localizedText(locale, value.ja, value.en);
}

export async function runGraphUserExport(
  kind: GraphExportKind,
  locale: AppLocale,
  operation: () => Promise<ControlledGraphExportResult>,
  setFeedback: (feedback: GraphExportFeedback | null) => void,
): Promise<void> {
  setFeedback(null);
  const result = await operation();
  if (result.status === "saved") {
    setFeedback({ kind: "success", text: message(locale, SAVED_TEXT[kind]) });
  } else if (result.status === "failed") {
    recordDiagnosticError("GRAPH_EXPORT_FAILED", result.error);
    setFeedback({ kind: "error", text: message(locale, FAILED_TEXT[kind]) });
  }
}

export async function runGraphClipboardCopy(
  locale: AppLocale,
  operation: () => Promise<"svg" | "png" | "text">,
  setStatus: (status: string | null) => void,
): Promise<void> {
  setStatus(null);
  try {
    const format = await operation();
    setStatus(
      format === "svg"
        ? localizedText(locale, "ベクター形式でコピーしました。", "Copied as vector graphics.")
        : format === "png"
          ? localizedText(locale, "透明背景のPNGでコピーしました。", "Copied as a transparent PNG.")
          : localizedText(locale, "SVGテキストでコピーしました。", "Copied as SVG text."),
    );
  } catch (error) {
    recordDiagnosticError("GRAPH_EXPORT_FAILED", error);
    setStatus(
      localizedText(
        locale,
        "この環境ではクリップボードへコピーできませんでした。SVG書き出しを利用してください。",
        "Could not copy to the clipboard in this environment. Use SVG export instead.",
      ),
    );
  }
}
