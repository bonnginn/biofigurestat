import { describe, expect, it } from "vitest";

import { serializeGraphPanelSvg } from "./graphPanelExport";

describe("Graph panel export", () => {
  it("arranges saved SVGs and retains source Graph identity without changing their content", () => {
    const panel = serializeGraphPanelSvg([
      {
        graphId: "graph.1",
        displayName: "Vehicle response",
        svgText:
          '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="scale"/></defs><circle data-value="1.25" fill="url(#scale)"/></svg>',
      },
      {
        graphId: "graph.2",
        displayName: "Drug <A>",
        svgText:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 320"><defs><linearGradient id="scale"/></defs><path data-analysis-run-id="run.2" fill="url(#scale)"/></svg>',
      },
    ]);

    expect(panel).toContain("biofigurestat_graph_panel");
    expect(panel).toContain('data-panel-source-graph-id="graph.1"');
    expect(panel).toContain('data-panel-source-graph-id="graph.2"');
    expect(panel).toContain("Vehicle response");
    expect(panel).toContain("Drug &lt;A&gt;");
    expect(panel).toContain('data-value="1.25"');
    expect(panel).toContain('data-analysis-run-id="run.2"');
    expect(panel).toContain('id="panel-0-scale"');
    expect(panel).toContain('fill="url(#panel-0-scale)"');
    expect(panel).toContain('id="panel-1-scale"');
    expect(panel).toContain('fill="url(#panel-1-scale)"');
    expect(panel).toContain('viewBox="0 0 1240 560"');
  });

  it("requires multiple valid saved Graphs", () => {
    expect(() =>
      serializeGraphPanelSvg([
        { graphId: "graph.1", displayName: "Only", svgText: "<svg/>" },
      ]),
    ).toThrow("at least two");
    expect(() =>
      serializeGraphPanelSvg([
        { graphId: "graph.1", displayName: "A", svgText: "<svg/>" },
        { graphId: "graph.2", displayName: "B", svgText: "not svg" },
      ]),
    ).toThrow("could not be parsed");
  });
});
