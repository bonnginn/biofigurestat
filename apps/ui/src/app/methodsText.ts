import type {
  AnalysisEngineRequest,
  AnalysisEngineResult,
  AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import type {
  DerivedDatasetRevision,
  DerivedScalarValue,
  ExperimentDesign,
  TransformationSpec,
} from "@lsaa/domain";
import type { GraphSpec } from "@lsaa/graph-spec";

import { methodLabel, templateLabel } from "./recommendationLabels";
import {
  nonlinearModelLabel,
  nonlinearParameterLabel,
  type NonlinearModelId,
} from "./nonlinearModelRegistry";
import { PRODUCT_IDENTITY } from "./productIdentity";

export type MethodsTextInput = Readonly<{
  design: ExperimentDesign;
  recommendation: AnalysisRecommendation;
  request: AnalysisEngineRequest;
  result: AnalysisEngineResult;
  graphSpec?: GraphSpec | null;
  graphErrorBar?: "sd" | "sem" | "none";
  nestedSummary?: Readonly<{
    transformation: TransformationSpec;
    revision: DerivedDatasetRevision;
    values: DerivedScalarValue[];
  }> | null;
  outcomeId?: string;
  repeatedAxis?: Readonly<{
    semantic: "time" | "numeric_covariate" | "categorical";
    title: string;
    unit: string;
  }>;
}>;

function repeatedAxisLabel(input: MethodsTextInput): string {
  const requestFactor =
    input.request.protocolVersion === "0.7.0" || input.request.protocolVersion === "0.10.0"
      ? input.request.withinFactor
      : input.request.protocolVersion === "0.6.0"
        ? input.request.withinFactor
        : undefined;
  if (input.repeatedAxis?.semantic === "numeric_covariate") {
    return input.repeatedAxis.title.trim() || "数値軸";
  }
  if (input.repeatedAxis?.semantic === "categorical") {
    return input.repeatedAxis.title.trim() || "反復軸";
  }
  return input.repeatedAxis?.title.trim() || requestFactor?.title.trim() || "時間";
}

function methodsTemplateLabel(input: MethodsTextInput): string {
  if (input.recommendation.templateId === "D07") {
    return `D07 · 独立条件×${repeatedAxisLabel(input)}の二因子解析`;
  }
  if (input.recommendation.templateId === "D13") {
    return `D13 · 条件×${repeatedAxisLabel(input)}の反復カテゴリ状態`;
  }
  if (input.recommendation.templateId !== "D06") {
    return templateLabel(input.recommendation.templateId);
  }
  return `D06 · 条件×${repeatedAxisLabel(input)}の反復測定`;
}

function methodsMethodLabel(
  input: MethodsTextInput,
  method: AnalysisRecommendation["recommendedMethod"],
): string {
  if (input.recommendation.templateId === "D06" && method === "mixed_anova") {
    return `条件×${repeatedAxisLabel(input)}の反復測定分散分析`;
  }
  if (input.recommendation.templateId === "D07" && method === "two_way_anova") {
    return `独立条件×${repeatedAxisLabel(input)}の二因子分散分析`;
  }
  if (input.recommendation.templateId === "D13" && method === "mixed_anova") {
    return `条件×${repeatedAxisLabel(input)}の反復カテゴリ状態分散分析`;
  }
  return methodLabel(method);
}

function numberLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return String(Number(value.toFixed(4)));
}

function pValueLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  return value < 0.0001 ? value.toExponential(2) : numberLabel(value);
}

function degreesLabel(values: number[] | null | undefined): string {
  if (!values || values.length === 0) return "—";
  return values.map(numberLabel).join(", ");
}

function errorBarLabel(
  graphSpec: GraphSpec | null | undefined,
  graphErrorBar: MethodsTextInput["graphErrorBar"],
): string {
  if (graphErrorBar === "sd") return "平均±SD（標本標準偏差）";
  if (graphErrorBar === "sem") return "平均±SEM（SD/√n）";
  if (graphErrorBar === "none") return "エラーバーなし";
  if (!graphSpec) return "グラフ仕様なし（SD/SEMは断定しない）";
  if (graphSpec.summary.interval === "sd") return "平均±SD（標本標準偏差）";
  if (graphSpec.summary.interval === "sem") return "平均±SEM（SD/√n）";
  if (graphSpec.summary.interval === "ci") return "平均と信頼区間";
  return "エラーバーなし";
}

