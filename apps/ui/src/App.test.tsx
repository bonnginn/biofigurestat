import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import App, { projectIoStage } from "./App";
import { createExperimentSetDraft } from "./app/experimentDraft";
import { createExperimentWorkspaceProject } from "./app/experimentWorkspaceProject";
import { saveFavoriteDesign } from "./app/favoriteDesigns";
import type { ProjectActions } from "./app/projectActions";
import { rememberRecentProject } from "./app/recentProjects";

const desktopTestActions = {
  openProject: async () => null,
  saveProject: async () => null,
};

const unresolvedBridgeCases = [
  { bridgeCase: "none", hasUnresolvedSave: false, hasUnresolvedOpen: false },
  { bridgeCase: "save-only", hasUnresolvedSave: true, hasUnresolvedOpen: false },
  { bridgeCase: "open-only", hasUnresolvedSave: false, hasUnresolvedOpen: true },
  { bridgeCase: "both", hasUnresolvedSave: true, hasUnresolvedOpen: true },
] as const;

describe("project save diagnostics", () => {
  it("extracts a privacy-safe save stage without requiring technical details", () => {
    expect(
      projectIoStage(
        new Error("PROJECT_IO_STAGE[container_commit]: Could not replace the project atomically"),
      ),
    ).toBe("container_commit");
    expect(projectIoStage(new Error("unclassified"))).toBeNull();
  });
});

