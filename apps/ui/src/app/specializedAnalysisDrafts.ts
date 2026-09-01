import type { HeatmapTransform } from "@lsaa/graph-spec";
import type { EntryModuleFacts, SubjectUnitRelationship } from "@lsaa/adaptive-input";

import type { NonlinearModelId, NonlinearParameterId } from "./nonlinearModelRegistry";
import type { MichaelisReadoutMeaning } from "./orderedCurveAnalysisReadiness";
import type { DedicatedEntryIntent } from "./dedicatedEntryIntent";

export type FitSettingDraft = Readonly<{
  initial: string;
  lower: string;
  upper: string;
}>;

export type CommonCoverageDraft = Readonly<{
  text: string;
  contingencyMethod: "fisher_exact" | "pearson_chi_square" | "mcnemar_exact";
  display: "count" | "fraction" | "stacked";
  includeIntercept: boolean;
  xLabel: string;
  yLabel: string;
  xUnit: string;
  yUnit: string;
  xScale: "linear" | "log10";
  yScale: "linear" | "log10";
  showBand: boolean;
  distributionType: "histogram" | "ecdf";
  binCount: string;
  nonlinearModel: NonlinearModelId;
  nonlinearModelExplicitlySelected?: boolean;
  michaelisReadoutMeaning?: MichaelisReadoutMeaning;
  modelRationale: string;
  fitSettings: Readonly<Record<NonlinearParameterId, FitSettingDraft>>;
  entryModuleFacts?: EntryModuleFacts;
  /** Scopes an experiment-first draft so another entry cannot inherit its raw data or answers. */
  entryIntent?: DedicatedEntryIntent;
}>;

export type SpecializedCoreDraft = Readonly<{
  text: string;
  transform: HeatmapTransform;
  rangeMin: string;
  rangeMax: string;
  missingColor: string;
  showCellValues: boolean;
  showLogRankAnnotation: boolean;
  statisticsSetupExpanded?: boolean;
  subjectUnitRelationship?: SubjectUnitRelationship;
  followUpUnit?: string;
  numericStatusMapping?: "event_is_1" | "event_is_0" | null;
  graphTitle?: string;
  survivalXAxisLabel?: string;
  survivalYAxisLabel?: string;
  survivalPalette?: readonly string[];
  survivalFontSize?: number;
  /** Preserves unsupported/deferred module facts when the researcher revisits this route. */
  entryIntent?: DedicatedEntryIntent;
}>;

export type SpecializedDraftByRoute = Readonly<{
  survival: SpecializedCoreDraft;
  heatmap: SpecializedCoreDraft;
  contingency: CommonCoverageDraft;
  "repeated-nonparametric": CommonCoverageDraft;
  regression: CommonCoverageDraft;
  "nonlinear-fit": CommonCoverageDraft;
  distribution: CommonCoverageDraft;
}>;

export type SpecializedAnalysisRoute = keyof SpecializedDraftByRoute;

export type SpecializedDraftStore = Partial<{
  [Route in SpecializedAnalysisRoute]: SpecializedDraftByRoute[Route];
}>;

/**
 * Route-local drafts are retained for recovery, but may only be reattached to
 * the same experiment-first entry. A legacy/direct visit must not inherit an
 * adaptive draft, and a new entry from another context must start clean.
 */
export function scopedSpecializedDraft<T extends object>(
  draft: T | undefined,
  intent: DedicatedEntryIntent | undefined,
): T | undefined {
  if (!draft) return undefined;
  const previousIntent =
    "entryIntent" in draft
      ? (draft as Readonly<{ entryIntent?: DedicatedEntryIntent }>).entryIntent
      : undefined;
  if (!intent) return previousIntent ? undefined : draft;
  if (!previousIntent) return undefined;
  return previousIntent.moduleId === intent.moduleId &&
    previousIntent.destination === intent.destination &&
    previousIntent.sourceContext === intent.sourceContext &&
    previousIntent.entryRouteId === intent.entryRouteId
    ? draft
    : undefined;
}
