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

export type D05RequestInput = {
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

/** Builds complete-factorial protocol 0.4 input from independent biological units only. */
export function createD05EngineRequest(input: D05RequestInput): AnalysisEngineRequest {
  if (input.recommendation.templateId !== "D05") {
    throw new Error("The D05 request builder received a different analysis template");
  }
  const { design } = input;
  if (design.factors.length !== 2 || design.pairing.kind !== "independent") {
    throw new Error("D05 requires exactly two factors and independent experimental units");
  }
  const [factorA, factorB] = design.factors;
  const conditions = design.conditions.map((condition) => ({
    conditionId: condition.id,
    factorALevelId: condition.factorLevels[factorA.id],
    factorBLevelId: condition.factorLevels[factorB.id],
  }));
  if (conditions.some((condition) => !condition.factorALevelId || !condition.factorBLevelId)) {
    throw new Error("Every D05 condition must identify one level from each factor");
  }
  const expectedCellCount = factorA.levels.length * factorB.levels.length;
  const cellKeys = new Set(
    conditions.map((condition) => `${condition.factorALevelId}\u0000${condition.factorBLevelId}`),
  );
  if (conditions.length !== expectedCellCount || cellKeys.size !== expectedCellCount) {
    throw new Error("D05 requires one condition for every factorial cell");
  }

  const allowedConditions = new Set(conditions.map((condition) => condition.conditionId));
  const unitById = new Map(input.unitInstances.map((unit) => [unit.id, unit]));
  const outcomeIds = new Set(input.observations.map((observation) => observation.outcomeId));
  const rawRevisionIds = new Set(
    input.observations.map((observation) => observation.rawRevisionId),
  );
  if (outcomeIds.size !== 1) throw new Error("One D05 request cannot combine different outcomes");
  if (rawRevisionIds.size !== 1) throw new Error("One D05 request cannot combine raw revisions");
  const seenUnits = new Set<string>();
  const countByCondition = new Map(conditions.map((condition) => [condition.conditionId, 0]));
  const engineObservations = input.observations
    .filter((observation) => allowedConditions.has(observation.conditionId))
    .map((observation) => {
      const unit = unitById.get(observation.unitInstanceId);
      if (!unit || unit.levelId !== design.experimentalUnitLevelId || unit.parentUnitId !== null) {
        throw new Error(
          `D05 observation ${observation.id} must reference a non-nested experimental unit`,
        );
      }
      if (seenUnits.has(unit.id)) {
        throw new Error(`Independent D05 unit ${unit.id} can contribute only one analyzed value`);
      }
      seenUnits.add(unit.id);
      countByCondition.set(
        observation.conditionId,
        (countByCondition.get(observation.conditionId) ?? 0) + 1,
      );
      return {
        observationId: observation.id,
        conditionId: observation.conditionId,
        value: numericValue(observation),
        experimentalUnitId: unit.id,
      };
    });
  for (const [conditionId, count] of countByCondition) {
    if (count < 2)
      throw new Error(`D05 condition ${conditionId} requires at least two biological units`);
  }

  return AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.4.0",
    requestId: input.requestId,
    projectId: input.projectId,
    analysisId: input.analysisId,
    templateId: "D05",
    templateVersion: input.recommendation.templateVersion,
    method: "two_way_anova",
    factors: [
      {
        factorId: factorA.id,
        levelIds: factorA.levels.map((level) => level.id),
        ...(factorA.levelGroups?.length
          ? {
              levelGroups: factorA.levelGroups.map((group) => ({
                groupId: group.id,
                levelIds: factorA.levels
                  .filter((level) => level.groupId === group.id)
                  .map((level) => level.id),
              })),
            }
          : {}),
      },
      {
        factorId: factorB.id,
        levelIds: factorB.levels.map((level) => level.id),
        ...(factorB.levelGroups?.length
          ? {
              levelGroups: factorB.levelGroups.map((group) => ({
                groupId: group.id,
                levelIds: factorB.levels
                  .filter((level) => level.groupId === group.id)
                  .map((level) => level.id),
              })),
            }
          : {}),
      },
    ],
    conditions,
    primaryContrastConditionIds:
      design.primaryContrast?.conditionIds ??
      (() => {
        throw new Error("D05 requires an explicit primary contrast");
      })(),
    observations: engineObservations,
    options: {
      alternative: "two_sided",
      confidenceLevel: input.confidenceLevel ?? 0.95,
      multiplicityMethod: "holm_all_cell_pairs",
    },
  });
}
