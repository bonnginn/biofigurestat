import type { ExperimentDesign } from "@lsaa/domain";

import type { AnalysisRecommendation } from "./contracts";

export const D05_RULE_VERSION = "0.1.0" as const;

export type D05MatchResult =
  | { matched: true; recommendation: AnalysisRecommendation }
  | { matched: false; reasonCode: string; explanation: string };

/** Matches a complete two-factor factorial design with independent experimental units. */
export function recommendD05(design: ExperimentDesign): D05MatchResult {
  if (design.factors.length !== 2) {
    return {
      matched: false,
      reasonCode: "requires_exactly_two_factors",
      explanation: "D05 requires exactly two experimental factors.",
    };
  }
  if (design.pairing.kind !== "independent") {
    return {
      matched: false,
      reasonCode: "requires_independent_units",
      explanation: "The first D05 implementation accepts independent factorial cells only.",
    };
  }
  const [factorA, factorB] = design.factors;
  const expected = new Set(
    factorA.levels.flatMap((levelA) =>
      factorB.levels.map((levelB) => `${levelA.id}\u0000${levelB.id}`),
    ),
  );
  const seen = new Set<string>();
  for (const condition of design.conditions) {
    const levelA = condition.factorLevels[factorA.id];
    const levelB = condition.factorLevels[factorB.id];
    if (!levelA || !levelB || Object.keys(condition.factorLevels).length !== 2) {
      return {
        matched: false,
        reasonCode: "factorial_assignment_invalid",
        explanation: "Every D05 condition must identify one level from each factor.",
      };
    }
    seen.add(`${levelA}\u0000${levelB}`);
  }
  if (
    design.conditions.length !== expected.size ||
    seen.size !== expected.size ||
    [...expected].some((cell) => !seen.has(cell))
  ) {
    return {
      matched: false,
      reasonCode: "requires_complete_factorial_cells",
      explanation:
        "The first D05 implementation requires every factor-level combination exactly once.",
    };
  }
  return {
    matched: true,
    recommendation: {
      templateId: "D05",
      templateVersion: D05_RULE_VERSION,
      recommendedMethod: "two_way_anova",
      alternativeMethods: [],
      reasonCode: "complete_two_factor_independent_design",
      explanation:
        "All combinations of two factors use independent experimental units. The model reports both main effects and their interaction before adjusted cell comparisons.",
      statisticalNDefinition: `Independent units at level ${design.experimentalUnitLevelId} within each factorial cell`,
      multiplicityMethod: "holm_all_cell_pairs",
    },
  };
}
