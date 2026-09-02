import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  AnalysisEngineRequestSchema,
  AnalysisEngineResultSchema,
  type AnalysisEngineResult,
} from "@lsaa/analysis-contracts";
import { ExperimentDesignSchema } from "@lsaa/domain";
import { afterEach, vi } from "vitest";

import { AnalysisClientError } from "../../app/analysisClient";
import type { DraftAnalysisAssessment } from "../../app/experimentDraftAnalysis";
import { recordUsageMilestone } from "../../app/usageTelemetry";
import { GraphStatisticsPanel } from "./GraphStatisticsPanel";
import { resetAppLocaleForTests, setAppLocale } from "../../app/appLocale";
import { expectNoJapaneseUi } from "../../test/expectNoJapaneseUi";

vi.mock("../../app/usageTelemetry", () => ({ recordUsageMilestone: vi.fn() }));
afterEach(() => act(() => resetAppLocaleForTests("ja")));

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

it("shows estimate contrasts with researcher-facing condition labels", () => {
  const result = AnalysisEngineResultSchema.parse({
    protocolVersion: "0.1.0",
    requestId: request.requestId,
    status: "ok",
    engine: { name: "lsaa-python", version: "test", packages: {} },
    estimates: [
      {
        name: "condition.drug_minus_condition.vehicle",
        value: -0.21,
        standardError: 0.04,
        confidenceInterval: { level: 0.95, lower: -0.29, upper: -0.13 },
      },
    ],
    tests: [],
    diagnostics: [],
    warnings: [],
    completedAt: "2026-08-28T00:00:00.000Z",
  });
  render(
    <GraphStatisticsPanel
      assessment={readyAssessment}
      design={panelDesign()}
      analysisRunner={vi.fn()}
      conditionOptions={defaultConditionOptions}
      initialAnalysis={{ request, result }}
    />,
  );

  expect(screen.getByText("Drug − Vehicle")).toBeVisible();
  expect(screen.queryByText("condition.drug_minus_condition.vehicle")).toBeNull();
});

it("shows the recommendation and analysis action in English without changing the request", () => {
  act(() => setAppLocale("en"));
  const view = render(
    <GraphStatisticsPanel
      assessment={readyAssessment}
      design={panelDesign()}
      analysisRunner={vi.fn()}
    />,
  );

  expect(screen.getByText("Recommended: Welch's t-test")).toBeVisible();
  expect(screen.getByText(/The design contains 2 independent conditions/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Run selected analysis" })).toBeVisible();
  expect(readyAssessment.request).toBe(request);
  expectNoJapaneseUi(view.container);
});

it("safe-stops an equivalence goal without recommending or running ordinary NHST", () => {
  const analysisRunner = vi.fn();
  const onComparisonGoalChange = vi.fn();
  render(
    <GraphStatisticsPanel
      assessment={readyAssessment}
      design={panelDesign()}
      analysisRunner={analysisRunner}
      comparisonGoal="equivalence"
      equivalenceSupportKind="positive_total_shared_source"
      onComparisonGoalChange={onComparisonGoalChange}
      relationshipAlreadyDeclared
    />,
  );

  expect(screen.getByText("この同等性解析は現在未サポートです")).toBeVisible();
  expect(screen.getByText(/通常のANOVAやt検定でp > 0.05となっても/)).toBeVisible();
  expect(screen.getByText(/観測データから自動生成しません/)).toBeVisible();
  expect(screen.getByText(/陽性数／総数と実験回内の依存/)).toBeVisible();
  expect(screen.getByText(/割合を独立な連続量としてTOSTへ渡しません/)).toBeVisible();
  expect(screen.getByText("同等性解析の事前計画")).toBeVisible();
  expect(screen.getByLabelText("下限")).toBeVisible();
  expect(screen.getByLabelText("上限")).toBeVisible();
  expect(screen.queryByText("推奨: Welchの2標本t検定")).toBeNull();
  expect(screen.queryByRole("button", { name: "選択した解析を実行" })).toBeNull();
  expect(analysisRunner).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("radio", { name: "差があるか調べる" }));
  expect(onComparisonGoalChange).toHaveBeenCalledWith("difference");
});

it("runs only the supported independent two-group equivalence request", async () => {
  const comparisonId = "equivalence:condition.vehicle:condition.drug";
  const equivalencePlan = {
    schemaVersion: "0.1.0" as const,
    margin: {
      scale: "raw_difference" as const,
      lowerBound: -0.3,
      upperBound: 0.3,
      unit: "AU",
      declaredAsPrespecified: true as const,
    },
    alpha: 0.05 as const,
    claimMode: "single_primary_comparison" as const,
    primaryComparisonId: comparisonId,
  };
  const result = AnalysisEngineResultSchema.parse({
    protocolVersion: "0.15.0",
    requestId: `${request.requestId}:eq`,
    status: "ok",
    engine: { name: "lsaa-python", version: "test", packages: {} },
    estimates: [
      {
        name: "condition.drug_minus_condition.vehicle",
        value: -0.21,
        standardError: 0.04,
        confidenceInterval: { level: 0.9, lower: -0.28, upper: -0.14 },
      },
    ],
    tests: [
      {
        name: "welch_tost_lower_bound",
        statisticName: "t",
        statistic: 2.25,
        degreesOfFreedom: [2],
        pValue: 0.08,
        adjustedPValue: null,
        effectSizeName: null,
        effectSize: null,
      },
      {
        name: "welch_tost_upper_bound",
        statisticName: "t",
        statistic: -12.75,
        degreesOfFreedom: [2],
        pValue: 0.003,
        adjustedPValue: null,
        effectSizeName: null,
        effectSize: null,
      },
    ],
    equivalence: {
      resultVersion: "0.1.0",
      plan: equivalencePlan,
      comparisons: [
        {
          comparisonId,
          estimate: -0.21,
          standardError: 0.04,
          lowerConfidenceBound: -0.28,
          upperConfidenceBound: -0.14,
          confidenceLevel: 0.9,
          lowerOneSidedPValue: 0.08,
          upperOneSidedPValue: 0.003,
          tostPValue: 0.08,
          conclusion: "equivalence_supported",
        },
      ],
    },
    diagnostics: [],
    warnings: [],
    completedAt: "2026-09-02T00:00:00.000Z",
  });
  const analysisRunner = vi.fn().mockResolvedValue(result);
  render(
    <GraphStatisticsPanel
      assessment={readyAssessment}
      design={panelDesign()}
      analysisRunner={analysisRunner}
      comparisonGoal="equivalence"
      equivalencePlan={equivalencePlan}
      equivalenceSupportKind="continuous_independent"
      conditionOptions={defaultConditionOptions}
      relationshipAlreadyDeclared
    />,
  );

  expect(screen.getByText("Welch TOSTによる同等性解析")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Welch TOSTを実行" }));

  await waitFor(() => expect(analysisRunner).toHaveBeenCalledTimes(1));
  expect(analysisRunner.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      protocolVersion: "0.15.0",
      method: "welch_tost",
      comparisonId,
      equivalencePlan,
    }),
  );
  expect(await screen.findByText("同等性を支持")).toBeVisible();
});

