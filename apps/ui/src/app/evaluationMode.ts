export type EvaluationModeConfig = Readonly<{
  enabled: boolean;
  apiBasePath: string | null;
  sourceRevision: string | null;
}>;

const enabled = import.meta.env.DEV && import.meta.env.VITE_LSAA_EVALUATION_MODE === "true";

export const evaluationMode: EvaluationModeConfig = {
  enabled,
  apiBasePath: enabled ? "/api/evaluation" : null,
  sourceRevision: enabled ? (import.meta.env.VITE_LSAA_SOURCE_REVISION ?? "unknown") : null,
};

export function evaluationModeIsConfigured(
  config: EvaluationModeConfig = evaluationMode,
): config is EvaluationModeConfig & { apiBasePath: string } {
  return Boolean(config.enabled && config.apiBasePath?.startsWith("/"));
}
