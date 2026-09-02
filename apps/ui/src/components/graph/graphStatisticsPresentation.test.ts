import { describe, expect, it } from "vitest";

import {
  comparisonDisplayLabel,
  diagnosticLabel,
  estimateDisplayLabel,
  formatGraphStatisticNumber,
  formatGraphStatisticP,
  isPairwiseComparisonName,
} from "./graphStatisticsPresentation";

const conditions = [
  { id: "condition.1", label: "Vehicle" },
  { id: "condition.2", label: "Drug A" },
] as const;

describe("graph statistics presentation", () => {
  it("preserves the established result number and p-value formatting", () => {
    expect(formatGraphStatisticNumber(1.234567)).toBe("1.2346");
    expect(formatGraphStatisticNumber(Number.NaN)).toBe("—");
    expect(formatGraphStatisticNumber(null)).toBe("—");
    expect(formatGraphStatisticP(0.00210208)).toBe("0.0021");
    expect(formatGraphStatisticP(0.0000000349)).toBe("3.49e-8");
  });

  it("maps pairwise engine identities to stable condition labels", () => {
    expect(isPairwiseComparisonName("dunnett:condition.2:condition.1")).toBe(true);
    expect(comparisonDisplayLabel("dunnett:condition.2:condition.1", conditions)).toBe(
      "Drug A vs Vehicle",
    );
    expect(comparisonDisplayLabel("unrelated:condition.2:condition.1", conditions)).toBeNull();
  });

  it("disambiguates duplicate display labels without changing condition identity", () => {
    const duplicateLabels = [
      { id: "condition.1", label: "Drug" },
      { id: "condition.2", label: "Drug" },
    ] as const;
    expect(comparisonDisplayLabel("holm_welch:condition.1:condition.2", duplicateLabels)).toBe(
      "Drug（条件 1） vs Drug（条件 2）",
    );
  });

  it("keeps directional estimate labels tied to ordered condition ids", () => {
    expect(estimateDisplayLabel("condition.2_minus_condition.1", conditions)).toBe(
      "Drug A − Vehicle",
    );
    expect(estimateDisplayLabel("unknown_estimate", conditions)).toBe("unknown_estimate");
  });

  it("keeps shared-source diagnostic semantics distinct in both languages", () => {
    const relationship = {
      kind: "shared_source",
      unitLabel: "dish",
      sourceLabel: "animal",
    } as const;
    expect(diagnosticLabel("paired_rank_test_semantics", relationship, "en")).toContain(
      "condition-specific dishs",
    );
    expect(diagnosticLabel("paired_rank_test_semantics", relationship, "ja")).toContain(
      "同じanimal由来の条件別dish",
    );
    expect(diagnosticLabel("unknown_code", undefined, "ja")).toBe("unknown_code");
  });
});
