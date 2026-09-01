import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalysisEngineRequest,
  AnalysisEngineResult,
  AnalysisRecommendation,
  EquivalenceAnalysisPlan,
  EquivalenceMargin,
} from "@lsaa/analysis-contracts";
import {
  CORE_WORKSPACE_RECOMMENDATION_TEMPLATES,
  recommendAnalysisRequest,
} from "@lsaa/analysis-contracts";
import type { ExperimentDesign } from "@lsaa/domain";

import { cancelLocalAnalysis, type AnalysisRunner } from "../../app/analysisClient";
import type {
  ContrastIntent,
  DraftAnalysisAssessment,
  ScientificComparisonGoal,
} from "../../app/experimentDraftAnalysis";
import {
  nestedIndependentSourceCorrection,
  type DraftAnalysisCorrection,
  type NestedIndependentSourceContext,
} from "../../app/draftAnalysisDiagnostics";
import { analysisValidationFeedback } from "../../app/analysisValidationFeedback";
import type { WorkspaceGraphAnalysis } from "../../app/experimentWorkspaceProject";
import { copyMethodsText } from "../../app/methodsText";
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
import { localizedText, useAppLocale, type AppLocale } from "../../app/appLocale";
import { EquivalencePlanEditor } from "./EquivalencePlanEditor";
import type { EquivalenceSupportKind } from "./equivalenceSupportPresentation";

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
  comparisonGoal?: ScientificComparisonGoal;
  onComparisonGoalChange?: (goal: ScientificComparisonGoal) => void;
  equivalencePlan?: EquivalenceAnalysisPlan | null;
  equivalenceMarginScale?: EquivalenceMargin["scale"];
  equivalenceMarginUnit?: string;
  onEquivalencePlanChange?: (plan: EquivalenceAnalysisPlan | null) => void;
  equivalenceSupportKind?: EquivalenceSupportKind;
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
}>;

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 4 }).format(value);
}

function formatP(value: number): string {
  return value < 0.0001 ? value.toExponential(2) : formatNumber(value);
}

const MAX_VISIBLE_INCOMPLETE_MATCHED_SETS = 6;
const MAX_VISIBLE_MISSING_CONDITIONS = 4;

