import { fireEvent, render, screen } from "@testing-library/react";

import type { TwoConditionDataSheet } from "@lsaa/data-sheet";

import { NestedImageJPaste, type NestedImageJPastePayload } from "./NestedImageJPaste";

function sheetFixture(): TwoConditionDataSheet {
  return {
    schemaVersion: "0.1.0",
    designId: "design.microscopy",
    outcomeId: "outcome.intensity",
    experimentalUnitLevelId: "unit.dish",
    conditions: [
      { id: "condition.control", label: "対照" },
      { id: "condition.treatment", label: "処理" },
    ],
    relationship: "independent",
    columns: [
      {
        conditionId: "condition.control",
        entries: [
          {
            id: "entry.control.1",
            label: "生物学的反復 1",
            experimentalUnitId: "unit.dish.control.1",
            experimentDate: "2026-08-20",
            measurement: { kind: "scalar", value: null },
          },
          {
            id: "entry.control.2",
            label: "生物学的反復 2",
            experimentalUnitId: "unit.dish.control.2",
            experimentDate: "2026-08-21",
            measurement: { kind: "scalar", value: null },
          },
        ],
      },
      {
        conditionId: "condition.treatment",
        entries: [
          {
            id: "entry.treatment.1",
            label: "生物学的反復 1",
            experimentalUnitId: "unit.dish.treatment.1",
            experimentDate: "2026-08-20",
            measurement: { kind: "scalar", value: null },
          },
          {
            id: "entry.treatment.2",
            label: "生物学的反復 2",
            experimentalUnitId: "unit.dish.treatment.2",
            experimentDate: "2026-08-21",
            measurement: { kind: "scalar", value: null },
          },
        ],
      },
    ],
  };
}

describe("NestedImageJPaste", () => {
  it("requires explicit replicate assignment and returns raw rows plus D10 lineage", () => {
    let payload: NestedImageJPastePayload | null = null;
    render(
      <NestedImageJPaste
        sheet={sheetFixture()}
        rawRevisionId="raw.imagej.1"
        onApply={(next) => {
          payload = next;
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /ImageJの細胞・ROI行を実験単位ごとに要約/ }),
    );
    expect(screen.getByText("細胞・ROIの単位別まとめ")).toBeVisible();
    expect(screen.getByText("ImageJの細胞・ROI行を実験単位ごとにまとめる")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "ImageJの細胞・ROI行を貼り付け" }), {
      target: { value: "Area\tMean\n120\t10\n130\t20\n140\t30" },
    });

    expect(screen.getByRole("button", { name: "要約値をデータシートへ適用" })).toBeDisabled();
    const assignments = screen.getAllByRole("combobox", { name: /ImageJ行 .*実験単位/ });
    fireEvent.change(assignments[0], { target: { value: "0" } });
    fireEvent.change(assignments[1], { target: { value: "0" } });
    fireEvent.change(assignments[2], { target: { value: "1" } });

    expect(screen.getByText(/実験単位 1：15\.000/)).toBeVisible();
    expect(screen.getByText(/実験単位 2：30\.000/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "要約値をデータシートへ適用" }));

    expect(payload).not.toBeNull();
    const captured = payload as unknown as NestedImageJPastePayload;
    expect(captured.rawRevisionId).toBe("raw.imagej.1");
    expect(captured.observations).toHaveLength(3);
    expect(captured.observations.map((observation) => observation.experimentDate)).toEqual([
      "2026-08-20",
      "2026-08-20",
      "2026-08-21",
    ]);
    expect(
      captured.unitInstances.filter((unit) => unit.levelId === "unit.imagej-row"),
    ).toHaveLength(3);
    expect(captured.summaries.map((summary) => summary.value)).toEqual([15, 30]);
    expect(captured.summaries.map((summary) => summary.subsampleCount)).toEqual([2, 1]);
    expect(captured.transformation.method).toBe("replicate_summary");
    expect(captured.transformation.parameters).toMatchObject({
      center: "mean",
      experimentalUnitLevelId: "unit.dish",
    });
  });

  it("均等分割は未割当行だけを行順に割り当て、各反復の要約を有効にする", () => {
    render(
      <NestedImageJPaste
        sheet={sheetFixture()}
        rawRevisionId="raw.imagej.bulk"
        onApply={() => undefined}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /ImageJの細胞・ROI行を実験単位ごとに要約/ }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "ImageJの細胞・ROI行を貼り付け" }), {
      target: { value: "Area\tMean\n120\t10\n130\t20\n140\t30\n150\t40\n160\t50" },
    });

    fireEvent.click(screen.getByRole("button", { name: "未割当行を均等に連続分割" }));

    const assignments = screen.getAllByRole("combobox", { name: /ImageJ行 .*実験単位/ });
    expect(assignments.map((select) => (select as HTMLSelectElement).value)).toEqual([
      "0",
      "0",
      "0",
      "1",
      "1",
    ]);
    expect(screen.getByText(/実験単位 1 3行 ／ 実験単位 2 2行/)).toBeVisible();
    expect(screen.getByRole("button", { name: "要約値をデータシートへ適用" })).not.toBeDisabled();
  });

  it("一括割当と全割当クリアを提供し、安全条件を迂回しない", () => {
    render(
      <NestedImageJPaste
        sheet={sheetFixture()}
        rawRevisionId="raw.imagej.bulk"
        onApply={() => undefined}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /ImageJの細胞・ROI行を実験単位ごとに要約/ }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "ImageJの細胞・ROI行を貼り付け" }), {
      target: { value: "Area\tMean\n120\t10\n130\t20\n140\t30" },
    });

    fireEvent.click(screen.getByRole("button", { name: "未割当行をすべて実験単位 1へ" }));
    expect(screen.getByText(/実験単位 1 3行 ／ 実験単位 2 0行/)).toBeVisible();
    expect(screen.getByRole("button", { name: "要約値をデータシートへ適用" })).toBeDisabled();
    expect(screen.getByText(/各実験単位に少なくとも1行/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "全割当をクリア" }));
    expect(screen.getByText(/実験単位 1 0行 ／ 実験単位 2 0行/)).toBeVisible();
    expect(screen.getByRole("button", { name: "要約値をデータシートへ適用" })).toBeDisabled();
  });
});
