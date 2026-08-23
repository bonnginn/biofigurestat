import { describe, expect, it, vi } from "vitest";

import type {
  AnalysisEngineRequest,
  AnalysisEngineResult,
  AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import { AnalysisEngineRequestSchema } from "@lsaa/analysis-contracts";
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
