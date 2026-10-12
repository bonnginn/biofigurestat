import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "./App";
import type { ProjectActions, SaveProjectAction } from "./app/projectActions";
import { setUsageConsent } from "./app/usageTelemetry";
import { createExperimentWorkspaceProject, rehydrateExperimentWorkspace } from "./app/experimentWorkspaceProject";

function pressSave(saveAs = false) {
  fireEvent.keyDown(window, {
    key: "s",
    code: "KeyS",
    ctrlKey: true,
    shiftKey: saveAs,
  });
}

async function createEditableExperiment(
  saveProject: SaveProjectAction,
  extraActions: Partial<ProjectActions> = {},
) {
  window.history.replaceState({}, "", "/?adaptiveInput=1");
  render(<App projectActions={{ openProject: async () => null, saveProject, ...extraActions }} />);
  fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
  fireEvent.click(screen.getByRole("button", { name: "実験から始めるを開く" }));
  fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
    target: { value: "Treatment" },
  });
  for (const [index, value] of ["Control", "Drug"].entries()) {
    fireEvent.change(screen.getByRole("textbox", { name: `行 1 列 ${index + 1}` }), {
      target: { value },
    });
  }
  fireEvent.change(screen.getByPlaceholderText("例：細胞生存率"), { target: { value: "Signal" } });
  fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), {
    target: { value: "culture dish" },
  });
  fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
  fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));
  return await screen.findByRole("textbox", { name: "入力行 1・Control・Signal" });
}

