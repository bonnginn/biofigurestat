import { AnalysisEngineResultSchema } from "@lsaa/analysis-contracts";
import { describe, expect, it } from "vitest";

import { analysisValidationFeedback } from "./analysisValidationFeedback";

function validationResult(message: string) {
  return AnalysisEngineResultSchema.parse({
    protocolVersion: "0.1.0",
    requestId: "request.test",
    status: "validation_error",
    engine: { name: "lsaa-python", version: "test", packages: {} },
    estimates: [],
    tests: [],
    diagnostics: [{ code: "invalid_request", message }],
    warnings: [],
    completedAt: "2026-08-28T00:00:00.000Z",
  });
}

describe("analysisValidationFeedback", () => {
  it("routes the Case 3 duplicate D01 unit defect to the parent-unit identity", () => {
    const feedback = analysisValidationFeedback(
      validationResult("Each independent D01 unit can contribute only one analyzed value"),
    );

    expect(feedback).toMatchObject({
      title: "独立群の実験単位IDが重複しています",
    });
    expect(feedback?.nextAction).toContain("Dish ID");
    expect(feedback?.message).toContain("biological n");
  });

  it("explains the exact Case 2 zero-variance paired-difference failure", () => {
    const feedback = analysisValidationFeedback(
      validationResult("Paired t-test is undefined when every paired difference is identical"),
    );

    expect(feedback?.title).toContain("すべての対応差が同じ");
    expect(feedback?.message).toContain("標準誤差が0");
    expect(feedback?.nextAction).toContain("代替法");
  });

  it.each([
    "Mann-Whitney U is undefined when every analyzed value is identical",
    "Kruskal-Wallis is undefined when every analyzed value is identical",
    "Friedman is undefined when every analyzed value is identical",
  ])("explains an all-identical rank-test boundary: %s", (message) => {
    const feedback = analysisValidationFeedback(validationResult(message));

    expect(feedback?.title).toContain("順位検定を計算できません");
    expect(feedback?.message).toContain("順位差");
    expect(feedback?.nextAction).toContain("集約単位");
    expect(feedback?.nextAction).toContain("測定値は保持されています");
  });
});
