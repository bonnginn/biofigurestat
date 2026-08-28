import { describe, expect, it } from "vitest";
import {
  AnalysisEngineRequestSchema,
  AnalysisEngineResultSchema,
  ContingencyAnalysisEngineRequestSchema,
  FriedmanAnalysisEngineRequestSchema,
  SimpleLinearRegressionEngineRequestSchema,
  NonlinearXyFitEngineRequestSchema,
} from "./contracts";

const options = {
  alternative: "two_sided" as const,
  confidenceLevel: 0.95,
  multiplicityMethod: null,
};

describe("D14-D16 contracts", () => {
  it("keeps counts and independent/paired structure explicit", () => {
    const base = {
      protocolVersion: "0.11.0",
      requestId: "request.counts",
      projectId: "project.counts",
      analysisId: "analysis.counts",
      templateId: "D14",
      templateVersion: "0.1.0",
      method: "fisher_exact",
      structure: "independent",
      experimentalUnit: "animal",
      rowCategoryIds: ["control", "treated"],
      columnCategoryIds: ["event", "no-event"],
      cells: [
        { rowCategoryId: "control", columnCategoryId: "event", count: 1 },
        { rowCategoryId: "control", columnCategoryId: "no-event", count: 9 },
        { rowCategoryId: "treated", columnCategoryId: "event", count: 6 },
        { rowCategoryId: "treated", columnCategoryId: "no-event", count: 4 },
      ],
      options,
    } as const;
    expect(ContingencyAnalysisEngineRequestSchema.parse(base).cells[0]?.count).toBe(1);
    expect(
      ContingencyAnalysisEngineRequestSchema.safeParse({
        ...base,
        cells: base.cells.map((cell, index) => ({
          ...cell,
          count: index === 0 ? 25.5 : cell.count,
        })),
      }).success,
    ).toBe(false);
    expect(
      ContingencyAnalysisEngineRequestSchema.safeParse({
        ...base,
        method: "mcnemar_exact",
        structure: "independent",
      }).success,
    ).toBe(false);
    expect(AnalysisEngineRequestSchema.safeParse(base).success).toBe(true);
  });

  it("requires pair identity for Friedman observations", () => {
    const request = {
      protocolVersion: "0.12.0",
      requestId: "request.friedman",
      projectId: "project.friedman",
      analysisId: "analysis.friedman",
      templateId: "D15",
      templateVersion: "0.1.0",
      method: "friedman",
      conditionIds: ["a", "b", "c"],
      observations: ["u1", "u2"].flatMap((pairId, pair) =>
        ["a", "b", "c"].map((conditionId, index) => ({
          observationId: `o.${pair}.${index}`,
          conditionId,
          experimentalUnitId: pairId,
          pairId,
          value: pair + index,
        })),
      ),
      options: { ...options, multiplicityMethod: "holm_wilcoxon_all_pairs" },
    } as const;
    expect(FriedmanAnalysisEngineRequestSchema.parse(request).observations).toHaveLength(6);
    expect(AnalysisEngineRequestSchema.safeParse(request).success).toBe(true);
  });

  it("keeps regression distinct and makes zero intercept explicit", () => {
    const request = {
      protocolVersion: "0.13.0",
      requestId: "request.regression",
      projectId: "project.regression",
      analysisId: "analysis.regression",
      templateId: "D16",
      templateVersion: "0.1.0",
      method: "simple_linear_regression",
      xLabel: "Dose",
      yLabel: "Response",
      xUnit: "nM",
      yUnit: "%",
      includeIntercept: true,
      points: [1, 2, 3].map((x) => ({
        observationId: `o.${x}`,
        experimentalUnitId: `u.${x}`,
        x,
        y: 2 * x + 1,
      })),
      options,
    } as const;
    expect(SimpleLinearRegressionEngineRequestSchema.parse(request).includeIntercept).toBe(true);
    expect(AnalysisEngineRequestSchema.safeParse(request).success).toBe(true);
  });
});

