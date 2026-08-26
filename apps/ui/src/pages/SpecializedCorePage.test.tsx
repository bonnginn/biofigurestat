import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type * as BenchmarkEvaluation from "../app/benchmarkEvaluation";
import { SpecializedCorePage } from "./SpecializedCorePage";

const recordBenchmarkEvent = vi.hoisted(() => vi.fn());
vi.mock("../app/benchmarkEvaluation", async (importOriginal) => ({
  ...(await importOriginal<typeof BenchmarkEvaluation>()),
  recordBenchmarkEvent,
}));

describe("specialized Core entry pages", () => {
  it("browser previewでは利用できないproject保存をdisabledで示す", () => {
    render(<SpecializedCorePage mode="survival" onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "プロジェクトを保存" })).toBeDisabled();
  });

  it("ブラウザレビューでengine未接続ならsurvival実行をdisabledで説明する", () => {
    render(<SpecializedCorePage mode="survival" onBack={vi.fn()} analysisAvailable={false} />);
    expect(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" })).toBeDisabled();
    expect(screen.getByText(/ブラウザレビューでは解析エンジンを実行できません/)).toBeVisible();
  });

  it("shows a matrix paste as a heatmap and keeps an explicit transform control", () => {
    render(<SpecializedCorePage mode="heatmap" onBack={vi.fn()} />);
    expect(screen.getByRole("img", { name: "Heatmap" })).toBeVisible();
    expect(screen.getByLabelText("Heatmap transform")).toHaveValue("none");
    expect(document.querySelector('[data-missing="true"]')).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Heatmap transform"), {
      target: { value: "row_z_score" },
    });
    expect(screen.getByTitle(/row_z_score/u)).toBeInTheDocument();
  });

  it("runs a D11 request from explicit Event/Censored paste", async () => {
    const analysisRunner = vi.fn(async (request) => ({
      protocolVersion: "0.8.0" as const,
      requestId: request.requestId,
      status: "ok" as const,
      engine: { name: "fixture", version: "0.10.0", packages: {} },
      estimates: [],
      tests: [
        {
          name: "log_rank",
          statisticName: "chi-square",
          statistic: 1.2,
          degreesOfFreedom: [1],
          pValue: 0.27,
          adjustedPValue: null,
          effectSizeName: null,
          effectSize: null,
        },
      ],
      survival: {
        groups: [
          { conditionId: "condition.1", n: 2, events: 1, censored: 1, curve: [], censorTimes: [7] },
          { conditionId: "condition.2", n: 2, events: 1, censored: 1, curve: [], censorTimes: [9] },
        ],
      },
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-24T00:00:00.000Z",
    }));
    render(
      <SpecializedCorePage mode="survival" onBack={vi.fn()} analysisRunner={analysisRunner} />,
    );
    expect(screen.getByRole("img", { name: "Kaplan–Meier survival graph" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Kaplan–Meier + log-rankを実行" }));
    await waitFor(() =>
      expect(analysisRunner).toHaveBeenCalledWith(
        expect.objectContaining({ protocolVersion: "0.8.0", templateId: "D11" }),
      ),
    );
    expect(await screen.findByText(/log-rank検定が完了/u)).toBeVisible();
    expect(screen.getByText("log-rank: χ²(1) = 1.2, p = 0.27")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: /保存済みlog-rank結果/ }));
    expect(
      screen
        .getAllByText("log-rank: χ²(1) = 1.2, p = 0.27")
        .find((element) => element.getAttribute("data-graph-layer") === "statistics-annotation"),
    ).toBeVisible();
    expect(screen.getByText(/event=1、censored=1/u)).toBeInTheDocument();
    expect(recordBenchmarkEvent).toHaveBeenCalledWith(
      "statistics_executed",
      expect.objectContaining({
        method: "log_rank",
        contrast: "condition.1|condition.2",
        protocolVersion: "0.8.0",
      }),
    );
  });
});
