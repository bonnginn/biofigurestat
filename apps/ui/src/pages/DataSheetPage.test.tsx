import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import type { ProjectState } from "@lsaa/project";

import { ComparisonWizard } from "./ComparisonWizard";

function openWizard() {
  render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
}

function chooseOutcome(choice: "microscopy-intensity" | "positive-cell-proportion") {
  fireEvent.click(document.querySelector(`[data-outcome-choice="${choice}"]`)!);
}

describe("in-memory data sheet", () => {
  it("shows only the active workflow tab and keeps the result panels progressive", () => {
    openWizard();
    chooseOutcome("microscopy-intensity");

    expect(
      within(screen.getByRole("tablist", { name: "解析ワークフロー" })).getAllByRole("tab"),
    ).toHaveLength(4);
    expect(screen.getAllByRole("tab", { name: /^N[1-3]$/ })).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "実験単位ごとに値を入力" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: /D01/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /2 解析/ }));
    expect(screen.getByRole("heading", { name: /D01/ })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("moves workflow tabs with Arrow keys and Home/End", () => {
    openWizard();
    chooseOutcome("microscopy-intensity");
    const tabs = screen.getAllByRole("tab");

    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(tabs[3]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[3], { key: "ArrowLeft" });
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("recommends ImageJ Mean and fills one scalar value per target replicate", () => {
    openWizard();
    chooseOutcome("microscopy-intensity");

    fireEvent.change(screen.getByRole("textbox", { name: "スカラー値を貼り付け" }), {
      target: { value: "Area\tMean\n1\t10\n2\t20\n3\t30" },
    });

    expect(screen.getByRole("radio", { name: /ImageJの結果表/ })).toBeChecked();
    expect(screen.getByText(/ネストした行を生物学的nへ変換/)).not.toBeVisible();
    fireEvent.click(screen.getByText("サンプルと対応範囲を表示"));
    expect(screen.getByText(/ネストした行を生物学的nへ変換/)).toBeVisible();
    expect(screen.getByRole("combobox", { name: "数値列" })).toHaveValue("1");
    expect(screen.getByText(/10, 20, 30/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "選択した条件に適用" }));

    expect(screen.getByRole("spinbutton", { name: /^(条件A|対照) 実験単位 1$/ })).toHaveValue(10);
    fireEvent.click(screen.getByRole("tab", { name: "N2" }));
    expect(screen.getByRole("spinbutton", { name: /^(条件A|対照) 実験単位 2$/ })).toHaveValue(20);
    fireEvent.click(screen.getByRole("tab", { name: "N3" }));
    expect(screen.getByRole("spinbutton", { name: /^(条件A|対照) 実験単位 3$/ })).toHaveValue(30);
  });

  it("rejects nonnumeric values and reports capacity errors", () => {
    openWizard();
    chooseOutcome("microscopy-intensity");
    const paste = screen.getByRole("textbox", { name: "スカラー値を貼り付け" });
    fireEvent.change(paste, { target: { value: "Mean\n10\nnot measured\n30" } });
    expect(screen.getByRole("alert")).toHaveTextContent("非数値");
    expect(screen.getByRole("button", { name: "選択した条件に適用" })).toBeDisabled();

    fireEvent.change(paste, { target: { value: "Mean\n10\n20\n30\n40" } });
    fireEvent.click(screen.getByRole("button", { name: "選択した条件に適用" }));
    expect(screen.getByRole("alert")).toHaveTextContent("計画n = 3");
  });

  it("lets D10 assign ImageJ cell rows to biological replicates before applying means", () => {
    openWizard();
    chooseOutcome("microscopy-intensity");
    fireEvent.click(
      screen.getByRole("button", { name: /ImageJの細胞・ROI行を実験単位ごとに要約/ }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "ImageJの細胞・ROI行を貼り付け" }), {
      target: { value: "Area\tMean\n120\t10\n130\t20\n140\t30\n150\t40" },
    });
    const assignments = screen.getAllByRole("combobox", { name: /ImageJ行 .*実験単位/ });
    fireEvent.change(assignments[0], { target: { value: "0" } });
    fireEvent.change(assignments[1], { target: { value: "0" } });
    fireEvent.change(assignments[2], { target: { value: "1" } });
    fireEvent.change(assignments[3], { target: { value: "2" } });

    expect(screen.getByText(/実験単位 1：15\.000/)).toBeVisible();
    expect(screen.getByText(/実験単位 2：30\.000/)).toBeVisible();
    expect(screen.getByText(/実験単位 3：40\.000/)).toBeVisible();
    expect(screen.getByText(/細胞やROIは、統計上の生物学的nではありません/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "要約値をデータシートへ適用" }));

    expect(screen.getByRole("spinbutton", { name: /^(条件A|対照) 実験単位 1$/ })).toHaveValue(15);
    fireEvent.click(screen.getByRole("tab", { name: "N2" }));
    expect(screen.getByRole("spinbutton", { name: /^(条件A|対照) 実験単位 2$/ })).toHaveValue(30);
    fireEvent.click(screen.getByRole("tab", { name: "N3" }));
    expect(screen.getByRole("spinbutton", { name: /^(条件A|対照) 実験単位 3$/ })).toHaveValue(40);
  });

  it("persists both conditions as raw ImageJ rows plus a derived replicate dataset", async () => {
    const saveProject = vi.fn(async (state: ProjectState) => ({
      state,
      target: "/tmp/d10.lsaa",
    }));
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} saveProject={saveProject} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    chooseOutcome("microscopy-intensity");
    fireEvent.click(
      screen.getByRole("button", { name: /ImageJの細胞・ROI行を実験単位ごとに要約/ }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "ImageJの細胞・ROI行を貼り付け" }), {
      target: { value: "Area\tMean\n120\t10\n130\t20\n140\t30" },
    });
    const assignRows = () => {
      screen
        .getAllByRole("combobox", { name: /ImageJ行 .*実験単位/ })
        .forEach((select, index) => fireEvent.change(select, { target: { value: String(index) } }));
    };
    assignRows();
    fireEvent.click(screen.getByRole("button", { name: "要約値をデータシートへ適用" }));
    const conditionSelect = screen.getByRole("combobox", {
      name: "D10貼り付け先の条件",
    }) as HTMLSelectElement;
    fireEvent.change(conditionSelect, { target: { value: conditionSelect.options[1].value } });
    assignRows();
    fireEvent.click(screen.getByRole("button", { name: "要約値をデータシートへ適用" }));

    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    fireEvent.click(screen.getByRole("tab", { name: /4 保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const state = saveProject.mock.calls[0][0] as ProjectState;
    expect(state.observations).toHaveLength(6);
    expect(state.transformations).toHaveLength(1);
    expect(state.derivedDatasetRevisions).toHaveLength(1);
    expect(state.derivedValues).toHaveLength(6);
    expect(state.derivedValues.every((value) => value.subsampleCount === 1)).toBe(true);
    expect(state.designRevisions[0].design.unitLevels).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "unit.imagej-row" })]),
    );
  });

  it("keeps independent continuous entries as separate experimental units", () => {
    openWizard();
    chooseOutcome("microscopy-intensity");

    expect(screen.getByRole("heading", { name: "実験単位ごとに値を入力" })).toBeVisible();
    expect(screen.getByText(/同じN番号は整理用/)).toBeVisible();

    const unitIds = [...document.querySelectorAll("[data-experimental-unit-id]")].map((cell) =>
      cell.getAttribute("data-experimental-unit-id"),
    );
    expect(new Set(unitIds)).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: "N2" }));
    const secondUnitIds = [...document.querySelectorAll("[data-experimental-unit-id]")].map(
      (cell) => cell.getAttribute("data-experimental-unit-id"),
    );
    expect(new Set(secondUnitIds)).toHaveLength(2);
  });

  it("moves between visible grid inputs with Enter and arrow keys", () => {
    openWizard();
    chooseOutcome("microscopy-intensity");

    const firstCondition = screen.getByRole("spinbutton", {
      name: /^(条件A|対照) 実験単位 1$/,
    });
    fireEvent.keyDown(firstCondition, { key: "Enter" });
    expect(screen.getByRole("spinbutton", { name: /^(条件B|処理) 実験単位 1$/ })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("spinbutton", { name: /^(条件B|処理) 実験単位 1$/ }), {
      key: "ArrowUp",
    });
    expect(firstCondition).toHaveFocus();
  });

  it("renders one shared biological unit per matched row", () => {
    render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);
    fireEvent.click(screen.getByLabelText(/同じ生物学的単位を両条件で測定/));
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    chooseOutcome("microscopy-intensity");

    expect(screen.getByText("対応のある行")).toBeVisible();
    const rows = [...document.querySelectorAll("[data-unit-grid] tbody tr")];
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row).toHaveAttribute("data-experimental-unit-id", "unit.matched.1");
    });
  });

  it("40/100を40.0%と表示し、未入力の陽性細胞率を拒否する", () => {
    openWizard();
    chooseOutcome("positive-cell-proportion");

    const positive = screen.getByRole("spinbutton", {
      name: /^(条件A|対照) 実験単位 1：陽性細胞数$/,
    });
    fireEvent.change(positive, { target: { value: "40" } });
    const total = screen.getByRole("spinbutton", {
      name: /^(条件A|対照) 実験単位 1：総細胞数$/,
    });
    fireEvent.change(total, { target: { value: "100" } });
    expect(screen.getByLabelText(/^(条件A|対照) 実験単位 1：計算された割合$/)).toHaveTextContent(
      "40.0%",
    );

    fireEvent.change(total, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "陽性細胞数と総細胞数をすべての実験単位に入力してください",
    );
  });
});
