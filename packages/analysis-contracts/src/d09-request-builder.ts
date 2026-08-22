import {
  measurementNumericValue,
  type ExperimentDesign,
  type Observation,
  type UnitInstance,
} from "@lsaa/domain";

import {
  AnalysisEngineRequestSchema,
  type AnalysisEngineRequest,
  type AnalysisRecommendation,
} from "./contracts";

export function createD09EngineRequest(input: {
  requestId: string;
  projectId: string;
  analysisId: string;
  design: ExperimentDesign;
  recommendation: AnalysisRecommendation;
  observations: Observation[];
  unitInstances: UnitInstance[];
  confidenceLevel?: number;
}): AnalysisEngineRequest {
  if (input.recommendation.templateId !== "D09") {
    throw new Error("The D09 request builder received a different analysis template");
  }
  if (input.design.pairing.kind !== "matched" || input.design.conditions.length !== 2) {
    throw new Error("D09 requires two complete measurements from the same declared unit");
  }
  const conditionIds = input.design.conditions.map((condition) => condition.id) as [string, string];
  const unitById = new Map(input.unitInstances.map((unit) => [unit.id, unit]));
  const allowedConditions = new Set(conditionIds);
  const rawRevisionIds = new Set(
    input.observations.map((observation) => observation.rawRevisionId),
  );
  const outcomeIds = new Set(input.observations.map((observation) => observation.outcomeId));
  if (rawRevisionIds.size !== 1) throw new Error("D09 cannot combine raw revisions");
  if (outcomeIds.size !== 1) throw new Error("D09 cannot combine different outcomes");

  const counts = new Map<string, number>();
  const conditionsByPair = new Map<string, Set<string>>();
  const engineObservations = input.observations
    .filter((observation) => allowedConditions.has(observation.conditionId))
    .map((observation) => {
      const unit = unitById.get(observation.unitInstanceId);
      if (!unit || unit.levelId !== input.design.experimentalUnitLevelId) {
        throw new Error(`D09 observation ${observation.id} must reference the experimental unit`);
      }
      const pairId = unit.id;
      const key = `${pairId}\u0000${observation.conditionId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      conditionsByPair.set(
        pairId,
        new Set([...(conditionsByPair.get(pairId) ?? []), observation.conditionId]),
      );
      return {
        observationId: observation.id,
        conditionId: observation.conditionId,
        value: measurementNumericValue(observation.measurement),
        experimentalUnitId: unit.id,
        pairId,
      };
    });
  if ([...counts.values()].some((count) => count !== 1)) {
    throw new Error("Each D09 unit requires exactly one value for each variable");
  }
  if (conditionsByPair.size < 3) throw new Error("D09 requires at least three complete units");
  for (const [pairId, conditions] of conditionsByPair) {
    if (conditions.size !== 2) throw new Error(`D09 unit ${pairId} is missing one variable`);
  }

  return AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.5.0",
    requestId: input.requestId,
    projectId: input.projectId,
    analysisId: input.analysisId,
    templateId: "D09",
    templateVersion: input.recommendation.templateVersion,
    method: input.recommendation.recommendedMethod,
    variableConditionIds: conditionIds,
    observations: engineObservations,
    options: {
      alternative: "two_sided",
      confidenceLevel: input.confidenceLevel ?? 0.95,
      multiplicityMethod: null,
    },
  });
}
