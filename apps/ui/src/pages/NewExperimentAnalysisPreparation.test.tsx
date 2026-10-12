import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NewExperimentPage } from "./NewExperimentPage";
import { AnalysisEngineResultSchema, type AnalysisEngineRequest } from "@lsaa/analysis-contracts";
import type { SaveProjectAction } from "../app/projectActions";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
});

it("keeps an explicit zero reference through real canonical paste and reaches one-sample Statistics", async () => {
  vi.stubEnv("VITE_EXPERIMENT_FIRST_ADAPTIVE_INPUT", "1");
  window.history.replaceState({}, "", "/?adaptiveInput=1");
  const analysisRunner = vi.fn(async (request: AnalysisEngineRequest) => AnalysisEngineResultSchema.parse({
    protocolVersion: request.protocolVersion, requestId: request.requestId, status: "ok",
    engine: { name: "lsaa-python", version: "0.15.2", packages: {} },
    estimates: [{ name: "mean_difference_from_reference", value: 2, standardError: 0.577350269,
      confidenceInterval: { level: 0.95, lower: -0.4841377, upper: 4.4841377 } }],
    tests: [{ name: "one_sample_t_test", statisticName: "t", statistic: 3.464101615,
      degreesOfFreedom: [2], pValue: 0.0741799, adjustedPValue: null,
      effectSizeName: "cohen_dz", effectSize: 2 }],
    diagnostics: [{ code: "explicit_one_sample_reference", message: "Explicit reference 0." }],
    warnings: [], completedAt: "2026-10-12T00:00:00Z",
  }));
  const saveProject = vi.fn<SaveProjectAction>(async (state) => ({ state, target: "single-reference-test.lsa" }));
  render(<NewExperimentPage browserPreview onNavigate={vi.fn()} analysisAvailable analysisRunner={analysisRunner} saveProject={saveProject} />);
  fireEvent.click(screen.getByRole("button", { name: "実験から始めるを開く" }));
  fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
    target: { value: "Cohort" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), { target: { value: "Sample" } });
  fireEvent.change(screen.getByPlaceholderText("例：細胞生存率"), { target: { value: "Signal" } });
  fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), {
    target: { value: "dish" },
  });
  fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
  fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));
  fireEvent.click(screen.getByRole("radio", { name: "既知の基準値と比較する" }));
  fireEvent.change(screen.getByLabelText("one-sample基準値"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "この設定で入力表へ進む" }));
  fireEvent.paste(screen.getByRole("textbox", { name: "入力行 1・Sample・Signal" }), {
    clipboardData: { getData: () => "1\n2\n3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "＋ グラフを作成" }));
  fireEvent.click(screen.getByRole("button", { name: "このグラフを作成" }));
  fireEvent.click(screen.getByRole("button", { name: "統計" }));
  await waitFor(() => expect(screen.queryByText("群比較には2条件以上が必要です")).not.toBeInTheDocument());
  expect(screen.getByText("one-sample t-test", { exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
  expect(await screen.findByText("解析完了（ローカル）")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "プロジェクトを保存" }));
  await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
  expect(saveProject.mock.calls[0][0].experimentWorkspace?.analysisIntent).toEqual({
    kind: "single_cohort", mode: "one_sample", referenceValue: 0,
  });
});

it("retains the real biological answers on preparation back and reaches the single-cohort input table", () => {
  vi.stubEnv("VITE_EXPERIMENT_FIRST_ADAPTIVE_INPUT", "1");
  window.history.replaceState({}, "", "/?adaptiveInput=1");
  const dirty = vi.fn();
  render(<NewExperimentPage browserPreview onNavigate={vi.fn()} onDirtyChange={dirty} />);
  fireEvent.click(screen.getByRole("button", { name: "実験から始めるを開く" }));
  fireEvent.change(screen.getByLabelText("実験タイトル（任意）"), {
    target: { value: "Single sample plan" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "処理・群分け 1の名前" }), {
    target: { value: "Treatment" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "行 1 列 1" }), {
    target: { value: "Sample" },
  });
  fireEvent.change(screen.getByPlaceholderText("例：細胞生存率"), { target: { value: "Signal" } });
  fireEvent.change(screen.getByPlaceholderText("例：culture dish、mouse、donor由来試料"), {
    target: { value: "dish" },
  });
  fireEvent.click(screen.getByRole("radio", { name: /条件ごとに別々のもの/ }));
  fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));
  expect(screen.getByRole("heading", { name: "入力前の計算・解析設定" })).toBeVisible();
  expect(dirty).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "← 実験内容へ戻る" }));
  expect(screen.getByLabelText("実験タイトル（任意）")).toHaveValue("Single sample plan");
  expect(screen.getByRole("textbox", { name: "行 1 列 1" })).toHaveValue("Sample");
  fireEvent.click(screen.getByRole("button", { name: "この内容で入力表を作る" }));
  fireEvent.click(screen.getByRole("button", { name: "この設定で入力表へ進む" }));
  expect(screen.getByRole("button", { name: "実験の組み立てを修正" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "入力行 1・Sample・Signal" })).toHaveValue("");
});
