import type { AnalysisEngineRequest, AnalysisEngineResult } from "@lsaa/analysis-contracts";
import type { ExperimentSetDraft, TimeAnalysisPlan } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

type AxisSettings = WorkspaceGraphState["axes"];
type StatisticsAnnotationEntry = NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number];

export function timeMetricLabel(plan: TimeAnalysisPlan): string {
  if (plan.kind === "full_time_course") return "条件×時間の全体モデル";
  if (plan.kind === "endpoint") return "最後の時点（endpoint）";
  if (plan.kind === "maximum") return "最大値";
  if (plan.kind === "minimum") return "最小値";
  if (plan.kind === "auc") return "AUC（台形法）";
  if (plan.kind === "change_from_baseline") return "baselineからの変化量";
  if (plan.kind === "f_over_f0") return "F/F0";
  return "選んだ時点の値";
}

function methodShortLabel(method: AnalysisEngineRequest["method"]): string {
  const labels: Partial<Record<AnalysisEngineRequest["method"], string>> = {
    welch_t: "Welch t",
    student_t: "Student t",
    paired_t: "paired t",
    mann_whitney: "Mann–Whitney",
    wilcoxon_signed_rank: "Wilcoxon signed-rank",
    welch_anova: "Welch ANOVA",
    one_way_anova: "one-way ANOVA",
    kruskal_wallis: "Kruskal–Wallis",
    repeated_measures_anova: "repeated-measures ANOVA",
    two_way_anova: "two-way ANOVA",
    mixed_anova: "mixed ANOVA",
    pearson: "Pearson",
    spearman: "Spearman",
  };
  return labels[method] ?? method;
}

export function repeatedAxisAnnotationLabel(input: Pick<AxisSettings, "xSemantic" | "xTitle">) {
  if (input.xSemantic === "numeric_covariate") {
    return input.xTitle.trim() || "numeric covariate";
  }
  if (input.xSemantic === "categorical") {
    return input.xTitle.trim() || "repeated axis";
  }
  return input.xTitle.trim() || "time";
}

export function graphAnnotationContext(input: {
  request: AnalysisEngineRequest;
  timeAnalysis: TimeAnalysisPlan;
  analysisTimePointId: string | null;
  draft: ExperimentSetDraft;
  axes: AxisSettings;
}): string {
  const { request, timeAnalysis, draft, axes } = input;
  if (request.protocolVersion === "0.6.0") {
    const repeatedAxis = repeatedAxisAnnotationLabel(axes);
    return `condition × ${repeatedAxis} interaction · mixed ANOVA`;
  }
  if (request.protocolVersion === "0.7.0") {
    const repeatedAxis = repeatedAxisAnnotationLabel(axes);
    return `condition × ${repeatedAxis} interaction · independent two-way ANOVA`;
  }
  const method = methodShortLabel(request.method);
  const unit = axes.xUnit.trim() || draft.time.unit;
  if (timeAnalysis.kind === "selected_timepoint") {
    const point = draft.time.points.find(({ id }) => id === input.analysisTimePointId);
    return point ? `${point.value} ${unit} · ${method}` : method;
  }
  const start = timeAnalysis.windowStart ?? draft.time.points[0]?.value ?? "first";
  const end = timeAnalysis.windowEnd ?? draft.time.points.at(-1)?.value ?? "last";
  if (timeAnalysis.kind === "endpoint") return `${end} ${unit} endpoint · ${method}`;
  if (timeAnalysis.kind === "auc") return `${start}–${end} ${unit} AUC · ${method}`;
  if (timeAnalysis.kind === "change_from_baseline")
    return `${start}–${end} ${unit} change from baseline · ${method}`;
  if (timeAnalysis.kind === "f_over_f0") return `${start}–${end} ${unit} F/F0 · ${method}`;
  return `per-unit ${timeAnalysis.kind} · ${method}`;
}

