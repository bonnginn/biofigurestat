import type { RefObject } from "react";

import { copyGraphToClipboard } from "../../app/graphExport";
import { saveGraphPngExport, saveGraphSvgExport } from "../../app/graphExportController";
import { useAppLocale } from "../../app/appLocale";
import { safeNativeGraphFileStem } from "./experimentGraphDataExport";
import {
  runGraphClipboardCopyWithFeedback,
  runGraphUserExport,
  type GraphExportFeedback,
} from "./experimentGraphUserExports";

export type { GraphExportFeedback } from "./experimentGraphUserExports";

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
  const locale = useAppLocale();
  const ja = locale === "ja";
  const copy = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    await runGraphClipboardCopyWithFeedback(
      locale,
      () => copyGraphToClipboard(svg),
      onFeedback,
      {
        png: ja ? "PNGでコピーしました。" : "Copied as PNG.",
        failed: ja
          ? "クリップボードへコピーできませんでした。SVG書き出しを利用してください。"
          : "Could not copy to the clipboard. Use SVG export instead.",
      },
      false,
    );
  };

  const exportSvg = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    await runGraphUserExport(
      "svg",
      locale,
      () => saveGraphSvgExport(svg, `${safeNativeGraphFileStem(fileStem)}.svg`),
      onFeedback,
      {
        saved: ja ? "表示中のGraphをSVGで保存しました。" : "Saved the displayed Graph as SVG.",
        failed: ja
          ? "SVGを保存できませんでした。Graphは保持されています。"
          : "Could not save SVG. The Graph is unchanged.",
      },
      false,
    );
  };

  const exportPng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    await runGraphUserExport(
      "png",
      locale,
      () => saveGraphPngExport(svg, `${safeNativeGraphFileStem(fileStem)}.png`),
      onFeedback,
      {
        saved: ja
          ? "表示中のGraphを白背景のPNGで保存しました。"
          : "Saved the displayed Graph as a white-background PNG.",
        failed: ja
          ? "PNGを保存できませんでした。Graphは保持されています。SVG書き出しを利用してください。"
          : "Could not save PNG. The Graph is unchanged. Use SVG export instead.",
      },
      false,
    );
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
