import type { ExperimentDesign } from "@lsaa/domain";

import type { AnalysisEngineRequest, AnalysisRecommendation } from "./contracts";
import { recommendD01OrD02 } from "./d01-d02";
import { recommendD03 } from "./d03";
import { recommendD04 } from "./d04";
import { recommendD05 } from "./d05";
import { recommendD06 } from "./d06";
import { recommendD07 } from "./d07";
import { recommendD09 } from "./d09";

export const CORE_WORKSPACE_RECOMMENDATION_TEMPLATES = [
  "D01",
  "D02",
  "D03",
  "D04",
  "D05",
  "D06",
  "D07",
  "D09",
] as const;

type CoreWorkspaceRecommendationTemplate = (typeof CORE_WORKSPACE_RECOMMENDATION_TEMPLATES)[number];

export type AnalysisRequestRecommendationResult =
  | { matched: true; recommendation: AnalysisRecommendation }
  | { matched: false; reasonCode: string; explanation: string };

export type AnalysisRecommendationContext = Readonly<{
  /** Required when a project declares multiple outcomes and this request analyzes only one. */
  outcomeId?: string;
}>;

function mismatch(reasonCode: string, explanation: string): AnalysisRequestRecommendationResult {
  return { matched: false, reasonCode, explanation };
}

