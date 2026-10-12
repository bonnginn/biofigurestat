import {
  AnalysisRecommendationSchema,
  CORE_WORKSPACE_RECOMMENDATION_TEMPLATES,
  requireAnalysisRequestRecommendation,
  type AnalysisEngineRequest,
  type AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import type { ExperimentDesign } from "@lsaa/domain";

/** Core designs are revalidated; separate modules retain their execution-time contract. */
export function workspaceExecutionRecommendation(
  design: ExperimentDesign,
  request: AnalysisEngineRequest,
  recorded: AnalysisRecommendation | undefined,
  outcomeId: string,
): AnalysisRecommendation {
  if ((CORE_WORKSPACE_RECOMMENDATION_TEMPLATES as readonly string[]).includes(request.templateId)) {
    const canonical = requireAnalysisRequestRecommendation(design, request, { outcomeId });
    return { ...canonical, ...(recorded?.decision ? { decision: recorded.decision } : {}) };
  }
  const parsed = AnalysisRecommendationSchema.safeParse(recorded);
  if (!parsed.success || parsed.data.templateId !== request.templateId ||
      parsed.data.templateVersion !== request.templateVersion ||
      (parsed.data.recommendedMethod !== request.method &&
       !parsed.data.alternativeMethods.includes(request.method))) {
    throw new Error("Executed module recommendation is missing or does not match its request.");
  }
  return parsed.data;
}