function conditionLabels(input: MethodsTextInput): string {
  if (input.request.protocolVersion === "0.11.0") return input.request.rowCategoryIds.join(" vs ");
  if (input.request.protocolVersion === "0.12.0") return input.request.conditionIds.join(" vs ");
  if (input.request.protocolVersion === "0.13.0")
    return `${input.request.xLabel} → ${input.request.yLabel}`;
  if (input.request.protocolVersion === "0.14.0")
    return `${input.request.seriesIds.join(" vs ")}（${input.request.xLabel} → ${input.request.yLabel}）`;
  const labels = new Map(
    input.design.conditions.map((condition) => [condition.id, condition.label]),
  );
  const contrastIds =
    input.request.protocolVersion === "0.1.0" || input.request.protocolVersion === "0.15.0"
      ? input.request.contrastConditionIds
      : input.request.protocolVersion === "0.9.0"
        ? [input.request.conditionId]
        : input.request.protocolVersion === "0.5.0"
          ? input.request.variableConditionIds
          : input.request.protocolVersion === "0.6.0" ||
              input.request.protocolVersion === "0.7.0" ||
              input.request.protocolVersion === "0.8.0" ||
              input.request.protocolVersion === "0.10.0"
            ? input.request.conditionIds
            : input.request.primaryContrastConditionIds;
  return contrastIds
    .map((conditionId) => labels.get(conditionId) ?? conditionId)
    .join(input.request.protocolVersion === "0.5.0" ? " と " : " vs ");
}

function allConditionLabels(input: MethodsTextInput): string {
  if (input.request.protocolVersion === "0.11.0") return input.request.rowCategoryIds.join("、");
  if (input.request.protocolVersion === "0.12.0") return input.request.conditionIds.join("、");
  if (input.request.protocolVersion === "0.13.0")
    return `${input.request.xLabel}、${input.request.yLabel}`;
  if (input.request.protocolVersion === "0.14.0")
    return `${input.request.seriesIds.join("、")}（${input.request.modelId}）`;
  const labels = new Map(
    input.design.conditions.map((condition) => [condition.id, condition.label]),
  );
  const conditionIds =
    input.request.protocolVersion === "0.1.0" || input.request.protocolVersion === "0.15.0"
      ? input.request.contrastConditionIds
      : input.request.protocolVersion === "0.9.0"
        ? [input.request.conditionId]
        : input.request.protocolVersion === "0.5.0"
          ? input.request.variableConditionIds
          : "conditionIds" in input.request
            ? input.request.conditionIds
            : input.request.conditions.map((condition) => condition.conditionId);
  return conditionIds.map((conditionId) => labels.get(conditionId) ?? conditionId).join("、");
}

function normalizationWarning(design: ExperimentDesign): string {
  if (design.normalizationPlans.length === 0) {
    return "正規化：実行設定に正規化計画がありません（該当なし／未設定）。";
  }
  const labels = design.normalizationPlans.map((plan) => {
    if (plan.method === "loading_control") {
      if (plan.parameters.inputMode === "imagej_mean_background_area") {
        return "ImageJのMean intensityとMean backgroundから（Intensity − Background）× Areaで標的・referenceの各補正値を求め、その標的補正値 ÷ reference補正値を計算（式version 0.1.0、元測定値を保持）";
      }
      return "標的バンド強度 ÷ ローディングコントロール強度";
    }
    if (plan.method === "baseline") return "基準値との差";
    if (plan.method === "control_equals_one") return "対照群を1とした相対値";
    if (plan.method === "per_unit_maximum") return "各単位の最大値を基準とした相対値";
    if (plan.method === "none") return "なし";
    return "カスタム正規化";
  });
  return `正規化：${labels.join("、")}。設定と元の値はプロジェクトに保持。`;
}

