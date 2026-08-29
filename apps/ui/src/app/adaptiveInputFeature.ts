export const ADAPTIVE_INPUT_FEATURE_FLAG = "experiment_first_adaptive_input_alpha" as const;

export function resolveAdaptiveInputFeature(
  input: Readonly<{
    buildSetting?: string;
    querySetting?: string | null;
    durableSetting?: string | null;
    production: boolean;
  }>,
): boolean {
  const { buildSetting, querySetting, durableSetting, production } = input;
  if (buildSetting === "0") return false;
  if (buildSetting === "1") return true;

  // The experiment-first hub is the accepted production entry. Query-string
  // and browser-local values are useful for development and audit sessions,
  // but must not silently replace the release entry with the compatibility
  // workflow. VITE=0 above is the explicit operational rollback switch.
  if (production) return true;

  if (querySetting === "0") return false;
  if (querySetting === "1") return true;
  if (durableSetting === "disabled") return false;
  if (durableSetting === "enabled") return true;

  // Development and tests remain opt-in so the compatibility surface can
  // still be audited without making it reachable from an ordinary release.
  return false;
}

export function adaptiveInputFeatureEnabled(): boolean {
  return resolveAdaptiveInputFeature({
    buildSetting: import.meta.env.VITE_EXPERIMENT_FIRST_ADAPTIVE_INPUT,
    querySetting:
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("adaptiveInput"),
    durableSetting:
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(ADAPTIVE_INPUT_FEATURE_FLAG),
    production: import.meta.env.PROD,
  });
}
