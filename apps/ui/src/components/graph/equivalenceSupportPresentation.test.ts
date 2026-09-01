import { describe, expect, it } from "vitest";

import { classifyEquivalenceSupport } from "./equivalenceSupportPresentation";

describe("classifyEquivalenceSupport", () => {
  it.each([
    ["proportion", undefined, "positive_total_independent"],
    ["proportion", "same_entity", "positive_total_matched"],
    ["proportion", "shared_source", "positive_total_shared_source"],
    ["nested_continuous", undefined, "continuous_independent"],
    ["nested_continuous", "same_entity", "continuous_matched"],
    ["nested_continuous", "shared_source", "continuous_shared_source"],
    ["wb_ratio", undefined, "specialist_outcome"],
    ["categorical_counts", undefined, "specialist_outcome"],
  ] as const)("classifies %s / %s without inferring a method", (readoutShape, relationshipKind, expected) => {
    expect(classifyEquivalenceSupport({ readoutShape, relationshipKind })).toBe(expected);
  });
});
