import type { ExperimentDesign, Observation, UnitInstance } from "@lsaa/domain";

import { AnalysisEngineRequestSchema, type AnalysisEngineRequest } from "./contracts";

export type D11RequestInput = Readonly<{
  requestId: string;
  projectId: string;
  analysisId: string;
  design: ExperimentDesign;
  observations: Observation[];
  unitInstances: UnitInstance[];
  outcomeId: string;
  confidenceLevel?: number;
}>;

/** Builds a survival request without converting censoring into missing/scalar values. */
export function createD11EngineRequest(input: D11RequestInput): AnalysisEngineRequest {
  const outcome = input.design.outcomes.find(({ id }) => id === input.outcomeId);
  if (!outcome || outcome.type !== "time_to_event") {
    throw new Error("D11 requires an explicit time-to-event outcome");
  }
  if (input.design.conditions.length < 2 || input.design.pairing.kind !== "independent") {
    throw new Error("D11 log-rank Core requires two or more independent groups");
  }
  const conditionIds = input.design.conditions.map(({ id }) => id);
  const allowedConditions = new Set(conditionIds);
  const unitById = new Map(input.unitInstances.map((unit) => [unit.id, unit]));
  const seenUnits = new Set<string>();
  const rows = input.observations
    .filter(({ outcomeId }) => outcomeId === input.outcomeId)
    .map((observation) => {
      if (!allowedConditions.has(observation.conditionId)) {
        throw new Error(`Survival observation ${observation.id} references an unknown group`);
      }
      const unit = unitById.get(observation.unitInstanceId);
      if (!unit || unit.levelId !== input.design.experimentalUnitLevelId || unit.parentUnitId) {
        throw new Error(
          `Survival observation ${observation.id} must reference one biological unit`,
        );
      }
      if (seenUnits.has(unit.id)) throw new Error(`Duplicate survival unit ID ${unit.id}`);
      seenUnits.add(unit.id);
      if (observation.measurement.kind !== "time_to_event") {
        throw new Error("D11 does not accept ordinary continuous measurements");
      }
      return {
        observationId: observation.id,
        conditionId: observation.conditionId,
        experimentalUnitId: unit.id,
        followUpTime: observation.measurement.followUpTime,
        eventObserved: observation.measurement.eventObserved,
      };
    });
  conditionIds.forEach((conditionId) => {
    if (!rows.some((row) => row.conditionId === conditionId)) {
      throw new Error(`Survival group ${conditionId} has zero usable observations`);
    }
  });
  return AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.8.0",
    requestId: input.requestId,
    projectId: input.projectId,
    analysisId: input.analysisId,
    templateId: "D11",
    templateVersion: "0.1.0",
    method: "log_rank",
    conditionIds,
    observations: rows,
    options: {
      alternative: "two_sided",
      confidenceLevel: input.confidenceLevel ?? 0.95,
      multiplicityMethod: null,
    },
  });
}