it("runs paired TOST with complete pairs and reports excluded incomplete pair IDs", async () => {
  const comparisonId = "equivalence:condition.vehicle:condition.drug";
  const equivalencePlan = {
    schemaVersion: "0.1.0" as const,
    margin: {
      scale: "raw_difference" as const,
      lowerBound: -0.3,
      upperBound: 0.3,
      unit: "AU",
      declaredAsPrespecified: true as const,
    },
    alpha: 0.05 as const,
    claimMode: "single_primary_comparison" as const,
    primaryComparisonId: comparisonId,
  };
  const pairedBaseRequest = AnalysisEngineRequestSchema.parse({
    ...request,
    templateId: "D02",
    method: "paired_t",
    observations: [
      {
        observationId: "o.v1",
        conditionId: "condition.vehicle",
        experimentalUnitId: "pair.1",
        pairId: "pair.1",
        value: 1,
      },
      {
        observationId: "o.d1",
        conditionId: "condition.drug",
        experimentalUnitId: "pair.1",
        pairId: "pair.1",
        value: 1.1,
      },
      {
        observationId: "o.v2",
        conditionId: "condition.vehicle",
        experimentalUnitId: "pair.2",
        pairId: "pair.2",
        value: 2,
      },
      {
        observationId: "o.d2",
        conditionId: "condition.drug",
        experimentalUnitId: "pair.2",
        pairId: "pair.2",
        value: 2.2,
      },
    ],
  });
  const pairedAssessment: DraftAnalysisAssessment = {
    ...readyAssessment,
    title: "対応のあるt検定を推奨",
    method: "paired_t",
    recommendedMethod: "paired_t",
    request: pairedBaseRequest,
    inputDiagnostics: [
      {
        code: "INCOMPLETE_MATCHED_SET",
        title: "対応がそろっていない組が1組あります",
        message: "完全な組だけを解析します。",
        incompleteMatchedSets: [
          {
            pairId: "pair.missing",
            experimentId: "experiment.missing",
            experimentLabel: "Animal missing",
            missingConditions: [{ conditionId: "condition.drug", label: "Drug" }],
          },
        ],
      },
    ],
  };
  const result = AnalysisEngineResultSchema.parse({
    protocolVersion: "0.16.0",
    requestId: `${pairedBaseRequest.requestId}:paired-eq`,
    status: "ok",
    engine: { name: "lsaa-python", version: "test", packages: {} },
    estimates: [],
    tests: [],
    equivalence: {
      resultVersion: "0.1.0",
      plan: equivalencePlan,
      comparisons: [
        {
          comparisonId,
          estimate: 0.15,
          standardError: 0.05,
          lowerConfidenceBound: 0.05,
          upperConfidenceBound: 0.25,
          confidenceLevel: 0.9,
          lowerOneSidedPValue: 0.001,
          upperOneSidedPValue: 0.02,
          tostPValue: 0.02,
          conclusion: "equivalence_supported",
          analysisSet: { completePairCount: 2, excludedIncompletePairIds: ["pair.missing"] },
        },
      ],
    },
    diagnostics: [],
    warnings: [],
    completedAt: "2026-09-02T00:00:00.000Z",
  });
  const analysisRunner = vi.fn().mockResolvedValue(result);
  render(
    <GraphStatisticsPanel
      assessment={pairedAssessment}
      design={panelDesign()}
      analysisRunner={analysisRunner}
      comparisonGoal="equivalence"
      equivalencePlan={equivalencePlan}
      equivalenceSupportKind="continuous_matched"
      conditionOptions={defaultConditionOptions}
      relationshipAlreadyDeclared
    />,
  );

  expect(screen.getByText("対応のあるTOSTによる同等性解析")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "対応のあるTOSTを実行" }));
  await waitFor(() => expect(analysisRunner).toHaveBeenCalledTimes(1));
  expect(analysisRunner.mock.calls[0]?.[0]).toMatchObject({
    protocolVersion: "0.16.0",
    method: "paired_tost",
    excludedIncompletePairIds: ["pair.missing"],
  });
  expect(await screen.findByText("同等性を支持")).toBeVisible();
  const resultRegion = screen.getByRole("region", { name: "同等性解析結果" });
  expect(within(resultRegion).getByText(/完全な対応組/)).toHaveTextContent("2");
  expect(within(resultRegion).getByText(/pair\.missing/)).toBeVisible();
});

