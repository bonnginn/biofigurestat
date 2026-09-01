import { z } from "zod";

export const EquivalenceMarginScaleSchema = z.enum([
  "raw_difference",
  "percentage_point_difference",
]);

export const EquivalenceMarginSchema = z
  .object({
    scale: EquivalenceMarginScaleSchema,
    lowerBound: z.number().finite(),
    upperBound: z.number().finite(),
    unit: z.string().trim().min(1),
    rationale: z.string().trim().min(1).optional(),
    /** Researcher attestation; the application never derives a margin from observed data. */
    declaredAsPrespecified: z.literal(true),
  })
  .superRefine((margin, context) => {
    if (margin.lowerBound >= 0) {
      context.addIssue({
        code: "custom",
        path: ["lowerBound"],
        message: "An equivalence interval around no difference requires a negative lower bound",
      });
    }
    if (margin.upperBound <= 0) {
      context.addIssue({
        code: "custom",
        path: ["upperBound"],
        message: "An equivalence interval around no difference requires a positive upper bound",
      });
    }
    if (margin.lowerBound >= margin.upperBound) {
      context.addIssue({
        code: "custom",
        path: ["upperBound"],
        message: "The upper equivalence bound must be greater than the lower bound",
      });
    }
  });

export const EquivalenceClaimModeSchema = z.enum([
  "single_primary_comparison",
  "all_selected_comparisons",
  "individual_comparison_claims",
]);

export const EquivalenceAnalysisPlanSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    margin: EquivalenceMarginSchema,
    alpha: z.literal(0.05).default(0.05),
    claimMode: EquivalenceClaimModeSchema,
    primaryComparisonId: z.string().trim().min(1).optional(),
  })
  .superRefine((plan, context) => {
    if (plan.claimMode === "single_primary_comparison" && !plan.primaryComparisonId) {
      context.addIssue({
        code: "custom",
        path: ["primaryComparisonId"],
        message: "A single-primary equivalence plan requires one prespecified comparison",
      });
    }
    if (plan.claimMode !== "single_primary_comparison" && plan.primaryComparisonId) {
      context.addIssue({
        code: "custom",
        path: ["primaryComparisonId"],
        message: "A primary comparison ID is valid only for a single-primary claim",
      });
    }
  });

export const EquivalenceConclusionSchema = z.enum([
  "equivalence_supported",
  "meaningful_difference_supported",
  "inconclusive",
]);

export const EquivalenceIntervalEvidenceSchema = z
  .object({
    plan: EquivalenceAnalysisPlanSchema,
    estimate: z.number().finite(),
    lowerConfidenceBound: z.number().finite(),
    upperConfidenceBound: z.number().finite(),
    confidenceLevel: z.number().gt(0).lt(1),
  })
  .superRefine((evidence, context) => {
    if (evidence.lowerConfidenceBound > evidence.estimate) {
      context.addIssue({
        code: "custom",
        path: ["lowerConfidenceBound"],
        message: "The lower confidence bound cannot exceed the estimate",
      });
    }
    if (evidence.upperConfidenceBound < evidence.estimate) {
      context.addIssue({
        code: "custom",
        path: ["upperConfidenceBound"],
        message: "The upper confidence bound cannot be below the estimate",
      });
    }
    const requiredConfidenceLevel = 1 - 2 * evidence.plan.alpha;
    if (Math.abs(evidence.confidenceLevel - requiredConfidenceLevel) > 1e-12) {
      context.addIssue({
        code: "custom",
        path: ["confidenceLevel"],
        message: `TOST evidence at alpha ${evidence.plan.alpha} requires an equal-tail ${requiredConfidenceLevel} confidence interval`,
      });
    }
  });

export type EquivalenceMargin = z.infer<typeof EquivalenceMarginSchema>;
export type EquivalenceAnalysisPlan = z.infer<typeof EquivalenceAnalysisPlanSchema>;
export type EquivalenceConclusion = z.infer<typeof EquivalenceConclusionSchema>;
export type EquivalenceIntervalEvidence = z.infer<typeof EquivalenceIntervalEvidenceSchema>;

