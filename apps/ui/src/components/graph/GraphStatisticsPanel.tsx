import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalysisEngineRequest,
  AnalysisEngineResult,
  AnalysisRecommendation,
} from "@lsaa/analysis-contracts";

import type { AnalysisRunner } from "../../app/analysisClient";
import type { ContrastIntent, DraftAnalysisAssessment } from "../../app/experimentDraftAnalysis";
import type { WorkspaceGraphAnalysis } from "../../app/experimentWorkspaceProject";
import { copyMethodsText } from "../../app/methodsText";
import { canSafelyAutomaticallyRerun } from "../../app/analysisRequestFingerprint";
import { recordBenchmarkEvent } from "../../app/benchmarkEvaluation";
import { diagnosticFingerprint, recordDiagnosticEvent } from "../../app/diagnostics";
import { researcherError } from "../../app/errorCatalog";
import { analysisRequestStructuralFingerprint } from "../../app/analysisRequestFingerprint";
import { ContextualHelp } from "../ContextualHelp";
import { PRODUCT_IDENTITY } from "../../app/productIdentity";

type GraphStatisticsPanelProps = Readonly<{
  assessment: DraftAnalysisAssessment;
  analysisRunner: AnalysisRunner;
  initialAnalysis?: WorkspaceGraphAnalysis | null;
  onAnalysisChange?: (analysis: WorkspaceGraphAnalysis | null) => void;
  methodsText?: string | null;
  correlationMethod?: "pearson" | "spearman";
  onCorrelationMethodChange?: (method: "pearson" | "spearman") => void;
  selectedMethod?: AnalysisRecommendation["recommendedMethod"];
  onSelectedMethodChange?: (method: AnalysisRecommendation["recommendedMethod"]) => void;
  contrastIntent?: ContrastIntent;
  onContrastIntentChange?: (intent: ContrastIntent) => void;
  conditionOptions?: readonly Readonly<{ id: string; label: string }>[];
  plannedContrastConditionIds?: readonly (readonly [string, string])[];
  onPlannedContrastConditionIdsChange?: (pairs: readonly (readonly [string, string])[]) => void;
  /** Changes whenever this Graph's scientific source/subset changes, even if the shaped request is temporarily identical. */
  analysisContextKey?: string;
}>;

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 4 }).format(value);
}

function formatP(value: number): string {
  return value < 0.0001 ? value.toExponential(2) : formatNumber(value);
}

function isPairwiseComparisonName(name: string): boolean {
  return /^(games_howell|tukey_hsd|dunnett|planned_holm|dunn_holm|holm_welch|holm_paired|holm_wilcoxon):/.test(
    name,
  );
}

function comparisonDisplayLabel(
  name: string,
  conditionOptions: readonly Readonly<{ id: string; label: string }>[],
): string {
  const [, firstId, secondId] = name.split(":");
  if (!firstId || !secondId) return "条件間比較";
  const label = (id: string) =>
    conditionOptions.find((condition) => condition.id === id)?.label ?? id;
  return `${label(firstId)} vs ${label(secondId)}`;
}

function diagnosticLabel(code: string): string {
  if (code === "assumptions_not_fully_evaluated") {
    return "少数例の有意差検定だけで正規性を断定していません。実験単位の分布と実験設計も確認してください。";
  }
  if (code === "variance_robust_multi_group_default") {
    return "等分散を前提にしない多群比較です。実験単位同士が独立していることは別途必要です。";
  }
  if (code === "very_small_biological_n") {
    return "一部の条件で実験単位が3未満です。推定値と前提の評価には大きな不確実性があります。";
  }
  if (code === "equal_variance_assumption_selected") {
    return "等分散を仮定する方法を選択しています。このより強い仮定を結果とMethodsに記録します。";
  }
  if (code === "rank_distribution_test_semantics") {
    return "Mann–Whitneyは順位と分布の並び方を評価します。追加仮定なしに単なる中央値の検定とは解釈しません。";
  }
  if (code === "paired_rank_test_semantics") {
    return "Wilcoxonは、安定IDで対応した各実験単位内の差の符号と順位を評価します。";
  }
  if (code === "omnibus_only_no_posthoc") {
    return "全体差のみを評価しました。未検証の条件間比較は自動生成していません。";
  }
  if (code === "planned_pairwise_no_simultaneous_ci") {
    return "事前に選んだ条件ペアだけをHolm法で補正しました。この方式では同時信頼区間を表示しません。";
  }
  return code;
}

