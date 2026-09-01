import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createExperimentSetDraft,
  experimentCellKey,
  type ExperimentCellMap,
} from "../../app/experimentDraft";
import { CurrentDataGraphPreview } from "./GraphCreationPreview";

function previewFixture() {
  const base = createExperimentSetDraft("cell_culture", "nested_continuous");
  const draft = {
    ...base,
    conditions: [
      { ...base.conditions[0]!, label: "Vehicle", attributes: { "attribute.1": "Vehicle" } },
      { ...base.conditions[1]!, label: "Drug A", attributes: { "attribute.1": "Drug A" } },
    ],
  };
  const values = [0.72, 0.8, 0.88, 1.4, 1.5, 1.62];
  const mutableCells: Record<string, ExperimentCellMap[string]> = {};
  draft.conditions.forEach((condition, conditionIndex) => {
    draft.experiments.forEach((experiment, experimentIndex) => {
      const value = values[conditionIndex * draft.experiments.length + experimentIndex]!;
      mutableCells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0]!.id,
        })
      ] = { kind: "nested_continuous", rawValues: [value], source: "manual" };
    });
  });
  return { draft, cells: mutableCells as ExperimentCellMap };
}

function compositionFixture() {
  const base = createExperimentSetDraft("cell_culture", "categorical_counts");
  const draft = {
    ...base,
    conditions: base.conditions.map((condition, index) => ({
      ...condition,
      label: `Condition ${index + 1}`,
      attributes: { "attribute.1": `Condition ${index + 1}` },
    })),
  };
  const mutableCells: Record<string, ExperimentCellMap[string]> = {};
  draft.conditions.forEach((condition, conditionIndex) => {
    mutableCells[
      experimentCellKey({
        experimentId: draft.experiments[0]!.id,
        conditionId: condition.id,
        readoutId: draft.readouts[0]!.id,
      })
    ] = {
      kind: "categorical_counts",
      counts: {
        "category.1": 5 + conditionIndex,
        "category.2": 3,
        "category.3": 2,
      },
    };
  });
  return { draft, cells: mutableCells as ExperimentCellMap };
}

describe("CurrentDataGraphPreview scientific integrity", () => {
  it("anchors bar previews to a zero-containing domain", () => {
    const { draft, cells } = previewFixture();
    render(<CurrentDataGraphPreview type="bar" draft={draft} cells={cells} />);

    const graph = screen.getByRole("img", { name: /barで現在のデータ/ });
    expect(Number(graph.getAttribute("data-domain-min"))).toBeLessThanOrEqual(0);
    expect(Number(graph.getAttribute("data-domain-max"))).toBeGreaterThan(0);
  });

  it("uses shared plot bounds and renders non-overlapping axis context", () => {
    const { draft, cells } = previewFixture();
    render(<CurrentDataGraphPreview type="dot" draft={draft} cells={cells} />);

    const graph = screen.getByRole("img", { name: /dotで現在のデータ/ });
    const plotLeft = Number(graph.getAttribute("data-plot-left"));
    const plotRight = Number(graph.getAttribute("data-plot-right"));
    const plotTop = Number(graph.getAttribute("data-plot-top"));
    const plotBottom = Number(graph.getAttribute("data-plot-bottom"));
    const yTitle = screen.getByText("細胞強度 (a.u.)");

    expect({ plotLeft, plotRight, plotTop, plotBottom }).toEqual({
      plotLeft: 70,
      plotRight: 340,
      plotTop: 22,
      plotBottom: 222,
    });
    expect(graph.querySelectorAll("[data-preview-y-tick]").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("条件")).toBeVisible();
    expect(Number(yTitle.getAttribute("x"))).toBeLessThan(plotLeft);
  });

  it("uses a sampled density outline instead of a min-max silhouette for violin previews", () => {
    const { draft, cells } = previewFixture();
    render(
      <CurrentDataGraphPreview
        type="violin"
        draft={draft}
        cells={cells}
        layers={{
          raw: true,
          experiment: true,
          overall: true,
          errorBar: false,
          connectingLine: false,
          box: false,
          violin: true,
          distribution: false,
        }}
      />,
    );

    const path = screen
      .getByRole("img", { name: /violinで現在のデータ/ })
      .querySelector('[data-graph-layer="violin"]');
    expect(path?.getAttribute("d")?.match(/ L /g)?.length).toBeGreaterThan(40);
    expect(path?.getAttribute("d")).not.toContain(" C ");
  });

  it("pads scatter points away from axes and renders shared nice ticks", () => {
    const { draft, cells } = previewFixture();
    render(<CurrentDataGraphPreview type="scatter" draft={draft} cells={cells} />);

    const graph = screen.getByRole("img", { name: /散布図preview/ });
    expect(Number(graph.getAttribute("data-domain-x-min"))).toBeLessThan(0.72);
    expect(Number(graph.getAttribute("data-domain-x-max"))).toBeGreaterThan(0.88);
    expect(Number(graph.getAttribute("data-domain-y-min"))).toBeLessThan(1.4);
    expect(Number(graph.getAttribute("data-domain-y-max"))).toBeGreaterThan(1.62);
    expect(graph.querySelectorAll("[data-preview-x-tick]").length).toBeGreaterThanOrEqual(2);
    expect(graph.querySelectorAll("[data-preview-y-tick]").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps wide composition previews scrollable with axes, labels, and legend", () => {
    const { draft, cells } = compositionFixture();
    render(<CurrentDataGraphPreview type="stacked_100" draft={draft} cells={cells} />);

    const graph = screen.getByRole("img", { name: /カテゴリ構成/ });
    const viewBoxWidth = Number(graph.getAttribute("viewBox")?.split(" ")[2]);
    expect(viewBoxWidth).toBeGreaterThan(620);
    expect(graph.querySelectorAll("[data-preview-y-tick]")).toHaveLength(5);
    expect(screen.getAllByText("Condition 10")[0]).toBeVisible();
    expect(screen.getByText("Category A")).toBeVisible();
    expect(screen.getByText("カテゴリ構成 (%)")).toBeVisible();
  });
});
