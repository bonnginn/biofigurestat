import { describe, expect, it } from "vitest";
import { AnalysisEngineRequestSchema } from "@lsaa/analysis-contracts";
import { controlComparisonInferenceText } from "./controlComparisonInferenceText";

const request = AnalysisEngineRequestSchema.parse({
  protocolVersion: "0.2.0",
  requestId: "request.control",
  projectId: "p",
  analysisId: "a",
  templateId: "D03",
  templateVersion: "0.1.0",
  method: "one_way_anova",
  conditionIds: ["control:1", "low", "high"],
  controlConditionId: "control:1",
  contrastIntent: "control_vs_many",
  primaryContrastConditionIds: ["control:1", "low"],
  observations: ["control:1", "low", "high"].flatMap((conditionId, i) =>
    [0, 1].map((j) => ({
      observationId: `o${i}${j}`,
      experimentalUnitId: `u${i}${j}`,
      conditionId,
      value: i + j,
    })),
  ),
  options: {
    confidenceLevel: 0.9,
    alternative: "two_sided",
    multiplicityMethod: "dunnett_control_vs_many",
  },
});

describe("executed control comparison explanation", () => {
  it("states actual direction, family coverage and scientific limits", () => {
    const text = controlComparisonInferenceText(request);
    expect(text).toContain("各条件 − 明示した対照（control:1）");
    expect(text).toContain("90%同時信頼区間");
    expect(text).toContain("独立した実験単位、各群の正規性、等分散");
    expect(text).toContain("同等性を示しません");
  });
  it("does not describe a different method, comparison family or unsupported direction", () => {
    expect(controlComparisonInferenceText(null)).toBeNull();
    if (request.protocolVersion !== "0.2.0") throw new Error("wrong fixture");
    expect(controlComparisonInferenceText({ ...request, contrastIntent: "all_pairs" })).toBeNull();
    expect(controlComparisonInferenceText({ ...request, method: "welch_anova" })).toBeNull();
    expect(() =>
      AnalysisEngineRequestSchema.parse({
        ...request,
        options: { ...request.options, alternative: "greater" },
      }),
    ).toThrow();
  });
  it("formats an arbitrary supported confidence level without floating point debris", () => {
    if (request.protocolVersion !== "0.2.0") throw new Error("wrong fixture");
    expect(
      controlComparisonInferenceText({
        ...request,
        options: { ...request.options, confidenceLevel: 0.29 },
      }),
    ).toContain("29%同時信頼区間");
  });
});
