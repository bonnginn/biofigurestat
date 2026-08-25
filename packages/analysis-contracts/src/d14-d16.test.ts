import { describe, expect, it } from "vitest";
import {
  AnalysisEngineRequestSchema,
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
});
