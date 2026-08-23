import type { AnalysisEngineRequest } from "@lsaa/analysis-contracts";
import type { CoreGraphModel } from "@lsaa/graph-spec";
import { invoke, isTauri } from "@tauri-apps/api/core";

const PUBLICATION_SVG_STYLE = `
.graph-tick { stroke: #000; stroke-width: 1.2; }
.graph-axis-line { stroke: #000; stroke-width: 1.45; }
.graph-axis-label, .graph-condition-label, .graph-axis-title { fill: #000; font-family: Arial, sans-serif; font-size: 16px; }
.graph-axis-title { fill: #000; font-size: 16px; font-weight: 650; }
.graph-condition-label { fill: #000; font-size: 16px; font-weight: 650; }
.graph-point { stroke: #263445; stroke-width: 1.15; }
.graph-mean-line, .graph-error-line, .graph-error-cap { stroke: #40536f; stroke-width: 2; }
.graph-error-line, .graph-error-cap { stroke-width: 1.5; }
.graph-paired-line { stroke: #64748b; stroke-width: 1.2; opacity: 0.72; }
.experiment-graph-axis-line, .experiment-graph-tick { stroke: #000; fill: none; }
.experiment-graph-axis-line { stroke-width: 1.4; }
.experiment-graph-tick { stroke-width: 1.2; }
.experiment-graph-axis-label, .experiment-graph-axis-title, .experiment-graph-condition-label, .experiment-graph-condition-attribute { fill: #000; font-family: inherit; font-size: 16px; }
.experiment-graph-axis-title, .experiment-graph-condition-label { font-weight: 650; }
.experiment-graph-condition-attribute { fill: #000; }
.experiment-graph-point { stroke: #fff; stroke-width: 1.3; }
.experiment-graph-point--raw { stroke: none; }
.experiment-graph-bar { stroke: #274f70; stroke-width: 1; }
.experiment-graph-mean-line, .experiment-graph-error-line, .experiment-graph-error-cap { stroke: #334e68; fill: none; }
.experiment-graph-mean-line { stroke-width: 2; }
.experiment-graph-error-line, .experiment-graph-error-cap { stroke-width: 1.6; }
.experiment-graph-stat-line { stroke: #000; stroke-width: 1.2; }
.experiment-graph-stat-label { fill: #000; font-family: inherit; font-size: 16px; font-weight: 650; }
`;

/** Serializes the currently rendered SVG, including inline Inspector appearance attributes. */
export function serializeGraphSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("version", "1.1");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = PUBLICATION_SVG_STYLE;
  clone.insertBefore(style, clone.firstChild);
  const serialized = new XMLSerializer().serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
}

type AnalyzedObservation = AnalysisEngineRequest["observations"][number];

function csvField(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/** Creates a deterministic CSV from the exact observations used by the executed request. */
export function serializeAnalyzedDataCsv(
  observations: ReadonlyArray<AnalyzedObservation>,
  model: CoreGraphModel,
  unitLabel: string,
  conditionLabels: ReadonlyArray<{ id: string; label: string }> = [],
): string {
  const labels = new Map(
    conditionLabels.length > 0
      ? conditionLabels.map((condition) => [condition.id, condition.label])
      : model.groups.map((group) => [group.conditionId, group.label]),
  );
  const valueHeader = unitLabel.trim() ? `値（${unitLabel.trim()}）` : "値（解析値）";
  const header = ["観測ID", "実験単位ID", "条件ID", "条件名", "ペアID", "ブロックID", valueHeader];
  const rows = observations.map((observation) => [
    observation.observationId,
    observation.experimentalUnitId,
    observation.conditionId,
    labels.get(observation.conditionId) ?? observation.conditionId,
    observation.pairId,
    observation.blockId,
    observation.value,
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvField).join(",")).join("\n")}\n`;
}

export function downloadTextFile(text: string, filename: string, mimeType: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

export async function svgToPngBlob(svgText: string, width: number, height: number): Promise<Blob> {
  const source = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("SVG image could not be rendered"));
      image.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG could not be generated"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function copyGraphToNativeClipboard(
  svgText: string,
  width: number,
  height: number,
): Promise<void> {
  const png = await svgToPngBlob(svgText, width * 2, height * 2);
  const pngBytes = [...new Uint8Array(await png.arrayBuffer())];
  await invoke("copy_graph_png", { pngBytes });
}

/** Copies vector SVG when supported, then a white-background PNG, then SVG text as a safe fallback. */
export async function copyGraphToClipboard(svg: SVGSVGElement): Promise<"svg" | "png" | "text"> {
  const svgText = serializeGraphSvg(svg);
  const viewBox = svg.viewBox.baseVal;
  const width = viewBox.width || svg.width.baseVal.value || 900;
  const height = viewBox.height || svg.height.baseVal.value || 520;
  if (isTauri()) {
    try {
      await copyGraphToNativeClipboard(svgText, width, height);
      return "png";
    } catch {
      // Fall through to the Web Clipboard API for environments where the
      // platform-specific native clipboard command is unavailable.
    }
  }
  const clipboard = navigator.clipboard;
  const ClipboardItemConstructor = globalThis.ClipboardItem;
  if (clipboard?.write && ClipboardItemConstructor) {
    try {
      await clipboard.write([
        new ClipboardItemConstructor({
          "image/svg+xml": new Blob([svgText], { type: "image/svg+xml" }),
        }),
      ]);
      return "svg";
    } catch {
      try {
        const png = await svgToPngBlob(svgText, width, height);
        await clipboard.write([new ClipboardItemConstructor({ "image/png": png })]);
        return "png";
      } catch {
        // Continue to the text fallback for browsers without image clipboard support.
      }
    }
  }
  if (clipboard?.writeText) {
    await clipboard.writeText(svgText);
    return "text";
  }
  throw new Error("Clipboard API is unavailable");
}
