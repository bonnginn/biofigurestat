import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import type { SaveProjectAction } from "../app/projectActions";
import { ComparisonWizard } from "./ComparisonWizard";
import { NewExperimentPage } from "./NewExperimentPage";
import { OpenProjectPage } from "./OpenProjectPage";

function fillAllExperimentalUnitTabs(baseValue = 1) {
  const nTabs = screen.getAllByRole("tab", { name: /^N\d+$/ });
  if (nTabs.length === 0) throw new Error("実験単位のNタブが見つかりません");

  nTabs.forEach((tab, unitIndex) => {
    fireEvent.click(tab);
    screen.getAllByRole("spinbutton").forEach((input, inputIndex) => {
      fireEvent.change(input, {
        target: { value: String(baseValue + unitIndex * 10 + inputIndex) },
      });
    });
  });
}

describe("D01/D02 design wizard", () => {
  it("入力した条件名を模式グラフの横軸へすぐに反映する", () => {
    render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);

    const preview = screen.getByRole("region", { name: "実験デザインの模式プレビュー" });
    fireEvent.change(screen.getByLabelText("条件A"), { target: { value: "低酸素" } });
    fireEvent.change(screen.getByLabelText("条件B"), { target: { value: "通常酸素" } });

    expect(within(preview).getByText("低酸素")).toBeVisible();
    expect(within(preview).getByText("通常酸素")).toBeVisible();
  });

  it("独立群の共通入口から条件数と要因数で解析経路を切り替える", () => {
    render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);

    const familyQuestion = screen.getByRole("group", { name: "実験の大きな分類" });
    expect(within(familyQuestion).getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "別々の実験単位を2条件で比較" })).toBeVisible();

    fireEvent.change(screen.getByRole("spinbutton", { name: "独立した条件の数" }), {
      target: { value: "4" },
    });
    expect(screen.getByRole("heading", { name: "別々の実験単位を4条件で比較" })).toBeVisible();

    fireEvent.click(screen.getByRole("radio", { name: /2種類の処置を組み合わせた/ }));
    expect(screen.getByRole("heading", { name: "別々の実験単位を4条件で比較" })).toBeVisible();
  });

  it("WBでは生バンド入力を選ぶと標的／ローディングコントロール比を計算する", () => {
    render(<ComparisonWizard purpose="western_blot" onBack={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /WB生バンド/ }));

    const target = screen.getByRole("spinbutton", { name: /対照 .*1：標的バンド強度/ });
    const loadingControl = screen.getByRole("spinbutton", {
      name: /対照 .*1：ローディングコントロール強度/,
    });
    expect(screen.queryByRole("textbox", { name: "スカラー値を貼り付け" })).not.toBeInTheDocument();

    fireEvent.change(target, { target: { value: "80" } });
    fireEvent.change(loadingControl, { target: { value: "20" } });

    expect(screen.getByRole("status", { name: /対照 実験単位 1：計算された比/ })).toHaveTextContent(
      "4.000",
    );
  });

  it("WB生バンドの入力を保存後も再編集できる", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "/tmp/wb-loading-control-editable.lsa",
    }));
    render(
      <ComparisonWizard
        purpose="western_blot"
        onBack={() => undefined}
        saveProject={saveProject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /WB生バンド/ }));
    fillAllExperimentalUnitTabs(10);
    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    fireEvent.click(screen.getByRole("tab", { name: /4 保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const state = saveProject.mock.calls[0]?.[0];
    if (!state) throw new Error("WB raw-band save fixture was not created");
    const savedDesign = state.designRevisions.find(
      (revision) => revision.id === state.activeDesignRevisionId,
    )?.design;
    expect(savedDesign?.normalizationPlans).toEqual([
      expect.objectContaining({
        id: "normalization.loading-control",
        method: "loading_control",
        parameters: { transformationVersion: "0.1.0" },
      }),
    ]);
    expect(savedDesign?.wizardDecisions).toContainEqual({
      questionId: "wb-input-mode",
      answer: "raw-band-loading-control",
    });

    cleanup();
    render(
      <OpenProjectPage
        onNavigate={() => undefined}
        openProject={async () => null}
        persistedProject={{ state, target: "/tmp/wb-loading-control-editable.lsa" }}
        saveProject={saveProject}
      />,
    );

    expect(screen.getByRole("heading", { name: "実験単位ごとに値を入力" })).toBeVisible();
    expect(screen.getByRole("spinbutton", { name: /対照 .*1：標的バンド強度/ })).toHaveValue(10);
  });

  it("new experiment starts from the research context before any design detail", () => {
    render(<NewExperimentPage onNavigate={() => undefined} />);

    expect(screen.getByRole("heading", { name: "どのような実験ですか？" })).toBeVisible();
    fireEvent.click(document.querySelector('[data-context="cell_culture"]')!);
    fireEvent.click(screen.getByRole("button", { name: /陽性数・割合/ }));

    expect(screen.getByRole("heading", { name: "何を測りましたか？" })).toBeVisible();
    expect(screen.queryByText(/推奨手法/)).not.toBeInTheDocument();
    expect(screen.queryByText(/D0[1-9]/)).not.toBeInTheDocument();
  });

  it("routes the same animal measured twice to D02", () => {
    render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);

    fireEvent.click(screen.getByLabelText(/同じ生物学的単位を両条件で測定/));

    expect(screen.getByRole("heading", { name: "同じ実験単位を2条件で測定" })).toBeVisible();
    expect(screen.getByText(/推奨手法：対応のあるt検定/)).toBeInTheDocument();
    expect(screen.getByText(/対応のある動物/)).toBeInTheDocument();
    expect(screen.getByText(/各対応単位から、両条件に1つずつ値が得られます/)).toBeInTheDocument();
  });

  it("D09プロジェクトを保存後に相関入力シートとして再編集できる", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "/tmp/d09-editable.lsa",
    }));
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} saveProject={saveProject} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /2つの測定値の関係を見たい/ }));
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(document.querySelector('[data-outcome-choice="microscopy-intensity"]')!);
    fillAllExperimentalUnitTabs();
    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    fireEvent.click(screen.getByRole("tab", { name: /4 保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const state = saveProject.mock.calls[0]?.[0];
    if (!state) throw new Error("D09 save fixture was not created");
    const savedDesign = state.designRevisions.find(
      (revision) => revision.id === state.activeDesignRevisionId,
    )?.design;
    expect(savedDesign?.wizardDecisions).toContainEqual({
      questionId: "correlation.relationship_form",
      answer: "linear",
    });

    cleanup();
    render(
      <OpenProjectPage
        onNavigate={() => undefined}
        openProject={async () => null}
        persistedProject={{ state, target: "/tmp/d09-editable.lsa" }}
        saveProject={saveProject}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /2 解析/ }));
    expect(screen.getByRole("heading", { name: "D09 · 2つの測定値の相関" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /1 データ入力/ }));
    const restored = screen.getAllByRole("spinbutton")[0];
    expect(restored).toHaveValue(1);
    fireEvent.change(restored, { target: { value: "42" } });
    expect(restored).toHaveValue(42);
  });

  it("opens the D03 independent multi-group sheet with at least three conditions", () => {
    render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);

    fireEvent.change(screen.getByRole("spinbutton", { name: "独立した条件の数" }), {
      target: { value: "3" },
    });
    expect(screen.getByRole("heading", { name: "別々の実験群を比べる" })).toBeVisible();
    expect(screen.getByText("各条件は別の独立した実験単位です。")).toBeVisible();
    expect(
      screen
        .getAllByRole("button", { name: "削除" })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(screen.getByRole("heading", { name: "別々の実験単位を3条件で比較" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));

    expect(screen.getByRole("heading", { name: "3条件の実験単位を入力" })).toBeVisible();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.queryByRole("radio", { name: /同じ生物学的単位/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "スカラー値を貼り付け" }), {
      target: { value: "Area\tMean\n1\t10\n2\t20\n3\t30" },
    });
    expect(screen.getByRole("combobox", { name: "数値列" })).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "選択した条件に適用" }));
    expect(screen.getByRole("spinbutton", { name: /^(条件A|対照) 実験単位 1$/ })).toHaveValue(10);
  });

  it("D03のsiRNA系列を保存後も上位グループ付きで再編集できる", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "/tmp/d03-sirna-series.lsa",
    }));
    render(
      <ComparisonWizard
        purpose="microscopy"
        initialPattern={{
          templateId: "D03",
          plannedN: 3,
          conditionCount: 4,
          multiGroupPreset: "sirna-series",
        }}
        onBack={() => undefined}
        saveProject={saveProject}
      />,
    );

    expect(screen.getByDisplayValue("Control")).toBeVisible();
    expect(screen.getByDisplayValue("siRNA #1")).toBeVisible();
    fireEvent.click(screen.getByText("詳細設定：関連する条件を見た目上まとめる"));
    expect(screen.getByLabelText("条件 1 の表示上の分類")).toHaveValue("対照群");
    expect(screen.getByLabelText("条件 2 の表示上の分類")).toHaveValue("標的群");
    expect(screen.getByText(/各条件は別々に比較し、値を合算しません/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));
    fillAllExperimentalUnitTabs();
    fireEvent.click(screen.getByRole("button", { name: /検証して解析へ/ }));
    fireEvent.click(screen.getByRole("tab", { name: /4 保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const state = saveProject.mock.calls[0]?.[0];
    if (!state) throw new Error("D03 grouped save fixture was not created");
    const savedDesign = state.designRevisions.find(
      (revision) => revision.id === state.activeDesignRevisionId,
    )?.design;
    expect(savedDesign?.factors[0]?.levelGroups?.map((group) => group.label)).toEqual([
      "対照群",
      "標的群",
    ]);
    expect(savedDesign?.factors[0]?.levels.slice(1).every((level) => level.groupId)).toBe(true);

    cleanup();
    render(
      <OpenProjectPage
        onNavigate={() => undefined}
        openProject={async () => null}
        persistedProject={{ state, target: "/tmp/d03-sirna-series.lsa" }}
        saveProject={saveProject}
      />,
    );
    expect(screen.getByRole("heading", { name: "4条件の実験単位を入力" })).toBeVisible();
    const restored = screen.getByRole("spinbutton", { name: /Control 実験単位 1/ });
    expect(restored).toHaveValue(1);
    fireEvent.change(restored, { target: { value: "42" } });
    expect(restored).toHaveValue(42);
  });

  it("routes the same units measured in three conditions to D04", () => {
    render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);

    fireEvent.click(screen.getByRole("radio", { name: /同じ動物・試料を複数条件で測定した/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "繰り返し測定した条件の数" }), {
      target: { value: "3" },
    });

    expect(screen.getByRole("heading", { name: "同じ実験単位を繰り返し測定する" })).toBeVisible();
    expect(screen.getByLabelText("繰り返し測定する生物学的単位")).toHaveValue("animal");
    expect(screen.getByText(/単に同じ日に扱った別ディッシュは含みません/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "同じ実験単位を3条件で測定" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));

    expect(screen.getByRole("heading", { name: "同じ実験単位ごとに値を入力" })).toBeVisible();
    expect(screen.getByText("同じ行が同じ対応単位")).toBeVisible();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getByRole("spinbutton", { name: /対照 実験単位 1/ })).toBeVisible();
  });

  it("reopens a saved D04 project as an editable matched sheet", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "/tmp/d04-editable.lsa",
    }));
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} saveProject={saveProject} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /同じ動物・試料を複数条件で測定した/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "繰り返し測定した条件の数" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(document.querySelector('[data-outcome-choice="microscopy-intensity"]')!);
    fillAllExperimentalUnitTabs();
    fireEvent.click(screen.getByRole("button", { name: /検証して解析へ/ }));
    fireEvent.click(screen.getByRole("tab", { name: /4 保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const state = saveProject.mock.calls[0]?.[0];
    if (!state) throw new Error("D04 save fixture was not created");

    cleanup();
    render(
      <OpenProjectPage
        onNavigate={() => undefined}
        openProject={async () => null}
        persistedProject={{ state, target: "/tmp/d04-editable.lsa" }}
        saveProject={saveProject}
      />,
    );

    expect(screen.getByRole("heading", { name: "同じ実験単位ごとに値を入力" })).toBeVisible();
    const restored = screen.getByRole("spinbutton", { name: /対照 実験単位 1/ });
    expect(restored).toHaveValue(1);
    fireEvent.change(restored, { target: { value: "42" } });
    expect(restored).toHaveValue(42);
  });

  it("2×2要因配置を独立した4条件シートにする", () => {
    render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);

    fireEvent.click(screen.getByRole("radio", { name: /2種類の処置を組み合わせた/ }));
    expect(
      screen.getByRole("heading", { name: "2種類の処置を組み合わせた実験を設計する" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "別々の実験単位を4条件で比較" })).toBeVisible();
    expect(screen.getByText(/4条件それぞれに別の実験単位/)).toBeVisible();

    fireEvent.change(screen.getByLabelText("処置Aの名前"), { target: { value: "siRNA" } });
    fireEvent.change(screen.getByLabelText("処置Bの名前"), { target: { value: "光刺激" } });
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));

    expect(screen.getByRole("heading", { name: "4個の組み合わせ条件を入力" })).toBeVisible();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getByText("独立した入力列")).toBeVisible();
  });

  it("D05プロジェクトを保存後に再編集できる", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "/tmp/d05-editable.lsa",
    }));
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} saveProject={saveProject} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /2種類の処置を組み合わせた/ }));
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));
    fillAllExperimentalUnitTabs();
    fireEvent.click(screen.getByRole("button", { name: /検証して解析へ/ }));
    fireEvent.click(screen.getByRole("tab", { name: /4 保存/ }));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const state = saveProject.mock.calls[0]?.[0];
    if (!state) throw new Error("D05 save fixture was not created");

    cleanup();
    render(
      <OpenProjectPage
        onNavigate={() => undefined}
        openProject={async () => null}
        persistedProject={{ state, target: "/tmp/d05-editable.lsa" }}
        saveProject={saveProject}
      />,
    );
    expect(screen.getByRole("heading", { name: "4個の組み合わせ条件を入力" })).toBeVisible();
    const restored = screen.getByRole("spinbutton", { name: /なし \/ なし 実験単位 1/ });
    expect(restored).toHaveValue(1);
    fireEvent.change(restored, { target: { value: "42" } });
    expect(restored).toHaveValue(42);
  });

  it("siRNA 3配列 × 薬剤 −/+ を8条件として作り、配列をnにしない", () => {
    render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);
    fireEvent.click(screen.getByRole("radio", { name: /2種類の処置を組み合わせた/ }));
    fireEvent.click(screen.getByRole("button", { name: /Control \/ siRNA #1〜#3 × 薬剤 −\/\+/ }));

    expect(screen.getByText(/siRNA #1・#2・#3はそれぞれ別の条件/)).toBeVisible();
    expect(screen.getByText(/表示上.*統計解析では合算しません/)).toBeVisible();
    expect(screen.getByText("8個の組み合わせ条件を自動で作成します。")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));

    expect(screen.getByRole("heading", { name: "8個の組み合わせ条件を入力" })).toBeVisible();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: "N3" }));
    expect(screen.getByRole("spinbutton", { name: /siRNA #3 \/ \+ 実験単位 3/ })).toBeVisible();
  });

  it("複数の対照と標的試薬へ任意の上位グループを割り当てる", () => {
    render(<ComparisonWizard purpose="microscopy" onBack={() => undefined} />);

    fireEvent.click(screen.getByRole("radio", { name: /2種類の処置を組み合わせた/ }));
    fireEvent.click(screen.getByRole("button", { name: "処置Aの条件名を追加" }));
    fireEvent.click(screen.getByRole("button", { name: "処置Aの条件名を追加" }));

    ["対照A", "対照B", "siRNA #1", "siRNA #2"].forEach((label, index) => {
      fireEvent.change(screen.getByLabelText(`処置A 条件名${index + 1}`), {
        target: { value: label },
      });
    });
    ["対照群", "対照群", "標的X群", "標的X群"].forEach((label, index) => {
      fireEvent.change(screen.getByLabelText(`処置A 条件名${index + 1}の表示上の分類`), {
        target: { value: label },
      });
    });

    expect(screen.getByText(/表示上は/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(screen.getByRole("button", { name: /顕微鏡強度/ }));
    expect(screen.getByRole("heading", { name: "8個の組み合わせ条件を入力" })).toBeVisible();
  });
});
