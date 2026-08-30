import { cleanup, fireEvent } from "@testing-library/react";

import { setUsageConsent } from "./app/usageTelemetry";

export function installGlobalSaveTestHooks() {
  beforeEach(() => {
    localStorage.clear();
    setUsageConsent("opted_out");
    window.history.replaceState({}, "", "/");
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
}

export function pressSave(saveAs = false) {
  fireEvent.keyDown(window, {
    key: "s",
    code: "KeyS",
    ctrlKey: true,
    shiftKey: saveAs,
  });
}
