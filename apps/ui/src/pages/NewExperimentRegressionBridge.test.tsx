import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { regressionSource } from "../app/graphOnlyRegressionFixture";
import { NewExperimentPage } from "./NewExperimentPage";
import type { AnalysisRunner } from "../app/analysisClient";

it("selects regression within Statistics, submits original IDs/XY only on explicit run, and keeps the source table on back", async () => {
  const source = regressionSource();
  const requestExit = vi.fn();
  const run = vi.fn<AnalysisRunner>(async () => {
    throw new Error("Synthetic request capture; no engine call");
  });
  render(
    <NewExperimentPage
      initialGraphOnlyState={source}
      analysisRunner={run}
      onNavigate={vi.fn()}
      onRequestExit={requestExit}
      saveUnresolvedVisualizationProject={vi.fn(async () => null)}
      openUnresolvedVisualizationProject={vi.fn(async () => null)}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
  fireEvent.click(screen.getByRole("radio", { name: "同じ対象の2つの数値の関係（単回帰）" }));
  const next = screen.getByRole("button", { name: "この表で単回帰を設定する" });
  expect(next).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "各行が独立した対象で、対象ごとにX・Yが1組ずつです" }),
  );
  fireEvent.click(next);
  expect(screen.getByRole("heading", { name: "Simple linear regression" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Simple linear regression data" })).toHaveValue(
    "Unit ID\tX\tY\na\t20\t0.9\nb\t25\t1.1\nc\t30\t1.4",
  );
  expect(run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "解析を実行" }));
  await waitFor(() => expect(run).toHaveBeenCalledOnce());
  expect(run.mock.calls[0][0]).toMatchObject({
    method: "simple_linear_regression",
    xLabel: "Weight",
    yLabel: "Organ",
    points: [
      { experimentalUnitId: "a", x: 20, y: 0.9 },
      { experimentalUnitId: "b", x: 25, y: 1.1 },
      { experimentalUnitId: "c", x: 30, y: 1.4 },
    ],
  });
  fireEvent.click(screen.getByRole("button", { name: "← 戻る" }));
  expect(requestExit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "データ" }));
  expect(screen.getByTestId("graph-only-cell-1-0")).toHaveValue("a");
  expect(screen.getByTestId("graph-only-cell-1-1")).toHaveValue("20");
});
