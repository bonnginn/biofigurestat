import { recordDiagnosticError } from "../../app/diagnostics";
import type { ControlledGraphExportResult } from "../../app/graphExportController";

export type GraphExportFeedback = Readonly<{
  kind: "success" | "error";
  text: string;
}>;

type GraphExportKind = "svg" | "png" | "csv";

const SAVED_TEXT: Record<GraphExportKind, string> = {
  svg: "SVGを保存しました。",
  png: "現在のグラフを白背景のPNGで書き出しました。",
  csv: "表示中のデータをCSVで保存しました。",
};

const FAILED_TEXT: Record<GraphExportKind, string> = {
  svg: "SVGを保存できませんでした。グラフは保持されています。",
  png: "PNGを書き出せませんでした。グラフは保持されています。SVG書き出しを利用してください。",
  csv: "CSVを保存できませんでした。グラフとデータは保持されています。",
};

export async function runGraphUserExport(
  kind: GraphExportKind,
  operation: () => Promise<ControlledGraphExportResult>,
  setFeedback: (feedback: GraphExportFeedback | null) => void,
): Promise<void> {
  setFeedback(null);
  const result = await operation();
  if (result.status === "saved") {
    setFeedback({ kind: "success", text: SAVED_TEXT[kind] });
  } else if (result.status === "failed") {
    recordDiagnosticError("GRAPH_EXPORT_FAILED", result.error);
    setFeedback({ kind: "error", text: FAILED_TEXT[kind] });
  }
}

export async function runGraphClipboardCopy(
  operation: () => Promise<"svg" | "png" | "text">,
  setStatus: (status: string | null) => void,
): Promise<void> {
  setStatus(null);
  try {
    const format = await operation();
    setStatus(
      format === "svg"
        ? "ベクター形式でコピーしました。"
        : format === "png"
          ? "透明背景のPNGでコピーしました。"
          : "SVGテキストでコピーしました。",
    );
  } catch (error) {
    recordDiagnosticError("GRAPH_EXPORT_FAILED", error);
    setStatus(
      "この環境ではクリップボードへコピーできませんでした。SVG書き出しを利用してください。",
    );
  }
}
