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

export type D04RequestInput = {
  requestId: string;
  projectId: string;
  analysisId: string;
  design: ExperimentDesign;
  recommendation: AnalysisRecommendation;
  observations: Observation[];
  unitInstances: UnitInstance[];
  confidenceLevel?: number;
};

function numericValue(observation: Observation): number {
  return measurementNumericValue(observation.measurement);
}

/** Builds complete-case protocol 0.3 input without inferring pairs from row order. */
export function createD04EngineRequest(input: D04RequestInput): AnalysisEngineRequest {
  if (input.recommendation.templateId !== "D04") {
    throw new Error("The D04 request builder received a different analysis template");
  }
  const { design } = input;
  if (
    design.conditions.length < 3 ||
    design.factors.length !== 1 ||
    design.pairing.kind === "independent" ||
    !design.pairing.completePairsRequired
  ) {
    throw new Error("D04 requires three or more complete matched groups under one factor");
  }

  const conditionIds = design.conditions.map((condition) => condition.id);
  const allowedConditions = new Set(conditionIds);
  const unitById = new Map(input.unitInstances.map((unit) => [unit.id, unit]));
  const outcomeIds = new Set(input.observations.map((observation) => observation.outcomeId));
  const rawRevisionIds = new Set(
    input.observations.map((observation) => observation.rawRevisionId),
  );
  if (outcomeIds.size !== 1) throw new Error("One D04 request cannot combine different outcomes");
  if (rawRevisionIds.size !== 1)
    throw new Error("One D04 request cannot combine different raw revisions");

  const countsByPairCondition = new Map<string, number>();
  const conditionsByPair = new Map<string, Set<string>>();
  const engineObservations = input.observations
    .filter((observation) => allowedConditions.has(observation.conditionId))
    .map((observation) => {
      const unit = unitById.get(observation.unitInstanceId);
      if (!unit || unit.levelId !== design.experimentalUnitLevelId) {
        throw new Error(`Observation ${observation.id} must reference the experimental-unit level`);
      }
      const pairId = design.pairing.kind === "matched" ? unit.id : unit.parentUnitId;
      if (!pairId) {
        throw new Error(
          `D04 observation ${observation.id} is missing its matched unit or block ID`,
        );
      }
      const key = `${pairId}\u0000${observation.conditionId}`;
      countsByPairCondition.set(key, (countsByPairCondition.get(key) ?? 0) + 1);
      const pairConditions = conditionsByPair.get(pairId) ?? new Set<string>();
      pairConditions.add(observation.conditionId);
      conditionsByPair.set(pairId, pairConditions);
      return {
        observationId: observation.id,
        conditionId: observation.conditionId,
        value: numericValue(observation),
        experimentalUnitId: unit.id,
        pairId,
        ...(design.pairing.kind === "blocked" ? { blockId: pairId } : {}),
      };
    });

  if ([...countsByPairCondition.values()].some((count) => count !== 1)) {
    throw new Error("Each D04 matched unit requires exactly one analyzed value per condition");
  }
  if (conditionsByPair.size < 2) {
    throw new Error("D04 requires at least two complete matched units");
  }
  for (const [pairId, conditions] of conditionsByPair) {
    if (conditions.size !== conditionIds.length) {
      throw new Error(`D04 matched unit ${pairId} must contain every declared condition`);
    }
  }

  return AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.3.0",
    requestId: input.requestId,
    projectId: input.projectId,
    analysisId: input.analysisId,
    templateId: "D04",
    templateVersion: input.recommendation.templateVersion,
    method: "repeated_measures_anova",
    conditionIds,
    primaryContrastConditionIds:
      design.primaryContrast?.conditionIds ??
      (() => {
        throw new Error("D04 requires an explicit primary contrast");
      })(),
    observations: engineObservations,
    options: {
      alternative: "two_sided",
      confidenceLevel: input.confidenceLevel ?? 0.95,
      multiplicityMethod: "holm_paired_all_pairs",
    },
  });
}
