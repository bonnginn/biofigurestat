import {
  ExportCancelledError,
  exportGraphPng,
  saveExportText,
  serializeGraphSvg,
  type ExportFileResult,
} from "./graphExport";

export type ControlledGraphExportResult =
  | Readonly<{ status: "saved" }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "failed"; error: unknown }>;

type GraphExportControllerDependencies = Readonly<{
  saveText: (text: string, filename: string, mimeType: string) => Promise<ExportFileResult>;
  exportPng: (svg: SVGSVGElement, filename: string) => Promise<unknown>;
  serializeSvg: (svg: SVGSVGElement) => string;
}>;

const DEFAULT_DEPENDENCIES: GraphExportControllerDependencies = {
  saveText: saveExportText,
  exportPng: exportGraphPng,
  serializeSvg: serializeGraphSvg,
};

async function controlExport(
  operation: () => Promise<ExportFileResult | void>,
): Promise<ControlledGraphExportResult> {
  try {
    const result = await operation();
    return { status: result === "cancelled" ? "cancelled" : "saved" };
  } catch (error) {
    if (error instanceof ExportCancelledError) return { status: "cancelled" };
    return { status: "failed", error };
  }
}

export function saveGraphSvgExport(
  svg: SVGSVGElement,
  filename: string,
  dependencies: GraphExportControllerDependencies = DEFAULT_DEPENDENCIES,
): Promise<ControlledGraphExportResult> {
  return controlExport(() =>
    dependencies.saveText(
      dependencies.serializeSvg(svg),
      filename,
      "image/svg+xml;charset=utf-8",
    ),
  );
}

export function saveGraphPngExport(
  svg: SVGSVGElement,
  filename: string,
  dependencies: GraphExportControllerDependencies = DEFAULT_DEPENDENCIES,
): Promise<ControlledGraphExportResult> {
  return controlExport(async () => {
    await dependencies.exportPng(svg, filename);
  });
}

export function saveGraphCsvExport(
  csv: string,
  filename: string,
  dependencies: GraphExportControllerDependencies = DEFAULT_DEPENDENCIES,
): Promise<ControlledGraphExportResult> {
  return controlExport(() => dependencies.saveText(csv, filename, "text/csv;charset=utf-8"));
}

export function saveAnalysisReviewSetExport(
  html: string,
  filename: string,
  dependencies: GraphExportControllerDependencies = DEFAULT_DEPENDENCIES,
): Promise<ControlledGraphExportResult> {
  return controlExport(() => dependencies.saveText(html, filename, "text/html;charset=utf-8"));
}
