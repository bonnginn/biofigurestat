import {
  PairedContinuousEquivalenceEngineRequestSchema,
  type AnalysisEngineRequest,
  type EquivalenceAnalysisPlan,
} from "@lsaa/analysis-contracts";

type PairedEquivalenceRequest = Extract<AnalysisEngineRequest, { protocolVersion: "0.16.0" }>;

type BuildInput = Readonly<{
  baseRequest: AnalysisEngineRequest | null | undefined;
  plan: EquivalenceAnalysisPlan | null | undefined;
  comparisonId: string | null | undefined;
  excludedIncompletePairIds?: readonly string[];
}>;

/**
 * Preserves the D02 matched identity contract while adapting its complete-pair analysis set to
 * paired TOST. Incomplete pair IDs are retained as explicit provenance; they are not converted to
 * independent observations or silently discarded from the report.
 */
export function createPairedContinuousEquivalenceRequest({
  baseRequest,
  plan,
  comparisonId,
  excludedIncompletePairIds = [],
}: BuildInput): PairedEquivalenceRequest | null {
  if (
    !baseRequest ||
    baseRequest.protocolVersion !== "0.1.0" ||
    baseRequest.templateId !== "D02" ||
    !plan ||
    !comparisonId ||
    plan.margin.scale !== "raw_difference" ||
    plan.claimMode !== "single_primary_comparison" ||
    plan.primaryComparisonId !== comparisonId ||
    baseRequest.observations.some(
      (observation) => !observation.pairId || observation.blockId !== undefined,
    )
  ) {
    return null;
  }

  const parsed = PairedContinuousEquivalenceEngineRequestSchema.safeParse({
    protocolVersion: "0.16.0",
    requestId: `${baseRequest.requestId}:paired-eq`,
    projectId: baseRequest.projectId,
    analysisId: `${baseRequest.analysisId}:paired-eq`,
    templateId: "D02",
    templateVersion: "0.2.0",
    method: "paired_tost",
    comparisonId,
    contrastConditionIds: baseRequest.contrastConditionIds,
    equivalencePlan: plan,
    excludedIncompletePairIds,
    observations: baseRequest.observations,
    options: {
      alternative: "two_sided",
      confidenceLevel: 0.9,
      multiplicityMethod: null,
    },
  });
  return parsed.success ? parsed.data : null;
}
