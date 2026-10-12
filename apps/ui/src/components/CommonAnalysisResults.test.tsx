import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnalysisEngineRequestSchema, AnalysisEngineResultSchema } from "@lsaa/analysis-contracts";
import { generateCommonCoverageMethods } from "../app/commonCoverageMethods";
import { CommonAnalysisResults } from "./CommonAnalysisResults";

const request = (zero: boolean) =>
  AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.11.0",
    requestId: "r",
    projectId: "p",
    analysisId: "a",
    templateId: "D14",
    templateVersion: "0.1.0",
    method: "fisher_exact",
    structure: "independent",
    experimentalUnit: "animal",
    rowCategoryIds: ["control", "treated"],
    columnCategoryIds: ["event", "no-event"],
    cells: [zero ? 0 : 1, 9, 6, 4].map((count, i) => ({
      rowCategoryId: i < 2 ? "control" : "treated",
      columnCategoryId: i % 2 ? "no-event" : "event",
      count,
    })),
    options: { confidenceLevel: 0.95, alternative: "two_sided", multiplicityMethod: null },
  });
const result = AnalysisEngineResultSchema.parse({
  protocolVersion: "0.11.0",
  requestId: "r",
  status: "ok",
  engine: { name: "fixture", version: "1", packages: {} },
  estimates: [
    {
      name: "odds_ratio",
      value: 0.0364,
      standardError: 1.559,
      confidenceInterval: { level: 0.95, lower: 0.00171, upper: 0.776 },
    },
  ],
  tests: [
    {
      name: "fisher_exact_test",
      statisticName: "odds_ratio",
      statistic: 0,
      degreesOfFreedom: null,
      pValue: 0.02,
      adjustedPValue: null,
      effectSizeName: null,
      effectSize: null,
    },
  ],
  diagnostics: [],
  warnings: [{ code: "fixture", message: "既存の品質警告" }],
  completedAt: "2026-10-09T00:00:00Z",
});

describe("readable accepted common results", () => {
  it("distinguishes raw Fisher statistic, corrected estimate and log-scale SE", () => {
    render(<CommonAnalysisResults request={request(true)} result={result} />);
    expect(screen.getByText(/未補正の標本OR/)).toHaveTextContent("= 0");
    expect(screen.getByRole("rowheader", { name: /オッズ比 OR.*全4セル/ })).toBeInTheDocument();
    expect(screen.getByText(/log比のSE/)).toHaveTextContent("1.559");
    expect(screen.getByText(/対数Wald・中央両側CI/)).toHaveTextContent("95%");
    expect(screen.getByText(/Fisherの正確区間ではありません/)).toBeInTheDocument();
    expect(screen.getByText("既存の品質警告")).toBeInTheDocument();
    const methods = generateCommonCoverageMethods(request(true), result);
    expect(methods).toContain("all four cells");
    expect(methods).toContain("event category=event");
  });
  it("does not present correction for a table without zero cells", () => {
    render(<CommonAnalysisResults request={request(false)} result={result} />);
    expect(screen.getByRole("rowheader", { name: "オッズ比 OR（未補正）" })).toBeInTheDocument();
    expect(generateCommonCoverageMethods(request(false), result)).toContain(
      "no zero-cell correction",
    );
  });
  it("keeps the executed one-sided hypothesis distinct from central CI and uncentered R squared", () => {
    const executed = AnalysisEngineRequestSchema.parse({
      protocolVersion: "0.13.0",
      requestId: "r",
      projectId: "p",
      analysisId: "a",
      templateId: "D16",
      templateVersion: "0.1.0",
      method: "simple_linear_regression",
      includeIntercept: false,
      xLabel: "X",
      yLabel: "Y",
      xUnit: "",
      yUnit: "",
      points: [1, 2, 3].map((x) => ({
        observationId: `o${x}`,
        experimentalUnitId: `u${x}`,
        x,
        y: 5,
      })),
      options: { confidenceLevel: 0.95, alternative: "greater", multiplicityMethod: null },
    });
    const fitted = AnalysisEngineResultSchema.parse({
      ...result,
      protocolVersion: "0.13.0",
      estimates: [
        {
          name: "slope",
          value: 2,
          standardError: 0.1,
          confidenceInterval: { level: 0.95, lower: 1.5, upper: 2.5 },
        },
      ],
      tests: [{ ...result.tests[0], name: "slope_hypothesis_test", statisticName: "t" }],
      regression: {
        slope: 2,
        intercept: 0,
        rSquared: 0.8,
        xRange: [1, 3],
        confidenceLevel: 0.95,
        fittedLine: [
          { x: 1, y: 2, lower: 1, upper: 3 },
          { x: 3, y: 6, lower: 5, upper: 7 },
        ],
      },
    });
    render(<CommonAnalysisResults request={executed} result={fitted} />);
    expect(screen.getByText(/仮説方向: 傾き > 0/)).toHaveTextContent("中央両側");
    expect(screen.getByText(/R² = 0.8/)).toHaveTextContent("非中心化");
    const methods = generateCommonCoverageMethods(executed, fitted);
    expect(methods).toContain("uncentered total sum of squares");
    expect(methods).toContain("slope hypothesis (greater)");
    expect(methods).toContain("central two-sided 95% CI");
  });

  it("never presents mismatched or failed execution as a result", () => {
    const { container, rerender } = render(
      <CommonAnalysisResults request={request(true)} result={{ ...result, requestId: "other" }} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(generateCommonCoverageMethods(request(true), { ...result, requestId: "other" })).toBe(
      "",
    );
    rerender(
      <CommonAnalysisResults
        request={request(true)}
        result={{ ...result, status: "validation_error" }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(
      generateCommonCoverageMethods(request(true), { ...result, status: "validation_error" }),
    ).toBe("");
  });
});
