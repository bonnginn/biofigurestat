import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "./App";
import { installGlobalSaveTestHooks, pressSave } from "./App.globalSave.testSupport";

describe("App-level Experiment save commands", () => {
  installGlobalSaveTestHooks();

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
    fireEvent.click(
      await screen.findByRole("button", { name: /^Simple 3群（連続値）/ }, { timeout: 5_000 }),
    );
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
});
