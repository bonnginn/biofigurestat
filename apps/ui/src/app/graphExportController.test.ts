import { describe, expect, it, vi } from "vitest";

import { ExportCancelledError } from "./graphExport";
import {
  saveGraphCsvExport,
  saveGraphPngExport,
  saveGraphSvgExport,
} from "./graphExportController";

function svgElement(): SVGSVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", "svg");
}

function dependencies() {
  return {
    saveText: vi.fn(
      async (
        _text: string,
        _filename: string,
        _mimeType: string,
      ): Promise<"saved" | "cancelled"> => "saved",
    ),
    exportPng: vi.fn(async () => undefined),
    serializeSvg: vi.fn(() => "<svg data-exported=\"true\"/>"),
  };
}

describe("graph export controller", () => {
  it("serializes and saves SVG through the shared native-aware text boundary", async () => {
    const deps = dependencies();
    const svg = svgElement();

    await expect(saveGraphSvgExport(svg, "figure.svg", deps)).resolves.toEqual({ status: "saved" });
    expect(deps.serializeSvg).toHaveBeenCalledWith(svg);
    expect(deps.saveText).toHaveBeenCalledWith(
      '<svg data-exported="true"/>',
      "figure.svg",
      "image/svg+xml;charset=utf-8",
    );
  });

  it("preserves native Save-dialog cancellation as a non-error result", async () => {
    const deps = dependencies();
    deps.saveText.mockResolvedValueOnce("cancelled");

    await expect(saveGraphCsvExport("x,y\n1,2\n", "figure.csv", deps)).resolves.toEqual({
      status: "cancelled",
    });
  });

  it("normalizes PNG cancellation raised after rasterization", async () => {
    const deps = dependencies();
    deps.exportPng.mockRejectedValueOnce(new ExportCancelledError());

    await expect(saveGraphPngExport(svgElement(), "figure.png", deps)).resolves.toEqual({
      status: "cancelled",
    });
  });

  it("returns export failures without swallowing their diagnostic cause", async () => {
    const deps = dependencies();
    const error = new Error("disk unavailable");
    deps.saveText.mockRejectedValueOnce(error);

    await expect(saveGraphCsvExport("x,y\n", "figure.csv", deps)).resolves.toEqual({
      status: "failed",
      error,
    });
  });
});
