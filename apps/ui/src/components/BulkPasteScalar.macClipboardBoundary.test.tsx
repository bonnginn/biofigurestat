import { fireEvent, render, screen } from "@testing-library/react";
import { ExperimentDesignSchema } from "@lsaa/domain";
import {
  applyScalarValuesToCondition,
  createTwoConditionDataSheet,
  toCanonicalObservations,
  type TwoConditionDataSheet,
} from "@lsaa/data-sheet";

import { BulkPasteScalar } from "./BulkPasteScalar";

function measuredMatchedSheet() {
  const design = ExperimentDesignSchema.parse({
    schemaVersion: "0.2.0",
    id: "design.explicit-matched-paste",
    name: "Synthetic paired paste",
    purpose: "microscopy",
    outcomes: [{ id: "signal", key: "signal", label: "Signal", type: "continuous" }],
    factors: [
      {
        id: "treatment",
        key: "treatment",
        label: "Treatment",
        levels: [
          { id: "control", label: "Control", order: 0 },
          { id: "drug", label: "Drug", order: 1 },
        ],
      },
    ],
    conditions: [
      { id: "condition.control", label: "Control", factorLevels: { treatment: "control" } },
      { id: "condition.drug", label: "Drug", factorLevels: { treatment: "drug" } },
    ],
    unitLevels: [
      {
        id: "biological-unit",
        key: "biologicalunit",
        label: "Explicit matched unit",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "biological-unit",
    pairing: { kind: "matched", matchLevelId: "biological-unit", completePairsRequired: true },
    plannedN: 3,
    normalizationPlans: [],
    primaryContrast: {
      id: "control-drug",
      label: "Control vs Drug",
      conditionIds: ["condition.control", "condition.drug"],
    },
    wizardRuleVersion: "synthetic-existing-contract",
    wizardDecisions: [],
    createdAt: "2026-10-08T00:00:00.000Z",
  });
  const sheet = createTwoConditionDataSheet(design, "signal");
  if (sheet.relationship !== "matched")
    throw new Error("Use the existing explicit matched contract");
  sheet.rows.forEach((row, index) =>
    row.values.forEach((cell, condition) => {
      cell.measurement = { kind: "scalar", value: 77 + index + condition * 10 };
    }),
  );
  return sheet;
}

function renderMeasuredPaste() {
  let current: TwoConditionDataSheet = measuredMatchedSheet();
  const initial = JSON.stringify(current);
  const onApply = vi.fn(
    (
      conditionId: string,
      values: number[],
      source: { columnLabel: string; rowNumbers: number[] },
    ) => {
      current = applyScalarValuesToCondition(current, conditionId, values, source);
    },
  );
  render(<BulkPasteScalar sheet={current} onApply={onApply} />);
  const paste = (text: string) =>
    fireEvent.change(screen.getByRole("textbox", { name: "スカラー値を貼り付け" }), {
      target: { value: text },
    });
  const apply = () => fireEvent.click(screen.getByRole("button", { name: "選択した条件に適用" }));
  return { paste, apply, onApply, initial, current: () => current };
}

describe("received Mac clipboard fixes in the existing Windows scalar route", () => {
  it("stops an interior blank instead of shifting values into different explicit matched units", () => {
    const fixture = renderMeasuredPaste();
    fixture.paste("Mean\n10\n\n30");
    fixture.apply();
    expect(fixture.onApply).not.toHaveBeenCalled();
    expect(JSON.stringify(fixture.current())).toBe(fixture.initial);
    expect(screen.getByRole("alert")).toHaveTextContent("空欄: 2行");
    expect(screen.getByRole("button", { name: "選択した条件に適用" })).toBeDisabled();

    fixture.paste("Mean\n10\n20\n30");
    fixture.apply();
    expect(fixture.onApply).toHaveBeenCalledOnce();
    expect(fixture.onApply).toHaveBeenCalledWith("condition.control", [10, 20, 30], {
      columnLabel: "Mean",
      rowNumbers: [1, 2, 3],
    });
    const source = JSON.parse(fixture.initial) as ReturnType<typeof measuredMatchedSheet>;
    const updated = fixture.current();
    if (updated.relationship !== "matched") throw new Error("Matched design must remain matched");
    expect(updated.rows.map(({ id, experimentalUnitId }) => ({ id, experimentalUnitId }))).toEqual(
      source.rows.map(({ id, experimentalUnitId }) => ({ id, experimentalUnitId })),
    );
    expect(updated.rows.map(({ values }) => values[1])).toEqual(
      source.rows.map(({ values }) => values[1]),
    );
    const canonical = toCanonicalObservations(updated, "raw.synthetic-paste");
    expect(canonical.success).toBe(true);
    if (canonical.success) {
      expect(canonical.observations).toHaveLength(6);
      expect(new Set(canonical.observations.map(({ unitInstanceId }) => unitInstanceId)).size).toBe(
        3,
      );
    }
  });

  it("rejects a misplaced quote instead of silently turning 1-doublequote-2-doublequote into 12", () => {
    const fixture = renderMeasuredPaste();
    fixture.paste('Label,Mean\nD1,1"2"\nD2,3');
    fixture.apply();
    expect(fixture.onApply).not.toHaveBeenCalled();
    expect(JSON.stringify(fixture.current())).toBe(fixture.initial);
    expect(screen.getByRole("alert")).toHaveTextContent(/非数値|引用符/);
    expect(screen.getByRole("button", { name: "選択した条件に適用" })).toBeDisabled();
  });

  it("imports legal multiline CSV as three logical observations without manufacturing extra units", () => {
    const fixture = renderMeasuredPaste();
    fixture.paste('Label,Mean\n"Dish\nA",10\n"Dish\nB",20\n"Dish\nC",30');
    fixture.apply();
    expect(fixture.onApply).toHaveBeenCalledWith("condition.control", [10, 20, 30], {
      columnLabel: "Mean",
      rowNumbers: [1, 2, 3],
    });
    const source = JSON.parse(fixture.initial) as ReturnType<typeof measuredMatchedSheet>;
    const updated = fixture.current();
    if (updated.relationship !== "matched") throw new Error("Matched design must remain matched");
    expect(updated.rows).toHaveLength(3);
    expect(updated.rows.map(({ id, experimentalUnitId }) => ({ id, experimentalUnitId }))).toEqual(
      source.rows.map(({ id, experimentalUnitId }) => ({ id, experimentalUnitId })),
    );
    expect(updated.rows.map(({ values }) => values[1])).toEqual(
      source.rows.map(({ values }) => values[1]),
    );
  });
});


describe('B03 apply boundary preserves original data',()=>{
 for(const text of ['1,234\n2,345','A\t10\nB\t20','<0.1\n0.2']) it('blocks ambiguous input '+text,()=>{
 const fixture=renderMeasuredPaste();fixture.paste(text);fixture.apply();expect(fixture.onApply).not.toHaveBeenCalled();expect(JSON.stringify(fixture.current())).toBe(fixture.initial);expect(screen.getByRole('alert')).toHaveTextContent('曖昧');expect(screen.getByRole('textbox',{name:'スカラー値を貼り付け'})).toHaveValue(text);
 });
});
