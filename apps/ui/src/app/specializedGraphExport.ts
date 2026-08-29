import { downloadTextFile, serializeGraphSvg, svgToPngBlob } from "./graphExport";

export type RenderedGraphCapture = Readonly<{
  svgText: string;
  width: number;
  height: number;
}>;

export function captureRenderedGraph(svg: SVGSVGElement): RenderedGraphCapture {
  const viewBox = svg.viewBox.baseVal;
  const width = viewBox.width || Number(svg.getAttribute("width")) || 1000;
  const height = viewBox.height || Number(svg.getAttribute("height")) || 700;
  return {
    svgText: serializeGraphSvg(svg),
    width,
    height,
  };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportRenderedGraphSvg(svg: SVGSVGElement, filename: string): boolean {
  const capture = captureRenderedGraph(svg);
  return downloadTextFile(capture.svgText, filename, "image/svg+xml");
}

export async function exportRenderedGraphPng(
  svg: SVGSVGElement,
  filename: string,
  dependencies: Readonly<{
    rasterize?: typeof svgToPngBlob;
    download?: (blob: Blob, filename: string) => void;
  }> = {},
): Promise<RenderedGraphCapture> {
  const capture = captureRenderedGraph(svg);
  const blob = await (dependencies.rasterize ?? svgToPngBlob)(
    capture.svgText,
    capture.width,
    capture.height,
  );
  (dependencies.download ?? downloadBlob)(blob, filename);
  return capture;
}