describe("App-level project save commands", () => {
  beforeEach(() => {
    localStorage.clear();
    setUsageConsent("opted_out");
    window.history.replaceState({}, "", "/");
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retains edits made while another project is being read", async () => {
    let finish!: (project: Awaited<ReturnType<ProjectActions["openProject"]>>) => void;
    const openProject = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ProjectActions["openProject"]>>>((resolve) => {
          finish = resolve;
        }),
    );
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "C:/tmp/source-pending-open.lsa",
    }));
    const cell = await createEditableExperiment(saveProject, { openProject });
    fireEvent.change(cell, { target: { value: "10" } });
    fireEvent.blur(cell);
    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("tab")).toHaveAttribute("title", "C:/tmp/source-pending-open.lsa"),
    );
    fireEvent.click(screen.getByRole("button", { name: "＋ 開く" }));
    await waitFor(() => expect(openProject).toHaveBeenCalledTimes(1));
    fireEvent.change(cell, { target: { value: "99" } });
    fireEvent.blur(cell);
    const source = saveProject.mock.calls[0]![0];
    await act(async () =>
      finish({
        state: {
          ...source,
          metadata: {
            ...source.metadata,
            projectId: "project.other-pending-open",
            projectName: "Other project",
          },
        },
        target: "C:/tmp/other-pending-open.lsa",
      }),
    );
    const sourceTab = screen
      .getAllByRole("tab")
      .find((tab) => tab.getAttribute("title") === "C:/tmp/source-pending-open.lsa");
    expect(sourceTab).toBeDefined();
    fireEvent.click(sourceTab!);
    expect(await screen.findByRole("textbox", { name: "入力行 1・Control・Signal" })).toHaveValue(
      "99",
    );
  });

  it("restores distinct files sharing a project ID without mixing their edits", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state, target: "C:/tmp/same-id-source.lsa",
    }));
    const openProject = vi.fn(async () => copy);
    const cell = await createEditableExperiment(saveProject, {
      openProject,
      openProjectTarget: async (target) => ({ state: saveProject.mock.calls[0]![0], target }),
    });
    fireEvent.change(cell, { target: { value: "10" } });
    fireEvent.blur(cell);
    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const source = saveProject.mock.calls[0]![0];
    const workspace = rehydrateExperimentWorkspace(source)!;
    const cells = Object.fromEntries(Object.entries(workspace.cells).map(([key, cell]) => [
      key, cell.kind === "nested_continuous" && cell.rawValues.length
        ? { ...cell, rawValues: [20] } : cell,
    ]));
    const copy = { state: createExperimentWorkspaceProject({
      draft: workspace.draft, cells, graphs: [], existingState: source,
      now: "2026-10-10T00:00:00Z",
    }), target: "C:/tmp/same-id-copy.lsa" };
    expect(copy.state.metadata.projectId).toBe(source.metadata.projectId);
    fireEvent.click(screen.getByRole("button", { name: "＋ 開く" }));
    await waitFor(() => expect(screen.getByRole("textbox", {
      name: "入力行 1・Control・Signal",
    })).toHaveValue("20"));
    const copyCell = screen.getByRole("textbox", { name: "入力行 1・Control・Signal" });
    fireEvent.change(copyCell, { target: { value: "23" } });
    fireEvent.blur(copyCell);
    fireEvent.click(screen.getAllByRole("tab").find(tab =>
      tab.getAttribute("title") === "C:/tmp/same-id-source.lsa")!);
    await waitFor(() => expect(screen.getByRole("textbox", {
      name: "入力行 1・Control・Signal",
    })).toHaveValue("10"));
    expect(screen.getAllByRole("tab").find(tab =>
      tab.getAttribute("title") === "C:/tmp/same-id-copy.lsa")!
      .querySelector('[aria-label="未保存の変更あり"]')).not.toBeNull();
    fireEvent.click(screen.getAllByRole("tab").find(tab =>
      tab.getAttribute("title") === "C:/tmp/same-id-copy.lsa")!);
    await waitFor(() => expect(screen.getByRole("textbox", {
      name: "入力行 1・Control・Signal",
    })).toHaveValue("23"));
  });

  it("returns from design reuse to the retained source tab without losing saved values", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state, target: "C:/tmp/reuse-source.lsa",
    }));
    const openProjectTarget = vi.fn(async (target: string) => ({
      state: saveProject.mock.calls[0]![0], target,
    }));
    const cell = await createEditableExperiment(saveProject, {
      openProjectTarget,
      openProject: async () => ({
        state: saveProject.mock.calls[0]![0], target: "C:/tmp/reuse-source.lsa",
      }),
    });
    fireEvent.change(cell, { target: { value: "10.000" } });
    fireEvent.blur(cell);
    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    await screen.findByText(/プロジェクトを保存しました/);
    fireEvent.click(screen.getByRole("button", { name: "＋ 開く" }));
    await screen.findByRole("button", { name: "設計だけを新しいprojectに再利用", hidden: true });
    fireEvent.click(screen.getByText("実験", { selector: "summary" }));
    fireEvent.click(screen.getByRole("button", { name: "設計だけを新しいprojectに再利用" }));
    await screen.findByRole("heading", { name: "この実験の設計を確認" });
    fireEvent.click(screen.getByRole("tab"));
    await waitFor(() => expect(screen.getByRole("textbox", {
      name: "入力行 1・Control・Signal",
    })).toHaveValue("10.000"));
    expect(screen.queryByRole("heading", { name: "この実験の設計を確認" })).toBeNull();
    expect(saveProject).toHaveBeenCalledTimes(1);
  });

  it("commits the focused canonical cell before shortcut save captures the project", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "C:/tmp/focused-cell.lsa",
    }));
    const cell = await createEditableExperiment(saveProject);
    act(() => cell.focus());
    fireEvent.change(cell, { target: { value: "77" } });
    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    expect(
      saveProject.mock.calls[0]![0].adaptiveInput?.canonicalObservations.map(
        (row) => Object.values(row.values)[0],
      ),
    ).toEqual([77]);
  });

  it("captures focused decimal presentation with the canonical value on shortcut save", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "C:/tmp/decimal-cell.lsa",
    }));
    const cell = await createEditableExperiment(saveProject);
    act(() => cell.focus());
    fireEvent.change(cell, { target: { value: "1.2300" } });
    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const snapshot = saveProject.mock.calls[0]![0].adaptiveInput!;
    expect(snapshot.canonicalObservations.map((row) => Object.values(row.values)[0])).toEqual([
      1.23,
    ]);
    expect(Object.values(snapshot.numericPresentation!.displayTexts)).toEqual(["1.2300"]);
    expect(screen.getByRole("button", { name: "入力を元に戻す" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "入力を元に戻す" }));
    expect(screen.queryByDisplayValue("1.2300")).toBeNull();
  });

  it("does not save an old canonical value while the focused draft is invalid", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "C:/tmp/valid-cell.lsa",
    }));
    const cell = await createEditableExperiment(saveProject);
    act(() => cell.focus());
    fireEvent.change(cell, { target: { value: "not a number" } });
    pressSave();
    expect(saveProject).not.toHaveBeenCalled();
    expect(cell).toHaveAttribute("aria-invalid", "true");
    expect(cell).toHaveFocus();
    fireEvent.change(cell, { target: { value: "42" } });
    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    expect(
      saveProject.mock.calls[0]![0].adaptiveInput?.canonicalObservations.map(
        (row) => Object.values(row.values)[0],
      ),
    ).toEqual([42]);
  });

  it("keeps an invalid blurred draft out of mouse-button saves until corrected", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "C:/tmp/mouse-cell.lsa",
    }));
    const cell = await createEditableExperiment(saveProject);
    act(() => cell.focus());
    fireEvent.change(cell, { target: { value: "invalid" } });
    fireEvent.blur(cell);
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    expect(saveProject).not.toHaveBeenCalled();
    expect(screen.getByText("入力表のエラーを修正してから保存してください。")).toBeVisible();
    fireEvent.change(cell, { target: { value: "63" } });
    fireEvent.blur(cell);
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    expect(
      Object.values(saveProject.mock.calls[0]![0].adaptiveInput!.canonicalObservations[0]!.values),
    ).toEqual([63]);
  });

  it("also stops mouse save for an invalid expanded-view draft and retains its canonical value", async () => {
    const saveProject = vi.fn<SaveProjectAction>(async (state) => ({
      state,
      target: "C:/tmp/expanded-cell.lsa",
    }));
    const cell = await createEditableExperiment(saveProject);
    fireEvent.change(cell, { target: { value: "63" } });
    fireEvent.blur(cell);
    fireEvent.click(screen.getByRole("button", { name: "1測定1行" }));
    const expanded = document.querySelector<HTMLInputElement>('[data-expanded-field="value"]')!;
    fireEvent.change(expanded, { target: { value: "invalid" } });
    fireEvent.blur(expanded);
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    expect(saveProject).not.toHaveBeenCalled();
    expect(expanded).toHaveValue("invalid");
    expect(expanded).toHaveFocus();
    fireEvent.change(expanded, { target: { value: "64" } });
    fireEvent.blur(expanded);
    fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    expect(
      Object.values(saveProject.mock.calls[0]![0].adaptiveInput!.canonicalObservations[0]!.values),
    ).toEqual([64]);
  });

  it("requires correction of an invalid retained draft before Graph creation or Statistics", async () => {
    const cell = await createEditableExperiment(async () => null);
    fireEvent.change(cell, { target: { value: "invalid" } });
    fireEvent.blur(cell);
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    expect(screen.queryByRole("dialog", { name: "グラフの基本形を選ぶ" })).not.toBeInTheDocument();
    expect(
      screen.getByText("入力表のエラーを修正してからグラフを作成してください。"),
    ).toBeVisible();
    fireEvent.change(cell, { target: { value: "63" } });
    fireEvent.blur(cell);
    fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
    fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
    await screen.findByRole("button", { name: "SVGを書き出す" });
    fireEvent.click(screen.getByRole("button", { name: "データ" }));
    const retainedCell = screen.getByRole("textbox", { name: "入力行 1・Control・Signal" });
    fireEvent.change(retainedCell, { target: { value: "invalid" } });
    fireEvent.blur(retainedCell);
    fireEvent.click(screen.getByRole("button", { name: "統計" }));
    expect(screen.getByText("入力表のエラーを修正してから統計へ進んでください。")).toBeVisible();
    expect(screen.getByRole("button", { name: "データ" })).toHaveAttribute("aria-current", "page");
    expect(retainedCell).toHaveValue("invalid");
  });

  it("is a safe no-op when the active page has no registered save handler", () => {
    const saveProject = vi.fn();
    render(
      <App
        projectActions={{
          openProject: async () => null,
          saveProject,
        }}
      />,
    );

    pressSave();

    expect(saveProject).not.toHaveBeenCalled();
  });

  it("saves ExperimentWorkspace exactly once and preserves Save versus Save As intent", async () => {
    const saveProject = vi.fn(async (state, target?: string) => ({
      state,
      target: target ?? "C:/tmp/experiment-workspace.lsa",
    }));
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

    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    expect(saveProject.mock.calls[0]?.[1]).toBeUndefined();
    await screen.findByText(/プロジェクトを保存しました/);

    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    expect(saveProject.mock.calls[1]?.[1]).toBe("C:/tmp/experiment-workspace.lsa");

    pressSave(true);
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(3));
    expect(saveProject.mock.calls[2]?.[1]).toBeUndefined();
  });

  it("saves Graph-only exactly once and forwards Save As through the registered handler", async () => {
    window.history.replaceState({}, "", "/?adaptiveInput=1");
    const saveUnresolvedVisualizationProject = vi.fn(async (state, target?: string) => ({
      state,
      target: target ?? "C:/tmp/graph-only.lsa",
    }));
    const actions: ProjectActions = {
      openProject: async () => null,
      saveProject: async () => null,
      openUnresolvedVisualizationProject: async () => null,
      saveUnresolvedVisualizationProject,
    };
    render(<App projectActions={actions} />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: "手元の表からGraphを作るを開く" }));
    fireEvent.paste(screen.getByTestId("graph-only-cell-0-0"), {
      clipboardData: { getData: () => "X\tY\n0\t1\n1\t2" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの横軸" }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Graphの測定値" }), {
      target: { value: "1" },
    });

    pressSave();
    await waitFor(() => expect(saveUnresolvedVisualizationProject).toHaveBeenCalledTimes(1));
    expect(saveUnresolvedVisualizationProject.mock.calls[0]?.[1]).toBeUndefined();
    await screen.findByText(/Graph用データを保存しました/);

    pressSave();
    await waitFor(() => expect(saveUnresolvedVisualizationProject).toHaveBeenCalledTimes(2));
    expect(saveUnresolvedVisualizationProject.mock.calls[1]?.[1]).toBe("C:/tmp/graph-only.lsa");

    pressSave(true);
    await waitFor(() => expect(saveUnresolvedVisualizationProject).toHaveBeenCalledTimes(3));
    expect(saveUnresolvedVisualizationProject.mock.calls[2]?.[1]).toBeUndefined();
  });

  it.each([
    ["/survival?adaptiveInput=1", "生存時間"],
    ["/nonlinear-fit?adaptiveInput=1", "濃度–反応・酵素反応"],
  ] as const)(
    "saves the registered %s draft once per command and preserves Save As intent",
    async (path, heading) => {
      window.history.replaceState({}, "", path);
      const saveSpecializedEntryDraftProject = vi.fn(async (state, target?: string) => ({
        state,
        target: target ?? `C:/tmp/${heading}.lsa`,
      }));
      const actions: ProjectActions = {
        openProject: async () => null,
        openAnyProject: async () => null,
        saveProject: async () => null,
        saveSpecializedEntryDraftProject,
      };
      render(<App projectActions={actions} />);
      await screen.findByRole("heading", { name: heading, level: 1 });

      pressSave();
      await waitFor(() => expect(saveSpecializedEntryDraftProject).toHaveBeenCalledTimes(1));
      expect(saveSpecializedEntryDraftProject.mock.calls[0]?.[1]).toBeUndefined();
      await screen.findByText(/入力途中の表と回答を保存しました/);

      pressSave();
      await waitFor(() => expect(saveSpecializedEntryDraftProject).toHaveBeenCalledTimes(2));
      expect(saveSpecializedEntryDraftProject.mock.calls[1]?.[1]).toBe(`C:/tmp/${heading}.lsa`);

      pressSave(true);
      await waitFor(() => expect(saveSpecializedEntryDraftProject).toHaveBeenCalledTimes(3));
      expect(saveSpecializedEntryDraftProject.mock.calls[2]?.[1]).toBeUndefined();
    },
  );

  it.each(["visualization", "specialized"] as const)(
    "prevents overlapping %s saves and releases the lock after cancellation",
    async (kind) => {
      window.history.replaceState(
        {},
        "",
        kind === "visualization" ? "/heatmap?adaptiveInput=1" : "/survival?adaptiveInput=1",
      );
      let cancel!: () => void;
      const pendingSave = vi.fn(
        () =>
          new Promise<null>((resolve) => {
            cancel = () => resolve(null);
          }),
      );
      render(
        <App
          projectActions={{
            openProject: async () => null,
            openAnyProject: async () => null,
            saveProject: async () => null,
            openUnresolvedVisualizationProject: async () => null,
            saveUnresolvedVisualizationProject: pendingSave,
            saveSpecializedEntryDraftProject: pendingSave,
          }}
        />,
      );
      if (kind === "visualization") {
        fireEvent.change(await screen.findByLabelText("Matrix data"), {
          target: { value: "Feature\tSample A\tSample B\nProtein A\t1\t2" },
        });
      } else {
        await screen.findByRole("heading", { name: "生存時間", level: 1 });
      }
      pressSave();
      await waitFor(() => expect(pendingSave).toHaveBeenCalledTimes(1));
      pressSave();
      pressSave(true);
      expect(pendingSave).toHaveBeenCalledTimes(1);
      await act(async () => cancel());
      pressSave();
      await waitFor(() => expect(pendingSave).toHaveBeenCalledTimes(2));
      await act(async () => cancel());
    },
  );

  it("saves Heatmap exactly once and forwards Save As through the registered handler", async () => {
    window.history.replaceState({}, "", "/heatmap?adaptiveInput=1");
    const saveUnresolvedVisualizationProject = vi.fn(async (state, target?: string) => ({
      state,
      target: target ?? "C:/tmp/heatmap.lsa",
    }));
    const actions: ProjectActions = {
      openProject: async () => null,
      saveProject: async () => null,
      openUnresolvedVisualizationProject: async () => null,
      saveUnresolvedVisualizationProject,
    };
    render(<App projectActions={actions} />);
    fireEvent.change(await screen.findByLabelText("Matrix data"), {
      target: { value: "Feature\tSample A\tSample B\nProtein A\t1\t2" },
    });

    pressSave();
    await waitFor(() => expect(saveUnresolvedVisualizationProject).toHaveBeenCalledTimes(1));
    expect(saveUnresolvedVisualizationProject.mock.calls[0]?.[1]).toBeUndefined();
    await screen.findByText(/Heatmap projectを保存しました/);

    pressSave();
    await waitFor(() => expect(saveUnresolvedVisualizationProject).toHaveBeenCalledTimes(2));
    expect(saveUnresolvedVisualizationProject.mock.calls[1]?.[1]).toBe("C:/tmp/heatmap.lsa");

    pressSave(true);
    await waitFor(() => expect(saveUnresolvedVisualizationProject).toHaveBeenCalledTimes(3));
    expect(saveUnresolvedVisualizationProject.mock.calls[2]?.[1]).toBeUndefined();
  });
  it("preserves canonical cell focus and table scroll through graph and statistics", async () => {
    const cell = await createEditableExperiment(vi.fn(async state => ({state, target: "C:/tmp/r2-navigation.lsa"})));
    fireEvent.change(cell, {target: {value: "10"}}); fireEvent.blur(cell);
    fireEvent.click(screen.getByRole("button", {name: "＋ グラフを作成"}));
    fireEvent.click(screen.getByRole("button", {name: "このグラフを作成"}));
    fireEvent.click(screen.getByRole("button", {name: "データ"}));
    const table = cell.closest<HTMLElement>(".adaptive-canonical-spreadsheet__table-wrap")!;
    expect(table).not.toBeNull();
    act(() => cell.focus()); table.scrollTop = 117; table.scrollLeft = 83;
    fireEvent.click(screen.getByRole("button", {name: /^グラフ \(1\)$/}));
    fireEvent.click(screen.getByRole("button", {name: "統計"}));
    table.scrollTop = 0; table.scrollLeft = 0;
    fireEvent.click(screen.getByRole("button", {name: "データ"}));
    expect(cell).toHaveFocus(); expect(table.scrollTop).toBe(117); expect(table.scrollLeft).toBe(83);
    expect(cell).toHaveValue("10");
  }, 15000);

});
