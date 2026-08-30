import { render, screen, waitFor } from "@testing-library/react";

import App from "./App";
import { installGlobalSaveTestHooks, pressSave } from "./App.globalSave.testSupport";
import type { ProjectActions } from "./app/projectActions";

describe("App-level specialized draft save commands", () => {
  installGlobalSaveTestHooks();

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
});