export function analysisTestAnnotationLabel(
  test: AnalysisEngineResult["tests"][number],
  draft: ExperimentSetDraft,
  fallback: string,
): string {
  const [family, firstId, secondId] = test.name.split(":");
  const conditionLabel = (conditionId: string | undefined) =>
    draft.conditions.find(({ id }) => id === conditionId)?.label ?? conditionId ?? "condition";
  const factorA = draft.attributes[0]?.label ?? "factor A";
  const factorB = draft.attributes[1]?.label ?? "factor B";
  const mixedAxisMatch = /^condition × (.+) interaction · mixed ANOVA$/.exec(fallback);
  const mixedAxis = mixedAxisMatch?.[1] ?? "repeated axis";
  if (
    test.name === "condition_by_time_interaction" ||
    test.name === "condition_by_within_factor_interaction"
  ) {
    return `condition × ${mixedAxis} interaction · mixed ANOVA`;
  }
  if (test.name === "condition_between_units" || test.name === "condition_main_effect") {
    return "condition main effect · mixed ANOVA";
  }
  if (test.name === "time_within_units" || test.name === "within_factor_main_effect") {
    return `${mixedAxis} main effect · mixed ANOVA`;
  }
  if (test.name === "type3_interaction") {
    return `${factorA} × ${factorB} interaction · two-way ANOVA`;
  }
  if (test.name === "type3_factor_a") return `${factorA} main effect · two-way ANOVA`;
  if (test.name === "type3_factor_b") return `${factorB} main effect · two-way ANOVA`;
  if (
    firstId &&
    secondId &&
    [
      "games_howell",
      "tukey_hsd",
      "planned_holm",
      "dunn_holm",
      "holm_welch",
      "holm_paired",
      "holm_wilcoxon",
    ].includes(family)
  ) {
    const method =
      family === "games_howell"
        ? "Games–Howell"
        : family === "tukey_hsd"
          ? "Tukey"
          : family === "dunn_holm"
            ? "Dunn–Holm"
            : family === "holm_welch"
              ? "Welch pair · Holm"
              : family === "holm_paired"
                ? "paired t · Holm"
                : family === "holm_wilcoxon"
                  ? "Wilcoxon · Holm"
                  : "planned comparison · Holm";
    return `${conditionLabel(firstId)} vs ${conditionLabel(secondId)} · ${method}`;
  }
  if (family === "dunnett" && firstId && secondId) {
    return `${conditionLabel(secondId)} vs ${conditionLabel(firstId)} · Dunnett`;
  }
  const twoGroupMethods: Readonly<Record<string, string>> = {
    welch_two_sample_t_test: "Welch t",
    student_two_sample_t_test: "Student t",
    mann_whitney_u_test: "Mann–Whitney",
    paired_t_test: "paired t",
    wilcoxon_signed_rank_test: "Wilcoxon signed-rank",
  };
  const twoGroupMethod = twoGroupMethods[test.name];
  if (twoGroupMethod && draft.conditions.length === 2) {
    return `${draft.conditions[0]!.label} vs ${draft.conditions[1]!.label} · ${twoGroupMethod}`;
  }
  return fallback;
}

export function isPairwiseComparisonTest(testName: string): boolean {
  return /^(games_howell|tukey_hsd|dunnett|planned_holm|dunn_holm|holm_welch|holm_paired|holm_wilcoxon):/.test(
    testName,
  );
}

export function createAdjustedComparisonAnnotation(
  input: Readonly<{
    test: AnalysisEngineResult["tests"][number];
    testIndex: number;
    requestId: string;
    sourceMode: "raw_readout" | "derived_metric";
    timeAnalysis: TimeAnalysisPlan;
    analysisTimePointId: string | null;
  }>,
): StatisticsAnnotationEntry | null {
  if (input.test.adjustedPValue === null || !isPairwiseComparisonTest(input.test.name)) return null;
  const [, firstConditionId, secondConditionId] = input.test.name.split(":");
  if (!firstConditionId || !secondConditionId) return null;
  return {
    id: `annotation.${input.testIndex}`,
    analysisId: input.requestId,
    comparisonId: input.test.name,
    testIndex: input.testIndex,
    mode: "exact_p",
    showNonSignificant: true,
    presentation: "bracket",
    endpoints: [{ conditionId: firstConditionId }, { conditionId: secondConditionId }],
    pValueStatus: "adjusted",
    lineage: {
      ...(input.sourceMode === "derived_metric" ? { derivedMetric: input.timeAnalysis.kind } : {}),
      ...(input.analysisTimePointId ? { timePointId: input.analysisTimePointId } : {}),
      ...(input.timeAnalysis.kind !== "selected_timepoint"
        ? {
            endpoint: input.timeAnalysis.kind,
            ...(input.timeAnalysis.windowStart === undefined
              ? {}
              : { windowStart: input.timeAnalysis.windowStart }),
            ...(input.timeAnalysis.windowEnd === undefined
              ? {}
              : { windowEnd: input.timeAnalysis.windowEnd }),
          }
        : {}),
    },
  };
}