function pairingLabel(design: ExperimentDesign): string {
  if (design.pairing.kind === "matched") {
    const matchLevelId = design.pairing.matchLevelId;
    if (matchLevelId !== design.experimentalUnitLevelId) {
      const sourceLevel = design.unitLevels.find(({ id }) => id === matchLevelId);
      const experimentalUnitLevel = design.unitLevels.find(
        ({ id }) => id === design.experimentalUnitLevelId,
      );
      const sourceLabel = sourceLevel?.label ?? "共有する由来";
      const experimentalUnitLabel = experimentalUnitLevel?.label ?? "条件別の実験単位";
      return `対応構造：同じ${sourceLabel}に由来する条件別${experimentalUnitLabel}を${sourceLabel}内で対応づけて比較。条件別${experimentalUnitLabel}は別々の実験単位として保持。`;
    }
    return `対応構造：同じ／対応づけた実験単位（${design.pairing.matchLevelId}）を条件間で比較。`;
  }
  if (design.pairing.kind === "blocked") {
    return `対応構造：明示したブロック（${design.pairing.blockLevelId}）内で比較。`;
  }
  return "対応構造：条件間で別々の独立した実験単位。";
}

function scientificGroupingWarning(input: MethodsTextInput): string | null {
  const { design } = input;
  const factor = design.factors.length === 1 ? design.factors[0] : undefined;
  if (!factor?.levelGroups?.length) return null;
  const groups = factor.levelGroups.map((group) => group.label).join("、");
  return `科学的な上位グループ（${groups}）は表示上の分類であり、各条件レベルを合算していません。D03では各条件レベルを別の比較群として保持し、独立した実験またはdishを統計上のnとしました。実行した比較と補正は${input.request.options.multiplicityMethod ?? "全体検定のみ"}として記録しています。`;
}

function explicitControlNote(input: MethodsTextInput): string | null {
  if (
    input.request.protocolVersion !== "0.2.0" ||
    !("controlConditionId" in input.request) ||
    !input.request.controlConditionId
  )
    return null;
  const controlConditionId = input.request.controlConditionId;
  const condition = input.design.conditions.find(({ id }) => id === controlConditionId);
  return `対照群：研究者が${condition?.label ?? controlConditionId}を明示指定（条件ID ${controlConditionId}）。表示名から推測していません。`;
}

function explicitContrastNote(input: MethodsTextInput): string | null {
  if (input.request.protocolVersion !== "0.2.0") return null;
  const labels = new Map(
    input.design.conditions.map((condition) => [condition.id, condition.label]),
  );
  if (input.request.contrastIntent === "planned_comparisons") {
    const pairs = (input.request.plannedContrastConditionIds ?? []).map(
      ([firstId, secondId]) =>
        `${labels.get(firstId) ?? firstId} vs ${labels.get(secondId) ?? secondId}`,
    );
    return `比較意図：事前に明示した条件ペアのみ（${pairs.join("、") || "選択なし"}）。任意の線形対比や未選択のペアは含めていません。`;
  }
  const labelsByIntent = {
    all_pairs: "すべての条件ペア",
    control_vs_many: "明示した対照群と各処置",
    omnibus_only: "全体差のみ（条件間比較なし）",
  };
  return `比較意図：${labelsByIntent[input.request.contrastIntent]}。`;
}

function executedNestedSummaryNote(input: MethodsTextInput): string | null {
  const nested = input.nestedSummary;
  if (!nested || nested.revision.state !== "current") return null;
  if (nested.transformation.id !== nested.revision.transformationId) return null;
  if (
    !input.request.observations.every((observation) =>
      nested.values.some((value) => value.id === observation.observationId),
    )
  )
    return null;
  const experimentalUnit = input.design.unitLevels.find(
    (level) => level.id === input.design.experimentalUnitLevelId,
  );
  const center = nested.transformation.parameters.center === "median" ? "中央値" : "平均";
  const weighting =
    nested.transformation.parameters.weighting === "equal_observations_within_experimental_unit"
      ? "各実験単位内でcell/ROIを等重み"
      : "保存された重み付け設定";
  const counts = input.design.conditions.map((condition) => {
    const values = nested.values.filter((value) => value.conditionId === condition.id);
    const rawCount = values.reduce((sum, value) => sum + value.subsampleCount, 0);
    return `${condition.label}: 生物学的n=${values.length}、cell/ROI=${rawCount}`;
  });
  return `入れ子観測：D10要約 ${nested.transformation.version}でcell/ROIを各${experimentalUnit?.label ?? "実験単位"}内の${center}へ変換（${weighting}、${counts.join("、")}）。統計解析には派生データ ${nested.revision.id} の生物学的反復値だけを使用し、cell/ROI数を独立したnとして数えていません。`;
}

