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
