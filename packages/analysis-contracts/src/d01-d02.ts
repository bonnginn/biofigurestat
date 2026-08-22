import type { ExperimentDesign } from "@lsaa/domain";
import type { AnalysisRecommendation } from "./contracts";

export const D01_D02_RULE_VERSION = "0.1.0" as const;

export type D01D02MatchResult =
  | { matched: true; recommendation: AnalysisRecommendation }
  | { matched: false; reasonCode: string; explanation: string };

export function recommendD01OrD02(design: ExperimentDesign): D01D02MatchResult {
  if (design.conditions.length !== 2) {
    return {
      matched: false,
      reasonCode: "requires_exactly_two_conditions",
      explanation: "D01 and D02 apply only when exactly two conditions are compared.",
    };
  }

  if (design.pairing.kind === "independent") {
    return {
      matched: true,
      recommendation: {
        templateId: "D01",
        templateVersion: D01_D02_RULE_VERSION,
        recommendedMethod: "welch_t",
        alternativeMethods: ["mann_whitney", "student_t"],
        reasonCode: "two_independent_condition_groups",
        explanation:
          "The two conditions were assigned to separate experimental units without an explicit matched or blocked correspondence.",
        statisticalNDefinition: `Independent units at level ${design.experimentalUnitLevelId}`,
      },
    };
  }

  return {
    matched: true,
    recommendation: {
      templateId: "D02",
      templateVersion: D01_D02_RULE_VERSION,
      recommendedMethod: "paired_t",
      alternativeMethods: ["wilcoxon_signed_rank"],
      reasonCode:
        design.pairing.kind === "matched"
          ? "same_or_matched_unit_in_both_conditions"
          : "explicit_complete_block_correspondence",
      explanation:
        design.pairing.kind === "matched"
          ? "Each independent matched unit contributes one value to both conditions."
          : "The design explicitly requests a complete block-by-block comparison across conditions.",
      statisticalNDefinition:
        design.pairing.kind === "matched"
          ? `Independent matched units at level ${design.pairing.matchLevelId}`
          : `Independent complete blocks at level ${design.pairing.blockLevelId}`,
    },
  };
}
