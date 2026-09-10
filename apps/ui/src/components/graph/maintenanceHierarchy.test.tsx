import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { groupedCategoryFixture } from "./groupedCategory.testSupport";
import { ExperimentGraphWorkbench } from "./ExperimentGraphWorkbench";
import { CurrentDataGraphPreview } from "./GraphCreationPreview";
import { graphSignificanceSymbol } from "./graphValueFormatting";
import { CanonicalMatrixWorksheet } from "../CanonicalMatrixWorksheet";
import { StructureContractSchema } from "@lsaa/domain";

it("enables dates in padding rows without changing observations", () => {
  const { draft } = groupedCategoryFixture();
  const onRowChange = vi.fn();
  const onObservationsChange = vi.fn();
  const view = render(
    <CanonicalMatrixWorksheet
      tableId="date-padding"
      contract={draft.adaptiveInput!.contract}
      observations={[]}
      rows={[{ key: "first", label: "First", date: "2026-08-22" }]}
      showExperimentDate
      onRowChange={onRowChange}
      onObservationsChange={onObservationsChange}
      nextObservationId={() => "unused"}
    />,
  );
  const dates = view.container.querySelectorAll('input[type="date"]');
  expect(dates).toHaveLength(5);
  dates.forEach((date) => expect(date).toBeEnabled());
  fireEvent.change(dates[1], { target: { value: "2026-08-26" } });
  fireEvent.change(dates[2], { target: { value: "2026-08-28" } });
  expect(onRowChange).toHaveBeenCalledWith(1, { date: "2026-08-26" });
  expect(onRowChange).toHaveBeenCalledWith(2, { date: "2026-08-28" });
  expect(onObservationsChange).not.toHaveBeenCalled();
});

it("retains all six categories at equal spacing with parent clearance", () => {
  const { draft, cells } = groupedCategoryFixture();
  const before = JSON.stringify({ draft, cells });
  render(<ExperimentGraphWorkbench draft={draft} cells={cells} onClose={vi.fn()} />);
  const svg = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
  const parent = svg.querySelector('[data-condition-parent-label="Tagged"]')!;
  expect(svg.querySelectorAll('[data-condition-parent-label="Tagged"]')).toHaveLength(1);
  const xs = ["WT", "Parent", "#2", "#3", "#10", "#11"].map((label) =>
    Number(svg.querySelector(`[data-condition-level-label="${label}"]`)!.getAttribute("x")),
  );
  xs.slice(1).forEach((x, i) => expect(x - xs[i]).toBeCloseTo(xs[1] - xs[0]));
  const line = parent.parentElement!.querySelector("line")!;
  const child = svg.querySelector('[data-condition-level-label="#2"]')!;
  expect(Number(line.getAttribute("y1")) - Number(child.getAttribute("y"))).toBeGreaterThanOrEqual(
    14,
  );
  expect(Number(parent.getAttribute("y")) - Number(line.getAttribute("y1"))).toBeGreaterThanOrEqual(
    20,
  );
  expect(JSON.stringify({ draft, cells })).toBe(before);
  cleanup();
  render(<CurrentDataGraphPreview type="dot" draft={draft} cells={cells} />);
  expect(
    screen.getByRole("img").querySelectorAll('[data-preview-category-label="Tagged"]'),
  ).toHaveLength(1);
});

it("does not interpret invalid p values as significant or nonsignificant", () => {
  [NaN, Infinity, -Infinity, -0.1, 1.1].forEach((p) =>
    expect(graphSignificanceSymbol(p)).toBe("—"),
  );
});

it("merges saved parent headers without merging clone values", () => {
  const { draft } = groupedCategoryFixture();
  const input = draft.adaptiveInput!;
  const before = JSON.stringify(input);
  const onObservationsChange = vi.fn();
  const view = render(
    <CanonicalMatrixWorksheet
      tableId="grouped-sheet"
      contract={input.contract}
      observations={input.canonicalObservations}
      conditionBlocks={input.biologicalSetup?.conditionBlocks}
      onObservationsChange={onObservationsChange}
      nextObservationId={() => "unused"}
    />,
  );
  expect(screen.getByRole("columnheader", { name: "Tagged" })).toHaveAttribute("colspan", "4");
  expect(screen.getByRole("columnheader", { name: "WT" })).toHaveAttribute("rowspan", "2");
  expect(screen.getByRole("columnheader", { name: "Parent" })).toHaveAttribute("rowspan", "2");
  ["#2", "#3", "#10", "#11"].forEach((name) =>
    expect(screen.getByRole("columnheader", { name })).toBeVisible(),
  );
  expect(JSON.stringify(input)).toBe(before);
  expect(onObservationsChange).not.toHaveBeenCalled();
  view.rerender(
    <CanonicalMatrixWorksheet
      tableId="grouped-sheet"
      contract={input.contract}
      observations={input.canonicalObservations}
      onObservationsChange={onObservationsChange}
      nextObservationId={() => "unused"}
    />,
  );
  expect(screen.queryByRole("columnheader", { name: "Tagged" })).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Tagged / #2" })).toBeVisible();
});

it("keeps grouped count columns aligned when dates and explicit IDs are shown", () => {
  const { draft } = groupedCategoryFixture();
  const input = draft.adaptiveInput!;
  const contract = StructureContractSchema.parse({
    ...input.contract,
    readouts: [
      {
        ...input.contract.readouts[0],
        key: "rate",
        label: "Positive cells",
        valueType: "proportion_counts",
        representation: "proportion_counts",
        componentKeys: ["numerator", "denominator"],
      },
    ],
  });
  const onObservationsChange = vi.fn();
  render(
    <CanonicalMatrixWorksheet
      tableId="grouped-counts"
      contract={contract}
      observations={[]}
      conditionBlocks={input.biologicalSetup?.conditionBlocks}
      showExperimentDate
      onRowChange={vi.fn()}
      onObservationsChange={onObservationsChange}
      nextObservationId={() => "unused"}
    />,
  );
  expect(screen.getByRole("columnheader", { name: "Tagged" })).toHaveAttribute("colspan", "12");
  expect(screen.getByRole("columnheader", { name: "WT" })).toHaveAttribute("colspan", "3");
  expect(screen.getByRole("columnheader", { name: "実験日*" })).toHaveAttribute("rowspan", "3");
  expect(screen.queryByRole("rowheader", { name: "測定項目" })).toBeNull();
  expect(screen.getByText("条件別シート — Positive cells")).toBeVisible();
  expect(screen.queryAllByRole("columnheader", { name: "Positive cells" })).toHaveLength(0);
  expect(screen.getAllByRole("columnheader", { name: "該当数" })).toHaveLength(6);
  expect(screen.getAllByRole("columnheader", { name: "総数" })).toHaveLength(6);
  expect(screen.getAllByRole("columnheader", { name: "計算値 (%)" })).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "対象・試料IDを表示／編集" }));
  expect(screen.getByRole("columnheader", { name: "Tagged" })).toHaveAttribute("colspan", "16");
  expect(screen.getByRole("columnheader", { name: "WT" })).toHaveAttribute("colspan", "4");
  expect(screen.getByRole("columnheader", { name: "#2" })).toHaveAttribute("colspan", "4");
  expect(onObservationsChange).not.toHaveBeenCalled();
  expect(contract.matching.kind).toBe("independent");
});
