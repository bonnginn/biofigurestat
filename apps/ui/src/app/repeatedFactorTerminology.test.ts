import { describe, expect, it } from "vitest";

import {
  repeatedFactorAssessmentText,
  repeatedFactorCanonicalExplanation,
  repeatedFactorLabel,
  type RepeatedFactorSemantics,
} from "./repeatedFactorTerminology";

const CASES: ReadonlyArray<
  Readonly<{ name: string; factor: RepeatedFactorSemantics; label: string }>
> = [
  { name: "Time", factor: { role: "time", title: "Time", unit: "h" }, label: "Time" },
  {
    name: "Radius",
    factor: { role: "numeric_covariate", title: "Radius", unit: "µm" },
    label: "Radius",
  },
  {
    name: "Dose",
    factor: { role: "numeric_covariate", title: "Dose", unit: "nM" },
    label: "Dose",
  },
  {
    name: "Stage",
    factor: { role: "categorical", title: "Stage", unit: "" },
    label: "Stage",
  },
];

describe("repeated factor terminology", () => {
  it.each(CASES)(
    "derives $name recommendation provenance from axis semantics",
    ({ factor, label }) => {
      const assessment = repeatedFactorAssessmentText(factor, "sample");
      const persisted = repeatedFactorCanonicalExplanation(factor);

      expect(repeatedFactorLabel(factor)).toBe(label);
      expect(assessment.title).toContain(label);
      expect(assessment.reason).toContain(label);
      expect(persisted).toContain(label);
      if (factor.role !== "time") {
        expect(`${assessment.title}${assessment.reason}`).not.toContain("時間");
        expect(persisted.toLowerCase()).not.toMatch(/\btime\b/);
      }
    },
  );

  it("uses semantic fallbacks instead of calling every unnamed axis time", () => {
    expect(repeatedFactorLabel({ role: "time", title: "", unit: "h" })).toBe("時間");
    expect(repeatedFactorLabel({ role: "numeric_covariate", title: "", unit: "" })).toBe("数値軸");
    expect(repeatedFactorLabel({ role: "categorical", title: "", unit: "" })).toBe("反復状態");
  });
});
