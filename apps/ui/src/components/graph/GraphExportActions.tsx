import type { RefObject } from "react";

import {
  copyGraphToClipboard,
  ExportCancelledError,
  exportGraphPng,
  saveExportText,
  serializeGraphSvg,
} from "../../app/graphExport";
import { useAppLocale } from "../../app/appLocale";

export type GraphExportFeedback = Readonly<{
  kind: "success" | "error";
  text: string;
}>;

function safeFileStem(value: string): string {
  const reserved = '<>:"/\\|?*';
  const sanitized = Array.from(value.trim(), (character) =>
    character.charCodeAt(0) < 32 || reserved.includes(character) ? "-" : character,
  ).join("");
  return sanitized || "graph";
}

export function GraphExportActions({
  svgRef,
  fileStem,
  disabled = false,
  onFeedback,
}: Readonly<{
  svgRef: RefObject<SVGSVGElement | null>;
  fileStem: string;
  disabled?: boolean;
  onFeedback: (feedback: GraphExportFeedback | null) => void;
}>) {
  const ja = useAppLocale() === "ja";
  const copy = async () => {
    if (!svgRef.current) return;
    onFeedback(null);
    try {
      const format = await copyGraphToClipboard(svgRef.current);
      onFeedback({
        kind: "success",
        text:
          format === "svg"
            ? ja
              ? "ベクター形式でコピーしました。"
              : "Copied as vector graphics."
            : format === "png"
              ? ja
                ? "PNGでコピーしました。"
                : "Copied as PNG."
              : ja
                ? "SVGテキストでコピーしました。"
                : "Copied as SVG text.",
      });
    } catch {
      onFeedback({
        kind: "error",
        text: ja
          ? "クリップボードへコピーできませんでした。SVG書き出しを利用してください。"
          : "Could not copy to the clipboard. Use SVG export instead.",
      });
    }
  };

  const exportSvg = async () => {
    if (!svgRef.current) return;
    onFeedback(null);
    try {
      const result = await saveExportText(
        serializeGraphSvg(svgRef.current),
        `${safeFileStem(fileStem)}.svg`,
        "image/svg+xml;charset=utf-8",
      );
      if (result === "saved") {
        onFeedback({
          kind: "success",
          text: ja ? "表示中のGraphをSVGで保存しました。" : "Saved the displayed Graph as SVG.",
        });
      }
    } catch (error) {
      if (error instanceof ExportCancelledError) return;
      onFeedback({
        kind: "error",
        text: ja
          ? "SVGを保存できませんでした。Graphは保持されています。"
          : "Could not save SVG. The Graph is unchanged.",
      });
    }
  };

  const exportPng = async () => {
    if (!svgRef.current) return;
    onFeedback(null);
    try {
      await exportGraphPng(svgRef.current, `${safeFileStem(fileStem)}.png`);
      onFeedback({
        kind: "success",
        text: ja
          ? "表示中のGraphを白背景のPNGで保存しました。"
          : "Saved the displayed Graph as a white-background PNG.",
      });
    } catch (error) {
      if (error instanceof ExportCancelledError) return;
      onFeedback({
        kind: "error",
        text: ja
          ? "PNGを保存できませんでした。Graphは保持されています。SVG書き出しを利用してください。"
          : "Could not save PNG. The Graph is unchanged. Use SVG export instead.",
      });
    }
  };

  return (
    <div className="graph-export-actions" aria-label={ja ? "グラフの書き出し" : "Graph export"}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ja ? "グラフをコピー" : "Copy Graph"}
        onClick={() => void copy()}
      >
        {ja ? "コピー" : "Copy"}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label={ja ? "SVGを書き出す" : "Export SVG"}
        onClick={() => void exportSvg()}
      >
        SVG
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label={ja ? "PNGを書き出す" : "Export PNG"}
        onClick={() => void exportPng()}
      >
        PNG
      </button>
    </div>
  );
}
