import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";

import type { AnalysisRunner } from "../app/analysisClient";
import { ComparisonWizard } from "./ComparisonWizard";

const completedResult: AnalysisEngineResult = {
  protocolVersion: "0.1.0",
  requestId: "request.fixture",
  status: "ok",
  engine: {
    name: "lsaa-python",
    version: "0.1.0",
    packages: { numpy: "2.3.5", scipy: "1.18.0" },
  },
  estimates: [
    {
      name: "mean difference",
      value: 2.5,
      standardError: 0.4,
      confidenceInterval: { level: 0.95, lower: 1.4, upper: 3.6 },
    },
  ],
  tests: [
    {
      name: "primary",
      statisticName: "t",
      statistic: 6.25,
      degreesOfFreedom: [4],
      pValue: 0.000012,
      adjustedPValue: null,
      effectSizeName: "Cohen's d",
      effectSize: 1.9,
    },
  ],
  diagnostics: [],
  warnings: [],
  completedAt: "2026-08-20T12:00:00+09:00",
};

const engineValidationResult: AnalysisEngineResult = {
  ...completedResult,
  requestId: "request.validation",
  status: "validation_error",
  estimates: [],
  tests: [],
  diagnostics: [{ code: "invalid_fixture", message: "このテスト入力はエンジンに拒否されました。" }],
  warnings: [],
};

const correlationResult: AnalysisEngineResult = {
  protocolVersion: "0.5.0",
  requestId: "request.correlation",
  status: "ok",
  engine: {
    name: "fixture-correlation-engine",
    version: "0.5.0",
    packages: { scipy: "1.18.0" },
  },
  estimates: [
    {
      name: "correlation_coefficient",
      value: 0.82,
      standardError: null,
      confidenceInterval: { level: 0.95, lower: 0.42, upper: 0.96 },
    },
  ],
  tests: [
    {
      name: "pearson_correlation",
      statisticName: "r",
      statistic: 0.82,
      degreesOfFreedom: [1],
      pValue: 0.045,
      adjustedPValue: null,
      effectSizeName: "r",
      effectSize: 0.82,
    },
  ],
  diagnostics: [{ code: "association_not_causation", message: "相関は因果関係を示しません。" }],
  warnings: [],
  completedAt: "2026-08-20T12:00:00+09:00",
};

function openSheet(analysisRunner: AnalysisRunner, matched = false) {
  render(
    <ComparisonWizard
      purpose="microscopy"
      onBack={() => undefined}
      analysisRunner={analysisRunner}
    />,
  );
  if (matched) {
    fireEvent.click(screen.getByLabelText(/同じ生物学的単位を両条件で測定/));
  }
  fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
  fireEvent.click(document.querySelector('[data-outcome-choice="microscopy-intensity"]')!);

  fillTwoConditionUnits();
  fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
  fireEvent.click(screen.getByRole("tab", { name: /2 解析/ }));
  fireEvent.click(screen.getByRole("button", { name: /推奨解析を実行/ }));
}

function fillTwoConditionUnits() {
  const unitTabs = within(screen.getByRole("tablist", { name: "実験単位の選択" })).getAllByRole(
    "tab",
  );
  unitTabs.forEach((tab, unitIndex) => {
    fireEvent.click(tab);
    screen.getAllByRole("spinbutton").forEach((input, conditionIndex) => {
      fireEvent.change(input, {
        target: { value: String(unitIndex * 2 + conditionIndex + 1) },
      });
    });
  });
}

function fillMultiConditionUnits() {
  const unitTabs = within(screen.getByRole("tablist", { name: "実験単位の選択" })).getAllByRole(
    "tab",
  );
  unitTabs.forEach((tab, unitIndex) => {
    fireEvent.click(tab);
    screen.getAllByRole("spinbutton").forEach((input, conditionIndex) => {
      fireEvent.change(input, {
        target: { value: String(unitIndex * 10 + conditionIndex + 1) },
      });
    });
  });
}

