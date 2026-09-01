import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import App from "./App";
import { installGlobalSaveTestHooks, pressSave } from "./App.globalSave.testSupport";
import type { ProjectActions } from "./app/projectActions";

describe("App-level Graph-only save commands", () => {
  installGlobalSaveTestHooks();

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
    fireEvent.click(
      await screen.findByRole("button", { name: "手元の表からGraphを作るを開く" }),
    );
    fireEvent.paste(await screen.findByTestId("graph-only-cell-0-0"), {
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
});
