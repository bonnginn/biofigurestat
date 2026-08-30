import { describe, expect, it } from "vitest";
import type {
  AnalysisEngineRequest,
  AnalysisEngineResult,
  AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import type { ExperimentDesign } from "@lsaa/domain";
import { createNonlinearFitGraphSpec } from "@lsaa/graph-spec";
import { generateMethodsText } from "./methodsText";

describe("D17 Methods provenance", () => {
  it("records model identity, parameters, diagnostics, starts, bounds, and authoritative Graph linkage", () => {
    const request: Extract<AnalysisEngineRequest, { protocolVersion: "0.14.0" }> = {
      protocolVersion: "0.14.0",
      requestId: "request.d17",
      projectId: "project.d17",
      analysisId: "analysis.d17",
      templateId: "D17",
      templateVersion: "0.1.0",
      method: "nonlinear_xy_fit",
      modelId: "zero_baseline_association",
      modelSelectionRationale: "A zero-start saturating reaction is the simplest justified model.",
      xLabel: "Time",
      yLabel: "Product",
      xUnit: "min",
      yUnit: "mol/mol",
      seriesIds: ["series.1"],
      points: [
        { observationId: "o.1", experimentalUnitId: "u.1", seriesId: "series.1", x: 0, y: 0 },
        { observationId: "o.2", experimentalUnitId: "u.1", seriesId: "series.1", x: 1, y: 0.5 },
        { observationId: "o.3", experimentalUnitId: "u.1", seriesId: "series.1", x: 2, y: 0.8 },
      ],
      initialValues: { "series.1": { rate: 0.2 } },
      bounds: { "series.1": { rate: { lower: 0, upper: 2 } } },
      observations: [],
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    };
    const result: AnalysisEngineResult = {
      protocolVersion: "0.14.0",
      requestId: request.requestId,
      status: "ok",
      engine: { name: "lsaa-python", version: "0.7.0", packages: { scipy: "1.18.0" } },
      estimates: [],
      tests: [],
      nonlinearFit: {
        modelId: request.modelId,
        modelVersion: "0.1.0",
        modelFormula: "Y = plateau * (1 - exp(-rate * X))",
        selectionRationale: request.modelSelectionRationale,
        series: [
          {
            seriesId: "series.1",
            converged: true,
            parameters: [
              {
                name: "plateau",
                value: 1,
                standardError: 0.1,
                confidenceInterval: { level: 0.95, lower: 0.8, upper: 1.2 },
              },
              {
                name: "rate",
                value: 0.4,
                standardError: 0.05,
                confidenceInterval: { level: 0.95, lower: 0.3, upper: 0.5 },
              },
            ],
            diagnostics: {
              n: 3,
              distinctX: 3,
              residualDegreesOfFreedom: 1,
              rss: 0.01,
              rmse: 0.06,
              rSquared: 0.99,
              aic: -9,
            },
            initialValues: { rate: 0.2 },
            bounds: { rate: { lower: 0, upper: 2 } },
            fittedCurve: [
              { x: 0, y: 0 },
              { x: 2, y: 0.8 },
            ],
          },
        ],
      },
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-25T08:00:00.000Z",
    };
    const design: ExperimentDesign = {
      schemaVersion: "0.2.0",
      id: "design.d17",
      name: "Kinetic fit",
      purpose: "custom",
      outcomes: [
        { id: "outcome.y", key: "y", label: "Product", type: "continuous", unit: "mol/mol" },
      ],
      factors: [
        {
          id: "factor.series",
          key: "series",
          label: "Series",
          levels: [{ id: "level.series.1", label: "K5", order: 0 }],
        },
      ],
      conditions: [
        { id: "series.1", label: "K5", factorLevels: { "factor.series": "level.series.1" } },
      ],
      unitLevels: [
        {
          id: "level.reaction",
          key: "reaction",
          label: "Reaction",
          role: "experimental_unit",
          parentLevelId: null,
        },
      ],
      experimentalUnitLevelId: "level.reaction",
      pairing: { kind: "independent" },
      plannedN: 1,
      normalizationPlans: [],
      primaryContrast: null,
      wizardRuleVersion: "d17-test",
      wizardDecisions: [],
      createdAt: "2026-08-25T08:00:00.000Z",
    };
    const recommendation: AnalysisRecommendation = {
      templateId: "D17",
      templateVersion: "0.1.0",
      recommendedMethod: "nonlinear_xy_fit",
      alternativeMethods: [],
      reasonCode: "explicit_model",
      explanation: request.modelSelectionRationale,
      statisticalNDefinition: "one stable reaction unit",
      multiplicityMethod: null,
      decision: { kind: "accepted", selectedMethod: "nonlinear_xy_fit" },
    };
    const spec = createNonlinearFitGraphSpec({
      graphId: "graph.d17",
      dataSource: { kind: "analysis_result", id: result.requestId, revision: result.requestId },
      analysisResultId: result.requestId,
      xLabel: request.xLabel,
      yLabel: request.yLabel,
      seriesIds: request.seriesIds,
    });
    const methods = generateMethodsText({
      design,
      recommendation,
      request,
      result,
      graphSpec: spec,
      outcomeId: "outcome.y",
    });
    expect(methods).toContain("zero_baseline_association");
    expect(methods).toContain("model選択理由");
    expect(methods).toContain("plateau=1");
    expect(methods).toContain("R²=0.99");
    expect(methods).toContain('initial values：{"rate":0.2}');
    expect(methods).toContain('bounds：{"rate":{"lower":0,"upper":2}}');
    expect(methods).toContain("saved authoritative fitted curve");
    expect(methods).toContain("scipy 1.18.0");
  });
});