function comparisonName(input: MethodsTextInput, testName: string): string {
  const labels = new Map(
    input.design.conditions.map((condition) => [condition.id, condition.label]),
  );
  const [, firstId, secondId] = testName.split(":");
  if (!firstId || !secondId) return testName;
  return `${labels.get(firstId) ?? firstId} vs ${labels.get(secondId) ?? secondId}`;
}

function intervalText(estimate: AnalysisEngineResult["estimates"][number] | undefined): string {
  const interval = estimate?.confidenceInterval;
  if (!interval) return "信頼区間なし";
  return `${numberLabel(interval.level * 100)}%信頼区間 ${numberLabel(interval.lower)}～${numberLabel(interval.upper)}`;
}

function pairwiseResultLines(input: MethodsTextInput, testOffset: number): string[] {
  return input.result.tests.slice(testOffset).map((test, index) => {
    const estimate = input.result.estimates[index];
    return `・${comparisonName(input, test.name)}：平均値の差 ${numberLabel(estimate?.value)}（${intervalText(estimate)}）、p=${pValueLabel(test.pValue)}、調整済みp=${pValueLabel(test.adjustedPValue)}、${test.effectSizeName ?? "効果量"}=${numberLabel(test.effectSize)}`;
  });
}

function executedResultLines(input: MethodsTextInput): string[] {
  const { recommendation, result, design } = input;
  if (input.request.protocolVersion === "0.15.0" && result.equivalence) {
    const comparison = result.equivalence.comparisons[0];
    const margin = result.equivalence.plan.margin;
    const conclusion =
      comparison?.conclusion === "equivalence_supported"
        ? "事前指定した範囲内の同等性を支持"
        : comparison?.conclusion === "meaningful_difference_supported"
          ? "事前指定した範囲を超える意味のある差を支持"
          : "同等とも意味のある差とも結論できない";
    return [
      `結果：${result.status === "ok" ? "完了" : result.status}`,
      `推定対象：独立2群の平均差（${conditionLabels(input)}）`,
      `事前指定した同等性範囲：${numberLabel(margin.lowerBound)}～${numberLabel(margin.upperBound)} ${margin.unit}（raw difference）`,
      `平均差：${numberLabel(comparison?.estimate)}（SE=${numberLabel(comparison?.standardError)}、${numberLabel(comparison?.confidenceLevel ? comparison.confidenceLevel * 100 : null)}%信頼区間 ${numberLabel(comparison?.lowerConfidenceBound)}～${numberLabel(comparison?.upperConfidenceBound)}）`,
      `TOST：下限側片側p=${pValueLabel(comparison?.lowerOneSidedPValue)}、上限側片側p=${pValueLabel(comparison?.upperOneSidedPValue)}、TOST p=${pValueLabel(comparison?.tostPValue)}`,
      `同等性の結論：${conclusion}`,
      "判断規則：2つの片側検定をalpha=0.05で行い、対応する両側90%信頼区間が事前指定範囲内に完全に入る場合だけ同等性を支持した。",
    ];
  }
  if (recommendation.templateId === "D17" && result.nonlinearFit) {
    const modelId = result.nonlinearFit.modelId as NonlinearModelId;
    const descriptiveOnly =
      input.request.protocolVersion === "0.14.0" &&
      input.request.fitInterpretation === "descriptive_point_estimate_only";
    return [
      `結果：${result.status === "ok" ? "完了" : result.status}`,
      ...(descriptiveOnly
        ? [
            "解釈範囲：同じ対象を順に測った曲線への記述的fit。parameterは点推定のみを報告し、SE・信頼区間・p値・群間推論は生成していない。",
          ]
        : []),
      `非線形model：${nonlinearModelLabel(modelId)}（ID ${modelId}、version ${result.nonlinearFit.modelVersion}）`,
      `式：${result.nonlinearFit.modelFormula}`,
      `model選択理由：${result.nonlinearFit.selectionRationale}`,
      ...result.nonlinearFit.series.flatMap((series) => [
        `・${series.seriesId}：${series.parameters
          .map(
            (parameter) =>
              descriptiveOnly
                ? `${nonlinearParameterLabel(modelId, parameter.name)}${nonlinearParameterLabel(modelId, parameter.name) === parameter.name ? "" : `（${parameter.name}）`}=${numberLabel(parameter.value)}（記述的点推定）`
                : `${nonlinearParameterLabel(modelId, parameter.name)}${nonlinearParameterLabel(modelId, parameter.name) === parameter.name ? "" : `（${parameter.name}）`}=${numberLabel(parameter.value)}（SE=${numberLabel(parameter.standardError)}、${intervalText(parameter)}）`,
          )
          .join("、")}`,
        descriptiveOnly
          ? `- 記述的fit診断：観測点=${series.diagnostics.n}、distinct X=${series.diagnostics.distinctX}、RSS=${numberLabel(series.diagnostics.rss)}、RMSE=${numberLabel(series.diagnostics.rmse)}、R²=${numberLabel(series.diagnostics.rSquared)}`
          : `- fit診断：n=${series.diagnostics.n}、distinct X=${series.diagnostics.distinctX}、residual df=${series.diagnostics.residualDegreesOfFreedom}、RSS=${numberLabel(series.diagnostics.rss)}、RMSE=${numberLabel(series.diagnostics.rmse)}、R²=${numberLabel(series.diagnostics.rSquared)}、AIC=${numberLabel(series.diagnostics.aic)}`,
        `- initial values：${JSON.stringify(series.initialValues)}／bounds：${JSON.stringify(series.bounds)}`,
      ]),
      "Graph：raw observationsとsaved authoritative fitted curveを分離して表示。Graph appearance変更ではfitを再計算しない。",
    ];
  }
  if (recommendation.templateId === "D11") {
    const test = result.tests[0];
    const labels = new Map(design.conditions.map((condition) => [condition.id, condition.label]));
    return [
      `結果：${result.status === "ok" ? "完了" : result.status}`,
      ...(result.survival?.groups.map(
        (group) =>
          `・${labels.get(group.conditionId) ?? group.conditionId}：n=${group.n}、event=${group.events}、censored=${group.censored}`,
      ) ?? ["・Kaplan–Meier群要約：報告なし"]),
      `log-rank検定：${test ? `${test.statisticName}=${numberLabel(test.statistic)}、自由度 ${degreesLabel(test.degreesOfFreedom)}、p=${pValueLabel(test.pValue)}` : "報告なし"}`,
    ];
  }
  if (recommendation.templateId === "D03" || recommendation.templateId === "D04") {
    const omnibus = result.tests[0];
    return [
      `結果：${result.status === "ok" ? "完了" : result.status}`,
      `全体検定：${omnibus ? `${omnibus.name}、${omnibus.statisticName}=${numberLabel(omnibus.statistic)}、自由度 ${degreesLabel(omnibus.degreesOfFreedom)}、p=${pValueLabel(omnibus.pValue)}` : "報告なし"}`,
      `全体効果量：${omnibus?.effectSizeName ?? "—"}=${numberLabel(omnibus?.effectSize)}`,
      ...(result.tests.length > 1
        ? ["補正済み条件間比較：", ...pairwiseResultLines(input, 1)]
        : ["条件間の事後比較：実行せず"]),
    ];
  }
  if (recommendation.templateId === "D05") {
    const effectLabels = [
      `${design.factors[0]?.label ?? "因子A"} × ${design.factors[1]?.label ?? "因子B"}（交互作用）`,
      design.factors[0]?.label ?? "因子A",
      design.factors[1]?.label ?? "因子B",
    ];
    const factorialLines = result.tests
      .slice(0, 3)
      .map(
        (test, index) =>
          `・${effectLabels[index]}：${test.statisticName}=${numberLabel(test.statistic)}、自由度 ${degreesLabel(test.degreesOfFreedom)}、p=${pValueLabel(test.pValue)}、${test.effectSizeName ?? "効果量"}=${numberLabel(test.effectSize)}`,
      );
    return [
      `結果：${result.status === "ok" ? "完了" : result.status}`,
      "Type III検定（交互作用を先に表示）：",
      ...factorialLines,
      "Holm補正済み条件間比較：",
      ...pairwiseResultLines(input, 3),
    ];
  }
  if (recommendation.templateId === "D06" || recommendation.templateId === "D13") {
    const axisLabel = repeatedAxisLabel(input);
    const effectLabels = [
      `条件 × ${axisLabel}（交互作用）`,
      "条件（実験単位間）",
      `${axisLabel}（実験単位内）`,
    ];
    return [
      `結果：${result.status === "ok" ? "完了" : result.status}`,
      `${recommendation.templateId === "D13" ? "反復カテゴリ状態" : "balanced split-plot"}検定（交互作用を先に表示）：`,
      ...result.tests
        .slice(0, 3)
        .map(
          (test, index) =>
            `・${effectLabels[index]}：${test.statisticName}=${numberLabel(test.statistic)}、自由度 ${degreesLabel(test.degreesOfFreedom)}、p=${pValueLabel(test.pValue)}、${test.effectSizeName ?? "効果量"}=${numberLabel(test.effectSize)}`,
        ),
      "条件間の事後比較：実行せず",
    ];
  }
  if (recommendation.templateId === "D07") {
    const axisLabel = repeatedAxisLabel(input);
    const effectLabels = [
      `条件 × ${axisLabel}（交互作用）`,
      "条件（独立セル間）",
      `${axisLabel}（独立セル間）`,
    ];
    return [
      `結果：${result.status === "ok" ? "完了" : result.status}`,
      "balanced独立二因子検定（交互作用を先に表示）：",
      ...result.tests
        .slice(0, 3)
        .map(
          (test, index) =>
            `・${effectLabels[index]}：${test.statisticName}=${numberLabel(test.statistic)}、自由度 ${degreesLabel(test.degreesOfFreedom)}、p=${pValueLabel(test.pValue)}、${test.effectSizeName ?? "効果量"}=${numberLabel(test.effectSize)}`,
        ),
      "事後比較：実行せず",
    ];
  }

  const estimate = result.estimates[0];
  const test = result.tests[0];
  return [
    `結果：${result.status === "ok" ? "完了" : result.status}`,
    `推定値：${estimate ? `${estimate.name} = ${numberLabel(estimate.value)}` : "報告なし"}`,
    `信頼区間：${estimate?.confidenceInterval ? `${numberLabel(estimate.confidenceInterval.level * 100)}%：${numberLabel(estimate.confidenceInterval.lower)}～${numberLabel(estimate.confidenceInterval.upper)}` : "報告なし"}`,
    `検定統計量：${test ? `${test.statisticName} = ${numberLabel(test.statistic)}` : "報告なし"}`,
    `自由度：${degreesLabel(test?.degreesOfFreedom)}`,
    `p値：${pValueLabel(test?.pValue)}`,
    `多重性補正後p値：${test?.adjustedPValue == null ? "なし" : pValueLabel(test.adjustedPValue)}`,
    `効果量：${test?.effectSizeName ? `${test.effectSizeName} = ${test.effectSize == null ? "—" : numberLabel(test.effectSize)}` : "報告なし"}`,
  ];
}

