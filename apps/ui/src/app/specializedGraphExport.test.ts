import { describe, expect, it, vi } from "vitest";

import {
  captureRenderedGraph,
  exportRenderedGraphPng,
} from "./specializedGraphExport";

function renderedSurvivalSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 960 620");
  const curve = document.createElementNS("http://www.w3.org/2000/svg", "path");
  curve.setAttribute("data-condition-id", "Treatment");
  curve.setAttribute("d", "M0 0 L10 10");
  svg.append(curve);
  return svg;
}

describe("specialized graph export", () => {
  it("rasterizes the exact same serialized SVG that is used as the vector export source", async () => {
    const svg = renderedSurvivalSvg();
    const sharedCapture = captureRenderedGraph(svg);
    const png = new Blob(["png"], { type: "image/png" });
    const rasterize = vi.fn(async () => png);
    const download = vi.fn();

    const capture = await exportRenderedGraphPng(svg, "survival.png", {
      rasterize,
      download,
    });

    expect(capture.svgText).toBe(sharedCapture.svgText);
    expect(capture.svgText).toContain('data-condition-id="Treatment"');
    expect(rasterize).toHaveBeenCalledWith(sharedCapture.svgText, 960, 620);
    expect(download).toHaveBeenCalledWith(png, "survival.png");
  });

  it("does not create a download when rasterization fails", async () => {
    const download = vi.fn();
    await expect(
      exportRenderedGraphPng(renderedSurvivalSvg(), "survival.png", {
        rasterize: vi.fn(async () => {
          throw new Error("canvas unavailable");
        }),
        download,
      }),
    ).rejects.toThrow("canvas unavailable");
    expect(download).not.toHaveBeenCalled();
  });
});
