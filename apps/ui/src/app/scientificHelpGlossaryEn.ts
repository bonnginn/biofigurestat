import type { ScientificHelpTopicId } from "./scientificHelpGlossary";

export type EnglishScientificHelpText = Readonly<{
  title: string;
  summary: string;
  limitation?: string;
}>;

export const englishScientificHelpText: Readonly<
  Record<ScientificHelpTopicId, EnglishScientificHelpText>
> = {
  "biological-replicate": {
    title: "Biological replicate",
    summary: "An independently performed or obtained replicate representing biological variation.",
    limitation: "Multiple cells or fields from the same sample are usually not separate biological replicates.",
  },
  "technical-replicate": {
    title: "Technical replicate",
    summary: "Repeated measurement of the same experimental unit to assess measurement-process variation.",
    limitation: "More technical measurements do not automatically increase biological n.",
  },
  "experimental-unit": {
    title: "Experimental unit",
    summary: "The smallest unit independently assigned to a treatment and treated as independent for inference.",
    limitation: "Whether a cell, field, well, dish, or animal is the unit depends on how treatments were assigned.",
  },
  "biological-n": {
    title: "Biological n",
    summary: "The number of experimental units counted as independent biological information in the analysis.",
    limitation: "Counting lower-level observations from one unit as separate n overstates certainty.",
  },
  paired: {
    title: "Paired design",
    summary: "A design comparing the same experimental unit, or explicitly matched units, across conditions.",
    limitation: "Measurements made on the same day are not automatically paired; a stable matched identity is required.",
  },
  independent: {
    title: "Independent design",
    summary: "Experimental units in different conditions do not overlap and are not matched.",
    limitation: "A shared source sample or batch may imply hierarchy or blocking rather than complete independence.",
  },
  nested: {
    title: "Nested structure",
    summary: "Lower-level observations belong to a higher-level experimental unit, such as cells within a dish.",
    limitation: "Treating every lower-level observation as independent n creates pseudoreplication.",
  },
  "repeated-measures": {
    title: "Repeated measures",
    summary: "The same experimental units are measured across multiple conditions, states, or time points.",
    limitation: "Identity and the location of missing measurements must be preserved.",
  },
  longitudinal: {
    title: "Longitudinal design",
    summary: "The same experimental units are followed over time to observe trajectories of change.",
    limitation: "Measurements within a unit are not independent, so analyses that ignore identity may be inappropriate.",
  },
  "cross-sectional": {
    title: "Cross-sectional design",
    summary: "Different experimental units are measured at each time point.",
    limitation: "This design cannot be interpreted as directly tracking change within the same subject.",
  },
  sd: {
    title: "SD (standard deviation)",
    summary: "Describes how widely observations vary around their mean.",
    limitation: "SD describes the data, not the precision of the estimated mean.",
  },
  sem: {
    title: "SEM (standard error of the mean)",
    summary: "Describes the estimated precision of a sample mean, commonly calculated as SD divided by √n.",
    limitation: "SEM does not describe variation among individual observations.",
  },
  "confidence-interval": {
    title: "Confidence interval",
    summary: "A range expressing uncertainty around an estimate such as an effect size.",
    limitation: "A 95% confidence interval does not mean there is a 95% probability that the fixed true value lies in this particular interval.",
  },
  "welch-t-test": {
    title: "Welch's t-test",
    summary: "Tests a mean difference between two independent groups without assuming equal variances.",
    limitation: "The experimental units must still be independent.",
  },
  "student-t-test": {
    title: "Student's t-test",
    summary: "Tests a mean difference between two independent groups while assuming equal variances.",
    limitation: "Welch's method is generally preferable when the equal-variance assumption is not justified.",
  },
  "paired-t-test": {
    title: "Paired t-test",
    summary: "Tests whether the mean within-pair difference is zero.",
    limitation: "Correct matched identities and a defensible distribution of differences are important.",
  },
  "mann-whitney": {
    title: "Mann–Whitney test",
    summary: "Compares ranks and distributional ordering between two independent groups.",
    limitation: "Without additional assumptions, it is not simply a test of medians.",
  },
  wilcoxon: {
    title: "Wilcoxon signed-rank test",
    summary: "Evaluates within-pair differences using their signs and ranks.",
    limitation: "It cannot be used after matched identities have been lost.",
  },
  "one-way-anova": {
    title: "One-way ANOVA",
    summary: "Tests the global hypothesis that all means are equal across three or more independent groups.",
    limitation: "Planned or multiplicity-adjusted comparisons are needed to identify which groups differ.",
  },
  "welch-anova": {
    title: "Welch's ANOVA",
    summary: "Tests mean differences across three or more independent groups without assuming equal variances.",
    limitation: "Group comparisons require an appropriate procedure such as Games–Howell.",
  },
  tukey: {
    title: "Tukey procedure",
    summary: "Compares every group pair while controlling family-wise type-I error.",
    limitation: "It carries the variance assumptions of the ordinary ANOVA setting.",
  },
  dunnett: {
    title: "Dunnett procedure",
    summary: "A multiple-comparison procedure for comparing several treatments with one control.",
    limitation: "It is not intended for every possible treatment-to-treatment comparison.",
  },
  "games-howell": {
    title: "Games–Howell procedure",
    summary: "Provides adjusted pairwise mean comparisons without assuming equal variances.",
    limitation: "Experimental-unit independence is still required.",
  },
  "holm-correction": {
    title: "Holm correction",
    summary: "Sequentially adjusts multiple p-values to control the overall false-positive risk.",
    limitation: "Power generally decreases as the number of comparisons grows.",
  },
  "repeated-measures-anova": {
    title: "Repeated-measures ANOVA",
    summary: "Tests mean differences across repeated conditions while retaining within-unit matching.",
    limitation: "With three or more conditions, assumptions such as sphericity require attention.",
  },
  sphericity: {
    title: "Sphericity",
    summary: "The assumption that variances of pairwise condition differences are similar.",
    limitation: "Ignoring a violation can make p-values too optimistic; a correction or another model may be needed.",
  },
  auc: {
    title: "AUC",
    summary: "Summarizes response over an interval as area under the curve.",
    limitation: "Different trajectory shapes can have the same AUC, so temporal detail is lost.",
  },
  endpoint: {
    title: "Endpoint",
    summary: "Compares only a prespecified final or particular time point.",
    limitation: "Intermediate trajectories and transient changes are not assessed.",
  },
  "baseline-change": {
    title: "Change from baseline",
    summary: "Calculates and compares each unit's change from its baseline measurement.",
    limitation: "Measurement error in the baseline also contributes to the change score.",
  },
  "f-over-f0": {
    title: "F/F0",
    summary: "Divides each fluorescence value by baseline fluorescence F0 to express relative change.",
    limitation: "The ratio becomes unstable when F0 is unstable or close to zero.",
  },
  pearson: {
    title: "Pearson correlation",
    summary: "Evaluates the strength and direction of a linear association between two continuous variables.",
    limitation: "It is sensitive to nonlinear relationships and strong outliers; correlation does not establish causation.",
  },
  spearman: {
    title: "Spearman rank correlation",
    summary: "Uses ranks to evaluate the strength and direction of a monotonic association.",
    limitation: "Correlation does not establish causation, and extensive ties reduce information.",
  },
  "multiple-comparisons": {
    title: "Multiple comparisons",
    summary: "Controls the increased false-positive risk that occurs when several hypotheses are tested together.",
    limitation: "Choose the adjustment for the scientific comparison goal and avoid unlimited unplanned comparisons.",
  },
};
