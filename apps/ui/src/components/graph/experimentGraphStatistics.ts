import {
  requireAnalysisRequestRecommendation,
  type AnalysisRecommendation,
} from "@lsaa/analysis-contracts";

import {
  sharedSourceConditionTopology,
  type ExperimentSetDraft,
  type TimeAnalysisPlan,
} from "../../app/experimentDraft";
import type { ContrastIntent } from "../../app/experimentDraftAnalysis";
import { nestedIndependentSourceContext } from "../../app/draftAnalysisDiagnostics";
import {
  createExperimentWorkspaceDesign,
  type WorkspaceGraphAnalysis,
  type WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";
import { generateMethodsText } from "../../app/methodsText";
import { timeMetricLabel } from "./experimentGraphAnnotations";

type GraphAppearance = WorkspaceGraphState["appearance"];
type AxisSettings = WorkspaceGraphState["axes"];
type GraphType = WorkspaceGraphState["graphType"];
type LayerState = WorkspaceGraphState["layers"];

export function createGraphStatisticsRelationshipContext(
  draft: ExperimentSetDraft,
  readoutId: string,
) {
  const sharedSourceTopology = sharedSourceConditionTopology(draft);
  const independentNestedSource = nestedIndependentSourceContext({ draft, readoutId });
  const matchedRelationship =
    draft.conditionAssignment.kind !== "matched"
      ? undefined
      : sharedSourceTopology
        ? {
            kind: "shared_source" as const,
            unitLabel: draft.conditionAssignment.unitLabel,
            sourceLabel: sharedSourceTopology.sourceUnitLabel,
          }
        : {
            kind: "same_entity" as const,
            unitLabel: draft.conditionAssignment.unitLabel,
          };
  return {
    sharedSourceTopology,
    independentNestedSource,
    matchedRelationship,
    relationshipAlreadyDeclared:
      (Boolean(draft.adaptiveInput) || draft.entryRoute === "simple_independent_groups") &&
      !independentNestedSource,
  };
}

export function createGraphAnalysisContextKey(
  input: Readonly<{
    draft: ExperimentSetDraft;
    readoutId: string;
    sourceMode: WorkspaceGraphState["sourceMode"];
    conditionIds: readonly string[];
    displayedTimePointIds: readonly string[];
    analysisTimePointId: string | null;
    plannedContrastConditionIds: readonly (readonly [string, string])[];
    timeAnalysis: TimeAnalysisPlan;
  }>,
): string {
  return JSON.stringify({
    readoutId: input.readoutId,
    sourceMode: input.sourceMode,
    conditionIds: input.conditionIds,
    displayedTimePointIds: input.displayedTimePointIds,
    analysisTimePointId: input.analysisTimePointId,
    plannedContrastConditionIds: input.plannedContrastConditionIds,
    timeAnalysis: input.timeAnalysis,
    stableUnits: input.draft.experiments.map(({ id, sessionId, stableUnitId }) => ({
      id,
      sessionId: sessionId ?? id,
      stableUnitId: stableUnitId ?? id,
    })),
  });
}

export function varyingGraphAnalysisAttributes(
  draft: ExperimentSetDraft,
  conditionIds: readonly string[],
): ExperimentSetDraft["attributes"] {
  const selected = new Set(conditionIds);
  const conditions = draft.conditions.filter(({ id }) => selected.has(id));
  return draft.attributes.filter(
    (attribute) =>
      new Set(
        conditions.map((condition) => condition.attributes[attribute.id]?.trim()).filter(Boolean),
      ).size > 1,
  );
}

export function statisticalMethodForContrastIntent(
  intent: ContrastIntent,
): AnalysisRecommendation["recommendedMethod"] {
  if (intent === "all_pairs") return "welch_anova";
  if (intent === "omnibus_only") return "kruskal_wallis";
  return "one_way_anova";
}

export function createExperimentGraphMethodsText(
  input: Readonly<{
    analysis: WorkspaceGraphAnalysis | null;
    draft: ExperimentSetDraft;
    selectedReadoutId: string;
    layers: LayerState;
    appearance: GraphAppearance;
    axes: AxisSettings;
    graphType: GraphType;
    timeAnalysis: TimeAnalysisPlan;
  }>,
): string | null {
  const { analysis, draft, selectedReadoutId, layers, appearance, axes, graphType, timeAnalysis } =
    input;
  if (!analysis || analysis.result.status !== "ok") return null;

  const design = createExperimentWorkspaceDesign(draft, analysis.result.completedAt);
  const canonicalRecommendation =
    analysis.request.protocolVersion === "0.15.0" || analysis.request.protocolVersion === "0.16.0"
      ? analysis.recommendation
      : requireAnalysisRequestRecommendation(design, analysis.request, {
          outcomeId: selectedReadoutId,
        });
  if (!canonicalRecommendation) return null;
  const recommendation = {
    ...canonicalRecommendation,
    ...(analysis.recommendation?.decision ? { decision: analysis.recommendation.decision } : {}),
  };
  const base = generateMethodsText({
    design,
    recommendation,
    request: analysis.request,
    result: analysis.result,
    graphSpec: null,
    graphErrorBar: layers.errorBar ? appearance.errorBar : "none",
    outcomeId: selectedReadoutId,
    repeatedAxis: {
      semantic: axes.xSemantic,
      title: axes.xTitle,
      unit: axes.xUnit,
    },
  });
  const graphMetadata = [
    graphType === "box"
      ? `Box whiskers: ${(appearance.boxWhiskerMode ?? "tukey_1_5_iqr") === "min_max" ? "minimum–maximum" : "Tukey 1.5×IQR"}.`
      : null,
    graphType === "line" && (appearance.uncertaintyStyle ?? "error_bars") === "ribbon"
      ? `Time-course ribbon: ${appearance.errorBar.toUpperCase()}, opacity ${appearance.ribbonOpacity ?? 0.18}. The band is clipped to the measured X domain.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  if (timeAnalysis.kind === "selected_timepoint" || timeAnalysis.kind === "full_time_course") {
    return graphMetadata ? `${base}\n${graphMetadata}` : base;
  }
  const window = `${timeAnalysis.windowStart ?? "最初"}～${timeAnalysis.windowEnd ?? "最後"} ${draft.time.unit}`;
  const baseline =
    timeAnalysis.kind === "change_from_baseline" || timeAnalysis.kind === "f_over_f0"
      ? `。baseline=${timeAnalysis.baselineTime ?? "最初の時点"} ${draft.time.unit}`
      : "";
  return `${base}\n時系列の派生値：${timeMetricLabel(timeAnalysis)}。解析window=${window}${baseline}。raw時系列と変換設定はプロジェクトに保持。${graphMetadata ? ` ${graphMetadata}` : ""}`;
}
