import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createHeatmapModel, createKaplanMeierGraphModel } from "@lsaa/graph-spec";
import { serializeGraphSvg } from "../../app/graphExport";
import { HeatmapGraph } from "./HeatmapGraph";
import { SurvivalGraph } from "./SurvivalGraph";

describe("specialized Core graphs", () => {
  it("renders Kaplan–Meier steps, censor marks, and a risk table into exportable SVG", () => {
    const model = createKaplanMeierGraphModel(
      [
        { id: "A", label: "Control" },
        { id: "B", label: "Treatment" },
      ],
      [
        {
          observationId: "o1",
          experimentalUnitId: "u1",
          conditionId: "A",
          followUpTime: 2,
          eventObserved: true,
        },
        {
          observationId: "o2",
          experimentalUnitId: "u2",
          conditionId: "A",
          followUpTime: 4,
          eventObserved: false,
        },
        {
          observationId: "o3",
          experimentalUnitId: "u3",
          conditionId: "B",
          followUpTime: 3,
          eventObserved: true,
        },
        {
          observationId: "o4",
          experimentalUnitId: "u4",
          conditionId: "B",
          followUpTime: 5,
          eventObserved: false,
        },
      ],
    );
    const ref = createRef<SVGSVGElement>();
    render(<SurvivalGraph ref={ref} model={model} timeLabel="Days" />);
    expect(screen.getByText("Number at risk")).toBeVisible();
    expect(screen.getByText("0.25")).toBeVisible();
    expect(screen.getByText("0.5")).toBeVisible();
    expect(screen.getByText("0.75")).toBeVisible();
    expect(ref.current?.querySelectorAll("path")).toHaveLength(2);
    expect(serializeGraphSvg(ref.current!)).toContain("Kaplan–Meier survival graph");

    render(<SurvivalGraph model={model} annotation="log-rank: χ²(1) = 0.972, p = 0.324" />);
    expect(screen.getByText("log-rank: χ²(1) = 0.972, p = 0.324")).toHaveAttribute(
      "data-graph-layer",
      "statistics-annotation",
    );
  });

  it("renders long heatmap labels, missing cells, values, and exportable SVG", () => {
    const model = createHeatmapModel(
      {
        version: "0.1.0",
        rowIds: ["r1", "r2"],
        rowLabels: ["A very long biological readout label", "B"],
        columnIds: ["c1", "c2", "c3"],
        columnLabels: ["Sample one", "Sample two", "Sample three"],
        values: [
          [1, null, 2],
          [2, 3, 4],
        ],
      },
      "row_z_score",
    );
    const ref = createRef<SVGSVGElement>();
    render(<HeatmapGraph ref={ref} model={model} showCellValues />);
    expect(screen.getByText("A very long biological readout label")).toBeVisible();
    expect(ref.current?.querySelector('[data-missing="true"]')).not.toBeNull();
    expect(serializeGraphSvg(ref.current!)).toContain("row_z_score");
  });
});