describe("workspace home", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("新しいrouteとfresh-startを常に画面先頭から開く", async () => {
    render(<App />);
    const scrollTo = vi.mocked(window.scrollTo);
    scrollTo.mockClear();

    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });

    fireEvent.click(screen.getByRole("button", { name: /^Simple 3群（連続値）/ }));
    await screen.findByRole("heading", { name: "合成デモ：Simple 3群（連続値）" });
    scrollTo.mockClear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /新しい実験/ }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
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

    expect(document.querySelectorAll("[data-primary-route]")).toHaveLength(4);
    expect(screen.getByText("実験から始めるか、専用シートへ直接進む")).toBeVisible();
    expect(screen.getByText(/生存時間、濃度–反応、ヒートマップ/)).toBeVisible();
    expect(screen.queryByText(/対応のある生物学的単位/)).not.toBeInTheDocument();
    expect(screen.queryByText(/解析前に推定された構造/)).not.toBeInTheDocument();
    for (const route of ["favorites", "new-experiment", "recent", "open-project"]) {
      expect(document.querySelector(`[data-primary-route="${route}"]`)).toBeVisible();
    }
  });

  it("keeps the adaptive feature flag while navigating from Home to New Experiment", () => {
    window.history.replaceState({}, "", "/?adaptiveInput=1");
    render(<App />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    expect(window.location.search).toBe("?adaptiveInput=1");
    expect(screen.getByRole("heading", { name: "何から始めますか？" })).toBeVisible();
    expect(screen.getByRole("button", { name: "実験から始めるを開く" })).toBeVisible();
    expect(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "ヒートマップを開く" })).toBeEnabled();
    expect(screen.queryByText(/保存・再開する接続がそろっていない/)).toBeNull();
  });

  it.each(unresolvedBridgeCases)(
    "keeps Graph-only and Heatmap fail-closed with $bridgeCase unresolved bridges",
    async ({ hasUnresolvedSave, hasUnresolvedOpen }) => {
      window.history.replaceState({}, "", "/?adaptiveInput=1");
      const standardOpen = vi.fn(async () => null);
      const standardSave = vi.fn(async () => null);
      const unresolvedOpen = vi.fn(async () => null);
      const unresolvedSave = vi.fn(async () => null);
      const projectActions: ProjectActions = {
        openProject: standardOpen,
        saveProject: standardSave,
        ...(hasUnresolvedOpen ? { openUnresolvedVisualizationProject: unresolvedOpen } : {}),
        ...(hasUnresolvedSave ? { saveUnresolvedVisualizationProject: unresolvedSave } : {}),
      };
      render(<App projectActions={projectActions} />);

      fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
      const graphOnlyEntry = screen.getByRole("button", {
        name: "手元の表からGraphを作るを開く",
      });
      const heatmapEntry = screen.getByRole("button", { name: "ヒートマップを開く" });
      const persistenceAvailable = hasUnresolvedSave && hasUnresolvedOpen;
      if (!persistenceAvailable) {
        expect(graphOnlyEntry).toBeDisabled();
        expect(heatmapEntry).toBeDisabled();
        expect(screen.getByText(/Graph用データを保存・再開する接続がそろっていない/)).toBeVisible();
        expect(screen.getByText(/行列とGraphを保存・再開する接続がそろっていない/)).toBeVisible();
        fireEvent.click(graphOnlyEntry);
        fireEvent.click(heatmapEntry);
        expect(window.location.pathname).toBe("/new-experiment");
        expect(unresolvedSave).not.toHaveBeenCalled();
        expect(unresolvedOpen).not.toHaveBeenCalled();
        expect(standardOpen).not.toHaveBeenCalled();
        expect(standardSave).not.toHaveBeenCalled();
        return;
      }

      expect(graphOnlyEntry).toBeEnabled();
      fireEvent.click(graphOnlyEntry);
      fireEvent.change(screen.getByRole("textbox", { name: "Graph用の表" }), {
        target: { value: "X\tY\n0\t1\n1\t2" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
        target: { value: "0" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
        target: { value: "1" },
      });

      const graphOnlySave = screen.getByRole("button", {
        name: "このGraph用データを保存",
      });
      const graphOnlyOpen = screen.queryByRole("button", {
        name: "保存したGraph用データを開く",
      });
      expect(graphOnlySave).toBeEnabled();
      fireEvent.click(graphOnlySave);
      await waitFor(() => expect(unresolvedSave).toHaveBeenCalledOnce());
      expect(graphOnlyOpen).toBeVisible();
      fireEvent.click(graphOnlyOpen!);
      await waitFor(() => expect(unresolvedOpen).toHaveBeenCalledOnce());
      expect(window.location.pathname).toBe("/new-experiment");
      expect(standardOpen).not.toHaveBeenCalled();
      expect(standardSave).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "入口へ戻る" }));
      const reopenedHeatmapEntry = screen.getByRole("button", { name: "ヒートマップを開く" });
      expect(reopenedHeatmapEntry).toBeEnabled();
      fireEvent.click(reopenedHeatmapEntry);
      fireEvent.change(screen.getByLabelText("Matrix data"), {
        target: { value: "Feature\tSample A\tSample B\nProtein A\t1\t2" },
      });

      const heatmapSave = screen.getByRole("button", { name: "プロジェクトを保存" });
      const heatmapOpen = screen.getByRole("button", {
        name: "保存済みHeatmap projectを開く",
      });
      expect(heatmapSave).toBeEnabled();
      fireEvent.click(heatmapSave);
      await waitFor(() => expect(unresolvedSave).toHaveBeenCalledTimes(2));
      expect(heatmapOpen).toBeEnabled();
      fireEvent.click(heatmapOpen);
      await waitFor(() => expect(unresolvedOpen).toHaveBeenCalledTimes(2));
      const bridgeNote = screen.queryByText(
        /ブラウザレビューではHeatmap projectの保存・開くは利用できません/,
      );
      expect(bridgeNote).toBeNull();
      expect(window.location.pathname).toBe("/heatmap");
      expect(standardOpen).not.toHaveBeenCalled();
      expect(standardSave).not.toHaveBeenCalled();
    },
  );

  it.each(unresolvedBridgeCases)(
    "gates direct /heatmap with paired persistence for $bridgeCase bridges",
    async ({ hasUnresolvedSave, hasUnresolvedOpen }) => {
      window.history.replaceState({}, "", "/heatmap");
      const unresolvedOpen = vi.fn(async () => null);
      const unresolvedSave = vi.fn(async () => null);
      render(
        <App
          projectActions={{
            openProject: async () => null,
            saveProject: async () => null,
            ...(hasUnresolvedOpen ? { openUnresolvedVisualizationProject: unresolvedOpen } : {}),
            ...(hasUnresolvedSave ? { saveUnresolvedVisualizationProject: unresolvedSave } : {}),
          }}
        />,
      );

      if (!hasUnresolvedSave || !hasUnresolvedOpen) {
        expect(screen.getByRole("heading", { name: "Heatmapを開始できません" })).toBeVisible();
        expect(screen.getByRole("alert")).toHaveTextContent(
          "行列とGraphを保存・再開する接続がそろっていません",
        );
        expect(screen.queryByLabelText("Matrix data")).toBeNull();
        expect(unresolvedSave).not.toHaveBeenCalled();
        expect(unresolvedOpen).not.toHaveBeenCalled();
        return;
      }

      expect(screen.getByRole("heading", { name: "ヒートマップ" })).toBeVisible();
      fireEvent.change(screen.getByLabelText("Matrix data"), {
        target: {
          value: "Feature\tSample A\tSample B\nProtein A\t1\t2\nProtein B\t3\t5",
        },
      });
      fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
      await waitFor(() => expect(unresolvedSave).toHaveBeenCalledOnce());
      fireEvent.click(screen.getByRole("button", { name: "保存済みHeatmap projectを開く" }));
      await waitFor(() => expect(unresolvedOpen).toHaveBeenCalledOnce());
    },
  );

  it.each(unresolvedBridgeCases)(
    "gates the compatibility Heatmap path with paired persistence for $bridgeCase bridges",
    ({ hasUnresolvedSave, hasUnresolvedOpen }) => {
      const unresolvedOpen = vi.fn(async () => null);
      const unresolvedSave = vi.fn(async () => null);
      render(
        <App
          projectActions={{
            openProject: async () => null,
            saveProject: async () => null,
            ...(hasUnresolvedOpen ? { openUnresolvedVisualizationProject: unresolvedOpen } : {}),
            ...(hasUnresolvedSave ? { saveUnresolvedVisualizationProject: unresolvedSave } : {}),
          }}
        />,
      );

      fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
      fireEvent.click(screen.getByText("既存の解析用データを直接入力する"));
      fireEvent.click(screen.getByRole("button", { name: /ヒートマップ/ }));

      expect(window.location.pathname).toBe("/heatmap");
      if (!hasUnresolvedSave || !hasUnresolvedOpen) {
        expect(screen.getByRole("heading", { name: "Heatmapを開始できません" })).toBeVisible();
        expect(screen.queryByLabelText("Matrix data")).toBeNull();
        expect(unresolvedSave).not.toHaveBeenCalled();
        expect(unresolvedOpen).not.toHaveBeenCalled();
        return;
      }

      expect(screen.getByRole("heading", { name: "ヒートマップ" })).toBeVisible();
      expect(screen.getByLabelText("Matrix data")).toBeVisible();
      expect(screen.getByRole("button", { name: "保存済みHeatmap projectを開く" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Matrix data"), {
        target: {
          value: "Feature\tSample A\tSample B\nProtein A\t1\t2\nProtein B\t3\t5",
        },
      });
      expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled();
    },
  );

  it("allows a clearly labeled no-persistence Heatmap only in browser preview", () => {
    window.history.replaceState({}, "", "/heatmap");
    render(<App />);

    expect(screen.getByRole("heading", { name: "ヒートマップ" })).toBeVisible();
    expect(screen.getByLabelText("Matrix data")).toBeVisible();
    const saveButton = screen.getByRole("button", { name: "プロジェクトを保存" });
    const openButton = screen.getByRole("button", { name: "保存済みHeatmap projectを開く" });
    expect(saveButton).toBeDisabled();
    expect(openButton).toBeDisabled();
    const unavailableNote = screen.getByText(
      /ブラウザレビューではHeatmap projectの保存・開くは利用できません/,
    );
    expect(unavailableNote).toBeVisible();
    expect(saveButton).toHaveAttribute("aria-describedby", unavailableNote.id);
    expect(openButton).toHaveAttribute("aria-describedby", unavailableNote.id);
  });

  it.each([
    {
      button: "生存時間（Kaplan–Meier）を開く",
      path: "/survival",
      heading: "生存時間",
      dataLabel: "Survival data",
      header: "Unit ID\tGroup\tFollow-up time\tStatus",
    },
    {
      button: "酵素反応・飽和カーブを開く",
      path: "/nonlinear-fit",
      heading: "酵素反応・飽和カーブ",
      dataLabel: "非線形XYフィッティング data",
      header: "Unit ID\tSeries\tX\tY",
    },
    {
      button: "ヒートマップを開く",
      path: "/heatmap",
      heading: "ヒートマップ",
      dataLabel: "Matrix data",
      header: "",
    },
  ])("reloads $button as the same empty safe entry instead of a legacy demo", (example) => {
    window.history.replaceState({}, "", "/?adaptiveInput=1");
    const firstView = render(<App />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: example.button }));

    expect(window.location.pathname).toBe(example.path);
    expect(screen.getByRole("heading", { name: example.heading })).toHaveFocus();
    expect(screen.getByLabelText(example.dataLabel)).toHaveValue(example.header);

    firstView.unmount();
    render(<App />);

    expect(screen.getByRole("heading", { name: example.heading })).toBeVisible();
    expect(screen.getByLabelText(example.dataLabel)).toHaveValue(example.header);
    expect(screen.queryByRole("combobox", { name: "専門解析を切り替える" })).toBeNull();
  });

  it("専門解析を切り替えたときに別familyの入力状態を持ち越さない", () => {
    render(<App />);

    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByText("既存の解析用データを直接入力する"));
    fireEvent.click(screen.getByRole("button", { name: /単回帰/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "X label" }), {
      target: { value: "前の解析のX" },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "専門解析を切り替える" }), {
      target: { value: "nonlinear-fit" },
    });

    expect(screen.getByRole("heading", { name: "酵素反応・飽和カーブ" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "X label" })).toHaveValue("X");
    expect(screen.queryByDisplayValue("前の解析のX")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "専門解析を切り替える" }), {
      target: { value: "regression" },
    });

    expect(screen.getByRole("heading", { name: "Simple linear regression" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "X label" })).toHaveValue("前の解析のX");
  });

  it("専門解析を往復してもrouteごとの入力表と表示設定を失わない", () => {
    window.history.replaceState({}, "", "/survival");
    render(<App />);

    const survivalText =
      "Unit ID\tGroup\tFollow-up time\tStatus\nmouse-audit\tControl\t12\tCensored";
    fireEvent.change(screen.getByRole("textbox", { name: "Survival data" }), {
      target: { value: survivalText },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "専門解析を切り替える" }), {
      target: { value: "heatmap" },
    });

    const heatmapText = "Feature\tSample audit\nProtein audit\t7";
    fireEvent.change(screen.getByRole("textbox", { name: "Matrix data" }), {
      target: { value: heatmapText },
    });
    fireEvent.change(screen.getByLabelText("Heatmap transform"), {
      target: { value: "row_z_score" },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "専門解析を切り替える" }), {
      target: { value: "survival" },
    });
    expect(screen.getByRole("textbox", { name: "Survival data" })).toHaveValue(survivalText);

    fireEvent.change(screen.getByRole("combobox", { name: "専門解析を切り替える" }), {
      target: { value: "heatmap" },
    });
    expect(screen.getByRole("textbox", { name: "Matrix data" })).toHaveValue(heatmapText);
    expect(screen.getByLabelText("Heatmap transform")).toHaveValue("row_z_score");
    expect(screen.getByText(/入力途中の内容は解析ごとに一時保持/)).toBeVisible();
  });

  it("専門解析から入口へ戻って同じ解析を開き直しても入力を失わない", () => {
    window.history.replaceState({}, "", "/regression");
    render(<App />);

    const input = "Unit ID\tX\tY\naudit-1\t1\t3\naudit-2\t2\t6";
    fireEvent.change(screen.getByRole("textbox", { name: "Simple linear regression data" }), {
      target: { value: input },
    });
    fireEvent.click(screen.getByRole("button", { name: "← 戻る" }));
    expect(screen.getByRole("heading", { name: "何をした実験ですか？" })).toBeVisible();

    window.history.pushState({}, "", "/regression");
    fireEvent.popState(window);
    expect(screen.getByRole("textbox", { name: "Simple linear regression data" })).toHaveValue(
      input,
    );
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
    vi.spyOn(window, "confirm").mockReturnValue(true);
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

  it("未保存workspaceからのtop navigationは破棄確認なしに状態を失わない", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: /^Simple 3群（連続値）/ }));
    await screen.findByRole("heading", { name: "合成デモ：Simple 3群（連続値）" });

    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));
    expect(confirm).toHaveBeenCalledWith(
      "未保存の変更があります。現在の実験を閉じて破棄しますか？",
    );
    expect(screen.getByRole("heading", { name: "合成デモ：Simple 3群（連続値）" })).toBeVisible();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));
    expect(await screen.findByRole("heading", { name: /どの実験を整理しますか？/ })).toBeVisible();
  });

  it("確認済みの新しい実験操作は同じroute上のworkspaceもfresh startへ戻す", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: /^Simple 3群（連続値）/ }));
    await screen.findByRole("heading", { name: "合成デモ：Simple 3群（連続値）" });

    fireEvent.click(screen.getByRole("button", { name: /新しい実験/ }));
    expect(await screen.findByRole("heading", { name: "何をした実験ですか？" })).toBeVisible();
  });

  it("returns to Home with the visible back action", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /最近のプロジェクト/ }));
    expect(screen.getByRole("heading", { name: "最近のプロジェクト" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /ワークスペースに戻る/ }));
    expect(screen.getByRole("heading", { name: /どの実験を整理しますか？/ })).toBeVisible();
  });
});
