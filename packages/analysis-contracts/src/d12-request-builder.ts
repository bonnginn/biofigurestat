import {
  measurementNumericValue,
  type ExperimentDesign,
  type Observation,
  type UnitInstance,
} from "@lsaa/domain";

import { AnalysisEngineRequestSchema, type AnalysisEngineRequest } from "./contracts";

export type D12RequestInput = Readonly<{
  requestId: string;
  projectId: string;
  analysisId: string;
  design: ExperimentDesign;
  observations: Observation[];
  unitInstances: UnitInstance[];
  nullValue: number;
  confidenceLevel?: number;
  alternative?: "two_sided" | "less" | "greater";
}>;

/** Builds an explicit-reference one-sample request; zero is never assumed. */
export function createD12EngineRequest(input: D12RequestInput): AnalysisEngineRequest {
  if (input.design.conditions.length !== 1 || input.design.primaryContrast !== null) {
    throw new Error("D12 requires one cohort and no artificial comparison group");
  }
  if (!Number.isFinite(input.nullValue))
    throw new Error("D12 requires an explicit finite null value");
  const conditionId = input.design.conditions[0]!.id;
  const unitById = new Map(input.unitInstances.map((unit) => [unit.id, unit]));
  const seenUnits = new Set<string>();
  const rows = input.observations.map((observation) => {
    const unit = unitById.get(observation.unitInstanceId);
    if (
      observation.conditionId !== conditionId ||
      !unit ||
      unit.levelId !== input.design.experimentalUnitLevelId ||
      unit.parentUnitId
    ) {
      throw new Error(
        `D12 observation ${observation.id} must reference the single cohort unit level`,
      );
    }
    if (seenUnits.has(unit.id))
      throw new Error(`Each D12 biological unit contributes one value (${unit.id})`);
    seenUnits.add(unit.id);
    return {
      observationId: observation.id,
      conditionId,
      experimentalUnitId: unit.id,
      value: measurementNumericValue(observation.measurement),
    };
  });
  return AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.9.0",
    requestId: input.requestId,
    projectId: input.projectId,
    analysisId: input.analysisId,
    templateId: "D12",
    templateVersion: "0.1.0",
    method: "one_sample_t",
    conditionId,
    nullValue: input.nullValue,
    observations: rows,
    options: {
      alternative: input.alternative ?? "two_sided",
      confidenceLevel: input.confidenceLevel ?? 0.95,
      multiplicityMethod: null,
    },
  });
}
