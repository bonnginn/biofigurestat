import type { ExperimentDesign } from "@lsaa/domain";

import type { AnalysisRecommendation } from "./contracts";

export const D09_RULE_VERSION = "0.1.0" as const;

export type D09MatchResult =
  | { matched: true; recommendation: AnalysisRecommendation }
  | { matched: false; reasonCode: string; explanation: string };

/** Matches two complete measurements from the same declared experimental unit. */
export function recommendD09(design: ExperimentDesign): D09MatchResult {
  if (design.conditions.length !== 2 || design.outcomes.length !== 1) {
    return {
      matched: false,
      reasonCode: "requires_two_variables_one_outcome",
      explanation: "D09 requires exactly two measurements of one continuous outcome.",
    };
  }
  if (design.outcomes[0].type !== "continuous") {
    return {
      matched: false,
      reasonCode: "requires_continuous_measurements",
      explanation: "D09 requires two continuous variables.",
    };
  }
  if (design.pairing.kind !== "matched" || !design.pairing.completePairsRequired) {
    return {
      matched: false,
      reasonCode: "requires_complete_same_unit_measurements",
      explanation: "Every unit must have both measurements; row order alone never creates a pair.",
    };
  }
  const relationshipForm = design.wizardDecisions.find(
    (decision) => decision.questionId === "correlation.relationship_form",
  )?.answer;
  if (relationshipForm !== "linear" && relationshipForm !== "monotonic_or_ranked") {
    return {
      matched: false,
      reasonCode: "requires_relationship_form_confirmation",
      explanation: "Confirm whether the scientific relationship is linear or monotonic/ranked.",
    };
  }
  const pearson = relationshipForm === "linear";
  return {
    matched: true,
    recommendation: {
      templateId: "D09",
      templateVersion: D09_RULE_VERSION,
      recommendedMethod: pearson ? "pearson" : "spearman",
      alternativeMethods: pearson ? ["spearman"] : ["pearson"],
      reasonCode: pearson
        ? "two_complete_continuous_variables_linear_question"
        : "two_complete_variables_monotonic_or_ranked_question",
      explanation: pearson
        ? "The same experimental units provide two continuous measurements and the stated question is linear association."
        : "The same experimental units provide two measurements and the stated question is monotonic or rank-based association.",
      statisticalNDefinition: `Complete units at level ${design.experimentalUnitLevelId}; each unit contributes one x-y pair`,
      multiplicityMethod: null,
    },
  };
}
