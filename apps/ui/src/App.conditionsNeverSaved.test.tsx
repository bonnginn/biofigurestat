import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ProjectState } from "@lsaa/project";

import App from "./App";
import type { OpenedProject, ProjectActions, SaveProjectAction } from "./app/projectActions";
import { loadRecentProjects } from "./app/recentProjects";
import { setUsageConsent } from "./app/usageTelemetry";

const sourceName = "Never saved source";
const newName = "Empty edited conditions";
const sourcePath = "C:/acceptance/never-saved-source.lsa";
const newPath = "C:/acceptance/edited-empty.lsa";

function pressSave() {
  fireEvent.keyDown(window, { key: "s", code: "KeyS", ctrlKey: true });
}

function tabs() {
  return within(document.querySelector(".project-tabs") as HTMLElement).getAllByRole("tab");
}

async function selectTab(index: number) {
  fireEvent.click(tabs()[index]!);
  await waitFor(() => expect(tabs()[index]).toHaveAttribute("aria-selected", "true"));
  await screen.findByRole("button", { name: "実験の組み立てを修正" });
}

function expectEmpty(state: ProjectState) {
  expect(state.metadata.projectName).toBe(newName);
  expect(state.adaptiveInput?.contract.factors[0]?.levels).toEqual(["Drug", "Unused"]);
  expect(state.adaptiveInput?.canonicalObservations).toEqual([]);
  expect(state.adaptiveInput?.mapping).toBeNull();
  expect(state.adaptiveInput?.rawLineage).toBeNull();
  expect(state.observations).toEqual([]);
  expect(state.graphs).toEqual([]);
  expect(state.experimentWorkspace?.graphs).toEqual([]);
  expect(state.analysisRuns).toEqual([]);
}

