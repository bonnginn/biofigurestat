import { describe, expect, it, vi } from "vitest";

import { exportWorkspaceGraphPanel } from "./workspaceGraphPanelExport";

function renderedGraph(id: string): HTMLDivElement {
  const container = document.createElement("div");
  container.dataset.workspaceGraphId = id;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("role", "img");
  svg.dataset.source = id;
  container.append(svg);
  return container;
}

describe("workspace Graph panel export", () => {
  it("collects every rendered Graph in saved order and delegates one SVG save", async () => {
    const root = document.createElement("div");
    root.append(renderedGraph("graph.2"), renderedGraph("graph.1"));
    const savePanel = vi.fn(async () => ({ status: "saved" as const }));
    const serializePanel = vi.fn(() => "<svg data-panel='true'/>");

    await expect(
      exportWorkspaceGraphPanel({
        root,
        graphs: [
          { id: "graph.1", displayName: "First" },
          { id: "graph.2", displayName: "Second" },
        ],
        projectTitle: "Dose / response",
        dependencies: {
          serializeGraph: (svg) => `<svg data-source='${svg.dataset.source}'/>`,
          serializePanel,
          savePanel,
          safeFileStem: (value) => value.replaceAll(/\W+/gu, "_"),
        },
      }),
    ).resolves.toEqual({ status: "saved" });

    expect(serializePanel).toHaveBeenCalledWith([
      { graphId: "graph.1", displayName: "First", svgText: "<svg data-source='graph.1'/>" },
      { graphId: "graph.2", displayName: "Second", svgText: "<svg data-source='graph.2'/>" },
    ]);
    expect(savePanel).toHaveBeenCalledWith("<svg data-panel='true'/>", "Dose_response-panel.svg");
  });

  it("stops before saving when a saved Graph has not rendered", async () => {
    const savePanel = vi.fn(async () => ({ status: "saved" as const }));
    await expect(
      exportWorkspaceGraphPanel({
        root: document.createElement("div"),
        graphs: [
          { id: "graph.1", displayName: "First" },
          { id: "graph.2", displayName: "Second" },
        ],
        projectTitle: "Project",
        dependencies: {
          serializeGraph: () => "<svg/>",
          serializePanel: () => "<svg/>",
          savePanel,
          safeFileStem: (value) => value,
        },
      }),
    ).rejects.toThrow("not ready");
    expect(savePanel).not.toHaveBeenCalled();
  });
});

