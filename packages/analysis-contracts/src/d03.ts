import type { ExperimentDesign } from "@lsaa/domain";

import type { AnalysisRecommendation } from "./contracts";

export const D03_RULE_VERSION = "0.1.0" as const;

export type D03MatchResult =
  | { matched: true; recommendation: AnalysisRecommendation }
  | { matched: false; reasonCode: string; explanation: string };

/** Matches the bounded Core D03 design: one factor, 3+ independent groups. */
export function recommendD03(design: ExperimentDesign): D03MatchResult {
  if (design.conditions.length < 3) {
    return {
      matched: false,
      reasonCode: "requires_three_or_more_conditions",
      explanation: "D03 requires at least three condition groups.",
    };
  }
  if (design.factors.length !== 1) {
    return {
      matched: false,
      reasonCode: "requires_exactly_one_factor",
      explanation: "D03 is limited to one experimental factor; use D05 for two factors.",
    };
  }
  if (design.pairing.kind !== "independent") {
    return {
      matched: false,
      reasonCode: "requires_independent_units",
      explanation: "D03 requires separate independent experimental units in every group.",
    };
  }

  const factor = design.factors[0];
  const levelIds = new Set(factor.levels.map((level) => level.id));
  const invalidCondition = design.conditions.find((condition) => {
    const assigned = condition.factorLevels[factor.id];
    return !assigned || !levelIds.has(assigned) || Object.keys(condition.factorLevels).length !== 1;
  });
  if (invalidCondition) {
    return {
      matched: false,
      reasonCode: "condition_factor_assignment_invalid",
      explanation: "Every D03 condition must identify exactly one level of the single factor.",
    };
  }

  return {
    matched: true,
    recommendation: {
      templateId: "D03",
      templateVersion: D03_RULE_VERSION,
      recommendedMethod: "welch_anova",
      alternativeMethods: ["one_way_anova", "kruskal_wallis"],
      reasonCode: "three_or_more_independent_groups_one_factor",
      explanation:
        "Three or more groups were assigned to separate experimental units under one factor. Welch ANOVA is the variance-robust default, followed by multiplicity-adjusted all-pairs comparisons.",
      statisticalNDefinition: `Independent units at level ${design.experimentalUnitLevelId}`,
      multiplicityMethod: "games_howell_all_pairs",
    },
  };
}
