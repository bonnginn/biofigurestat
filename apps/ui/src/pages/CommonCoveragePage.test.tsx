import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisRunner } from "../app/analysisClient";
import { CommonCoveragePage } from "./CommonCoveragePage";

const regressionRunner: AnalysisRunner = vi.fn(async (request) => ({
  protocolVersion: request.protocolVersion,
  requestId: request.requestId,
  status: "ok" as const,
  engine: { name: "fixture", version: "0.13.0", packages: {} },
  estimates: [
    {
      name: "slope",
      value: 1.97,
      standardError: 0.07,
      confidenceInterval: { level: 0.95, lower: 1.7, upper: 2.2 },
    },
  ],
  tests: [
    {
      name: "slope_hypothesis_test",
      statisticName: "t",
      statistic: 26,
      degreesOfFreedom: [3],
      pValue: 0.0001,
      adjustedPValue: null,
      effectSizeName: "r_squared",
      effectSize: 0.99,
    },
  ],
  regression: {
    slope: 1.97,
    intercept: 0.15,
    rSquared: 0.99,
    xRange: [1, 5] as [number, number],
    confidenceLevel: 0.95,
    fittedLine: [
      { x: 1, y: 2.12, lower: 1.8, upper: 2.4 },
      { x: 5, y: 10, lower: 9.7, upper: 10.3 },
    ],
  },
  diagnostics: [],
  warnings: [],
  completedAt: "2026-08-24T00:00:00.000Z",
}));

describe("final common coverage workflows", () => {
  it("runs regression separately from correlation and renders fitted Graph and Methods", async () => {
    render(
      <CommonCoveragePage mode="regression" onBack={vi.fn()} analysisRunner={regressionRunner} />,
    );
    expect(screen.getByText(/相関とは別/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "解析を実行" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Simple linear regression Graph" })).toBeVisible(),
    );
    expect(screen.getByText("Methods")).toBeVisible();
    expect(regressionRunner).toHaveBeenCalledWith(
      expect.objectContaining({ protocolVersion: "0.13.0", includeIntercept: true }),
    );
  });

  it("refuses a log axis containing zero without removing points", () => {
    render(<CommonCoveragePage mode="distribution" onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Histogram / ECDF data"), {
      target: { value: "0 1 10" },
    });
    fireEvent.change(screen.getByLabelText("X scale"), { target: { value: "log10" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/not removed/);
  });

  it("rejects fractional contingency input before inference", () => {
    render(<CommonCoveragePage mode="contingency" onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Categorical / contingency data"), {
      target: { value: "Category\tYes\tNo\nA\t12.5\t87.5\nB\t20\t80" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/integer counts/);
  });
});
