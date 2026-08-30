import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import App, { projectIoStage } from "./App";
import { createExperimentSetDraft } from "./app/experimentDraft";
import { createExperimentWorkspaceProject } from "./app/experimentWorkspaceProject";
import { saveFavoriteDesign } from "./app/favoriteDesigns";
import type { ProjectActions } from "./app/projectActions";
import {
  createSpecializedEntryDraftProjectState,
  createUnresolvedVisualizationProjectState,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";
import { rememberRecentProject } from "./app/recentProjects";
import { setUsageConsent } from "./app/usageTelemetry";
import { ProjectIoError } from "./app/desktopProjectPackage";

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

const specializedBridgeCases = [
  { bridgeCase: "none", hasSpecializedSave: false, hasGenericOpen: false },
  { bridgeCase: "save-only", hasSpecializedSave: true, hasGenericOpen: false },
  { bridgeCase: "open-only", hasSpecializedSave: false, hasGenericOpen: true },
  { bridgeCase: "both", hasSpecializedSave: true, hasGenericOpen: true },
] as const;

describe("project save diagnostics", () => {
  it("extracts a privacy-safe save stage without requiring technical details", () => {
    expect(projectIoStage(new ProjectIoError("container_write", "disk detail"))).toBe(
      "container_write",
    );
    expect(
      projectIoStage(
        new Error("PROJECT_IO_STAGE[container_commit]: Could not replace the project atomically"),
      ),
    ).toBe("container_commit");
    expect(projectIoStage(new Error("unclassified"))).toBeNull();
    expect(
      projectIoStage(new Error("PROJECT_IO_STAGE[Secret Study]: raw value 12.345")),
    ).toBeNull();
  });
});

describe("workspace home", () => {
  beforeEach(() => {
    localStorage.clear();
    // Most App tests exercise the product after the one-time privacy choice.
    // The consent dialog itself is covered by UsageTelemetryController tests.
    setUsageConsent("opted_out");
    window.history.replaceState({}, "", "/");
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("新しいrouteとfresh-startを確認dialogなしで画面先頭から開く", async () => {
    render(<App />);
    const scrollTo = vi.mocked(window.scrollTo);
    scrollTo.mockClear();

    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });

    fireEvent.click(screen.getByRole("button", { name: /^Simple 3群（連続値）/ }));
    await screen.findByRole("heading", { name: "合成デモ：Simple 3群（連続値）" });
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /新しい実験/ }));
    await screen.findByRole("heading", { name: "何をした実験ですか？" });
    expect(screen.queryAllByRole("button", { name: "変更を破棄して続ける" })).toHaveLength(0);
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

  it("opens the task-oriented hub by default in a production build without an override", () => {
    vi.stubEnv("PROD", true);
    render(<App />);

    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);

    expect(screen.getByRole("heading", { name: "何から始めますか？" })).toBeVisible();
    expect(document.querySelectorAll("[data-entry-id]")).toHaveLength(6);
    expect(screen.queryByRole("heading", { name: "何をした実験ですか？" })).toBeNull();
  });

  it.each([
    { path: "/nonlinear-fit", heading: "濃度–反応・酵素反応" },
    { path: "/survival", heading: "生存時間" },
  ])(
    "leaves an untouched $path entry without an unsaved-work prompt",
    async ({ path, heading }) => {
      window.history.replaceState({}, "", path);
      render(<App />);

      await screen.findByRole("heading", { name: heading });
      fireEvent.click(screen.getByRole("button", { name: "← 戻る" }));

      expect(screen.queryByRole("dialog", { name: "この実験を保存しますか？" })).toBeNull();
      expect(window.location.pathname).toBe("/new-experiment");
      expect(
        screen.getByRole("heading", {
          name: /何から始めますか？|何をした実験ですか？/,
        }),
      ).toBeVisible();
    },
  );

  it.each(unresolvedBridgeCases)(
    "keeps Graph-only and Heatmap fail-closed with $bridgeCase unresolved bridges",
    async ({ hasUnresolvedSave, hasUnresolvedOpen }) => {
      window.history.replaceState({}, "", "/?adaptiveInput=1");
      const standardOpen = vi.fn(async () => null);
      const standardSave = vi.fn(async () => null);
      const unresolvedOpen = vi.fn(async () => null);
      const unresolvedSave = vi.fn(async (state: UnresolvedVisualizationProjectState) => ({
        state,
        target: "/tmp/unresolved-visualization.lsa",
      }));
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
        expect(screen.getByText(/Graph用の表を保存して再開できない/)).toBeVisible();
        expect(screen.getByText(/行列とGraphを保存して再開できない/)).toBeVisible();
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
      fireEvent.paste(screen.getByTestId("graph-only-cell-0-0"), {
        clipboardData: { getData: () => "X\tY\n0\t1\n1\t2" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
        target: { value: "0" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
        target: { value: "1" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Graphを作成" }));

      const graphOnlySave = screen.getByRole("button", {
        name: "このGraph用データを保存",
      });
      expect(graphOnlySave).toBeEnabled();
      fireEvent.click(graphOnlySave);
      await waitFor(() => expect(unresolvedSave).toHaveBeenCalledOnce());
      await screen.findByText(/Graph用データを保存しました/);
      fireEvent.click(screen.getByRole("button", { name: "データ" }));
      const graphOnlyOpen = screen.queryByRole("button", {
        name: "保存したGraph用データを開く",
      });
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

  it.each(specializedBridgeCases)(
    "gates Survival and ordered-curve hub entries with $bridgeCase specialized persistence",
    ({ hasSpecializedSave, hasGenericOpen }) => {
      window.history.replaceState({}, "", "/?adaptiveInput=1");
      const projectActions: ProjectActions = {
        openProject: async () => null,
        ...(hasGenericOpen ? { openAnyProject: async () => null } : {}),
        ...(hasSpecializedSave
          ? {
              saveSpecializedEntryDraftProject: async (state) => ({
                state,
                target: "C:/tmp/specialized-entry-draft.lsa",
              }),
            }
          : {}),
      };
      render(<App projectActions={projectActions} />);

      fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
      const survivalEntry = screen.getByRole("button", {
        name: "生存時間（Kaplan–Meier）を開く",
      });
      const orderedEntry = screen.getByRole("button", {
        name: "濃度–反応・酵素反応を開く",
      });
      const available = hasSpecializedSave && hasGenericOpen;

      if (!available) {
        expect(survivalEntry).toBeDisabled();
        expect(orderedEntry).toBeDisabled();
        expect(screen.getByText(/生存時間データを保存して再開できない/)).toBeVisible();
        expect(screen.getByText(/濃度–反応・酵素反応データを保存して再開できない/)).toBeVisible();
        fireEvent.click(survivalEntry);
        fireEvent.click(orderedEntry);
        expect(window.location.pathname).toBe("/new-experiment");
        return;
      }

      expect(survivalEntry).toBeEnabled();
      expect(orderedEntry).toBeEnabled();
      fireEvent.click(survivalEntry);
      expect(window.location.pathname).toBe("/survival");
      expect(screen.getByRole("heading", { name: "生存時間" })).toBeVisible();
    },
  );

  it.each(
    specializedBridgeCases.flatMap((bridge) => [
      { ...bridge, path: "/survival", entryLabel: "生存時間", pageHeading: "生存時間" },
      {
        ...bridge,
        path: "/nonlinear-fit",
        entryLabel: "濃度–反応・酵素反応",
        pageHeading: "濃度–反応・酵素反応",
      },
    ]),
  )(
    "gates direct $path with $bridgeCase specialized persistence",
    ({ hasSpecializedSave, hasGenericOpen, path, entryLabel, pageHeading }) => {
      window.history.replaceState({}, "", `${path}?adaptiveInput=1`);
      const projectActions: ProjectActions = {
        openProject: async () => null,
        ...(hasGenericOpen ? { openAnyProject: async () => null } : {}),
        ...(hasSpecializedSave
          ? {
              saveSpecializedEntryDraftProject: async (state) => ({
                state,
                target: "C:/tmp/specialized-entry-draft.lsa",
              }),
            }
          : {}),
      };
      render(<App projectActions={projectActions} />);

      if (!hasSpecializedSave || !hasGenericOpen) {
        expect(
          screen.getByRole("heading", { name: `${entryLabel}を開始できません` }),
        ).toBeVisible();
        expect(screen.getByRole("alert")).toHaveTextContent(
          "入力途中の専用データを保存・再開する接続がそろっていません",
        );
        expect(screen.queryByRole("textbox")).toBeNull();
        return;
      }

      expect(screen.getByRole("heading", { name: pageHeading })).toBeVisible();
      expect(screen.queryByText(/開始できません/)).toBeNull();
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
      expect(screen.getByRole("dialog", { name: "この実験を保存しますか？" })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "変更を破棄して続ける" }));
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
      expect(screen.getByRole("region", { name: "ヒートマップデータ表" })).toBeVisible();
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
    expect(screen.getByRole("region", { name: "ヒートマップデータ表" })).toBeVisible();
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

  it("protects a dirty Heatmap before generic project open and restores the opened matrix", async () => {
    window.history.replaceState({}, "", "/?adaptiveInput=1");
    const openedState = createUnresolvedVisualizationProjectState({
      metadata: {
        projectId: "project.heatmap.lifecycle-open",
        projectName: "開き直す行列",
        experimentDate: "",
        createdAt: "2026-08-28T00:00:00.000Z",
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
      entryIntent: "matrix_visualization",
      table: {
        id: "table.heatmap.lifecycle-open",
        headers: ["Feature", "Sample 1", "Sample 2"],
        rows: [["Protein A", "7", "8"]],
        delimiter: "tab",
        headerRow: 1,
      },
      rawLineage: {
        sourceKind: "tsv",
        sourceLabel: "lifecycle.tsv",
        importedAt: "2026-08-28T00:00:00.000Z",
        rawText: "Feature\tSample 1\tSample 2\nProtein A\t7\t8",
        sha256: null,
        transformations: ["delimiter_detection"],
      },
      mapping: {
        schemaVersion: "0.1.0",
        sourceLabel: "lifecycle.tsv",
        delimiter: "tab",
        headerRow: 1,
        columns: [
          { index: 0, header: "Feature", role: "metadata" },
          { index: 1, header: "Sample 1", role: "metadata" },
          { index: 2, header: "Sample 2", role: "metadata" },
        ],
        identityDecision: "unanswered",
        confirmedAt: "2026-08-28T00:00:00.000Z",
      },
      actor: "researcher",
    });
    const openAnyProject = vi.fn(async () => ({
      kind: "unresolved_visualization" as const,
      project: { state: openedState, target: "C:/tmp/lifecycle-open.lsa" },
    }));
    const unresolvedOpen = vi.fn(async () => null);
    const unresolvedSave = vi.fn(async (state: UnresolvedVisualizationProjectState) => ({
      state,
      target: "C:/tmp/lifecycle-save.lsa",
    }));
    render(
      <App
        projectActions={{
          openProject: async () => null,
          saveProject: async () => null,
          openAnyProject,
          openUnresolvedVisualizationProject: unresolvedOpen,
          saveUnresolvedVisualizationProject: unresolvedSave,
        }}
      />,
    );

    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: "ヒートマップを開く" }));
    fireEvent.change(screen.getByLabelText("Matrix data"), {
      target: { value: "Feature\tSample A\tSample B\nProtein A\t1\t2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "開く" }));

    expect(screen.getByRole("dialog", { name: "この実験を保存しますか？" })).toBeVisible();
    expect(openAnyProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "変更を破棄して続ける" }));

    await waitFor(() => expect(openAnyProject).toHaveBeenCalledOnce());
    expect(await screen.findByLabelText("Matrix data")).toHaveValue(
      "Feature\tSample 1\tSample 2\nProtein A\t7\t8",
    );
    expect(screen.queryByRole("dialog", { name: "この実験を保存しますか？" })).toBeNull();
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
      button: "濃度–反応・酵素反応を開く",
      path: "/nonlinear-fit",
      heading: "濃度–反応・酵素反応",
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

  it.each([
    ["/survival", "生存時間"],
    ["/nonlinear-fit", "濃度–反応・酵素反応"],
    ["/heatmap", "ヒートマップ"],
  ] as const)(
    "opens a direct %s visit as the safe dedicated entry when experiment-first is enabled",
    (path, heading) => {
      localStorage.setItem("experiment_first_adaptive_input_alpha", "enabled");
      window.history.replaceState({}, "", path);

      render(<App />);

      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
      expect(screen.queryByRole("combobox", { name: "専門解析を切り替える" })).toBeNull();
    },
  );

  it.each([
    ["生存時間（Kaplan–Meier）を開く", "生存時間"],
    ["濃度–反応・酵素反応を開く", "濃度–反応・酵素反応"],
  ] as const)(
    "disables workspace Open in browser preview for %s instead of invoking a failing bridge",
    (entry, heading) => {
      localStorage.setItem("experiment_first_adaptive_input_alpha", "enabled");
      render(<App />);
      fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
      fireEvent.click(screen.getByRole("button", { name: entry }));

      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
      const open = screen.getByRole("button", { name: "開く" });
      expect(open).toBeDisabled();
      expect(open).toHaveAttribute("title", "プロジェクトを開く機能はデスクトップ版で利用できます");
    },
  );

  it("keeps the explicit adaptiveInput=0 rollback while navigating", () => {
    window.history.replaceState({}, "", "/?adaptiveInput=0");
    render(<App />);

    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);

    expect(window.location.search).toBe("?adaptiveInput=0");
    expect(screen.getByText("互換モード（以前の入力方式）")).toBeVisible();
    expect(screen.getByText(/通常の入口とは異なり、実験分野から選びます/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "何をした実験ですか？" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "何から始めますか？" })).toBeNull();
  });

  it.each(["/contingency", "/repeated-nonparametric", "/regression", "/distribution"])(
    "stops anonymous legacy analysis entry at %s in the normal experiment-first mode",
    (path) => {
      window.history.replaceState({}, "", `${path}?adaptiveInput=1`);
      render(<App projectActions={desktopTestActions} />);

      expect(
        screen.getByRole("heading", { name: "この入口は通常モードでは利用できません" }),
      ).toBeVisible();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "実験構造を確認せず解析形式だけを選ぶ以前の入口",
      );
    },
  );

  it("labels a legacy direct analysis page when explicit compatibility mode is active", () => {
    window.history.replaceState({}, "", "/regression");
    render(<App projectActions={desktopTestActions} />);

    expect(screen.getByRole("status", { name: "互換モード" })).toHaveTextContent(
      "互換モード（以前の入力方式）",
    );
    expect(screen.getByRole("heading", { name: "Simple linear regression" })).toBeVisible();
  });

  it("専門解析を切り替えたときに別familyの入力状態を持ち越さない", () => {
    render(<App developmentAnalysisRouteSwitcher />);

    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByText("既存の解析用データを直接入力する"));
    fireEvent.click(screen.getByRole("button", { name: /単回帰/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "X label" }), {
      target: { value: "前の解析のX" },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "専門解析を切り替える" }), {
      target: { value: "nonlinear-fit" },
    });
    expect(window.location.pathname).toBe("/regression");
    expect(screen.getByRole("dialog", { name: "この実験を保存しますか？" })).toBeVisible();
    expect(screen.getByText(/別の専門解析へ切り替える/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "変更を破棄して続ける" }));

    expect(screen.getByRole("heading", { name: "濃度–反応・酵素反応" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "X label" })).toHaveValue("X");
    expect(screen.queryByDisplayValue("前の解析のX")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "専門解析を切り替える" }), {
      target: { value: "regression" },
    });

    expect(screen.getByRole("heading", { name: "Simple linear regression" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "X label" })).toHaveValue("前の解析のX");
  });

  it("専門解析を往復してもrouteごとの入力表と表示設定を失わない", async () => {
    window.history.replaceState({}, "", "/survival");
    render(<App developmentAnalysisRouteSwitcher />);

    const survivalText =
      "Unit ID\tGroup\tFollow-up time\tStatus\nmouse-audit\tControl\t12\tCensored";
    fireEvent.change(screen.getByRole("textbox", { name: "Survival data" }), {
      target: { value: survivalText },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "専門解析を切り替える" }), {
      target: { value: "heatmap" },
    });
    fireEvent.click(screen.getByRole("button", { name: "変更を破棄して続ける" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

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
    const discardHeatmap = screen.queryByRole("button", {
      name: "変更を破棄して続ける",
    });
    if (discardHeatmap) fireEvent.click(discardHeatmap);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("textbox", { name: "Survival data" })).toHaveValue(survivalText);

    fireEvent.change(screen.getByRole("combobox", { name: "専門解析を切り替える" }), {
      target: { value: "heatmap" },
    });
    const discardRestoredSurvival = screen.queryByRole("button", {
      name: "変更を破棄して続ける",
    });
    if (discardRestoredSurvival) fireEvent.click(discardRestoredSurvival);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("textbox", { name: "Matrix data" })).toHaveValue(heatmapText);
    expect(screen.getByLabelText("Heatmap transform")).toHaveValue("row_z_score");
    expect(screen.getByText(/入力途中の内容は解析ごとに一時保持/)).toBeVisible();
  });

  it.each(["/regression", "/survival"])(
    "通常のproduction workspaceでは%sから統計designを直接切り替えられない",
    (path) => {
      window.history.replaceState({}, "", path);
      render(<App projectActions={desktopTestActions} />);

      expect(screen.queryByRole("combobox", { name: "専門解析を切り替える" })).toBeNull();
    },
  );

  it("専門解析から入口へ戻って同じ解析を開き直しても入力を失わない", () => {
    window.history.replaceState({}, "", "/regression");
    render(<App />);

    const input = "Unit ID\tX\tY\naudit-1\t1\t3\naudit-2\t2\t6";
    fireEvent.change(screen.getByRole("textbox", { name: "Simple linear regression data" }), {
      target: { value: input },
    });
    fireEvent.click(screen.getByRole("button", { name: "← 戻る" }));
    expect(screen.getByRole("dialog", { name: "この実験を保存しますか？" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "変更を破棄して続ける" }));
    expect(screen.getByRole("heading", { name: "何をした実験ですか？" })).toBeVisible();

    window.history.pushState({}, "", "/regression");
    fireEvent.popState(window);
    expect(screen.getByRole("textbox", { name: "Simple linear regression data" })).not.toHaveValue(
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

  it("keeps multiple saved projects in one window and reopens the selected tab", async () => {
    const makeProject = (name: string, target: string) => {
      const base = createExperimentSetDraft("cell_culture", "proportion");
      const draft = {
        ...base,
        name,
        conditions: base.conditions.slice(0, 2).map((condition, index) => ({
          ...condition,
          label: index === 0 ? `${name} Control` : `${name} Treatment`,
          attributes: {
            "attribute.1": index === 0 ? `${name} Control` : `${name} Treatment`,
          },
        })),
      };
      return {
        state: createExperimentWorkspaceProject({
          draft,
          cells: {},
          graphs: [],
          now: "2026-08-30T00:00:00.000Z",
        }),
        target,
      };
    };
    const first = makeProject("Drug response", "/tmp/drug-response.lsa");
    const second = makeProject("Survival pilot", "/tmp/survival-pilot.lsa");
    const picker = vi
      .fn()
      .mockResolvedValueOnce({ kind: "experiment" as const, project: first })
      .mockResolvedValueOnce({ kind: "experiment" as const, project: second });
    const openTarget = vi.fn(async (target: string) => ({
      kind: "experiment" as const,
      project: target === first.target ? first : second,
    }));
    render(
      <App
        projectActions={{
          openProject: async () => null,
          openAnyProject: picker,
          openAnyProjectTarget: openTarget,
          saveProject: async () => null,
        }}
      />,
    );

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await waitFor(() => expect(picker).toHaveBeenCalledOnce());
    expect(await screen.findByRole("tab", { name: "Drug response" })).toBeVisible();
    expect(await screen.findByText("Drug response Control")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "＋ 開く" }));
    await waitFor(() => expect(picker).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("tab", { name: "Survival pilot" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Drug response" })).toBeVisible();
    expect(await screen.findByText("Survival pilot Control")).toBeVisible();
    expect(screen.queryByText("Drug response Control")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Drug response" }));
    await waitFor(() => expect(openTarget).toHaveBeenCalledWith(first.target));
    expect(screen.getByRole("tab", { name: "Drug response" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("reopens the same project immediately after its tab is closed", async () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const draft = {
      ...base,
      name: "Immediate reopen",
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
        now: "2026-08-30T00:00:00.000Z",
      }),
      target: "/tmp/immediate-reopen.lsa",
    };
    const picker = vi.fn(async () => ({ kind: "experiment" as const, project }));
    render(
      <App
        projectActions={{
          openProject: async () => null,
          openAnyProject: picker,
          saveProject: async () => null,
        }}
      />,
    );

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await screen.findByRole("tab", { name: "Immediate reopen" });
    fireEvent.click(screen.getByRole("button", { name: "Immediate reopenを閉じる" }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Immediate reopen" })).toBeNull());

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await waitFor(() => expect(picker).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("tab", { name: "Immediate reopen" })).toBeVisible();
  });

  it("clears discarded dirty state before immediately opening another project", async () => {
    const makeProject = (name: string, target: string) => {
      const base = createExperimentSetDraft("cell_culture", "proportion");
      const draft = {
        ...base,
        name,
        conditions: base.conditions.slice(0, 2).map((condition, index) => ({
          ...condition,
          label: index === 0 ? "Control" : "Treatment",
          attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
        })),
      };
      return {
        state: createExperimentWorkspaceProject({
          draft,
          cells: {},
          graphs: [],
          now: "2026-08-30T00:00:00.000Z",
        }),
        target,
      };
    };
    const first = makeProject("Discard then open", "/tmp/discard-then-open.lsa");
    const second = makeProject("Opened after discard", "/tmp/opened-after-discard.lsa");
    const picker = vi
      .fn()
      .mockResolvedValueOnce({ kind: "experiment" as const, project: first })
      .mockResolvedValueOnce({ kind: "experiment" as const, project: second });
    render(
      <App
        projectActions={{
          openProject: async () => null,
          openAnyProject: picker,
          saveProject: async (state, target) => ({ state, target: target ?? first.target }),
        }}
      />,
    );

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await screen.findByRole("tab", { name: "Discard then open" });
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの陽性数" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの対象数" }), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Discard then openを閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "変更を破棄して続ける" }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Discard then open" })).toBeNull());

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await waitFor(() => expect(picker).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog", { name: "この実験を保存しますか？" })).toBeNull();
    expect(await screen.findByRole("tab", { name: "Opened after discard" })).toBeVisible();
  });

  it("keeps a dirty project checkpoint when Home is opened and restores it without disk reload", async () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const draft = {
      ...base,
      name: "Dirty checkpoint",
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
        now: "2026-08-30T00:00:00.000Z",
      }),
      target: "/tmp/dirty-checkpoint.lsa",
    };
    const picker = vi.fn(async () => ({ kind: "experiment" as const, project }));
    const openTarget = vi.fn(async () => ({ kind: "experiment" as const, project }));
    render(
      <App
        projectActions={{
          openProject: async () => null,
          openAnyProject: picker,
          openAnyProjectTarget: openTarget,
          saveProject: async (state, target) => ({ state, target: target ?? project.target }),
        }}
      />,
    );

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await screen.findByRole("tab", { name: "Dirty checkpoint" });
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    const positive = screen.getByRole("spinbutton", { name: "Controlの陽性数" });
    fireEvent.change(positive, { target: { value: "5" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの対象数" }), {
      target: { value: "10" },
    });

    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));
    expect(screen.queryByRole("dialog", { name: "この実験を保存しますか？" })).toBeNull();
    expect(
      screen.getByRole("tab", { name: /Dirty checkpoint.*未保存の変更あり/ }),
    ).toHaveTextContent("●");

    fireEvent.click(screen.getByRole("tab", { name: /Dirty checkpoint.*未保存の変更あり/ }));
    await screen.findByRole("tab", { name: "Exp 1" });
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    expect(screen.getByRole("spinbutton", { name: "Controlの陽性数" })).toHaveValue(5);
    expect(openTarget).not.toHaveBeenCalled();
  });

  it("activates an already-open canonical target without replacing its dirty in-memory values", async () => {
    const base = createExperimentSetDraft("cell_culture", "proportion");
    const draft = {
      ...base,
      name: "Dirty same-file open",
      conditions: base.conditions.slice(0, 2).map((condition, index) => ({
        ...condition,
        label: index === 0 ? "Control" : "Treatment",
        attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
      })),
    };
    const diskState = createExperimentWorkspaceProject({
      draft,
      cells: {},
      graphs: [],
      now: "2026-08-31T00:00:00.000Z",
    });
    const picker = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "experiment" as const,
        project: { state: diskState, target: "C:\\Research\\same-file.lsa" },
      })
      .mockResolvedValueOnce({
        kind: "experiment" as const,
        project: { state: diskState, target: "c:/research/same-file.lsa" },
      });
    render(
      <App
        projectActions={{
          openProject: async () => null,
          openAnyProject: picker,
          saveProject: async () => null,
        }}
      />,
    );

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await screen.findByRole("tab", { name: "Dirty same-file open" });
    fireEvent.click(screen.getByRole("tab", { name: "Exp 1" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの陽性数" }), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Controlの対象数" }), {
      target: { value: "10" },
    });

    fireEvent.click(screen.getByRole("button", { name: "＋ 開く" }));
    await waitFor(() => expect(picker).toHaveBeenCalledTimes(2));

    expect(screen.queryByRole("dialog", { name: "この実験を保存しますか？" })).toBeNull();
    expect(screen.getByRole("spinbutton", { name: "Controlの陽性数" })).toHaveValue(7);
    expect(screen.getByRole("spinbutton", { name: "Controlの対象数" })).toHaveValue(10);
    expect(screen.getAllByRole("tab", { name: /Dirty same-file open/ })).toHaveLength(1);
  });

  it("keeps the active tab when opening its replacement fails during close", async () => {
    const makeProject = (name: string, target: string) => {
      const base = createExperimentSetDraft("cell_culture", "proportion");
      const draft = {
        ...base,
        name,
        conditions: base.conditions.slice(0, 2).map((condition, index) => ({
          ...condition,
          label: index === 0 ? "Control" : "Treatment",
          attributes: { "attribute.1": index === 0 ? "Control" : "Treatment" },
        })),
      };
      return {
        state: createExperimentWorkspaceProject({
          draft,
          cells: {},
          graphs: [],
          now: "2026-08-30T00:00:00.000Z",
        }),
        target,
      };
    };
    const first = makeProject("First project", "/tmp/first-project.lsa");
    const second = makeProject("Second project", "/tmp/second-project.lsa");
    const picker = vi
      .fn()
      .mockResolvedValueOnce({ kind: "experiment" as const, project: first })
      .mockResolvedValueOnce({ kind: "experiment" as const, project: second });
    const openTarget = vi.fn(async () => {
      throw new Error("Project is temporarily unavailable");
    });
    render(
      <App
        projectActions={{
          openProject: async () => null,
          openAnyProject: picker,
          openAnyProjectTarget: openTarget,
          saveProject: async () => null,
        }}
      />,
    );

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await screen.findByRole("tab", { name: "First project" });
    fireEvent.click(screen.getByRole("button", { name: "＋ 開く" }));
    await screen.findByRole("tab", { name: "Second project" });
    fireEvent.click(screen.getByRole("button", { name: "Second projectを閉じる" }));

    await waitFor(() => expect(openTarget).toHaveBeenCalledWith(first.target));
    expect(await screen.findByText("Project is temporarily unavailable")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Second project" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "First project" })).toBeVisible();
  });

  it("opens one common .lsa result and routes a Graph-only project to its editor", async () => {
    const state = createUnresolvedVisualizationProjectState({
      metadata: {
        projectId: "project.graph-only.open-test",
        projectName: "開き直すGraph",
        experimentDate: "",
        createdAt: "2026-08-28T00:00:00.000Z",
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
      entryIntent: "graph_only",
      table: {
        id: "table.graph-only.open-test",
        headers: ["Condition", "Value"],
        rows: [
          ["Control", "1.2"],
          ["Treatment", "2.4"],
        ],
        delimiter: "tab",
        headerRow: 1,
      },
      rawLineage: {
        sourceKind: "clipboard",
        sourceLabel: "clipboard paste",
        importedAt: "2026-08-28T00:00:00.000Z",
        rawText: "Condition\tValue\r\nControl\t1.2\r\nTreatment\t2.4",
        sha256: null,
        transformations: ["delimiter_detection"],
      },
      mapping: {
        schemaVersion: "0.1.0",
        sourceLabel: "clipboard paste",
        delimiter: "tab",
        headerRow: 1,
        columns: [
          { index: 0, header: "Condition", role: "x" },
          { index: 1, header: "Value", role: "y" },
        ],
        identityDecision: "no_id",
        confirmedAt: "2026-08-28T00:00:00.000Z",
      },
      actor: "researcher",
    });
    const openAnyProject = vi.fn(async () => ({
      kind: "unresolved_visualization" as const,
      project: { state, target: "/tmp/graph-only-open-test.lsa" },
    }));
    render(
      <App
        projectActions={{
          openProject: async () => null,
          openAnyProject,
          saveProject: async () => null,
        }}
      />,
    );

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await waitFor(() => expect(openAnyProject).toHaveBeenCalledOnce());
    expect(await screen.findByRole("heading", { name: "手元の表からGraphを作る" })).toBeVisible();
    expect(screen.getByTestId("graph-only-cell-0-0")).toHaveValue("Condition");
    expect(screen.getByTestId("graph-only-cell-0-1")).toHaveValue("Value");
    expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("Control");
    expect(screen.getByTestId("graph-only-cell-1-1")).toHaveValue("1.2");
    expect(screen.getByTestId("graph-only-cell-2-0")).toHaveValue("Treatment");
    expect(screen.getByTestId("graph-only-cell-2-1")).toHaveValue("2.4");
    expect(screen.getByRole("combobox", { name: "Graphの横軸" })).toHaveValue("0");
    expect(screen.getByRole("combobox", { name: "Graphの測定値" })).toHaveValue("1");
  });

  it.each([
    {
      route: "survival" as const,
      moduleId: "time_to_event" as const,
      experimentName: "Reopened survival draft",
      rawText:
        "Unit ID\tGroup\tFollow-up time\tStatus\nmouse-1\tControl\t4\tEvent\nmouse-2\tDrug\t\tCensored",
      answers: {
        kind: "survival" as const,
        subjectUnitRelationship: "unknown" as const,
        followUpUnit: "days",
        numericStatusMapping: null,
        statisticsSetupExpanded: false,
        showLogRankAnnotation: false,
      },
      textboxName: "Survival data",
    },
    {
      route: "nonlinear-fit" as const,
      moduleId: "ordered_curve_kinetics" as const,
      experimentName: "Reopened ordered draft",
      rawText: "Unit ID\tSeries\tX\tY\nrun-1\tA\t0\t0\nrun-1\tA\t5\t1",
      answers: {
        kind: "ordered_curve" as const,
        facts: { orderedAxisCount: 2 },
        xLabel: "Time",
        yLabel: "Response",
        xUnit: "min",
        yUnit: "a.u.",
        nonlinearModel: "one_phase_association" as const,
        nonlinearModelExplicitlySelected: true,
        modelRationale: "Explicit model",
        fitSettings: {},
      },
      textboxName: "非線形XYフィッティング data",
    },
  ])(
    "routes a $route specialized safe-stop draft back to the same editable route",
    async ({ route, moduleId, experimentName, rawText, answers, textboxName }) => {
      const now = "2026-08-28T11:00:00.000Z";
      const state = createSpecializedEntryDraftProjectState({
        metadata: {
          projectId: `project.${route}.draft-open`,
          projectName: experimentName,
          experimentDate: "",
          createdAt: now,
          updatedAt: now,
        },
        route,
        entryIntent: {
          schemaVersion: "0.1.0",
          moduleId,
          destination: route,
          sourceContext: route === "survival" ? "animal" : "protein_biochemical",
          entryRouteId: moduleId,
          experimentName,
          experimentDescription: "An incomplete dedicated-entry experiment.",
          subjectUnitLabel: route === "survival" ? "Animal" : "Reaction",
          facts:
            route === "survival"
              ? {
                  timeToEventPattern: "single_terminal_event_or_censoring",
                  subjectUnitRelationship: "unknown",
                }
              : { orderedAxisCount: 2 },
        },
        rawTable: {
          schemaVersion: "0.1.0",
          headers:
            route === "survival"
              ? ["Unit ID", "Group", "Follow-up time", "Status"]
              : ["Unit ID", "Series", "X", "Y"],
          rows:
            route === "survival"
              ? [
                  ["mouse-1", "Control", "4", "Event"],
                  ["mouse-2", "Drug", "", "Censored"],
                ]
              : [
                  ["run-1", "A", "0", "0"],
                  ["run-1", "A", "5", "1"],
                ],
          delimiter: "tab",
          headerRow: 1,
        },
        rawLineage: {
          schemaVersion: "0.1.0",
          sourceKind: "clipboard",
          sourceLabel: `${route}-paste`,
          capturedAt: now,
          rawText,
        },
        answers,
        safeStop: {
          status: route === "survival" ? "input_invalid" : "safe_unsupported",
          reasonCodes: [route === "survival" ? "FOLLOW_UP_REQUIRED" : "MULTIPLE_AXES"],
        },
        provenanceEvents: [
          {
            id: "specialized-draft.create.1",
            kind: "specialized_entry_draft_created",
            occurredAt: now,
            actor: "researcher",
          },
        ],
      });
      const openAnyProject = vi.fn(async () => ({
        kind: "specialized_entry_draft" as const,
        project: { state, target: `/tmp/${route}-draft.lsa` },
      }));
      render(
        <App
          projectActions={{
            openProject: async () => null,
            openAnyProject,
            saveProject: async () => null,
            saveSpecializedEntryDraftProject: async (request, target) => ({
              state: request,
              target: target ?? `/tmp/${route}-draft.lsa`,
            }),
          }}
        />,
      );

      fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
      await waitFor(() => expect(openAnyProject).toHaveBeenCalledOnce());
      expect(await screen.findByRole("heading", { name: experimentName })).toBeVisible();
      expect(screen.getByRole("textbox", { name: textboxName })).toHaveValue(rawText);
      expect(window.location.pathname).toBe(`/${route}`);
    },
  );

  it("routes a common matrix visualization .lsa result to Heatmap without coercion", async () => {
    const state = createUnresolvedVisualizationProjectState({
      metadata: {
        projectId: "project.heatmap.open-test",
        projectName: "開き直す行列",
        experimentDate: "",
        createdAt: "2026-08-28T00:00:00.000Z",
        updatedAt: "2026-08-28T00:00:00.000Z",
      },
      entryIntent: "matrix_visualization",
      table: {
        id: "table.heatmap.open-test",
        headers: ["Feature", "Sample 1", "Sample 2"],
        rows: [["Protein A", "1", "2"]],
        delimiter: "tab",
        headerRow: 1,
      },
      rawLineage: {
        sourceKind: "tsv",
        sourceLabel: "matrix.tsv",
        importedAt: "2026-08-28T00:00:00.000Z",
        rawText: "Feature\tSample 1\tSample 2\r\nProtein A\t1\t2",
        sha256: null,
        transformations: ["delimiter_detection"],
      },
      mapping: {
        schemaVersion: "0.1.0",
        sourceLabel: "matrix.tsv",
        delimiter: "tab",
        headerRow: 1,
        columns: [
          { index: 0, header: "Feature", role: "metadata" },
          { index: 1, header: "Sample 1", role: "metadata" },
          { index: 2, header: "Sample 2", role: "metadata" },
        ],
        identityDecision: "unanswered",
        confirmedAt: "2026-08-28T00:00:00.000Z",
      },
      actor: "researcher",
    });
    const openAnyProject = vi.fn(async () => ({
      kind: "unresolved_visualization" as const,
      project: { state, target: "/tmp/heatmap-open-test.lsa" },
    }));
    render(
      <App
        projectActions={{
          openProject: async () => null,
          openAnyProject,
          saveProject: async () => null,
        }}
      />,
    );

    fireEvent.click(document.querySelector('[data-primary-route="open-project"]')!);
    await waitFor(() => expect(openAnyProject).toHaveBeenCalledOnce());
    expect(await screen.findByRole("heading", { name: "ヒートマップ" })).toBeVisible();
    expect(screen.getByLabelText("Matrix data")).toHaveValue(
      "Feature\tSample 1\tSample 2\nProtein A\t1\t2",
    );
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
    fireEvent.click(screen.getByRole("button", { name: "変更を破棄して続ける" }));
    expect(screen.getByRole("heading", { name: "合成デモデータですぐ試す" })).toBeVisible();
  });

  it("合成デモだけのbrowser previewはtop navigationで保存確認を要求しない", async () => {
    render(<App />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: /^Simple 3群（連続値）/ }));
    await screen.findByRole("heading", { name: "合成デモ：Simple 3群（連続値）" });

    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));
    expect(screen.queryByRole("dialog", { name: "この実験を保存しますか？" })).toBeNull();
    expect(await screen.findByRole("heading", { name: /どの実験を整理しますか？/ })).toBeVisible();
  });

  it("確認済みの新しい実験操作は同じroute上のworkspaceもfresh startへ戻す", async () => {
    render(<App />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: /^Simple 3群（連続値）/ }));
    await screen.findByRole("heading", { name: "合成デモ：Simple 3群（連続値）" });

    fireEvent.click(screen.getByRole("button", { name: /新しい実験/ }));
    expect(screen.queryAllByRole("button", { name: "変更を破棄して続ける" })).toHaveLength(0);
    expect(await screen.findByRole("heading", { name: "何をした実験ですか？" })).toBeVisible();
  });

  it("未保存workspaceを保存してから目的の画面へ進める", async () => {
    const saveProject = vi.fn(async (state) => ({ state, target: "/tmp/saved-before-exit.lsa" }));
    render(
      <App
        projectActions={{
          openProject: async () => null,
          saveProject,
        }}
      />,
    );
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: /^Simple 3群（連続値）/ }));
    await screen.findByRole("heading", { name: "合成デモ：Simple 3群（連続値）" });

    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));
    expect(screen.getByRole("button", { name: "保存して続ける" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "保存して続ける" }));

    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: /どの実験を整理しますか？/ })).toBeVisible();
  });

  it("破棄を承認してOpen pickerをキャンセルしても現在のworkspaceを未保存のまま保持する", async () => {
    const openProject = vi.fn(async () => null);
    render(
      <App
        projectActions={{
          openProject,
          saveProject: async () => null,
        }}
      />,
    );
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: /^Simple 3群（連続値）/ }));
    await screen.findByRole("heading", { name: "合成デモ：Simple 3群（連続値）" });

    fireEvent.click(screen.getByText("ファイル"));
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを開く" }));
    expect(screen.getByRole("dialog", { name: "この実験を保存しますか？" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "変更を破棄して続ける" }));
    await waitFor(() => expect(openProject).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("heading", { name: "合成デモ：Simple 3群（連続値）" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /ホーム/ }));
    expect(screen.getByRole("dialog", { name: "この実験を保存しますか？" })).toBeVisible();
  });

  it("returns to Home with the visible back action", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /最近のプロジェクト/ }));
    expect(screen.getByRole("heading", { name: "最近のプロジェクト" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /ワークスペースに戻る/ }));
    expect(screen.getByRole("heading", { name: /どの実験を整理しますか？/ })).toBeVisible();
  });
});
