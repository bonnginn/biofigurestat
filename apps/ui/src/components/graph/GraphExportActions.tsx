import { useRef, useState, type RefObject } from "react";

import { protectWindowsDeviceFileStem } from "../../app/projectFileName";

import {
  copyGraphToClipboard,
  ExportCancelledError,
  exportGraphPng,
  saveExportText,
  serializeGraphSvg,
} from "../../app/graphExport";

export type GraphExportFeedback = Readonly<{
  kind: "success" | "error";
  text: string;
}>;

function safeFileStem(value: string): string {
  const reserved = '<>:"/\\|?*';
  const sanitized = Array.from(value.trim(), (character) =>
    character.charCodeAt(0) < 32 || reserved.includes(character) ? "-" : character,
  ).join("");
  return protectWindowsDeviceFileStem(sanitized.replace(/[. ]+$/g, "").slice(0, 120) || "graph");
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
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const beginExport = () => {
    if (disabled || pendingRef.current || !svgRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    return true;
  };
  const finishExport = () => {
    pendingRef.current = false;
    setPending(false);
  };
  const copy = async () => {
    if (!beginExport() || !svgRef.current) return;
    onFeedback(null);
    try {
      const format = await copyGraphToClipboard(svgRef.current);
      onFeedback({
        kind: "success",
        text:
          format === "svg"
            ? "ベクター形式でコピーしました。"
            : format === "png"
              ? "PNGでコピーしました。"
              : "SVGテキストでコピーしました。",
      });
    } catch {
      onFeedback({
        kind: "error",
        text: "クリップボードへコピーできませんでした。SVG書き出しを利用してください。",
      });
    } finally {
      finishExport();
    }
  };

  const exportSvg = async () => {
    if (!beginExport() || !svgRef.current) return;
    onFeedback(null);
    try {
      const result = await saveExportText(
        serializeGraphSvg(svgRef.current),
        `${safeFileStem(fileStem)}.svg`,
        "image/svg+xml;charset=utf-8",
      );
      if (result === "saved") {
        onFeedback({ kind: "success", text: "表示中のGraphをSVGで保存しました。" });
      }
    } catch (error) {
      if (error instanceof ExportCancelledError) return;
      onFeedback({
        kind: "error",
        text: "SVGを保存できませんでした。Graphは保持されています。",
      });
    } finally {
      finishExport();
    }
  };

  const exportPng = async () => {
    if (!beginExport() || !svgRef.current) return;
    onFeedback(null);
    try {
      await exportGraphPng(svgRef.current, `${safeFileStem(fileStem)}.png`);
      onFeedback({ kind: "success", text: "表示中のGraphを白背景のPNGで保存しました。" });
    } catch (error) {
      if (error instanceof ExportCancelledError) return;
      onFeedback({
        kind: "error",
        text: "PNGを保存できませんでした。Graphは保持されています。SVG書き出しを利用してください。",
      });
    } finally {
      finishExport();
    }
  };

  return (
    <div className="graph-export-actions" aria-label="グラフの書き出し" aria-busy={pending}>
      <button
        type="button"
        disabled={disabled || pending}
        aria-label="グラフをコピー"
        onClick={() => void copy()}
      >
        コピー
      </button>
      <button
        type="button"
        disabled={disabled || pending}
        aria-label="SVGを書き出す"
        onClick={() => void exportSvg()}
      >
        SVG
      </button>
      <button
        type="button"
        disabled={disabled || pending}
        aria-label="PNGを書き出す"
        onClick={() => void exportPng()}
      >
        PNG
      </button>
      {pending ? <span role="status">グラフを書き出しています…</span> : null}
    </div>
  );
}
