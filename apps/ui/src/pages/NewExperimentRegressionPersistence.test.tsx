import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  UnresolvedVisualizationProjectStateSchema,
  type UnresolvedVisualizationProjectState,
} from "@lsaa/project";
import { regressionSource } from "../app/graphOnlyRegressionFixture";
import type { AnalysisRunner } from "../app/analysisClient";
import type { WorkspaceLifecycleRegistration } from "../app/workspaceLifecycle";
import { NewExperimentPage } from "./NewExperimentPage";

const runner = vi.fn<AnalysisRunner>(async (request) => ({
  protocolVersion: request.protocolVersion,
  requestId: request.requestId,
  status: "ok",
  engine: { name: "fixture", version: "test", packages: {} },
  estimates: [
    {
      name: "slope",
      value: 0.05,
      standardError: 0.01,
      confidenceInterval: { level: 0.95, lower: 0.01, upper: 0.09 },
    },
  ],
  tests: [],
  diagnostics: [],
  warnings: [],
  completedAt: "2026-10-12T00:00:00Z",
  regression: {
    slope: 0.05,
    intercept: -0.12,
    rSquared: 0.98,
    xRange: [20, 30],
    confidenceLevel: 0.95,
    fittedLine: [
      { x: 20, y: 0.88, lower: 0.8, upper: 1 },
      { x: 30, y: 1.38, lower: 1.3, upper: 1.5 },
    ],
  },
}));
function enterRegression() {
  fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
  fireEvent.click(screen.getByRole("radio", { name: "同じ対象の2つの数値の関係（単回帰）" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "各行が独立した対象で、対象ごとにX・Yが1組ずつです" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "この表で単回帰を設定する" }));
}
it("saves original table, regression settings and authoritative execution, restores without rerunning, and retains old executions after edits", async () => {
  let handler: WorkspaceLifecycleRegistration | null = null;
  let saved: UnresolvedVisualizationProjectState | null = null;
  const save = vi.fn(async (state: UnresolvedVisualizationProjectState) => {
    saved = UnresolvedVisualizationProjectStateSchema.parse(structuredClone(state));
    return { state: saved, target: "C:/test/regression.lsa" };
  });
  const props = {
    onNavigate: vi.fn(),
    onDirtyChange: vi.fn(),
    analysisRunner: runner,
    saveUnresolvedVisualizationProject: save,
    onRegisterSaveHandler: (
      value: Parameters<
        NonNullable<React.ComponentProps<typeof NewExperimentPage>["onRegisterSaveHandler"]>
      >[0],
    ) => {
      handler = typeof value === "function" ? { save: value } : value;
    },
  };
  const mounted = render(
    <NewExperimentPage {...props} initialGraphOnlyState={regressionSource()} />,
  );
  enterRegression();
  fireEvent.click(screen.getByRole("button", { name: "解析を実行" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "SVGを書き出す" })).toBeEnabled());
  await act(async () => {
    expect(await handler!.save()).toBe(true);
  });
  expect(saved!.rawLineage.rawText).toBe(regressionSource().rawLineage.rawText);
  expect(saved!.regressionWorkspace!.executions).toHaveLength(1);
  expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  const oldId = saved!.regressionWorkspace!.activeRequestId;
  mounted.unmount();
  runner.mockClear();
  render(
    <NewExperimentPage
      {...props}
      initialGraphOnlyState={saved!}
      initialGraphOnlyTarget="C:/test/regression.lsa"
    />,
  );
  enterRegression();
  expect(runner).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "SVGを書き出す" })).toBeEnabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Simple linear regression data" }), {
    target: { value: "Unit ID\tX\tY\na\t20\t0.9\nb\t25\t1.2\nc\t30\t1.4" },
  });
  expect(screen.getByRole("button", { name: "SVGを書き出す" })).toBeDisabled();
  await act(async () => {
    expect(await handler!.save()).toBe(true);
  });
  expect(saved!.regressionWorkspace!.activeRequestId).toBeNull();
  expect(saved!.regressionWorkspace!.executions[0].request.requestId).toBe(oldId);
  expect(saved!.regressionWorkspace!.draftHistory).toHaveLength(2);
  expect(props.onDirtyChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "解析を実行" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "SVGを書き出す" })).toBeEnabled());
  expect(runner).toHaveBeenCalledOnce();
  expect(runner.mock.calls[0][0].requestId).not.toBe(oldId);
  await act(async () => {
    expect(await handler!.save()).toBe(true);
  });
  expect(saved!.regressionWorkspace!.executions).toHaveLength(2);
  expect(saved!.regressionWorkspace!.activeRequestId).not.toBe(oldId);
}, 15000);
