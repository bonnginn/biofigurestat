import { describe, expect, it } from "vitest";

import { contextualHelpSuggestions } from "./contextualHelp";

describe("contextual Help suggestions", () => {
  it("uses only the current design semantics to suggest nested biological-n help", () => {
    const suggestions = contextualHelpSuggestions({
      surface: "data",
      experimentalUnit: "independent experiment",
      biologicalN: 3,
      nested: true,
    });

    expect(suggestions.map(({ topic }) => topic.id)).toEqual([
      "experimental-unit",
      "biological-n",
      "nested",
    ]);
  });

  it("combines time transformation and selected-method explanations", () => {
    const suggestions = contextualHelpSuggestions({
      surface: "statistics",
      timeStructure: "longitudinal",
      transformation: "auc",
      selectedMethod: "welch_t",
    });

    expect(suggestions.map(({ topic }) => topic.id)).toEqual([
      "longitudinal",
      "repeated-measures",
      "auc",
      "welch-t-test",
    ]);
  });

  it("suggests the warning concept without making a scientific choice", () => {
    const suggestions = contextualHelpSuggestions({
      surface: "warning",
      warningCode: "sphericity_not_evaluated",
    });

    expect(suggestions.map(({ topic }) => topic.id)).toContain("sphericity");
  });
});