describe("analysis result and graph view", () => {
  it("shows D01 result fields and individual graph points", async () => {
    const runner = vi.fn<AnalysisRunner>(async () => completedResult);
    openSheet(runner);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "解析完了（ローカル）" })).toBeVisible(),
    );
    expect(screen.getByRole("heading", { level: 3, name: "D01 · 独立群の比較" })).toBeVisible();
    expect(screen.getByText(/平均値の差：2.5/)).toBeVisible();
    expect(screen.getByText(/95% CI：1.4～3.6/)).toBeVisible();
    expect(screen.getByText("t = 6.25")).toBeVisible();
    expect(screen.getByText("自由度：4")).toBeVisible();
    expect(screen.getByText("1.20e-5")).toBeVisible();
    expect(screen.getByText("Cohen's d")).toBeVisible();
    expect(screen.getAllByText(/lsaa-python 0.1.0/)[0]).toBeVisible();
    expect(screen.getByText("解析方法（日本語）")).toBeVisible();
    expect(screen.getByText(/解析テンプレート：D01/)).toBeVisible();
    expect(screen.getByText(/エラーバー：平均±SD/)).toBeVisible();
    expect(document.querySelector('[data-graph-type="dot_summary"]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /3 グラフ/ }));
    expect(document.querySelector('[data-graph-type="dot_summary"]')).toBeInTheDocument();
    expect(document.querySelectorAll("[data-graph-point]")).toHaveLength(6);
    expect(screen.getByLabelText("グラフのエクスポート")).toBeVisible();
    expect(screen.getByRole("button", { name: "SVGをダウンロード" })).toBeVisible();
    expect(screen.getByRole("button", { name: "SVGをコピー" })).toBeVisible();
    expect(screen.getByRole("button", { name: "解析済みデータCSVをダウンロード" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "論文向けの外観" })).toBeVisible();
    fireEvent.change(screen.getByRole("slider", { name: "点の大きさ" }), {
      target: { value: "8" },
    });
    expect(document.querySelector("[data-graph-point]")).toHaveAttribute("r", "8");
    fireEvent.click(screen.getByRole("button", { name: "配色：色覚に配慮" }));
    expect(document.querySelector("[data-graph-point]")).toHaveAttribute("fill", "#0072b2");
    fireEvent.change(screen.getByRole("textbox", { name: "縦軸ラベル" }), {
      target: { value: "測定値" },
    });
    expect(screen.getByRole("img", { name: /測定値：2条件のグラフ/ })).toBeInTheDocument();
    expect(screen.getByText(/解析結果・入力データは変更されません/)).toBeVisible();
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("renders paired lines for D02", async () => {
    const runner = vi.fn<AnalysisRunner>(async () => completedResult);
    openSheet(runner, true);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "解析完了（ローカル）" })).toBeVisible(),
    );
    expect(screen.getByRole("heading", { level: 3, name: "D02 · 対応のある比較" })).toBeVisible();
    expect(document.querySelector('[data-graph-type="paired_dot"]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /3 グラフ/ }));
    expect(document.querySelector('[data-graph-type="paired_dot"]')).toBeInTheDocument();
    expect(document.querySelectorAll("[data-paired-line]")).toHaveLength(3);
  });

  it("runs D09 from the relationship-form wizard and renders a publication scatter plot", async () => {
    const runner = vi.fn<AnalysisRunner>(async () => correlationResult);
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} analysisRunner={runner} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /2つの測定値の関係を見たい/ }));
    expect(screen.getByRole("heading", { name: "同じ実験単位の2つの測定値を入力" })).toBeVisible();
    expect(screen.getByText(/推奨手法：Pearsonの相関/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(document.querySelector('[data-outcome-choice="microscopy-intensity"]')!);

    fillTwoConditionUnits();
    fireEvent.click(screen.getByRole("button", { name: /検証して続ける/ }));
    fireEvent.click(screen.getByRole("tab", { name: /2 解析/ }));
    fireEvent.click(screen.getByRole("button", { name: /推奨解析を実行/ }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "解析完了（ローカル）" })).toBeVisible(),
    );
    expect(screen.getByRole("region", { name: "D09相関解析結果" })).toBeVisible();
    expect(screen.getAllByText("r = 0.82")).toHaveLength(2);
    expect(screen.getByText(/95% CI：0.42～0.96/)).toBeVisible();
    expect(screen.getByText("0.045")).toBeVisible();
    const correlationSummary = screen.getByRole("region", { name: "D09相関解析結果" });
    expect(within(correlationSummary).getByText("統計上のn").nextElementSibling).toHaveTextContent(
      "3",
    );
    expect(runner.mock.calls[0]?.[0].templateId).toBe("D09");
    expect(runner.mock.calls[0]?.[0].protocolVersion).toBe("0.5.0");

    fireEvent.click(screen.getByRole("tab", { name: /3 グラフ/ }));
    expect(document.querySelector('[data-graph-type="scatter"]')).toBeInTheDocument();
    expect(document.querySelectorAll("[data-graph-point]")).toHaveLength(3);
    fireEvent.change(screen.getByRole("textbox", { name: "横軸ラベル" }), {
      target: { value: "測定値X（編集済み）" },
    });
    expect(
      screen.getByRole("img", { name: /測定値X（編集済み）と測定値Yの散布図/ }),
    ).toBeInTheDocument();
  });

  it("shows D04 repeated-measures results and explicit matched connections", async () => {
    const runner = vi.fn<AnalysisRunner>(async (request) => ({
      protocolVersion: "0.3.0",
      requestId: request.requestId,
      status: "ok",
      engine: { name: "fixture-engine", version: "0.3.0", packages: { scipy: "1.18.0" } },
      estimates: [
        {
          name: "condition.1_minus_condition.2",
          value: -1,
          standardError: 0.2,
          confidenceInterval: { level: 0.9833, lower: -1.8, upper: -0.2 },
        },
      ],
      tests: [
        {
          name: "one_way_repeated_measures_anova",
          statisticName: "F",
          statistic: 8.2,
          degreesOfFreedom: [2, 4],
          pValue: 0.038,
          adjustedPValue: null,
          effectSizeName: "partial_eta_squared",
          effectSize: 0.8,
        },
        {
          name: "holm_paired:condition.1:condition.2",
          statisticName: "t",
          statistic: -5,
          degreesOfFreedom: [2],
          pValue: 0.02,
          adjustedPValue: 0.06,
          effectSizeName: "cohen_dz",
          effectSize: -2.9,
        },
      ],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-20T12:00:00+09:00",
    }));
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} analysisRunner={runner} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /同じ動物・試料を複数条件で測定した/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "繰り返し測定した条件の数" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(document.querySelector('[data-outcome-choice="microscopy-intensity"]')!);
    fillMultiConditionUnits();
    fireEvent.click(screen.getByRole("button", { name: /検証して解析へ/ }));
    fireEvent.click(screen.getByRole("tab", { name: /2 解析/ }));
    fireEvent.click(screen.getByRole("button", { name: "推奨解析を実行" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 4, name: "反復測定分散分析" })).toBeVisible(),
    );
    expect(screen.getByText(/Holm補正を用いた/)).toBeVisible();
    expect(screen.getByText("対照 vs 処理A")).toBeVisible();
    const request = runner.mock.calls[0]?.[0];
    expect(request?.templateId).toBe("D04");
    expect(request?.observations.every((observation) => "pairId" in observation)).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: /3 グラフ/ }));
    expect(document.querySelector('[data-graph-type="paired_dot"]')).toBeInTheDocument();
    expect(document.querySelectorAll("[data-paired-line]")).toHaveLength(6);
  });

  it("shows D05 interaction first, then main effects and Holm-adjusted cell comparisons", async () => {
    const runner = vi.fn<AnalysisRunner>(async (request) => ({
      protocolVersion: "0.4.0",
      requestId: request.requestId,
      status: "ok",
      engine: { name: "fixture-engine", version: "0.4.0", packages: { scipy: "1.18.0" } },
      estimates: [
        {
          name: "condition.a1.b1_minus_condition.a2.b2",
          value: -6,
          standardError: 1.1,
          confidenceInterval: { level: 0.9917, lower: -9.2, upper: -2.8 },
        },
      ],
      tests: [
        {
          name: "type3_interaction",
          statisticName: "F",
          statistic: 14.2,
          degreesOfFreedom: [1, 8],
          pValue: 0.0055,
          adjustedPValue: null,
          effectSizeName: "partial_eta_squared",
          effectSize: 0.64,
        },
        {
          name: "type3_factor_a",
          statisticName: "F",
          statistic: 9.1,
          degreesOfFreedom: [1, 8],
          pValue: 0.0167,
          adjustedPValue: null,
          effectSizeName: "partial_eta_squared",
          effectSize: 0.53,
        },
        {
          name: "type3_factor_b",
          statisticName: "F",
          statistic: 4.5,
          degreesOfFreedom: [1, 8],
          pValue: 0.066,
          adjustedPValue: null,
          effectSizeName: "partial_eta_squared",
          effectSize: 0.36,
        },
        {
          name: "holm_welch:condition.a1.b1:condition.a2.b2",
          statisticName: "t",
          statistic: -5.45,
          degreesOfFreedom: [3.8],
          pValue: 0.006,
          adjustedPValue: 0.036,
          effectSizeName: "hedges_g",
          effectSize: -2.3,
        },
      ],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-20T12:00:00+09:00",
    }));
    render(
      <ComparisonWizard purpose="microscopy" onBack={() => undefined} analysisRunner={runner} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /2種類の処置を組み合わせた/ }));
    fireEvent.click(screen.getByRole("button", { name: /Control \/ siRNA #1〜#3 × 薬剤 −\/\+/ }));
    fireEvent.click(screen.getByRole("button", { name: /このデザインを確定/ }));
    fireEvent.click(document.querySelector('[data-outcome-choice="microscopy-intensity"]')!);
    fillMultiConditionUnits();
    fireEvent.click(screen.getByRole("button", { name: /検証して解析へ/ }));
    fireEvent.click(screen.getByRole("tab", { name: /2 解析/ }));
    fireEvent.click(screen.getByRole("button", { name: "推奨解析を実行" }));

    await waitFor(() => expect(screen.getByText("siRNA × 薬剤（交互作用）")).toBeVisible());
    expect(screen.getByText("Holm補正を用いた8条件の全ペア比較")).toBeVisible();
    expect(screen.getByText("Control / − vs siRNA #1 / +")).toBeVisible();
    expect(runner.mock.calls[0]?.[0].templateId).toBe("D05");

    fireEvent.click(screen.getByRole("tab", { name: /3 グラフ/ }));
    expect(document.querySelector('[data-graph-type="grouped_dot"]')).toBeInTheDocument();
    expect(document.querySelectorAll(".graph-condition-label")).toHaveLength(4);
    expect(document.querySelectorAll(".graph-legend span")).toHaveLength(2);
    expect(document.querySelectorAll("[data-factor-level-group]")).toHaveLength(2);
  });

  it("shows an engine validation error without losing entered values", async () => {
    const runner = vi.fn<AnalysisRunner>(async () => engineValidationResult);
    openSheet(runner);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "解析エラー（入力検証）" })).toBeVisible(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "このテスト入力はエンジンに拒否されました。",
    );
    expect(screen.getByText(/入力したデータは保持されています/)).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /1 データ入力/ }));
    const unitTabs = within(screen.getByRole("tablist", { name: "実験単位の選択" }));
    fireEvent.click(unitTabs.getByRole("tab", { name: "N1" }));
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
    fireEvent.click(unitTabs.getByRole("tab", { name: "N3" }));
    expect(screen.getByDisplayValue("6")).toBeInTheDocument();
  });
});