function isCoreTemplate(value: string): value is CoreWorkspaceRecommendationTemplate {
  return (CORE_WORKSPACE_RECOMMENDATION_TEMPLATES as readonly string[]).includes(value);
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function scopeDesign(input: {
  design: ExperimentDesign;
  conditionIds: readonly string[];
  outcomeId?: string;
}): ExperimentDesign | null {
  if (new Set(input.conditionIds).size !== input.conditionIds.length) return null;
  const conditionById = new Map(
    input.design.conditions.map((condition) => [condition.id, condition]),
  );
  const conditions = input.conditionIds.map((conditionId) => conditionById.get(conditionId));
  if (conditions.some((condition) => condition === undefined)) return null;

  const outcomes = input.outcomeId
    ? input.design.outcomes.filter(({ id }) => id === input.outcomeId)
    : input.design.outcomes;
  if (input.outcomeId && outcomes.length !== 1) return null;

  const concreteConditions = conditions.filter(
    (condition): condition is ExperimentDesign["conditions"][number] => condition !== undefined,
  );
  const factors = input.design.factors.flatMap((factor) => {
    const assignedLevelIds = new Set(
      concreteConditions.map((condition) => condition.factorLevels[factor.id]).filter(Boolean),
    );
    if (assignedLevelIds.size < 2) return [];
    return [{ ...factor, levels: factor.levels.filter(({ id }) => assignedLevelIds.has(id)) }];
  });

  return {
    ...input.design,
    outcomes,
    factors,
    conditions: concreteConditions,
    primaryContrast:
      input.design.primaryContrast &&
      input.design.primaryContrast.conditionIds.every((conditionId) =>
        input.conditionIds.includes(conditionId),
      )
        ? input.design.primaryContrast
        : null,
    comparisons: input.design.comparisons?.filter((comparison) =>
      comparison.conditionIds.every((conditionId) => input.conditionIds.includes(conditionId)),
    ),
  };
}

function verifyRecommendationVersion(
  request: AnalysisEngineRequest,
  result: AnalysisRequestRecommendationResult,
): AnalysisRequestRecommendationResult {
  if (!result.matched) return result;
  if (result.recommendation.templateId !== request.templateId) {
    return mismatch(
      "request_design_template_mismatch",
      `The request declares ${request.templateId}, but the design matches ${result.recommendation.templateId}.`,
    );
  }
  if (result.recommendation.templateVersion !== request.templateVersion) {
    return mismatch(
      "request_rule_version_mismatch",
      `The request uses ${request.templateVersion}, but the canonical ${request.templateId} rule is ${result.recommendation.templateVersion}.`,
    );
  }
  const executableMethods = [
    result.recommendation.recommendedMethod,
    ...result.recommendation.alternativeMethods,
  ];
  if (!executableMethods.includes(request.method)) {
    return mismatch(
      "request_method_not_declared_for_design",
      `Method ${request.method} is not declared by the canonical ${request.templateId} recommendation.`,
    );
  }
  return result;
}

function recommendD03Request(
  design: ExperimentDesign,
  request: Extract<AnalysisEngineRequest, { protocolVersion: "0.2.0" }>,
): AnalysisRequestRecommendationResult {
  const base = recommendD03(design);
  if (!base.matched) {
    if (
      request.contrastIntent !== "planned_comparisons" ||
      design.pairing.kind !== "independent" ||
      design.conditions.length < 3 ||
      design.factors.length !== 2 ||
      !request.plannedContrastConditionIds?.length
    ) {
      return base;
    }
    const declaredConditions = new Set(design.conditions.map(({ id }) => id));
    if (
      request.plannedContrastConditionIds.some(
        ([firstId, secondId]) =>
          firstId === secondId ||
          !declaredConditions.has(firstId) ||
          !declaredConditions.has(secondId),
      )
    ) {
      return mismatch(
        "planned_comparison_not_declared_by_design",
        "Every planned D03 comparison must reference two different declared condition cells.",
      );
    }
    return {
      matched: true,
      recommendation: {
        templateId: "D03",
        templateVersion: "0.1.0",
        recommendedMethod: "one_way_anova",
        alternativeMethods: [],
        reasonCode: "planned_comparisons_across_independent_condition_cells",
        explanation:
          "Explicitly planned comparisons are evaluated across independent condition cells without reinterpreting them as factorial main effects or interactions.",
        statisticalNDefinition: `Independent units at level ${design.experimentalUnitLevelId} within each declared condition cell`,
        multiplicityMethod: "holm_planned_comparisons",
      },
    };
  }
  if (request.contrastIntent === "all_pairs") return base;

  const multiplicityMethod =
    request.contrastIntent === "control_vs_many"
      ? "dunnett_control_vs_many"
      : request.contrastIntent === "planned_comparisons"
        ? "holm_planned_comparisons"
        : null;
  return {
    matched: true,
    recommendation: {
      ...base.recommendation,
      recommendedMethod: "one_way_anova",
      alternativeMethods: ["welch_anova", "kruskal_wallis"],
      reasonCode:
        request.contrastIntent === "control_vs_many"
          ? "control_vs_many_independent_groups_one_factor"
          : request.contrastIntent === "planned_comparisons"
            ? "planned_comparisons_independent_groups_one_factor"
            : "omnibus_only_independent_groups_one_factor",
      explanation:
        request.contrastIntent === "control_vs_many"
          ? "Three or more independent groups are compared under one factor, with an explicit control-to-many comparison family."
          : request.contrastIntent === "planned_comparisons"
            ? "Three or more independent groups are compared under one factor, using only the explicitly planned comparison family."
            : "Three or more independent groups are compared under one factor with an omnibus-only analysis.",
      multiplicityMethod,
    },
  };
}

function recommendD06Request(
  design: ExperimentDesign,
  request: Extract<AnalysisEngineRequest, { protocolVersion: "0.6.0" }>,
): AnalysisRequestRecommendationResult {
  if (design.pairing.kind !== "independent") {
    return mismatch(
      "requires_independent_between_condition_units",
      "D06 requires independent units between conditions and stable repeated identity within the ordered axis.",
    );
  }
  const repeatedFactor = (design.observationFactors ?? []).find(
    ({ relationship, unitRole }) => relationship?.kind === "repeated" || unitRole === "within_unit",
  );
  if (!repeatedFactor) {
    return mismatch(
      "requires_declared_repeated_observation_factor",
      "D06 requires a declared within-unit repeated observation factor.",
    );
  }

  const timePointIds = request.timePoints.map(({ timePointId }) => timePointId);
  if (new Set(timePointIds).size !== timePointIds.length) {
    return mismatch("duplicate_axis_levels", "D06 ordered-axis level IDs must be unique.");
  }
  const conditionIds = new Set(request.conditionIds);
  const pairIdsAcrossConditions = new Map<string, string>();
  const observationsByConditionAndPair = new Map<string, Set<string>>();
  for (const observation of request.observations) {
    if (
      !conditionIds.has(observation.conditionId) ||
      !timePointIds.includes(observation.timePointId)
    ) {
      return mismatch(
        "observation_outside_declared_d06_cells",
        "Every D06 observation must reference a declared condition and ordered-axis level.",
      );
    }
    if (observation.experimentalUnitId !== observation.pairId) {
      return mismatch(
        "unstable_longitudinal_identity",
        "D06 requires the repeated pair ID to be the stable experimental-unit identity.",
      );
    }
    const existingCondition = pairIdsAcrossConditions.get(observation.pairId);
    if (existingCondition && existingCondition !== observation.conditionId) {
      return mismatch(
        "reused_longitudinal_identity_between_conditions",
        "A D06 stable experimental-unit identity cannot be reused in a different between-unit condition.",
      );
    }
    pairIdsAcrossConditions.set(observation.pairId, observation.conditionId);
    const key = `${observation.conditionId}\u0000${observation.pairId}`;
    const levels = observationsByConditionAndPair.get(key) ?? new Set<string>();
    if (levels.has(observation.timePointId)) {
      return mismatch(
        "duplicate_longitudinal_cell",
        "A D06 stable unit may contribute only one analyzed value at each ordered-axis level.",
      );
    }
    levels.add(observation.timePointId);
    observationsByConditionAndPair.set(key, levels);
  }
  if (
    [...observationsByConditionAndPair.values()].some(
      (levels) => levels.size !== timePointIds.length,
    )
  ) {
    return mismatch(
      "requires_complete_repeated_units",
      "The initial D06 recommendation requires every stable unit to have every ordered-axis level.",
    );
  }
  const completeStableUnitsPerCondition = request.conditionIds.map(
    (conditionId) =>
      [...observationsByConditionAndPair.keys()].filter((key) =>
        key.startsWith(`${conditionId}\u0000`),
      ).length,
  );
  return recommendD06({
    conditionCount: request.conditionIds.length,
    timePointCount: timePointIds.length,
    sampling: "longitudinal",
    completeStableUnitsPerCondition,
    axisTitle: request.withinFactor?.title,
  });
}

function recommendD07Request(
  design: ExperimentDesign,
  request: Extract<AnalysisEngineRequest, { protocolVersion: "0.7.0" }>,
): AnalysisRequestRecommendationResult {
  if (design.pairing.kind !== "independent") {
    return mismatch(
      "requires_independent_condition_by_axis_units",
      "D07 requires separate experimental units in every condition-by-axis cell.",
    );
  }
  const independentObservationFactor = (design.observationFactors ?? []).find(
    ({ relationship, unitRole }) =>
      relationship?.kind === "independent" || unitRole === "between_unit",
  );
  if (!independentObservationFactor) {
    return mismatch(
      "requires_declared_independent_observation_factor",
      "D07 requires the ordered-axis factor to be declared between experimental units.",
    );
  }
  const levelIds = request.withinFactor.levels.map(({ levelId }) => levelId);
  if (new Set(levelIds).size !== levelIds.length) {
    return mismatch("duplicate_axis_levels", "D07 ordered-axis level IDs must be unique.");
  }
  const conditionIds = new Set(request.conditionIds);
  const cells = new Map<string, number>();
  const unitIds = new Set<string>();
  for (const observation of request.observations) {
    if (
      !conditionIds.has(observation.conditionId) ||
      !levelIds.includes(observation.withinFactorLevelId)
    ) {
      return mismatch(
        "observation_outside_declared_d07_cells",
        "Every D07 observation must reference a declared condition and ordered-axis level.",
      );
    }
    const key = `${observation.conditionId}\u0000${observation.withinFactorLevelId}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
    unitIds.add(observation.experimentalUnitId);
  }
  const independentUnitsPerCell = request.conditionIds.flatMap((conditionId) =>
    levelIds.map((levelId) => cells.get(`${conditionId}\u0000${levelId}`) ?? 0),
  );
  return recommendD07({
    conditionCount: request.conditionIds.length,
    axisLevelCount: levelIds.length,
    independentUnitsPerCell,
    allExperimentalUnitIdsUnique: unitIds.size === request.observations.length,
    axisTitle: request.withinFactor.title,
  });
}

/**
 * The single semantic recommendation authority for the experiment workspace.
 * UI copy may translate these facts, but must not reconstruct methods, reason
 * codes, multiplicity, or the statistical-n definition.
 */
export function recommendAnalysisRequest(
  design: ExperimentDesign,
  request: AnalysisEngineRequest,
  context: AnalysisRecommendationContext = {},
): AnalysisRequestRecommendationResult {
  if (!isCoreTemplate(request.templateId)) {
    return mismatch(
      "template_not_owned_by_core_workspace_recommender",
      `Template ${request.templateId} has a separate recommendation contract.`,
    );
  }

  const conditionIds =
    request.protocolVersion === "0.1.0"
      ? request.contrastConditionIds
      : request.protocolVersion === "0.2.0" ||
          request.protocolVersion === "0.3.0" ||
          request.protocolVersion === "0.6.0" ||
          request.protocolVersion === "0.7.0"
        ? request.conditionIds
        : request.protocolVersion === "0.4.0"
          ? request.conditions.map(({ conditionId }) => conditionId)
          : request.protocolVersion === "0.5.0"
            ? request.variableConditionIds
            : [];
  if (conditionIds.length === 0) {
    return mismatch(
      "request_protocol_template_mismatch",
      `Template ${request.templateId} is not valid for protocol ${request.protocolVersion}.`,
    );
  }
  const scopedDesign = scopeDesign({
    design,
    conditionIds,
    ...(context.outcomeId ? { outcomeId: context.outcomeId } : {}),
  });
  if (!scopedDesign) {
    return mismatch(
      "request_scope_not_declared_by_design",
      "The request references a condition or outcome that is not declared by the design.",
    );
  }

  let result: AnalysisRequestRecommendationResult;
  if (request.protocolVersion === "0.1.0") {
    if (request.templateId !== "D01" && request.templateId !== "D02") {
      return mismatch(
        "request_protocol_template_mismatch",
        "Protocol 0.1.0 is restricted to D01 or D02.",
      );
    }
    result = recommendD01OrD02(scopedDesign);
  } else if (request.protocolVersion === "0.2.0") {
    result = recommendD03Request(scopedDesign, request);
  } else if (request.protocolVersion === "0.3.0") {
    result = recommendD04(scopedDesign);
  } else if (request.protocolVersion === "0.4.0") {
    if (
      !sameMembers(
        request.factors.map(({ factorId }) => factorId),
        scopedDesign.factors.map(({ id }) => id),
      ) ||
      request.factors.some((requestFactor) => {
        const designFactor = scopedDesign.factors.find(({ id }) => id === requestFactor.factorId);
        return (
          !designFactor ||
          !sameMembers(
            requestFactor.levelIds,
            designFactor.levels.map(({ id }) => id),
          )
        );
      }) ||
      request.conditions.some((requestCondition) => {
        const designCondition = scopedDesign.conditions.find(
          ({ id }) => id === requestCondition.conditionId,
        );
        return (
          !designCondition ||
          designCondition.factorLevels[request.factors[0].factorId] !==
            requestCondition.factorALevelId ||
          designCondition.factorLevels[request.factors[1].factorId] !==
            requestCondition.factorBLevelId
        );
      })
    ) {
      return mismatch(
        "factorial_request_design_mismatch",
        "The D05 request factor cells do not match the factor levels declared by the design.",
      );
    }
    result = recommendD05(scopedDesign);
  } else if (request.protocolVersion === "0.5.0") {
    if (!context.outcomeId && scopedDesign.outcomes.length !== 1) {
      return mismatch(
        "requires_explicit_outcome_scope",
        "D09 requires the analyzed outcome to be explicit when the design contains multiple outcomes.",
      );
    }
    result = recommendD09(scopedDesign);
  } else if (request.protocolVersion === "0.6.0") {
    result = recommendD06Request(scopedDesign, request);
  } else if (request.protocolVersion === "0.7.0") {
    result = recommendD07Request(scopedDesign, request);
  } else {
    return mismatch(
      "request_protocol_template_mismatch",
      `Template ${request.templateId} is not valid for protocol ${request.protocolVersion}.`,
    );
  }
  return verifyRecommendationVersion(request, result);
}

export class AnalysisRecommendationMismatchError extends Error {
  readonly code = "ENGINE_INPUT_INVALID" as const;
  readonly reasonCode: string;

  constructor(reasonCode: string, explanation: string) {
    super(`${reasonCode}: ${explanation}`);
    this.name = "AnalysisRecommendationMismatchError";
    this.reasonCode = reasonCode;
  }
}

export function requireAnalysisRequestRecommendation(
  design: ExperimentDesign,
  request: AnalysisEngineRequest,
  context: AnalysisRecommendationContext = {},
): AnalysisRecommendation {
  const result = recommendAnalysisRequest(design, request, context);
  if (!result.matched) {
    throw new AnalysisRecommendationMismatchError(result.reasonCode, result.explanation);
  }
  return result.recommendation;
}
