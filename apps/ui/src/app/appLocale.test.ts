import { afterEach, describe, expect, it } from "vitest";

import {
  appLocaleStorageKey,
  getAppLocale,
  localizedFailureDetail,
  localizedFailureMessage,
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

  it("keeps locale outside serialized project data", () => {
    const project = {
      schemaVersion: "0.3.0",
      metadata: { projectId: "project-1", projectName: "Protein amount" },
      observations: [{ id: "obs-1", value: 1.25 }],
    };
    const serializedBefore = JSON.stringify(project);

    setAppLocale("en");
    const serializedAfterEnglish = JSON.stringify(project);
    setAppLocale("ja");

    expect(serializedAfterEnglish).toBe(serializedBefore);
    expect(JSON.parse(serializedAfterEnglish)).not.toHaveProperty("locale");
    expect(window.localStorage.getItem(appLocaleStorageKey)).toBe("ja");
  });

  it("keeps legacy Japanese exception detail out of English UI", () => {
    expect(
      localizedFailureMessage(
        "en",
        new Error("保存できませんでした"),
        "保存できませんでした。",
        "The project could not be saved.",
      ),
    ).toBe("The project could not be saved.");
    expect(
      localizedFailureMessage(
        "ja",
        new Error("保存先へ書き込めません"),
        "保存できませんでした。",
        "The project could not be saved.",
      ),
    ).toBe("保存先へ書き込めません");
    expect(localizedFailureDetail("en", new Error("保存先へ書き込めません"))).toBe("");
    expect(localizedFailureDetail("ja", new Error("保存先へ書き込めません"))).toBe(
      " 保存先へ書き込めません",
    );
  });
});
