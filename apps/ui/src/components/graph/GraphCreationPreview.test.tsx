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

describe("CurrentDataGraphPreview scientific integrity", () => {
  it("anchors bar previews to a zero-containing domain", () => {
    const { draft, cells } = previewFixture();
    render(<CurrentDataGraphPreview type="bar" draft={draft} cells={cells} />);

    const graph = screen.getByRole("img", { name: /barで現在のデータ/ });
    expect(Number(graph.getAttribute("data-domain-min"))).toBeLessThanOrEqual(0);
    expect(Number(graph.getAttribute("data-domain-max"))).toBeGreaterThan(0);
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
});
