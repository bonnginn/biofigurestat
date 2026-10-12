import { inferenceStatisticLabel } from "../../app/inferenceStatisticLabel";
import { EquivalencePlanEditor } from "./EquivalencePlanEditor";
import { EquivalenceResultPanel } from "./EquivalenceResultPanel";
import { createIndependentContinuousEquivalenceRequest } from "./independentContinuousEquivalenceRequest";
import { createPairedContinuousEquivalenceRequest } from "./pairedContinuousEquivalenceRequest";
import type { EquivalenceSupportKind } from "./equivalenceSupportPresentation";
import type { EquivalenceAnalysisPlan, EquivalenceMargin } from "@lsaa/analysis-contracts";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  AnalysisEngineRequest,
  AnalysisEngineResult,
  AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import {
  CORE_WORKSPACE_RECOMMENDATION_TEMPLATES,
  recommendAnalysisRequest,
} from "@lsaa/analysis-contracts";
import type { ExperimentDesign } from "@lsaa/domain";

import { cancelLocalAnalysis, type AnalysisRunner } from "../../app/analysisClient";
import type { ContrastIntent, DraftAnalysisAssessment } from "../../app/experimentDraftAnalysis";
import {
  nestedIndependentSourceCorrection,
  type DraftAnalysisCorrection,
  type NestedIndependentSourceContext,
} from "../../app/draftAnalysisDiagnostics";
import { analysisValidationFeedback } from "../../app/analysisValidationFeedback";
import type { WorkspaceGraphAnalysis } from "../../app/experimentWorkspaceProject";
import {
  twoConditionAlternativeText,
  twoConditionIntervalNote,
  usesCentralTwoConditionTInterval,
} from "../../app/twoConditionInferenceText";
import { copyMethodsText } from "../../app/methodsText";
import { controlComparisonInferenceText } from "../../app/controlComparisonInferenceText";
import { canSafelyAutomaticallyRerun } from "../../app/analysisRequestFingerprint";
import { recordBenchmarkEvent } from "../../app/benchmarkEvaluation";
import { diagnosticFingerprint, recordDiagnosticEvent } from "../../app/diagnostics";
import { researcherError } from "../../app/errorCatalog";
import { analysisRequestStructuralFingerprint } from "../../app/analysisRequestFingerprint";
import { ContextualHelp } from "../ContextualHelp";
import { PRODUCT_IDENTITY } from "../../app/productIdentity";
import { routeFromPath } from "../../app/routes";
import { recordUsageMilestone } from "../../app/usageTelemetry";
import { createStatisticsConsultationPrompt } from "../../app/externalLlmConsultation";
import { ExternalLlmConsultation } from "../ExternalLlmConsultation";
import { ExecutedMeanDifferencePlot } from "./ExecutedMeanDifferencePlot";
import { ExecutedEstimationComposite } from "./ExecutedEstimationComposite";

type MatchedRelationship =
  | Readonly<{ kind: "same_entity"; unitLabel: string }>
  | Readonly<{ kind: "shared_source"; unitLabel: string; sourceLabel: string }>;

type ConditionOption = Readonly<{ id: string; label: string }>;

type GraphStatisticsPanelProps = Readonly<{
  assessment: DraftAnalysisAssessment;
  design: ExperimentDesign | null;
  outcomeId?: string;
  analysisRunner: AnalysisRunner;
  analysisAvailable?: boolean;
  initialAnalysis?: WorkspaceGraphAnalysis | null;
  onAnalysisChange?: (analysis: WorkspaceGraphAnalysis | null) => void;
  methodsText?: string | null;
  correlationMethod?: "pearson" | "spearman";
  onCorrelationMethodChange?: (method: "pearson" | "spearman") => void;
  selectedMethod?: AnalysisRecommendation["recommendedMethod"];
  onSelectedMethodChange?: (method: AnalysisRecommendation["recommendedMethod"]) => void;
  contrastIntent?: ContrastIntent;
  onContrastIntentChange?: (intent: ContrastIntent) => void;
  conditionOptions?: readonly ConditionOption[];
  plannedContrastConditionIds?: readonly (readonly [string, string])[];
  onPlannedContrastConditionIdsChange?: (pairs: readonly (readonly [string, string])[]) => void;
  /** Changes whenever this Graph's scientific source/subset changes, even if the shaped request is temporarily identical. */
  analysisContextKey?: string;
  matchedRelationship?: MatchedRelationship;
  /** True when the experiment-first interview already established and preserved this relationship. */
  relationshipAlreadyDeclared?: boolean;
  onCorrectionRequested?: (correction: DraftAnalysisCorrection) => void;
  independentNestedSourceContext?: NestedIndependentSourceContext | null;
  analysisValueUnit?: string | null;
  statisticalUnitLabel?: string;
  /** Raw finite measurements in the selected conditions/time, before analysis exclusions. Not independent n. */
  measurementCountSummary?: string | null;
  comparisonGoal?: "difference" | "equivalence";
  onComparisonGoalChange?: (goal: "difference" | "equivalence") => void;
  equivalencePlan?: EquivalenceAnalysisPlan | null;
  equivalenceMarginScale?: EquivalenceMargin["scale"];
  equivalenceMarginUnit?: string;
  onEquivalencePlanChange?: (plan: EquivalenceAnalysisPlan | null) => void;
  equivalenceSupportKind?: EquivalenceSupportKind;
  equivalencePlanContextKey?: string;
}>;

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 4 }).format(value);
}

function formatP(value: number): string {
  return value < 0.0001 ? value.toExponential(2) : formatNumber(value);
}

function formatConfidencePercent(level: number): string {
  const percent = level * 100;
  const rounded = Math.round(percent * 10000) / 10000;
  // Valid contract levels are strictly between 0 and 1. Do not round an
  // extreme, valid coverage to the scientifically different 0% or 100%.
  if (percent > 0 && percent < 100 && (rounded === 0 || rounded === 100)) {
    const concise = Number(percent.toPrecision(15));
    return String(concise > 0 && concise < 100 ? concise : percent);
  }
  return formatNumber(percent);
}