export function GraphStatisticsPanel({
  assessment,
  analysisRunner,
  initialAnalysis,
  onAnalysisChange,
  methodsText,
  correlationMethod,
  onCorrelationMethodChange,
  selectedMethod,
  onSelectedMethodChange,
  contrastIntent,
  onContrastIntentChange,
  conditionOptions = [],
  plannedContrastConditionIds = [],
  onPlannedContrastConditionIdsChange,
  analysisContextKey,
}: GraphStatisticsPanelProps) {
  const [independenceConfirmed, setIndependenceConfirmed] = useState(Boolean(initialAnalysis));
  const [result, setResult] = useState<AnalysisEngineResult | null>(
    initialAnalysis?.result ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [methodsCopyStatus, setMethodsCopyStatus] = useState<string | null>(null);
  const [recommendationDecision, setRecommendationDecision] = useState<NonNullable<
    AnalysisRecommendation["decision"]
  > | null>(initialAnalysis?.recommendation?.decision ?? null);
  const recommendationDecisionRef = useRef(recommendationDecision);
  useEffect(() => {
    recommendationDecisionRef.current = recommendationDecision;
  }, [recommendationDecision]);
  const matchedAnalysis =
    assessment.method === "paired_t" ||
    assessment.method === "wilcoxon_signed_rank" ||
    assessment.method === "repeated_measures_anova";
  const correlationAnalysis = assessment.method === "pearson" || assessment.method === "spearman";
  const effectiveContrastIntent = contrastIntent ?? assessment.contrastIntent;
  const plannedPairChoices = conditionOptions.flatMap((first, firstIndex) =>
    conditionOptions.slice(firstIndex + 1).map((second) => ({ first, second })),
  );
  const executablePlannedPairCount =
    assessment.request?.protocolVersion === "0.2.0"
      ? (assessment.request.plannedContrastConditionIds?.length ?? 0)
      : 0;
  const plannedComparisonsMissing =
    effectiveContrastIntent === "planned_comparisons" && executablePlannedPairCount === 0;
  const executedRef = useRef(Boolean(initialAnalysis));
  const lastExecutedRequestRef = useRef<AnalysisEngineRequest | null>(
    initialAnalysis?.request ?? null,
  );
  const executionGenerationRef = useRef(0);
  const firstAssessmentRef = useRef(true);

  const executeRequest = useCallback(
    async (request: AnalysisEngineRequest, mode: "manual" | "automatic") => {
      const generation = ++executionGenerationRef.current;
      setRunning(true);
      setError(null);
      try {
        const nextResult = await analysisRunner(request);
        if (executionGenerationRef.current !== generation) return;
        setResult(nextResult);
        executedRef.current = nextResult.status === "ok";
        lastExecutedRequestRef.current = nextResult.status === "ok" ? request : null;
        setStaleNotice(
          mode === "automatic" && nextResult.status === "ok"
            ? "値のみが変更され、実験設計・実験単位・比較・解析法が同一だったため、同じ解析を自動再実行しました。"
            : null,
        );
        const canonicalRecommendation: AnalysisRecommendation = {
          templateId: request.templateId,
          templateVersion: request.templateVersion,
          recommendedMethod: assessment.recommendedMethod ?? request.method,
          alternativeMethods:
            assessment.methodChoices
              ?.filter(({ method }) => method !== (assessment.recommendedMethod ?? request.method))
              .map(({ method }) => method) ?? [],
          reasonCode: `draft_${request.templateId.toLowerCase()}_design_assessment`,
          explanation: assessment.reason,
          statisticalNDefinition:
            assessment.statisticalNDefinition ??
            assessment.nByCondition.map(({ label, n }) => `${label} n=${n}`).join(", "),
          multiplicityMethod: request.options.multiplicityMethod,
          ...(recommendationDecisionRef.current
            ? { decision: recommendationDecisionRef.current }
            : {}),
        };
        onAnalysisChange?.(
          nextResult.status === "ok"
            ? {
                request,
                result: nextResult,
                recommendedMethod: canonicalRecommendation.recommendedMethod,
                recommendation: canonicalRecommendation,
              }
            : null,
        );
        if (nextResult.status !== "ok") {
          const researcherMessage = researcherError("ENGINE_INPUT_INVALID");
          setError(
            `${researcherMessage.title}（${researcherMessage.code}）。${researcherMessage.nextAction}`,
          );
        } else {
          recordDiagnosticEvent("analysis_executed", {
            templateId: request.templateId,
            methodId: request.method,
            protocolVersion: request.protocolVersion,
            engineVersion: nextResult.engine.version,
            packageVersions: JSON.stringify(nextResult.engine.packages),
            requestFingerprint: diagnosticFingerprint(
              analysisRequestStructuralFingerprint(request),
            ),
          });
        }
        recordBenchmarkEvent(
          "statistics_executed",
          {
            method: request.method,
            recommendedMethod: canonicalRecommendation.recommendedMethod,
            recommendationDiffers: canonicalRecommendation.recommendedMethod !== request.method,
            recommendationReasonCode: canonicalRecommendation.reasonCode,
            recommendationExplanation: canonicalRecommendation.explanation,
            recommendationDecision: canonicalRecommendation.decision?.kind ?? null,
            recommendationSelectedMethod:
              canonicalRecommendation.decision?.selectedMethod ?? request.method,
            contrast:
              request.protocolVersion === "0.2.0"
                ? request.contrastIntent === "planned_comparisons"
                  ? `${request.contrastIntent}:${(request.plannedContrastConditionIds ?? [])
                      .map(([firstId, secondId]) => `${firstId}:${secondId}`)
                      .join("|")}`
                  : request.contrastIntent
                : request.protocolVersion === "0.1.0"
                  ? request.contrastConditionIds.join("|")
                  : request.protocolVersion === "0.5.0"
                    ? request.variableConditionIds.join("|")
                    : request.protocolVersion === "0.11.0"
                      ? `${request.rowCategoryIds.join("|")}::${request.columnCategoryIds.join("|")}`
                      : request.protocolVersion === "0.12.0"
                        ? request.conditionIds.join("|")
                        : request.protocolVersion === "0.13.0"
                          ? `${request.xLabel}|${request.yLabel}`
                          : request.protocolVersion === "0.6.0" ||
                              request.protocolVersion === "0.7.0" ||
                              request.protocolVersion === "0.8.0" ||
                              request.protocolVersion === "0.10.0"
                            ? request.conditionIds.join("|")
                            : request.protocolVersion === "0.9.0"
                              ? `${request.conditionId}|reference:${request.nullValue}`
                              : request.primaryContrastConditionIds.join("|"),
            correction: request.options.multiplicityMethod,
            protocolVersion: request.protocolVersion,
            mode,
            status: nextResult.status,
          },
          "analysis_only",
        );
      } catch (reason) {
        const errorCode = reason instanceof Error && "code" in reason ? String(reason.code) : null;
        const researcherMessage = researcherError(
          errorCode === "ENGINE_INPUT_INVALID" ? "ENGINE_INPUT_INVALID" : "ENGINE_EXECUTION_FAILED",
        );
        setError(
          `${researcherMessage.title}（${researcherMessage.code}）。${researcherMessage.nextAction}`,
        );
      } finally {
        if (executionGenerationRef.current === generation) setRunning(false);
      }
    },
    [analysisRunner, assessment, onAnalysisChange],
  );

  useEffect(() => {
    if (firstAssessmentRef.current) {
      firstAssessmentRef.current = false;
      return;
    }
    const previousRequest = lastExecutedRequestRef.current;
    const nextRequest = assessment.request;
    const automaticRerunIsSafe = Boolean(
      executedRef.current &&
      previousRequest &&
      nextRequest &&
      canSafelyAutomaticallyRerun(previousRequest, nextRequest),
    );
    executionGenerationRef.current += 1;
    if (executedRef.current) {
      setStaleNotice(
        automaticRerunIsSafe
          ? "値の変更を検出しました。構造を確認後、同じ解析を自動再実行します…"
          : "表示するデータまたは実験構造が変わったため、以前の解析結果を外しました。解析法は自動変更しません。",
      );
    }
    executedRef.current = false;
    if (!automaticRerunIsSafe) setIndependenceConfirmed(false);
    setResult(null);
    onAnalysisChange?.(null);
    setError(null);
    if (!automaticRerunIsSafe || !nextRequest) return;
    const timer = window.setTimeout(() => {
      void executeRequest(nextRequest, "automatic");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [analysisContextKey, assessment.request, executeRequest, onAnalysisChange]);

  const run = async () => {
    if (
      !assessment.request ||
      !independenceConfirmed ||
      plannedComparisonsMissing ||
      (assessment.recommendedMethod && !recommendationDecision)
    )
      return;
    await executeRequest(assessment.request, "manual");
  };
  const primaryTests =
    result?.status === "ok"
      ? result.tests.filter((test) => !isPairwiseComparisonName(test.name))
      : [];
  const comparisonTests =
    result?.status === "ok"
      ? result.tests.filter((test) => isPairwiseComparisonName(test.name))
      : [];
  const diagnosticItems =
    result?.status === "ok" ? [...result.diagnostics, ...result.warnings] : [];

  return (
    <section className="experiment-graph-statistics-section" aria-label="このグラフの統計">
      <div>
        <p className="experiment-graph-overline">実データ確認後</p>
        <h3>このグラフの統計</h3>
        <ContextualHelp
          label="この統計のHelp"
          context={{
            surface: "statistics",
            ...(assessment.method ? { selectedMethod: assessment.method } : {}),
            ...(assessment.request?.protocolVersion === "0.6.0"
              ? {
                  timeStructure:
                    assessment.request.withinFactor?.role === "time"
                      ? ("longitudinal" as const)
                      : ("repeated_state" as const),
                }
              : {}),
          }}
        />
      </div>
      <div className={`experiment-graph-recommendation is-${assessment.state}`}>
        <strong>{assessment.title}</strong>
        <p>{assessment.reason}</p>
        {assessment.missingCount > 0 ? (
          <p>未入力または無効なセル：{assessment.missingCount}件</p>
        ) : null}
        {assessment.notPlannedCount > 0 ? (
          <p>測定予定なし（解析対象外）：{assessment.notPlannedCount}件</p>
        ) : null}
      </div>

      {assessment.state === "ready" ? (
        <>
          {assessment.request?.protocolVersion === "0.2.0" ? (
            <fieldset className="experiment-graph-method-choices">
              <legend>何を比較しますか</legend>
              <label>
                <input
                  type="radio"
                  name="contrast-intent"
                  value="all_pairs"
                  checked={(contrastIntent ?? assessment.contrastIntent) === "all_pairs"}
                  onChange={() => onContrastIntentChange?.("all_pairs")}
                />
                <span>すべての群を比較</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="contrast-intent"
                  value="control_vs_many"
                  disabled={!assessment.request.controlConditionId}
                  checked={(contrastIntent ?? assessment.contrastIntent) === "control_vs_many"}
                  onChange={() => onContrastIntentChange?.("control_vs_many")}
                />
                <span>各処置を対照群と比較</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="contrast-intent"
                  value="omnibus_only"
                  checked={(contrastIntent ?? assessment.contrastIntent) === "omnibus_only"}
                  onChange={() => onContrastIntentChange?.("omnibus_only")}
                />
                <span>まず全体差のみを評価</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="contrast-intent"
                  value="planned_comparisons"
                  checked={effectiveContrastIntent === "planned_comparisons"}
                  onChange={() => onContrastIntentChange?.("planned_comparisons")}
                />
                <span>事前に決めた条件ペアだけを比較</span>
              </label>
            </fieldset>
          ) : null}
          {assessment.request?.protocolVersion === "0.2.0" &&
          effectiveContrastIntent === "planned_comparisons" ? (
            <fieldset className="experiment-graph-method-choices">
              <legend>事前に決めた比較を選択</legend>
              {plannedPairChoices.map(({ first, second }) => {
                const checked = plannedContrastConditionIds.some(
                  ([firstId, secondId]) =>
                    (firstId === first.id && secondId === second.id) ||
                    (firstId === second.id && secondId === first.id),
                );
                return (
                  <label key={`${first.id}:${second.id}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...plannedContrastConditionIds, [first.id, second.id] as const]
                          : plannedContrastConditionIds.filter(
                              ([firstId, secondId]) =>
                                !(
                                  (firstId === first.id && secondId === second.id) ||
                                  (firstId === second.id && secondId === first.id)
                                ),
                            );
                        onPlannedContrastConditionIdsChange?.(next);
                      }}
                    />
                    <span>
                      {first.label} vs {second.label}
                    </span>
                  </label>
                );
              })}
              <small>ここで選んだペアだけを比較し、p値をHolm法で調整します。</small>
            </fieldset>
          ) : null}
          {correlationAnalysis ? (
            <label className="experiment-graph-field">
              <span>相関の方法</span>
              <select
                aria-label="相関の方法"
                value={correlationMethod ?? assessment.method ?? "pearson"}
                onChange={(event) => {
                  const method = event.currentTarget.value as "pearson" | "spearman";
                  onCorrelationMethodChange?.(method);
                  const kind = method === assessment.recommendedMethod ? "accepted" : "overridden";
                  setRecommendationDecision({ kind, selectedMethod: method });
                  recordBenchmarkEvent(
                    "recommendation_decision_recorded",
                    {
                      decision: kind,
                      recommendedMethod: assessment.recommendedMethod ?? null,
                      selectedMethod: method,
                    },
                    "analysis_only",
                  );
                }}
              >
                <option value="pearson">Pearson（直線的な関係）</option>
                <option value="spearman">Spearman（順位・単調な関係）</option>
              </select>
              <small>どちらもローカルの検証済みエンジンで実行します。</small>
            </label>
          ) : null}
          {!correlationAnalysis && assessment.methodChoices?.length ? (
            <div className="experiment-graph-method-levels" aria-label="統計解析法の選択">
              {(["recommended", "alternative", "advanced"] as const).map((level) => {
                const choices = assessment.methodChoices?.filter(
                  (choice) => choice.level === level,
                );
                if (!choices?.length) return null;
                return (
                  <fieldset key={level} className="experiment-graph-method-choices">
                    <legend>
                      {level === "recommended"
                        ? "推奨"
                        : level === "alternative"
                          ? "代替案"
                          : "詳細設定"}
                    </legend>
                    {choices.map((choice) => (
                      <label key={choice.method} aria-disabled={!choice.enabled}>
                        <input
                          type="radio"
                          name="statistical-method"
                          value={choice.method}
                          disabled={!choice.enabled}
                          checked={(selectedMethod ?? assessment.method) === choice.method}
                          onChange={() => {
                            onSelectedMethodChange?.(choice.method);
                            const kind =
                              choice.method === assessment.recommendedMethod
                                ? "accepted"
                                : "overridden";
                            setRecommendationDecision({
                              kind,
                              selectedMethod: choice.method,
                            });
                            recordBenchmarkEvent(
                              "recommendation_decision_recorded",
                              {
                                decision: kind,
                                recommendedMethod: assessment.recommendedMethod ?? null,
                                selectedMethod: choice.method,
                              },
                              "analysis_only",
                            );
                          }}
                        />
                        <span>
                          <strong>{choice.label}</strong>
                          <small>{choice.explanation}</small>
                          {!choice.enabled && choice.unavailableReason ? (
                            <small>{choice.unavailableReason}</small>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                );
              })}
            </div>
          ) : null}
          {assessment.recommendedMethod ? (
            <div className="experiment-graph-help" data-recommendation-decision>
              <button
                type="button"
                onClick={() => {
                  if ((selectedMethod ?? assessment.method) !== assessment.recommendedMethod) {
                    onSelectedMethodChange?.(
                      assessment.recommendedMethod as AnalysisRecommendation["recommendedMethod"],
                    );
                  }
                  setRecommendationDecision({
                    kind: "accepted",
                    selectedMethod:
                      assessment.recommendedMethod as AnalysisRecommendation["recommendedMethod"],
                  });
                  recordBenchmarkEvent(
                    "recommendation_decision_recorded",
                    {
                      decision: "accepted",
                      recommendedMethod: assessment.recommendedMethod ?? null,
                    },
                    "analysis_only",
                  );
                }}
              >
                推奨法を使う
              </button>
              <p>
                {recommendationDecision
                  ? recommendationDecision.kind === "accepted"
                    ? `推奨法を明示的に採用しました：${recommendationDecision.selectedMethod}。`
                    : `推奨法を上書きし、${recommendationDecision.selectedMethod}を選択しました。`
                  : "解析前に、推奨法を使うか別の方法へ上書きするかを明示してください。"}
              </p>
            </div>
          ) : null}
          <label className="experiment-graph-confirmation">
            <input
              type="checkbox"
              checked={independenceConfirmed}
              onChange={(event) => setIndependenceConfirmed(event.target.checked)}
            />
            <span>
              {assessment.request?.protocolVersion === "0.9.0"
                ? `各値が別々の${assessment.nByCondition[0]?.label ?? "実験単位"}から得られ、1つの実験単位が複数回数えられていません。`
                : correlationAnalysis
                  ? "各行のXとYが、同じ実験単位から得た1組として正しく対応づけられています。"
                  : matchedAnalysis
                    ? `同じ実験単位の${conditionOptions.length || "複数"}条件が、入力シート上で同じ実験回として正しく対応づけられています。`
                    : "各条件は別々のdish・試料・動物などの実験単位です。同じ個体や同じ試料を両条件で測った対応データではありません。"}
            </span>
          </label>
          <p className="experiment-graph-help">
            {correlationAnalysis
              ? "XとYは同じExpの安定IDで対応づけます。行順や日付の一致だけから組を作りません。"
              : matchedAnalysis
                ? "日付の一致から対応を推測していません。実験設計で明示した対応と、完全な組だけを解析します。"
                : "同じ日に実施しただけでは、自動的に「対応あり」にはしません。同じ単位を両条件で測った場合は実行せず、設計を修正してください。"}
          </p>
          <button
            className="experiment-graph-run-analysis"
            type="button"
            disabled={
              !independenceConfirmed ||
              plannedComparisonsMissing ||
              running ||
              Boolean(assessment.recommendedMethod && !recommendationDecision)
            }
            onClick={run}
          >
            {running ? "ローカルで解析中…" : "選択した解析を実行"}
          </button>
        </>
      ) : null}

      {error ? (
        <p className="experiment-graph-analysis-error" role="alert">
          {error}
        </p>
      ) : null}
      {staleNotice ? (
        <p className="experiment-graph-analysis-stale" role="status">
          {staleNotice}
        </p>
      ) : null}

      {result?.status === "ok" ? (
        <div className="experiment-graph-analysis-result" role="group" aria-label="統計解析結果">
          <div className="experiment-graph-analysis-summary">
            <strong>解析完了（ローカル）</strong>
            <p>
              解析に用いた実験単位：
              {assessment.nDisplay ??
                assessment.nByCondition.map(({ label, n }) => `${label} n=${n}`).join("、")}
            </p>
          </div>
          {result.estimates.length > 0 ? (
            <dl aria-label="主要な推定値">
              {result.estimates.map((estimate) => (
                <div key={estimate.name}>
                  <dt>{estimate.name}</dt>
                  <dd>
                    推定値 = {formatNumber(estimate.value)}
                    {estimate.standardError === null
                      ? ""
                      : `、SE = ${formatNumber(estimate.standardError)}`}
                    {estimate.confidenceInterval
                      ? `、${estimate.confidenceInterval.level * 100}% CI ${formatNumber(
                          estimate.confidenceInterval.lower,
                        )}–${formatNumber(estimate.confidenceInterval.upper)}`
                      : ""}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          <dl aria-label="主要な検定結果">
            {primaryTests.map((test) => (
              <div key={test.name}>
                <dt>全体／主解析</dt>
                <dd>
                  {test.statisticName} = {formatNumber(test.statistic)}、p ={" "}
                  {formatP(test.adjustedPValue ?? test.pValue)}
                  {test.adjustedPValue !== null ? "（多重比較調整済み）" : ""}
                  {test.degreesOfFreedom ? `、df = ${test.degreesOfFreedom.join(", ")}` : ""}
                  {test.effectSizeName && test.effectSize !== null
                    ? `、${test.effectSizeName} = ${formatNumber(test.effectSize)}`
                    : ""}
                </dd>
              </div>
            ))}
          </dl>
          {comparisonTests.length > 0 ? (
            <details className="experiment-graph-analysis-comparisons" open>
              <summary>条件間比較（{comparisonTests.length}件）</summary>
              <dl>
                {comparisonTests.map((test) => (
                  <div key={test.name}>
                    <dt>{comparisonDisplayLabel(test.name, conditionOptions)}</dt>
                    <dd>
                      {test.statisticName} = {formatNumber(test.statistic)}、p ={" "}
                      {formatP(test.adjustedPValue ?? test.pValue)}
                      {test.adjustedPValue !== null ? "（多重比較調整済み）" : ""}
                      {test.degreesOfFreedom ? `、df = ${test.degreesOfFreedom.join(", ")}` : ""}
                      {test.effectSizeName && test.effectSize !== null
                        ? `、${test.effectSizeName} = ${formatNumber(test.effectSize)}`
                        : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}
          {diagnosticItems.length > 0 ? (
            <details className="experiment-graph-analysis-diagnostics">
              <summary>診断と注意（{diagnosticItems.length}件）</summary>
              {diagnosticItems.map((item) => (
                <p key={`${item.code}-${item.message}`}>{diagnosticLabel(item.code)}</p>
              ))}
            </details>
          ) : null}
          <details>
            <summary>解析エンジンと再現情報</summary>
            <dl>
              <div>
                <dt>検定・モデル</dt>
                <dd>{assessment.method ?? "—"}</dd>
              </div>
              <div>
                <dt>エンジン</dt>
                <dd>
                  {result.engine.name} {result.engine.version}
                </dd>
              </div>
              {Object.entries(result.engine.packages).map(([name, version]) => (
                <div key={name}>
                  <dt>統計ライブラリ</dt>
                  <dd>
                    {name} {version}
                  </dd>
                </div>
              ))}
              <div>
                <dt>アプリケーション</dt>
                <dd>
                  {PRODUCT_IDENTITY.developmentName} {PRODUCT_IDENTITY.version}
                </dd>
              </div>
              <div>
                <dt>多重性の調整</dt>
                <dd>{assessment.request?.options.multiplicityMethod ?? "なし"}</dd>
              </div>
              <div>
                <dt>実行リクエスト</dt>
                <dd>
                  {assessment.request?.templateId} / {assessment.request?.templateVersion}
                </dd>
              </div>
            </dl>
          </details>
          <p>プロジェクト保存時に、使用データと解析条件を再現可能な解析履歴として保存します。</p>
          {methodsText ? (
            <details>
              <summary>Methodsと再現記録</summary>
              <pre className="experiment-graph-methods-text">{methodsText}</pre>
              <button
                type="button"
                onClick={async () => {
                  const copied = await copyMethodsText(methodsText);
                  setMethodsCopyStatus(
                    copied ? "Methodsをコピーしました。" : "コピーできませんでした。",
                  );
                }}
              >
                Methodsをコピー
              </button>
              {methodsCopyStatus ? <p role="status">{methodsCopyStatus}</p> : null}
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
