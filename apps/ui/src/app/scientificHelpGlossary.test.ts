import { describe, expect, it } from "vitest";

import {
  helpTopicForMethod,
  scientificHelpTopic,
  scientificHelpTopics,
  type ScientificHelpTopicId,
} from "./scientificHelpGlossary";

describe("scientific Help glossary", () => {
  it("covers the concise Alpha glossary without duplicate IDs", () => {
    const required: readonly ScientificHelpTopicId[] = [
      "biological-replicate",
      "technical-replicate",
      "experimental-unit",
      "biological-n",
      "paired",
      "independent",
      "nested",
      "repeated-measures",
      "longitudinal",
      "cross-sectional",
      "sd",
      "sem",
      "confidence-interval",
      "welch-t-test",
      "student-t-test",
      "paired-t-test",
      "mann-whitney",
      "wilcoxon",
      "one-way-anova",
      "welch-anova",
      "tukey",
      "dunnett",
      "games-howell",
      "holm-correction",
      "repeated-measures-anova",
      "sphericity",
      "auc",
      "endpoint",
      "baseline-change",
      "f-over-f0",
      "pearson",
      "spearman",
      "multiple-comparisons",
    ];
    const ids = scientificHelpTopics.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([...required]));
    expect(scientificHelpTopics.every(({ summary }) => summary.length <= 100)).toBe(true);
  });

  it("keeps experimental-unit cautions scientifically explicit", () => {
    expect(scientificHelpTopic("biological-n").limitation).toContain("重複計数");
    expect(scientificHelpTopic("nested").limitation).toContain("擬似反復");
    expect(scientificHelpTopic("paired").limitation).toContain("対応ID");
  });

  it("maps implemented methods to the matching topic", () => {
    expect(helpTopicForMethod("welch_t")).toBe("welch-t-test");
    expect(helpTopicForMethod("repeated_measures_anova")).toBe("repeated-measures-anova");
    expect(helpTopicForMethod("unknown_method")).toBeUndefined();
  });
});