/**
 * Interprets already-computed equal-tail interval evidence. It does not estimate a model,
 * choose a margin, infer pairing, or convert counts to percentages.
 */
export function assessEquivalenceInterval(
  input: EquivalenceIntervalEvidence,
): EquivalenceConclusion {
  const evidence = EquivalenceIntervalEvidenceSchema.parse(input);
  const { lowerBound, upperBound } = evidence.plan.margin;
  if (
    evidence.lowerConfidenceBound > lowerBound &&
    evidence.upperConfidenceBound < upperBound
  ) {
    return "equivalence_supported";
  }
  if (
    evidence.upperConfidenceBound < lowerBound ||
    evidence.lowerConfidenceBound > upperBound
  ) {
    return "meaningful_difference_supported";
  }
  return "inconclusive";
}

export const EquivalenceComparisonResultSchema = z
  .object({
    comparisonId: z.string().trim().min(1),
    estimate: z.number().finite(),
    standardError: z.number().finite().positive(),
    lowerConfidenceBound: z.number().finite(),
    upperConfidenceBound: z.number().finite(),
    confidenceLevel: z.number().gt(0).lt(1),
    lowerOneSidedPValue: z.number().min(0).max(1),
    upperOneSidedPValue: z.number().min(0).max(1),
    tostPValue: z.number().min(0).max(1),
    conclusion: EquivalenceConclusionSchema,
  })
  .superRefine((comparison, context) => {
    const expectedTostPValue = Math.max(
      comparison.lowerOneSidedPValue,
      comparison.upperOneSidedPValue,
    );
    if (Math.abs(comparison.tostPValue - expectedTostPValue) > 1e-12) {
      context.addIssue({
        code: "custom",
        path: ["tostPValue"],
        message: "The TOST p-value must be the larger of the two one-sided p-values",
      });
    }
  });

export const EquivalenceAnalysisResultSchema = z
  .object({
    resultVersion: z.literal("0.1.0"),
    plan: EquivalenceAnalysisPlanSchema,
    comparisons: z.array(EquivalenceComparisonResultSchema).min(1),
  })
  .superRefine((result, context) => {
    const seen = new Set<string>();
    result.comparisons.forEach((comparison, index) => {
      if (seen.has(comparison.comparisonId)) {
        context.addIssue({
          code: "custom",
          path: ["comparisons", index, "comparisonId"],
          message: "Equivalence comparison IDs must be unique",
        });
      }
      seen.add(comparison.comparisonId);
      const evidence = EquivalenceIntervalEvidenceSchema.safeParse({
        plan: result.plan,
        estimate: comparison.estimate,
        lowerConfidenceBound: comparison.lowerConfidenceBound,
        upperConfidenceBound: comparison.upperConfidenceBound,
        confidenceLevel: comparison.confidenceLevel,
      });
      if (!evidence.success) {
        evidence.error.issues.forEach((issue) => {
          context.addIssue({
            code: "custom",
            path: ["comparisons", index, ...issue.path],
            message: issue.message,
          });
        });
      } else if (assessEquivalenceInterval(evidence.data) !== comparison.conclusion) {
        context.addIssue({
          code: "custom",
          path: ["comparisons", index, "conclusion"],
          message: "The equivalence conclusion must match the prespecified bounds and interval",
        });
      }
    });
    if (
      result.plan.claimMode === "single_primary_comparison" &&
      (result.comparisons.length !== 1 ||
        result.comparisons[0]?.comparisonId !== result.plan.primaryComparisonId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["comparisons"],
        message: "A single-primary result must contain exactly its prespecified comparison",
      });
    }
  });

export type EquivalenceComparisonResult = z.infer<
  typeof EquivalenceComparisonResultSchema
>;
export type EquivalenceAnalysisResult = z.infer<typeof EquivalenceAnalysisResultSchema>;
