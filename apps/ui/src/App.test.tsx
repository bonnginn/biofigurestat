import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "./App";
import { createExperimentSetDraft } from "./app/experimentDraft";
import { createExperimentWorkspaceProject } from "./app/experimentWorkspaceProject";
import { saveFavoriteDesign } from "./app/favoriteDesigns";
import { rememberRecentProject } from "./app/recentProjects";

const desktopTestActions = {
  openProject: async () => null,
  saveProject: async () => null,
};

describe("workspace home", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("お気に入りの設計をデータなしで呼び出し、確認画面から修正できる", () => {
    const draft = {
      ...createExperimentSetDraft("cell_culture", "proportion"),
      name: "陽性率の定番設計",
      conditions: [
        { id: "condition.1", label: "Control", attributes: { "attribute.1": "Control" } },
        { id: "condition.2", label: "Treatment", attributes: { "attribute.1": "Treatment" } },
      ],
    };
    saveFavoriteDesign(draft, [], new Date("2026-08-21T00:00:00.000Z"));
    render(<App projectActions={desktopTestActions} />);

    fireEvent.click(document.querySelector('[data-primary-route="favorites"]')!);
    expect(screen.getByText("陽性率の定番設計")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "この設計から始める" }));

    expect(screen.getByRole("heading", { name: "この実験の設計を確認" })).toBeVisible();
    expect(screen.getByRole("button", { name: "設計を修正" })).toBeVisible();
  });

  it("shows exactly the four primary starting points", () => {
    render(<App />);

    expect(document.querySelectorAll("[data-primary-route]")).toHaveLength(6);
    expect(screen.getByText("実験の内容を先に整理")).toBeVisible();
    expect(screen.getByText(/背景、測定項目、条件、時間、実験回を短い質問/)).toBeVisible();
    expect(screen.queryByText(/対応のある生物学的単位/)).not.toBeInTheDocument();
    expect(screen.queryByText(/解析前に推定された構造/)).not.toBeInTheDocument();
    for (const route of [
      "favorites",
      "new-experiment",
      "recent",
      "open-project",
      "survival",
      "heatmap",
    ]) {
      expect(document.querySelector(`[data-primary-route="${route}"]`)).toBeVisible();
    }
  });

  it("ホームの「プロジェクトを開く」は、直前のprojectでなく毎回file dialogを開く", async () => {
    const baseDraft = createExperimentSetDraft("cell_culture", "proportion");
    const draft = {
      ...baseDraft,
      conditions: [
        {
          ...baseDraft.conditions[0],
          label: "Control",
          attributes: { "attribute.1": "Control" },
        },
        {
          ...baseDraft.conditions[1],
          label: "Treatment",
          attributes: { "attribute.1": "Treatment" },
        },
      ],
    };
    const project = {
      state: createExperimentWorkspaceProject({
        draft,
        cells: {},
        graphs: [],
        now: "2026-08-22T00:00:00.000Z",
      }),
      target: "/tmp/open-again.lsa",
    };
    const openProject = vi.fn(async () => project);
    render(<App projectActions={{ openProject, saveProject: async () => null }} />);

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await waitFor(() => expect(openProject).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("tab", { name: "Exp 1" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));
    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await waitFor(() => expect(openProject).toHaveBeenCalledTimes(2));
  });

  it("最近のプロジェクトから保存済みlsaを直接開く", async () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const draft = {
      ...base,
      name: "最近の陽性率",
      conditions: base.conditions.slice(0, 2).map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Control" : "Treatment",
        attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
      })),
    };
    const project = {
      state: createExperimentWorkspaceProject({
        draft,
        cells: {},
        graphs: [],
        now: "2026-08-22T00:00:00.000Z",
      }),
      target: "/tmp/recent-positive.lsa",
    };
    rememberRecentProject({ target: project.target, name: "最近の陽性率" });
    const openProjectTarget = vi.fn(async () => project);
    render(
      <App
        projectActions={{
          openProject: async () => null,
          openProjectTarget,
          saveProject: async () => null,
        }}
      />,
    );

    fireEvent.click(document.querySelector('[data-primary-route="recent"]')!);
    expect(screen.getByText("最近の陽性率")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "開く" }));
    await waitFor(() => expect(openProjectTarget).toHaveBeenCalledWith(project.target));
    expect(await screen.findByRole("tab", { name: "Exp 1" })).toBeVisible();
  });

  it("opens the context-first experiment starter screen", () => {
    render(<App projectActions={desktopTestActions} />);

    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);

    expect(screen.getByRole("heading", { name: "何をした実験ですか？" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "どのような実験ですか？" })).toBeVisible();
    expect(document.querySelectorAll("[data-context]")).toHaveLength(6);
    expect(document.querySelector('[data-context="cell_culture"]')).not.toHaveAttribute("disabled");
    expect(document.querySelector('[data-context="protein_biochemical"]')).not.toBeDisabled();
    expect(screen.queryAllByText("準備中")).toHaveLength(0);

    fireEvent.click(document.querySelector('[data-context="cell_culture"]')!);
    expect(screen.getByRole("heading", { name: "今回、主に何を解析しましたか？" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /陽性数・割合/ }));
    expect(screen.getByRole("heading", { name: "何を測りましたか？" })).toBeVisible();
    expect(screen.queryByText("ウェスタンブロット（WB）")).not.toBeInTheDocument();
    expect(screen.queryByText("顕微鏡")).not.toBeInTheDocument();
  });

  it("starts a WB workflow with source-preserving target and reference fields", () => {
    render(<App projectActions={desktopTestActions} />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(document.querySelector('[data-context="protein_biochemical"]')!);
    fireEvent.click(screen.getByRole("button", { name: /Western blot/ }));

    expect(screen.getByRole("radio", { name: /Target \+ reference/ })).toBeChecked();
    expect(screen.getByLabelText("referenceの名前")).toHaveValue("GAPDH");
    expect(screen.getByText(/Target\/referenceを計算/)).toBeVisible();
    expect(screen.getByRole("radio", { name: "追加しない" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "各実験回で先頭の条件を1にする" }));
    expect(screen.getByText(/選んだ場合だけ適用し、標的・referenceの生値は残します/)).toBeVisible();
  });

  it("既存の表をpreviewし、明示的な列割り当てから入力画面を作る", () => {
    render(<App projectActions={desktopTestActions} />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(document.querySelector('[data-context="existing_data"]')!);
    fireEvent.change(screen.getByRole("textbox", { name: "既存データの表" }), {
      target: {
        value:
          "Experiment\tCondition\tMean\nE1\tControl\t10\nE1\tTreatment\t20\nE2\tControl\t11\nE2\tTreatment\t21",
      },
    });
    expect(screen.getByRole("table", { name: "取込プレビュー" })).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "実験回／sessionの列" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "生物学的単位IDの列" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "条件の列" }), {
      target: { value: "1" },
    });
    expect(screen.getByRole("combobox", { name: "測定値の列" })).toHaveValue("2");
    fireEvent.click(screen.getByRole("button", { name: "この割り当てで入力画面を作る" }));
    expect(screen.getByRole("heading", { name: "この実験構造で取り込みますか？" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "この構造で取り込む" }));

    expect(screen.getByRole("tab", { name: "E1" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "E2" })).toBeVisible();
    fireEvent.click(screen.getByText("取込元・列の割り当て・変換履歴を確認"));
    expect(screen.getByRole("table", { name: "取込元の表（未変更）" })).toBeVisible();
    expect(screen.getByRole("table", { name: "確認済みの列割り当て" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "E1" }));
    expect(screen.getByRole("button", { name: "Controlの生データを開く" })).toHaveTextContent(
      "n=1 / 平均 10",
    );
  });

  it("条件が列に並ぶExcel/Prism型の表を矩形のまま取り込む", () => {
    render(<App projectActions={desktopTestActions} />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(document.querySelector('[data-context="existing_data"]')!);
    fireEvent.change(screen.getByRole("textbox", { name: "既存データの表" }), {
      target: {
        value: "Experiment\tControl\tsiRNA #1\tsiRNA #2\nE1\t10\t15\t14\nE2\t11\t17\t16",
      },
    });
    fireEvent.click(screen.getByRole("radio", { name: "条件ごとに列が分かれている" }));
    fireEvent.change(screen.getByRole("combobox", { name: "実験回／sessionの列" }), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "この割り当てで入力画面を作る" }));
    fireEvent.click(screen.getByRole("button", { name: "この構造で取り込む" }));

    expect(screen.getByRole("tab", { name: "E1" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "E2" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "E1" }));
    expect(screen.getByRole("button", { name: "Controlの生データを開く" })).toHaveTextContent(
      "n=1 / 平均 10",
    );
    expect(screen.getByRole("button", { name: "siRNA #2の生データを開く" })).toHaveTextContent(
      "n=1 / 平均 14",
    );
  });

  it("重複したunitキーを自動的に平均せず、科学的な意味を確認する", () => {
    render(<App projectActions={desktopTestActions} />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(document.querySelector('[data-context="existing_data"]')!);
    fireEvent.change(screen.getByRole("textbox", { name: "既存データの表" }), {
      target: {
        value:
          "Session\tUnit\tCondition\tMean\nExp 1\tU1\tControl\t10\nExp 1\tU1\tControl\t12\nExp 1\tU2\tTreatment\t20",
      },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "実験回／sessionの列" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "生物学的単位IDの列" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "条件の列" }), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "測定値の列" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "この割り当てで入力画面を作る" }));

    expect(screen.getByRole("region", { name: "重複した行の確認" })).toHaveTextContent(
      "Exp 1 / U1 / Control / none：行 1、2",
    );
    expect(
      screen.getByRole("button", { name: "同じ単位内の複数の生測定として扱う" }),
    ).toBeVisible();
    expect(screen.queryByRole("tab", { name: "U1" })).not.toBeInTheDocument();
  });

  it("opens deterministic synthetic data without presenting it as research data", () => {
    render(<App />);
    expect(screen.getByText("ブラウザUXプレビュー")).toBeVisible();
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);

    expect(screen.getByRole("heading", { name: "合成デモデータですぐ試す" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "どのような実験ですか？" })).toBeVisible();
    expect(document.querySelector('[data-review-entry="phase-a"]')).toBeVisible();
    expect(document.querySelector('[data-review-entry="phase-b"]')).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /複雑な割合データ/ }));

    expect(screen.getByText("合成デモデータ", { selector: "strong" })).toBeVisible();
    expect(screen.getByText(/学習・画面確認用の人工データ/)).toBeVisible();
    expect(screen.getByRole("tab", { name: "Exp 1" })).toBeVisible();
    expect(screen.getByText(/測定予定なし：1セル/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "← 戻る" }));
    expect(screen.getByRole("heading", { name: "合成デモデータですぐ試す" })).toBeVisible();
  });

  it("returns to Home with the visible back action", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /最近のプロジェクト/ }));
    expect(screen.getByRole("heading", { name: "最近のプロジェクト" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /ワークスペースに戻る/ }));
    expect(screen.getByRole("heading", { name: /どの実験を整理しますか？/ })).toBeVisible();
  });
});