const MAX_VISIBLE_INCOMPLETE_MATCHED_SETS = 6;
const MAX_VISIBLE_MISSING_CONDITIONS = 4;

function missingConditionSummary(conditions: readonly Readonly<{ label: string }>[]): string {
  const visible = conditions.slice(0, MAX_VISIBLE_MISSING_CONDITIONS).map(({ label }) => label);
  const remaining = conditions.length - visible.length;
  return remaining > 0 ? `${visible.join("、")}、ほか${remaining}条件` : visible.join("、");
}

const pairwiseComparisonFamilies = [
  "games_howell",
  "tukey_hsd",
  "dunnett",
  "planned_holm",
  "dunn_holm",
  "holm_welch",
  "holm_paired",
  "holm_wilcoxon",
] as const;

function isPairwiseComparisonName(name: string): boolean {
  return pairwiseComparisonFamilies.some((family) => name.startsWith(`${family}:`));
}

function comparisonDisplayLabel(
  name: string,
  conditionOptions: readonly ConditionOption[],
): string | null {
  const family = pairwiseComparisonFamilies.find((candidate) => name.startsWith(`${candidate}:`));
  if (!family) return null;
  const matches: Array<Readonly<{ firstIndex: number; secondIndex: number }>> = [];
  conditionOptions.forEach((first, firstIndex) => {
    conditionOptions.forEach((second, secondIndex) => {
      if (firstIndex === secondIndex) return;
      if (name === `${family}:${first.id}:${second.id}`) {
        matches.push({ firstIndex, secondIndex });
      }
    });
  });
  if (matches.length !== 1) return null;

  const match = matches[0]!;
  const displayLabel = (index: number): string | null => {
    const condition = conditionOptions[index];
    const label = condition?.label.trim();
    if (!label) return null;
    const duplicateLabelCount = conditionOptions.filter(
      (candidate) => candidate.label.trim() === label,
    ).length;
    return duplicateLabelCount > 1 ? `${label}（条件 ${index + 1}）` : label;
  };
  const firstLabel = displayLabel(match.firstIndex);
  const secondLabel = displayLabel(match.secondIndex);
  return firstLabel && secondLabel ? `${firstLabel} vs ${secondLabel}` : null;
}

