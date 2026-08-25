import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisRunner } from "../app/analysisClient";
import type { SaveProjectAction } from "../app/projectActions";
import { ProjectStateSchema, type ProjectState } from "@lsaa/project";
import { CommonCoveragePage } from "./CommonCoveragePage";
import { OpenProjectPage } from "./OpenProjectPage";

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

const nonlinearRunner: AnalysisRunner = vi.fn(async (request) => {
  if (request.protocolVersion !== "0.14.0") throw new Error("Expected D17 request");
  const series = request.seriesIds.map((seriesId: string, index: number) => ({
    seriesId,
    converged: true as const,
    parameters: [
      {
        name: "plateau",
        value: 1.6 - index * 0.2,
        standardError: 0.08,
        confidenceInterval: { level: 0.95, lower: 1.3, upper: 1.8 },
      },
      {
        name: "rate",
        value: 0.03 - index * 0.004,
        standardError: 0.003,
        confidenceInterval: { level: 0.95, lower: 0.02, upper: 0.04 },
      },
    ],
    diagnostics: {
      n: 5,
      distinctX: 5,
      residualDegreesOfFreedom: 3,
      rss: 0.02,
      rmse: 0.06,
      rSquared: 0.99,
      aic: -20,
    },
    initialValues: request.initialValues[seriesId] ?? {},
    bounds: request.bounds[seriesId] ?? {},
    fittedCurve: [
      { x: 0, y: 0 },
      { x: 30, y: 0.95 - index * 0.2 },
      { x: 120, y: 1.55 - index * 0.25 },
    ],
  }));
  return {
    protocolVersion: request.protocolVersion,
    requestId: request.requestId,
    status: "ok" as const,
    engine: { name: "fixture-d17", version: "0.7.0", packages: { scipy: "1.18.0" } },
    estimates: series.flatMap(({ parameters }: (typeof series)[number]) => parameters),
    tests: [],
    nonlinearFit: {
      modelId: request.modelId,
      modelVersion: "0.1.0",
      modelFormula: "Y = plateau * (1 - exp(-rate * X))",
      selectionRationale: request.modelSelectionRationale,
      series,
    },
    diagnostics: [],
    warnings: [],
    completedAt: "2026-08-25T08:00:00.000Z",
  };
});

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

  it("keeps the default nonlinear model rationale aligned with model selection", () => {
    render(<CommonCoveragePage mode="nonlinear-fit" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /One-phase association/ }));
    expect(
      (screen.getByRole("textbox", { name: "Model selectionの理由" }) as HTMLTextAreaElement).value,
    ).toContain("開始値をデータから推定");
  });

  it("runs, saves, and reopens an authoritative multi-series D17 fit", async () => {
    let savedState: Parameters<SaveProjectAction>[0] | null = null;
    const saveProject = vi.fn<SaveProjectAction>(async (state) => {
      savedState = state;
      return { state, target: "C:/tmp/nonlinear.lsa" };
    });
    const view = render(
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={vi.fn()}
        analysisRunner={nonlinearRunner}
        saveProject={saveProject}
      />,
    );

    expect(screen.getByText(/Graphは保存済み解析結果のcurveだけ/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "選択したmodelでfitを実行" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "非線形フィットGraph" })).toBeVisible(),
    );
    expect(screen.getByText("Parameter estimates & fit diagnostics")).toBeVisible();
    expect(screen.getAllByText(/R²/).length).toBeGreaterThan(0);
    expect(nonlinearRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        protocolVersion: "0.14.0",
        modelId: "zero_baseline_association",
        seriesIds: ["series.1", "series.2"],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "fit結果をプロジェクトへ保存" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("saved fit curveをプロジェクトへ保存"),
    );
    await waitFor(() => expect(saveProject).toHaveBeenCalledOnce());
    const saved = savedState as ProjectState | null;
    expect(ProjectStateSchema.safeParse(saved).success).toBe(true);
    expect(saved?.analysisRuns[0]?.request.protocolVersion).toBe("0.14.0");
    expect(saved?.analysisRuns[0]?.result.nonlinearFit?.series).toHaveLength(2);
    expect(saved?.graphs[0]?.spec.type).toBe("nonlinear_xy");
    const savedRun = saved!.analysisRuns[0]!;
    expect(() =>
      ProjectStateSchema.parse({
        ...saved,
        analysisRuns: [
          {
            ...savedRun,
            request: {
              ...savedRun.request,
              points:
                savedRun.request.protocolVersion === "0.14.0"
                  ? savedRun.request.points.map((point, index) =>
                      index === 0 ? { ...point, y: point.y + 1 } : point,
                    )
                  : [],
            },
          },
        ],
      }),
    ).toThrow(/nonlinear XY input must reproduce/);
    expect(saved?.observations).toHaveLength(10);
    expect(saved?.provenanceEvents.at(-1)?.detail).toMatch(/model rationale.*fitted curves/);

    view.unmount();
    render(
      <OpenProjectPage
        onNavigate={vi.fn()}
        openProject={vi.fn(async () => null)}
        persistedProject={{ state: saved!, target: "C:/tmp/nonlinear.lsa" }}
      />,
    );
    expect(screen.getByText("Saved authoritative D17 result")).toBeVisible();
    expect(screen.getByRole("img", { name: "非線形フィットGraph" })).toHaveAttribute(
      "data-fit-model",
      "zero_baseline_association",
    );
    expect(screen.getByText("Methods / provenance")).toBeVisible();
  });

  it("rejects fractional contingency input before inference", () => {
    render(<CommonCoveragePage mode="contingency" onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Categorical / contingency data"), {
      target: { value: "Category\tYes\tNo\nA\t12.5\t87.5\nB\t20\t80" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/integer counts/);
  });
});
