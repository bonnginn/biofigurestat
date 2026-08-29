import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "./App";
import type { ProjectActions } from "./app/projectActions";
import { setUsageConsent } from "./app/usageTelemetry";

function pressSave(saveAs = false) {
  fireEvent.keyDown(window, {
    key: "s",
    code: "KeyS",
    ctrlKey: true,
    shiftKey: saveAs,
  });
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
});
