import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { recommendD03, recommendD04, recommendD05 } from "@lsaa/analysis-contracts";
import type { ExperimentDesign } from "@lsaa/domain";
import {
  createIndependentMultiConditionDataSheet,
  createRepeatedConditionDataSheet,
} from "@lsaa/data-sheet";

import { MultiConditionDataSheetPage } from "./MultiConditionDataSheetPage";

function designFixture(options: {
  id: string;
  conditionLabels: string[];
  outcomeType?: "continuous" | "percentage" | "proportion_counts";
  matched?: boolean;
  factors?: ExperimentDesign["factors"];
}): ExperimentDesign {
  const factors = options.factors ?? [
    {
      id: "factor.condition",
      key: "condition",
      label: "Condition",
      levels: options.conditionLabels.map((label, index) => ({
        id: `level.${index}`,
        label,
        order: index,
      })),
    },
  ];
  const primaryConditionIds = options.conditionLabels
    .slice(0, 2)
    .map((_, index) => `condition.${index}`);
  return {
    schemaVersion: "0.2.0",
    id: options.id,
    name: options.id,
    purpose: "microscopy",
    outcomes: [
      {
        id: "outcome.value",
        key: "value",
        label: "測定値",
        type: options.outcomeType ?? "continuous",
      },
    ],
    factors,
    conditions: options.conditionLabels.map((label, index) => ({
      id: `condition.${index}`,
      label,
      factorLevels:
        factors.length === 1
          ? { [factors[0].id]: factors[0].levels[index].id }
          : {
              [factors[0].id]: factors[0].levels[Math.floor(index / 2)].id,
              [factors[1].id]: factors[1].levels[index % 2].id,
            },
    })),
    unitLevels: [
      {
        id: "unit.dish",
        key: "dish",
        label: "Dish",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "unit.dish",
    pairing: options.matched
      ? { kind: "matched", matchLevelId: "unit.dish", completePairsRequired: true }
      : { kind: "independent" },
    plannedN: 3,
    normalizationPlans: [],
    primaryContrast: {
      id: "contrast.primary",
      label: "Primary contrast",
      conditionIds: [primaryConditionIds[0], primaryConditionIds[1]],
    },
    wizardRuleVersion: "test",
    wizardDecisions: [],
    createdAt: "2026-08-20T00:00:00.000Z",
  };
}

function renderSheet(
  design: ExperimentDesign,
  recommendation: Parameters<typeof MultiConditionDataSheetPage>[0]["recommendation"],
) {
  const sheet =
    recommendation.templateId === "D04"
      ? createRepeatedConditionDataSheet(design, "outcome.value")
      : createIndependentMultiConditionDataSheet(design, "outcome.value");
  render(
    <MultiConditionDataSheetPage
      design={design}
      recommendation={recommendation}
      sheet={sheet}
      outcomeLabel="測定値"
      onBack={() => undefined}
    />,
  );
}

describe("MultiConditionDataSheetPage input grid", () => {
  it("uses N tabs and edits an independent date only for the selected condition", () => {
    const design = designFixture({
      id: "design.d03.grid",
      conditionLabels: ["条件A", "条件B", "条件C"],
    });
    const match = recommendD03(design);
    if (!match.matched) throw new Error("D03 fixture should match");
    renderSheet(design, match.recommendation);

    const replicateTabs = within(
      screen.getByRole("tablist", { name: "実験単位の選択" }),
    ).getAllByRole("tab");
    expect(replicateTabs.map((tab) => tab.textContent)).toEqual(["N1", "N2", "N3"]);
    expect(screen.getByText(/条件間の統計的なペア/)).toBeVisible();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);

    const conditionADate = screen.getByLabelText("条件A 実験単位 1：実験日");
    const conditionBDate = screen.getByLabelText("条件B 実験単位 1：実験日");
    const conditionAValue = screen.getByRole("spinbutton", {
      name: "条件A 実験単位 1",
    });
    fireEvent.change(conditionADate, { target: { value: "2026-08-01" } });
    expect(conditionADate).toHaveValue("2026-08-01");
    expect(conditionBDate).toHaveValue("2026-08-20");

    fireEvent.keyDown(conditionADate, { key: "ArrowRight" });
    expect(document.activeElement).toBe(conditionAValue);
    fireEvent.keyDown(conditionAValue, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("spinbutton", { name: "条件B 実験単位 1" }),
    );

    fireEvent.click(screen.getByRole("tab", { name: "N2" }));
    expect(screen.getByLabelText("条件A 実験単位 2：実験日")).toHaveValue("2026-08-20");
  });

  it("applies one repeated-unit date edit to every condition row", () => {
    const design = designFixture({
      id: "design.d04.grid",
      conditionLabels: ["前", "中", "後"],
      matched: true,
    });
    const match = recommendD04(design);
    if (!match.matched) throw new Error("D04 fixture should match");
    renderSheet(design, match.recommendation);

    fireEvent.change(screen.getByLabelText("前 実験単位 1：実験日"), {
      target: { value: "2026-08-03" },
    });
    expect(screen.getByLabelText("中 実験単位 1：実験日")).toHaveValue("2026-08-03");
    expect(screen.getByLabelText("後 実験単位 1：実験日")).toHaveValue("2026-08-03");
    expect(screen.getByText(/同じNの実験日を変更すると/)).toBeVisible();
  });

  it("renders proportion counts as positive, total, and percentage columns", () => {
    const design = designFixture({
      id: "design.d03.proportion-grid",
      conditionLabels: ["条件A", "条件B", "条件C"],
      outcomeType: "proportion_counts",
    });
    const match = recommendD03(design);
    if (!match.matched) throw new Error("D03 proportion fixture should match");
    renderSheet(design, match.recommendation);

    const table = screen.getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["条件", "実験日", "陽性細胞数", "総細胞数", "割合"]);
    fireEvent.change(screen.getByLabelText("条件A 実験単位 1：陽性細胞数"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("条件A 実験単位 1：総細胞数"), {
      target: { value: "10" },
    });
    expect(screen.getByLabelText("条件A 実験単位 1：計算された割合")).toHaveTextContent("40.0%");
  });

  it("keeps every D05 Cartesian condition visible as one vertical row", () => {
    const factorA = {
      id: "factor.a",
      key: "a",
      label: "処置A",
      levels: ["A1", "A2", "A3", "A4"].map((label, index) => ({
        id: `level.a.${index}`,
        label,
        order: index,
      })),
    };
    const factorB = {
      id: "factor.b",
      key: "b",
      label: "処置B",
      levels: ["B−", "B＋"].map((label, index) => ({
        id: `level.b.${index}`,
        label,
        order: index,
      })),
    };
    const labels = factorA.levels.flatMap((a) =>
      factorB.levels.map((b) => `${a.label} / ${b.label}`),
    );
    const design = designFixture({
      id: "design.d05.grid",
      conditionLabels: labels,
      factors: [factorA, factorB],
    });
    const match = recommendD05(design);
    if (!match.matched) throw new Error("D05 fixture should match");
    renderSheet(design, match.recommendation);

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(9);
    expect(within(table).getByRole("rowheader", { name: "A4 / B＋" })).toBeVisible();
  });
});
