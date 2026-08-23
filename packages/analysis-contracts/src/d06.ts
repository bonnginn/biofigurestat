import type { AnalysisRecommendation } from "./contracts";

export const D06_RULE_VERSION = "0.1.0" as const;

export type D06LongitudinalDesign = Readonly<{
  conditionCount: number;
  timePointCount: number;
  sampling: "none" | "cross_sectional" | "longitudinal";
  completeStableUnitsPerCondition: readonly number[];
}>;

export type D06MatchResult =
  | { matched: true; recommendation: AnalysisRecommendation }
  | { matched: false; reasonCode: string; explanation: string };

/** Matches the initial safe D06 path: complete balanced condition-by-time repeated designs. */
export function recommendD06(design: D06LongitudinalDesign): D06MatchResult {
  if (design.sampling !== "longitudinal") {
    return {
      matched: false,
      reasonCode: "requires_longitudinal_identity",
      explanation: "D06 requires the same explicit biological unit at every selected time point.",
    };
  }
  if (design.conditionCount < 2 || design.timePointCount < 2) {
    return {
      matched: false,
      reasonCode: "requires_condition_by_time_design",
      explanation: "D06 requires at least two conditions and two repeated time points.",
    };
  }
  if (
    design.completeStableUnitsPerCondition.some((count) => count < 2) ||
    new Set(design.completeStableUnitsPerCondition).size !== 1
  ) {
    return {
      matched: false,
      reasonCode: "requires_balanced_complete_units",
      explanation:
        "The initial D06 contract accepts complete balanced stable units only; missing or unequal groups require a validated mixed-effects extension.",
    };
  }
  return {
    matched: true,
    recommendation: {
      templateId: "D06",
      templateVersion: D06_RULE_VERSION,
      recommendedMethod: "mixed_anova",
      alternativeMethods: ["mixed_model"],
      reasonCode: "balanced_condition_by_time_repeated_design",
      explanation:
        "Condition is evaluated between biological units, while time and condition-by-time interaction preserve repeated measurements within each stable unit.",
      statisticalNDefinition: "Complete stable biological units within each condition",
      multiplicityMethod: null,
    },
  };
}
