export const ADAPTIVE_INPUT_FEATURE_FLAG = "experiment_first_adaptive_input_alpha" as const;

export function adaptiveInputFeatureEnabled(): boolean {
  if (import.meta.env.VITE_EXPERIMENT_FIRST_ADAPTIVE_INPUT === "1") return true;
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search).get("adaptiveInput");
  return query === "1" || window.localStorage.getItem(ADAPTIVE_INPUT_FEATURE_FLAG) === "enabled";
}
