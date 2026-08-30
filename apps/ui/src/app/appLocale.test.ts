import { afterEach, describe, expect, it } from "vitest";

import {
  appLocaleStorageKey,
  getAppLocale,
  resetAppLocaleForTests,
  setAppLocale,
} from "./appLocale";

describe("application locale", () => {
  afterEach(() => {
    window.localStorage.removeItem(appLocaleStorageKey);
    resetAppLocaleForTests("ja");
  });

  it("persists an explicit language without changing project data", () => {
    setAppLocale("en");

    expect(getAppLocale()).toBe("en");
    expect(window.localStorage.getItem(appLocaleStorageKey)).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("switches back to Japanese deterministically", () => {
    setAppLocale("en");
    setAppLocale("ja");

    expect(getAppLocale()).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
  });
});
