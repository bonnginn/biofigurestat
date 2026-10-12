import { describe, expect, it, vi } from "vitest";

import type {
  AnalysisEngineRequest,
  AnalysisEngineResult,
  AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import { AnalysisEngineRequestSchema, AnalysisEngineResultSchema } from "@lsaa/analysis-contracts";
import type { ExperimentDesign } from "@lsaa/domain";
import { createCoreTwoConditionGraphSpec } from "@lsaa/graph-spec";

import { copyMethodsText, generateMethodsText } from "./methodsText";

const design: ExperimentDesign = {
  schemaVersion: "0.2.0",
  id: "design.methods",
  name: "Methods fixture",
  purpose: "microscopy",
  outcomes: [{ id: "outcome.intensity", key: "intensity", label: "Intensity", type: "continuous" }],
  factors: [
    {
      id: "factor.condition",
      key: "condition",
      label: "Condition",
      levels: [
        { id: "level.control", label: "Control", order: 0 },
        { id: "level.treatment", label: "Treatment", order: 1 },
      ],
    },
  ],
  conditions: [
    {
      id: "condition.control",
      label: "Control",
      factorLevels: { "factor.condition": "level.control" },
    },
    {
      id: "condition.treatment",
      label: "Treatment",
      factorLevels: { "factor.condition": "level.treatment" },
    },
  ],
  unitLevels: [
    {
      id: "unit.dish",
      key: "dish",
      label: "Dish",
      role: "experimental_unit",
      parentLevelId: null,
    },
  ],
  experimentalUnitLevelId: "unit.dish",
  pairing: { kind: "independent" },
  plannedN: 2,
  normalizationPlans: [],
  primaryContrast: {
    id: "contrast.primary",
    label: "Control vs Treatment",
    conditionIds: ["condition.control", "condition.treatment"],
  },
  wizardRuleVersion: "methods-fixture",
  wizardDecisions: [],
  createdAt: "2026-08-20T00:00:00+09:00",
};

const recommendation: AnalysisRecommendation = {
  templateId: "D01",
  templateVersion: "0.1.0",
  recommendedMethod: "welch_t",
  alternativeMethods: ["mann_whitney"],
  reasonCode: "two_independent_condition_groups",
  explanation: "Separate units",
  statisticalNDefinition: "Independent units at level unit.dish",
};

const request: AnalysisEngineRequest = {
  protocolVersion: "0.1.0",
  requestId: "request.methods",
  projectId: "project.methods",
  analysisId: "analysis.methods",
  templateId: "D01",
  templateVersion: "0.1.0",
  method: "welch_t",
  contrastConditionIds: ["condition.control", "condition.treatment"],
  observations: [
    {
      observationId: "observation.control",
      conditionId: "condition.control",
      value: 1,
      experimentalUnitId: "unit.control",
    },
    {
      observationId: "observation.treatment",
      conditionId: "condition.treatment",
      value: 3,
      experimentalUnitId: "unit.treatment",
    },
  ],
  options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
};

const result: AnalysisEngineResult = {
  protocolVersion: "0.1.0",
  requestId: "request.methods",
  status: "ok",
  engine: {
    name: "lsaa-python",
    version: "0.1.0",
    packages: { numpy: "2.3.5" },
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
  warnings: [{ code: "small_n", message: "サンプル数が少ないため解釈に注意してください。" }],
  completedAt: "2026-08-20T12:00:00+09:00",
};

describe("Japanese Methods generation", () => {
  it("includes design, execution, result, graph, and explicit caveats", () => {
    const graphSpec = createCoreTwoConditionGraphSpec({
      graphId: "graph.methods",
      templateId: "D01",
      dataSource: { kind: "analysis_result", id: "analysis.methods", revision: "request.methods" },
      yLabel: "Intensity",
      yStartAtZero: true,
    });
    const text = generateMethodsText({ design, recommendation, request, result, graphSpec });

    expect(text).toContain("解析テンプレート：D01");
    expect(text).toContain("実行手法：Welchの2標本t検定");
    expect(text).toContain("統計上のn：Independent units at level unit.dish");
    expect(text).toContain("主比較：Control vs Treatment");
    expect(text).toContain("平均±SD（標本標準偏差）");
    expect(text).toContain("95%：1.4～3.6");
    expect(text).toContain("t = 6.25");
    expect(text).toContain("自由度：4");
    expect(text).toContain("p値：1.20e-5");
    expect(text).toContain("Cohen's d = 1.9");
    expect(text).toContain("除外：");
    expect(text).toContain("正規化：実行設定に正規化計画がありません");
    expect(text).toContain("多重性補正：指定なし");
    expect(text).toContain("エンジン警告（small_n）");
  });

  it("records when the executed alternative differs from the recommendation", () => {
    const text = generateMethodsText({
      design,
      recommendation,
      request: { ...request, method: "mann_whitney" },
      result,
      graphSpec: null,
    });

    expect(text).toContain("実行手法：Mann–WhitneyのU検定");
    expect(text).toContain("推奨手法：Welchの2標本t検定（選択と異なる）");
    expect(text).toContain("lsaa-python 0.1.0");
    expect(text).toContain("numpy 2.3.5");
  });

  it("distinguishes shared-source matching from measuring the same experimental unit", () => {
    const sharedSourceDesign: ExperimentDesign = {
      ...design,
      unitLevels: [
        {
          id: "unit.donor",
          key: "donor",
          label: "Donor",
          role: "block",
          parentLevelId: null,
        },
        {
          ...design.unitLevels[0],
          label: "condition dish",
          parentLevelId: "unit.donor",
        },
      ],
      pairing: {
        kind: "matched",
        matchLevelId: "unit.donor",
        completePairsRequired: true,
      },
    };

    const text = generateMethodsText({
      design: sharedSourceDesign,
      recommendation,
      request,
      result,
      graphSpec: null,
    });

    expect(text).toContain(
      "対応構造：同じDonorに由来する条件別condition dishをDonor内で対応づけて比較。",
    );
    expect(text).toContain("条件別condition dishは別々の実験単位として保持。");
    expect(text).not.toContain("同じ／対応づけた実験単位（unit.donor）");
  });

  it("does not imply pairwise testing for an omnibus-only multi-group run", () => {
    const omnibusRequest: AnalysisEngineRequest = {
      protocolVersion: "0.2.0",
      requestId: "request.kruskal.methods",
      projectId: "project.methods",
      analysisId: "analysis.kruskal",
      templateId: "D03",
      templateVersion: "0.1.0",
      method: "kruskal_wallis",
      conditionIds: ["condition.control", "condition.treatment", "condition.third"],
      contrastIntent: "omnibus_only",
      primaryContrastConditionIds: ["condition.control", "condition.treatment"],
      observations: [
        ...request.observations,
        {
          observationId: "observation.third",
          conditionId: "condition.third",
          value: 4,
          experimentalUnitId: "unit.third",
        },
      ],
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    };
    const text = generateMethodsText({
      design,
      recommendation: {
        ...recommendation,
        templateId: "D03",
        recommendedMethod: "welch_anova",
      },
      request: omnibusRequest,
      result: { ...result, protocolVersion: "0.2.0", requestId: omnibusRequest.requestId },
    });

    expect(text).toContain("実行手法：Kruskal–Wallis検定");
    expect(text).toContain("条件間の事後比較：実行せず");
    expect(text).toContain("条件間の事後比較を実行していないため指定なし");
    expect(text).not.toContain("2条件の主比較のため補正なし");
  });

  it("uses clipboard API and falls back to document copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await expect(copyMethodsText("Methods本文")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("Methods本文");

    writeText.mockRejectedValueOnce(new Error("blocked"));
    const execCommand = vi.spyOn(document, "execCommand").mockReturnValue(true);
    await expect(copyMethodsText("fallback本文")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    execCommand.mockRestore();
  });

  it("does not claim that nested observations were summarized from design metadata alone", () => {
    const nestedDesign: ExperimentDesign = {
      ...design,
      unitLevels: [
        ...design.unitLevels,
        {
          id: "unit.field",
          key: "field",
          label: "Field",
          role: "subsample",
          parentLevelId: "unit.dish",
        },
        {
          id: "unit.cell",
          key: "cell",
          label: "Cell",
          role: "subsample",
          parentLevelId: "unit.field",
        },
      ],
    };
    const text = generateMethodsText({
      design: nestedDesign,
      recommendation,
      request,
      result,
      graphSpec: null,
    });
    expect(text).not.toContain("入れ子観測：");
    expect(text).not.toContain("下位の観測単位を独立反復として数えていません");
  });

  it("documents one-factor scientific groups as display-only classifications", () => {
    const groupedDesign: ExperimentDesign = {
      ...design,
      factors: [
        {
          ...design.factors[0],
          levelGroups: [
            { id: "group.control", key: "control", label: "対照群", order: 0 },
            { id: "group.target", key: "target", label: "標的群", order: 1 },
          ],
          levels: [
            { id: "level.control", label: "Control", order: 0, groupId: "group.control" },
            { id: "level.1", label: "siRNA #1", order: 1, groupId: "group.target" },
            { id: "level.2", label: "siRNA #2", order: 2, groupId: "group.target" },
            { id: "level.3", label: "siRNA #3", order: 3, groupId: "group.target" },
          ],
        },
      ],
    };
    const text = generateMethodsText({
      design: groupedDesign,
      recommendation,
      request,
      result,
      graphSpec: null,
    });
    expect(text).toContain("科学的な上位グループ（対照群、標的群）");
    expect(text).toContain("合算していません");
    expect(text).toContain("独立した実験またはdishを統計上のn");
    expect(text).not.toContain("レベルを独立した生物学的n");
    expect(text).toContain("実行した比較と補正");
  });

  it("documents an explicit multi-group control by stable condition ID", () => {
    const multiDesign: ExperimentDesign = {
      ...design,
      factors: [
        {
          ...design.factors[0],
          levels: [
            ...design.factors[0].levels,
            { id: "level.treatment-b", label: "Treatment B", order: 2 },
          ],
        },
      ],
      conditions: [
        ...design.conditions,
        {
          id: "condition.treatment-b",
          label: "Treatment B",
          factorLevels: { "factor.condition": "level.treatment-b" },
        },
      ],
    };
    const multiRequest: AnalysisEngineRequest = {
      protocolVersion: "0.2.0",
      requestId: "request.multi",
      projectId: "project.methods",
      analysisId: "analysis.multi",
      templateId: "D03",
      templateVersion: "0.1.0",
      method: "welch_anova",
      conditionIds: multiDesign.conditions.map(({ id }) => id),
      controlConditionId: "condition.control",
      contrastIntent: "all_pairs",
      primaryContrastConditionIds: ["condition.control", "condition.treatment"],
      observations: [
        ...request.observations,
        {
          observationId: "observation.control.2",
          conditionId: "condition.control",
          value: 1.2,
          experimentalUnitId: "unit.control.2",
        },
        {
          observationId: "observation.treatment.2",
          conditionId: "condition.treatment",
          value: 3.2,
          experimentalUnitId: "unit.treatment.2",
        },
        {
          observationId: "observation.treatment-b.1",
          conditionId: "condition.treatment-b",
          value: 4,
          experimentalUnitId: "unit.treatment-b.1",
        },
        {
          observationId: "observation.treatment-b.2",
          conditionId: "condition.treatment-b",
          value: 4.2,
          experimentalUnitId: "unit.treatment-b.2",
        },
      ],
      options: {
        alternative: "two_sided",
        confidenceLevel: 0.95,
        multiplicityMethod: "games_howell_all_pairs",
      },
    };
    const multiRecommendation: AnalysisRecommendation = {
      ...recommendation,
      templateId: "D03",
      recommendedMethod: "welch_anova",
      multiplicityMethod: "games_howell_all_pairs",
    };
    const text = generateMethodsText({
      design: multiDesign,
      recommendation: multiRecommendation,
      request: multiRequest,
      result: { ...result, protocolVersion: "0.2.0", requestId: "request.multi" },
    });

    expect(text).toContain("研究者がControlを明示指定");
    expect(text).toContain("条件ID condition.control");
    expect(text).toContain("表示名から推測していません");
    expect(text).toContain("比較意図：すべての条件ペア");
    expect(text).toContain("games_howell_all_pairs");

    const plannedText = generateMethodsText({
      design: multiDesign,
      recommendation: multiRecommendation,
      request: {
        ...multiRequest,
        method: "one_way_anova",
        contrastIntent: "planned_comparisons",
        plannedContrastConditionIds: [
          ["condition.control", "condition.treatment"],
          ["condition.control", "condition.treatment-b"],
        ],
        options: { ...multiRequest.options, multiplicityMethod: "holm_planned_comparisons" },
      },
      result: { ...result, protocolVersion: "0.2.0", requestId: "request.multi" },
    });
    expect(plannedText).toContain("事前に明示した条件ペアのみ");
    expect(plannedText).toContain("Control vs Treatment");
    expect(plannedText).toContain("Control vs Treatment B");
    expect(plannedText).toContain("holm_planned_comparisons");
  });

  it("reports D10 only when the executed request is backed by a current derived dataset", () => {
    const derivedRequest = {
      ...request,
      observations: request.observations.map((observation, index) => ({
        ...observation,
        observationId: `derived-value.${index + 1}`,
      })),
    };
    const text = generateMethodsText({
      design,
      recommendation,
      request: derivedRequest,
      result,
      graphSpec: null,
      nestedSummary: {
        transformation: {
          id: "transformation.d10.1",
          version: "0.2.0",
          method: "replicate_summary",
          inputRevisionIds: ["raw.1"],
          parameters: { center: "mean", weighting: "equal_observations" },
        },
        revision: {
          id: "derived.1",
          previousRevisionId: null,
          sourceRawRevisionId: "raw.1",
          sourceQcRevisionId: null,
          outcomeId: "outcome.intensity",
          transformationId: "transformation.d10.1",
          createdAt: "2026-08-20T00:00:00Z",
          createdBy: "researcher",
          state: "current",
          staleReason: null,
        },
        values: derivedRequest.observations.map((observation, index) => ({
          id: observation.observationId,
          derivedDatasetRevisionId: "derived.1",
          experimentalUnitId: observation.experimentalUnitId,
          conditionId: observation.conditionId,
          outcomeId: "outcome.intensity",
          value: observation.value,
          sourceObservationIds: [`raw-cell.${index + 1}.1`, `raw-cell.${index + 1}.2`],
          sourceUnitIds: [`cell.${index + 1}.1`, `cell.${index + 1}.2`],
          subsampleCount: 2,
        })),
      },
    });
    expect(text).toContain("D10要約 0.2.0");
    expect(text).toContain("cell/ROI数を独立したnとして数えていません");
    expect(text).toContain("生物学的n=1、cell/ROI=2");
  });

  it("describes D09 variables as an association rather than a group contrast", () => {
    const text = generateMethodsText({
      design,
      recommendation: {
        ...recommendation,
        templateId: "D09",
        recommendedMethod: "pearson",
        alternativeMethods: ["spearman"],
      },
      request: {
        protocolVersion: "0.5.0",
        requestId: "request.d09.methods",
        projectId: "project.methods",
        analysisId: "analysis.d09",
        templateId: "D09",
        templateVersion: "0.1.0",
        method: "pearson",
        variableConditionIds: ["condition.control", "condition.treatment"],
        observations: request.observations.map((observation) => ({
          ...observation,
          pairId: observation.experimentalUnitId,
        })),
        options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
      },
      result: { ...result, protocolVersion: "0.5.0", requestId: "request.d09.methods" },
      graphSpec: null,
    });
    expect(text).toContain("解析テンプレート：D09");
    expect(text).toContain("実行手法：Pearsonの相関");
    expect(text).toContain("解析対象：Control と Treatment");
    expect(text).not.toContain("Control vs Treatment");
    expect(text).not.toContain("主比較：Control と Treatment");
    expect(text).toContain("単一の相関係数を評価したため指定なし");
  });

  it("describes loading-control normalization in Japanese and states that source values persist", () => {
    const wbDesign: ExperimentDesign = {
      ...design,
      purpose: "western_blot",
      normalizationPlans: [
        {
          id: "normalization.loading-control",
          method: "loading_control",
          parameters: { transformationVersion: "0.1.0" },
        },
      ],
    };
    const text = generateMethodsText({
      design: wbDesign,
      recommendation,
      request,
      result,
      graphSpec: null,
    });
    expect(text).toContain("標的バンド強度 ÷ ローディングコントロール強度");
    expect(text).toContain("設定と元の値はプロジェクトに保持");
  });

  it("records the explicit WB background correction formula in Methods", () => {
    const wbDesign: ExperimentDesign = {
      ...design,
      purpose: "western_blot",
      normalizationPlans: [
        {
          id: "normalization.loading-control",
          method: "loading_control",
          parameters: {
            inputMode: "imagej_mean_background_area",
            bandCorrectionVersion: "0.1.0",
          },
        },
      ],
    };
    const text = generateMethodsText({
      design: wbDesign,
      recommendation,
      request,
      result,
      graphSpec: null,
    });
    expect(text).toContain("（Intensity − Background）× Area");
    expect(text).toContain("元測定値を保持");
    expect(text).toContain("式version 0.1.0");
  });

  it("uses the displayed numeric repeated-axis semantic in D06 Methods", () => {
    const observations = ["condition.control", "condition.treatment"].flatMap(
      (conditionId, conditionIndex) =>
        [1, 2].flatMap((unitIndex) =>
          [10, 20].map((axisValue, axisIndex) => ({
            observationId: `observation.${conditionIndex}.${unitIndex}.${axisIndex}`,
            conditionId,
            value: conditionIndex + unitIndex + axisIndex,
            experimentalUnitId: `unit.${conditionIndex}.${unitIndex}`,
            pairId: `unit.${conditionIndex}.${unitIndex}`,
            timePointId: `axis.${axisValue}`,
          })),
        ),
    );
    const d06Request: AnalysisEngineRequest = {
      protocolVersion: "0.6.0",
      requestId: "request.d06.radius",
      projectId: "project.methods",
      analysisId: "analysis.d06.radius",
      templateId: "D06",
      templateVersion: "0.1.0",
      method: "mixed_anova",
      conditionIds: ["condition.control", "condition.treatment"],
      timePoints: [
        { timePointId: "axis.10", value: 10 },
        { timePointId: "axis.20", value: 20 },
      ],
      observations,
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    };
    const d06Recommendation: AnalysisRecommendation = {
      templateId: "D06",
      templateVersion: "0.1.0",
      recommendedMethod: "mixed_anova",
      alternativeMethods: ["mixed_model"],
      reasonCode: "balanced_condition_by_time_repeated_design",
      explanation: "Balanced repeated-axis design",
      statisticalNDefinition: "Stable biological units",
      decision: { kind: "accepted", selectedMethod: "mixed_anova" },
    };
    const d06Result: AnalysisEngineResult = {
      ...result,
      protocolVersion: "0.6.0",
      requestId: d06Request.requestId,
      estimates: [],
      tests: ["interaction", "condition", "axis"].map((name) => ({
        name,
        statisticName: "F",
        statistic: 4.2,
        degreesOfFreedom: [1, 2],
        pValue: 0.04,
        adjustedPValue: null,
        effectSizeName: "partial_eta_squared",
        effectSize: 0.3,
      })),
      diagnostics: [{ code: "sphericity_not_estimated", message: "Sphericity was not estimated." }],
    };
    const text = generateMethodsText({
      design,
      recommendation: d06Recommendation,
      request: d06Request,
      result: d06Result,
      repeatedAxis: { semantic: "numeric_covariate", title: "Radius", unit: "µm" },
      graphErrorBar: "sd",
    });

    expect(text).toContain("条件×Radiusの反復測定");
    expect(text).toContain("実行手法：条件×Radiusの反復測定分散分析");
    expect(text).toContain("推奨手法：条件×Radiusの反復測定分散分析");
    expect(text).toContain("条件 × Radius（交互作用）");
    expect(text).toContain("Radius（実験単位内）");
    expect(text).not.toContain("条件 × 時間");
    expect(text).not.toContain("条件×時間");
    expect(text).toContain("推奨法を明示的に採用");
    expect(text).toContain("平均±SD（標本標準偏差）");
    expect(text).toContain("sphericity_not_estimated");
    expect(text).toContain("球面性補正を必要とする場合");
  });

  it("describes D07 as an independent-cell condition-by-axis analysis", () => {
    const request = AnalysisEngineRequestSchema.parse({
      protocolVersion: "0.7.0",
      requestId: "request.d07.time",
      projectId: "project.methods",
      analysisId: "analysis.d07.time",
      templateId: "D07",
      templateVersion: "0.1.0",
      method: "two_way_anova",
      conditionIds: ["condition.control", "condition.treatment"],
      withinFactor: {
        role: "time",
        title: "Time",
        unit: "h",
        levels: [
          { levelId: "axis.24", value: 24 },
          { levelId: "axis.72", value: 72 },
        ],
      },
      observations: ["condition.control", "condition.treatment"].flatMap(
        (conditionId, conditionIndex) =>
          ["axis.24", "axis.72"].flatMap((withinFactorLevelId, levelIndex) =>
            [1, 2].map((replicate) => ({
              observationId: `observation.${conditionIndex}.${levelIndex}.${replicate}`,
              conditionId,
              withinFactorLevelId,
              value: conditionIndex + levelIndex + replicate,
              experimentalUnitId: `unit.${conditionIndex}.${levelIndex}.${replicate}`,
            })),
          ),
      ),
      options: { alternative: "two_sided", confidenceLevel: 0.95, multiplicityMethod: null },
    });
    const recommendation: AnalysisRecommendation = {
      templateId: "D07",
      templateVersion: "0.1.0",
      recommendedMethod: "two_way_anova",
      alternativeMethods: [],
      reasonCode: "balanced_independent_condition_by_axis_design",
      explanation: "Balanced independent cells",
      statisticalNDefinition: "Independent experimental units in each condition-by-axis cell",
    };
    const result: AnalysisEngineResult = {
      protocolVersion: "0.7.0",
      requestId: request.requestId,
      status: "ok",
      engine: { name: "fixture", version: "1", packages: {} },
      estimates: [],
      tests: [
        "condition_by_within_factor_interaction",
        "condition_main_effect",
        "within_factor_main_effect",
      ].map((name) => ({
        name,
        statisticName: "F",
        statistic: 4.2,
        degreesOfFreedom: [1, 4],
        pValue: 0.04,
        adjustedPValue: null,
        effectSizeName: "partial_eta_squared",
        effectSize: 0.3,
      })),
      diagnostics: [],
      warnings: [],
      completedAt: "2026-08-24T00:00:00.000Z",
      factorMetadata: {
        withinFactor: { role: "time", title: "Time", unit: "h" },
        effectIds: {
          interaction: "condition_by_within_factor_interaction",
          condition: "condition_main_effect",
          withinFactor: "within_factor_main_effect",
        },
        legacyEffectAliases: {},
      },
    };
    const text = generateMethodsText({ design, recommendation, request, result });

    expect(text).toContain("独立条件×Timeの二因子分散分析");
    expect(text).toContain("条件 × Time（交互作用）");
    expect(text).toContain("Time（独立セル間）");
    expect(text).not.toContain("反復測定");
  });
});

it.each(["less", "greater"] as const)(
  "records %s p direction separately from central CI",
  (alternative) => {
    const text = generateMethodsText({
      design,
      recommendation,
      request: { ...request, options: { ...request.options, alternative } },
      result,
    });
    expect(text).toContain("検定方向：片側");
    expect(text).toContain(alternative === "less" ? "<" : ">");
    expect(text).toContain("信頼区間（両側）：95%");
    expect(text).toContain("片側p値と同じ棄却境界を表す区間ではありません");
  },
);

it("includes prespecified paired TOST evidence in the review HTML Methods", async () => {
 const {serializeAnalysisReviewSetHtml}=await import("../components/graph/analysisReviewSet");
 const plan={schemaVersion:"0.1.0" as const,alpha:0.05 as const,claimMode:"single_primary_comparison" as const,primaryComparisonId:"equivalence:condition.control:condition.treatment",margin:{scale:"raw_difference" as const,lowerBound:-0.3,upperBound:0.4,unit:"AU",declaredAsPrespecified:true as const}};
 const tostRequest={...request,protocolVersion:"0.16.0",templateId:"D02",method:"paired_tost",equivalencePlan:plan,excludedIncompletePairIds:["missing.pair"]} as AnalysisEngineRequest;
 const tostResult={...result,protocolVersion:"0.16.0",equivalence:{resultVersion:"0.1.0",plan,comparisons:[{comparisonId:plan.primaryComparisonId,estimate:0.05,standardError:0.01,lowerConfidenceBound:0.02,upperConfidenceBound:0.08,confidenceLevel:0.9,lowerOneSidedPValue:0.001,upperOneSidedPValue:0.002,tostPValue:0.002,conclusion:"equivalence_supported",analysisSet:{completePairCount:4,excludedIncompletePairIds:["missing.pair"]}}]}} as AnalysisEngineResult;
 const methodsText=generateMethodsText({design,recommendation:{...recommendation,templateId:"D02",recommendedMethod:"paired_tost"},request:tostRequest,result:tostResult,graphSpec:null});
 const html=serializeAnalysisReviewSetHtml({locale:"ja",projectTitle:"Anonymous",readoutLabel:"Intensity",readoutUnit:"AU",conditionLabels:[],analysis:{request:tostRequest,result:tostResult,recommendation} as import("./experimentWorkspaceProject").WorkspaceGraphAnalysis,methodsText,svgText:"<svg/>",displayedDataCsv:"",statisticalNText:"完全な対応組 n=4組"});
 for (const expected of ["事前指定した同等性範囲","-0.3～0.4 AU","90%信頼区間","下限側片側p","上限側片側p","TOST p","alpha=0.05","同等性を支持","完全な対応組 4組","missing.pair"]) expect(html).toContain(expected);
});


describe('B02 saved Tukey definition and Methods provenance',()=>{
 it('preserves current dimensionless q and flags historical q without recalculating',()=>{
 const test={...result.tests[0],name:'tukey_hsd:condition.control-condition.treatment',statisticName:'q',statistic:5.196152422706632};
 const current=AnalysisEngineResultSchema.parse({...result,tests:[test],diagnostics:[{code:'tukey_studentized_range_q',message:'q is dimensionless'}]});
 const restored=AnalysisEngineResultSchema.parse(JSON.parse(JSON.stringify(current)));
 expect(restored.tests[0].statistic).toBe(test.statistic);expect(restored.diagnostics[0].code).toBe('tukey_studentized_range_q');
 const text=generateMethodsText({design,recommendation,request,result:restored});expect(text).toContain('q = 5.196');
 const legacy=AnalysisEngineResultSchema.parse({...result,tests:[{...test,statistic:-3}],diagnostics:[]});
 const oldText=generateMethodsText({design,recommendation,request,result:legacy});expect(oldText).toContain('旧q表記（統計量の定義未確認） = -3');expect(legacy.tests[0].statistic).toBe(-3);
 });
});

// Anonymous results captured from the pinned 0.15.2 packaged CLI.
describe('B07 saved directional Methods and review export',()=>{
 const cases=[{"request":{"requestId":"methods.D12.greater","projectId":"synthetic.methods","analysisId":"synthetic.analysis","templateId":"D12","templateVersion":"0.1.0","options":{"confidenceLevel":0.95,"alternative":"greater","multiplicityMethod":null},"protocolVersion":"0.9.0","method":"one_sample_t","conditionId":"c","nullValue":1,"observations":[{"observationId":"o0","experimentalUnitId":"u0","conditionId":"c","value":2},{"observationId":"o1","experimentalUnitId":"u1","conditionId":"c","value":3},{"observationId":"o2","experimentalUnitId":"u2","conditionId":"c","value":4},{"observationId":"o3","experimentalUnitId":"u3","conditionId":"c","value":6}]},"result":{"protocolVersion":"0.9.0","requestId":"methods.D12.greater","status":"ok","engine":{"name":"lsaa-python","version":"0.15.2","packages":{"numpy":"2.3.5","scipy":"1.18.0"}},"estimates":[{"name":"mean_difference_from_reference","value":2.75,"standardError":0.8539125638299665,"confidenceInterval":{"level":0.95,"lower":0.03246911620398496,"upper":5.467530883796015}}],"tests":[{"name":"one_sample_t_test","statisticName":"t","statistic":3.2204702407301595,"degreesOfFreedom":[3],"pValue":0.02428342827990051,"adjustedPValue":null,"effectSizeName":"cohen_dz","effectSize":1.6102351203650798}],"diagnostics":[{"code":"explicit_one_sample_reference","message":"The sample mean was compared with the explicit reference value 1.0."}],"warnings":[],"completedAt":"2026-10-10T11:22:36.236690+00:00"}},{"request":{"requestId":"methods.D12.less","projectId":"synthetic.methods","analysisId":"synthetic.analysis","templateId":"D12","templateVersion":"0.1.0","options":{"confidenceLevel":0.95,"alternative":"less","multiplicityMethod":null},"protocolVersion":"0.9.0","method":"one_sample_t","conditionId":"c","nullValue":1,"observations":[{"observationId":"o0","experimentalUnitId":"u0","conditionId":"c","value":2},{"observationId":"o1","experimentalUnitId":"u1","conditionId":"c","value":3},{"observationId":"o2","experimentalUnitId":"u2","conditionId":"c","value":4},{"observationId":"o3","experimentalUnitId":"u3","conditionId":"c","value":6}]},"result":{"protocolVersion":"0.9.0","requestId":"methods.D12.less","status":"ok","engine":{"name":"lsaa-python","version":"0.15.2","packages":{"numpy":"2.3.5","scipy":"1.18.0"}},"estimates":[{"name":"mean_difference_from_reference","value":2.75,"standardError":0.8539125638299665,"confidenceInterval":{"level":0.95,"lower":0.03246911620398496,"upper":5.467530883796015}}],"tests":[{"name":"one_sample_t_test","statisticName":"t","statistic":3.2204702407301595,"degreesOfFreedom":[3],"pValue":0.9757165717200995,"adjustedPValue":null,"effectSizeName":"cohen_dz","effectSize":1.6102351203650798}],"diagnostics":[{"code":"explicit_one_sample_reference","message":"The sample mean was compared with the explicit reference value 1.0."}],"warnings":[],"completedAt":"2026-10-10T11:22:37.532163+00:00"}},{"request":{"requestId":"methods.D16.greater","projectId":"synthetic.methods","analysisId":"synthetic.analysis","templateId":"D16","templateVersion":"0.1.0","options":{"confidenceLevel":0.95,"alternative":"greater","multiplicityMethod":null},"protocolVersion":"0.13.0","method":"simple_linear_regression","xLabel":"X","yLabel":"Y","xUnit":"","yUnit":"","includeIntercept":true,"points":[{"observationId":"o0","experimentalUnitId":"u0","x":1,"y":2},{"observationId":"o1","experimentalUnitId":"u1","x":2,"y":5},{"observationId":"o2","experimentalUnitId":"u2","x":3,"y":5},{"observationId":"o3","experimentalUnitId":"u3","x":4,"y":9}]},"result":{"protocolVersion":"0.13.0","requestId":"methods.D16.greater","status":"ok","engine":{"name":"lsaa-python","version":"0.15.2","packages":{"numpy":"2.3.5","scipy":"1.18.0"}},"estimates":[{"name":"slope","value":2.0999999999999996,"standardError":0.5196152422706634,"confidenceInterval":{"level":0.95,"lower":-0.13572394057529813,"upper":4.335723940575297}},{"name":"intercept","value":-1.2011804048124553e-15,"standardError":1.423024947075771,"confidenceInterval":null}],"tests":[{"name":"slope_hypothesis_test","statisticName":"t","statistic":4.041451884327379,"degreesOfFreedom":[2],"pValue":0.028060096275730556,"adjustedPValue":null,"effectSizeName":"r_squared","effectSize":0.8909090909090909}],"diagnostics":[{"code":"regression_model","message":"OLS with an estimated intercept; R-squared uses centered total sum of squares; X=X (); Y=Y ()."}],"warnings":[],"regression":{"slope":2.0999999999999996,"intercept":-1.2011804048124553e-15,"rSquared":0.8909090909090909,"xRange":[1,4],"confidenceLevel":0.95,"fittedLine":[{"x":1,"y":2.0999999999999983,"lower":-2.0826564985204548,"upper":6.282656498520451},{"x":1.0379746835443038,"y":2.1797468354430363,"lower":-1.935150315591617,"upper":6.2946439864776895},{"x":1.0759493670886076,"y":2.2594936708860742,"lower":-1.7882906701225951,"upper":6.307278011894743},{"x":1.1139240506329113,"y":2.339240506329112,"lower":-1.6421102578941364,"upper":6.320591270552361},{"x":1.1518987341772151,"y":2.41898734177215,"lower":-1.4966436511830405,"upper":6.334618334727341},{"x":1.189873417721519,"y":2.4987341772151885,"lower":-1.3519273980138813,"upper":6.349395752444258},{"x":1.2278481012658227,"y":2.578481012658226,"lower":-1.2080001228611574,"upper":6.364962148177609},{"x":1.2658227848101267,"y":2.658227848101264,"lower":-1.064902627867427,"upper":6.381358324069955},{"x":1.3037974683544304,"y":2.737974683544302,"lower":-0.9226779934074054,"upper":6.398627360496009},{"x":1.3417721518987342,"y":2.81772151898734,"lower":-0.781371676555771,"upper":6.416814714530451},{"x":1.379746835443038,"y":2.897468354430378,"lower":-0.6410316057052574,"upper":6.435968314566013},{"x":1.4177215189873418,"y":2.977215189873416,"lower":-0.5017082692298787,"upper":6.45613864897671},{"x":1.4556962025316456,"y":3.056962025316454,"lower":-0.36345479569567685,"upper":6.477378846328584},{"x":1.4936708860759493,"y":3.1367088607594917,"lower":-0.22632702269022076,"upper":6.499744744209204},{"x":1.5316455696202533,"y":3.21645569620253,"lower":-0.09038355087649919,"upper":6.5232949432815595},{"x":1.5696202531645569,"y":3.2962025316455676,"lower":0.04431422061485435,"upper":6.548090842676281},{"x":1.6075949367088609,"y":3.375949367088606,"lower":0.17770208184652736,"upper":6.574196652330684},{"x":1.6455696202531644,"y":3.4556962025316436,"lower":0.3097130276811124,"upper":6.601679377382174},{"x":1.6835443037974684,"y":3.535443037974682,"lower":0.4402773066977459,"upper":6.630608769251618},{"x":1.7215189873417722,"y":3.61518987341772,"lower":0.5693225091939076,"upper":6.661057237641533},{"x":1.759493670886076,"y":3.6949367088607574,"lower":0.6967737003569674,"upper":6.6930997173645475},{"x":1.7974683544303798,"y":3.7746835443037954,"lower":0.8225536048496664,"upper":6.726813483757924},{"x":1.8354430379746836,"y":3.8544303797468333,"lower":0.9465828490075503,"upper":6.762277910486116},{"x":1.8734177215189873,"y":3.9341772151898713,"lower":1.0687802665323538,"upper":6.799574163847389},{"x":1.9113924050632911,"y":4.01392405063291,"lower":1.1890632729185038,"upper":6.838784828347316},{"x":1.949367088607595,"y":4.093670886075948,"lower":1.3073483128072274,"upper":6.879993459344669},{"x":1.9873417721518987,"y":4.173417721518986,"lower":1.4235513829693143,"upper":6.9232840600686565},{"x":2.0253164556962027,"y":4.253164556962024,"lower":1.537588631635228,"upper":6.96874048228882},{"x":2.0632911392405067,"y":4.332911392405062,"lower":1.649377032408054,"upper":7.0164457524020705},{"x":2.1012658227848102,"y":4.4126582278481,"lower":1.7588351280355319,"upper":7.066481327660668},{"x":2.1392405063291138,"y":4.492405063291137,"lower":1.8658838359531251,"upper":7.118926290629149},{"x":2.1772151898734178,"y":4.572151898734176,"lower":1.970447303865702,"upper":7.173856493602649},{"x":2.2151898734177218,"y":4.651898734177214,"lower":2.0724537998926222,"upper":7.231343668461806},{"x":2.2531645569620253,"y":4.731645569620252,"lower":2.1718366181949076,"upper":7.291454521045596},{"x":2.291139240506329,"y":4.811392405063289,"lower":2.2685349778109565,"upper":7.354249832315622},{"x":2.329113924050633,"y":4.891139240506328,"lower":2.362494889947802,"upper":7.419783591064853},{"x":2.367088607594937,"y":4.970886075949366,"lower":2.45366996750041,"upper":7.488102184398322},{"x":2.4050632911392404,"y":5.050632911392404,"lower":2.542022150353054,"upper":7.559243672431753},{"x":2.4430379746835444,"y":5.130379746835442,"lower":2.627522321228841,"upper":7.633237172442042},{"x":2.481012658227848,"y":5.2101265822784795,"lower":2.71015078956169,"upper":7.7101023749952695},{"x":2.518987341772152,"y":5.289873417721517,"lower":2.7898976250047274,"upper":7.789849210438307},{"x":2.556962025316456,"y":5.369620253164555,"lower":2.8667628275579546,"upper":7.872477678771157},{"x":2.5949367088607596,"y":5.449367088607593,"lower":2.940756327568243,"upper":7.957977849646943},{"x":2.632911392405063,"y":5.52911392405063,"lower":3.0118978156016745,"upper":8.046330032499586},{"x":2.670886075949367,"y":5.608860759493669,"lower":3.0802164089351427,"upper":8.137505110052196},{"x":2.708860759493671,"y":5.688607594936707,"lower":3.145750167684374,"upper":8.23146502218904},{"x":2.7468354430379747,"y":5.768354430379745,"lower":3.2085454789544006,"upper":8.328163381805089},{"x":2.7848101265822782,"y":5.848101265822782,"lower":3.26865633153819,"upper":8.427546200107376},{"x":2.8227848101265822,"y":5.927848101265821,"lower":3.326143506397347,"upper":8.529552696134294},{"x":2.8607594936708862,"y":6.007594936708859,"lower":3.3810737093708463,"upper":8.634116164046873},{"x":2.89873417721519,"y":6.087341772151897,"lower":3.433518672339329,"upper":8.741164871964466},{"x":2.9367088607594938,"y":6.167088607594935,"lower":3.4835542475979264,"upper":8.850622967591944},{"x":2.9746835443037973,"y":6.2468354430379724,"lower":3.5312595177111765,"upper":8.96241136836477},{"x":3.0126582278481013,"y":6.326582278481011,"lower":3.576715939931339,"upper":9.076448617030682},{"x":3.0506329113924053,"y":6.406329113924049,"lower":3.620006540655328,"upper":9.19265168719277},{"x":3.088607594936709,"y":6.486075949367087,"lower":3.6612151716526804,"upper":9.310936727081494},{"x":3.126582278481013,"y":6.565822784810125,"lower":3.7004258361526072,"upper":9.431219733467643},{"x":3.1645569620253164,"y":6.645569620253163,"lower":3.737722089513879,"upper":9.553417150992447},{"x":3.2025316455696204,"y":6.725316455696201,"lower":3.7731865162420712,"upper":9.67744639515033},{"x":3.240506329113924,"y":6.805063291139239,"lower":3.8069002826354486,"upper":9.803226299643029},{"x":3.278481012658228,"y":6.884810126582277,"lower":3.838942762358464,"upper":9.93067749080609},{"x":3.3164556962025316,"y":6.9645569620253145,"lower":3.8693912307483784,"upper":10.05972269330225},{"x":3.3544303797468356,"y":7.044303797468353,"lower":3.8983206226178218,"upper":10.190286972318884},{"x":3.392405063291139,"y":7.12405063291139,"lower":3.9258033476693113,"upper":10.32229791815347},{"x":3.430379746835443,"y":7.203797468354429,"lower":3.951909157323715,"upper":10.455685779385142},{"x":3.468354430379747,"y":7.283544303797467,"lower":3.976705056718437,"upper":10.590383550876497},{"x":3.5063291139240507,"y":7.363291139240504,"lower":4.00025525579079,"upper":10.726327022690217},{"x":3.5443037974683547,"y":7.443037974683542,"lower":4.022621153671411,"upper":10.863454795695674},{"x":3.5822784810126582,"y":7.52278481012658,"lower":4.043861351023285,"upper":11.001708269229875},{"x":3.6202531645569622,"y":7.602531645569618,"lower":4.0640316854339815,"upper":11.141031605705255},{"x":3.6582278481012658,"y":7.682278481012656,"lower":4.083185285469545,"upper":11.281371676555766},{"x":3.6962025316455698,"y":7.762025316455694,"lower":4.101372639503985,"upper":11.422677993407403},{"x":3.7341772151898733,"y":7.841772151898732,"lower":4.118641675930041,"upper":11.564902627867422},{"x":3.7721518987341773,"y":7.92151898734177,"lower":4.135037851822386,"upper":11.708000122861154},{"x":3.810126582278481,"y":8.001265822784807,"lower":4.150604247555737,"upper":11.851927398013878},{"x":3.848101265822785,"y":8.081012658227845,"lower":4.165381665272654,"upper":11.996643651183035},{"x":3.886075949367089,"y":8.160759493670884,"lower":4.179408729447635,"upper":12.142110257894133},{"x":3.9240506329113924,"y":8.240506329113922,"lower":4.1927219881052515,"upper":12.288290670122592},{"x":3.9620253164556964,"y":8.32025316455696,"lower":4.205356013522305,"upper":12.435150315591613},{"x":4,"y":8.399999999999997,"lower":4.217343501479544,"upper":12.58265649852045}]},"completedAt":"2026-10-10T11:22:38.723453+00:00"}},{"request":{"requestId":"methods.D16.less","projectId":"synthetic.methods","analysisId":"synthetic.analysis","templateId":"D16","templateVersion":"0.1.0","options":{"confidenceLevel":0.95,"alternative":"less","multiplicityMethod":null},"protocolVersion":"0.13.0","method":"simple_linear_regression","xLabel":"X","yLabel":"Y","xUnit":"","yUnit":"","includeIntercept":true,"points":[{"observationId":"o0","experimentalUnitId":"u0","x":1,"y":2},{"observationId":"o1","experimentalUnitId":"u1","x":2,"y":5},{"observationId":"o2","experimentalUnitId":"u2","x":3,"y":5},{"observationId":"o3","experimentalUnitId":"u3","x":4,"y":9}]},"result":{"protocolVersion":"0.13.0","requestId":"methods.D16.less","status":"ok","engine":{"name":"lsaa-python","version":"0.15.2","packages":{"numpy":"2.3.5","scipy":"1.18.0"}},"estimates":[{"name":"slope","value":2.0999999999999996,"standardError":0.5196152422706634,"confidenceInterval":{"level":0.95,"lower":-0.13572394057529813,"upper":4.335723940575297}},{"name":"intercept","value":-1.2011804048124553e-15,"standardError":1.423024947075771,"confidenceInterval":null}],"tests":[{"name":"slope_hypothesis_test","statisticName":"t","statistic":4.041451884327379,"degreesOfFreedom":[2],"pValue":0.9719399037242694,"adjustedPValue":null,"effectSizeName":"r_squared","effectSize":0.8909090909090909}],"diagnostics":[{"code":"regression_model","message":"OLS with an estimated intercept; R-squared uses centered total sum of squares; X=X (); Y=Y ()."}],"warnings":[],"regression":{"slope":2.0999999999999996,"intercept":-1.2011804048124553e-15,"rSquared":0.8909090909090909,"xRange":[1,4],"confidenceLevel":0.95,"fittedLine":[{"x":1,"y":2.0999999999999983,"lower":-2.0826564985204548,"upper":6.282656498520451},{"x":1.0379746835443038,"y":2.1797468354430363,"lower":-1.935150315591617,"upper":6.2946439864776895},{"x":1.0759493670886076,"y":2.2594936708860742,"lower":-1.7882906701225951,"upper":6.307278011894743},{"x":1.1139240506329113,"y":2.339240506329112,"lower":-1.6421102578941364,"upper":6.320591270552361},{"x":1.1518987341772151,"y":2.41898734177215,"lower":-1.4966436511830405,"upper":6.334618334727341},{"x":1.189873417721519,"y":2.4987341772151885,"lower":-1.3519273980138813,"upper":6.349395752444258},{"x":1.2278481012658227,"y":2.578481012658226,"lower":-1.2080001228611574,"upper":6.364962148177609},{"x":1.2658227848101267,"y":2.658227848101264,"lower":-1.064902627867427,"upper":6.381358324069955},{"x":1.3037974683544304,"y":2.737974683544302,"lower":-0.9226779934074054,"upper":6.398627360496009},{"x":1.3417721518987342,"y":2.81772151898734,"lower":-0.781371676555771,"upper":6.416814714530451},{"x":1.379746835443038,"y":2.897468354430378,"lower":-0.6410316057052574,"upper":6.435968314566013},{"x":1.4177215189873418,"y":2.977215189873416,"lower":-0.5017082692298787,"upper":6.45613864897671},{"x":1.4556962025316456,"y":3.056962025316454,"lower":-0.36345479569567685,"upper":6.477378846328584},{"x":1.4936708860759493,"y":3.1367088607594917,"lower":-0.22632702269022076,"upper":6.499744744209204},{"x":1.5316455696202533,"y":3.21645569620253,"lower":-0.09038355087649919,"upper":6.5232949432815595},{"x":1.5696202531645569,"y":3.2962025316455676,"lower":0.04431422061485435,"upper":6.548090842676281},{"x":1.6075949367088609,"y":3.375949367088606,"lower":0.17770208184652736,"upper":6.574196652330684},{"x":1.6455696202531644,"y":3.4556962025316436,"lower":0.3097130276811124,"upper":6.601679377382174},{"x":1.6835443037974684,"y":3.535443037974682,"lower":0.4402773066977459,"upper":6.630608769251618},{"x":1.7215189873417722,"y":3.61518987341772,"lower":0.5693225091939076,"upper":6.661057237641533},{"x":1.759493670886076,"y":3.6949367088607574,"lower":0.6967737003569674,"upper":6.6930997173645475},{"x":1.7974683544303798,"y":3.7746835443037954,"lower":0.8225536048496664,"upper":6.726813483757924},{"x":1.8354430379746836,"y":3.8544303797468333,"lower":0.9465828490075503,"upper":6.762277910486116},{"x":1.8734177215189873,"y":3.9341772151898713,"lower":1.0687802665323538,"upper":6.799574163847389},{"x":1.9113924050632911,"y":4.01392405063291,"lower":1.1890632729185038,"upper":6.838784828347316},{"x":1.949367088607595,"y":4.093670886075948,"lower":1.3073483128072274,"upper":6.879993459344669},{"x":1.9873417721518987,"y":4.173417721518986,"lower":1.4235513829693143,"upper":6.9232840600686565},{"x":2.0253164556962027,"y":4.253164556962024,"lower":1.537588631635228,"upper":6.96874048228882},{"x":2.0632911392405067,"y":4.332911392405062,"lower":1.649377032408054,"upper":7.0164457524020705},{"x":2.1012658227848102,"y":4.4126582278481,"lower":1.7588351280355319,"upper":7.066481327660668},{"x":2.1392405063291138,"y":4.492405063291137,"lower":1.8658838359531251,"upper":7.118926290629149},{"x":2.1772151898734178,"y":4.572151898734176,"lower":1.970447303865702,"upper":7.173856493602649},{"x":2.2151898734177218,"y":4.651898734177214,"lower":2.0724537998926222,"upper":7.231343668461806},{"x":2.2531645569620253,"y":4.731645569620252,"lower":2.1718366181949076,"upper":7.291454521045596},{"x":2.291139240506329,"y":4.811392405063289,"lower":2.2685349778109565,"upper":7.354249832315622},{"x":2.329113924050633,"y":4.891139240506328,"lower":2.362494889947802,"upper":7.419783591064853},{"x":2.367088607594937,"y":4.970886075949366,"lower":2.45366996750041,"upper":7.488102184398322},{"x":2.4050632911392404,"y":5.050632911392404,"lower":2.542022150353054,"upper":7.559243672431753},{"x":2.4430379746835444,"y":5.130379746835442,"lower":2.627522321228841,"upper":7.633237172442042},{"x":2.481012658227848,"y":5.2101265822784795,"lower":2.71015078956169,"upper":7.7101023749952695},{"x":2.518987341772152,"y":5.289873417721517,"lower":2.7898976250047274,"upper":7.789849210438307},{"x":2.556962025316456,"y":5.369620253164555,"lower":2.8667628275579546,"upper":7.872477678771157},{"x":2.5949367088607596,"y":5.449367088607593,"lower":2.940756327568243,"upper":7.957977849646943},{"x":2.632911392405063,"y":5.52911392405063,"lower":3.0118978156016745,"upper":8.046330032499586},{"x":2.670886075949367,"y":5.608860759493669,"lower":3.0802164089351427,"upper":8.137505110052196},{"x":2.708860759493671,"y":5.688607594936707,"lower":3.145750167684374,"upper":8.23146502218904},{"x":2.7468354430379747,"y":5.768354430379745,"lower":3.2085454789544006,"upper":8.328163381805089},{"x":2.7848101265822782,"y":5.848101265822782,"lower":3.26865633153819,"upper":8.427546200107376},{"x":2.8227848101265822,"y":5.927848101265821,"lower":3.326143506397347,"upper":8.529552696134294},{"x":2.8607594936708862,"y":6.007594936708859,"lower":3.3810737093708463,"upper":8.634116164046873},{"x":2.89873417721519,"y":6.087341772151897,"lower":3.433518672339329,"upper":8.741164871964466},{"x":2.9367088607594938,"y":6.167088607594935,"lower":3.4835542475979264,"upper":8.850622967591944},{"x":2.9746835443037973,"y":6.2468354430379724,"lower":3.5312595177111765,"upper":8.96241136836477},{"x":3.0126582278481013,"y":6.326582278481011,"lower":3.576715939931339,"upper":9.076448617030682},{"x":3.0506329113924053,"y":6.406329113924049,"lower":3.620006540655328,"upper":9.19265168719277},{"x":3.088607594936709,"y":6.486075949367087,"lower":3.6612151716526804,"upper":9.310936727081494},{"x":3.126582278481013,"y":6.565822784810125,"lower":3.7004258361526072,"upper":9.431219733467643},{"x":3.1645569620253164,"y":6.645569620253163,"lower":3.737722089513879,"upper":9.553417150992447},{"x":3.2025316455696204,"y":6.725316455696201,"lower":3.7731865162420712,"upper":9.67744639515033},{"x":3.240506329113924,"y":6.805063291139239,"lower":3.8069002826354486,"upper":9.803226299643029},{"x":3.278481012658228,"y":6.884810126582277,"lower":3.838942762358464,"upper":9.93067749080609},{"x":3.3164556962025316,"y":6.9645569620253145,"lower":3.8693912307483784,"upper":10.05972269330225},{"x":3.3544303797468356,"y":7.044303797468353,"lower":3.8983206226178218,"upper":10.190286972318884},{"x":3.392405063291139,"y":7.12405063291139,"lower":3.9258033476693113,"upper":10.32229791815347},{"x":3.430379746835443,"y":7.203797468354429,"lower":3.951909157323715,"upper":10.455685779385142},{"x":3.468354430379747,"y":7.283544303797467,"lower":3.976705056718437,"upper":10.590383550876497},{"x":3.5063291139240507,"y":7.363291139240504,"lower":4.00025525579079,"upper":10.726327022690217},{"x":3.5443037974683547,"y":7.443037974683542,"lower":4.022621153671411,"upper":10.863454795695674},{"x":3.5822784810126582,"y":7.52278481012658,"lower":4.043861351023285,"upper":11.001708269229875},{"x":3.6202531645569622,"y":7.602531645569618,"lower":4.0640316854339815,"upper":11.141031605705255},{"x":3.6582278481012658,"y":7.682278481012656,"lower":4.083185285469545,"upper":11.281371676555766},{"x":3.6962025316455698,"y":7.762025316455694,"lower":4.101372639503985,"upper":11.422677993407403},{"x":3.7341772151898733,"y":7.841772151898732,"lower":4.118641675930041,"upper":11.564902627867422},{"x":3.7721518987341773,"y":7.92151898734177,"lower":4.135037851822386,"upper":11.708000122861154},{"x":3.810126582278481,"y":8.001265822784807,"lower":4.150604247555737,"upper":11.851927398013878},{"x":3.848101265822785,"y":8.081012658227845,"lower":4.165381665272654,"upper":11.996643651183035},{"x":3.886075949367089,"y":8.160759493670884,"lower":4.179408729447635,"upper":12.142110257894133},{"x":3.9240506329113924,"y":8.240506329113922,"lower":4.1927219881052515,"upper":12.288290670122592},{"x":3.9620253164556964,"y":8.32025316455696,"lower":4.205356013522305,"upper":12.435150315591613},{"x":4,"y":8.399999999999997,"lower":4.217343501479544,"upper":12.58265649852045}]},"completedAt":"2026-10-10T11:22:39.802996+00:00"}}];
 it.each(cases)('preserves $request.templateId $request.options.alternative after serialization',async({request:rawRequest,result:rawResult})=>{
 const saved=JSON.parse(JSON.stringify({request:rawRequest,result:rawResult}));
 const parsedRequest=AnalysisEngineRequestSchema.parse(saved.request);
 const parsedResult=AnalysisEngineResultSchema.parse(saved.result);
 const chosenRecommendation={...recommendation,templateId:parsedRequest.templateId,recommendedMethod:parsedRequest.method};
 const methodsText=generateMethodsText({design,recommendation:chosenRecommendation,request:parsedRequest,result:parsedResult});
 const target=parsedRequest.templateId==='D12'?'基準値 1':'回帰の傾きと0';
 expect(methodsText).toContain(target);
 expect(methodsText).toContain(parsedRequest.options.alternative==='greater'?'大きい':'小さい');
 expect(methodsText).toContain('信頼区間（両側）：95%');
 expect(methodsText).toContain('片側p値と同じ棄却境界を表す区間ではありません');
 if(parsedRequest.templateId==='D16'){expect(methodsText).toContain('単一の回帰の傾きと0の比較');expect(methodsText).not.toContain('事前指定した単一の回帰');expect(methodsText).not.toContain('2条件の主比較のため');}
 const {serializeAnalysisReviewSetHtml}=await import('../components/graph/analysisReviewSet');
 const html=serializeAnalysisReviewSetHtml({locale:'ja',projectTitle:'Anonymous',readoutLabel:'Synthetic',readoutUnit:'',conditionLabels:[],analysis:{request:parsedRequest,result:parsedResult,recommendation:chosenRecommendation} as import('./experimentWorkspaceProject').WorkspaceGraphAnalysis,methodsText,svgText:'<svg/>',displayedDataCsv:'',statisticalNText:'n=4'});
 expect(html).toContain('片側p値と同じ棄却境界を表す区間ではありません');
 expect(html).toContain('信頼区間（両側）：95%');
 expect(saved.result).toEqual(rawResult);
 });
 it.each(['D12','D16'])('%s keeps the central CI while the directional p changes',(template)=>{
 const [greater,less]=cases.filter(c=>c.request.templateId===template);
 expect(greater.result.estimates).toEqual(less.result.estimates);
 expect(greater.result.tests[0].pValue+less.result.tests[0].pValue).toBeCloseTo(1,12);
 });
});
