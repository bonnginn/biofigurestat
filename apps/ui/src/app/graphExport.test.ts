import { describe, expect, it, vi } from "vitest";

import type { CoreGraphModel } from "@lsaa/graph-spec";

import {
  copyGraphToClipboard,
  exportGraphPng,
  serializeAnalyzedDataCsv,
  serializeGraphSvg,
  svgToPngBlob,
} from "./graphExport";

const model: CoreGraphModel = {
  type: "paired_dot",
  yLabel: "陽性細胞率 (%)",
  yStartAtZero: false,
  groups: [
    {
      conditionId: "condition.a",
      label: "対照",
      values: [],
      rawValues: [],
      mean: 1,
      errorBar: 0.2,
      errorBarKind: "sd",
    },
    {
      conditionId: "condition.b",
      label: "処理、強",
      values: [],
      rawValues: [],
      mean: 2,
      errorBar: 0.3,
      errorBarKind: "sd",
    },
  ],
  connections: [],
};

describe("publication graph exports", () => {
  it("paints an opaque white canvas before rasterizing PNG", async () => {
    const save = vi.fn();
    const fillRect = vi.fn();
    const restore = vi.fn();
    const drawImage = vi.fn();
    const context = { save, fillStyle: "", fillRect, restore, drawImage };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          this.onload?.();
        }
      },
    );

    await expect(svgToPngBlob("<svg/>", 20, 10)).resolves.toBeInstanceOf(Blob);
    expect(context.fillStyle).toBe("#ffffff");
    expect(fillRect).toHaveBeenCalledWith(0, 0, 20, 10);
    expect(fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      drawImage.mock.invocationCallOrder[0],
    );
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rasterizes and downloads the exact currently rendered SVG", async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "640");
    svg.setAttribute("height", "480");
    svg.setAttribute("viewBox", "0 0 640 480");
    svg.setAttribute("data-graph-shape", "proportion");
    const currentLayer = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    currentLayer.setAttribute("data-graph-layer", "proportion-experiment");
    currentLayer.setAttribute("cx", "120");
    currentLayer.setAttribute("cy", "160");
    svg.appendChild(currentLayer);
    const expectedSvg = serializeGraphSvg(svg);
    const png = new Blob(["png"], { type: "image/png" });
    const rasterize = vi.fn(async () => png);
    const download = vi.fn(() => true);

    const capture = await exportGraphPng(svg, "current-graph.png", { rasterize, download });

    expect(capture).toEqual({ svgText: expectedSvg, width: 640, height: 480 });
    expect(rasterize).toHaveBeenCalledWith(expectedSvg, 640, 480);
    expect(download).toHaveBeenCalledWith(png, "current-graph.png");
  });

  it("copies SVG vector content when the browser clipboard supports it", async () => {
    class TestClipboardItem {
      constructor(readonly data: Record<string, Blob>) {}
    }
    const write = vi.fn<(items: readonly TestClipboardItem[]) => Promise<void>>(async () => {});
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: TestClipboardItem,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write },
    });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 520 320");

    await expect(copyGraphToClipboard(svg)).resolves.toBe("svg");
    expect(write).toHaveBeenCalledTimes(1);
    const item = write.mock.calls[0]![0][0];
    expect(item.data["image/svg+xml"]).toBeInstanceOf(Blob);
  });

  it("serializes the rendered SVG with namespace and inline appearance", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 520 320");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", "8");
    circle.setAttribute("fill", "#0072b2");
    circle.setAttribute("data-graph-point", "observation.1");
    svg.append(circle);

    const serialized = serializeGraphSvg(svg);

    expect(serialized).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(serialized).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(serialized).toContain(".graph-axis-line");
    expect(serialized).toContain(".experiment-graph-category-tick");
    expect(serialized).toContain(".experiment-graph-hierarchy-line");
    expect(serialized).toContain(".experiment-graph-hierarchy-heading");
    expect(serialized).toContain('r="8"');
    expect(serialized).toContain('fill="#0072b2"');
    expect(serialized).toContain('data-graph-point="observation.1"');
    expect(
      new DOMParser().parseFromString(serialized, "image/svg+xml").querySelector("parsererror"),
    ).toBeNull();
  });

  it("exports the exact analyzed observations with Japanese labels and units", () => {
    const csv = serializeAnalyzedDataCsv(
      [
        {
          observationId: "observation.1",
          experimentalUnitId: "unit.1",
          conditionId: "condition.a",
          value: 12.5,
        },
        {
          observationId: "observation.2",
          experimentalUnitId: "unit.2",
          conditionId: "condition.b",
          pairId: "pair.1",
          blockId: "block.1",
          value: 18,
        },
      ],
      model,
      "陽性細胞率 (%)",
    );

    expect(csv).toContain("観測ID");
    expect(csv).toContain("値（陽性細胞率 (%)）");
    expect(csv).toContain('"condition.b","処理、強","pair.1","block.1","18"');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("uses explicit variable labels when a scatter model has no groups", () => {
    const scatterModel: CoreGraphModel = {
      type: "scatter",
      yLabel: "測定値Y",
      yStartAtZero: false,
      groups: [],
      connections: [],
      scatterPoints: [],
    };
    const csv = serializeAnalyzedDataCsv(
      [
        {
          observationId: "x.1",
          experimentalUnitId: "unit.1",
          conditionId: "condition.x",
          pairId: "unit.1",
          value: 2,
        },
      ],
      scatterModel,
      "測定値Y",
      [
        { id: "condition.x", label: "測定値X" },
        { id: "condition.y", label: "測定値Y" },
      ],
    );
    expect(csv).toContain('"condition.x","測定値X"');
  });
});