function diagnosticLabel(code: string, matchedRelationship?: MatchedRelationship): string {
  if (code === "sphericity_not_estimated") {
    return "この反復測定ANOVAは球面性補正を計算していません。球面性を支持できない場合、この未補正のp値で判断せず、検証済みの補正方法またはmixed-effects modelで評価してください。";
  }
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
  if (code === "tukey_studentized_range_q") {
    return "Tukeyの検定統計量qは平均差の絶対値をプールした群内分散（残差平均平方）と各群の実験単位数で標準化した値です。平均差と同時信頼区間は解析に用いた尺度の単位で表示します。";
  }
  if (code === "rank_distribution_test_semantics") {
    return "Mann–Whitneyは順位と分布の並び方を評価します。追加仮定なしに単なる中央値の検定とは解釈しません。";
  }
  if (code === "paired_rank_test_semantics") {
    if (matchedRelationship?.kind === "shared_source") {
      return `Wilcoxonは、共有IDで対応した同じ${matchedRelationship.sourceLabel}由来の条件別${matchedRelationship.unitLabel}の差の符号と順位を評価します。条件別${matchedRelationship.unitLabel}は別の実験単位です。`;
    }
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
  design,
  outcomeId,
  analysisRunner,
  analysisAvailable = true,
  initialAnalysis,
  onAnalysisChange,
  methodsText,
  correlationMethod,
  onCorrelationMethodChange,
  onSelectedMethodChange,
  contrastIntent,
  onContrastIntentChange,
  conditionOptions = [],
  plannedContrastConditionIds = [],
  onPlannedContrastConditionIdsChange,
  analysisContextKey,
  matchedRelationship,
  relationshipAlreadyDeclared = false,
  onCorrectionRequested,
  independentNestedSourceContext,
  analysisValueUnit,
  statisticalUnitLabel,
  measurementCountSummary,
  comparisonGoal = "difference",
  onComparisonGoalChange,
  equivalencePlan,
  equivalenceMarginScale = "raw_difference",
  equivalenceMarginUnit = "readout units",
  onEquivalencePlanChange,
  equivalenceSupportKind = "specialist_outcome",
  equivalencePlanContextKey,
}: GraphStatisticsPanelProps) {
  const t = (ja: string, _en: string) => ja;
  const [independenceConfirmed, setIndependenceConfirmed] = useState(
    (Boolean(initialAnalysis) && !independentNestedSourceContext) || relationshipAlreadyDeclared,
  );
  const [result, setResult] = useState<AnalysisEngineResult | null>(
    initialAnalysis?.result ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const resultFocusRef = useRef<HTMLDivElement | null>(null);
  const resultFocusRequestedRef = useRef(false);
  useLayoutEffect(() => {
    if (result?.status !== "ok" || !resultFocusRequestedRef.current) return;
    resultFocusRequestedRef.current = false;
    resultFocusRef.current?.focus({ preventScroll: true });
  }, [result]);
  const [runningRequestId, setRunningRequestId] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [methodsCopyStatus, setMethodsCopyStatus] = useState<string | null>(null);
  const [recommendationDecision, setRecommendationDecision] = useState<NonNullable<
    AnalysisRecommendation["decision"]
  > | null>(
    initialAnalysis?.recommendation?.decision ??
      (assessment.recommendedMethod
        ? { kind: "accepted", selectedMethod: assessment.recommendedMethod }
        : null),
  );
  const recommendationDecisionRef = useRef(recommendationDecision);
  const lastAnalysisContextKeyRef = useRef(analysisContextKey);
  // The assessment normalizes methods that no longer fit the selected groups.
  // Display and persist the method of the executable request, not a stale preference.
  const currentMethod = assessment.method;
  const currentRecommendationDecision = assessment.recommendedMethod && currentMethod
    ? {
        kind:
          currentMethod === assessment.recommendedMethod
            ? ("accepted" as const)
            : ("overridden" as const),
        selectedMethod: currentMethod,
      }
    : null;
  // Contrast changes can select a compatible method without firing the method radio's handler.
  recommendationDecisionRef.current = currentRecommendationDecision;
  const matchedAnalysis =
    assessment.method === "paired_t" ||
    assessment.method === "wilcoxon_signed_rank" ||
    assessment.method === "repeated_measures_anova";
  const correlationAnalysis = assessment.method === "pearson" || assessment.method === "spearman";
  const sharedSourcePairing =
    matchedRelationship?.kind === "shared_source" ? matchedRelationship : null;
  const effectiveContrastIntent = contrastIntent ?? assessment.contrastIntent;
  const plannedPairChoices = conditionOptions.flatMap((first, firstIndex) =>
    conditionOptions.slice(firstIndex + 1).map((second) => ({ first, second })),
  );
  const executablePlannedPairCount =
    assessment.request?.protocolVersion === "0.2.0"
      ? (assessment.request.plannedContrastConditionIds?.length ?? 0)
      : 0;
  const equivalenceComparisonCount =
    plannedContrastConditionIds.length > 0
      ? plannedContrastConditionIds.length
      : effectiveContrastIntent === "control_vs_many"
        ? Math.max(1, conditionOptions.length - 1)
        : Math.max(1, plannedPairChoices.length);
  const equivalenceComparisonOptions = assessment.request?.protocolVersion === "0.1.0"
    ? (() => { const ids=assessment.request.contrastConditionIds; const first=conditionOptions.find(c=>c.id===ids[0]); const second=conditionOptions.find(c=>c.id===ids[1]); return first && second ? [{id:`equivalence:${encodeURIComponent(first.id)}:${encodeURIComponent(second.id)}`,label: equivalenceSupportKind === "continuous_matched" ? `${second.label} − ${first.label}（対応差）` : `${first.label} − ${second.label}（独立群の差）`}] : []; })()
    : [];
  const equivalenceRequest = useMemo(() =>
    equivalenceComparisonOptions.length !== 1 || equivalencePlan?.margin.unit !== equivalenceMarginUnit
      ? null
      : equivalenceSupportKind === "continuous_independent"
        ? createIndependentContinuousEquivalenceRequest({
            baseRequest: assessment.request,
            plan: equivalencePlan,
            comparisonId: equivalenceComparisonOptions[0]?.id,
          })
        : equivalenceSupportKind === "continuous_matched"
          ? createPairedContinuousEquivalenceRequest({
              baseRequest: assessment.request,
              plan: equivalencePlan,
              comparisonId: equivalenceComparisonOptions[0]?.id,
              excludedIncompletePairIds:
                assessment.inputDiagnostics?.flatMap((diagnostic) =>
                  diagnostic.incompleteMatchedSets.map(({ pairId }) => pairId),
                ) ?? [],
            })
          : null, [assessment.request, equivalencePlan, equivalenceSupportKind, equivalenceMarginUnit, JSON.stringify(equivalenceComparisonOptions), JSON.stringify(assessment.inputDiagnostics)]);
  const activeRequest = comparisonGoal === "equivalence" ? equivalenceRequest : assessment.request;
  const equivalenceSelected = comparisonGoal === "equivalence";
  const equivalenceExecutable = equivalenceRequest !== null;
  const plannedComparisonsMissing =
    effectiveContrastIntent === "planned_comparisons" && executablePlannedPairCount === 0;
  const executedNRef = useRef(assessment.nDisplay ?? assessment.nByCondition.map(({ label, n }) => `${label} n=${n}`).join("、"));
  const executedRef = useRef(Boolean(initialAnalysis));
  const lastExecutedRequestRef = useRef<AnalysisEngineRequest | null>(
    initialAnalysis?.request ?? null,
  );
  const executionGenerationRef = useRef(0);
  const latestRequestSnapshotRef = useRef(JSON.stringify(activeRequest));
  latestRequestSnapshotRef.current = JSON.stringify(activeRequest);
  useEffect(
    () => () => {
      executionGenerationRef.current += 1;
    },
    [],
  );
  const firstAssessmentRef = useRef(true);

  const executeRequest = useCallback(
    async (request: AnalysisEngineRequest, mode: "manual" | "automatic") => {
      const generation = ++executionGenerationRef.current;
      const requestSnapshot = JSON.stringify(request);
      const usageRoute = routeFromPath(window.location.pathname);
      if (mode === "manual") recordUsageMilestone(usageRoute, "statistics_requested");
      setRunning(true);
      setRunningRequestId(request.requestId);
      setError(null);
      try {
        const isEquivalenceRequest = request.protocolVersion === "0.15.0" || request.protocolVersion === "0.16.0";
        const coreRecommendationOwned = (
          CORE_WORKSPACE_RECOMMENDATION_TEMPLATES as readonly string[]
        ).includes(request.templateId);
        if (coreRecommendationOwned && !design) {
          if (mode === "manual") recordUsageMilestone(usageRoute, "safe_stop");
          setError(
            "実験構造をcanonical designとして確認できないため停止しました（ENGINE_INPUT_INVALID）。実験構造へ戻り、試料の対応関係を確認してください。",
          );
          onAnalysisChange?.(null);
          return;
        }
        const canonicalMatch =
          coreRecommendationOwned && design
            ? recommendAnalysisRequest(design, isEquivalenceRequest ? assessment.request! : request, outcomeId ? { outcomeId } : {})
            : null;
        if (canonicalMatch && !canonicalMatch.matched) {
          if (mode === "manual") recordUsageMilestone(usageRoute, "safe_stop");
          setError(
            `実験構造と解析要求が一致しないため停止しました（ENGINE_INPUT_INVALID）。${canonicalMatch.explanation}`,
          );
          onAnalysisChange?.(null);
          return;
        }
        const canonicalRecommendation: AnalysisRecommendation = isEquivalenceRequest
          ? {
              templateId: request.templateId,
              templateVersion: request.templateVersion,
              recommendedMethod: request.method,
              alternativeMethods: [],
              reasonCode:
                request.protocolVersion === "0.16.0"
                  ? "prespecified_paired_continuous_equivalence"
                  : "prespecified_independent_continuous_equivalence",
              explanation:
                request.protocolVersion === "0.16.0"
                  ? "Complete within-pair differences (second condition minus first condition) are evaluated against one prespecified raw-difference equivalence margin using paired TOST and its corresponding 90% confidence interval."
                  : "Two independent continuous-outcome groups are evaluated against one prespecified raw-difference equivalence margin using Welch TOST and its corresponding 90% confidence interval.",
              statisticalNDefinition:
                assessment.statisticalNDefinition ??
                assessment.nByCondition.map(({ label, n }) => `${label} n=${n}`).join(", "),
              multiplicityMethod: null,
              decision: { kind: "accepted", selectedMethod: request.method },
            }
          : canonicalMatch?.matched
          ? {
              ...canonicalMatch.recommendation,
              ...(recommendationDecisionRef.current
                ? { decision: recommendationDecisionRef.current }
                : {}),
            }
          : {
              templateId: request.templateId,
              templateVersion: request.templateVersion,
              recommendedMethod: assessment.recommendedMethod ?? request.method,
              alternativeMethods:
                assessment.methodChoices
                  ?.filter(
                    ({ method }) => method !== (assessment.recommendedMethod ?? request.method),
                  )
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
        const nextResult = await analysisRunner(request);
        if (executionGenerationRef.current !== generation) return;
        if (latestRequestSnapshotRef.current !== requestSnapshot) {
          setStaleNotice(
            "解析中に入力または解析要求が変わったため、以前の応答を採用しません。現在の入力で再実行してください。",
          );
          return;
        }
        if (nextResult.requestId !== request.requestId) {
          setResult(null);
          setError("解析応答が今回の要求と一致しません。結果は採用せず、再実行してください。");
          onAnalysisChange?.(null);
          return;
        }
        resultFocusRequestedRef.current = mode === "manual" && nextResult.status === "ok";
        executedNRef.current = nextResult.equivalence?.comparisons[0]?.analysisSet ? `完全な対応組 n=${nextResult.equivalence.comparisons[0].analysisSet.completePairCount}組` : assessment.nDisplay ?? assessment.nByCondition.map(({ label, n }) => `${label} n=${n}`).join("、");
        setResult(nextResult);
        executedRef.current = nextResult.status === "ok";
        lastExecutedRequestRef.current = nextResult.status === "ok" ? request : null;
        setStaleNotice(
          mode === "automatic" && nextResult.status === "ok"
            ? "値のみが変更され、実験設計・実験単位・比較・解析法が同一だったため、同じ解析を自動再実行しました。"
            : null,
        );
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
          if (mode === "manual") recordUsageMilestone(usageRoute, "safe_stop");
          const preciseFeedback = analysisValidationFeedback(nextResult);
          if (preciseFeedback) {
            setError(
              `${preciseFeedback.title}（ENGINE_INPUT_INVALID）。${preciseFeedback.message} ${preciseFeedback.nextAction}`,
            );
          } else {
            const researcherMessage = researcherError("ENGINE_INPUT_INVALID");
            setError(
              `${researcherMessage.title}（${researcherMessage.code}）。${researcherMessage.nextAction}`,
            );
          }
        } else {
          if (mode === "manual") recordUsageMilestone(usageRoute, "statistics_completed");
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
                : request.protocolVersion === "0.1.0" || request.protocolVersion === "0.15.0" || request.protocolVersion === "0.16.0"
                  ? request.contrastConditionIds.join("|")
                  : request.protocolVersion === "0.5.0"
                    ? request.variableConditionIds.join("|")
                    : request.protocolVersion === "0.11.0"
                      ? `${request.rowCategoryIds.join("|")}::${request.columnCategoryIds.join("|")}`
                      : request.protocolVersion === "0.12.0"
                        ? request.conditionIds.join("|")
                        : request.protocolVersion === "0.13.0"
                          ? `${request.xLabel}|${request.yLabel}`
                          : request.protocolVersion === "0.14.0"
                            ? `${request.seriesIds.join("|")}|model:${request.modelId}`
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
        if (
          executionGenerationRef.current !== generation ||
          latestRequestSnapshotRef.current !== requestSnapshot
        )
          return;
        if (mode === "manual") recordUsageMilestone(usageRoute, "safe_stop");
        if (reason instanceof Error && reason.message.includes("解析を中止")) {
          setError(reason.message);
          return;
        }
        const errorCode = reason instanceof Error && "code" in reason ? String(reason.code) : null;
        const researcherMessage = researcherError(
          errorCode === "ENGINE_INPUT_INVALID" ? "ENGINE_INPUT_INVALID" : "ENGINE_EXECUTION_FAILED",
        );
        setError(
          `${researcherMessage.title}（${researcherMessage.code}）。${researcherMessage.nextAction}`,
        );
      } finally {
        if (executionGenerationRef.current === generation) {
          setRunning(false);
          setRunningRequestId(null);
        }
      }
    },
    [analysisRunner, assessment, design, onAnalysisChange, outcomeId],
  );

  useEffect(() => {
    if (firstAssessmentRef.current) {
      firstAssessmentRef.current = false;
      return;
    }
    const structuralContextChanged = lastAnalysisContextKeyRef.current !== analysisContextKey;
    lastAnalysisContextKeyRef.current = analysisContextKey;
    // Choosing a supported method before the first execution is a lightweight interaction,
    // not a structural data change that should erase the researcher's choice.
    if (!executedRef.current && !structuralContextChanged) return;
    const previousRequest = lastExecutedRequestRef.current;
    const nextRequest = activeRequest;
    const automaticRerunIsSafe = Boolean(
      executedRef.current &&
      previousRequest &&
      nextRequest &&
      canSafelyAutomaticallyRerun(previousRequest, nextRequest),
    );
    executionGenerationRef.current += 1;
    resultFocusRequestedRef.current = false;
    setRunning(false);
    setRunningRequestId(null);
    if (executedRef.current) {
      setStaleNotice(
        automaticRerunIsSafe
          ? "値の変更を検出しました。構造を確認後、同じ解析を自動再実行します…"
          : "表示するデータまたは実験構造が変わったため、以前の解析結果を外しました。現在の対象に対応する解析法を確認して実行してください。",
      );
    }
    executedRef.current = false;
    if (!automaticRerunIsSafe) {
      setIndependenceConfirmed(relationshipAlreadyDeclared);
      const defaultDecision = assessment.recommendedMethod
        ? ({ kind: "accepted", selectedMethod: assessment.recommendedMethod } as const)
        : null;
      setRecommendationDecision(defaultDecision);
    }
    setResult(null);
    onAnalysisChange?.(null);
    setError(null);
    if (!automaticRerunIsSafe || !nextRequest) return;
    const timer = window.setTimeout(() => {
      void executeRequest(nextRequest, "automatic");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [
    analysisContextKey,
    assessment.recommendedMethod,
    activeRequest,
    executeRequest,
    onAnalysisChange,
    relationshipAlreadyDeclared,
  ]);

  const run = async () => {
    if (
      !analysisAvailable ||
      !activeRequest ||
      !independenceConfirmed ||
      (!equivalenceSelected && plannedComparisonsMissing)
    )
      return;
    if (!recommendationDecision && assessment.recommendedMethod) {
      const decision = {
        kind: "accepted" as const,
        selectedMethod: assessment.recommendedMethod,
      };
      setRecommendationDecision(decision);
    }
    await executeRequest(activeRequest, "manual");
  };
  const primaryTests =
    result?.status === "ok"
      ? result.tests.filter((test) => !isPairwiseComparisonName(test.name))
      : [];
  const comparisonRows =
    result?.status === "ok"
      ? result.tests.flatMap((test, index) => {
          if (!isPairwiseComparisonName(test.name)) return [];
          const label = comparisonDisplayLabel(test.name, conditionOptions);
          return label ? [{ test, label, index }] : [];
        })
      : [];
  const diagnosticItems =
    result?.status === "ok"
      ? [
          ...result.diagnostics.map((item) => ({ ...item, severity: "diagnostic" as const })),
          ...result.warnings.map((item) => ({ ...item, severity: "warning" as const })),
        ]
      : [];
  const hasImportantDiagnostic = diagnosticItems.some(
    (item) => item.severity === "warning" || item.code === "sphericity_not_estimated" || /small|few|n_lt|n_less|underpowered/iu.test(item.code),
  );
  const humanMethodLabel = (method: string | null | undefined) =>
    method === "welch_tost" ? "Welch TOST（同等性）" : method === "paired_tost" ? "対応のある TOST（同等性）" :
    assessment.methodChoices?.find((choice) => choice.method === method)?.label ??
    (method === "pearson"
      ? "Pearson相関"
      : method === "spearman"
        ? "Spearman順位相関"
        : assessment.title.replace(/を推奨$/, ""));
  const estimateLabel = (name: string) => {
    for (const left of conditionOptions) for (const right of conditionOptions) {
      if (name === `${left.id}_minus_${right.id}`) return `${left.label} − ${right.label}`;
    }
    return name;
  };
  const estimateComparisonTest = (name: string) => {
    const matches = conditionOptions.flatMap((first) => conditionOptions.flatMap((second) => {
      if (first.id === second.id || name !== `${first.id}_minus_${second.id}`) return [];
      return comparisonRows.filter(({test}) => pairwiseComparisonFamilies.some(family => test.name === `${family}:${first.id}:${second.id}`));
    }));
    return matches.length === 1 ? matches[0]!.test : null;
  };
  const adjustment = lastExecutedRequestRef.current?.options.multiplicityMethod;
  const inferenceDefinitionNotes = [
    { id: "alternative", text: twoConditionAlternativeText(lastExecutedRequestRef.current) },
    { id: "interval", text: twoConditionIntervalNote(lastExecutedRequestRef.current) },
    { id: "control", text: controlComparisonInferenceText(lastExecutedRequestRef.current) },
  ].filter((note): note is { id: string; text: string } => Boolean(note.text));
  const adjustmentLabel = adjustment === "dunnett_control_vs_many"
    ? "Dunnett（対照群との多重比較・同時区間）"
    : adjustment === "holm" ? "Holm" : adjustment ?? "なし";
  const externalLlmPrompt = createStatisticsConsultationPrompt({
    conditions: conditionOptions.map(({ label }) => label),
    methodTitle: assessment.title,
    methodReason: assessment.reason,
    nByCondition: Object.fromEntries(assessment.nByCondition.map(({ label, n }) => [label, n])),
    missingCount: assessment.missingCount,
    notPlannedCount: assessment.notPlannedCount,
    relationship:
      matchedRelationship?.kind === "same_entity"
        ? `同じ${matchedRelationship.unitLabel}を条件間で測定`
        : matchedRelationship?.kind === "shared_source"
          ? `条件別${matchedRelationship.unitLabel}が同じ${matchedRelationship.sourceLabel}に由来`
          : "条件ごとに独立、または未確認",
    selectedMethod: assessment.method,
  });

  return (
    <section className="experiment-graph-statistics-section" aria-label="このグラフの統計">
      <div className="experiment-graph-statistics-heading">
        <p className="experiment-graph-overline">実データ確認後</p>
        <h3>このグラフの統計</h3>
        <details className="experiment-graph-statistics-help">
          <summary>統計のヘルプ</summary>
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
        <ExternalLlmConsultation prompt={externalLlmPrompt} placement="statistics" />
        </details>
      </div>
      <div className={`experiment-graph-recommendation is-${assessment.state}${result?.status === "ok" && assessment.state === "ready" ? " has-current-result" : ""}`}>
        {assessment.state === "ready" ? (
          result?.status !== "ok" ? <>
            <strong>推奨: {assessment.title.replace(/を推奨$/, "")}</strong>
            <p><strong>理由:</strong> {assessment.reason}</p>
          </> : null
        ) : (
          <>
            <strong>{assessment.title}</strong>
            <p>{assessment.reason}</p>
          </>
        )}
        {assessment.analysisSetSummary ? (
          <div className="experiment-graph-analysis-set" role="status">
            <strong>解析対象:</strong> {assessment.analysisSetSummary}
            {assessment.graphAnalysisSetDifference ? (
              <p>{assessment.graphAnalysisSetDifference}</p>
            ) : null}
          </div>
        ) : null}
        {assessment.missingCount > 0 ? (
          <p>
            表上の空欄または無効な値：{assessment.missingCount}件
            （条件ごとの件数差による空欄は、解析のnに数えません）
          </p>
        ) : null}
        {assessment.notPlannedCount > 0 ? (
          <p>測定予定なし（解析対象外）：{assessment.notPlannedCount}件</p>
        ) : null}
      </div>

      <p className="experiment-graph-measurement-count">対象条件の元測定数（解析の除外前・独立nとは別）：{measurementCountSummary ?? "この構造では集計未定義。元データ表で確認"}</p>

      {assessment.state === "ready" ? <fieldset><legend>比較の目的</legend><label><input type="radio" name="comparison-goal" checked={!equivalenceSelected} onChange={() => onComparisonGoalChange?.("difference")} />差を調べる</label><label><input type="radio" name="comparison-goal" checked={equivalenceSelected} onChange={() => onComparisonGoalChange?.("equivalence")} />実質的に同等か調べる</label></fieldset> : null}
      {assessment.state === "ready" && equivalenceSelected ? <details open><summary>事前指定の同等性計画</summary><p>観測データから許容差を自動生成しません。通常の検定で p &gt; 0.05 でも同等性を示したことにはなりません。</p><p>許容差を定める差の方向：{equivalenceComparisonOptions[0]?.label ?? "この構造では未定義"}</p><EquivalencePlanEditor key={equivalencePlanContextKey} plan={equivalencePlan} scale={equivalenceMarginScale} unit={equivalenceMarginUnit} comparisonCount={equivalenceComparisonCount} comparisonOptions={equivalenceComparisonOptions} onPlanChange={onEquivalencePlanChange} />{!equivalenceExecutable ? <p role="note">対応する独立または同一実験単位の2条件と、単一主比較の事前指定marginがそろうまで実行しません。</p> : null}</details> : null}

      {assessment.state === "ready" && equivalenceSelected ? (
        <div className="experiment-graph-equivalence-execution">
          {relationshipAlreadyDeclared ? (
            <p className="experiment-graph-confirmation is-declared" role="status">
              <strong>
                {t("実験の組み立てで回答済み", "Already declared in experiment setup")}:
              </strong>{" "}
              {equivalenceSupportKind === "continuous_matched"
                ? t(
                    "同じ実験単位を2条件で対応づけます。",
                    "The same experimental units are matched across two conditions.",
                  )
                : t(
                    "条件ごとに別々の実験単位を扱います。",
                    "Each condition uses separate experimental units.",
                  )}
            </p>
          ) : (
            <label className="experiment-graph-confirmation">
              <input
                type="checkbox"
                checked={independenceConfirmed}
                onChange={(event) => setIndependenceConfirmed(event.target.checked)}
              />
              <span>
                {equivalenceSupportKind === "continuous_matched"
                  ? t(
                      "安定したIDで同じ実験単位を2条件間で対応づけたことを確認しました。",
                      "I confirmed that stable IDs match the same experimental units across conditions.",
                    )
                  : t(
                      "条件間で実験単位が独立していることを確認しました。",
                      "I confirmed that experimental units are independent across conditions.",
                    )}
              </span>
            </label>
          )}
          <button
            className="experiment-graph-run-analysis"
            type="button"
            disabled={
              !analysisAvailable || !independenceConfirmed || !equivalenceExecutable || running
            }
            onClick={run}
          >
            {running
              ? t("ローカルで解析中…", "Running locally…")
              : equivalenceSupportKind === "continuous_matched"
                ? t("対応のあるTOSTを実行", "Run paired TOST")
                : t("Welch TOSTを実行", "Run Welch TOST")}
          </button>
          {!equivalenceExecutable ? (
            <p className="experiment-graph-help" role="note">
              {t(
                "対応する実験構造と、単一主比較の事前指定marginがそろうまで実行しません。入力と計画draftは保持します。",
                "Analysis remains disabled until the supported design and a prespecified single-primary-comparison margin are complete. Entered data and the plan draft are retained.",
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      {assessment.inputDiagnostics?.map((diagnostic, diagnosticIndex) => {
        const visibleSets = diagnostic.incompleteMatchedSets.slice(
          0,
          MAX_VISIBLE_INCOMPLETE_MATCHED_SETS,
        );
        const remainingSetCount = diagnostic.incompleteMatchedSets.length - visibleSets.length;
        return (
          <details
            className="experiment-graph-confirmation-details"
            open
            key={`${diagnostic.code}-${diagnosticIndex}`}
          >
            <summary>{diagnostic.title}</summary>
            <p className="experiment-graph-help">{diagnostic.message}</p>
            {visibleSets.length > 0 ? <ul aria-label="stable unit / pair IDごとの不足条件">
              {visibleSets.map((item) => (
                <li key={`${item.experimentId}-${item.pairId}`}>
                  <code>{item.pairId}</code>（{item.experimentLabel}）：
                  {missingConditionSummary(item.missingConditions)}
                </li>
              ))}
            </ul> : null}
            {remainingSetCount > 0 ? (
              <p className="experiment-graph-help">
                ほか{remainingSetCount}組はデータ表で確認できます。
              </p>
            ) : null}
            {diagnostic.correction && onCorrectionRequested ? (
              <button type="button" onClick={() => onCorrectionRequested(diagnostic.correction!)}>
                {diagnostic.correction.actionLabel}
              </button>
            ) : null}
          </details>
        );
      })}

      {assessment.correction ? (
        <div className="experiment-graph-help" role="group" aria-label="解析入力の修正">
          {onCorrectionRequested ? (
            <button type="button" onClick={() => onCorrectionRequested(assessment.correction!)}>
              {assessment.correction.actionLabel}
            </button>
          ) : null}
          {assessment.correction.suggestedMethod && onSelectedMethodChange ? (
            <button
              type="button"
              onClick={() => onSelectedMethodChange(assessment.correction!.suggestedMethod!)}
            >
              Wilcoxonの代替案を選ぶ
            </button>
          ) : null}
        </div>
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
        <div className="experiment-graph-analysis-result" role="group" aria-label="統計解析結果" ref={resultFocusRef} tabIndex={-1}>
          {result.equivalence ? <EquivalenceResultPanel result={result.equivalence} comparisonLabels={Object.fromEntries(equivalenceComparisonOptions.map(({id,label})=>[id,label]))} /> : null}
          <div className="experiment-graph-analysis-summary">
            <strong>解析完了（ローカル）</strong>
            <p>検定・モデル：{humanMethodLabel(lastExecutedRequestRef.current?.method)}</p>
            <p>多重性の調整：{adjustmentLabel}</p>
            <p>
              解析に用いた実験単位：
              {executedNRef.current}
            </p>
          </div>
          {diagnosticItems.length > 0 ? (
            <details
              className={`experiment-graph-analysis-diagnostics${
                hasImportantDiagnostic ? " is-important" : ""
              }`}
              open={hasImportantDiagnostic}
            >
              <summary>
                {hasImportantDiagnostic ? "重要な注意" : "診断と注意"}（{diagnosticItems.length}件）
              </summary>
              {diagnosticItems.map((item) => (
                <p data-severity={item.severity} key={`${item.code}-${item.message}`}>
                  {diagnosticLabel(item.code, matchedRelationship)}
                </p>
              ))}
            </details>
          ) : null}
          {result.estimates.length > 0 ? (
            <dl aria-label="主要な推定値">
              {result.estimates.map((estimate) => {
                const comparisonTest = estimateComparisonTest(estimate.name);
                return (
                <div key={estimate.name}>
                  <dt>{estimateLabel(estimate.name)}</dt>
                  <dd>
                    推定値 = {formatNumber(estimate.value)}
                    {estimate.standardError === null
                      ? ""
                      : `、SE = ${formatNumber(estimate.standardError)}`}
                    {estimate.confidenceInterval
                      ? `、${formatConfidencePercent(estimate.confidenceInterval.level)}% ${usesCentralTwoConditionTInterval(lastExecutedRequestRef.current) ? "両側CI" : "CI"} ${formatNumber(
                          estimate.confidenceInterval.lower,
                        )}–${formatNumber(estimate.confidenceInterval.upper)}`
                      : ""}
                    {comparisonTest ? (
                      <span className="experiment-graph-estimate-p">
                        、調整済みp = {comparisonTest.adjustedPValue === null ? "算出なし" : formatP(comparisonTest.adjustedPValue)}
                        {/^(tukey_hsd|dunnett):/.test(comparisonTest.name) ? "（未調整pは算出なし）" : `（未調整p = ${formatP(comparisonTest.pValue)}）`}
                      </span>
                    ) : null}
                  </dd>
                </div>
                );
              })}
            </dl>
          ) : null}
          <dl aria-label="主要な検定結果">
            {primaryTests.map((test) => (
              <div key={test.name}>
                <dt>全体／主解析</dt>
                <dd>
                  {inferenceStatisticLabel(result, test)} = {formatNumber(test.statistic)}、p ={" "}
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
          {comparisonRows.length > 0 ? (
            <details className="experiment-graph-analysis-comparisons" open>
              <summary>条件間比較（{comparisonRows.length}件）</summary>
              <div className="data-table-scroll">
                <table className="data-table" aria-label="条件間比較の結果">
                  <thead>
                    <tr>
                      <th scope="col">比較</th>
                      <th scope="col">検定統計量・自由度</th>
                      <th scope="col">p値</th>
                      <th scope="col">調整済みp値</th>
                      <th scope="col">効果量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map(({ test, label, index }) => (
                      <tr key={`${test.name}-${index}`}>
                        <th scope="row">{label}</th>
                        <td>
                          {inferenceStatisticLabel(result, test)} = {formatNumber(test.statistic)}
                          {test.degreesOfFreedom
                            ? `、df = ${test.degreesOfFreedom.join(", ")}`
                            : ""}
                        </td>
                        <td>{formatP(test.pValue)}</td>
                        <td>{test.adjustedPValue === null ? "—" : formatP(test.adjustedPValue)}</td>
                        <td>
                          {test.effectSizeName && test.effectSize !== null
                            ? `${test.effectSizeName} = ${formatNumber(test.effectSize)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
          {inferenceDefinitionNotes.length > 0 ? (
            <details className="experiment-graph-inference-definition">
              <summary>推定・検定の定義と区間の限界</summary>
              {inferenceDefinitionNotes.map((note) => <p key={note.id}>{note.text}</p>)}
            </details>
          ) : null}
          <details className="experiment-graph-estimation-figures">
            <summary>推定図を表示</summary>
          <ExecutedMeanDifferencePlot
            request={lastExecutedRequestRef.current}
            result={result}
            conditions={conditionOptions}
          />
          <ExecutedEstimationComposite
            request={lastExecutedRequestRef.current}
            result={result}
            conditions={conditionOptions}
            nByCondition={assessment.nByCondition}
            valueUnit={analysisValueUnit}
            unitLabel={statisticalUnitLabel}
          />
          </details>
          <details>
            <summary>解析エンジンと再現情報</summary>
            <dl>
              <div>
                <dt>検定・モデル</dt>
                <dd>{humanMethodLabel(lastExecutedRequestRef.current?.method)}</dd>
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
                <dd>{lastExecutedRequestRef.current?.options.multiplicityMethod ?? "なし"}</dd>
              </div>
              <div>
                <dt>実行リクエスト</dt>
                <dd>
                  {lastExecutedRequestRef.current?.templateId} / protocol {lastExecutedRequestRef.current?.protocolVersion}
                  {" "}（template {lastExecutedRequestRef.current?.templateVersion}）
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
      {assessment.state === "ready" && !equivalenceSelected ? (
        <details className="experiment-graph-analysis-settings" open={result?.status !== "ok"}>
          <summary>解析設定（方法・比較・独立性）</summary>
          {assessment.request?.protocolVersion === "0.2.0" ||
          assessment.request?.protocolVersion === "0.4.0" ? (
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
                  disabled={
                    assessment.request.protocolVersion !== "0.2.0" ||
                    !assessment.request.controlConditionId
                  }
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
          {(assessment.request?.protocolVersion === "0.2.0" ||
            assessment.request?.protocolVersion === "0.4.0") &&
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
                          checked={currentMethod === choice.method}
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
              <p>
                {currentRecommendationDecision
                  ? currentRecommendationDecision.kind === "accepted"
                    ? `推奨法を選択中：${humanMethodLabel(currentRecommendationDecision.selectedMethod)}。別の方法を選ぶと、その選択を解析履歴へ記録します。`
                    : `推奨とは異なる方法として${humanMethodLabel(currentRecommendationDecision.selectedMethod)}を選択中です。この選択は解析履歴へ記録されます。`
                  : "選択中の解析法は実行時にprovenanceへ記録します。"}
              </p>
            </div>
          ) : null}
          {relationshipAlreadyDeclared ? (
            <p
              className="experiment-graph-confirmation is-declared"
              role="status"
              aria-label="実験構造の確認状況"
            >
              <strong>実験の組み立てで回答済み：</strong>
              {matchedAnalysis
                ? sharedSourcePairing
                  ? `同じ${sharedSourcePairing.sourceLabel}に由来する条件別${sharedSourcePairing.unitLabel}を共有IDで対応づけます。`
                  : "同じ実験単位を条件間で対応づけます。"
                : correlationAnalysis
                  ? "同じ実験単位から得たXとYを1組として扱います。"
                  : "条件ごとに別々の実験単位を扱います。"}
            </p>
          ) : (
            <>
              <label className="experiment-graph-confirmation">
                <input
                  type="checkbox"
                  aria-label={
                    independentNestedSourceContext
                      ? `${conditionOptions.map(({ label }) => label).join("と")}の${independentNestedSourceContext.unitLabel}は、同じrun/source preparationから分けた組ではなく、別々の独立した材料由来です。各${independentNestedSourceContext.nestedObservationLabel}は親${independentNestedSourceContext.unitLabel}へ集約します。`
                      : assessment.request?.protocolVersion === "0.9.0"
                        ? `各値が別々の${assessment.nByCondition[0]?.label ?? "実験単位"}から得られ、1つの実験単位が複数回数えられていません。`
                        : correlationAnalysis
                          ? "各行のXとYが、同じ実験単位から得た1組として正しく対応づけられています。"
                          : matchedAnalysis
                            ? sharedSourcePairing
                              ? `同じ${sharedSourcePairing.sourceLabel}に由来する条件別${sharedSourcePairing.unitLabel}が、共有IDで正しく対応づけられています。条件別${sharedSourcePairing.unitLabel}は別の実験単位です。`
                              : `同じ実験単位の${conditionOptions.length || "複数"}条件が、stable unit IDで正しく対応づけられています。`
                            : "各条件は別々のdish・試料・動物などの実験単位です。同じ個体や同じ試料を両条件で測った対応データではありません。"
                  }
                  checked={independenceConfirmed}
                  onChange={(event) => setIndependenceConfirmed(event.target.checked)}
                />
                <span>
                  {independentNestedSourceContext
                    ? "条件間のrun/sourceと実験単位の独立性を確認しました。"
                    : assessment.request?.protocolVersion === "0.9.0"
                      ? "解析単位と入力値の対応を確認しました。"
                      : correlationAnalysis
                        ? "XとYの組を確認しました。"
                        : matchedAnalysis
                          ? sharedSourcePairing
                            ? "共有する由来と、条件別の実験単位を確認しました。"
                            : "同じ実験単位の対応を確認しました。"
                          : "条件間で実験単位が独立していることを確認しました。"}
                </span>
              </label>
              <details className="experiment-graph-confirmation-details">
                <summary>確認内容の詳細</summary>
                <p className="experiment-graph-help">
                  {independentNestedSourceContext
                    ? `各${independentNestedSourceContext.nestedObservationLabel}を独立nとして数えず、親${independentNestedSourceContext.unitLabel}ごとに集約します。同じrun/source preparationから条件別${independentNestedSourceContext.unitLabel}を分けた場合は、独立群として実行せず実験の組み立てで共有材料・実験回を登録してください。単に同日という理由ではpairにしません。`
                    : correlationAnalysis
                      ? "XとYは同じExpの安定IDで対応づけます。行順や日付の一致だけから組を作りません。"
                      : matchedAnalysis
                        ? sharedSourcePairing
                          ? `日付や行順から対応を推測していません。${sharedSourcePairing.sourceLabel}の共有IDで明示された完全な組だけを解析し、条件別${sharedSourcePairing.unitLabel}のIDは別々に保持します。`
                          : "日付の一致から対応を推測していません。実験設計で明示した対応と、完全な組だけを解析します。"
                        : "同じ日に実施しただけでは、自動的に「対応あり」にはしません。同じ単位を両条件で測った場合は実行せず、設計を修正してください。"}
                </p>
                {independentNestedSourceContext && onCorrectionRequested ? (
                  <button
                    type="button"
                    onClick={() =>
                      onCorrectionRequested(
                        nestedIndependentSourceCorrection(independentNestedSourceContext),
                      )
                    }
                  >
                    共通材料・実験回を確認
                  </button>
                ) : null}
              </details>
            </>
          )}
          <button
            className="experiment-graph-run-analysis"
            type="button"
            disabled={
              !analysisAvailable || !independenceConfirmed || plannedComparisonsMissing || running
            }
            onClick={() => { void run(); }}
          >
            {running ? "ローカルで解析中…" : "選択した解析を実行"}
          </button>
          {running && runningRequestId ? (
            <button type="button" onClick={() => void cancelLocalAnalysis(runningRequestId)}>
              解析を中止
            </button>
          ) : null}
          {!analysisAvailable ? (
            <p className="experiment-graph-help" role="note">
              このブラウザレビューでは解析エンジンを実行できません。デスクトップ版では利用できます。
            </p>
          ) : null}
        </details>
      ) : null}


    </section>
  );
}
