import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { biologicalWorkspaceStopMessage } from "../app/newExperimentMessages";
import { NewExperimentPage } from "./NewExperimentPage";

function startCellCountStructureStep() {
  render(<NewExperimentPage onNavigate={() => undefined} />);
  fireEvent.click(document.querySelector('[data-context="cell_culture"]')!);
  fireEvent.click(screen.getByRole("button", { name: /細胞数・増殖/ }));
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
  fireEvent.change(screen.getByRole("textbox", { name: "行1：条件" }), {
    target: { value: "Control" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "行2：条件" }), {
    target: { value: "Treatment" },
  });
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
}

function startWesternBlotConditions() {
  render(<NewExperimentPage onNavigate={() => undefined} />);
  fireEvent.click(document.querySelector('[data-context="protein_biochemical"]')!);
  fireEvent.click(screen.getByRole("button", { name: /Western blot/ }));
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
}

function startCellProportionConditions() {
  render(<NewExperimentPage onNavigate={() => undefined} />);
  fireEvent.click(document.querySelector('[data-context="cell_culture"]')!);
  fireEvent.click(screen.getByRole("button", { name: /陽性数・割合/ }));
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
}

describe("NewExperimentPage explicit scientific structure answers", () => {
  it("explains heterogeneous readout safe stops without claiming a data sheet exists", () => {
    const message = biologicalWorkspaceStopMessage([
      "legacy_analysis_does_not_support_heterogeneous_readout_grains",
      "legacy_analysis_does_not_support_heterogeneous_readout_axes",
    ]);
    expect(message).toContain("Cell・ROI");
    expect(message).toContain("時間・距離");
    expect(message).toContain("1つの表へ強制せず");
    expect(message).toContain("回答と条件表は保持");
    expect(message).not.toContain("入力表を作成");
  });

  it("builds the condition table before asking how samples relate across conditions", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);
    fireEvent.click(document.querySelector('[data-context="cell_culture"]')!);
    fireEvent.click(screen.getByRole("button", { name: /細胞数・増殖/ }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(screen.getByRole("heading", { name: "条件を入力してください" })).toBeVisible();
    expect(screen.getByRole("button", { name: "3. 測定軸" })).toBeDisabled();
    expect(screen.queryByRole("radio", { name: /条件ごとに別の単位/ })).toBeNull();
  });

  it("does not count draft defaults as answers for unit assignment or ordered-axis presence", () => {
    startCellCountStructureStep();

    const independent = screen.getByRole("radio", { name: /条件ごとに別の単位/ });
    const matched = screen.getByRole("radio", { name: /同じ単位を条件間で測った/ });
    const noAxis = screen.getByRole("radio", { name: "順序のある測定軸なし" });
    const addAxis = screen.getByRole("radio", { name: "順序のある測定軸を追加する" });
    const next = screen.getByRole("button", { name: "次へ" });

    expect(independent).not.toBeChecked();
    expect(matched).not.toBeChecked();
    expect(noAxis).not.toBeChecked();
    expect(addAxis).not.toBeChecked();
    expect(next).toBeDisabled();

    fireEvent.click(independent);
    expect(next).toBeDisabled();
    fireEvent.click(noAxis);
    expect(next).toBeEnabled();
  });

  it("requires explicit axis meaning and sampling after an ordered axis is added", () => {
    startCellCountStructureStep();
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別の単位/ }));
    fireEvent.click(screen.getByRole("radio", { name: "順序のある測定軸を追加する" }));

    const timeAxis = screen.getByRole("radio", { name: /^時間同じ単位/ });
    const numericAxis = screen.getByRole("radio", { name: /時間以外の数値軸/ });
    const crossSectional = screen.getByRole("radio", { name: /時間点ごとに別のサンプル/ });
    const longitudinal = screen.getByRole("radio", {
      name: /同じ単位を各時間点で測った/,
    });
    const next = screen.getByRole("button", { name: "次へ" });

    expect(timeAxis).not.toBeChecked();
    expect(numericAxis).not.toBeChecked();
    expect(crossSectional).not.toBeChecked();
    expect(longitudinal).not.toBeChecked();

    fireEvent.change(screen.getByRole("textbox", { name: "時間点" }), {
      target: { value: "0, 24" },
    });
    fireEvent.click(timeAxis);
    expect(next).toBeDisabled();
    fireEvent.click(crossSectional);
    expect(next).toBeEnabled();
  });

  it("infers only the time-axis answers from an explicitly longitudinal route", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);
    fireEvent.click(document.querySelector('[data-context="animal"]')!);
    fireEvent.click(screen.getByRole("button", { name: /経時測定/ }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    fireEvent.change(screen.getByRole("textbox", { name: "行1：条件" }), {
      target: { value: "Control" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行2：条件" }), {
      target: { value: "Treatment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    const independent = screen.getByRole("radio", { name: /条件ごとに別の単位/ });
    const matched = screen.getByRole("radio", { name: /同じ単位を条件間で測った/ });
    const next = screen.getByRole("button", { name: "次へ" });

    expect(independent).not.toBeChecked();
    expect(matched).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "順序のある測定軸を追加する" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^時間同じ単位/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /同じ単位を各時間点で測った/ })).toBeChecked();
    expect(next).toBeDisabled();

    fireEvent.click(independent);
    fireEvent.change(screen.getByRole("textbox", { name: "時間点" }), {
      target: { value: "0, 7, 14" },
    });
    expect(next).toBeEnabled();
  });

  it("infers independent assignment for a single cohort but still asks about its axis", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);
    fireEvent.click(document.querySelector('[data-context="general_assay"]')!);
    fireEvent.click(screen.getByRole("button", { name: /単一コホート・1群/ }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(screen.queryByRole("radio", { name: /条件ごとに別の単位/ })).toBeNull();
    expect(screen.getByRole("radio", { name: "順序のある測定軸なし" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "順序のある測定軸を追加する" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "次へ" })).toBeDisabled();
  });

  it("disables final confirmation again when an earlier structure answer becomes incomplete", () => {
    startCellCountStructureStep();
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別の単位/ }));
    fireEvent.click(screen.getByRole("radio", { name: "順序のある測定軸なし" }));
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(screen.getByRole("button", { name: "設計を確認" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "3. 測定軸" }));
    fireEvent.click(screen.getByRole("radio", { name: "順序のある測定軸を追加する" }));
    fireEvent.click(screen.getByRole("button", { name: "4. 実験回" }));

    expect(screen.getByRole("button", { name: "設計を確認" })).toBeDisabled();
  });

  it("asks the WB sample relationship without adding an ordered-axis question", () => {
    startWesternBlotConditions();

    const independent = screen.getByRole("radio", {
      name: /条件ごとに別の単位を準備・処理した/,
    });
    const sameEntity = screen.getByRole("radio", {
      name: /同じ単位を条件間で測った/,
    });
    const sharedSourceSplit = screen.getByRole("radio", {
      name: /同じ由来試料を分けて各条件に割り当てた/,
    });
    const next = screen.getByRole("button", { name: "次へ" });

    expect(screen.getByRole("heading", { name: "条件を入力してください" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "条件間の試料の関係と測定軸を確認します" }),
    ).toBeNull();
    expect(independent).not.toBeChecked();
    expect(sameEntity).not.toBeChecked();
    expect(sharedSourceSplit).not.toBeChecked();
    fireEvent.change(screen.getByRole("textbox", { name: "行1：条件" }), {
      target: { value: "Control" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行2：条件" }), {
      target: { value: "Treatment" },
    });
    expect(next).toBeDisabled();

    fireEvent.click(independent);
    expect(next).toBeEnabled();
  });

  it("safe-stops a WB shared-source split instead of coercing it to same-entity matching", () => {
    startWesternBlotConditions();
    fireEvent.change(screen.getByRole("textbox", { name: "行1：条件" }), {
      target: { value: "Control" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行2：条件" }), {
      target: { value: "Treatment" },
    });

    const sameEntity = screen.getByRole("radio", {
      name: /同じ単位を条件間で測った/,
    });
    const sharedSourceSplit = screen.getByRole("radio", {
      name: /同じ由来試料を分けて各条件に割り当てた/,
    });
    const next = screen.getByRole("button", { name: "次へ" });
    fireEvent.click(sharedSourceSplit);

    expect(sharedSourceSplit).toBeChecked();
    expect(sameEntity).not.toBeChecked();
    expect(screen.getByText(/別の実験構造へ読み替えず/)).toBeVisible();
    expect(next).toBeDisabled();

    fireEvent.click(sameEntity);
    expect(sharedSourceSplit).not.toBeChecked();
    expect(sameEntity).toBeChecked();
    expect(next).toBeEnabled();
  });

  it("safe-stops an ordinary cell-culture shared-source split and preserves condition names", () => {
    startCellProportionConditions();
    fireEvent.change(screen.getByRole("textbox", { name: "行1：条件" }), {
      target: { value: "Vehicle" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "行2：条件" }), {
      target: { value: "Drug" },
    });
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    const independent = screen.getByRole("radio", {
      name: /条件ごとに別の単位を準備・処理した/,
    });
    const sameEntity = screen.getByRole("radio", {
      name: /同じ単位を条件間で測った/,
    });
    const sharedSourceSplit = screen.getByRole("radio", {
      name: /同じ由来試料を分けて各条件に割り当てた/,
    });
    fireEvent.click(screen.getByRole("radio", { name: "順序のある測定軸なし" }));
    fireEvent.click(sharedSourceSplit);

    expect(sharedSourceSplit).toBeChecked();
    expect(independent).not.toBeChecked();
    expect(sameEntity).not.toBeChecked();
    expect(screen.getByText(/別の実験構造へ読み替えず/)).toBeVisible();
    expect(screen.getByRole("button", { name: "次へ" })).toBeDisabled();
    expect(screen.queryByRole("radio", { name: "順序のある測定軸なし" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "順序のある測定軸を追加する" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "2. 条件" }));
    expect(screen.getByRole("textbox", { name: "行1：条件" })).toHaveValue("Vehicle");
    expect(screen.getByRole("textbox", { name: "行2：条件" })).toHaveValue("Drug");
  });
});
