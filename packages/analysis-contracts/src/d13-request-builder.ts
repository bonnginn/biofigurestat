import { AnalysisEngineRequestSchema, type AnalysisEngineRequest } from "./contracts";

export type CategoricalRepeatedStateRow = Readonly<{
  observationId: string;
  conditionId: string;
  biologicalUnitId: string;
  stateLevelId: string;
  value: number;
}>;

/** Builds a repeated categorical-state contract with no fabricated numeric time. */
export function createD13EngineRequest(
  input: Readonly<{
    requestId: string;
    projectId: string;
    analysisId: string;
    conditionIds: readonly string[];
    factorTitle: string;
    states: readonly Readonly<{ id: string; label: string; order: number }>[];
    observations: readonly CategoricalRepeatedStateRow[];
    confidenceLevel?: number;
  }>,
): AnalysisEngineRequest {
  const stateIds = new Set(input.states.map(({ id }) => id));
  const conditionIds = new Set(input.conditionIds);
  const seen = new Set<string>();
  const unitCondition = new Map<string, string>();
  input.observations.forEach((row) => {
    if (!conditionIds.has(row.conditionId) || !stateIds.has(row.stateLevelId))
      throw new Error("Repeated-state row references an undeclared condition or state");
    const previous = unitCondition.get(row.biologicalUnitId);
    if (previous && previous !== row.conditionId)
      throw new Error("A stable repeated-state unit cannot cross independent conditions");
    unitCondition.set(row.biologicalUnitId, row.conditionId);
    const key = `${row.biologicalUnitId}\u0000${row.stateLevelId}`;
    if (seen.has(key))
      throw new Error("Each biological unit can contribute one value per repeated state");
    seen.add(key);
  });
  for (const [unitId] of unitCondition) {
    if (input.states.some(({ id }) => !seen.has(`${unitId}\u0000${id}`)))
      throw new Error(`Repeated-state unit ${unitId} is incomplete`);
  }
  return AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.10.0",
    requestId: input.requestId,
    projectId: input.projectId,
    analysisId: input.analysisId,
    templateId: "D13",
    templateVersion: "0.1.0",
    method: "mixed_anova",
    conditionIds: [...input.conditionIds],
    withinFactor: { role: "categorical", title: input.factorTitle, unit: "" },
    stateLevels: [...input.states]
      .sort((a, b) => a.order - b.order)
      .map(({ id, label, order }) => ({ levelId: id, label, order })),
    observations: input.observations.map((row) => ({
      observationId: row.observationId,
      conditionId: row.conditionId,
      value: row.value,
      experimentalUnitId: row.biologicalUnitId,
      pairId: row.biologicalUnitId,
      stateLevelId: row.stateLevelId,
    })),
    options: {
      alternative: "two_sided",
      confidenceLevel: input.confidenceLevel ?? 0.95,
      multiplicityMethod: null,
    },
  });
}