function missingConditionSummary(
  conditions: readonly Readonly<{ label: string }>[],
  locale: AppLocale,
): string {
  const visible = conditions.slice(0, MAX_VISIBLE_MISSING_CONDITIONS).map(({ label }) => label);
  const remaining = conditions.length - visible.length;
  const separator = locale === "ja" ? "、" : ", ";
  return remaining > 0
    ? locale === "ja"
      ? `${visible.join(separator)}、ほか${remaining}条件`
      : `${visible.join(separator)}, and ${remaining} more`
    : visible.join(separator);
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

function estimateDisplayLabel(name: string, conditionOptions: readonly ConditionOption[]): string {
  for (const first of conditionOptions) {
    for (const second of conditionOptions) {
      if (first.id === second.id) continue;
      if (name === `${first.id}_minus_${second.id}`) {
        return `${first.label} − ${second.label}`;
      }
    }
  }
  return name;
}

const ENGLISH_METHOD_LABELS: Readonly<Record<string, string>> = {
  welch_t: "Welch's t-test",
  student_t: "Student's t-test",
  paired_t: "Paired t-test",
  mann_whitney: "Mann–Whitney test",
  wilcoxon_signed_rank: "Wilcoxon signed-rank test",
  welch_anova: "Welch's ANOVA",
  one_way_anova: "Ordinary one-way ANOVA",
  kruskal_wallis: "Kruskal–Wallis test",
  pearson: "Pearson correlation",
  spearman: "Spearman rank correlation",
};

function diagnosticLabel(
  code: string,
  matchedRelationship?: MatchedRelationship,
  locale: AppLocale = "ja",
): string {
  if (locale === "en") {
    if (code === "assumptions_not_fully_evaluated")
      return "Normality is not established by a significance test in a small sample. Review the experimental-unit distribution and design as well.";
    if (code === "variance_robust_multi_group_default")
      return "This multi-group comparison does not assume equal variances. Independence of experimental units is still required.";
    if (code === "very_small_biological_n")
      return "At least one condition has fewer than three experimental units. Estimates and assumption checks are highly uncertain.";
    if (code === "equal_variance_assumption_selected")
      return "The selected method assumes equal variances. This stronger assumption will be recorded in the result and Methods.";
    if (code === "rank_distribution_test_semantics")
      return "Mann–Whitney evaluates ranks and distributional ordering. Without additional assumptions, do not interpret it as only a test of medians.";
    if (code === "paired_rank_test_semantics")
      return matchedRelationship?.kind === "shared_source"
        ? `Wilcoxon evaluates the signs and ranks of differences between condition-specific ${matchedRelationship.unitLabel}s explicitly matched by a shared ${matchedRelationship.sourceLabel} ID. The condition-specific units remain separate experimental units.`
        : "Wilcoxon evaluates the signs and ranks of within-unit differences matched by stable IDs.";
    if (code === "paired_difference_distribution")
      return "The analysis calculates the between-condition difference for each matched experimental unit and evaluates the distribution of those differences. It does not test the two original condition distributions as independent groups.";
    if (code === "omnibus_only_no_posthoc")
      return "Only the overall difference was evaluated. Unrequested pairwise comparisons were not generated.";
    if (code === "planned_pairwise_no_simultaneous_ci")
      return "Only prespecified condition pairs were adjusted with Holm's method. Simultaneous confidence intervals are not shown for this option.";
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
  if (code === "rank_distribution_test_semantics") {
    return "Mann–Whitneyは順位と分布の並び方を評価します。追加仮定なしに単なる中央値の検定とは解釈しません。";
  }
  if (code === "paired_rank_test_semantics") {
    if (matchedRelationship?.kind === "shared_source") {
      return `Wilcoxonは、共有IDで対応した同じ${matchedRelationship.sourceLabel}由来の条件別${matchedRelationship.unitLabel}の差の符号と順位を評価します。条件別${matchedRelationship.unitLabel}は別の実験単位です。`;
    }
    return "Wilcoxonは、安定IDで対応した各実験単位内の差の符号と順位を評価します。";
  }
  if (code === "paired_difference_distribution") {
    return "対応する各実験単位について条件間の差を計算し、その差の分布を評価します。元の2条件それぞれの分布を独立群として検定するものではありません。";
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
  selectedMethod,
  onSelectedMethodChange,
  comparisonGoal = "difference",
  onComparisonGoalChange,
  equivalencePlan,
  equivalenceMarginScale = "raw_difference",
  equivalenceMarginUnit = "readout units",
  onEquivalencePlanChange,
  equivalenceSupportKind = "specialist_outcome",
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
}: GraphStatisticsPanelProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const [independenceConfirmed, setIndependenceConfirmed] = useState(
    (Boolean(initialAnalysis) && !independentNestedSourceContext) || relationshipAlreadyDeclared,
  );
  const [result, setResult] = useState<AnalysisEngineResult | null>(
    initialAnalysis?.result ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
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
  useEffect(() => {
    recommendationDecisionRef.current = recommendationDecision;
  }, [recommendationDecision]);
  const matchedAnalysis =
    assessment.method === "paired_t" ||
    assessment.method === "wilcoxon_signed_rank" ||
    assessment.method === "repeated_measures_anova";
  const correlationAnalysis = assessment.method === "pearson" || assessment.method === "spearman";
  const sharedSourcePairing =
    matchedRelationship?.kind === "shared_source" ? matchedRelationship : null;
  const effectiveContrastIntent = contrastIntent ?? assessment.contrastIntent;
  const equivalenceSelected = comparisonGoal === "equivalence";
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
  const equivalenceComparisonOptions = (
    plannedContrastConditionIds.length > 0
      ? plannedContrastConditionIds
          .map(([firstId, secondId]) => {
            const first = conditionOptions.find(({ id }) => id === firstId);
            const second = conditionOptions.find(({ id }) => id === secondId);
            return first && second ? ({ first, second } as const) : null;
          })
          .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
      : plannedPairChoices
  ).map(({ first, second }) => ({
    id: `equivalence:${encodeURIComponent(first.id)}:${encodeURIComponent(second.id)}`,
    label: `${first.label} vs ${second.label}`,
  }));
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
      const usageRoute = routeFromPath(window.location.pathname);
      if (mode === "manual") recordUsageMilestone(usageRoute, "statistics_requested");
      setRunning(true);
      setRunningRequestId(request.requestId);
      setError(null);
      try {
        const coreRecommendationOwned = (
          CORE_WORKSPACE_RECOMMENDATION_TEMPLATES as readonly string[]
        ).includes(request.templateId);
        if (coreRecommendationOwned && !design) {
          if (mode === "manual") recordUsageMilestone(usageRoute, "safe_stop");
          setError(
            localizedText(
              locale,
              "実験構造をcanonical designとして確認できないため停止しました（ENGINE_INPUT_INVALID）。実験構造へ戻り、試料の対応関係を確認してください。",
              "Analysis stopped because the experimental structure could not be validated as a canonical design (ENGINE_INPUT_INVALID). Return to the experimental structure and review how specimens are related.",
            ),
          );
          onAnalysisChange?.(null);
          return;
        }
        const canonicalMatch =
          coreRecommendationOwned && design
            ? recommendAnalysisRequest(design, request, outcomeId ? { outcomeId } : {})
            : null;
        if (canonicalMatch && !canonicalMatch.matched) {
          if (mode === "manual") recordUsageMilestone(usageRoute, "safe_stop");
          setError(
            locale === "ja"
              ? `実験構造と解析要求が一致しないため停止しました（ENGINE_INPUT_INVALID）。${canonicalMatch.explanation}`
              : "Analysis stopped because the request does not match the experimental structure (ENGINE_INPUT_INVALID). Return to the experimental structure and review the units, conditions, and comparison objective.",
          );
          onAnalysisChange?.(null);
          return;
        }
        const canonicalRecommendation: AnalysisRecommendation = canonicalMatch?.matched
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
        setResult(nextResult);
        executedRef.current = nextResult.status === "ok";
        lastExecutedRequestRef.current = nextResult.status === "ok" ? request : null;
        setStaleNotice(
          mode === "automatic" && nextResult.status === "ok"
            ? localizedText(
                locale,
                "値のみが変更され、実験設計・実験単位・比較・解析法が同一だったため、同じ解析を自動再実行しました。",
                "Only values changed. The design, experimental units, comparison, and method were unchanged, so the same analysis was rerun automatically.",
              )
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
          const preciseFeedback = analysisValidationFeedback(nextResult, locale);
          if (preciseFeedback) {
            setError(
              `${preciseFeedback.title}${localizedText(locale, "（ENGINE_INPUT_INVALID）。", " (ENGINE_INPUT_INVALID). ")}${preciseFeedback.message} ${preciseFeedback.nextAction}`,
            );
          } else {
            const researcherMessage = researcherError("ENGINE_INPUT_INVALID", locale);
            setError(
              `${researcherMessage.title}${localizedText(locale, `（${researcherMessage.code}）。`, ` (${researcherMessage.code}). `)}${researcherMessage.nextAction}`,
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
        if (mode === "manual") recordUsageMilestone(usageRoute, "safe_stop");
        if (
          reason instanceof Error &&
          (reason.message.includes("解析を中止") ||
            reason.message.includes("ENGINE_PROCESS_CANCELLED"))
        ) {
          setError(
            localizedText(
              locale,
              "解析を中止しました。入力したデータは保持されています。",
              "Analysis was cancelled. Entered data is retained.",
            ),
          );
          return;
        }
        const errorCode = reason instanceof Error && "code" in reason ? String(reason.code) : null;
        const researcherMessage = researcherError(
          errorCode === "ENGINE_INPUT_INVALID" ? "ENGINE_INPUT_INVALID" : "ENGINE_EXECUTION_FAILED",
          locale,
        );
        setError(
          `${researcherMessage.title}${localizedText(locale, `（${researcherMessage.code}）。`, ` (${researcherMessage.code}). `)}${researcherMessage.nextAction}`,
        );
      } finally {
        if (executionGenerationRef.current === generation) {
          setRunning(false);
          setRunningRequestId(null);
        }
      }
    },
    [analysisRunner, assessment, design, locale, onAnalysisChange, outcomeId],
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
          ? localizedText(
              locale,
              "値の変更を検出しました。構造を確認後、同じ解析を自動再実行します…",
              "Value changes were detected. After validating the structure, the same analysis will rerun automatically…",
            )
          : localizedText(
              locale,
              "表示するデータまたは実験構造が変わったため、以前の解析結果を外しました。解析法は自動変更しません。",
              "The displayed data or experimental structure changed, so the previous result was removed. The method was not changed automatically.",
            ),
      );
    }
    executedRef.current = false;
    if (!automaticRerunIsSafe) {
      setIndependenceConfirmed(relationshipAlreadyDeclared);
      const defaultDecision = assessment.recommendedMethod
        ? ({ kind: "accepted", selectedMethod: assessment.recommendedMethod } as const)
        : null;
      setRecommendationDecision(defaultDecision);
      recommendationDecisionRef.current = defaultDecision;
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
    assessment.request,
    executeRequest,
    locale,
    onAnalysisChange,
    relationshipAlreadyDeclared,
  ]);

  const run = async () => {
    if (
      !analysisAvailable ||
      !assessment.request ||
      !independenceConfirmed ||
      plannedComparisonsMissing
    )
      return;
    if (!recommendationDecision && assessment.recommendedMethod) {
      const decision = {
        kind: "accepted" as const,
        selectedMethod: assessment.recommendedMethod,
      };
      setRecommendationDecision(decision);
      recommendationDecisionRef.current = decision;
    }
    await executeRequest(assessment.request, "manual");
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
  const hasNonSignificantDifferenceResult =
    result?.status === "ok" &&
    result.tests.some((test) => (test.adjustedPValue ?? test.pValue) >= 0.05);
  const diagnosticItems =
    result?.status === "ok"
      ? [
          ...result.diagnostics.map((item) => ({ ...item, severity: "diagnostic" as const })),
          ...result.warnings.map((item) => ({ ...item, severity: "warning" as const })),
        ]
      : [];
  const hasImportantDiagnostic = diagnosticItems.some(
    (item) => item.severity === "warning" || /small|few|n_lt|n_less|underpowered/iu.test(item.code),
  );
  const humanMethodLabel = (method: string | null | undefined) =>
    (locale === "en" && method ? ENGLISH_METHOD_LABELS[method] : undefined) ??
    assessment.methodChoices?.find((choice) => choice.method === method)?.label ??
    (method === "pearson"
      ? t("Pearson相関", "Pearson correlation")
      : method === "spearman"
        ? t("Spearman順位相関", "Spearman rank correlation")
        : assessment.title.replace(/を推奨$/, ""));
  const recommendationTitle =
    locale === "en"
      ? humanMethodLabel(assessment.recommendedMethod ?? assessment.method)
      : assessment.title.replace(/を推奨$/, "");
  const equivalenceUnsupportedTitle = t(
    "同等性解析は現在未サポートです",
    "Equivalence analysis is currently unsupported",
  );
  const equivalenceUnsupportedReason = t(
    "この目的には、データを見る前に科学的に定めた許容差と、実験構造に対応したequivalence analysisが必要です。通常のANOVAやt検定でp > 0.05となっても、同等性や影響がないことを示したことにはなりません。入力データと記述的グラフは保持します。",
    "This objective requires a scientifically predefined margin and an equivalence analysis appropriate for the experimental structure. A standard ANOVA or t-test with p > 0.05 does not demonstrate equivalence or absence of an effect. Entered data and the descriptive Graph are retained.",
  );
  const equivalenceDesignReason: Readonly<Record<EquivalenceSupportKind, string>> = {
    continuous_independent: t(
      "独立2群の連続量については、Welch互換のTOST／信頼区間methodと検証用reference値がまだ未実装です。",
      "For two independent continuous groups, a Welch-compatible TOST/confidence-interval method and reviewed reference values are not yet implemented.",
    ),
    continuous_matched: t(
      "対応差に対するTOST／信頼区間methodと、不完全な対応組の扱いがまだ未実装です。",
      "TOST/confidence-interval analysis of paired differences and the incomplete-pair policy are not yet implemented.",
    ),
    continuous_shared_source: t(
      "同じ実験回・由来は対応測定とはみなしません。runを扱うblock modelと自由度の方針が未確定です。",
      "A shared run or source is not treated as pairing. The block model and degrees-of-freedom policy for run effects are not yet defined.",
    ),
    positive_total_independent: t(
      "陽性数／総数を保持したbinomial methodが必要です。割合だけを連続量としてTOSTへ渡しません。",
      "A binomial method retaining positive and total counts is required. Percentages will not be sent to continuous-outcome TOST.",
    ),
    positive_total_matched: t(
      "陽性数／総数と対応identityを同時に扱うbinomial methodが必要です。対応割合を連続量としてTOSTへ渡しません。",
      "A binomial method that retains both positive/total counts and matched identity is required. Paired percentages will not be sent to continuous-outcome TOST.",
    ),
    positive_total_shared_source: t(
      "陽性数／総数と実験回内の依存を同時に扱うmodelが必要です。割合を独立な連続量としてTOSTへ渡しません。",
      "A model retaining positive/total counts and within-run dependence is required. Percentages will not be treated as independent continuous values for TOST.",
    ),
    specialist_outcome: t(
      "この測定形式には、estimandと信頼区間を含む専用の同等性method contractがまだありません。",
      "This outcome shape does not yet have a dedicated equivalence-method contract covering its estimand and confidence interval.",
    ),
  };
  const recommendationReason =
    locale === "en"
      ? `The design contains ${assessment.nByCondition.length} ${matchedAnalysis ? "matched" : "independent"} conditions (${assessment.nByCondition.map(({ label, n }) => `${label}: n=${n}`).join(", ")}). The recommendation follows the declared experimental-unit relationship and comparison objective; multiplicity is handled when condition comparisons are requested.`
      : assessment.reason;
  const nonReadyTitle =
    locale === "ja"
      ? assessment.title
      : assessment.state === "descriptive"
        ? "This Graph is descriptive"
        : assessment.state === "insufficient"
          ? "More analyzable data are required"
          : "This analysis structure is not currently supported";
  const nonReadyReason =
    locale === "ja"
      ? assessment.reason
      : assessment.state === "descriptive"
        ? "The Graph can be shown, but no inferential analysis is attached to it."
        : assessment.state === "insufficient"
          ? "Review experimental units, conditions, matched IDs, and missing values in Data. Entered values are retained."
          : "No nearby analysis is substituted automatically. The declared design and entered values are retained.";
  const analysisSetSummary = assessment.matchedAnalysisSet
    ? t(
        `完全な対応組 ${assessment.matchedAnalysisSet.completePairCount}組を統計解析に使います。対応相手がそろわない観測 ${assessment.matchedAnalysisSet.unmatchedObservationCount}件は解析から除外します。`,
        `${assessment.matchedAnalysisSet.completePairCount} complete matched ${assessment.matchedAnalysisSet.completePairCount === 1 ? "pair" : "pairs"} will be used for statistical analysis. ${assessment.matchedAnalysisSet.unmatchedObservationCount} ${assessment.matchedAnalysisSet.unmatchedObservationCount === 1 ? "observation" : "observations"} without a complete match will be excluded from analysis.`,
      )
    : assessment.analysisSetSummary;
  const graphAnalysisSetDifference = assessment.matchedAnalysisSet
    ? assessment.matchedAnalysisSet.unmatchedObservationCount > 0
      ? t(
          "Graphには入力済みの観測を残します。統計解析だけが完全な対応組に限定されます。",
          "The Graph retains all entered observations. Only the statistical analysis is restricted to complete matched pairs.",
        )
      : t(
          "Graphと統計解析は、同じ完全な対応組を使用します。",
          "The Graph and statistical analysis use the same complete matched pairs.",
        )
    : assessment.graphAnalysisSetDifference;
  const externalLlmPrompt = createStatisticsConsultationPrompt({
    conditions: conditionOptions.map(({ label }) => label),
    methodTitle: equivalenceSelected ? equivalenceUnsupportedTitle : recommendationTitle,
    methodReason: equivalenceSelected ? equivalenceUnsupportedReason : recommendationReason,
    nByCondition: Object.fromEntries(assessment.nByCondition.map(({ label, n }) => [label, n])),
    missingCount: assessment.missingCount,
    notPlannedCount: assessment.notPlannedCount,
    relationship:
      matchedRelationship?.kind === "same_entity"
        ? t(
            `同じ${matchedRelationship.unitLabel}を条件間で測定`,
            `The same ${matchedRelationship.unitLabel} was measured across conditions`,
          )
        : matchedRelationship?.kind === "shared_source"
          ? t(
              `条件別${matchedRelationship.unitLabel}が同じ${matchedRelationship.sourceLabel}に由来`,
              `Condition-specific ${matchedRelationship.unitLabel}s came from the same ${matchedRelationship.sourceLabel}`,
            )
          : t("条件ごとに独立、または未確認", "Independent across conditions, or not confirmed"),
    selectedMethod: assessment.method,
  });

  return (
    <section
      className="experiment-graph-statistics-section"
      aria-label={t("このグラフの統計", "Statistics for this Graph")}
    >
      <div>
        <p className="experiment-graph-overline">
          {t("実データ確認後", "After reviewing the data")}
        </p>
        <h3>{t("このグラフの統計", "Statistics for this Graph")}</h3>
        <ContextualHelp
          label={t("この統計のHelp", "Help for these statistics")}
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
      </div>
      {assessment.state === "ready" ? (
        <fieldset className="experiment-graph-method-choices">
          <legend>{t("解析の目的", "Analysis goal")}</legend>
          <label>
            <input
              type="radio"
              name="scientific-comparison-goal"
              value="difference"
              checked={!equivalenceSelected}
              onChange={() => {
                setResult(null);
                onAnalysisChange?.(null);
                onComparisonGoalChange?.("difference");
              }}
            />
            <span>{t("差があるか調べる", "Detect a difference")}</span>
          </label>
          <label>
            <input
              type="radio"
              name="scientific-comparison-goal"
              value="equivalence"
              checked={equivalenceSelected}
              onChange={() => {
                setResult(null);
                onAnalysisChange?.(null);
                onComparisonGoalChange?.("equivalence");
              }}
            />
            <span>
              {t(
                "実質的に同等か調べる（現在未サポート）",
                "Test for equivalence / no meaningful difference (currently unsupported)",
              )}
            </span>
          </label>
        </fieldset>
      ) : null}
      <div className={`experiment-graph-recommendation is-${assessment.state}`}>
        {equivalenceSelected && assessment.state === "ready" ? (
          <>
            <strong>{equivalenceUnsupportedTitle}</strong>
            <p>{equivalenceUnsupportedReason}</p>
            <p role="note">{equivalenceDesignReason[equivalenceSupportKind]}</p>
            <p>
              {t(
                "Equivalence marginはBioFigureStatが観測データから自動生成しません。ここで事前計画を保存できますが、正式な解析は対応法の検証後にのみ実行可能になります。",
                "BioFigureStat will not derive an equivalence margin from the observed data. You can save the prespecified plan here, but formal analysis will remain unavailable until a supported method has been validated.",
              )}
            </p>
            <EquivalencePlanEditor
              plan={equivalencePlan}
              scale={equivalenceMarginScale}
              unit={equivalenceMarginUnit}
              comparisonCount={equivalenceComparisonCount}
              comparisonOptions={equivalenceComparisonOptions}
              onPlanChange={onEquivalencePlanChange}
            />
          </>
        ) : assessment.state === "ready" ? (
          <>
            <strong>
              {t("推奨", "Recommended")}: {recommendationTitle}
            </strong>
            <p>
              <strong>{t("理由", "Why")}:</strong> {recommendationReason}
            </p>
          </>
        ) : (
          <>
            <strong>{nonReadyTitle}</strong>
            <p>{nonReadyReason}</p>
          </>
        )}
        {analysisSetSummary ? (
          <div className="experiment-graph-analysis-set" role="status">
            <strong>{t("解析対象", "Analysis set")}:</strong> {analysisSetSummary}
            {graphAnalysisSetDifference ? <p>{graphAnalysisSetDifference}</p> : null}
          </div>
        ) : null}
        {assessment.missingCount > 0 ? (
          <p>
            {t(
              `表上の空欄または無効な値：${assessment.missingCount}件（条件ごとの件数差による空欄は、解析のnに数えません）`,
              `Blank or invalid table values: ${assessment.missingCount} (padding blanks caused by unequal group sizes are not counted in analysis n)`,
            )}
          </p>
        ) : null}
        {assessment.notPlannedCount > 0 ? (
          <p>
            {t(
              `測定予定なし（解析対象外）：${assessment.notPlannedCount}件`,
              `Not planned (excluded from analysis): ${assessment.notPlannedCount}`,
            )}
          </p>
        ) : null}
      </div>

      {assessment.inputDiagnostics?.map((diagnostic, diagnosticIndex) => {
        const visibleSets = diagnostic.incompleteMatchedSets.slice(
          0,
          MAX_VISIBLE_INCOMPLETE_MATCHED_SETS,
        );
        const remainingSetCount = diagnostic.incompleteMatchedSets.length - visibleSets.length;
        const diagnosticTitle = t(
          diagnostic.title,
          `${diagnostic.incompleteMatchedSets.length} matched ${diagnostic.incompleteMatchedSets.length === 1 ? "set is" : "sets are"} incomplete`,
        );
        const diagnosticMessage = t(
          diagnostic.message,
          "For each stable unit / pair ID, the conditions without an analyzed value are listed below. Only complete sets are used for matched analysis. Values and the declared matched design are retained; incomplete sets are not reinterpreted as independent groups.",
        );
        return (
          <details
            className="experiment-graph-confirmation-details"
            key={`${diagnostic.code}-${diagnosticIndex}`}
          >
            <summary>{diagnosticTitle}</summary>
            <p className="experiment-graph-help">{diagnosticMessage}</p>
            <ul
              aria-label={t(
                "stable unit / pair IDごとの不足条件",
                "Missing conditions by stable unit / pair ID",
              )}
            >
              {visibleSets.map((item) => (
                <li key={`${item.experimentId}-${item.pairId}`}>
                  <code>{item.pairId}</code>
                  {t(`（${item.experimentLabel}）：`, ` (${item.experimentLabel}): `)}
                  {missingConditionSummary(item.missingConditions, locale)}
                </li>
              ))}
            </ul>
            {remainingSetCount > 0 ? (
              <p className="experiment-graph-help">
                {t(
                  `ほか${remainingSetCount}組はデータ表で確認できます。`,
                  `${remainingSetCount} more ${remainingSetCount === 1 ? "set is" : "sets are"} available in the data table.`,
                )}
              </p>
            ) : null}
            {diagnostic.correction && onCorrectionRequested ? (
              <button type="button" onClick={() => onCorrectionRequested(diagnostic.correction!)}>
                {t(diagnostic.correction.actionLabel, "Review missing matched values in Data")}
              </button>
            ) : null}
          </details>
        );
      })}

      {assessment.correction ? (
        <div
          className="experiment-graph-help"
          role="group"
          aria-label={t("解析入力の修正", "Analysis input correction")}
        >
          {onCorrectionRequested ? (
            <button type="button" onClick={() => onCorrectionRequested(assessment.correction!)}>
              {t(assessment.correction.actionLabel, "Review the analysis input in Data")}
            </button>
          ) : null}
          {assessment.correction.suggestedMethod && onSelectedMethodChange ? (
            <button
              type="button"
              onClick={() => onSelectedMethodChange(assessment.correction!.suggestedMethod!)}
            >
              {t("Wilcoxonの代替案を選ぶ", "Select the Wilcoxon alternative")}
            </button>
          ) : null}
        </div>
      ) : null}

      {assessment.state === "ready" && !equivalenceSelected ? (
        <>
          {assessment.request?.protocolVersion === "0.2.0" ||
          assessment.request?.protocolVersion === "0.4.0" ? (
            <fieldset className="experiment-graph-method-choices">
              <legend>{t("何を比較しますか", "What do you want to compare?")}</legend>
              <label>
                <input
                  type="radio"
                  name="contrast-intent"
                  value="all_pairs"
                  checked={(contrastIntent ?? assessment.contrastIntent) === "all_pairs"}
                  onChange={() => onContrastIntentChange?.("all_pairs")}
                />
                <span>{t("すべての群を比較", "Compare all groups")}</span>
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
                <span>{t("各処置を対照群と比較", "Compare each treatment with the control")}</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="contrast-intent"
                  value="omnibus_only"
                  checked={(contrastIntent ?? assessment.contrastIntent) === "omnibus_only"}
                  onChange={() => onContrastIntentChange?.("omnibus_only")}
                />
                <span>{t("まず全体差のみを評価", "Evaluate only the overall difference")}</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="contrast-intent"
                  value="planned_comparisons"
                  checked={effectiveContrastIntent === "planned_comparisons"}
                  onChange={() => onContrastIntentChange?.("planned_comparisons")}
                />
                <span>
                  {t("事前に決めた条件ペアだけを比較", "Compare only prespecified condition pairs")}
                </span>
              </label>
            </fieldset>
          ) : null}
          {(assessment.request?.protocolVersion === "0.2.0" ||
            assessment.request?.protocolVersion === "0.4.0") &&
          effectiveContrastIntent === "planned_comparisons" ? (
            <fieldset className="experiment-graph-method-choices">
              <legend>{t("事前に決めた比較を選択", "Select prespecified comparisons")}</legend>
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
              <small>
                {t(
                  "ここで選んだペアだけを比較し、p値をHolm法で調整します。",
                  "Only the selected pairs are compared, with p values adjusted using Holm's method.",
                )}
              </small>
            </fieldset>
          ) : null}
          {correlationAnalysis ? (
            <label className="experiment-graph-field">
              <span>{t("相関の方法", "Correlation method")}</span>
              <select
                aria-label={t("相関の方法", "Correlation method")}
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
                <option value="pearson">
                  {t("Pearson（直線的な関係）", "Pearson (linear relationship)")}
                </option>
                <option value="spearman">
                  {t("Spearman（順位・単調な関係）", "Spearman (rank/monotonic relationship)")}
                </option>
              </select>
              <small>
                {t(
                  "どちらもローカルの検証済みエンジンで実行します。",
                  "Both methods run in the validated local engine.",
                )}
              </small>
            </label>
          ) : null}
          {!correlationAnalysis && assessment.methodChoices?.length ? (
            <div
              className="experiment-graph-method-levels"
              aria-label={t("統計解析法の選択", "Statistical method selection")}
            >
              {(["recommended", "alternative", "advanced"] as const).map((level) => {
                const choices = assessment.methodChoices?.filter(
                  (choice) => choice.level === level,
                );
                if (!choices?.length) return null;
                return (
                  <fieldset key={level} className="experiment-graph-method-choices">
                    <legend>
                      {level === "recommended"
                        ? t("推奨", "Recommended")
                        : level === "alternative"
                          ? t("代替案", "Alternatives")
                          : t("詳細設定", "Advanced")}
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
                          <strong>
                            {locale === "en"
                              ? (ENGLISH_METHOD_LABELS[choice.method] ?? choice.label)
                              : choice.label}
                          </strong>
                          <small>
                            {locale === "en"
                              ? t(
                                  choice.explanation,
                                  "This option is provided for the declared design. Review its assumptions before use.",
                                )
                              : choice.explanation}
                          </small>
                          {!choice.enabled && choice.unavailableReason ? (
                            <small>
                              {locale === "ja"
                                ? choice.unavailableReason
                                : "This option is unavailable for the current data and declared design."}
                            </small>
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
                {recommendationDecision
                  ? recommendationDecision.kind === "accepted"
                    ? t(
                        `推奨法を選択中：${humanMethodLabel(recommendationDecision.selectedMethod)}。別の方法を選ぶと、その選択を解析履歴へ記録します。`,
                        `Selected recommendation: ${humanMethodLabel(recommendationDecision.selectedMethod)}. Choosing another method records that decision in the analysis history.`,
                      )
                    : t(
                        `推奨とは異なる方法として${humanMethodLabel(recommendationDecision.selectedMethod)}を選択中です。この選択は解析履歴へ記録されます。`,
                        `Selected ${humanMethodLabel(recommendationDecision.selectedMethod)} instead of the recommendation. This decision will be recorded in the analysis history.`,
                      )
                  : t(
                      "選択中の解析法は実行時にprovenanceへ記録します。",
                      "The selected analysis method will be recorded in provenance when run.",
                    )}
              </p>
            </div>
          ) : null}
          {relationshipAlreadyDeclared ? (
            <p
              className="experiment-graph-confirmation is-declared"
              role="status"
              aria-label={t("実験構造の確認状況", "Experiment-structure confirmation")}
            >
              <strong>
                {t("実験の組み立てで回答済み", "Already declared in experiment setup")}:
              </strong>
              {matchedAnalysis
                ? sharedSourcePairing
                  ? t(
                      `同じ${sharedSourcePairing.sourceLabel}に由来する条件別${sharedSourcePairing.unitLabel}を共有IDで対応づけます。`,
                      `Condition-specific ${sharedSourcePairing.unitLabel} from the same ${sharedSourcePairing.sourceLabel} are matched by shared ID.`,
                    )
                  : t(
                      "同じ実験単位を条件間で対応づけます。",
                      "The same experimental units are matched across conditions.",
                    )
                : correlationAnalysis
                  ? t(
                      "同じ実験単位から得たXとYを1組として扱います。",
                      "X and Y from the same experimental unit are treated as one pair.",
                    )
                  : t(
                      "条件ごとに別々の実験単位を扱います。",
                      "Each condition uses separate experimental units.",
                    )}
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
                            : t(
                                "各条件は別々のdish・試料・動物などの実験単位です。同じ個体や同じ試料を両条件で測った対応データではありません。",
                                "Each condition uses separate experimental units such as dishes, specimens, or animals. This is not matched data measured from the same subject or specimen in both conditions.",
                              )
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
                          : t(
                              "条件間で実験単位が独立していることを確認しました。",
                              "I confirmed that experimental units are independent across conditions.",
                            )}
                </span>
              </label>
              <details className="experiment-graph-confirmation-details">
                <summary>{t("確認内容の詳細", "Confirmation details")}</summary>
                <p className="experiment-graph-help">
                  {independentNestedSourceContext
                    ? `各${independentNestedSourceContext.nestedObservationLabel}を独立nとして数えず、親${independentNestedSourceContext.unitLabel}ごとに集約します。同じrun/source preparationから条件別${independentNestedSourceContext.unitLabel}を分けた場合は、独立群として実行せず実験の組み立てで共有材料・実験回を登録してください。単に同日という理由ではpairにしません。`
                    : correlationAnalysis
                      ? "XとYは同じExpの安定IDで対応づけます。行順や日付の一致だけから組を作りません。"
                      : matchedAnalysis
                        ? sharedSourcePairing
                          ? `日付や行順から対応を推測していません。${sharedSourcePairing.sourceLabel}の共有IDで明示された完全な組だけを解析し、条件別${sharedSourcePairing.unitLabel}のIDは別々に保持します。`
                          : "日付の一致から対応を推測していません。実験設計で明示した対応と、完全な組だけを解析します。"
                        : t(
                            "同じ日に実施しただけでは、自動的に「対応あり」にはしません。同じ単位を両条件で測った場合は実行せず、設計を修正してください。",
                            "Measurements made on the same day are not automatically treated as matched. If the same units were measured in both conditions, do not run this analysis; correct the design first.",
                          )}
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
                    {t("共通材料・実験回を確認", "Review shared material or experimental run")}
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
            onClick={run}
          >
            {running
              ? t("ローカルで解析中…", "Running locally…")
              : t("選択した解析を実行", "Run selected analysis")}
          </button>
          {running && runningRequestId ? (
            <button type="button" onClick={() => void cancelLocalAnalysis(runningRequestId)}>
              {t("解析を中止", "Cancel analysis")}
            </button>
          ) : null}
          {!analysisAvailable ? (
            <p className="experiment-graph-help" role="note">
              {t(
                "このブラウザレビューでは解析エンジンを実行できません。デスクトップ版では利用できます。",
                "The analysis engine is unavailable in this browser preview. It is available in the desktop app.",
              )}
            </p>
          ) : null}
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
        <div
          className="experiment-graph-analysis-result"
          role="group"
          aria-label={t("統計解析結果", "Statistical analysis results")}
        >
          <div className="experiment-graph-analysis-summary">
            <strong>{t("解析完了（ローカル）", "Analysis complete (local)")}</strong>
            <p>
              {t("解析に用いた実験単位", "Experimental units used in analysis")}:
              {assessment.nDisplay ??
                assessment.nByCondition.map(({ label, n }) => `${label} n=${n}`).join("、")}
            </p>
          </div>
          {result.estimates.length > 0 ? (
            <dl aria-label={t("主要な推定値", "Primary estimates")}>
              {result.estimates.map((estimate) => (
                <div key={estimate.name}>
                  <dt>{estimateDisplayLabel(estimate.name, conditionOptions)}</dt>
                  <dd>
                    {t("推定値", "Estimate")} = {formatNumber(estimate.value)}
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
          <dl aria-label={t("主要な検定結果", "Primary test results")}>
            {primaryTests.map((test) => (
              <div key={test.name}>
                <dt>{t("全体／主解析", "Overall / primary analysis")}</dt>
                <dd>
                  {test.statisticName} = {formatNumber(test.statistic)}、p ={" "}
                  {formatP(test.adjustedPValue ?? test.pValue)}
                  {test.adjustedPValue !== null
                    ? t("（多重比較調整済み）", " (multiplicity-adjusted)")
                    : ""}
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
              <summary>
                {t(
                  `条件間比較（${comparisonRows.length}件）`,
                  `Condition comparisons (${comparisonRows.length})`,
                )}
              </summary>
              <div className="data-table-scroll">
                <table
                  className="data-table"
                  aria-label={t("条件間比較の結果", "Condition-comparison results")}
                >
                  <thead>
                    <tr>
                      <th scope="col">{t("比較", "Comparison")}</th>
                      <th scope="col">{t("検定統計量・自由度", "Test statistic and df")}</th>
                      <th scope="col">{t("p値", "p value")}</th>
                      <th scope="col">{t("調整済みp値", "Adjusted p value")}</th>
                      <th scope="col">{t("効果量", "Effect size")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map(({ test, label, index }) => (
                      <tr key={`${test.name}-${index}`}>
                        <th scope="row">{label}</th>
                        <td>
                          {test.statisticName} = {formatNumber(test.statistic)}
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
          {hasNonSignificantDifferenceResult ? (
            <p className="experiment-graph-help" role="note">
              {t(
                "統計学的有意差は検出されませんでした。この結果だけでは、条件が同等であることや影響がないことを示したことにはなりません。",
                "No statistically significant difference was detected. This result does not demonstrate equivalence or absence of an effect.",
              )}
            </p>
          ) : null}
          {diagnosticItems.length > 0 ? (
            <details
              className={`experiment-graph-analysis-diagnostics${
                hasImportantDiagnostic ? " is-important" : ""
              }`}
              open
            >
              <summary>
                {locale === "ja"
                  ? `${hasImportantDiagnostic ? "重要な注意" : "診断と注意"}（${diagnosticItems.length}件）`
                  : `${hasImportantDiagnostic ? "Important warnings" : "Diagnostics and notes"} (${diagnosticItems.length})`}
              </summary>
              {diagnosticItems.map((item) => (
                <p data-severity={item.severity} key={`${item.code}-${item.message}`}>
                  {diagnosticLabel(item.code, matchedRelationship, locale)}
                </p>
              ))}
            </details>
          ) : null}
          <details>
            <summary>{t("解析エンジンと再現情報", "Analysis engine and reproducibility")}</summary>
            <dl>
              <div>
                <dt>{t("検定・モデル", "Test or model")}</dt>
                <dd>{humanMethodLabel(assessment.method)}</dd>
              </div>
              <div>
                <dt>{t("エンジン", "Engine")}</dt>
                <dd>
                  {result.engine.name} {result.engine.version}
                </dd>
              </div>
              {Object.entries(result.engine.packages).map(([name, version]) => (
                <div key={name}>
                  <dt>{t("統計ライブラリ", "Statistical library")}</dt>
                  <dd>
                    {name} {version}
                  </dd>
                </div>
              ))}
              <div>
                <dt>{t("アプリケーション", "Application")}</dt>
                <dd>
                  {PRODUCT_IDENTITY.developmentName} {PRODUCT_IDENTITY.version}
                </dd>
              </div>
              <div>
                <dt>{t("多重性の調整", "Multiplicity adjustment")}</dt>
                <dd>{assessment.request?.options.multiplicityMethod ?? t("なし", "None")}</dd>
              </div>
              <div>
                <dt>{t("実行リクエスト", "Execution request")}</dt>
                <dd>
                  {assessment.request?.templateId} / {assessment.request?.templateVersion}
                </dd>
              </div>
            </dl>
          </details>
          <p>
            {t(
              "プロジェクト保存時に、使用データと解析条件を再現可能な解析履歴として保存します。",
              "When the project is saved, the data used and analysis settings are stored as reproducible analysis history.",
            )}
          </p>
          {methodsText ? (
            <details>
              <summary>{t("Methodsと再現記録", "Methods and reproducibility record")}</summary>
              <pre className="experiment-graph-methods-text">{methodsText}</pre>
              <button
                type="button"
                onClick={async () => {
                  const copied = await copyMethodsText(methodsText);
                  setMethodsCopyStatus(
                    copied
                      ? t("Methodsをコピーしました。", "Methods copied.")
                      : t("コピーできませんでした。", "Could not copy Methods."),
                  );
                }}
              >
                {t("Methodsをコピー", "Copy Methods")}
              </button>
              {methodsCopyStatus ? <p role="status">{methodsCopyStatus}</p> : null}
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
