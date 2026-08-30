import { render } from "@testing-library/react";

import App from "./App";
import { installGlobalSaveTestHooks, pressSave } from "./App.globalSave.testSupport";

describe("App-level save without an active project", () => {
  installGlobalSaveTestHooks();

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
});
