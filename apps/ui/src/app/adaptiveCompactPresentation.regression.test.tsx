import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CanonicalAdaptiveObservationSchema,
  StructureContractSchema,
  type CanonicalAdaptiveObservation,
  type StructureContract,
} from "@lsaa/domain";

import { createAdaptiveWorkspace } from "./adaptiveWorkspace";
import { ExperimentWorkspace } from "../pages/ExperimentWorkspace";

function scalarContract(): StructureContract {
  return StructureContractSchema.parse({
    schemaVersion: "0.1.0",
    contractId: "adaptive-compact-production.fixture",
    experimentName: "Independent dish response",
    experimentDescription: "Independent culture dishes received different treatments.",
    unitLevels: [
      { key: "dish", label: "Culture dish", role: "experimental_unit", parentKey: null },
    ],
    experimentalUnitLevelKey: "dish",
    identities: [{ key: "dish_id", label: "Dish ID", unitLevelKey: "dish", required: true }],
    factors: [
      {
        key: "treatment",
        label: "Treatment",
        levels: ["Control", "Drug"],
        unitRole: "between_unit",
        relationship: "independent",
        ordered: false,
        referenceLevel: "Control",
      },
    ],
    matching: { kind: "independent", identityKey: null, completeSetsRequired: null },
    orderedAxes: [],
    readouts: [
      {
        key: "signal",
        label: "Signal",
        valueType: "scalar",
        representation: "scalar",
        componentKeys: ["value"],
        referenceRole: "none",
        observationLevelKey: "dish",
        axisKeys: [],
      },
    ],
    allowedMissingness: ["unknown", "not_collected"],
    rawObservationGrain: "one culture dish observation",
  });
}

function observation(
  contract: StructureContract,
  id: string,
  dish: string,
  treatment: string,
  value: number | null,
): CanonicalAdaptiveObservation {
  return CanonicalAdaptiveObservationSchema.parse({
    observationId: id,
    readoutKey: contract.readouts[0]!.key,
    identities: { dish_id: dish },
    factors: { treatment },
    axes: {},
    hierarchy: {},
    values: { signal: value },
    missingness: value === null ? { signal: "not_collected" } : {},
    sourceRow: null,
  });
}

describe("adaptive compact presentation production path", () => {
  it("adds the safe multi-value view without changing the production workspace contract", () => {
    const contract = scalarContract();
    const workspace = createAdaptiveWorkspace({
      contract,
      observations: [
        observation(contract, "obs.control.1", "dish-c1", "Control", 10),
        observation(contract, "obs.control.2", "dish-c2", "Control", 12),
        observation(contract, "obs.drug.1", "dish-d1", "Drug", 15),
      ],
      mapping: null,
      lineage: null,
      now: "2026-08-28T00:00:00.000Z",
    });
    expect(workspace.status).toBe("ready");
    if (!workspace.draft) throw new Error("fixture workspace was not created");

    render(
      <ExperimentWorkspace
        initialDraft={workspace.draft}
        initialCells={workspace.cells}
        onBack={vi.fn()}
        analysisAvailable={false}
      />,
    );

    expect(screen.getByRole("table", { name: "条件別連続入力表" })).toBeVisible();
    const conditionCounts = screen.getByRole("list", { name: "条件ごとの入力件数" });
    expect(within(conditionCounts).getByText("Control")).toBeVisible();
    expect(within(conditionCounts).getByText("実験単位 n=2")).toBeVisible();
    expect(within(conditionCounts).getByText("Drug")).toBeVisible();
    expect(within(conditionCounts).getByText("実験単位 n=1")).toBeVisible();
    const compactButton = screen.getByRole("button", { name: "まとめて入力" });
    expect(compactButton).toBeVisible();

    fireEvent.click(compactButton);
    const compact = screen.getByRole("table", { name: "条件ごとにまとめて入力" });
    const control = within(compact).getByRole("textbox", {
      name: "Signal・Treatment=Controlの測定値",
    });
    fireEvent.change(control, { target: { value: "20\n22\n24" } });
    fireEvent.blur(control);

    fireEvent.click(screen.getByRole("button", { name: "1測定1行" }));
    const expanded = screen.getByRole("table", { name: "すべての値を表示" });
    expect(within(expanded).getByRole("textbox", { name: "dish-c1のDish ID" })).toHaveValue(
      "dish-c1",
    );
    expect(within(expanded).getByRole("textbox", { name: "dish-c2のDish ID" })).toHaveValue(
      "dish-c2",
    );
    expect(within(expanded).getByRole("textbox", { name: "Control 3のDish ID" })).toHaveAttribute(
      "data-observation-id",
      "adaptive.adaptive-compact-production.fixture.direct.1",
    );
    expect(within(expanded).getByRole("textbox", { name: "dish-c1のSignal" })).toHaveValue("20");
    expect(within(expanded).getByRole("textbox", { name: "dish-c2のSignal" })).toHaveValue("22");
    expect(within(expanded).getByRole("textbox", { name: "Control 3のSignal" })).toHaveValue("24");

    // Returning to the compact view is a projection change only: no IDs are
    // regenerated and no values are pre-aggregated into a summary statistic.
    fireEvent.click(screen.getByRole("button", { name: "まとめて入力" }));
    expect(
      within(screen.getByRole("table", { name: "条件ごとにまとめて入力" })).getByRole("textbox", {
        name: "Signal・Treatment=Controlの測定値",
      }),
    ).toHaveValue("20\n22\n24");
  });
});
