import { afterEach, describe, expect, it } from "vitest";
import { ADAPTIVE_INPUT_FEATURE_FLAG, adaptiveInputFeatureEnabled } from "./adaptiveInputFeature";

afterEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
});

describe("adaptive input feature flag", () => {
  it("is off by default and can be enabled per URL or durable local setting", () => {
    expect(adaptiveInputFeatureEnabled()).toBe(false);
    window.history.replaceState({}, "", "/?adaptiveInput=1");
    expect(adaptiveInputFeatureEnabled()).toBe(true);
    window.history.replaceState({}, "", "/");
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    expect(adaptiveInputFeatureEnabled()).toBe(true);
  });
});
