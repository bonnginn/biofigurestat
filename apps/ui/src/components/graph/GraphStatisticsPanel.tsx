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

import {
  AnalysisClientError,
  cancelLocalAnalysis,
  type AnalysisRunner,
} from "../../app/analysisClient";
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
import { canSafelyAutomaticallyRerun } from "../../app/analysisRequestFingerprint";
import { recordBenchmarkEvent } from "../../app/benchmarkEvaluation";
import { diagnosticFingerprint, recordDiagnosticEvent } from "../../app/diagnostics";
import { researcherError } from "../../app/errorCatalog";
import { analysisRequestStructuralFingerprint } from "../../app/analysisRequestFingerprint";
import { ContextualHelp } from "../ContextualHelp";
import { routeFromPath } from "../../app/routes";
import { recordUsageMilestone } from "../../app/usageTelemetry";
import { createStatisticsConsultationPrompt } from "../../app/externalLlmConsultation";
import { ExternalLlmConsultation } from "../ExternalLlmConsultation";
import { localizedText, useAppLocale, type AppLocale } from "../../app/appLocale";
import { EquivalencePlanEditor } from "./EquivalencePlanEditor";
import { GraphStatisticsResultPanel } from "./GraphStatisticsResultPanel";
import { createIndependentContinuousEquivalenceRequest } from "./independentContinuousEquivalenceRequest";
import { createPairedContinuousEquivalenceRequest } from "./pairedContinuousEquivalenceRequest";
import type { EquivalenceSupportKind } from "./equivalenceSupportPresentation";
import {
  ENGLISH_METHOD_LABELS,
  type MatchedRelationship,
  type StatisticsConditionOption,
} from "./graphStatisticsPresentation";

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
  conditionOptions?: readonly StatisticsConditionOption[];
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
  const equivalenceRequest =
    equivalenceComparisonOptions.length !== 1
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
          : null;
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
        const isEquivalenceRequest =
          request.protocolVersion === "0.15.0" || request.protocolVersion === "0.16.0";
        const coreRecommendationOwned =
          !isEquivalenceRequest &&
          (CORE_WORKSPACE_RECOMMENDATION_TEMPLATES as readonly string[]).includes(
            request.templateId,
          );
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
              request.protocolVersion === "0.15.0" || request.protocolVersion === "0.16.0"
                ? `${request.comparisonId}:${request.contrastConditionIds.join("|")}`
                : request.protocolVersion === "0.2.0"
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
          reason instanceof AnalysisClientError && locale === "ja"
            ? `${researcherMessage.title}（${researcherMessage.code}）。${reason.message}`
            : `${researcherMessage.title}${localizedText(locale, `（${researcherMessage.code}）。`, ` (${researcherMessage.code}). `)}${researcherMessage.nextAction}`,
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
    const request = equivalenceSelected ? equivalenceRequest : assessment.request;
    if (
      !analysisAvailable ||
      !request ||
      !independenceConfirmed ||
      (!equivalenceSelected && plannedComparisonsMissing)
    )
      return;
    if (!equivalenceSelected && !recommendationDecision && assessment.recommendedMethod) {
      const decision = {
        kind: "accepted" as const,
        selectedMethod: assessment.recommendedMethod,
      };
      setRecommendationDecision(decision);
      recommendationDecisionRef.current = decision;
    }
    await executeRequest(request, "manual");
  };
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
  const equivalenceExecutable = equivalenceRequest !== null;
  const equivalenceUnsupportedTitle = equivalenceExecutable
    ? equivalenceSupportKind === "continuous_matched"
      ? t("対応のあるTOSTによる同等性解析", "Equivalence analysis using paired TOST")
      : t("Welch TOSTによる同等性解析", "Equivalence analysis using Welch TOST")
    : t("この同等性解析は現在未サポートです", "This equivalence analysis is currently unsupported");
  const equivalenceUnsupportedReason = t(
    "この目的には、データを見る前に科学的に定めた許容差と、実験構造に対応したequivalence analysisが必要です。通常のANOVAやt検定でp > 0.05となっても、同等性や影響がないことを示したことにはなりません。入力データと記述的グラフは保持します。",
    "This objective requires a scientifically predefined margin and an equivalence analysis appropriate for the experimental structure. A standard ANOVA or t-test with p > 0.05 does not demonstrate equivalence or absence of an effect. Entered data and the descriptive Graph are retained.",
  );
  const equivalenceDesignReason: Readonly<Record<EquivalenceSupportKind, string>> = {
    continuous_independent: equivalenceExecutable
      ? t(
          "独立2群の平均差を、事前指定したraw difference marginに対する2つの片側検定と90%信頼区間で評価します。等分散は仮定しません。",
          "The mean difference between two independent groups is evaluated using two one-sided tests and a 90% confidence interval against the prespecified raw-difference margin. Equal variances are not assumed.",
        )
      : t(
          "独立2群の連続量では実行できます。raw differenceの上下限を指定し、事前指定の確認を完了してください。",
          "This route is executable for two independent continuous groups. Enter lower and upper raw-difference bounds and confirm that they were prespecified.",
        ),
    continuous_matched: equivalenceExecutable
      ? t(
          "完全な対応組について、第2条件−第1条件の対応差を事前指定したraw difference marginに対する2つの片側検定と90%信頼区間で評価します。不完全な組はDataとGraphに残し、解析から除外したIDを結果に明示します。",
          "For complete pairs, second-condition minus first-condition differences are evaluated using two one-sided tests and a 90% confidence interval against the prespecified raw-difference margin. Incomplete pairs remain in Data and Graph, and their excluded IDs are reported.",
        )
      : t(
          "対応のある2条件の連続量では実行できます。raw differenceの上下限を指定し、事前指定の確認を完了してください。",
          "This route is executable for two matched continuous conditions. Enter lower and upper raw-difference bounds and confirm that they were prespecified.",
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
              {t("実質的に同等か調べる", "Test for equivalence / no meaningful difference")}
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
                equivalenceSupportKind === "continuous_independent" ||
                  equivalenceSupportKind === "continuous_matched"
                  ? `Equivalence marginはBioFigureStatが観測データから自動生成しません。単一主比較の事前計画を完成すると、検証済み${equivalenceSupportKind === "continuous_matched" ? "対応のあるTOST" : "Welch TOST"}を実行できます。`
                  : "Equivalence marginはBioFigureStatが観測データから自動生成しません。ここで事前計画を保存できますが、この実験構造では正式な解析を実行しません。",
                equivalenceSupportKind === "continuous_independent" ||
                  equivalenceSupportKind === "continuous_matched"
                  ? `BioFigureStat will not derive an equivalence margin from the observed data. Completing the single-primary-comparison plan enables the validated ${equivalenceSupportKind === "continuous_matched" ? "paired TOST" : "Welch TOST"}.`
                  : "BioFigureStat will not derive an equivalence margin from the observed data. You can save the prespecified plan here, but formal analysis is not run for this experimental structure.",
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
        <GraphStatisticsResultPanel
          assessment={assessment}
          conditionOptions={conditionOptions}
          equivalenceComparisonOptions={equivalenceComparisonOptions}
          executedRequest={lastExecutedRequestRef.current}
          humanMethodLabel={humanMethodLabel}
          matchedRelationship={matchedRelationship}
          methodsText={methodsText}
          result={result}
        />
      ) : null}
    </section>
  );
}
