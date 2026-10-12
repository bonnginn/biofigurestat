import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import {
  createExperimentSetDraft,
  experimentCellKey,
  type ExperimentCellDraft,
} from "../../app/experimentDraft";
import { ExperimentGraphWorkbench } from "./ExperimentGraphWorkbench";

it("系列順序の未設定値は表示値と一致し、同順位でも初出順と再読込を保持する", () => {
  const base = createExperimentSetDraft("animal", "nested_continuous");
  const combinations = [
    ["Wild type", "Vehicle"],
    ["Wild type", "Stimulus"],
    ["Gene-perturbed", "Vehicle"],
    ["Gene-perturbed", "Stimulus"],
  ];
  const draft = {
    ...base,
    attributes: [
      { id: "attribute.genotype", label: "Genotype" },
      { id: "attribute.treatment", label: "Treatment" },
    ],
    conditions: combinations.map(([genotype, treatment], index) => ({
      id: `condition.${index + 1}`,
      label: `${genotype} / ${treatment}`,
      attributes: { "attribute.genotype": genotype!, "attribute.treatment": treatment! },
    })),
  };
  const cells: Record<string, ExperimentCellDraft> = {};
  draft.experiments.forEach((experiment, experimentIndex) => {
    draft.conditions.forEach((condition, conditionIndex) => {
      cells[
        experimentCellKey({
          experimentId: experiment.id,
          conditionId: condition.id,
          readoutId: draft.readouts[0]!.id,
        })
      ] = {
        kind: "nested_continuous",
        source: "manual",
        rawValues: [10 + experimentIndex + conditionIndex * 3],
      };
    });
  });
  const originalCells = JSON.stringify(cells);
  const onStateChange = vi.fn();
  const view = render(
    <ExperimentGraphWorkbench
      draft={draft}
      cells={cells}
      onClose={vi.fn()}
      onStateChange={onStateChange}
    />,
  );
  const inspectSeries = () =>
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: "series-style" },
    });
  const order = (label: string) =>
    within(screen.getByRole("group", { name: label })).getByRole("spinbutton", { name: "順序" });
  const legendLabels = () =>
    [
      ...screen
        .getByRole("img", { name: /実験単位ごとのグラフ/ })
        .querySelectorAll('[data-graph-layer="legend"] title'),
    ].map((element) => element.textContent);
  fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
    target: { value: "background" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "グラフの基本形" }), {
    target: { value: "bar" },
  });
  const barValues = () =>
    [
      ...screen
        .getByRole("img", { name: /実験単位ごとのグラフ/ })
        .querySelectorAll('[data-graph-layer="bar"]'),
    ].map((element) => Number(element.getAttribute("data-summary-value")));
  const originalBars = barValues();
  expect(originalBars).toHaveLength(4);
  inspectSeries();
  expect(order("Vehicle")).toHaveValue(0);
  expect(order("Stimulus")).toHaveValue(1);
  fireEvent.change(order("Vehicle"), { target: { value: "1" } });
  expect(legendLabels()).toEqual(["Vehicle", "Stimulus"]);
  expect(order("Stimulus")).toHaveValue(1);
  expect(barValues()).toEqual(originalBars);
  fireEvent.change(order("Vehicle"), { target: { value: "2" } });
  expect(legendLabels()).toEqual(["Stimulus", "Vehicle"]);
  expect(order("Stimulus")).toHaveValue(1);
  expect(barValues()).toEqual([originalBars[1], originalBars[0], originalBars[3], originalBars[2]]);
  const savedState = onStateChange.mock.calls.at(-1)![0];
  expect(JSON.stringify(savedState)).not.toContain("defaultSeriesOrder");
  expect(JSON.stringify(cells)).toBe(originalCells);
  view.unmount();
  render(
    <ExperimentGraphWorkbench
      draft={draft}
      cells={cells}
      onClose={vi.fn()}
      initialState={savedState}
    />,
  );
  inspectSeries();
  expect(order("Stimulus")).toHaveValue(1);
  expect(order("Vehicle")).toHaveValue(2);
  expect(legendLabels()).toEqual(["Stimulus", "Vehicle"]);
  expect(barValues()).toEqual([originalBars[1], originalBars[0], originalBars[3], originalBars[2]]);
});