it("retains privacy-safe local engine guidance instead of replacing it with a generic error", async () => {
  const analysisRunner = vi
    .fn()
    .mockRejectedValue(
      new AnalysisClientError(
        "ENGINE_EXECUTION_FAILED",
        "ローカル統計エンジンの出力を検証できませんでした。診断情報を保存してください。",
      ),
    );
  render(
    <GraphStatisticsPanel
      assessment={readyAssessment}
      design={panelDesign()}
      analysisRunner={analysisRunner}
      relationshipAlreadyDeclared
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "選択した解析を実行" }));

  expect(
    await screen.findByText(/ローカル統計エンジンの出力を検証できませんでした/u),
  ).toBeVisible();
  expect(screen.getByText(/ENGINE_EXECUTION_FAILED/u)).toBeVisible();
});

it("states that a non-significant difference test does not establish equivalence", () => {
  act(() => setAppLocale("en"));
  const result = AnalysisEngineResultSchema.parse({
    protocolVersion: "0.1.0",
    requestId: request.requestId,
    status: "ok",
    engine: { name: "lsaa-python", version: "test", packages: {} },
    estimates: [],
    tests: [
      {
        name: "welch_t",
        statisticName: "t",
        statistic: 0.4,
        degreesOfFreedom: [2],
        pValue: 0.72,
        adjustedPValue: null,
        effectSizeName: "hedges_g",
        effectSize: 0.1,
      },
    ],
    diagnostics: [],
    warnings: [],
    completedAt: "2026-09-01T00:00:00.000Z",
  });
  const view = render(
    <GraphStatisticsPanel
      assessment={readyAssessment}
      design={panelDesign()}
      analysisRunner={vi.fn()}
      initialAnalysis={{ request, result }}
      relationshipAlreadyDeclared
    />,
  );

  expect(
    screen.getByText(
      "No statistically significant difference was detected. This result does not demonstrate equivalence or absence of an effect.",
    ),
  ).toBeVisible();
  expectNoJapaneseUi(view.container);
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

  it("shows a design-request safe stop entirely in English", async () => {
    act(() => setAppLocale("en"));
    const analysisRunner = vi.fn();
    const view = render(
      <GraphStatisticsPanel
        assessment={readyAssessment}
        design={panelDesign(defaultConditionOptions, "matched")}
        outcomeId="outcome.value"
        analysisRunner={analysisRunner}
        relationshipAlreadyDeclared
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run selected analysis" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "request does not match the experimental structure",
    );
    expect(analysisRunner).not.toHaveBeenCalled();
    expectNoJapaneseUi(view.container);
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
        diagnostics: [
          {
            code: "paired_difference_distribution",
            message: "paired_difference_distribution",
          },
        ],
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

    expect(await screen.findByText("重要な注意（2件）")).toBeVisible();
    expect(screen.getByText(/対応する各実験単位について条件間の差を計算/)).toBeVisible();
    expect(screen.queryByText("paired_difference_distribution")).toBeNull();
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

  it("shows engine validation feedback entirely in English", async () => {
    act(() => setAppLocale("en"));
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
    const view = render(
      <GraphStatisticsPanel
        assessment={readyAssessment}
        design={panelDesign()}
        outcomeId="outcome.value"
        analysisRunner={analysisRunner}
        relationshipAlreadyDeclared
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run selected analysis" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "experimental-unit ID is duplicated",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Dish ID");
    expectNoJapaneseUi(view.container);
  });

  it("keeps unsupported assessment copy out of the English UI", () => {
    act(() => setAppLocale("en"));
    const assessment: DraftAnalysisAssessment = {
      ...readyAssessment,
      state: "unsupported",
      title: "すべての対応差が同じため、対応のあるt検定を計算できません",
      reason: "差の標準誤差が0です。",
      request: null,
      correction: undefined,
    };
    const view = render(
      <GraphStatisticsPanel
        assessment={assessment}
        design={panelDesign()}
        analysisRunner={vi.fn()}
      />,
    );

    expect(screen.getByText("This analysis structure is not currently supported")).toBeVisible();
    expectNoJapaneseUi(view.container);
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

    fireEvent.click(screen.getByText("対応がそろっていない組が8組あります"));
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

  it("localizes matched analysis-set and incomplete-set diagnostics from legacy Japanese runtime copy", () => {
    act(() => setAppLocale("en"));
    const assessment: DraftAnalysisAssessment = {
      ...readyAssessment,
      missingCount: 1,
      analysisSetSummary:
        "完全な対応組 1組を統計解析に使います。対応相手がそろわない観測 1件は解析から除外します。",
      graphAnalysisSetDifference:
        "Graphには入力済みの観測を残します。統計解析だけが完全な対応組に限定されます。",
      matchedAnalysisSet: {
        completePairCount: 1,
        unmatchedObservationCount: 1,
      },
      inputDiagnostics: [
        {
          code: "INCOMPLETE_MATCHED_SET",
          title: "対応がそろっていない組が1組あります",
          message:
            "完全な組だけを対応解析に使い、不完全な組の入力値と実験設計は保持します。独立群には読み替えません。",
          incompleteMatchedSets: [
            {
              pairId: "mouse.1",
              experimentId: "experiment.1",
              experimentLabel: "Mouse 1",
              missingConditions: [{ conditionId: "condition.drug", label: "Drug" }],
            },
          ],
        },
      ],
    };
    const view = render(
      <GraphStatisticsPanel
        assessment={assessment}
        design={panelDesign(defaultConditionOptions, "matched")}
        analysisRunner={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/1 complete matched pair will be used/);
    expect(screen.getByText("1 matched set is incomplete")).toBeVisible();
    fireEvent.click(screen.getByText("1 matched set is incomplete"));
    expect(
      screen.getByRole("list", { name: "Missing conditions by stable unit / pair ID" }),
    ).toHaveTextContent("mouse.1 (Mouse 1): Drug");
    expectNoJapaneseUi(view.container);
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
  it("enables control-versus-many when the control condition is explicitly retained", () => {
    const conditionOptions = [
      { id: "group:control", label: "Control" },
      { id: "group:drug", label: "Drug" },
      { id: "group:rescue", label: "Rescue" },
    ] as const;
    const base = multiGroupAssessment(conditionOptions);
    const assessment: DraftAnalysisAssessment = {
      ...base,
      request: AnalysisEngineRequestSchema.parse({
        ...base.request,
        controlConditionId: "group:control",
      }),
    };
    const onContrastIntentChange = vi.fn();
    render(
      <GraphStatisticsPanel
        assessment={assessment}
        design={panelDesign(conditionOptions)}
        outcomeId="outcome.value"
        analysisRunner={vi.fn()}
        conditionOptions={conditionOptions}
        relationshipAlreadyDeclared
        onContrastIntentChange={onContrastIntentChange}
      />,
    );

    const choice = screen.getByRole("radio", { name: "各処置を対照群と比較" });
    expect(choice).toBeEnabled();
    fireEvent.click(choice);
    expect(onContrastIntentChange).toHaveBeenCalledWith("control_vs_many");
  });

  it("shows comparison labels and adjusted p-values without exposing condition IDs", async () => {
    const conditionOptions = [
      { id: "group:control", label: "Control" },
      { id: "group:drug", label: "Drug" },
      { id: "group:rescue", label: "Rescue" },
    ] as const;
    const analysisRunner = vi
      .fn()
      .mockResolvedValue(pairwiseResult("games_howell:group:control:group:drug"));
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
