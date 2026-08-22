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

export type D03RequestInput = {
  requestId: string;
  projectId: string;
  analysisId: string;
  design: ExperimentDesign;
  recommendation: AnalysisRecommendation;
  observations: Observation[];
  unitInstances: UnitInstance[];
  controlConditionId?: string;
  confidenceLevel?: number;
  selectedMethod?: "welch_anova" | "one_way_anova" | "kruskal_wallis";
  contrastIntent?: "all_pairs" | "control_vs_many" | "omnibus_only" | "planned_comparisons";
  plannedContrastConditionIds?: Array<[string, string]>;
};

function numericValue(observation: Observation): number {
  return measurementNumericValue(observation.measurement);
}

/** Builds protocol 0.2 input without inferring biological n from subsamples. */
export function createD03EngineRequest(input: D03RequestInput): AnalysisEngineRequest {
  if (input.recommendation.templateId !== "D03") {
    throw new Error("The D03 request builder received a different analysis template");
  }
  if (
    input.design.conditions.length < 3 ||
    input.design.factors.length !== 1 ||
    input.design.pairing.kind !== "independent"
  ) {
    throw new Error("D03 requires three or more independent groups under exactly one factor");
  }

  const conditionIds = input.design.conditions.map((condition) => condition.id);
  const allowedConditions = new Set(conditionIds);
  if (input.controlConditionId && !allowedConditions.has(input.controlConditionId)) {
    throw new Error("The explicit D03 control must be one of the declared conditions");
  }
  const method = input.selectedMethod ?? "welch_anova";
  const contrastIntent = input.contrastIntent ?? "all_pairs";
  if (contrastIntent === "control_vs_many" && !input.controlConditionId) {
    throw new Error("D03 control-vs-many requires an explicit stable control condition ID");
  }
  if (method === "welch_anova" && contrastIntent !== "all_pairs") {
    throw new Error("Welch ANOVA + Games-Howell currently requires all-pairs intent");
  }
  if (method === "kruskal_wallis" && contrastIntent !== "omnibus_only") {
    throw new Error("Kruskal-Wallis is currently an omnibus-only workflow");
  }
  if (contrastIntent === "planned_comparisons") {
    if (!input.plannedContrastConditionIds?.length) {
      throw new Error("D03 planned comparisons require at least one explicit condition pair");
    }
    const seenPairs = new Set<string>();
    for (const [firstId, secondId] of input.plannedContrastConditionIds) {
      if (!allowedConditions.has(firstId) || !allowedConditions.has(secondId)) {
        throw new Error("Every planned D03 comparison must use declared condition IDs");
      }
      if (firstId === secondId) {
        throw new Error("A planned D03 comparison must contain two different conditions");
      }
      const pairKey = [firstId, secondId].sort().join("\u0000");
      if (seenPairs.has(pairKey)) {
        throw new Error("Planned D03 comparisons must not contain duplicate condition pairs");
      }
      seenPairs.add(pairKey);
    }
  }
  const multiplicityMethod =
    method === "welch_anova"
      ? "games_howell_all_pairs"
      : method === "kruskal_wallis" || contrastIntent === "omnibus_only"
        ? null
        : contrastIntent === "control_vs_many"
          ? "dunnett_control_vs_many"
          : contrastIntent === "planned_comparisons"
            ? "holm_planned_comparisons"
            : "tukey_hsd_all_pairs";
  const unitById = new Map(input.unitInstances.map((unit) => [unit.id, unit]));
  const seenUnits = new Set<string>();
  const countByCondition = new Map(conditionIds.map((conditionId) => [conditionId, 0]));
  const outcomeIds = new Set(input.observations.map((observation) => observation.outcomeId));
  const rawRevisionIds = new Set(
    input.observations.map((observation) => observation.rawRevisionId),
  );
  if (outcomeIds.size !== 1) {
    throw new Error("One D03 request cannot combine different outcomes");
  }
  if (rawRevisionIds.size !== 1) {
    throw new Error("One D03 request cannot combine different raw revisions");
  }

  const engineObservations = input.observations
    .filter((observation) => allowedConditions.has(observation.conditionId))
    .map((observation) => {
      const unit = unitById.get(observation.unitInstanceId);
      if (!unit || unit.levelId !== input.design.experimentalUnitLevelId) {
        throw new Error(
          `Observation ${observation.id} must reference the declared experimental-unit level`,
        );
      }
      if (unit.parentUnitId !== null) {
        throw new Error(
          `D03 observation ${observation.id} cannot silently promote a nested or blocked unit to biological n`,
        );
      }
      if (seenUnits.has(unit.id)) {
        throw new Error(`Independent D03 unit ${unit.id} can contribute only one analyzed value`);
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
    if (count < 2) {
      throw new Error(`D03 condition ${conditionId} requires at least two biological units`);
    }
  }

  return AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.2.0",
    requestId: input.requestId,
    projectId: input.projectId,
    analysisId: input.analysisId,
    templateId: "D03",
    templateVersion: input.recommendation.templateVersion,
    method,
    conditionIds,
    controlConditionId: input.controlConditionId,
    contrastIntent,
    plannedContrastConditionIds:
      contrastIntent === "planned_comparisons" ? input.plannedContrastConditionIds : undefined,
    primaryContrastConditionIds: input.design.primaryContrast.conditionIds,
    observations: engineObservations,
    options: {
      alternative: "two_sided",
      confidenceLevel: input.confidenceLevel ?? 0.95,
      multiplicityMethod,
    },
  });
}
