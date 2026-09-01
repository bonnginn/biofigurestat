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

  it("returns the same validation route in English without Japanese application copy", () => {
    const feedback = analysisValidationFeedback(
      validationResult("Each independent D01 unit can contribute only one analyzed value"),
      "en",
    );

    expect(feedback?.title).toContain("experimental-unit ID is duplicated");
    expect(feedback?.nextAction).toContain("Dish ID");
    expect(`${feedback?.title} ${feedback?.message} ${feedback?.nextAction}`).not.toMatch(
      /[\u3040-\u30ff\u3400-\u9fff]/u,
    );
  });
});