/** Creates deterministic, Japanese-first Methods text from executed contracts. */
export function generateMethodsText(input: MethodsTextInput): string {
  const { design, recommendation, request, result } = input;
  const packages = Object.entries(result.engine.packages)
    .map(([name, version]) => `${name} ${version}`)
    .join(", ");
  const resultLines = executedResultLines(input);
  const multiplicityNote = request.options.multiplicityMethod
    ? `多重性補正：${request.options.multiplicityMethod}を指定。`
    : request.protocolVersion === "0.15.0"
      ? "多重性補正：事前指定した単一主比較だけを評価したため指定なし。"
      : request.protocolVersion === "0.14.0"
      ? request.fitInterpretation === "descriptive_point_estimate_only"
        ? "多重性補正：記述的curve fitのみで、仮説検定・SE・信頼区間を生成していないため対象外。"
        : "多重性補正：parameter estimationをseriesごとに独立して行い、仮説検定のp値を生成していないため指定なし。"
      : request.protocolVersion === "0.6.0"
        ? `多重性補正：条件×${repeatedAxisLabel(input)}、条件、${repeatedAxisLabel(input)}の事前指定した3つのomnibus効果のみを報告し、事後比較は実行していないため指定なし。`
        : request.protocolVersion === "0.7.0"
          ? `多重性補正：独立条件×${repeatedAxisLabel(input)}の3つのomnibus効果のみを報告し、事後比較は実行していないため指定なし。`
          : request.protocolVersion === "0.10.0"
            ? `多重性補正：条件×${repeatedAxisLabel(input)}の3つの事前指定omnibus効果のみを報告し、事後比較は実行していないため指定なし。`
            : request.protocolVersion === "0.5.0"
              ? "多重性補正：単一の相関係数を評価したため指定なし。"
              : request.protocolVersion === "0.8.0"
                ? "多重性補正：事前指定した単一のlog-rank全体検定のため指定なし。"
                : request.protocolVersion === "0.9.0"
                  ? "多重性補正：明示した単一の基準値との比較のため指定なし。"
                  : request.protocolVersion === "0.2.0"
                    ? "多重性補正：条件間の事後比較を実行していないため指定なし。"
                    : "多重性補正：指定なし（2条件の主比較のため補正なし）。";
  const warnings = [
    "除外：この実行契約にはQCによる除外情報が含まれません。除外の有無はQC記録を確認してください。",
    normalizationWarning(design),
    explicitControlNote(input),
    explicitContrastNote(input),
    scientificGroupingWarning(input),
    executedNestedSummaryNote(input),
    multiplicityNote,
    ...result.diagnostics
      .filter(({ code }) => code === "sphericity_not_estimated")
      .map(
        ({ code, message }) =>
          `エンジン診断（${code}）：${message} 球面性補正を必要とする場合は検証済みmixed-effects modelを使用してください。`,
      ),
    ...result.warnings.map((warning) => `エンジン警告（${warning.code}）：${warning.message}`),
  ];
  const outcome = input.design.outcomes.find(({ id }) => id === input.outcomeId);

  return [
    "【Methods】",
    `解析テンプレート：${methodsTemplateLabel(input)}（${recommendation.templateVersion}）`,
    `実行手法：${methodsMethodLabel(input, request.method)}（${request.method}）`,
    `推奨手法：${methodsMethodLabel(input, recommendation.recommendedMethod)}（選択と${recommendation.recommendedMethod === request.method ? "同じ" : "異なる"}）`,
    `推奨判断：${recommendation.decision ? (recommendation.decision.kind === "accepted" ? "推奨法を明示的に採用" : `推奨法を上書きして${recommendation.decision.selectedMethod}を選択${recommendation.decision.overrideReason ? `（理由：${recommendation.decision.overrideReason}）` : ""}`) : "過去データのため明示記録なし"}`,
    `実験デザイン：${design.name}／実験単位：${design.experimentalUnitLevelId}`,
    `解析した測定項目：${outcome ? `${outcome.label}${outcome.unit ? ` (${outcome.unit})` : ""}` : (input.outcomeId ?? "記録なし")}`,
    pairingLabel(design),
    `統計上のn：${recommendation.statisticalNDefinition}`,
    `解析条件：${allConditionLabels(input)}`,
    `${request.protocolVersion === "0.5.0" ? "解析対象" : request.protocolVersion === "0.6.0" || request.protocolVersion === "0.7.0" || request.protocolVersion === "0.8.0" || request.protocolVersion === "0.10.0" ? "解析条件" : request.protocolVersion === "0.9.0" ? "単一コホート／基準値" : "主比較"}：${conditionLabels(input)}${request.protocolVersion === "0.9.0" ? `／${request.nullValue}` : ""}`,
    `エラーバー：${errorBarLabel(input.graphSpec, input.graphErrorBar)}`,
    "",
    "解析結果",
    ...resultLines,
    "",
    `実行エンジン：${result.engine.name} ${result.engine.version}`,
    `使用パッケージ：${packages || "記録なし"}`,
    `アプリケーション：${PRODUCT_IDENTITY.developmentName} ${PRODUCT_IDENTITY.version}`,
    `完了日時：${result.completedAt}`,
    "",
    "注意事項",
    ...warnings
      .filter((warning): warning is string => warning !== null)
      .map((warning) => `・${warning}`),
  ].join("\n");
}

/** Copies Methods text without making clipboard support a rendering dependency. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the DOM copy path for desktop/webview implementations.
    }
  }
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

/** Backward-compatible name used by the Methods panel. */
export async function copyMethodsText(text: string): Promise<boolean> {
  return copyText(text);
}