describe("App conditions fork from a never-saved experiment", () => {
  beforeEach(() => {
    localStorage.clear();
    setUsageConsent("opted_out");
    window.history.replaceState({}, "", "/?adaptiveInput=1");
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("uses the real wizard, keeps the live source, and prompts separately for both first saves after a cancelled new save", async () => {
    const started = performance.now();
    const phase = (label: string) => console.info(`never-saved acceptance: ${label} ${Math.round(performance.now() - started)}ms`);
    const openProject = vi.fn(async () => null);
    const saveProject = vi.fn<SaveProjectAction>(async (state, target) => ({
      state,
      target: target ?? (state.metadata.projectName === sourceName ? sourcePath : newPath),
    }));
    saveProject.mockResolvedValueOnce(null);
    render(<App projectActions={{ openProject, saveProject }} />);

    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: "実験から始めるを開く" }));
    fireEvent.change(screen.getByLabelText("実験タイトル（任意）"), { target: { value: sourceName } });
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), { target: { value: "Treatment" } });
    for (const [index, value] of ["Control", "Drug", "Unused"].entries()) {
      fireEvent.change(screen.getByRole("textbox", { name: `行 1 列 ${index + 1}` }), { target: { value } });
    }
    fireEvent.change(screen.getByPlaceholderText("例：細胞生存率"), { target: { value: "Signal" } });
    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), { target: { value: "culture dish" } });
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    phase("real wizard completed");

    const sourceValue = screen.getByRole("textbox", { name: "入力行 1・Control・Signal" });
    fireEvent.focus(sourceValue);
    fireEvent.change(sourceValue, { target: { value: "77" } });
    fireEvent.blur(sourceValue);
    expect(sourceValue).toHaveValue("77");
    expect(saveProject).not.toHaveBeenCalled();
    expect(openProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "実験の組み立てを修正" }));
    expect(screen.queryByRole("button", { name: "この条件で新規作成" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("実験タイトル（任意）"), { target: { value: newName } });
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/既存データで使われている/);
    fireEvent.click(screen.getByRole("button", { name: "この条件で新規作成" }));
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    expect(tabs()).toHaveLength(2);
    expect(tabs()[0]).toHaveTextContent(sourceName);
    expect(tabs()[1]).toHaveTextContent(newName);
    expect(tabs()[1]).toHaveAttribute("aria-selected", "true");
    expect(saveProject).not.toHaveBeenCalled();
    phase("never-saved source forked");

    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled());
    const firstNew = saveProject.mock.calls[0]![0];
    expect(saveProject.mock.calls[0]![1]).toBeUndefined();
    expectEmpty(firstNew);
    await selectTab(0);
    expect(screen.getByRole("textbox", { name: "入力行 1・Control・Signal" })).toHaveValue("77");
    await selectTab(1);
    phase("cancel retained both tabs");

    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(tabs()[1]).toHaveAttribute("title", newPath));
    expect(saveProject.mock.calls[1]![1]).toBeUndefined();
    expect(saveProject.mock.calls[1]![0].metadata.projectId).toBe(firstNew.metadata.projectId);
    expectEmpty(saveProject.mock.calls[1]![0]);
    await selectTab(0);
    expect(screen.getByRole("textbox", { name: "入力行 1・Control・Signal" })).toHaveValue("77");

    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(tabs().find((tab) => tab.getAttribute("title") === sourcePath)).toHaveAttribute("aria-selected", "true"));
    const source = saveProject.mock.calls[2]![0];
    expect(saveProject.mock.calls[2]![1]).toBeUndefined();
    expect(source.metadata.projectName).toBe(sourceName);
    expect(source.metadata.projectId).not.toBe(firstNew.metadata.projectId);
    expect(source.adaptiveInput?.contract.factors[0]?.levels).toEqual(["Control", "Drug", "Unused"]);
    expect(source.adaptiveInput?.canonicalObservations).toHaveLength(1);
    expect(Object.values(source.adaptiveInput!.canonicalObservations[0]!.values)).toEqual([77]);
    expect(tabs()).toHaveLength(2);
    expect(openProject).not.toHaveBeenCalled();
    phase("independent first saves complete");
  }, 15000);

  it("preserves the source identity across a first save cancellation BEFORE the conditions fork", async () => {
    const openProject = vi.fn(async () => null);
    const saveProject = vi.fn<SaveProjectAction>(async (state, target) => ({ state, target: target ?? sourcePath }));
    saveProject.mockResolvedValueOnce(null);
    render(<App projectActions={{ openProject, saveProject }} />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: "実験から始めるを開く" }));
    fireEvent.change(screen.getByLabelText("実験タイトル（任意）"), { target: { value: sourceName } });
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), { target: { value: "Treatment" } });
    for (const [index, value] of ["Control", "Drug", "Unused"].entries()) {
      fireEvent.change(screen.getByRole("textbox", { name: `行 1 列 ${index + 1}` }), { target: { value } });
    }
    fireEvent.change(screen.getByPlaceholderText("例：細胞生存率"), { target: { value: "Signal" } });
    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), { target: { value: "culture dish" } });
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    const value = screen.getByRole("textbox", { name: "入力行 1・Control・Signal" });
    fireEvent.focus(value);
    fireEvent.change(value, { target: { value: "77" } });
    fireEvent.blur(value);

    // The cancelled attempt must not allocate a second source identity when
    // the same live experiment later becomes the retained side of a fork.
    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled());
    const beforeFork = saveProject.mock.calls[0]![0];
    expect(saveProject.mock.calls[0]![1]).toBeUndefined();
    expect(loadRecentProjects()).toEqual([]);
    expect(beforeFork.adaptiveInput?.canonicalObservations).toHaveLength(1);
    expect(Object.values(beforeFork.adaptiveInput!.canonicalObservations[0]!.values)).toEqual([77]);

    fireEvent.click(screen.getByRole("button", { name: "実験の組み立てを修正" }));
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("実験タイトル（任意）"), { target: { value: newName } });
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/既存データで使われている/);
    fireEvent.click(screen.getByRole("button", { name: "この条件で新規作成" }));
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    expect(tabs()).toHaveLength(2);
    expect(loadRecentProjects()).toEqual([]);
    await selectTab(0);
    expect(screen.getByRole("textbox", { name: "入力行 1・Control・Signal" })).toHaveValue("77");
    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(tabs().find((tab) => tab.getAttribute("title") === sourcePath)).toHaveAttribute("aria-selected", "true"));
    const afterFork = saveProject.mock.calls[1]![0];
    expect(saveProject.mock.calls[1]![1]).toBeUndefined();
    expect(afterFork.metadata.projectId).toBe(beforeFork.metadata.projectId);
    expect(afterFork.metadata.createdAt).toBe(beforeFork.metadata.createdAt);
    expect(afterFork.metadata.projectName).toBe(sourceName);
    expect(afterFork.adaptiveInput?.canonicalObservations).toEqual(beforeFork.adaptiveInput?.canonicalObservations);
    expect(afterFork.analysisRuns).toEqual(beforeFork.analysisRuns);
    expect(loadRecentProjects().map(({ target }) => target)).toEqual([sourcePath]);
    expect(tabs()).toHaveLength(2);
    expect(openProject).not.toHaveBeenCalled();
  }, 15000);

  it("reopens separately saved source and empty-new snapshots by real Recent path after unmounting", async () => {
    const disk = new Map<string, ProjectState>();
    const copy = (state: ProjectState): ProjectState => JSON.parse(JSON.stringify(state)) as ProjectState;
    const saveProject = vi.fn<SaveProjectAction>(async (state, target) => {
      const path = target ?? (state.metadata.projectName === sourceName ? sourcePath : newPath);
      disk.set(path, copy(state));
      return { state: copy(state), target: path };
    });
    const openProjectTarget = vi.fn(async (target: string): Promise<OpenedProject> => {
      const state = disk.get(target);
      if (!state) throw new Error("Unexpected mock disk target");
      return { state: copy(state), target };
    });
    const openProject = vi.fn(async () => null);
    const actions: ProjectActions = { openProject, openProjectTarget, saveProject };
    const firstView = render(<App projectActions={actions} />);
    fireEvent.click(document.querySelector('[data-primary-route="new-experiment"]')!);
    fireEvent.click(screen.getByRole("button", { name: "実験から始めるを開く" }));
    fireEvent.change(screen.getByLabelText("実験タイトル（任意）"), { target: { value: sourceName } });
    fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), { target: { value: "Treatment" } });
    for (const [index, value] of ["Control", "Drug", "Unused"].entries()) {
      fireEvent.change(screen.getByRole("textbox", { name: `行 1 列 ${index + 1}` }), { target: { value } });
    }
    fireEvent.change(screen.getByPlaceholderText("例：細胞生存率"), { target: { value: "Signal" } });
    fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), { target: { value: "culture dish" } });
    fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
    fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    const value = screen.getByRole("textbox", { name: "入力行 1・Control・Signal" });
    fireEvent.focus(value);
    fireEvent.change(value, { target: { value: "77" } });
    fireEvent.blur(value);
    expect(saveProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "実験の組み立てを修正" }));
    fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("実験タイトル（任意）"), { target: { value: newName } });
    fireEvent.click(screen.getByRole("button", { name: "変更を適用" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/既存データで使われている/);
    fireEvent.click(screen.getByRole("button", { name: "この条件で新規作成" }));
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    pressSave();
    await waitFor(() => expect(disk.has(newPath)).toBe(true));
    await waitFor(() => expect(tabs()[1]).toHaveAttribute("title", newPath));
    await selectTab(0);
    pressSave();
    await waitFor(() => expect(disk.has(sourcePath)).toBe(true));
    await waitFor(() => expect(tabs().find((tab) => tab.getAttribute("title") === sourcePath)).toHaveAttribute("aria-selected", "true"));
    expect(saveProject.mock.calls.map(([, target]) => target)).toEqual([undefined, undefined]);
    const savedSource = copy(disk.get(sourcePath)!);
    const savedNew = copy(disk.get(newPath)!);
    expect(savedSource.metadata.projectId).not.toBe(savedNew.metadata.projectId);
    expectEmpty(savedNew);
    expect(loadRecentProjects().map(({ target }) => target).sort()).toEqual([newPath, sourcePath].sort());
    firstView.unmount();

    // Both opens construct new App instances and read independent deep copies
    // through the existing path adapter; no previous React checkpoint survives.
    window.history.replaceState({}, "", "/?adaptiveInput=1");
    const sourceView = render(<App projectActions={actions} />);
    fireEvent.click(document.querySelector('[data-primary-route="recent"]')!);
    fireEvent.click(within(screen.getByText(sourceName).closest("li")!).getByRole("button", { name: "開く" }));
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    expect(openProjectTarget).toHaveBeenNthCalledWith(1, sourcePath);
    const reopenedValue = screen.getByRole("textbox", { name: "入力行 1・Control・Signal" });
    expect(reopenedValue).toHaveValue("77");
    fireEvent.focus(reopenedValue);
    fireEvent.change(reopenedValue, { target: { value: "78" } });
    fireEvent.blur(reopenedValue);
    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(3));
    expect(saveProject.mock.calls[2]![1]).toBe(sourcePath);
    expect(saveProject.mock.calls[2]![0].metadata.projectId).toBe(savedSource.metadata.projectId);
    expect(saveProject.mock.calls[2]![0].adaptiveInput?.canonicalObservations).toEqual(
      savedSource.adaptiveInput?.canonicalObservations.map((row) => ({ ...row, values: { ...row.values, [row.readoutKey]: 78 } })),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeEnabled());
    sourceView.unmount();

    window.history.replaceState({}, "", "/?adaptiveInput=1");
    render(<App projectActions={actions} />);
    fireEvent.click(document.querySelector('[data-primary-route="recent"]')!);
    fireEvent.click(within(screen.getByText(newName).closest("li")!).getByRole("button", { name: "開く" }));
    await screen.findByRole("button", { name: "実験の組み立てを修正" });
    expect(openProjectTarget).toHaveBeenNthCalledWith(2, newPath);
    expect(screen.getByRole("textbox", { name: "入力行 1・Drug・Signal" })).toHaveValue("");
    expect(screen.queryByRole("textbox", { name: "入力行 1・Control・Signal" })).toBeNull();
    expect(screen.queryByDisplayValue("77")).toBeNull();
    pressSave();
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(4));
    expect(saveProject.mock.calls[3]![1]).toBe(newPath);
    expect(saveProject.mock.calls[3]![0].metadata.projectId).toBe(savedNew.metadata.projectId);
    expectEmpty(saveProject.mock.calls[3]![0]);
    expect(openProject).not.toHaveBeenCalled();
  }, 15000);
});
