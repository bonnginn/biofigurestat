import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  AnalysisEngineRequestSchema,
  AnalysisEngineResultSchema,
  type AnalysisEngineResult,
} from "@lsaa/analysis-contracts";
import { ExperimentDesignSchema } from "@lsaa/domain";
import { vi } from "vitest";

import type { DraftAnalysisAssessment } from "../../app/experimentDraftAnalysis";
import { recordUsageMilestone } from "../../app/usageTelemetry";
import { GraphStatisticsPanel } from "./GraphStatisticsPanel";

vi.mock("../../app/usageTelemetry", () => ({ recordUsageMilestone: vi.fn() }));

const request = AnalysisEngineRequestSchema.parse({
  protocolVersion: "0.1.0",
  requestId: "request.test",
  projectId: "project.test",
  analysisId: "analysis.test",
  templateId: "D01",
  templateVersion: "0.1.0",
  method: "welch_t",
  contrastConditionIds: ["condition.vehicle", "condition.drug"],
  observations: [
    {
      observationId: "observation.v1",
      conditionId: "condition.vehicle",
      experimentalUnitId: "dish.v1",
      value: 0.8,
    },
    {
      observationId: "observation.v2",
      conditionId: "condition.vehicle",
      experimentalUnitId: "dish.v2",
      value: 0.82,
    },
    {
      observationId: "observation.d1",
      conditionId: "condition.drug",
      experimentalUnitId: "dish.d1",
      value: 0.58,
    },
    {
      observationId: "observation.d2",
      conditionId: "condition.drug",
      experimentalUnitId: "dish.d2",
      value: 0.6,
    },
  ],
  options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
});

const readyAssessment: DraftAnalysisAssessment = {
  state: "ready",
  title: "Welchの2標本t検定を推奨",
  reason: "dishを独立した実験単位として比較します。",
  method: "welch_t",
  recommendedMethod: "welch_t",
  methodChoices: [
    {
      method: "welch_t",
      level: "recommended",
      label: "Welchの2標本t検定",
      explanation: "等分散を仮定しません。",
      enabled: true,
    },
  ],
  commonAlternative: null,
  nByCondition: [
    { conditionId: "condition.vehicle", label: "Vehicle", n: 2 },
    { conditionId: "condition.drug", label: "Drug", n: 2 },
  ],
  missingCount: 0,
  notPlannedCount: 0,
  request,
};

