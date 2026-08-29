import type { AnalysisRecommendation } from "./contracts";

export const D07_RULE_VERSION = "0.1.0" as const;

export type D07IndependentAxisDesign = Readonly<{
  conditionCount: number;
  axisLevelCount: number;
  independentUnitsPerCell: readonly number[];
  allExperimentalUnitIdsUnique: boolean;
  axisTitle?: string;
}>;

export type D07MatchResult =
  | { matched: true; recommendation: AnalysisRecommendation }
  | { matched: false; reasonCode: string; explanation: string };

/**
 * Matches the bounded D07 path: a complete, balanced condition-by-axis design
 * in which every cell is made from different experimental units.
 */
export function recommendD07(design: D07IndependentAxisDesign): D07MatchResult {
  if (design.conditionCount < 2 || design.axisLevelCount < 2) {
    return {
      matched: false,
      reasonCode: "requires_condition_by_axis_design",
      explanation: "D07 requires at least two conditions and two ordered-axis levels.",
    };
  }
  if (design.independentUnitsPerCell.length !== design.conditionCount * design.axisLevelCount) {
    return {
      matched: false,
      reasonCode: "requires_complete_condition_by_axis_cells",
      explanation:
        "D07 requires one explicitly represented cell for every condition-by-axis combination.",
    };
  }
  if (!design.allExperimentalUnitIdsUnique) {
    return {
      matched: false,
      reasonCode: "requires_independent_units_in_every_cell",
      explanation:
        "D07 cannot reuse an experimental-unit identity across condition-by-axis cells; repeated identities require a repeated-measurement model.",
    };
  }
  if (
    design.independentUnitsPerCell.some((count) => count < 2) ||
    new Set(design.independentUnitsPerCell).size !== 1
  ) {
    return {
      matched: false,
      reasonCode: "requires_balanced_independent_cells",
      explanation:
        "The initial D07 contract accepts complete balanced cells with at least two independent experimental units per cell.",
    };
  }

  const axisTitle = design.axisTitle?.trim() || "ordered axis";
  return {
    matched: true,
    recommendation: {
      templateId: "D07",
      templateVersion: D07_RULE_VERSION,
      recommendedMethod: "two_way_anova",
      alternativeMethods: [],
      reasonCode: "balanced_independent_condition_by_axis_design",
      explanation: `Every condition-by-${axisTitle} cell uses separate experimental units; interaction and main effects are evaluated with an independent factorial error model.`,
      statisticalNDefinition: `Independent experimental units within each condition-by-${axisTitle} cell`,
      multiplicityMethod: null,
    },
  };
}
