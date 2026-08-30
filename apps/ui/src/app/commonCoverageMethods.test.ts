import { describe, expect, it } from "vitest";
import { AnalysisEngineRequestSchema, AnalysisEngineResultSchema } from "@lsaa/analysis-contracts";
import { generateCommonCoverageMethods } from "./commonCoverageMethods";

describe("common coverage Methods", () => {
  it("records regression model, units, CI and Graph/transform distinction", () => {
    const request = {
      protocolVersion: "0.13.0",
      requestId: "r",
      projectId: "p",
      analysisId: "a",
      templateId: "D16",
      templateVersion: "0.1.0",
      method: "simple_linear_regression",
      xLabel: "Dose",
      yLabel: "Response",
      xUnit: "nM",
      yUnit: "%",
      includeIntercept: true,
      points: [1, 2, 3].map((i) => ({
        observationId: `o${i}`,
        experimentalUnitId: `u${i}`,
        x: i,
        y: i * 2,
      })),
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    } as const;
    const result = {
      protocolVersion: "0.13.0",
      requestId: "r",
      status: "ok",
      engine: { name: "e", version: "1", packages: {} },
      estimates: [
        {
          name: "slope",
          value: 2,
          standardError: 0.1,
          confidenceInterval: { level: 0.95, lower: 1.8, upper: 2.2 },
        },
      ],
      tests: [
        {
          name: "slope",
          statisticName: "t",
          statistic: 20,
          degreesOfFreedom: [1],
          pValue: 0.01,
          adjustedPValue: null,
          effectSizeName: "r_squared",
          effectSize: 0.99,
        },
      ],
      regression: {
        slope: 2,
        intercept: 0,
        rSquared: 0.99,
        xRange: [1, 3],
        confidenceLevel: 0.95,
        fittedLine: [
          { x: 1, y: 2, lower: 1, upper: 3 },
          { x: 3, y: 6, lower: 5, upper: 7 },
        ],
      },
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-24T00:00:00.000Z",
    } as const;
    const text = generateCommonCoverageMethods(
      AnalysisEngineRequestSchema.parse(request),
      AnalysisEngineResultSchema.parse(result),
    );
    expect(text).toContain("ordinary least-squares");
    expect(text).toContain("Dose (nM)");
    expect(text).toContain("R²=0.99");
    expect(text).toContain("display metadata");
  });
});
