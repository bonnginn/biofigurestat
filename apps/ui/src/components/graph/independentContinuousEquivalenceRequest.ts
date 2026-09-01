import {
  IndependentContinuousEquivalenceEngineRequestSchema,
  type AnalysisEngineRequest,
  type EquivalenceAnalysisPlan,
} from "@lsaa/analysis-contracts";

type EquivalenceRequest = Extract<AnalysisEngineRequest, { protocolVersion: "0.15.0" }>;

type BuildInput = Readonly<{
  baseRequest: AnalysisEngineRequest | null | undefined;
  plan: EquivalenceAnalysisPlan | null | undefined;
  comparisonId: string | null | undefined;
}>;

/**
 * Adapts only the first formally supported equivalence route. Returning null is a deliberate
 * safe stop: matched, blocked, multi-group, percentage, and multiple-claim analyses must not be
 * silently reinterpreted as an independent continuous-outcome TOST.
 */
export function createIndependentContinuousEquivalenceRequest({
  baseRequest,
  plan,
  comparisonId,
}: BuildInput): EquivalenceRequest | null {
  if (
    !baseRequest ||
    baseRequest.protocolVersion !== "0.1.0" ||
    baseRequest.templateId !== "D01" ||
    !plan ||
    !comparisonId ||
    plan.margin.scale !== "raw_difference" ||
    plan.claimMode !== "single_primary_comparison" ||
    plan.primaryComparisonId !== comparisonId ||
    baseRequest.observations.some(
      (observation) => observation.pairId !== undefined || observation.blockId !== undefined,
    )
  ) {
    return null;
  }

  const parsed = IndependentContinuousEquivalenceEngineRequestSchema.safeParse({
    protocolVersion: "0.15.0",
    requestId: `${baseRequest.requestId}:eq`,
    projectId: baseRequest.projectId,
    analysisId: `${baseRequest.analysisId}:eq`,
    templateId: "D01",
    templateVersion: "0.2.0",
    method: "welch_tost",
    comparisonId,
    contrastConditionIds: baseRequest.contrastConditionIds,
    equivalencePlan: plan,
    observations: baseRequest.observations,
    options: {
      alternative: "two_sided",
      confidenceLevel: 0.9,
      multiplicityMethod: null,
    },
  });
  return parsed.success ? parsed.data : null;
}