it("does not publish the first pending response after measurements change", async () => {
  let finish!: (result: AnalysisEngineResult) => void;
  const analysisRunner = vi.fn(
    () =>
      new Promise<AnalysisEngineResult>((resolve) => {
        finish = resolve;
      }),
  );
  const onAnalysisChange = vi.fn();
  const props = {
    assessment: readyAssessment,
    design: panelDesign(),
    analysisRunner,
    relationshipAlreadyDeclared: true,
    onAnalysisChange,
  };
  const view = render(<GraphStatisticsPanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
  const changedRequest = AnalysisEngineRequestSchema.parse({
    ...request,
    observations: request.observations.map((row, index) =>
      index === 0 ? { ...row, value: 99 } : row,
    ),
  });
  view.rerender(
    <GraphStatisticsPanel
      {...props}
      assessment={{ ...readyAssessment, request: changedRequest }}
    />,
  );
  await act(async () =>
    finish(
      AnalysisEngineResultSchema.parse({
        protocolVersion: "0.1.0",
        requestId: request.requestId,
        status: "ok",
        engine: { name: "lsaa-python", version: "test", packages: {} },
        estimates: [],
        tests: [],
        diagnostics: [],
        warnings: [],
        completedAt: "2026-08-28T00:00:00.000Z",
      }),
    ),
  );
  expect(onAnalysisChange.mock.calls.some(([value]) => value?.result)).toBe(false);
  expect(screen.getByText(/以前の応答を採用しません/)).toBeVisible();
  expect(screen.getByRole("button", { name: "選択した解析を実行" })).toBeEnabled();
});

it("rejects an engine response belonging to another request", async () => {
  const onAnalysisChange = vi.fn();
  const analysisRunner = vi.fn().mockResolvedValue(
    AnalysisEngineResultSchema.parse({
      protocolVersion: "0.1.0",
      requestId: "request.other",
      status: "ok",
      engine: { name: "lsaa-python", version: "test", packages: {} },
      estimates: [],
      tests: [],
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-28T00:00:00.000Z",
    }),
  );
  render(
    <GraphStatisticsPanel
      assessment={readyAssessment}
      design={panelDesign()}
      analysisRunner={analysisRunner}
      relationshipAlreadyDeclared
      onAnalysisChange={onAnalysisChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
  expect(await screen.findByText(/解析応答が今回の要求と一致しません/)).toBeVisible();
  expect(onAnalysisChange).toHaveBeenCalledWith(null);
  expect(onAnalysisChange.mock.calls.some(([value]) => value?.result)).toBe(false);
});

it("releases the pending state when the scientific context invalidates a run", async () => {
  let finish!: (result: AnalysisEngineResult) => void;
  const analysisRunner = vi.fn(
    () =>
      new Promise<AnalysisEngineResult>((resolve) => {
        finish = resolve;
      }),
  );
  const onAnalysisChange = vi.fn();
  const props = {
    assessment: readyAssessment,
    design: panelDesign(),
    analysisRunner,
    relationshipAlreadyDeclared: true,
    onAnalysisChange,
  };
  const view = render(<GraphStatisticsPanel {...props} analysisContextKey="context.old" />);
  fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
  view.rerender(<GraphStatisticsPanel {...props} analysisContextKey="context.new" />);
  expect(screen.getByRole("button", { name: "選択した解析を実行" })).toBeEnabled();
  await act(async () =>
    finish(
      AnalysisEngineResultSchema.parse({
        protocolVersion: "0.1.0",
        requestId: request.requestId,
        status: "ok",
        engine: { name: "lsaa-python", version: "test", packages: {} },
        estimates: [],
        tests: [],
        diagnostics: [],
        warnings: [],
        completedAt: "2026-08-28T00:00:00.000Z",
      }),
    ),
  );
  expect(onAnalysisChange.mock.calls.some(([value]) => value?.result)).toBe(false);
});

it("shows a concise method and design-based reason before detailed controls", () => {
  render(
    <GraphStatisticsPanel
      assessment={readyAssessment}
      design={panelDesign()}
      analysisRunner={vi.fn()}
    />,
  );

  expect(screen.getByText("推奨: Welchの2標本t検定")).toBeVisible();
  expect(screen.getByText("理由:")).toBeVisible();
  expect(screen.getByText(/dishを独立した実験単位として比較します/)).toBeVisible();
});

const defaultConditionOptions = [
  { id: "condition.vehicle", label: "Vehicle" },
  { id: "condition.drug", label: "Drug" },
] as const;

function panelDesign(
  conditions: readonly Readonly<{ id: string; label: string }>[] = defaultConditionOptions,
  pairing: "independent" | "matched" = "independent",
) {
  return ExperimentDesignSchema.parse({
    schemaVersion: "0.2.0",
    id: "design.statistics-panel",
    name: "Statistics panel fixture",
    purpose: "general_assay",
    outcomes: [{ id: "outcome.value", key: "value", label: "Value", type: "continuous" }],
    factors: [
      {
        id: "factor.condition",
        key: "condition",
        label: "Condition",
        levels: conditions.map((condition, index) => ({
          id: `level.condition.${index + 1}`,
          label: condition.label,
          order: index,
        })),
      },
    ],
    conditions: conditions.map((condition, index) => ({
      ...condition,
      factorLevels: { "factor.condition": `level.condition.${index + 1}` },
    })),
    unitLevels: [
      {
        id: "unit-level.experimental",
        key: "experimental",
        label: "Experimental unit",
        role: "experimental_unit",
        parentLevelId: null,
      },
    ],
    experimentalUnitLevelId: "unit-level.experimental",
    pairing:
      pairing === "matched"
        ? {
            kind: "matched",
            matchLevelId: "unit-level.experimental",
            completePairsRequired: true,
          }
        : { kind: "independent" },
    plannedN: 2,
    normalizationPlans: [],
    primaryContrast: {
      id: "contrast.primary",
      label: "Primary",
      conditionIds: [conditions[0]!.id, conditions[1]!.id],
    },
    wizardRuleVersion: "test.0.1.0",
    wizardDecisions: [],
    createdAt: "2026-08-28T00:00:00.000Z",
  });
}

function multiGroupAssessment(
  conditionOptions: readonly Readonly<{ id: string; label: string }>[],
): DraftAnalysisAssessment {
  const multiGroupRequest = AnalysisEngineRequestSchema.parse({
    protocolVersion: "0.2.0",
    requestId: "request.pairwise.test",
    projectId: "project.test",
    analysisId: "analysis.pairwise.test",
    templateId: "D03",
    templateVersion: "0.1.0",
    method: "welch_anova",
    conditionIds: conditionOptions.map(({ id }) => id),
    contrastIntent: "all_pairs",
    primaryContrastConditionIds: [conditionOptions[0]!.id, conditionOptions[1]!.id],
    observations: conditionOptions.flatMap((condition, conditionIndex) =>
      [0, 1].map((replicate) => ({
        observationId: `observation.${conditionIndex}.${replicate}`,
        conditionId: condition.id,
        experimentalUnitId: `unit.${conditionIndex}.${replicate}`,
        value: conditionIndex + replicate / 10,
      })),
    ),
    options: {
      alternative: "two_sided",
      confidenceLevel: 0.95,
      multiplicityMethod: "games_howell_all_pairs",
    },
  });
  return {
    ...readyAssessment,
    title: "Welch分散分析を推奨",
    reason: "独立した条件を比較します。",
    method: "welch_anova",
    recommendedMethod: "welch_anova",
    methodChoices: [
      {
        method: "welch_anova",
        level: "recommended",
        label: "Welch分散分析",
        explanation: "等分散を仮定しません。",
        enabled: true,
      },
    ],
    nByCondition: conditionOptions.map(({ id, label }) => ({ conditionId: id, label, n: 2 })),
    request: multiGroupRequest,
  };
}

function pairwiseResult(name: string) {
  return AnalysisEngineResultSchema.parse({
    protocolVersion: "0.2.0",
    requestId: "request.pairwise.test",
    status: "ok",
    engine: { name: "lsaa-python", version: "test", packages: {} },
    estimates: [],
    tests: [
      {
        name: "welch_anova",
        statisticName: "F",
        statistic: 5.2,
        degreesOfFreedom: [2, 6],
        pValue: 0.03,
        adjustedPValue: null,
        effectSizeName: null,
        effectSize: null,
      },
      {
        name,
        statisticName: "t",
        statistic: 3.1,
        degreesOfFreedom: [3.8],
        pValue: 0.008,
        adjustedPValue: 0.016,
        effectSizeName: "hedges_g",
        effectSize: 1.2,
      },
    ],
    diagnostics: [],
    warnings: [],
    completedAt: "2026-08-28T00:00:00.000Z",
  });
}

describe("GraphStatisticsPanel validation repair routes", () => {
  it("offers request-scoped cancellation while the local analysis is running", async () => {
    const analysisRunner = vi.fn(() => new Promise<AnalysisEngineResult>(() => undefined));
    render(
      <GraphStatisticsPanel
        assessment={readyAssessment}
        design={panelDesign()}
        analysisRunner={analysisRunner}
        relationshipAlreadyDeclared
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    expect(await screen.findByRole("button", { name: "解析を中止" })).toBeVisible();
  });

  it("persists the package-owned recommendation rather than UI display copy", async () => {
    const onAnalysisChange = vi.fn();
    const analysisRunner = vi.fn().mockResolvedValue(
      AnalysisEngineResultSchema.parse({
        protocolVersion: "0.1.0",
        requestId: "request.test",
        status: "ok",
        engine: { name: "lsaa-python", version: "test", packages: {} },
        estimates: [],
        tests: [],
        diagnostics: [],
        warnings: [],
        completedAt: "2026-08-28T00:00:00.000Z",
      }),
    );
    render(
      <GraphStatisticsPanel
        assessment={{ ...readyAssessment, reason: "研究者向けの日本語表示文" }}
        design={panelDesign()}
        outcomeId="outcome.value"
        analysisRunner={analysisRunner}
        relationshipAlreadyDeclared
        onAnalysisChange={onAnalysisChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    expect(await screen.findByRole("group", { name: "統計解析結果" })).toBeVisible();
    expect(onAnalysisChange).toHaveBeenCalledWith(
      expect.objectContaining({
        recommendation: expect.objectContaining({
          reasonCode: "two_independent_condition_groups",
          recommendedMethod: "welch_t",
        }),
      }),
    );
    expect(onAnalysisChange.mock.calls.at(-1)?.[0]?.recommendation.explanation).not.toBe(
      "研究者向けの日本語表示文",
    );
  });

  it("safe-stops before engine execution when request and design disagree", async () => {
    const analysisRunner = vi.fn();
    render(
      <GraphStatisticsPanel
        assessment={readyAssessment}
        design={panelDesign(defaultConditionOptions, "matched")}
        outcomeId="outcome.value"
        analysisRunner={analysisRunner}
        relationshipAlreadyDeclared
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "実験構造と解析要求が一致しないため停止しました",
    );
    expect(analysisRunner).not.toHaveBeenCalled();
  });

  it("records a manual request and completion without researcher values or labels", async () => {
    vi.mocked(recordUsageMilestone).mockClear();
    const analysisRunner = vi.fn().mockResolvedValue(
      AnalysisEngineResultSchema.parse({
        protocolVersion: "0.1.0",
        requestId: "request.test",
        status: "ok",
        engine: { name: "lsaa-python", version: "test", packages: {} },
        estimates: [],
        tests: [],
        diagnostics: [],
        warnings: [],
        completedAt: "2026-08-28T00:00:00.000Z",
      }),
    );
    render(
      <GraphStatisticsPanel
        assessment={readyAssessment}
        design={panelDesign()}
        outcomeId="outcome.value"
        analysisRunner={analysisRunner}
        relationshipAlreadyDeclared
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    expect(await screen.findByRole("group", { name: "統計解析結果" })).toBeVisible();
    expect(recordUsageMilestone).toHaveBeenNthCalledWith(1, "home", "statistics_requested");
    expect(recordUsageMilestone).toHaveBeenNthCalledWith(2, "home", "statistics_completed");
    expect(recordUsageMilestone).toHaveBeenCalledTimes(2);
  });

  it("shows important diagnostics immediately and marks warning severity", async () => {
    const analysisRunner = vi.fn().mockResolvedValue(
      AnalysisEngineResultSchema.parse({
        protocolVersion: "0.1.0",
        requestId: "request.test",
        status: "ok",
        engine: { name: "lsaa-python", version: "test", packages: {} },
        estimates: [],
        tests: [],
        diagnostics: [],
        warnings: [
          {
            code: "small_sample_size",
            message: "Interpret this estimate cautiously.",
          },
        ],
        completedAt: "2026-08-28T00:00:00.000Z",
      }),
    );
    const { container } = render(
      <GraphStatisticsPanel
        assessment={readyAssessment}
        design={panelDesign()}
        outcomeId="outcome.value"
        analysisRunner={analysisRunner}
        relationshipAlreadyDeclared
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    expect(await screen.findByText("重要な注意（1件）")).toBeVisible();
    const details = container.querySelector(".experiment-graph-analysis-diagnostics");
    expect(details).toHaveAttribute("open");
    expect(details).toHaveClass("is-important");
    expect(details?.querySelector('[data-severity="warning"]')).not.toBeNull();
  });

  it("shows the exact D01 duplicate-unit cause returned by the engine", async () => {
    vi.mocked(recordUsageMilestone).mockClear();
    const analysisRunner = vi.fn().mockResolvedValue(
      AnalysisEngineResultSchema.parse({
        protocolVersion: "0.1.0",
        requestId: "request.test",
        status: "validation_error",
        engine: { name: "lsaa-python", version: "test", packages: {} },
        estimates: [],
        tests: [],
        diagnostics: [
          {
            code: "invalid_request",
            message: "Each independent D01 unit can contribute only one analyzed value",
          },
        ],
        warnings: [],
        completedAt: "2026-08-28T00:00:00.000Z",
      }),
    );
    render(
      <GraphStatisticsPanel
        assessment={readyAssessment}
        design={panelDesign()}
        outcomeId="outcome.value"
        analysisRunner={analysisRunner}
        relationshipAlreadyDeclared
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("独立群の実験単位IDが重複");
    expect(screen.getByRole("alert")).toHaveTextContent("Dish ID");
    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "statistics_requested");
    expect(recordUsageMilestone).toHaveBeenCalledWith("home", "safe_stop");
    expect(recordUsageMilestone).not.toHaveBeenCalledWith("home", "statistics_completed");
  });

  it("offers a targeted data route and an explicit non-coercive alternative", () => {
    const onCorrectionRequested = vi.fn();
    const onSelectedMethodChange = vi.fn();
    const analysisRunner = vi.fn();
    const assessment: DraftAnalysisAssessment = {
      ...readyAssessment,
      state: "unsupported",
      title: "すべての対応差が同じため、対応のあるt検定を計算できません",
      reason: "差の標準誤差が0です。",
      method: "paired_t",
      recommendedMethod: "paired_t",
      request: null,
      correction: {
        code: "PAIRED_DIFFERENCES_HAVE_ZERO_VARIANCE",
        target: "data_values",
        title: "すべての対応差が同じため、対応のあるt検定を計算できません",
        message: "入力値は変更しません。",
        actionLabel: "データで対応値を確認",
        suggestedMethod: "wilcoxon_signed_rank",
        experimentIds: ["experiment.1"],
        focusExperimentId: "experiment.1",
      },
    };
    render(
      <GraphStatisticsPanel
        assessment={assessment}
        design={panelDesign()}
        analysisRunner={analysisRunner}
        onCorrectionRequested={onCorrectionRequested}
        onSelectedMethodChange={onSelectedMethodChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "データで対応値を確認" }));
    fireEvent.click(screen.getByRole("button", { name: "Wilcoxonの代替案を選ぶ" }));

    expect(onCorrectionRequested).toHaveBeenCalledWith(assessment.correction);
    expect(onSelectedMethodChange).toHaveBeenCalledWith("wilcoxon_signed_rank");
    expect(analysisRunner).not.toHaveBeenCalled();
  });

  it("shows bounded stable-unit missing-condition details with a targeted data route", () => {
    const onCorrectionRequested = vi.fn();
    const incompleteMatchedSets = Array.from({ length: 8 }, (_, index) => ({
      pairId: `mouse.${index + 1}`,
      experimentId: `experiment.${index + 1}`,
      experimentLabel: `Mouse ${index + 1}`,
      missingConditions:
        index === 0
          ? Array.from({ length: 6 }, (_unused, conditionIndex) => ({
              conditionId: `condition.${conditionIndex + 1}`,
              label: `Condition ${conditionIndex + 1}`,
            }))
          : [{ conditionId: "condition.drug", label: "Drug" }],
    }));
    const assessment: DraftAnalysisAssessment = {
      ...readyAssessment,
      missingCount: 8,
      inputDiagnostics: [
        {
          code: "INCOMPLETE_MATCHED_SET",
          title: "対応がそろっていない組が8組あります",
          message:
            "完全な組だけを対応解析に使い、不完全な組の入力値と実験設計は保持します。独立群には読み替えません。",
          incompleteMatchedSets,
          correction: {
            code: "INCOMPLETE_MATCHED_SET",
            target: "data_values",
            title: "対応データの不足条件を確認してください",
            message: "表の値は保持したままです。",
            actionLabel: "データで欠けた対応値を確認",
            experimentIds: incompleteMatchedSets.map(({ experimentId }) => experimentId),
            focusExperimentId: "experiment.1",
          },
        },
      ],
    };
    render(
      <GraphStatisticsPanel
        assessment={assessment}
        design={panelDesign(defaultConditionOptions, "matched")}
        analysisRunner={vi.fn()}
        onCorrectionRequested={onCorrectionRequested}
      />,
    );

    expect(screen.getByText("対応がそろっていない組が8組あります").closest("details")).toHaveAttribute("open");
    const detailList = screen.getByRole("list", {
      name: "stable unit / pair IDごとの不足条件",
    });
    expect(within(detailList).getAllByRole("listitem")).toHaveLength(6);
    expect(detailList).toHaveTextContent("mouse.1");
    expect(detailList).toHaveTextContent(
      "Condition 1、Condition 2、Condition 3、Condition 4、ほか2条件",
    );
    expect(detailList).not.toHaveTextContent("mouse.7");
    expect(screen.getByText("ほか2組はデータ表で確認できます。")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "データで欠けた対応値を確認" }));
    expect(onCorrectionRequested).toHaveBeenCalledWith(
      assessment.inputDiagnostics?.[0]?.correction,
    );
  });

  it("asks the Case 3 run/source question before enabling an independent dish analysis", () => {
    const onCorrectionRequested = vi.fn();
    render(
      <GraphStatisticsPanel
        assessment={readyAssessment}
        design={panelDesign()}
        outcomeId="outcome.value"
        analysisRunner={vi.fn()}
        conditionOptions={[
          { id: "condition.vehicle", label: "Vehicle" },
          { id: "condition.drug", label: "Drug" },
        ]}
        independentNestedSourceContext={{
          unitLabel: "culture dish",
          nestedObservationLabel: "Cell",
        }}
        onCorrectionRequested={onCorrectionRequested}
      />,
    );

    const runButton = screen.getByRole("button", { name: "選択した解析を実行" });
    expect(runButton).toBeDisabled();
    const confirmation = screen.getByRole("checkbox", {
      name: /同じrun\/source preparationから分けた組ではなく/,
    });
    fireEvent.click(screen.getByText("確認内容の詳細"));
    fireEvent.click(screen.getByRole("button", { name: "共通材料・実験回を確認" }));
    expect(onCorrectionRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "NESTED_CONDITION_SOURCE_RELATIONSHIP_UNCONFIRMED",
        target: "experiment_structure",
      }),
    );

    fireEvent.click(confirmation);
    expect(runButton).toBeEnabled();
  });
});

describe("GraphStatisticsPanel pairwise result table", () => {
  it("uses the executable method when a prior multi-group preference no longer fits", () => {
    render(<GraphStatisticsPanel
      assessment={readyAssessment}
      selectedMethod="one_way_anova"
      design={panelDesign()}
      analysisRunner={vi.fn()}
      relationshipAlreadyDeclared
    />);
    expect(screen.getByRole("radio", { name: /Welchの2標本t検定/ })).toBeChecked();
    expect(screen.getByText(/推奨法を選択中：Welchの2標本t検定/)).toBeVisible();
    expect(screen.queryByText(/推奨とは異なる方法として/)).toBeNull();
  });

  it("updates the displayed and persisted decision when contrast intent changes the method", async () => {
    const conditionOptions = [
      { id: "control", label: "Control" },
      { id: "drug", label: "Drug" },
      { id: "rescue", label: "Rescue" },
    ];
    const base = multiGroupAssessment(conditionOptions);
    if (base.request?.protocolVersion !== "0.2.0") throw new Error("wrong fixture");
    const analysisRunner = vi.fn().mockResolvedValue(pairwiseResult("dunnett:drug:control"));
    const onAnalysisChange = vi.fn();
    const props = {
      design: panelDesign(conditionOptions),
      outcomeId: "outcome.value",
      analysisRunner,
      onAnalysisChange,
      conditionOptions,
      relationshipAlreadyDeclared: true,
    };
    const { rerender } = render(<GraphStatisticsPanel {...props} assessment={base} />);
    expect(screen.getByText(/推奨法を選択中：Welch/)).toBeVisible();
    const controlAssessment: DraftAnalysisAssessment = {
      ...base,
      method: "one_way_anova",
      methodChoices: [
        {
          method: "one_way_anova",
          level: "alternative",
          label: "一元配置分散分析 + Dunnett",
          explanation: "対照と比較します。",
          enabled: true,
        },
      ],
      request: {
        ...base.request,
        method: "one_way_anova",
        contrastIntent: "control_vs_many",
        controlConditionId: "control",
        options: { ...base.request.options, multiplicityMethod: "dunnett_control_vs_many" },
      },
    };
    // No method-radio click: the contrast selector chose a compatible method.
    rerender(<GraphStatisticsPanel {...props} assessment={controlAssessment} />);
    expect(
      screen.getByText(/推奨とは異なる方法として一元配置分散分析 \+ Dunnettを選択中/),
    ).toBeVisible();
    expect(screen.queryByText(/推奨法を選択中：Welch/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
    await screen.findByRole("group", { name: "統計解析結果" });
    expect(analysisRunner).toHaveBeenCalledWith(
      expect.objectContaining({ method: "one_way_anova" }),
    );
    expect(onAnalysisChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recommendation: expect.objectContaining({
          decision: { kind: "overridden", selectedMethod: "one_way_anova" },
        }),
      }),
    );
  });

  it("explains the executed Dunnett comparison family only after success", async () => {
    const conditionOptions = [
      { id: "control", label: "Control" },
      { id: "drug", label: "Drug" },
      { id: "rescue", label: "Rescue" },
    ];
    const base = multiGroupAssessment(conditionOptions);
    if (base.request?.protocolVersion !== "0.2.0") throw new Error("wrong fixture");
    const request = {
      ...base.request,
      method: "one_way_anova" as const,
      contrastIntent: "control_vs_many" as const,
      controlConditionId: "control",
      options: { ...base.request.options, multiplicityMethod: "dunnett_control_vs_many" as const },
    };
    const assessment = {
      ...base,
      request,
      method: "one_way_anova" as const,
      recommendedMethod: "one_way_anova" as const,
      methodChoices: [
        {
          method: "one_way_anova" as const,
          level: "recommended" as const,
          label: "一元配置分散分析",
          explanation: "等分散を仮定します。",
          enabled: true,
        },
      ],
    };
    const result = pairwiseResult("dunnett:drug:control");
    const analysisRunner = vi.fn().mockResolvedValue(result);
    render(
      <GraphStatisticsPanel
        assessment={assessment}
        design={panelDesign(conditionOptions)}
        outcomeId="outcome.value"
        analysisRunner={analysisRunner}
        conditionOptions={conditionOptions}
        relationshipAlreadyDeclared
      />,
    );
    expect(screen.queryByText(/Dunnettの95%同時信頼区間/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));
    const resultGroup = await screen.findByRole("group", { name: "統計解析結果" });
    expect(resultGroup).toHaveTextContent("各条件 − 明示した対照（control）");
    expect(resultGroup).toHaveTextContent("2件の比較をまとめて調整");
    expect(resultGroup).toHaveTextContent("数値積分による近似値");
  });

  it("shows comparison labels and adjusted p-values without exposing condition IDs", async () => {
    const conditionOptions = [
      { id: "group:control", label: "Control" },
      { id: "group:drug", label: "Drug" },
      { id: "group:rescue", label: "Rescue" },
    ] as const;
    const analysisRunner = vi
      .fn()
      .mockResolvedValue({...pairwiseResult("games_howell:group:control:group:drug"), estimates:[{name:"group:control_minus_group:drug",value:-1,standardError:.2,confidenceInterval:{level:.95,lower:-1.4,upper:-.6}}]});
    render(
      <GraphStatisticsPanel
        assessment={multiGroupAssessment(conditionOptions)}
        design={panelDesign(conditionOptions)}
        outcomeId="outcome.value"
        analysisRunner={analysisRunner}
        conditionOptions={conditionOptions}
        relationshipAlreadyDeclared
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    const table = await screen.findByRole("table", { name: "条件間比較の結果" });
    expect(within(table).getByRole("rowheader", { name: "Control vs Drug" })).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: "調整済みp値" })).toBeVisible();
    expect(table).toHaveTextContent("0.016");
    expect(table).not.toHaveTextContent("group:control");
    expect(table).not.toHaveTextContent("group:drug");
    const estimates = document.querySelector('dl[aria-label="主要な推定値"]')!;
    expect(estimates).toHaveTextContent("95% CI -1.4–-0.6、調整済みp = 0.016（未調整p = 0.008）");
    expect(estimates).not.toHaveTextContent("group:control");
  });

  it("does not guess or expose a pair when colon-containing IDs are ambiguous", async () => {
    const conditionOptions = [
      { id: "a", label: "A" },
      { id: "b:c", label: "BC" },
      { id: "a:b", label: "AB" },
      { id: "c", label: "C" },
    ] as const;
    const analysisRunner = vi.fn().mockResolvedValue(pairwiseResult("games_howell:a:b:c"));
    render(
      <GraphStatisticsPanel
        assessment={multiGroupAssessment(conditionOptions)}
        design={panelDesign(conditionOptions)}
        outcomeId="outcome.value"
        analysisRunner={analysisRunner}
        conditionOptions={conditionOptions}
        relationshipAlreadyDeclared
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

    const resultGroup = await screen.findByRole("group", { name: "統計解析結果" });
    expect(within(resultGroup).queryByRole("table", { name: "条件間比較の結果" })).toBeNull();
    expect(resultGroup).not.toHaveTextContent("games_howell:a:b:c");
  });
});

it("keeps the completed result and important warnings outside collapsed settings", async () => {
 const answer = AnalysisEngineResultSchema.parse({
  protocolVersion: "0.1.0", requestId: request.requestId, status: "ok",
  engine: { name: "lsaa-python", version: "test", packages: {} },
  estimates: [{ name: "difference", value: -0.22, standardError: .02, confidenceInterval: {level: .95, lower: -.3, upper: -.14} }],
  tests: [], diagnostics: [], warnings: [{code: "small_n", message: "small sample"}], completedAt: "2026-10-10T04:00:00.000Z",
 });
 render(<GraphStatisticsPanel assessment={readyAssessment} design={panelDesign()} relationshipAlreadyDeclared analysisRunner={vi.fn().mockResolvedValue(answer)} measurementCountSummary="Vehicle 8測定、Drug 10測定" />);
 fireEvent.click(screen.getByRole("button", {name: "選択した解析を実行"}));
 const result = await screen.findByRole("group", {name: "統計解析結果"});
 expect(result).toBeVisible();
 expect(result).toHaveFocus();
 expect(within(result).getByText(/推定値.*95%.*CI/)).toBeVisible();
 expect(within(result).getByText(/検定・モデル：Welch/)).toBeVisible();
 expect(screen.getByText(/Vehicle 8測定、Drug 10測定/)).toBeVisible();
 const settings = screen.getByText("解析設定（方法・比較・独立性）").closest("details")!;
 expect(settings).not.toHaveAttribute("open");
 expect(result.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(within(result).getByText(/重要な注意/).closest("details")).toHaveAttribute("open");
 expect(within(result).getByText("推定図を表示").closest("details")).not.toHaveAttribute("open");
});

it.each([
  [1 - 0.05 / 3, "98.3333%"],
  [0.99999999, "99.999999%"],
  [0.00000001, "0.000001%"],
])("explains saved Tukey q and formats coverage %s without changing saved values", (level, coverage) => {
  const savedResult = AnalysisEngineResultSchema.parse({
    protocolVersion: request.protocolVersion, requestId: request.requestId, status: "ok",
    engine: { name: "lsaa-python", version: "0.15.2", packages: {} },
    estimates: [{ name: "difference", value: -3, standardError: 0.2,
      confidenceInterval: { level, lower: -4, upper: -2 } }],
    tests: [], warnings: [],
    diagnostics: [{ code: "tukey_studentized_range_q", message: "q is standardized; intervals retain outcome units" }],
    completedAt: "2026-10-10T00:00:00Z",
  });
  const original = JSON.stringify(savedResult);
  const runner = vi.fn();
  render(<GraphStatisticsPanel assessment={readyAssessment} design={panelDesign()}
    initialAnalysis={{request,result:savedResult}} analysisRunner={runner} relationshipAlreadyDeclared />);
  expect(screen.getByText(/Tukeyの検定統計量qは/)).toHaveTextContent("プールした群内分散（残差平均平方）");
  expect(screen.getByText(/Tukeyの検定統計量qは/)).toHaveTextContent("解析に用いた尺度の単位");
  expect(screen.queryByText("tukey_studentized_range_q")).toBeNull();
  const estimates = document.querySelector('dl[aria-label="主要な推定値"]')!;
  expect(estimates).toHaveTextContent(coverage);
  expect(estimates).not.toHaveTextContent("98.333333333333");
  expect(JSON.stringify(savedResult)).toBe(original);
  expect(runner).not.toHaveBeenCalled();
});

it("keeps the saved no-sphericity diagnostic open without rerunning the engine", () => {
  const savedRequest = AnalysisEngineRequestSchema.parse({
    ...request,
    protocolVersion: "0.3.0",
    templateId: "D04",
    method: "repeated_measures_anova",
    conditionIds: ["condition.vehicle", "condition.drug", "condition.third"],
    primaryContrastConditionIds: ["condition.vehicle", "condition.drug"],
    observations: ["condition.vehicle", "condition.drug", "condition.third"].flatMap((conditionId, j) =>
      [0, 1].map((i) => ({ observationId: `o${i}${j}`, experimentalUnitId: `u${i}`,
        pairId: `p${i}`, conditionId, value: i + j + (i * j) / 2 }))),
    options: { ...request.options, multiplicityMethod: "holm_paired_all_pairs" },
  });
  const savedResult = AnalysisEngineResultSchema.parse(JSON.parse(JSON.stringify({
    protocolVersion: "0.3.0", requestId: request.requestId, status: "ok",
    engine: { name: "lsaa-python", version: "0.15.2", packages: {} },
    estimates: [], tests: [], warnings: [],
    diagnostics: [{ code: "sphericity_not_estimated", message: "Uncorrected repeated-measures ANOVA." }],
    completedAt: "2026-10-10T00:00:00Z",
  })));
  const runner = vi.fn();
  render(<GraphStatisticsPanel assessment={readyAssessment} design={panelDesign()}
    initialAnalysis={{request:savedRequest,result:savedResult}}
    analysisRunner={runner} relationshipAlreadyDeclared />);
  const note = screen.getByText(/この反復測定ANOVAは球面性補正を計算していません/);
  expect(note).toBeVisible();
  expect(note).toHaveTextContent("この未補正のp値で判断せず");
  expect(note.closest("details")).toHaveAttribute("open");
  expect(note.closest("details")).toHaveClass("is-important");
  expect(runner).not.toHaveBeenCalled();
});

const restoredEquivalencePlan = { schemaVersion: "0.1.0" as const, margin: { scale: "raw_difference" as const, lowerBound: -0.5, upperBound: 0.5, unit: "AU", declaredAsPrespecified: true as const }, alpha: 0.05 as const, claimMode: "single_primary_comparison" as const, primaryComparisonId: "equivalence:condition.vehicle:condition.drug" };
it("runs the restored Welch TOST route after validating the original independent design", async () => {
 const runner = vi.fn(async (r) => AnalysisEngineResultSchema.parse({ protocolVersion: r.protocolVersion, requestId: r.requestId, status: "ok", engine: {name:"lsaa-python",version:"test",packages:{}},estimates:[],tests:[],diagnostics:[],warnings:[],completedAt:"2026-10-10T00:00:00.000Z" }));
 const changed = vi.fn();
 render(<GraphStatisticsPanel assessment={readyAssessment} design={panelDesign()} analysisRunner={runner} onAnalysisChange={changed} conditionOptions={defaultConditionOptions} relationshipAlreadyDeclared comparisonGoal="equivalence" equivalencePlan={restoredEquivalencePlan} equivalenceMarginUnit="AU" equivalenceSupportKind="continuous_independent" />);
 fireEvent.click(screen.getByRole("button",{name:"Welch TOSTを実行"}));
 await screen.findByRole("group",{name:"統計解析結果"});
 expect(runner).toHaveBeenCalledTimes(1); expect(runner.mock.calls[0]![0]).toMatchObject({protocolVersion:"0.15.0",method:"welch_tost",equivalencePlan:restoredEquivalencePlan});
 expect(screen.getByText(/D01 \/ protocol 0.15.0/)).toBeInTheDocument();
 expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({recommendation:expect.objectContaining({recommendedMethod:"welch_tost"})}));
 expect(screen.queryByText("解析設定（方法・比較・独立性）")).not.toBeInTheDocument();
});
it("does not run restored TOST when the canonical design conflicts with its independent base request", async () => {
 const runner=vi.fn(); render(<GraphStatisticsPanel assessment={readyAssessment} design={panelDesign(defaultConditionOptions,"matched")} analysisRunner={runner} conditionOptions={defaultConditionOptions} relationshipAlreadyDeclared comparisonGoal="equivalence" equivalencePlan={restoredEquivalencePlan} equivalenceMarginUnit="AU" equivalenceSupportKind="continuous_independent" />);
 fireEvent.click(screen.getByRole("button",{name:"Welch TOSTを実行"})); await screen.findByRole("alert"); expect(runner).not.toHaveBeenCalled();
});

it("does not repeat completed TOST on rerender and discards an obsolete pending plan", async () => {
 let resolveRun!: (value: ReturnType<typeof AnalysisEngineResultSchema.parse>) => void;
 const runner = vi.fn(() => new Promise<ReturnType<typeof AnalysisEngineResultSchema.parse>>(resolve => { resolveRun=resolve; }));
 const props = {assessment:readyAssessment,design:panelDesign(),analysisRunner:runner,conditionOptions:defaultConditionOptions,relationshipAlreadyDeclared:true,comparisonGoal:"equivalence" as const,equivalencePlan:restoredEquivalencePlan,equivalenceMarginUnit:"AU",equivalenceSupportKind:"continuous_independent" as const};
 const {rerender}=render(<GraphStatisticsPanel {...props} />);
 fireEvent.click(screen.getByRole("button",{name:"Welch TOSTを実行"}));
 await waitFor(()=>expect(runner).toHaveBeenCalledTimes(1));
 const requested = runner.mock.calls[0] as unknown as [ { protocolVersion:string; requestId:string } ];
 const answer=AnalysisEngineResultSchema.parse({protocolVersion:requested[0].protocolVersion,requestId:requested[0].requestId,status:"ok",engine:{name:"lsaa-python",version:"test",packages:{}},estimates:[],tests:[],diagnostics:[],warnings:[],completedAt:"2026-10-10T00:00:00.000Z"});
 await act(async()=>resolveRun(answer));
 await screen.findByRole("group",{name:"統計解析結果"});
 rerender(<GraphStatisticsPanel {...props} />);
 expect(runner).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole("button",{name:"Welch TOSTを実行"}));
 await waitFor(()=>expect(runner).toHaveBeenCalledTimes(2));
 rerender(<GraphStatisticsPanel {...props} equivalencePlan={{...restoredEquivalencePlan,margin:{...restoredEquivalencePlan.margin,upperBound:0.6}}} />);
 await act(async()=>resolveRun(answer));
 expect(screen.queryByRole("group",{name:"統計解析結果"})).toBeNull();
 expect(runner).toHaveBeenCalledTimes(2);
});
