import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";

import {
  createExperimentSetDraft,
  type ExperimentSetDraft,
  type ReadoutShape,
} from "../app/experimentDraft";
import {
  createComplexProportionFixture,
  createCategoricalCompositionFixture,
  createLongitudinalFixture,
  createMultipleReadoutFixture,
  createNestedContinuousFixture,
  createPairedTwoConditionFixture,
  createXyCorrelationFixture,
} from "../app/syntheticFixtures";
import { ExperimentWorkspace } from "./ExperimentWorkspace";

function chooseAndCreateGraph(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  expect(screen.getByRole("img", { name: /現在のデータを表示したpreview/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
}

describe("ExperimentWorkspace", () => {
  function draftWithTwoConditions(shape: ReadoutShape): ExperimentSetDraft {
    const base = createExperimentSetDraft("cell_culture", shape);
    return {
      ...base,
      conditions: [
        {
          ...base.conditions[0],
          label: "Control",
          attributes: { "attribute.1": "Control" },
        },
        {
          ...base.conditions[1],
          label: "Treatment",
          attributes: { "attribute.1": "Treatment" },
        },
      ],
    };
  }

  function draftWithConditionHierarchy(shape: ReadoutShape): ExperimentSetDraft {
    const base = createExperimentSetDraft("cell_culture", shape);
    return {
      ...base,
      attributes: [
        { id: "attribute.1", label: "siRNA" },
        { id: "attribute.2", label: "Dox" },
      ],
      conditions: [
        {
          id: "condition.1",
          label: "control / -",
          attributes: { "attribute.1": "control", "attribute.2": "-" },
        },
        {
          id: "condition.2",
          label: "control / +",
          attributes: { "attribute.1": "control", "attribute.2": "+" },
        },
      ],
    };
  }

  it("shows a read-only overview and collects proportion counts in an experiment tab", () => {
    const draft = draftWithTwoConditions("proportion");
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "入力状況" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Exp 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Exp 2" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Exp 3" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Overview" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Exp 1" })).toHaveAttribute("aria-selected", "true");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの陽性数" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの対象数" }), {
      target: { value: "10" },
    });

    expect(screen.getByRole("spinbutton", { name: "Controlの陽性数" })).toHaveValue(5);
    expect(
      screen.getByLabelText("Controlの計算された割合").querySelector("span"),
    ).toHaveTextContent(/^50$/);
    expect(screen.getByRole("columnheader", { name: "割合（%）" })).toBeVisible();
    expect(document.querySelector(".experiment-workspace-col-derived")).toBeInTheDocument();
    expect(screen.queryByText("Exp番号について")).not.toBeInTheDocument();
    expect(screen.getByText(/実験情報（/)).toBeInTheDocument();
  });

  it("closes the graph-choice dialog with Escape and restores trigger focus", () => {
    const draft = draftWithTwoConditions("nested_continuous");
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "＋ グラフを作成" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "グラフの基本形を選ぶ" })).toBeVisible();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "グラフの基本形を選ぶ" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  it("保存済みprojectから測定値を渡さずに設計再利用を開始できる", () => {
    const draft = draftWithTwoConditions("proportion");
    const onReuseDesign = vi.fn();
    render(
      <ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} onReuseDesign={onReuseDesign} />,
    );
    fireEvent.click(screen.getByText("ファイル"));
    fireEvent.click(screen.getByRole("button", { name: "設計だけを新しいprojectに再利用" }));
    expect(onReuseDesign).toHaveBeenCalledWith(draft);
  });

  it("現在の設計とグラフ設定をお気に入り保存へ渡す", () => {
    const draft = draftWithTwoConditions("proportion");
    const onSaveFavorite = vi.fn();
    render(
      <ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} onSaveFavorite={onSaveFavorite} />,
    );
    fireEvent.click(screen.getByText("ファイル"));
    fireEvent.click(screen.getByRole("button", { name: "この設計をお気に入りに保存" }));
    expect(onSaveFavorite).toHaveBeenCalledWith(draft, []);
  });

  it("enters an X-Y pair directly and creates a scatter graph from stable sample IDs", () => {
    const fixture = createXyCorrelationFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Sample 1" }));
    const xInput = screen.getByRole("spinbutton", { name: "Sample 1のCell area (µm²)" });
    fireEvent.paste(xInput, { clipboardData: { getData: () => "90\t25" } });
    expect(xInput).toHaveValue(90);
    expect(
      screen.getByRole("spinbutton", { name: "Sample 1のFluorescence intensity (a.u.)" }),
    ).toHaveValue(25);

    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    expect(screen.getByRole("button", { name: "Scatterを選択（おすすめ）" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    const graph = screen.getByRole("img", { name: /散布図/ });
    expect(graph).toHaveAttribute("data-graph-type", "scatter");
    expect(graph.querySelectorAll("[data-experimental-unit]")).toHaveLength(5);
  });

  it("WBの標的とreferenceを矩形貼り付けし、比を派生表示する", () => {
    const draft = draftWithTwoConditions("wb_ratio");
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));

    const target = screen.getByRole("spinbutton", { name: "Controlの標的タンパク質" });
    fireEvent.paste(target, { clipboardData: { getData: () => "120\t30\n90\t30" } });

    expect(target).toHaveValue(120);
    expect(screen.getByRole("spinbutton", { name: "ControlのGAPDH" })).toHaveValue(30);
    expect(screen.getByRole("spinbutton", { name: "Treatmentの標的タンパク質" })).toHaveValue(90);
    expect(screen.getAllByText("4")).not.toHaveLength(0);
    expect(screen.getByText(/入力値を保存し、比と明示的に選んだ相対値は自動計算/)).toBeVisible();
    expect(screen.getByText("追加正規化：なし（Target/reference比まで）")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    const dot = screen.getByRole("button", { name: "Dotを選択（おすすめ）" });
    expect(dot).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: /dotで現在のデータを表示したpreview/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Violinを選択" })).toBeNull();
    fireEvent.click(dot);
    expect(dot).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(dot);
    expect(dot).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "このグラフを作成" })).toBeDisabled();
    expect(
      screen.getByText("グラフ形式を1つ選んでください。選択するまでグラフは作成できません。"),
    ).toBeVisible();
    fireEvent.click(dot);
    expect(screen.getByRole("button", { name: "このグラフを作成" })).toBeEnabled();
    expect(screen.queryByText(/グラフ形式を1つ選んでください/)).toBeNull();
  });

  it("WBのImageJ測定値6列を貼り付け、背景補正値と比を表示する", () => {
    const base = draftWithTwoConditions("wb_ratio");
    const draft = {
      ...base,
      readouts: [{ ...base.readouts[0], wbInputMode: "imagej_mean_background_area" as const }],
    };
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));

    const targetIntensity = screen.getByRole("spinbutton", {
      name: "Controlの標的タンパク質 Intensity",
    });
    fireEvent.paste(targetIntensity, {
      clipboardData: { getData: () => "20\t5\t60\t14\t4\t60" },
    });

    expect(targetIntensity).toHaveValue(20);
    expect(
      screen.getByRole("spinbutton", { name: "Controlの標的タンパク質 Background" }),
    ).toHaveValue(5);
    expect(screen.getByRole("spinbutton", { name: "ControlのGAPDH Area" })).toHaveValue(60);
    expect(screen.getAllByText("900").length).toBeGreaterThan(0);
    expect(screen.getAllByText("600").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1.50").length).toBeGreaterThan(0);
    expect(screen.getByText(/補正値 = \(Intensity − Background\) × Area/)).toBeVisible();
  });

  it("WBの先頭条件=1正規化を明示し、元のtarget/referenceを保持する", () => {
    const base = draftWithTwoConditions("wb_ratio");
    const draft = {
      ...base,
      readouts: [
        {
          ...base.readouts[0],
          withinExperimentNormalization: {
            method: "control_equals_one" as const,
            baselineConditionId: base.conditions[0].id,
          },
        },
      ],
    };
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    const target = screen.getByRole("spinbutton", { name: "Controlの標的タンパク質" });
    fireEvent.paste(target, { clipboardData: { getData: () => "20\t10\n60\t10" } });

    expect(screen.getByRole("columnheader", { name: "相対値（Control = 1）" })).toBeVisible();
    expect(screen.getAllByText("1")).not.toHaveLength(0);
    expect(screen.getAllByText("3")).not.toHaveLength(0);
    expect(target).toHaveValue(20);
  });

  it("keeps category counts editable and creates a 100% stacked composition graph", () => {
    const fixture = createCategoricalCompositionFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    const first = screen.getByRole("spinbutton", { name: "ControlのG0/G1数" });
    fireEvent.paste(first, { clipboardData: { getData: () => "50\t25\t20\t5" } });
    expect(first).toHaveValue(50);
    expect(screen.getByRole("spinbutton", { name: "ControlのOther数" })).toHaveValue(5);

    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    expect(screen.getByRole("button", { name: "100% stackedを選択（おすすめ）" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Category percentageを選択（おすすめ）" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    const graph = screen.getByRole("img", { name: /カテゴリ構成グラフ/ });
    expect(graph).toHaveAttribute("data-graph-type", "stacked_100");
    expect(graph.querySelectorAll('[data-graph-layer="category-stack"]')).not.toHaveLength(0);
  });

  it("24行以上の表でも列見出しをページスクロールに追従させる", () => {
    const fixture = createComplexProportionFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    expect(screen.getAllByRole("row").length).toBeGreaterThanOrEqual(25);
    const header = screen.getByRole("columnheader", { name: "陽性数" });
    const wrapper = header.closest(".experiment-workspace-table-wrap")!;
    expect(getComputedStyle(header).position).toBe("sticky");
    expect(getComputedStyle(header).top).toBe("58px");
    expect(getComputedStyle(wrapper).overflowY).not.toBe("auto");
  });

  it("条件の項目を結合せず、スプレッドシートの列として表示する", () => {
    render(
      <ExperimentWorkspace
        initialDraft={draftWithConditionHierarchy("proportion")}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    expect(screen.getByRole("columnheader", { name: "siRNA" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Dox" })).toBeInTheDocument();
    expect(screen.getAllByRole("rowheader", { name: "control" })).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "-" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "+" })).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: "control / -" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    const conditionTable = screen.getByRole("table", { name: "条件の構成" });
    expect(within(conditionTable).getByRole("columnheader", { name: "siRNA" })).toBeVisible();
    expect(within(conditionTable).getByRole("columnheader", { name: "Dox" })).toBeVisible();
    expect(within(conditionTable).getAllByRole("rowheader")).toHaveLength(2);
    expect(screen.queryByText("control / - / control / +")).not.toBeInTheDocument();
  });

  it("実験日は日本語UIで年から始まる形式を表示しISO形式で保持する", () => {
    const base = draftWithTwoConditions("proportion");
    const draft = {
      ...base,
      experiments: base.experiments.map((experiment) => ({
        ...experiment,
        date: "2026-08-21",
      })),
    };
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    fireEvent.click(screen.getByText("実験情報（2026-08-21）"));
    const dateInput = screen.getByRole("textbox", { name: "Exp 1の実験日" });
    expect(dateInput).toHaveValue("2026/08/21");
    fireEvent.change(dateInput, { target: { value: "2026/08/22" } });
    expect(dateInput).toHaveValue("2026/08/22");
  });

  it("通常の入力表に測定予定なしcontrolを表示しない", () => {
    render(
      <ExperimentWorkspace initialDraft={draftWithTwoConditions("proportion")} onBack={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));

    expect(screen.queryByRole("button", { name: /測定予定なし/ })).toBeNull();
    expect(screen.queryByText("予定なし")).toBeNull();
    expect(screen.getByRole("spinbutton", { name: "Controlの陽性数" })).toBeEnabled();
  });

  it("adds an experiment session without requiring complete data", () => {
    const draft = draftWithTwoConditions("proportion");
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "＋ 実験" }));

    expect(screen.getByRole("tab", { name: "Exp 4" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "データ入力" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(
      screen.getByText("未入力のセルが8件あります。途中の状態でもグラフを作成できます。"),
    ).toBeInTheDocument();
  });

  it("実験回を削除でき、入力済みの場合だけ確認する", () => {
    const draft = draftWithTwoConditions("proportion");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 2" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの陽性数" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの対象数" }), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Exp 2を削除" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("tab", { name: "Exp 2" })).toBeInTheDocument();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Exp 2を削除" }));
    expect(screen.queryByRole("tab", { name: "Exp 2" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Exp 1" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "＋ 実験" }));
    expect(screen.getByRole("tab", { name: "Exp 4" })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("pastes a proportion rectangle from the first positive cell and leaves the derived column read-only", () => {
    const draft = draftWithTwoConditions("proportion");
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    fireEvent.paste(screen.getByRole("spinbutton", { name: "Controlの陽性数" }), {
      clipboardData: { getData: () => "5\t10\n2\t8" },
    });

    expect(screen.getByRole("spinbutton", { name: "Controlの陽性数" })).toHaveValue(5);
    expect(screen.getByRole("spinbutton", { name: "Controlの対象数" })).toHaveValue(10);
    expect(screen.getByRole("spinbutton", { name: "Treatmentの陽性数" })).toHaveValue(2);
    expect(screen.getByRole("spinbutton", { name: "Treatmentの対象数" })).toHaveValue(8);
    expect(screen.getByLabelText("Controlの計算された割合")).toHaveTextContent("50");
    expect(screen.getByLabelText("Treatmentの計算された割合")).toHaveTextContent("25");
    expect(screen.getByRole("status")).toHaveTextContent("4セルを更新");
    expect(screen.queryByRole("spinbutton", { name: /割合/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Controlの計算された割合")).toHaveClass(
      "experiment-workspace-derived-cell",
    );
  });

  it("複数条件と複数時点にまたがる表を左上セルから一括貼り付けする", () => {
    const base = draftWithTwoConditions("proportion");
    const draft: ExperimentSetDraft = {
      ...base,
      time: {
        sampling: "cross_sectional",
        unit: "h",
        points: [
          { id: "time.1", value: 24 },
          { id: "time.2", value: 48 },
        ],
      },
    };
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    fireEvent.paste(screen.getByRole("spinbutton", { name: "Control（24 h）の陽性数" }), {
      clipboardData: { getData: () => "10\t100\n12\t98\n15\t102\n18\t105" },
    });

    expect(screen.getByRole("spinbutton", { name: "Control（24 h）の陽性数" })).toHaveValue(10);
    expect(screen.getByRole("spinbutton", { name: "Control（48 h）の対象数" })).toHaveValue(98);
    expect(screen.getByRole("spinbutton", { name: "Treatment（24 h）の陽性数" })).toHaveValue(15);
    expect(screen.getByRole("spinbutton", { name: "Treatment（48 h）の対象数" })).toHaveValue(105);
    expect(screen.getByRole("status")).toHaveTextContent("8セルを更新");
  });

  it("選んだ単一セルを貼り付けの左上として扱う", () => {
    const draft = draftWithTwoConditions("proportion");
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    fireEvent.paste(screen.getByRole("spinbutton", { name: "Controlの対象数" }), {
      clipboardData: { getData: () => "12" },
    });

    expect(screen.getByRole("spinbutton", { name: "Controlの対象数" })).toHaveValue(12);
    expect(screen.getByRole("spinbutton", { name: "Controlの陽性数" })).toHaveValue(null);
    expect(screen.getByRole("status")).toHaveTextContent("1セルを更新");
  });

  it("moves through the spreadsheet with Enter and arrow keys", () => {
    const draft = draftWithTwoConditions("proportion");
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    const controlPositive = screen.getByRole("spinbutton", { name: "Controlの陽性数" });
    const controlEligible = screen.getByRole("spinbutton", { name: "Controlの対象数" });
    const treatmentPositive = screen.getByRole("spinbutton", { name: "Treatmentの陽性数" });

    controlPositive.focus();
    fireEvent.keyDown(controlPositive, { key: "ArrowRight" });
    expect(controlEligible).toHaveFocus();
    fireEvent.keyDown(controlEligible, { key: "ArrowLeft" });
    expect(controlPositive).toHaveFocus();
    fireEvent.keyDown(controlPositive, { key: "Enter" });
    expect(treatmentPositive).toHaveFocus();
    fireEvent.keyDown(treatmentPositive, { key: "ArrowUp" });
    expect(controlPositive).toHaveFocus();
    fireEvent.keyDown(controlPositive, { key: "ArrowDown" });
    expect(treatmentPositive).toHaveFocus();
    fireEvent.keyDown(treatmentPositive, { key: "Enter", shiftKey: true });
    expect(controlPositive).toHaveFocus();
  });

  it("keeps existing values when pasted cells are blank or invalid", () => {
    const draft = draftWithTwoConditions("proportion");
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの陽性数" }), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの対象数" }), {
      target: { value: "18" },
    });
    fireEvent.paste(screen.getByRole("spinbutton", { name: "Controlの陽性数" }), {
      clipboardData: { getData: () => "invalid\t\n\t20" },
    });

    expect(screen.getByRole("spinbutton", { name: "Controlの陽性数" })).toHaveValue(9);
    expect(screen.getByRole("spinbutton", { name: "Controlの対象数" })).toHaveValue(18);
    expect(screen.getByRole("spinbutton", { name: "Treatmentの陽性数" })).toHaveValue(null);
    expect(screen.getByRole("spinbutton", { name: "Treatmentの対象数" })).toHaveValue(20);
    expect(screen.getByRole("status")).toHaveTextContent("不正値1件は保持");
    expect(screen.getByRole("status")).toHaveTextContent("空欄は保持");
  });

  it("opens a nested raw inspector, derives summary values, and keeps a source note", () => {
    const base = draftWithTwoConditions("nested_continuous");
    const draft = {
      ...base,
      readouts: base.readouts.map((readout) => ({
        ...readout,
        nestedInputMode: "nested_observations" as const,
      })),
    };
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Controlの生データを開く" }));
    fireEvent.change(screen.getByRole("textbox", { name: "生データ" }), {
      target: { value: "1\n2\n5" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "出典メモ" }), {
      target: { value: "ImageJ Results" },
    });

    expect(screen.getByRole("complementary", { name: "生データ／要約" })).toBeInTheDocument();
    expect(screen.getByText("n").parentElement).toHaveTextContent("3");
    expect(screen.getByText("平均").parentElement).toHaveTextContent("2.67");
    expect(screen.getByRole("textbox", { name: "出典メモ" })).toHaveValue("ImageJ Results");
  });

  it("keeps decimal input intermediates and rejects multi-value paste without erasing a summary", () => {
    const draft = draftWithTwoConditions("nested_continuous");
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    const input = screen.getByRole("textbox", { name: "Controlの細胞強度" });
    expect(input).toHaveAttribute("placeholder", "数値を入力");
    expect(screen.queryByRole("columnheader", { name: "時間" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "測定値（クリックして入力）" })).toBeVisible();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1." } });
    expect(input).toHaveValue("1.");
    fireEvent.change(input, { target: { value: "1.74" } });
    expect(input).toHaveValue("1.74");
    fireEvent.paste(input, { clipboardData: { getData: () => "1.2\n1.3" } });
    expect(input).toHaveValue("1.74");
    expect(screen.getByRole("status")).toHaveTextContent("複数値は反映せず");
  });

  it("closes the selected raw-cell inspector when switching experiment tabs", () => {
    const base = draftWithTwoConditions("nested_continuous");
    const draft = {
      ...base,
      readouts: base.readouts.map((readout) => ({
        ...readout,
        nestedInputMode: "nested_observations" as const,
      })),
    };
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Controlの生データを開く" }));
    expect(screen.getByRole("complementary", { name: "生データ／要約" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Exp 2" }));
    expect(screen.queryByRole("complementary", { name: "生データ／要約" })).toBeNull();
  });

  it("opens the project-wide graph workbench from an experiment tab and returns to the same sheet", async () => {
    const draft = draftWithTwoConditions("proportion");
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("experiment-workspace-graph-view")) {
          return {
            x: 0,
            y: 900,
            top: 900,
            left: 0,
            right: 1000,
            bottom: 1500,
            width: 1000,
            height: 600,
            toJSON: () => ({}),
          };
        }
        return originalRect.call(this);
      });
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 2" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    expect(screen.getByRole("dialog", { name: "グラフの基本形を選ぶ" })).toBeVisible();
    expect(screen.getByText("同じ単位の対応情報がある設計で利用できます")).toBeVisible();
    expect(
      screen.getByText("Scatterは「同じ試料のXとYの関係を見る」設計で利用できます"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Dotを選択（おすすめ）/ }));
    expect(screen.getByText("作成後の初期表示")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    expect(document.querySelector(".experiment-workspace-body")).toHaveAttribute("hidden");
    expect(screen.getByRole("region", { name: "実験からグラフを作成" })).toBeInTheDocument();
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" }),
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 892, behavior: "auto" });
    expect(screen.getByText(/割合と要約は実験単位（Exp）から計算/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "グラフ (1)" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: "error-bar" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "誤差線の要約方法" }), {
      target: { value: "sem" },
    });

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.getByRole("tab", { name: "Exp 2" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "グラフ (1)" }));
    expect(screen.getByRole("region", { name: "実験からグラフを作成" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    fireEvent.click(screen.getByRole("button", { name: /Dotを選択（おすすめ）/ }));
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    expect(screen.getByRole("button", { name: "グラフ (2)" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "グラフ名" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "グラフ 2の名前を変更" }));
    expect(screen.getByRole("textbox", { name: "グラフ名" })).toHaveValue("グラフ 2");
    fireEvent.change(screen.getByRole("textbox", { name: "グラフ名" }), {
      target: { value: "Ndel1 time course" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "グラフ名" }), { key: "Enter" });
    expect(screen.queryByRole("textbox", { name: "グラフ名" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ndel1 time course" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: "error-bar" },
    });
    expect(screen.getByRole("combobox", { name: "誤差線の要約方法" })).toHaveValue("sd");
    fireEvent.click(screen.getByRole("button", { name: "グラフ 1" }));
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: "error-bar" },
    });
    expect(screen.getByRole("combobox", { name: "誤差線の要約方法" })).toHaveValue("sem");
    rectSpy.mockRestore();
    scrollTo.mockRestore();
  }, 15_000);

  it("ネスト測定のViolin初期表示を観測分布と実験単位点だけに抑える", () => {
    const fixture = createNestedContinuousFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    chooseAndCreateGraph(/Violinを選択/);
    const graph = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    expect(graph.querySelectorAll('[data-graph-layer="violin"]')).not.toHaveLength(0);
    expect(graph.querySelectorAll('[data-graph-layer="nested-raw"]')).not.toHaveLength(0);
    expect(graph.querySelectorAll('[data-graph-layer="nested-experiment"]')).not.toHaveLength(0);
    expect(graph.querySelectorAll('[data-graph-layer="nested-distribution"]')).toHaveLength(0);
    expect(graph.querySelectorAll('[data-graph-layer="nested-overall"]')).toHaveLength(0);
  });

  it("縦断データには時間変化と分布の複数候補を示し、個体軌跡を初期表示する", () => {
    const fixture = createLongitudinalFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    expect(
      screen.getByRole("button", { name: "Line / Time courseを選択（おすすめ）" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Violinを選択（おすすめ）" })).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "＋ カスタムグラフ（レイヤーから組み立てる）" }),
    );
    expect(screen.getByRole("checkbox", { name: "同じ単位を結ぶ線" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    const graph = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    expect(graph.querySelectorAll('[data-graph-layer="unit-trajectory"]')).toHaveLength(8);
    expect(graph.querySelector('[data-graph-layer="legend"]')).not.toBeNull();
    expect(graph).toHaveTextContent("Control");
    expect(graph).toHaveTextContent("Stimulated");
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: "data" },
    });
    expect(screen.getByRole("combobox", { name: "X軸に使う要因" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "X軸に使う要因" })).toHaveValue("time");
    expect(screen.getByRole("combobox", { name: "系列に使う要因" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "系列に使う要因" })).toHaveValue("condition");
    expect(screen.getByText(/X軸は時間、各条件は色と記号で区別/)).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: "legend" },
    });
    expect(screen.getByRole("combobox", { name: "凡例の位置" })).toHaveValue("top");
  });

  it("縦断データのAUCを元トレースと分けたGraph sourceとして作成する", () => {
    const fixture = createLongitudinalFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    fireEvent.click(
      screen.getByRole("radio", {
        name: "各生物学的単位から求めた派生値を別グラフにする",
      }),
    );
    expect(screen.getByRole("combobox", { name: "新しいグラフの派生値" })).toHaveValue("auc");
    fireEvent.change(screen.getByRole("combobox", { name: "新しいAUC windowの開始" }), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "新しいAUC windowの終了" }), {
      target: { value: "24" },
    });
    expect(screen.getByRole("button", { name: "対応を線で結ぶを選択（おすすめ）" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));

    expect(screen.getByText(/派生値：AUC（台形法）/)).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "編集対象" }), {
      target: { value: "data" },
    });
    expect(screen.getByRole("combobox", { name: "グラフのデータソース" })).toHaveValue(
      "derived_metric",
    );
    fireEvent.click(screen.getByText("派生値の計算根拠を確認"));
    expect(screen.getByText(/window：6–24/)).toBeVisible();
    expect(screen.getByText(/時間単位：h/)).toBeVisible();
    expect(screen.getByRole("table", { name: "派生値のラインネージ" })).toBeVisible();
  });

  it("複数測定項目を作成時に明示し、別グラフのsourceとして独立保持する", () => {
    const fixture = createMultipleReadoutFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText("Marker X陽性率")).toBeVisible();
    expect(screen.getByText("蛍光強度")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    expect(screen.getByRole("table", { name: "Marker X陽性率" })).toBeVisible();
    expect(screen.getByRole("table", { name: /蛍光強度/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    const source = screen.getByRole("combobox", { name: "表示する測定項目" });
    expect(source).toHaveValue("readout.multi.proportion");
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    expect(screen.getByRole("combobox", { name: "測定項目" })).toHaveValue(
      "readout.multi.proportion",
    );

    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    fireEvent.change(screen.getByRole("combobox", { name: "表示する測定項目" }), {
      target: { value: "readout.multi.intensity" },
    });
    expect(screen.getByRole("button", { name: /Violinを選択（おすすめ）/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    expect(screen.getByRole("img", { name: /蛍光強度/ })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "測定項目" })).toHaveValue(
      "readout.multi.intensity",
    );

    fireEvent.click(screen.getByRole("button", { name: "グラフ 1" }));
    expect(screen.getByRole("combobox", { name: "測定項目" })).toHaveValue(
      "readout.multi.proportion",
    );
  });

  it("明示対応のfixtureを対応グラフの開始点として開く", () => {
    const fixture = createPairedTwoConditionFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/同じ個体の条件間測定を対応づけています/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    expect(screen.getByRole("button", { name: "対応を線で結ぶを選択（おすすめ）" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    const graph = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    expect(graph.querySelectorAll('[data-graph-layer="unit-trajectory"]')).toHaveLength(4);
    fixture.draft.experiments.forEach((experiment) => {
      const stableUnitId = experiment.stableUnitId!;
      const points = [
        ...graph.querySelectorAll<SVGCircleElement>(`[data-experiment-id="${stableUnitId}"]`),
      ];
      expect(points).toHaveLength(2);
      const trajectory = graph.querySelector<SVGPolylineElement>(
        `[data-trajectory-id="matched:${stableUnitId}"]`,
      );
      expect(trajectory).toHaveAttribute(
        "points",
        points.map((point) => `${point.getAttribute("cx")},${point.getAttribute("cy")}`).join(" "),
      );
    });
  });

  it("Data Sheetで安定単位IDを変えると既存Graphの結果・注釈・Methodsを失効する", async () => {
    const fixture = createPairedTwoConditionFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        analysisRunner={async (request): Promise<AnalysisEngineResult> => ({
          protocolVersion: request.protocolVersion,
          requestId: request.requestId,
          status: "ok",
          engine: { name: "fixture-engine", version: "1", packages: { scipy: "1" } },
          estimates: [],
          tests: [
            {
              name: "paired_t_test",
              statisticName: "t",
              statistic: 3,
              degreesOfFreedom: [3],
              pValue: 0.02,
              adjustedPValue: null,
              effectSizeName: "dz",
              effectSize: 1.2,
            },
          ],
          diagnostics: [],
          warnings: [],
          completedAt: "2026-08-22T00:00:00.000Z",
        })}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    expect(screen.getByRole("region", { name: "統計ワークスペース" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "編集対象" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /同じ実験単位の2条件/ }));
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
    await screen.findByRole("group", { name: "統計解析結果" });
    fireEvent.change(screen.getByRole("combobox", { name: "統計注釈の表示" }), {
      target: { value: "exact_p" },
    });
    fireEvent.click(screen.getByRole("button", { name: "グラフ (1)" }));
    expect(
      screen
        .getByRole("img", { name: /実験単位ごとのグラフ/ })
        .querySelector('[data-graph-layer="statistics-annotation"]'),
    ).toHaveTextContent("p = 0.02");

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(screen.getByRole("tab", { name: "Animal 1" }));
    fireEvent.click(screen.getByText(/実験情報（/));
    fireEvent.change(screen.getByRole("textbox", { name: "Animal 1の生物学的単位ID" }), {
      target: { value: "unit.corrected.animal-1" },
    });
    expect(await screen.findByText(/以前の解析結果・p値注釈・Methodsを外しました/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    expect(screen.queryByRole("group", { name: "統計解析結果" })).toBeNull();
    expect(screen.queryByText("Methodsと再現記録")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "グラフ (1)" }));
    expect(
      screen
        .getByRole("img", { name: /実験単位ごとのグラフ/ })
        .querySelector('[data-graph-layer="statistics-annotation"]'),
    ).toBeNull();
  });

  it("模式図と現在データpreviewからGraphを選び、小標本Boxには案内だけを出す", () => {
    const fixture = createComplexProportionFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    const dialog = screen.getByRole("dialog", { name: "グラフの基本形を選ぶ" });
    expect(within(dialog).getAllByRole("img", { name: /の模式図/ })).toHaveLength(7);
    fireEvent.click(within(dialog).getByRole("button", { name: "Boxを選択" }));
    expect(
      within(dialog).getByRole("img", { name: /boxで現在のデータを表示したpreview/ }),
    ).toBeVisible();
    expect(within(dialog).getByText(/biological replicateが3点/)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "このグラフを作成" })).toBeEnabled();
  });

  it("Dot初期表示で個々の生物学的反復と平均・SDを表示する", () => {
    const fixture = createComplexProportionFixture();
    render(
      <ExperimentWorkspace
        initialDraft={fixture.draft}
        initialCells={fixture.cells}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    chooseAndCreateGraph(/Dotを選択/);
    const graph = screen.getByRole("img", { name: /実験単位ごとのグラフ/ });
    expect(graph.querySelectorAll('[data-graph-layer="proportion-experiment"]')).not.toHaveLength(
      0,
    );
    expect(graph.querySelectorAll('[data-graph-layer="proportion-summary"]')).not.toHaveLength(0);
    expect(graph.querySelectorAll('[data-graph-layer="violin"]')).toHaveLength(0);
    expect(graph.querySelectorAll('[data-graph-layer="nested-distribution"]')).toHaveLength(0);
  });

  it("グラフ作成完了メッセージを短時間で閉じる", () => {
    vi.useFakeTimers();
    try {
      const fixture = createComplexProportionFixture();
      render(
        <ExperimentWorkspace
          initialDraft={fixture.draft}
          initialCells={fixture.cells}
          onBack={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
      chooseAndCreateGraph(/Dotを選択/);
      expect(screen.getByText("グラフ 1を作成しました。")).toBeVisible();
      act(() => vi.advanceTimersByTime(2700));
      expect(screen.queryByText("グラフ 1を作成しました。")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("新しいworkspaceをcanonical projectとして保存し、同じtargetへ上書きできる", async () => {
    const draft = draftWithTwoConditions("proportion");
    const saveProject = vi.fn(async (state, target?: string) => ({
      state,
      target: target ?? "/tmp/workspace.lsa",
    }));
    render(<ExperimentWorkspace initialDraft={draft} onBack={vi.fn()} saveProject={saveProject} />);

    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの陽性数" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの対象数" }), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));

    expect(await screen.findByText(/次回もこの入力画面で再編集/)).toBeVisible();
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0]?.[0].observations[0]?.measurement).toEqual({
      kind: "proportion",
      numerator: 5,
      denominator: 10,
    });
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    expect(saveProject.mock.calls[1]?.[1]).toBe("/tmp/workspace.lsa");
    expect(saveProject.mock.calls[1]?.[0].rawRevisions).toHaveLength(2);
  });
});
