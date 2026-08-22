import type { ExperimentDesign } from "@lsaa/domain";

import type { AnalysisRecommendation } from "./contracts";

export const D04_RULE_VERSION = "0.1.0" as const;

export type D04MatchResult =
  | { matched: true; recommendation: AnalysisRecommendation }
  | { matched: false; reasonCode: string; explanation: string };

/** Matches one-factor designs with 3+ complete measurements from every matched unit/block. */
export function recommendD04(design: ExperimentDesign): D04MatchResult {
  if (design.conditions.length < 3) {
    return {
      matched: false,
      reasonCode: "requires_three_or_more_conditions",
      explanation: "D04 requires at least three repeated conditions.",
    };
  }
  if (design.factors.length !== 1) {
    return {
      matched: false,
      reasonCode: "requires_exactly_one_factor",
      explanation: "D04 is limited to one repeated experimental factor.",
    };
  }
  if (design.pairing.kind === "independent") {
    return {
      matched: false,
      reasonCode: "requires_matched_or_blocked_units",
      explanation: "D04 requires the same matched unit or complete block in every condition.",
    };
  }
  if (!design.pairing.completePairsRequired) {
    return {
      matched: false,
      reasonCode: "requires_complete_repeated_units",
      explanation: "The first D04 implementation accepts complete repeated measurements only.",
    };
  }

  return {
    matched: true,
    recommendation: {
      templateId: "D04",
      templateVersion: D04_RULE_VERSION,
      recommendedMethod: "repeated_measures_anova",
      alternativeMethods: ["friedman"],
      reasonCode: "three_or_more_complete_matched_groups",
      explanation:
        "Every matched unit contributes one value to every condition. Repeated-measures ANOVA is followed by multiplicity-adjusted paired comparisons.",
      statisticalNDefinition:
        design.pairing.kind === "matched"
          ? `Complete matched units at level ${design.pairing.matchLevelId}`
          : `Complete blocks at level ${design.pairing.blockLevelId}`,
      multiplicityMethod: "holm_paired_all_pairs",
    },
  };
}
