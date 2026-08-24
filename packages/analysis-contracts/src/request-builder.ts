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

export type D01D02RequestInput = {
  requestId: string;
  projectId: string;
  analysisId: string;
  design: ExperimentDesign;
  recommendation: AnalysisRecommendation;
  observations: Observation[];
  unitInstances: UnitInstance[];
  alternative?: "two_sided" | "less" | "greater";
  confidenceLevel?: number;
  selectedMethod?: AnalysisRecommendation["recommendedMethod"];
};

function numericValue(observation: Observation): number {
  return measurementNumericValue(observation.measurement);
}

export function createD01D02EngineRequest(input: D01D02RequestInput): AnalysisEngineRequest {
  const { design, recommendation } = input;
  if (recommendation.templateId !== "D01" && recommendation.templateId !== "D02") {
    throw new Error("The D01/D02 request builder received a different analysis template");
  }
  if (design.conditions.length !== 2) {
    throw new Error("D01/D02 engine requests require exactly two conditions");
  }
  const allowedMethods =
    recommendation.templateId === "D01"
      ? new Set(["welch_t", "student_t", "mann_whitney"])
      : new Set(["paired_t", "wilcoxon_signed_rank"]);
  const method = input.selectedMethod ?? recommendation.recommendedMethod;
  if (!allowedMethods.has(method)) {
    throw new Error(`Method ${method} is not executable for ${recommendation.templateId}`);
  }

  if (!design.primaryContrast) throw new Error("D01/D02 requires an explicit primary contrast");
  const conditionIds = design.primaryContrast.conditionIds;
  const allowedConditions = new Set(conditionIds);
  const unitById = new Map(input.unitInstances.map((unit) => [unit.id, unit]));
  const conditionsByUnit = new Map<string, Set<string>>();
  const countsByUnitCondition = new Map<string, number>();
  const outcomeIds = new Set(input.observations.map((observation) => observation.outcomeId));
  const rawRevisionIds = new Set(
    input.observations.map((observation) => observation.rawRevisionId),
  );
  if (outcomeIds.size !== 1) {
    throw new Error("One analysis request cannot combine different outcomes");
  }
  if (rawRevisionIds.size !== 1) {
    throw new Error("One analysis request cannot combine different raw revisions");
  }

  const engineObservations = input.observations
    .filter((observation) => allowedConditions.has(observation.conditionId))
    .map((observation) => {
      const unit = unitById.get(observation.unitInstanceId);
      if (!unit || unit.levelId !== design.experimentalUnitLevelId) {
        throw new Error(
          `Observation ${observation.id} must reference a declared experimental unit before D01/D02 analysis`,
        );
      }
      if (design.pairing.kind !== "blocked" && unit.parentUnitId !== null) {
        throw new Error(
          `Observation ${observation.id} cannot promote a nested unit to biological n`,
        );
      }

      const unitConditions = conditionsByUnit.get(unit.id) ?? new Set<string>();
      unitConditions.add(observation.conditionId);
      conditionsByUnit.set(unit.id, unitConditions);
      const unitConditionKey = `${unit.id}\u0000${observation.conditionId}`;
      countsByUnitCondition.set(
        unitConditionKey,
        (countsByUnitCondition.get(unitConditionKey) ?? 0) + 1,
      );

      const pairId =
        design.pairing.kind === "matched"
          ? unit.id
          : design.pairing.kind === "blocked"
            ? unit.parentUnitId
            : null;
      if (design.pairing.kind === "blocked" && !pairId) {
        throw new Error(`Blocked observation ${observation.id} is missing its parent block`);
      }

      return {
        observationId: observation.id,
        conditionId: observation.conditionId,
        value: numericValue(observation),
        experimentalUnitId: unit.id,
        ...(pairId ? { pairId, blockId: pairId } : {}),
      };
    });

  if (recommendation.templateId === "D01") {
    if ([...countsByUnitCondition.values()].some((count) => count !== 1)) {
      throw new Error("Each independent D01 unit can contribute only one analyzed value");
    }
    for (const [unitId, conditions] of conditionsByUnit) {
      if (conditions.size > 1) {
        throw new Error(
          `Independent-group unit ${unitId} cannot contribute observations to both conditions`,
        );
      }
    }
  } else {
    const conditionsByPair = new Map<string, Set<string>>();
    const countsByPairCondition = new Map<string, number>();
    engineObservations.forEach((observation) => {
      if (!observation.pairId)
        throw new Error("D02 observations require an explicit matched unit or block");
      const pairConditions = conditionsByPair.get(observation.pairId) ?? new Set<string>();
      pairConditions.add(observation.conditionId);
      conditionsByPair.set(observation.pairId, pairConditions);
      const pairConditionKey = `${observation.pairId}\u0000${observation.conditionId}`;
      countsByPairCondition.set(
        pairConditionKey,
        (countsByPairCondition.get(pairConditionKey) ?? 0) + 1,
      );
    });
    if ([...countsByPairCondition.values()].some((count) => count !== 1)) {
      throw new Error("Each D02 pair or block requires exactly one analyzed value per condition");
    }
    for (const [pairId, conditions] of conditionsByPair) {
      if (conditions.size !== 2) {
        throw new Error(`Matched unit or block ${pairId} must contain both conditions`);
      }
    }
  }

  return AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.1.0",
    requestId: input.requestId,
    projectId: input.projectId,
    analysisId: input.analysisId,
    templateId: recommendation.templateId,
    templateVersion: recommendation.templateVersion,
    method,
    contrastConditionIds: conditionIds,
    observations: engineObservations,
    options: {
      alternative: input.alternative ?? "two_sided",
      confidenceLevel: input.confidenceLevel ?? 0.95,
      multiplicityMethod: null,
    },
  });
}
