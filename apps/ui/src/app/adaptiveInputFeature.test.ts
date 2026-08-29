import { afterEach, describe, expect, it } from "vitest";
import {
  ADAPTIVE_INPUT_FEATURE_FLAG,
  adaptiveInputFeatureEnabled,
  resolveAdaptiveInputFeature,
} from "./adaptiveInputFeature";

afterEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
});

describe("adaptive input feature flag", () => {
  it("is opt-in in the test environment and can be enabled per URL or durable local setting", () => {
    expect(adaptiveInputFeatureEnabled()).toBe(false);
    window.history.replaceState({}, "", "/?adaptiveInput=1");
    expect(adaptiveInputFeatureEnabled()).toBe(true);
    window.history.replaceState({}, "", "/");
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    expect(adaptiveInputFeatureEnabled()).toBe(true);
  });

  it("supports explicit URL and durable overrides outside production", () => {
    expect(
      resolveAdaptiveInputFeature({ production: false, querySetting: "1" }),
    ).toBe(true);
    expect(
      resolveAdaptiveInputFeature({ production: false, durableSetting: "enabled" }),
    ).toBe(true);
    expect(
      resolveAdaptiveInputFeature({ production: false, querySetting: "0" }),
    ).toBe(false);
    expect(
      resolveAdaptiveInputFeature({ production: false, durableSetting: "disabled" }),
    ).toBe(false);

    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "enabled");
    window.history.replaceState({}, "", "/?adaptiveInput=0");
    expect(adaptiveInputFeatureEnabled()).toBe(false);

    window.history.replaceState({}, "", "/");
    window.localStorage.setItem(ADAPTIVE_INPUT_FEATURE_FLAG, "disabled");
    expect(adaptiveInputFeatureEnabled()).toBe(false);
  });

  it("makes experiment-first immutable to URL and durable settings in production", () => {
    expect(resolveAdaptiveInputFeature({ production: true })).toBe(true);
    expect(resolveAdaptiveInputFeature({ production: true, querySetting: "0" })).toBe(true);
    expect(resolveAdaptiveInputFeature({ production: true, durableSetting: "disabled" })).toBe(
      true,
    );
    expect(
      resolveAdaptiveInputFeature({
        production: true,
        querySetting: "0",
        durableSetting: "disabled",
      }),
    ).toBe(true);
  });

  it("retains buildSetting=0 as the explicit production operations rollback", () => {
    expect(resolveAdaptiveInputFeature({ production: true, buildSetting: "0" })).toBe(false);
    expect(
      resolveAdaptiveInputFeature({
        production: true,
        buildSetting: "0",
        querySetting: "1",
        durableSetting: "enabled",
      }),
    ).toBe(false);
  });
});
