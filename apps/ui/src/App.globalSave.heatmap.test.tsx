import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "./App";
import { installGlobalSaveTestHooks, pressSave } from "./App.globalSave.testSupport";
import type { ProjectActions } from "./app/projectActions";

describe("App-level Heatmap save commands", () => {
  installGlobalSaveTestHooks();

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
