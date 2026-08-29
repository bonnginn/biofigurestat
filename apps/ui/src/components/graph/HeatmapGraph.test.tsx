import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { serializeGraphSvg } from "../../app/graphExport";
import { HeatmapGraph } from "./HeatmapGraph";

describe("HeatmapGraph", () => {
  it("uses the persisted palette and includes a required color-scale legend in export", () => {
    render(
      <HeatmapGraph
        model={{
          type: "heatmap",
          raw: {
            version: "0.1.0",
            rowIds: ["row.1"],
            rowLabels: ["Protein A"],
            columnIds: ["column.1", "column.2"],
            columnLabels: ["Control", "Drug"],
            values: [[0, 10]],
          },
          values: [[0, 10]],
          transform: { kind: "none", version: "0.1.0" },
          range: { min: 0, max: 10 },
        }}
        palette={["#000000", "#ffffff"]}
        missingColor="#abcdef"
      />,
    );

    const svg = screen.getByRole("img", { name: "Heatmap" }) as unknown as SVGSVGElement;
    expect(svg.querySelector('[data-graph-layer="color-scale-legend"]')).not.toBeNull();
    expect(svg.querySelector('stop[stop-color="#000000"]')).not.toBeNull();
    expect(svg.querySelector('stop[stop-color="#ffffff"]')).not.toBeNull();
    expect(svg).toHaveTextContent("Value");
    expect(svg).toHaveTextContent("Missing");
    const exported = serializeGraphSvg(svg);
    expect(exported).toContain('data-graph-layer="color-scale-legend"');
    expect(exported).toContain("#abcdef");
  });
});