describe("D17 nonlinear XY contract", () => {
  it("persists explicit model selection, series identity, starts, and bounds", () => {
    const request = {
      protocolVersion: "0.14.0",
      requestId: "request.kinetics",
      projectId: "project.kinetics",
      analysisId: "analysis.kinetics",
      templateId: "D17",
      templateVersion: "0.1.0",
      method: "nonlinear_xy_fit",
      modelId: "zero_baseline_association",
      modelSelectionRationale: "Time-course product accumulation is monotone and saturating.",
      xLabel: "Time",
      yLabel: "Product",
      xUnit: "min",
      yUnit: "mol/mol",
      seriesIds: ["K5", "K14"],
      points: ["K5", "K14"].flatMap((seriesId) =>
        [0, 30, 60, 120].map((x, index) => ({
          observationId: `${seriesId}.${index}`,
          experimentalUnitId: `${seriesId}.experiment.1`,
          seriesId,
          x,
          y: index * (seriesId === "K5" ? 0.5 : 0.3),
        })),
      ),
      initialValues: { K5: { plateau: 2, rate: 0.02 } },
      bounds: { K5: { plateau: { lower: 0, upper: 5 }, rate: { lower: 0.0001, upper: 1 } } },
      observations: [],
      options,
    } as const;
    expect(NonlinearXyFitEngineRequestSchema.parse(request).seriesIds).toEqual(["K5", "K14"]);
    expect(AnalysisEngineRequestSchema.safeParse(request).success).toBe(true);
  });

  it("accepts precomputed initial velocity for a versioned Michaelis-Menten fit", () => {
    const request = {
      protocolVersion: "0.14.0",
      requestId: "request.michaelis-menten",
      projectId: "project.enzyme-kinetics",
      analysisId: "analysis.michaelis-menten",
      templateId: "D17",
      templateVersion: "0.2.0",
      method: "nonlinear_xy_fit",
      modelId: "michaelis_menten",
      modelSelectionRationale:
        "X is substrate concentration and Y is initial velocity calculated before this fit.",
      xLabel: "Substrate concentration",
      yLabel: "Initial velocity",
      xUnit: "mM",
      yUnit: "µmol/min",
      seriesIds: ["enzyme.wt"],
      points: [0.25, 0.5, 1, 2, 5, 10].map((x, index) => ({
        observationId: `enzyme.wt.${index + 1}`,
        experimentalUnitId: `reaction.${index + 1}`,
        seriesId: "enzyme.wt",
        x,
        y: (120 * x) / (2.5 + x),
      })),
      initialValues: { "enzyme.wt": { vmax: 100, km: 2 } },
      bounds: {
        "enzyme.wt": {
          vmax: { lower: 0, upper: 300 },
          km: { lower: 0, upper: 50 },
        },
      },
      observations: [],
      options,
    } as const;

    expect(NonlinearXyFitEngineRequestSchema.parse(request).modelId).toBe("michaelis_menten");
    expect(AnalysisEngineRequestSchema.safeParse(request).success).toBe(true);
  });

  it("requires parameter-defining units for Michaelis-Menten without changing association input", () => {
    const request = {
      protocolVersion: "0.14.0",
      requestId: "request.michaelis-menten",
      projectId: "project.enzyme-kinetics",
      analysisId: "analysis.michaelis-menten",
      templateId: "D17",
      templateVersion: "0.2.0",
      method: "nonlinear_xy_fit",
      modelId: "michaelis_menten",
      modelSelectionRationale: "Substrate concentration versus precomputed initial velocity.",
      xLabel: "Substrate concentration",
      yLabel: "Initial velocity",
      xUnit: "",
      yUnit: "",
      seriesIds: ["enzyme.wt"],
      points: [0.5, 1, 2].map((x, index) => ({
        observationId: `enzyme.wt.${index + 1}`,
        experimentalUnitId: `reaction.${index + 1}`,
        seriesId: "enzyme.wt",
        x,
        y: x,
      })),
      initialValues: {},
      bounds: {},
      observations: [],
      options,
    } as const;

    const parsed = NonlinearXyFitEngineRequestSchema.safeParse(request);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map(({ path }) => path.join("."))).toEqual(["xUnit", "yUnit"]);
    }
    expect(
      NonlinearXyFitEngineRequestSchema.safeParse({
        ...request,
        templateVersion: "0.1.0",
        xUnit: "mM",
        yUnit: "µmol/min",
      }).success,
    ).toBe(false);
  });

  it("accepts versioned Km and Vmax results without adding a curve-comparison test", () => {
    const parameter = (name: string, value: number) => ({
      name,
      value,
      standardError: 0.01,
      confidenceInterval: { level: 0.95, lower: value - 0.02, upper: value + 0.02 },
    });
    const result = AnalysisEngineResultSchema.parse({
      protocolVersion: "0.14.0",
      requestId: "request.michaelis-menten",
      status: "ok",
      engine: { name: "lsaa-python", version: "0.7.0", packages: { scipy: "1.18.0" } },
      estimates: [parameter("enzyme.wt.vmax", 120), parameter("enzyme.wt.km", 2.5)],
      tests: [],
      nonlinearFit: {
        modelId: "michaelis_menten",
        modelVersion: "0.1.0",
        modelFormula: "vmax * x / (km + x)",
        selectionRationale: "Substrate concentration versus precomputed initial velocity.",
        series: [
          {
            seriesId: "enzyme.wt",
            converged: true,
            parameters: [parameter("enzyme.wt.vmax", 120), parameter("enzyme.wt.km", 2.5)],
            diagnostics: {
              n: 6,
              distinctX: 6,
              residualDegreesOfFreedom: 4,
              rss: 0.2,
              rmse: 0.22,
              rSquared: 0.99,
              aic: -15,
            },
            initialValues: { vmax: 100, km: 2 },
            bounds: {
              vmax: { lower: 0, upper: 300 },
              km: { lower: 0, upper: 50 },
            },
            fittedCurve: [
              { x: 0, y: 0 },
              { x: 10, y: 96 },
            ],
          },
        ],
      },
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-27T00:00:00.000Z",
    });

    expect(result.nonlinearFit?.modelId).toBe("michaelis_menten");
    expect(result.tests).toEqual([]);
  });
});
