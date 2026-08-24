import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, RefObject } from "react";
import type {
  AnalysisEngineRequest,
  AnalysisEngineResult,
  AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import { defaultAnalysisRunner, type AnalysisRunner } from "../../app/analysisClient";

import {
  categoricalPercentage,
  categoricalTotal,
  continuousSummary,
  cellIsNotPlanned,
  experimentCellKey,
  normalizeWithinExperiment,
  orderedAxisSemantic,
  orderedAxisTitle,
  orderedAxisUnit,
  percentage,
  wbRatio,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type NestedContinuousCellDraft,
  type ProportionCellDraft,
  type ReadoutDraft,
  type TimeAnalysisPlan,
} from "../../app/experimentDraft";
import {
  assessDraftGraphAnalysis,
  deriveTimeMetricValue,
  isDerivedTimeMetric,
  type ContrastIntent,
} from "../../app/experimentDraftAnalysis";
import { defaultGraphYTitle, defaultLayersForGraphType } from "../../app/graphDefaults";
import {
  createExperimentWorkspaceDesign,
  createWorkspaceRecommendation,
  type WorkspaceGraphAnalysis,
  type WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";
import {
  copyGraphToClipboard,
  downloadTextFile,
  serializeGraphSvg,
  svgToPngBlob,
} from "../../app/graphExport";
import { generateMethodsText } from "../../app/methodsText";
import { formatExactPValue } from "../../app/statisticalFormat";
import {
  beginDefaultGraphCapture,
  blobToBase64,
  COMPLETE_BENCHMARK_ARTIFACT_NAMES,
  completeDefaultGraphCapture,
  currentBenchmarkRun,
  recordFinalGraphCapture,
  recordBenchmarkEvent,
  setBenchmarkOutcome,
  sha256Hex,
  useBenchmarkRun,
  writeBenchmarkArtifacts,
} from "../../app/benchmarkEvaluation";
import {
  diagnosticFingerprint,
  recordDiagnosticError,
  recordDiagnosticEvent,
} from "../../app/diagnostics";
import { PRODUCT_IDENTITY } from "../../app/productIdentity";
import { evaluationModeIsConfigured, evaluationMode } from "../../app/evaluationMode";
import { GraphStatisticsPanel } from "./GraphStatisticsPanel";
import { createCategoryLayout, createNiceTicks } from "./graphLayout";

import "./graph-workbench.css";

type LayerState = WorkspaceGraphState["layers"];

type ErrorBarMode = "sd" | "sem" | "none";
type PaletteMode = GraphAppearance["palette"];
type InspectorTarget =
  | "background"
  | "x-axis"
  | "y-axis"
  | "data"
  | "raw-dots"
  | "experiment-summary"
  | "violin"
  | "box"
  | "error-bar"
  | "connecting-line"
  | "legend"
  | "annotation"
  | "statistics";
type GraphAppearance = WorkspaceGraphState["appearance"];
type AxisSettings = WorkspaceGraphState["axes"];
type GraphType = WorkspaceGraphState["graphType"];
type StatisticsAnnotation = NonNullable<WorkspaceGraphState["statisticsAnnotation"]>;

function timeMetricLabel(plan: TimeAnalysisPlan): string {
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

function graphAnnotationContext(input: {
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
  if (test.name === "type3_factor_a") {
    return `${factorA} main effect · two-way ANOVA`;
  }
  if (test.name === "type3_factor_b") {
    return `${factorB} main effect · two-way ANOVA`;
  }
  if (
    firstId &&
    secondId &&
    ["games_howell", "tukey_hsd", "planned_holm", "dunn_holm", "holm_welch"].includes(family)
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
              : "planned comparison · Holm";
    return `${conditionLabel(firstId)} vs ${conditionLabel(secondId)} · ${method}`;
  }
  if (family === "dunnett" && firstId && secondId) {
    return `${conditionLabel(secondId)} vs ${conditionLabel(firstId)} · Dunnett`;
  }
  return fallback;
}

function isPairwiseComparisonTest(testName: string): boolean {
  return /^(games_howell|tukey_hsd|dunnett|planned_holm|dunn_holm|holm_welch|holm_paired|holm_wilcoxon):/.test(
    testName,
  );
}

type ProportionPoint = Readonly<{
  experimentId: string;
  experimentLabel: string;
  value: number;
  positive: number;
  eligible: number;
}>;

type ExperimentPoint = Readonly<{
  experimentId: string;
  experimentLabel: string;
  value: number;
}>;

type RawPoint = Readonly<{
  experimentId: string;
  experimentLabel: string;
  value: number;
  index: number;
}>;

type GraphSeries = Readonly<{
  seriesKey: string;
  conditionId: string;
  conditionLabel: string;
  timePointId?: string;
  timeLabel?: string;
  proportionPoints: readonly ProportionPoint[];
  experimentPoints: readonly ExperimentPoint[];
  rawPoints: readonly RawPoint[];
  summary: ReturnType<typeof continuousSummary>;
}>;

type ConditionAxisLabel = Readonly<{
  conditionId: string;
  levels: readonly Readonly<{ id: string; label: string; value: string }>[];
  timeLabel: string;
}>;

export type ExperimentGraphWorkbenchProps = Readonly<{
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  onClose: () => void;
  /** `combined` is retained for isolated component harnesses; project UI uses separated workspaces. */
  workspaceMode?: "graph" | "statistics" | "combined";
  analysisRunner?: AnalysisRunner;
  initialState?: Omit<WorkspaceGraphState, "id" | "displayName">;
  onStateChange?: (state: Omit<WorkspaceGraphState, "id" | "displayName">) => void;
}>;

const PALETTES: Record<PaletteMode, readonly string[]> = {
  single: ["#245c8a"],
  condition: ["#245c8a", "#c26532", "#3e7c67", "#735a8d", "#9a7628", "#467681"],
  grayscale: ["#111111", "#4b5563", "#7a828d", "#a0a6ad", "#c0c4c9"],
  colorblind: ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9"],
  publication: ["#2B5F8A", "#A45137", "#47745D", "#6C5A80", "#8A6B28", "#467681"],
};
const DEFAULT_LAYERS: LayerState = {
  raw: true,
  distribution: true,
  experiment: true,
  overall: true,
  violin: false,
  box: false,
  errorBar: true,
  connectingLine: false,
};
const DEFAULT_APPEARANCE: GraphAppearance = {
  errorBar: "sd",
  palette: "single",
  pointSize: 6,
  axisLineWidth: 1.4,
  hierarchicalLabels: true,
  jitter: 12,
  fontFamily: "arial",
  graphTitleFontSize: 20,
  axisTitleFontSize: 19,
  tickFontSize: 17,
  hierarchyFontSize: 17,
  legendFontSize: 16,
  legendPosition: "hidden",
  seriesColors: {},
  rawPointColor: "#8a96a3",
  summaryColor: "#111111",
  errorBarColor: "#111111",
  connectingLineColor: "#4b5563",
  summaryLineWidth: 2,
  errorBarLineWidth: 1.5,
  connectingLineWidth: 1.5,
  distributionLineWidth: 1.2,
  canvasPreset: "standard",
  sidePadding: 72,
};
const CHART_HEIGHT = 520;
const CHART_MARGIN = { top: 38, right: 34, bottom: 96, left: 88 };
const CATEGORY_LAYOUT_FONT_SIZE = 15;

function estimatedRenderedTextWidth(text: string, fontSize: number): number {
  return [...text].reduce(
    (width, character) =>
      width +
      (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)
        ? fontSize
        : fontSize * 0.58),
    0,
  );
}

function formatNumber(value: number | null, fractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: fractionDigits }).format(value);
}

function formatPercentage(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value, 1)}%`;
}

function significanceSymbol(pValue: number): string {
  if (pValue < 0.0001) return "****";
  if (pValue < 0.001) return "***";
  if (pValue < 0.01) return "**";
  if (pValue < 0.05) return "*";
  return "n.s.";
}

export function describeActiveGraphLayers(
  input: Readonly<{
    graphType: GraphType;
    shape: ReadoutDraft["shape"];
    layers: LayerState;
    errorBar: ErrorBarMode;
    timeSampling: ExperimentSetDraft["time"]["sampling"];
    matched: boolean;
  }>,
): string {
  const { graphType, shape, layers, errorBar, timeSampling, matched } = input;
  if (shape === "categorical_counts") {
    if (graphType === "stacked") return "Stacked category counts";
    if (graphType === "category_percentage") return "Category percentages";
    return "100% stacked composition";
  }
  if (graphType === "scatter") return "Paired X–Y observations";
  if (graphType === "line") {
    const parts = [
      ...(timeSampling === "longitudinal" && matched ? ["Individual trajectories"] : []),
      "Summary trend",
      ...(layers.experiment
        ? [shape === "nested_continuous" ? "Experiment summaries" : "Biological replicates"]
        : []),
      ...(layers.overall && layers.errorBar && errorBar !== "none"
        ? [`${errorBar.toUpperCase()} error bars`]
        : []),
    ];
    return parts.join(" + ");
  }
  if (graphType === "paired_dot") {
    return (
      [
        ...(layers.experiment ? ["Paired observations"] : []),
        ...(layers.connectingLine ? ["Connecting lines"] : []),
        ...(layers.overall
          ? [layers.errorBar && errorBar !== "none" ? `Mean ± ${errorBar.toUpperCase()}` : "Mean"]
          : []),
      ].join(" + ") || "Paired Graph"
    );
  }

  const parts: string[] = [];
  if (graphType === "bar") parts.push("Bars (Mean)");
  if (layers.violin) parts.push("Distribution");
  if (layers.box || (shape === "nested_continuous" && layers.distribution)) {
    parts.push("Box plot");
  }
  if (shape === "nested_continuous" && layers.raw) parts.push("Raw observations");
  if (layers.experiment) {
    parts.push(shape === "nested_continuous" ? "Experiment summaries" : "Biological replicates");
  }
  if (layers.overall && graphType !== "bar") {
    if (layers.errorBar && errorBar !== "none") {
      parts.push(
        graphType === "dot"
          ? `Mean ± ${errorBar.toUpperCase()}`
          : `${errorBar.toUpperCase()} error bars`,
      );
    } else {
      parts.push("Mean");
    }
  } else if (graphType === "bar" && layers.overall && layers.errorBar && errorBar !== "none") {
    parts.push(`${errorBar.toUpperCase()} error bars`);
  }
  return parts.join(" + ") || "No data layers selected";
}

function quantile(values: readonly number[], probability: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((first, second) => first - second);
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower];
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower);
}

function isProportionCell(cell: unknown): cell is ProportionCellDraft {
  return Boolean(cell && typeof cell === "object" && "kind" in cell && cell.kind === "proportion");
}

function isNestedCell(cell: unknown): cell is NestedContinuousCellDraft {
  return Boolean(
    cell && typeof cell === "object" && "kind" in cell && cell.kind === "nested_continuous",
  );
}

function isWbRatioCell(
  cell: unknown,
): cell is Extract<ExperimentCellMap[string], { kind: "wb_ratio" }> {
  return Boolean(cell && typeof cell === "object" && "kind" in cell && cell.kind === "wb_ratio");
}

function getCell(
  cells: ExperimentCellMap,
  experimentId: string,
  conditionId: string,
  readoutId: string,
  timePointId?: string,
) {
  return cells[experimentCellKey({ experimentId, conditionId, readoutId, timePointId })];
}

function graphCellValue(cell: ExperimentCellMap[string]): number | null {
  if (!cell || cellIsNotPlanned(cell)) return null;
  if (cell.kind === "proportion") return percentage(cell);
  if (cell.kind === "nested_continuous") return continuousSummary(cell.rawValues).mean;
  if (cell.kind === "wb_ratio") return wbRatio(cell);
  return null;
}

function buildConditionAxisLabels(
  draft: ExperimentSetDraft,
  series: readonly GraphSeries[],
  hierarchyOrder: readonly string[],
): readonly ConditionAxisLabel[] {
  const orderedAttributes = [
    ...hierarchyOrder.flatMap((attributeId) => {
      const attribute = draft.attributes.find(({ id }) => id === attributeId);
      return attribute ? [attribute] : [];
    }),
    ...draft.attributes.filter(({ id }) => !hierarchyOrder.includes(id)),
  ];
  return series.map((item) => {
    const condition = draft.conditions.find((candidate) => candidate.id === item.conditionId);
    const levels = orderedAttributes.map((attribute) => ({
      id: attribute.id,
      label: attribute.label.trim() || "属性",
      value: condition?.attributes[attribute.id]?.trim() || "—",
    }));
    return {
      conditionId: item.conditionId,
      levels:
        levels.length > 0
          ? levels
          : [{ id: "condition", label: "条件", value: condition?.label || item.conditionLabel }],
      timeLabel: item.timeLabel ?? "",
    };
  });
}

function splitParentLabel(label: string): readonly string[] {
  if (label.length <= 16) return [label];
  const parenthesis = label.indexOf("（");
  if (parenthesis > 0) return [label.slice(0, parenthesis), label.slice(parenthesis)];
  const words = label.trim().split(/\s+/u);
  if (words.length > 1) {
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && candidate.length > 18) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.length <= 3 ? lines : [lines[0]!, lines[1]!, lines.slice(2).join(" ")];
  }
  return [label.slice(0, 16), label.slice(16, 32)];
}

function violinPath(
  values: readonly number[],
  x: number,
  yFor: (value: number) => number,
  halfWidth: number,
): string | null {
  if (values.length < 2) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, Math.abs(maximum) * 0.08, 1);
  const bandwidth = Math.max(range / 7, 0.001);
  const samples = Array.from({ length: 24 }, (_, index) => minimum + (range * index) / 23);
  const densities = samples.map((sample) =>
    values.reduce((sum, value) => {
      const z = (sample - value) / bandwidth;
      return sum + Math.exp(-0.5 * z * z);
    }, 0),
  );
  const maximumDensity = Math.max(...densities, 1);
  const right = samples.map(
    (sample, index) => `${x + (densities[index] / maximumDensity) * halfWidth},${yFor(sample)}`,
  );
  const left = [...samples].reverse().map((sample, reverseIndex) => {
    const index = samples.length - 1 - reverseIndex;
    return `${x - (densities[index] / maximumDensity) * halfWidth},${yFor(sample)}`;
  });
  return `M ${right[0]} L ${[...right.slice(1), ...left].join(" L ")} Z`;
}

function ExperimentGraphSvg({
  shape,
  readoutLabel,
  readoutUnit,
  timeSampling,
  conditionAssignment,
  axisLabels,
  series,
  layers,
  appearance,
  graphType,
  axes,
  svgRef,
  analysisResult,
  statisticsAnnotation,
  annotationContext,
  layerDescription,
  onInspect,
  activeInspectorTarget,
}: {
  shape: "proportion" | "nested_continuous";
  readoutLabel: string;
  readoutUnit?: string;
  timeSampling: ExperimentSetDraft["time"]["sampling"];
  conditionAssignment: ExperimentSetDraft["conditionAssignment"];
  axisLabels: readonly ConditionAxisLabel[];
  series: readonly GraphSeries[];
  layers: LayerState;
  appearance: GraphAppearance;
  graphType: GraphType;
  axes: AxisSettings;
  svgRef: RefObject<SVGSVGElement | null>;
  analysisResult: AnalysisEngineResult | null;
  statisticsAnnotation: StatisticsAnnotation;
  annotationContext: string;
  layerDescription: string;
  onInspect: (target: InspectorTarget) => void;
  activeInspectorTarget: InspectorTarget;
}) {
  const gapWeights = axisLabels.slice(1).map((label, index) => {
    const previous = axisLabels[index];
    if (previous?.conditionId === label.conditionId) return 1;
    if (label.levels.length <= 1) return 1;
    const commonPrefix = label.levels.findIndex(
      (level, levelIndex) => previous?.levels[levelIndex]?.value !== level.value,
    );
    const firstDifference = commonPrefix < 0 ? label.levels.length - 1 : commonPrefix;
    if (firstDifference >= label.levels.length - 1) return 1;
    return 1.45 + (label.levels.length - 1 - firstDifference) * 0.55;
  });
  const requiredSlotWidths = axisLabels.map((label) => {
    const labelWidth = Math.max(
      estimatedRenderedTextWidth(label.timeLabel, CATEGORY_LAYOUT_FONT_SIZE),
      ...label.levels.map((level) =>
        Math.max(
          ...splitParentLabel(level.value).map((line) =>
            estimatedRenderedTextWidth(line, CATEGORY_LAYOUT_FONT_SIZE),
          ),
        ),
      ),
    );
    const markWidth = Math.max(
      appearance.pointSize * 2 + appearance.jitter * 2 + 16,
      layers.violin || layers.box || layers.distribution ? 64 : 0,
    );
    return Math.max(72, labelWidth + 28, markWidth);
  });
  const categoryLayout = createCategoryLayout({
    gapWeights,
    spacing: axes.spacing,
    sidePadding: appearance.sidePadding,
    canvasPreset: appearance.canvasPreset,
    requiredSlotWidths,
  });
  const legendConditions = series.filter(
    (item, index) =>
      series.findIndex((candidate) => candidate.conditionId === item.conditionId) === index,
  );
  const showLegend = appearance.legendPosition !== "hidden" && legendConditions.length > 1;
  const topLegendRows =
    showLegend && appearance.legendPosition === "top" ? Math.ceil(legendConditions.length / 3) : 0;
  const topLegendHeight = topLegendRows * Math.max(34, appearance.legendFontSize * 2);
  const xAxisTitle =
    axes.xTitle.trim() ||
    (axes.xSemantic === "time"
      ? "Time"
      : axes.xSemantic === "numeric_covariate"
        ? "Covariate"
        : "");
  const renderedXAxisTitle = xAxisTitle
    ? `${xAxisTitle}${axes.xUnit.trim() ? ` (${axes.xUnit.trim()})` : ""}`
    : "";
  const margin = {
    ...CHART_MARGIN,
    top: CHART_MARGIN.top + topLegendHeight,
    right: CHART_MARGIN.right + (showLegend && appearance.legendPosition === "right" ? 190 : 0),
  };
  const width = margin.left + margin.right + categoryLayout.innerWidth;
  const hierarchyDepth = axes.showCategoryLabels
    ? Math.max(0, axisLabels[0]?.levels.length ?? 0)
    : 0;
  const extraLabelHeight = Math.max(0, hierarchyDepth - 1) * 27;
  const xAxisTitleHeight = renderedXAxisTitle ? 34 : 0;
  const height = CHART_HEIGHT + extraLabelHeight + topLegendHeight + xAxisTitleHeight;
  margin.bottom = CHART_MARGIN.bottom + extraLabelHeight + xAxisTitleHeight;
  const plotHeight = height - margin.top - margin.bottom;
  const baseColors = PALETTES[appearance.palette];
  const conditionIds = [...new Set(series.map((item) => item.conditionId))];
  const colors = conditionIds.map(
    (conditionId, index) =>
      appearance.seriesColors[conditionId] ?? baseColors[index % baseColors.length],
  );
  const values =
    shape === "proportion"
      ? series.flatMap((item) => item.proportionPoints.map((point) => point.value))
      : series.flatMap((item) => [
          ...item.rawPoints.map((point) => point.value),
          ...item.experimentPoints.map((point) => point.value),
          ...(item.summary.mean !== null && item.summary.sd !== null
            ? [item.summary.mean - item.summary.sd, item.summary.mean + item.summary.sd]
            : item.summary.mean === null
              ? []
              : [item.summary.mean]),
        ]);
  const observedMin = values.length > 0 ? Math.min(...values) : 0;
  const observedMax = values.length > 0 ? Math.max(...values) : shape === "proportion" ? 100 : 1;
  const observedRange = observedMax - observedMin;
  const padding =
    observedRange > 0 ? observedRange * 0.1 : Math.max(Math.abs(observedMax) * 0.1, 1);
  const automaticMin =
    axes.yScale === "log10" && observedMin > 0
      ? Math.max(observedMin - padding, observedMin * 0.5, Number.MIN_VALUE)
      : shape === "proportion"
        ? 0
        : Math.min(0, observedMin - padding);
  const automaticMax =
    shape === "proportion" ? 100 : Math.max(automaticMin + 1, observedMax + padding);
  const manualRangeIsValid =
    axes.yRangeMode === "manual" &&
    axes.yMin !== null &&
    axes.yMax !== null &&
    axes.yMin < axes.yMax &&
    (axes.yScale === "linear" || axes.yMin > 0);
  const domainMin = manualRangeIsValid ? axes.yMin! : automaticMin;
  const domainMax = manualRangeIsValid ? axes.yMax! : automaticMax;
  const domainRange = domainMax - domainMin;
  const logMin = Math.log10(Math.max(domainMin, Number.MIN_VALUE));
  const logMax = Math.log10(Math.max(domainMax, Number.MIN_VALUE));
  const yFor = (value: number) => {
    if (axes.yScale === "log10" && value > 0 && logMax > logMin) {
      return margin.top + ((logMax - Math.log10(value)) / (logMax - logMin)) * plotHeight;
    }
    return margin.top + ((domainMax - value) / domainRange) * plotHeight;
  };
  const xFor = (index: number) =>
    margin.left + categoryLayout.sidePadding + (categoryLayout.offsets[index] ?? 0);
  const hierarchyGroups = Array.from({ length: hierarchyDepth }, (_, levelIndex) =>
    axisLabels.reduce<Array<{ key: string; label: string; start: number; end: number }>>(
      (groups, label, index) => {
        const level = label.levels[levelIndex];
        if (!level) return groups;
        const key = label.levels
          .slice(0, levelIndex + 1)
          .map(({ value }) => value)
          .join("\u001f");
        const previous = groups.at(-1);
        if (previous?.key === key) {
          previous.end = index;
          return groups;
        }
        groups.push({ key, label: level.value, start: index, end: index });
        return groups;
      },
      [],
    ),
  );
  const hasTimeLabels = axisLabels.some(({ timeLabel }) => timeLabel);
  const yTicks =
    axes.yScale === "log10"
      ? Array.from(
          { length: Math.max(1, Math.floor(logMax) - Math.ceil(logMin) + 1) },
          (_, index) => 10 ** (Math.ceil(logMin) + index),
        ).reverse()
      : createNiceTicks(
          domainMin,
          domainMax,
          shape === "proportion" ? 5 : 5,
          axes.yTickMode === "manual" ? axes.yTickInterval : null,
        );
  const defaultYLabel = defaultGraphYTitle({
    id: "preview-readout",
    label: readoutLabel,
    shape,
    ...(readoutUnit ? { unit: readoutUnit } : {}),
  });
  const yLabel = axes.yTitle.trim() || defaultYLabel;
  const valuePointsFor = (item: GraphSeries): readonly ExperimentPoint[] =>
    shape === "proportion" ? item.proportionPoints : item.experimentPoints;
  const xForExperimentPoint = (
    item: GraphSeries,
    seriesIndex: number,
    experimentId: string,
  ): number => {
    const points = valuePointsFor(item);
    const pointIndex = points.findIndex((point) => point.experimentId === experimentId);
    if (pointIndex < 0) return xFor(seriesIndex);
    const pointSpacing = shape === "proportion" ? 12 : 8;
    return xFor(seriesIndex) + (pointIndex - (points.length - 1) / 2) * pointSpacing;
  };
  const unitTrajectories: ReadonlyArray<{
    key: string;
    conditionId: string;
    points: readonly { x: number; y: number }[];
  }> =
    timeSampling === "longitudinal" && (graphType === "line" || layers.connectingLine)
      ? conditionIds.flatMap((conditionId) =>
          [
            ...new Set(
              series.flatMap((item) => valuePointsFor(item).map((point) => point.experimentId)),
            ),
          ].flatMap((experimentId) => {
            const points = series.flatMap((item, index) => {
              if (item.conditionId !== conditionId) return [];
              const point = valuePointsFor(item).find(
                (candidate) => candidate.experimentId === experimentId,
              );
              return point
                ? [{ x: xForExperimentPoint(item, index, experimentId), y: yFor(point.value) }]
                : [];
            });
            return points.length > 1
              ? [{ key: `${conditionId}:${experimentId}`, conditionId, points }]
              : [];
          }),
        )
      : graphType === "paired_dot" &&
          conditionAssignment.kind === "matched" &&
          layers.connectingLine
        ? [
            ...new Set(
              series.flatMap((item) => valuePointsFor(item).map((point) => point.experimentId)),
            ),
          ].flatMap((experimentId) => {
            const points = series.flatMap((item, index) => {
              const point = valuePointsFor(item).find(
                (candidate) => candidate.experimentId === experimentId,
              );
              return point
                ? [{ x: xForExperimentPoint(item, index, experimentId), y: yFor(point.value) }]
                : [];
            });
            return points.length > 1
              ? [{ key: `matched:${experimentId}`, conditionId: "matched", points }]
              : [];
          })
        : [];

  return (
    <svg
      ref={svgRef}
      className="experiment-graph-svg"
      width={width}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${yLabel}の実験単位ごとのグラフ`}
      data-graph-shape={shape}
      data-category-slot-width={categoryLayout.baseSlot}
      data-side-padding={categoryLayout.sidePadding}
      style={{
        fontFamily:
          appearance.fontFamily === "arial"
            ? "Arial, sans-serif"
            : appearance.fontFamily === "helvetica"
              ? "Helvetica, Arial, sans-serif"
              : "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
      onClick={(event) => {
        const target = (event.target as Element)
          .closest<SVGElement>("[data-inspector-target]")
          ?.getAttribute("data-inspector-target") as InspectorTarget | null;
        onInspect(target ?? "background");
      }}
      onDoubleClick={() => onInspect("background")}
    >
      <title>{yLabel}</title>
      <desc>
        {`${layerDescription}. ${
          shape === "proportion"
            ? "割合は実験単位ごとに計算しています。"
            : "細胞・ROIなどの生データは統計上のnではなく、実験単位を別に保持しています。"
        }`}
      </desc>
      {showLegend ? (
        <g
          className="experiment-graph-svg-legend"
          data-graph-layer="legend"
          data-inspector-target="legend"
          data-selected={activeInspectorTarget === "legend" || undefined}
          aria-label="条件の色"
          onDoubleClick={(event) => {
            event.stopPropagation();
            onInspect("legend");
          }}
        >
          {legendConditions.map((item, index) => {
            const column = appearance.legendPosition === "top" ? index % 3 : 0;
            const row = appearance.legendPosition === "top" ? Math.floor(index / 3) : index;
            const legendX =
              appearance.legendPosition === "top"
                ? margin.left + column * Math.max(130, categoryLayout.innerWidth / 3)
                : appearance.legendPosition === "right"
                  ? width - margin.right + 24
                  : width - margin.right - 165;
            const legendY =
              appearance.legendPosition === "top"
                ? 20 + row * Math.max(34, appearance.legendFontSize * 2)
                : margin.top + 14 + row * Math.max(30, appearance.legendFontSize * 1.8);
            const labelLines = splitParentLabel(item.conditionLabel);
            return (
              <g key={item.conditionId} transform={`translate(${legendX} ${legendY})`}>
                <title>{item.conditionLabel}</title>
                <circle r="5" cx="5" cy="-4" fill={colors[index % colors.length]} />
                <text
                  x="16"
                  y="0"
                  fill="#000"
                  fontSize={appearance.legendFontSize}
                  className="experiment-graph-svg-legend-label"
                >
                  {labelLines.map((line, lineIndex) => (
                    <tspan key={`${item.conditionId}-${lineIndex}`} x="16" dy={lineIndex ? 17 : 0}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}
      {yTicks.map((tick, index) => {
        const y = yFor(tick);
        return (
          <g key={`tick-${index}`}>
            <line
              x1={margin.left - 5}
              x2={margin.left}
              y1={y}
              y2={y}
              className="experiment-graph-tick"
            />
            <text
              x={margin.left - 10}
              y={y + 5}
              textAnchor="end"
              className="experiment-graph-axis-label"
              style={{ fontSize: appearance.tickFontSize, fill: "#000" }}
            >
              {formatNumber(tick, 1)}
            </text>
          </g>
        );
      })}
      <line
        x1={margin.left}
        x2={margin.left}
        y1={margin.top}
        y2={height - margin.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onInspect("y-axis");
        }}
      />
      <line
        x1={margin.left}
        x2={margin.left}
        y1={margin.top}
        y2={height - margin.bottom}
        className="experiment-graph-axis-hit-target"
        data-inspector-target="y-axis"
        data-selected={activeInspectorTarget === "y-axis" || undefined}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onInspect("y-axis");
        }}
      />
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={height - margin.bottom}
        y2={height - margin.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onInspect("x-axis");
        }}
      />
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={height - margin.bottom}
        y2={height - margin.bottom}
        className="experiment-graph-axis-hit-target"
        data-inspector-target="x-axis"
        data-selected={activeInspectorTarget === "x-axis" || undefined}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onInspect("x-axis");
        }}
      />
      {axisLabels.map((label, index) => (
        <line
          key={`category-tick-${label.conditionId}-${label.timeLabel || "none"}-${index}`}
          x1={xFor(index)}
          x2={xFor(index)}
          y1={height - margin.bottom}
          y2={height - margin.bottom - 6}
          className="experiment-graph-category-tick"
          data-inspector-target="x-axis"
        />
      ))}
      <text
        x={17}
        y={margin.top + plotHeight / 2}
        transform={`rotate(-90 17 ${margin.top + plotHeight / 2})`}
        textAnchor="middle"
        className="experiment-graph-axis-title"
        style={{ fontSize: appearance.axisTitleFontSize, fill: "#000" }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onInspect("y-axis");
        }}
      >
        {yLabel}
      </text>
      {renderedXAxisTitle ? (
        <text
          x={(margin.left + width - margin.right) / 2}
          y={height - 12}
          textAnchor="middle"
          className="experiment-graph-axis-title"
          style={{ fontSize: appearance.axisTitleFontSize, fill: "#000" }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onInspect("x-axis");
          }}
        >
          {renderedXAxisTitle}
        </text>
      ) : null}
      {statisticsAnnotation.mode !== "hidden" &&
      analysisResult?.status === "ok" &&
      analysisResult.tests[statisticsAnnotation.testIndex] ? (
        series.length === 2 ? (
          <g data-graph-layer="statistics-annotation">
            <line
              x1={xFor(0)}
              x2={xFor(1)}
              y1={margin.top - 10}
              y2={margin.top - 10}
              className="experiment-graph-stat-line"
            />
            <line
              x1={xFor(0)}
              x2={xFor(0)}
              y1={margin.top - 10}
              y2={margin.top - 4}
              className="experiment-graph-stat-line"
            />
            <line
              x1={xFor(1)}
              x2={xFor(1)}
              y1={margin.top - 10}
              y2={margin.top - 4}
              className="experiment-graph-stat-line"
            />
            <text
              x={(xFor(0) + xFor(1)) / 2}
              y={margin.top - 14}
              textAnchor="middle"
              className="experiment-graph-stat-label"
            >
              {`${annotationContext} · ${
                statisticsAnnotation.mode === "symbol"
                  ? significanceSymbol(
                      analysisResult.tests[statisticsAnnotation.testIndex]?.adjustedPValue ??
                        analysisResult.tests[statisticsAnnotation.testIndex]!.pValue,
                    )
                  : `p = ${formatExactPValue(
                      analysisResult.tests[statisticsAnnotation.testIndex]?.adjustedPValue ??
                        analysisResult.tests[statisticsAnnotation.testIndex]!.pValue,
                    )}`
              }`}
            </text>
          </g>
        ) : (
          <text
            x={width - margin.right}
            y={margin.top - 10}
            textAnchor="end"
            className="experiment-graph-stat-label"
            data-graph-layer="statistics-annotation"
          >
            {`${annotationContext} · ${
              statisticsAnnotation.mode === "symbol"
                ? significanceSymbol(
                    analysisResult.tests[statisticsAnnotation.testIndex]?.adjustedPValue ??
                      analysisResult.tests[statisticsAnnotation.testIndex]!.pValue,
                  )
                : `${
                    isPairwiseComparisonTest(
                      analysisResult.tests[statisticsAnnotation.testIndex]!.name,
                    )
                      ? "p"
                      : "全体 p"
                  } = ${formatExactPValue(
                    analysisResult.tests[statisticsAnnotation.testIndex]?.adjustedPValue ??
                      analysisResult.tests[statisticsAnnotation.testIndex]!.pValue,
                  )}`
            }`}
          </text>
        )
      ) : null}
      {unitTrajectories.map((trajectory) => {
        const colorIndex = Math.max(0, conditionIds.indexOf(trajectory.conditionId));
        return (
          <polyline
            key={`unit-trajectory-${trajectory.key}`}
            points={trajectory.points.map(({ x, y }) => `${x},${y}`).join(" ")}
            fill="none"
            stroke={colors[colorIndex % colors.length] ?? appearance.connectingLineColor}
            strokeWidth={Math.max(0.8, appearance.connectingLineWidth * 0.72)}
            opacity={0.34}
            className="experiment-graph-unit-trajectory"
            data-graph-layer="unit-trajectory"
            data-trajectory-id={trajectory.key}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onInspect("connecting-line");
            }}
          />
        );
      })}
      {(graphType === "line" || layers.connectingLine) &&
        conditionIds.map((conditionId) => {
          const points = series.flatMap((item, index) =>
            item.conditionId === conditionId && item.summary.mean !== null
              ? [`${xFor(index)},${yFor(item.summary.mean)}`]
              : [],
          );
          if (points.length < 2) return null;
          const color = colors[Math.max(0, conditionIds.indexOf(conditionId)) % colors.length];
          return (
            <polyline
              key={`line-${conditionId}`}
              points={points.join(" ")}
              fill="none"
              stroke={color}
              className="experiment-graph-connecting-line experiment-graph-summary-trend"
              style={{
                stroke: color,
                strokeWidth: appearance.summaryLineWidth,
              }}
              data-graph-layer="summary-trend"
              onDoubleClick={(event) => {
                event.stopPropagation();
                onInspect("connecting-line");
              }}
            />
          );
        })}
      {axes.showCategoryLabels
        ? hierarchyGroups.flatMap((groups, levelIndex) => {
            const rowY =
              height -
              margin.bottom +
              (hasTimeLabels ? 52 : 34) +
              (hierarchyDepth - 1 - levelIndex) * 27;
            const heading = axisLabels[0]?.levels[levelIndex]?.label;
            return [
              heading && !(levelIndex === 0 && heading === "条件") ? (
                <text
                  key={`heading-${levelIndex}`}
                  x={margin.left - 10}
                  y={rowY}
                  textAnchor="end"
                  className="experiment-graph-hierarchy-heading"
                  style={{ fontSize: appearance.hierarchyFontSize, fill: "#000" }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onInspect("x-axis");
                  }}
                >
                  {heading}
                </text>
              ) : null,
              ...groups.map((group) => {
                const center = (xFor(group.start) + xFor(group.end)) / 2;
                return (
                  <g
                    key={`level-${levelIndex}-${group.key}`}
                    data-condition-level-index={levelIndex}
                    data-condition-group={encodeURIComponent(group.key)}
                    data-inspector-target="x-axis"
                    data-selected={activeInspectorTarget === "x-axis" || undefined}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      onInspect("x-axis");
                    }}
                  >
                    {group.end > group.start ? (
                      <line
                        x1={xFor(group.start) - 8}
                        x2={xFor(group.end) + 8}
                        y1={rowY - 15}
                        y2={rowY - 15}
                        className={`experiment-graph-hierarchy-line ${levelIndex === 0 ? "experiment-graph-hierarchy-line--parent" : ""}`}
                      />
                    ) : null}
                    <text
                      x={center}
                      y={rowY}
                      textAnchor="middle"
                      className={
                        levelIndex === 0
                          ? "experiment-graph-condition-label"
                          : "experiment-graph-condition-attribute"
                      }
                      style={{ fontSize: appearance.hierarchyFontSize, fill: "#000" }}
                      data-condition-level-label={group.label}
                      data-condition-parent-label={levelIndex === 0 ? group.label : undefined}
                    >
                      {(levelIndex === 0 ? splitParentLabel(group.label) : [group.label]).map(
                        (line, index) => (
                          <tspan key={`${group.key}-${index}`} x={center} dy={index === 0 ? 0 : 18}>
                            {line}
                          </tspan>
                        ),
                      )}
                    </text>
                  </g>
                );
              }),
            ];
          })
        : null}
      {series.map((item, seriesIndex) => {
        const x = xFor(seriesIndex);
        const axisLabel =
          axisLabels[seriesIndex] ??
          ({
            conditionId: item.conditionId,
            levels: [{ id: "condition", label: "条件", value: item.conditionLabel }],
            timeLabel: item.timeLabel ?? "",
          } satisfies ConditionAxisLabel);
        const color = colors[Math.max(0, conditionIds.indexOf(item.conditionId)) % colors.length];
        const summary = item.summary;
        const violinValues =
          shape === "proportion"
            ? item.proportionPoints.map(({ value }) => value)
            : item.rawPoints.map(({ value }) => value);
        const boxValues =
          shape === "proportion"
            ? item.proportionPoints.map(({ value }) => value)
            : item.experimentPoints.map(({ value }) => value);
        const rawMinimum = quantile(boxValues, 0);
        const rawQ1 = quantile(boxValues, 0.25);
        const rawMedian = quantile(boxValues, 0.5);
        const rawQ3 = quantile(boxValues, 0.75);
        const rawMaximum = quantile(boxValues, 1);
        const mean = summary.mean;
        const sd = summary.sd;
        const meanY = mean === null ? null : yFor(mean);
        const error =
          appearance.errorBar === "none" || sd === null
            ? null
            : appearance.errorBar === "sem"
              ? sd / Math.sqrt(Math.max(summary.n, 1))
              : sd;
        const lowerY = mean !== null && error !== null ? yFor(mean - error) : null;
        const upperY = mean !== null && error !== null ? yFor(mean + error) : null;
        const summaryLayer = shape === "proportion" ? "proportion-summary" : "nested-overall";
        const previousGap = seriesIndex > 0 ? x - xFor(seriesIndex - 1) : Number.POSITIVE_INFINITY;
        const nextGap =
          seriesIndex < series.length - 1 ? xFor(seriesIndex + 1) - x : Number.POSITIVE_INFINITY;
        const localHalfWidth = Math.min(previousGap, nextGap, 52) / 2;
        const jitterWidth = Math.min(appearance.jitter, Math.max(4, localHalfWidth * 0.58));
        const distributionHalfWidth = Math.min(22, Math.max(8, localHalfWidth * 0.78));
        const currentViolinPath = violinPath(violinValues, x, yFor, distributionHalfWidth);
        const barBaselineValue = axes.yScale === "log10" ? domainMin : Math.max(0, domainMin);
        const barBaselineY = yFor(barBaselineValue);
        return (
          <g
            key={item.seriesKey}
            data-condition-index={seriesIndex}
            data-condition-parent={axisLabel.levels[0]?.value ?? item.conditionLabel}
          >
            {axes.showCategoryLabels ? (
              <text
                x={x}
                y={height - margin.bottom + 25}
                textAnchor="middle"
                className="experiment-graph-condition-attribute experiment-graph-time-label"
                style={{ fontSize: appearance.hierarchyFontSize, fill: "#000" }}
                data-condition-time-label={axisLabel.timeLabel || undefined}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onInspect("x-axis");
                }}
              >
                {axisLabel.timeLabel}
              </text>
            ) : null}
            {graphType === "bar" && meanY !== null ? (
              <rect
                x={x - distributionHalfWidth}
                y={Math.min(meanY, barBaselineY)}
                width={distributionHalfWidth * 2}
                height={Math.max(1, Math.abs(barBaselineY - meanY))}
                fill={color}
                opacity={0.24}
                className="experiment-graph-bar"
                data-graph-layer="bar"
                data-inspector-target="experiment-summary"
                data-selected={activeInspectorTarget === "experiment-summary" || undefined}
                data-summary-value={mean}
                aria-label={`${item.conditionLabel}の平均を表す棒: ${formatNumber(mean)}`}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onInspect("experiment-summary");
                }}
              />
            ) : null}
            {layers.violin && currentViolinPath ? (
              <g
                data-graph-layer="violin"
                data-inspector-target="violin"
                data-selected={activeInspectorTarget === "violin" || undefined}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onInspect("violin");
                }}
              >
                <title>バイオリン分布を編集（ダブルクリック）</title>
                <path
                  d={currentViolinPath}
                  fill={color}
                  className="experiment-graph-violin"
                  style={{ strokeWidth: appearance.distributionLineWidth }}
                />
                <path d={currentViolinPath} className="experiment-graph-violin-hit-target" />
              </g>
            ) : null}
            {shape === "proportion" &&
              layers.experiment &&
              item.proportionPoints.map((point, pointIndex) => (
                <circle
                  key={`${point.experimentId}-${pointIndex}`}
                  cx={x + (pointIndex - (item.proportionPoints.length - 1) / 2) * 12}
                  cy={yFor(point.value)}
                  r={appearance.pointSize}
                  fill={color}
                  className="experiment-graph-point"
                  data-graph-layer="proportion-experiment"
                  data-inspector-target="experiment-summary"
                  data-selected={activeInspectorTarget === "experiment-summary" || undefined}
                  data-experiment-id={point.experimentId}
                  data-graph-value={point.value}
                  aria-label={`${item.conditionLabel} ${point.experimentLabel}: ${formatPercentage(point.value)}（${point.positive}/${point.eligible}）`}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onInspect("experiment-summary");
                  }}
                />
              ))}
            {((shape === "nested_continuous" && layers.distribution) || layers.box) &&
              rawMinimum !== null &&
              rawQ1 !== null &&
              rawMedian !== null &&
              rawQ3 !== null &&
              rawMaximum !== null && (
                <g
                  data-graph-layer="nested-distribution"
                  data-inspector-target="box"
                  data-selected={activeInspectorTarget === "box" || undefined}
                  aria-label={`${item.conditionLabel}の細胞・ROI分布（記述用）`}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onInspect("box");
                  }}
                >
                  <rect
                    x={x - 28}
                    y={yFor(rawMaximum)}
                    width={56}
                    height={Math.max(12, yFor(rawMinimum) - yFor(rawMaximum))}
                    className="experiment-graph-box-hit-target"
                  />
                  <line
                    x1={x}
                    x2={x}
                    y1={yFor(rawMaximum)}
                    y2={yFor(rawMinimum)}
                    className="experiment-graph-distribution-whisker"
                    style={{ strokeWidth: appearance.distributionLineWidth }}
                  />
                  <rect
                    x={x - 22}
                    y={yFor(rawQ3)}
                    width={44}
                    height={Math.max(1, yFor(rawQ1) - yFor(rawQ3))}
                    fill={color}
                    className="experiment-graph-distribution-box"
                    style={{ strokeWidth: appearance.distributionLineWidth }}
                  />
                  <line
                    x1={x - 22}
                    x2={x + 22}
                    y1={yFor(rawMedian)}
                    y2={yFor(rawMedian)}
                    className="experiment-graph-distribution-median"
                    style={{ strokeWidth: appearance.summaryLineWidth }}
                  />
                </g>
              )}
            {shape === "nested_continuous" &&
              layers.raw &&
              item.rawPoints.map((point) => (
                <circle
                  key={`${point.experimentId}-raw-${point.index}`}
                  cx={x + (((point.index * 37) % 101) / 100 - 0.5) * 2 * jitterWidth}
                  cy={yFor(point.value)}
                  r={Math.max(2.4, appearance.pointSize * 0.53)}
                  fill={appearance.rawPointColor}
                  opacity={0.28}
                  className="experiment-graph-point experiment-graph-point--raw"
                  data-graph-layer="nested-raw"
                  data-inspector-target="raw-dots"
                  data-selected={activeInspectorTarget === "raw-dots" || undefined}
                  data-experiment-id={point.experimentId}
                  data-graph-value={point.value}
                  aria-label={`${item.conditionLabel} ${point.experimentLabel}の生データ: ${formatNumber(point.value)}`}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onInspect("raw-dots");
                  }}
                />
              ))}
            {shape === "nested_continuous" &&
              layers.experiment &&
              item.experimentPoints.map((point, pointIndex) => (
                <circle
                  key={`${point.experimentId}-experiment-${pointIndex}`}
                  cx={x + (pointIndex - (item.experimentPoints.length - 1) / 2) * 8}
                  cy={yFor(point.value)}
                  r={appearance.pointSize + 1}
                  fill={color}
                  className="experiment-graph-point experiment-graph-point--experiment"
                  data-graph-layer="nested-experiment"
                  data-inspector-target="experiment-summary"
                  data-selected={activeInspectorTarget === "experiment-summary" || undefined}
                  data-experiment-id={point.experimentId}
                  data-graph-value={point.value}
                  aria-label={`${item.conditionLabel} ${point.experimentLabel}の実験単位平均: ${formatNumber(point.value)}`}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onInspect("experiment-summary");
                  }}
                />
              ))}
            {layers.overall && meanY !== null && (
              <line
                x1={x - 26}
                x2={x + 26}
                y1={meanY}
                y2={meanY}
                className="experiment-graph-mean-line"
                style={{
                  stroke: appearance.summaryColor,
                  strokeWidth: appearance.summaryLineWidth,
                }}
                data-graph-layer={summaryLayer}
                data-inspector-target="experiment-summary"
                data-selected={activeInspectorTarget === "experiment-summary" || undefined}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onInspect("experiment-summary");
                }}
              />
            )}
            {layers.overall && layers.errorBar && lowerY !== null && upperY !== null && (
              <>
                <line
                  x1={x}
                  x2={x}
                  y1={lowerY}
                  y2={upperY}
                  className="experiment-graph-error-line"
                  style={{
                    stroke: appearance.errorBarColor,
                    strokeWidth: appearance.errorBarLineWidth,
                  }}
                  data-graph-layer={summaryLayer}
                  data-inspector-target="error-bar"
                  data-selected={activeInspectorTarget === "error-bar" || undefined}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onInspect("error-bar");
                  }}
                />
                <line
                  x1={x}
                  x2={x}
                  y1={lowerY}
                  y2={upperY}
                  className="experiment-graph-error-hit-target"
                  data-inspector-target="error-bar"
                  data-selected={activeInspectorTarget === "error-bar" || undefined}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onInspect("error-bar");
                  }}
                />
                <line
                  x1={x - 8}
                  x2={x + 8}
                  y1={lowerY}
                  y2={lowerY}
                  className="experiment-graph-error-cap"
                  style={{
                    stroke: appearance.errorBarColor,
                    strokeWidth: appearance.errorBarLineWidth,
                  }}
                  data-graph-layer={summaryLayer}
                  data-inspector-target="error-bar"
                  data-selected={activeInspectorTarget === "error-bar" || undefined}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onInspect("error-bar");
                  }}
                />
                <line
                  x1={x - 8}
                  x2={x + 8}
                  y1={upperY}
                  y2={upperY}
                  className="experiment-graph-error-cap"
                  style={{
                    stroke: appearance.errorBarColor,
                    strokeWidth: appearance.errorBarLineWidth,
                  }}
                  data-graph-layer={summaryLayer}
                  data-inspector-target="error-bar"
                  data-selected={activeInspectorTarget === "error-bar" || undefined}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onInspect("error-bar");
                  }}
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function CompositionGraphSvg({
  draft,
  cells,
  readout,
  conditionIds,
  timePointIds,
  graphType,
  appearance,
  svgRef,
}: {
  draft: ExperimentSetDraft;
  cells: ExperimentCellMap;
  readout: ReadoutDraft;
  conditionIds: readonly string[];
  timePointIds: readonly string[];
  graphType: "stacked" | "stacked_100" | "category_percentage";
  appearance: GraphAppearance;
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const categories = readout.categories ?? [];
  const timePoints =
    draft.time.points.length > 0
      ? draft.time.points.filter(({ id }) => timePointIds.includes(id))
      : [undefined];
  const groups = draft.conditions
    .filter(({ id }) => conditionIds.includes(id))
    .flatMap((condition) =>
      timePoints.map((timePoint) => {
        const cellsForGroup = draft.experiments.flatMap((experiment) => {
          const cell =
            cells[
              experimentCellKey({
                experimentId: experiment.id,
                conditionId: condition.id,
                readoutId: readout.id,
                timePointId: timePoint?.id,
              })
            ];
          return cell?.kind === "categorical_counts" && categoricalTotal(cell) !== null
            ? [cell]
            : [];
        });
        const values = categories.map((category) => {
          const perExperiment = cellsForGroup.flatMap((cell) => {
            if (graphType === "stacked") {
              const value = cell.counts[category.id];
              return value === null || value === undefined ? [] : [value];
            }
            const value = categoricalPercentage(cell, category.id);
            return value === null ? [] : [value];
          });
          return continuousSummary(perExperiment).mean ?? 0;
        });
        return {
          key: `${condition.id}:${timePoint?.id ?? "none"}`,
          label: timePoint
            ? `${condition.label} · ${timePoint.value} ${draft.time.unit}`
            : condition.label,
          values,
        };
      }),
    );
  const width = Math.max(680, 150 + groups.length * 110);
  const height = 520;
  const margin = { top: 55, right: 190, bottom: 110, left: 88 };
  const plotHeight = height - margin.top - margin.bottom;
  const maximum =
    graphType === "stacked"
      ? Math.max(1, ...groups.map(({ values }) => values.reduce((sum, value) => sum + value, 0)))
      : 100;
  const yFor = (value: number) => margin.top + ((maximum - value) / maximum) * plotHeight;
  const colors =
    appearance.palette === "single" ? PALETTES.colorblind : PALETTES[appearance.palette];
  const yTicks = createNiceTicks(0, maximum, 5, null);
  return (
    <svg
      ref={svgRef}
      className="experiment-graph-svg"
      width={width}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${readout.label}のカテゴリ構成グラフ`}
      data-graph-type={graphType}
    >
      <title>{readout.label}</title>
      <desc>各カテゴリのcountから実験単位ごとの割合を計算し、条件ごとに要約しています。</desc>
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={margin.left - 5}
            x2={margin.left}
            y1={yFor(tick)}
            y2={yFor(tick)}
            className="experiment-graph-tick"
          />
          <text
            x={margin.left - 10}
            y={yFor(tick) + 5}
            textAnchor="end"
            style={{ fontSize: appearance.tickFontSize, fill: "#000" }}
          >
            {formatNumber(tick, 1)}
          </text>
        </g>
      ))}
      <line
        x1={margin.left}
        x2={margin.left}
        y1={margin.top}
        y2={height - margin.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
      />
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={height - margin.bottom}
        y2={height - margin.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
      />
      <text
        x="20"
        y={margin.top + plotHeight / 2}
        transform={`rotate(-90 20 ${margin.top + plotHeight / 2})`}
        textAnchor="middle"
        className="experiment-graph-axis-title"
        style={{ fontSize: appearance.axisTitleFontSize, fill: "#000" }}
      >
        {graphType === "stacked" ? "Count" : "Composition (%)"}
      </text>
      {groups.map((group, groupIndex) => {
        const x = margin.left + 55 + groupIndex * 110;
        if (graphType === "category_percentage") {
          return (
            <g key={group.key}>
              {group.values.map((value, categoryIndex) => (
                <circle
                  key={categories[categoryIndex]?.id}
                  cx={x + (categoryIndex - (categories.length - 1) / 2) * 12}
                  cy={yFor(value)}
                  r={appearance.pointSize}
                  fill={colors[categoryIndex % colors.length]}
                  data-graph-layer="category-percentage"
                />
              ))}
              <text
                x={x}
                y={height - margin.bottom + 28}
                textAnchor="middle"
                style={{ fontSize: appearance.hierarchyFontSize, fill: "#000" }}
              >
                {group.label}
              </text>
            </g>
          );
        }
        let cumulative = 0;
        return (
          <g key={group.key}>
            {group.values.map((value, categoryIndex) => {
              const top = cumulative + value;
              const rectangle = (
                <rect
                  key={categories[categoryIndex]?.id}
                  x={x - 24}
                  y={yFor(top)}
                  width="48"
                  height={Math.max(0, yFor(cumulative) - yFor(top))}
                  fill={colors[categoryIndex % colors.length]}
                  data-graph-layer="category-stack"
                />
              );
              cumulative = top;
              return rectangle;
            })}
            <text
              x={x}
              y={height - margin.bottom + 28}
              textAnchor="middle"
              style={{ fontSize: appearance.hierarchyFontSize, fill: "#000" }}
            >
              {group.label}
            </text>
          </g>
        );
      })}
      {categories.map((category, index) => (
        <g
          key={category.id}
          transform={`translate(${width - margin.right + 32} ${margin.top + index * 30})`}
        >
          <rect width="14" height="14" fill={colors[index % colors.length]} />
          <text x="22" y="12" style={{ fontSize: appearance.legendFontSize, fill: "#000" }}>
            {category.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function CorrelationGraphSvg({
  series,
  appearance,
  axes,
  svgRef,
  analysisResult,
  statisticsAnnotation,
  onInspect,
}: {
  series: readonly GraphSeries[];
  appearance: GraphAppearance;
  axes: AxisSettings;
  svgRef: RefObject<SVGSVGElement | null>;
  analysisResult: AnalysisEngineResult | null;
  statisticsAnnotation: StatisticsAnnotation;
  onInspect: (target: InspectorTarget) => void;
}) {
  const [xSeries, ySeries] = series;
  const yByExperiment = new Map(
    ySeries?.experimentPoints.map((point) => [point.experimentId, point]) ?? [],
  );
  const pairs =
    xSeries?.experimentPoints.flatMap((xPoint) => {
      const yPoint = yByExperiment.get(xPoint.experimentId);
      return yPoint ? [{ id: xPoint.experimentId, x: xPoint.value, y: yPoint.value }] : [];
    }) ?? [];
  const width = 720;
  const height = 520;
  const margin = { top: 44, right: 44, bottom: 88, left: 94 };
  const xValues = pairs.map(({ x }) => x);
  const yValues = pairs.map(({ y }) => y);
  const paddedDomain = (values: readonly number[]) => {
    const minimum = values.length > 0 ? Math.min(...values) : 0;
    const maximum = values.length > 0 ? Math.max(...values) : 1;
    const range = Math.max(maximum - minimum, Math.abs(maximum) * 0.08, 1);
    return [minimum - range * 0.1, maximum + range * 0.1] as const;
  };
  const [xMin, xMax] = paddedDomain(xValues);
  const automaticY = paddedDomain(yValues);
  const manualY =
    axes.yRangeMode === "manual" &&
    axes.yMin !== null &&
    axes.yMax !== null &&
    axes.yMin < axes.yMax;
  const yMin = manualY ? axes.yMin! : automaticY[0];
  const yMax = manualY ? axes.yMax! : automaticY[1];
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xFor = (value: number) => margin.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const yFor = (value: number) => margin.top + ((yMax - value) / (yMax - yMin)) * plotHeight;
  const xTicks = createNiceTicks(xMin, xMax, 5, null);
  const yTicks = createNiceTicks(
    yMin,
    yMax,
    5,
    axes.yTickMode === "manual" ? axes.yTickInterval : null,
  );
  const xLabel = xSeries?.conditionLabel ?? "X";
  const yLabel = axes.yTitle.trim() || ySeries?.conditionLabel || "Y";
  const annotationTest = analysisResult?.tests[statisticsAnnotation.testIndex];
  const annotationValue = annotationTest
    ? (annotationTest.adjustedPValue ?? annotationTest.pValue)
    : null;
  return (
    <svg
      ref={svgRef}
      className="experiment-graph-svg"
      width={width}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${xLabel}と${yLabel}の散布図`}
      data-graph-type="scatter"
      style={{
        fontFamily:
          appearance.fontFamily === "arial"
            ? "Arial, sans-serif"
            : appearance.fontFamily === "helvetica"
              ? "Helvetica, Arial, sans-serif"
              : "system-ui, sans-serif",
      }}
    >
      <title>{`${xLabel} vs ${yLabel}`}</title>
      <desc>各点は同じ実験単位から得たXとYの完全な1組です。</desc>
      {xTicks.map((tick) => (
        <g key={`x-${tick}`}>
          <line
            x1={xFor(tick)}
            x2={xFor(tick)}
            y1={height - margin.bottom}
            y2={height - margin.bottom + 5}
            className="experiment-graph-tick"
          />
          <text
            x={xFor(tick)}
            y={height - margin.bottom + 25}
            textAnchor="middle"
            style={{ fontSize: appearance.tickFontSize, fill: "#000" }}
          >
            {formatNumber(tick, 2)}
          </text>
        </g>
      ))}
      {yTicks.map((tick) => (
        <g key={`y-${tick}`}>
          <line
            x1={margin.left - 5}
            x2={margin.left}
            y1={yFor(tick)}
            y2={yFor(tick)}
            className="experiment-graph-tick"
          />
          <text
            x={margin.left - 10}
            y={yFor(tick) + 5}
            textAnchor="end"
            style={{ fontSize: appearance.tickFontSize, fill: "#000" }}
          >
            {formatNumber(tick, 2)}
          </text>
        </g>
      ))}
      <line
        x1={margin.left}
        x2={margin.left}
        y1={margin.top}
        y2={height - margin.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
        onDoubleClick={() => onInspect("y-axis")}
      />
      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={height - margin.bottom}
        y2={height - margin.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
        onDoubleClick={() => onInspect("x-axis")}
      />
      <text
        x={margin.left + plotWidth / 2}
        y={height - 22}
        textAnchor="middle"
        className="experiment-graph-axis-title"
        style={{ fontSize: appearance.axisTitleFontSize, fill: "#000" }}
      >
        {xLabel}
      </text>
      <text
        x={22}
        y={margin.top + plotHeight / 2}
        textAnchor="middle"
        transform={`rotate(-90 22 ${margin.top + plotHeight / 2})`}
        className="experiment-graph-axis-title"
        style={{ fontSize: appearance.axisTitleFontSize, fill: "#000" }}
      >
        {yLabel}
      </text>
      {pairs.map((pair) => (
        <circle
          key={pair.id}
          cx={xFor(pair.x)}
          cy={yFor(pair.y)}
          r={appearance.pointSize}
          fill={appearance.seriesColors["scatter"] ?? PALETTES[appearance.palette][0]}
          className="experiment-graph-point"
          data-experimental-unit={pair.id}
        />
      ))}
      {statisticsAnnotation.mode !== "hidden" && annotationValue !== null ? (
        <text
          x={width - margin.right}
          y={margin.top}
          textAnchor="end"
          className="experiment-graph-stat-label"
          data-graph-layer="statistics-annotation"
        >
          {statisticsAnnotation.mode === "symbol"
            ? significanceSymbol(annotationValue)
            : `p = ${formatExactPValue(annotationValue)}`}
        </text>
      ) : null}
    </svg>
  );
}

function ProportionSummary({ series }: { series: readonly GraphSeries[] }) {
  return (
    <div className="experiment-graph-data-summary" aria-label="割合データの要約">
      {series.map((item) => (
        <div className="experiment-graph-summary-row" key={item.seriesKey}>
          <strong>
            {item.conditionLabel}
            {item.timeLabel ? `・${item.timeLabel}` : ""}
          </strong>
          <span>
            {item.proportionPoints.length}実験単位・
            {item.proportionPoints
              .map((point) => `${point.positive}/${point.eligible}`)
              .join("、") || "有効値なし"}
          </span>
        </div>
      ))}
    </div>
  );
}

function NestedSummary({ series }: { series: readonly GraphSeries[] }) {
  return (
    <div className="experiment-graph-data-summary" aria-label="階層データの要約">
      {series.map((item) => (
        <div className="experiment-graph-summary-row" key={item.seriesKey}>
          <strong>
            {item.conditionLabel}
            {item.timeLabel ? `・${item.timeLabel}` : ""}
          </strong>
          <span>
            実験単位 {item.experimentPoints.length}、細胞・ROI {item.rawPoints.length}
          </span>
        </div>
      ))}
    </div>
  );
}

function csvField(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function serializeVisibleGraphData(
  series: readonly GraphSeries[],
  shape: ReadoutDraft["shape"],
): string {
  const rows: Array<Array<string | number>> = [
    ["条件", "時点", "実験回", "データ層", "値", "陽性数", "対象数"],
  ];
  series.forEach((item) => {
    if (shape === "proportion") {
      item.proportionPoints.forEach((point) => {
        rows.push([
          item.conditionLabel,
          item.timeLabel ?? "",
          point.experimentLabel,
          "実験単位の割合",
          point.value,
          point.positive,
          point.eligible,
        ]);
      });
      return;
    }
    item.rawPoints.forEach((point) => {
      rows.push([
        item.conditionLabel,
        item.timeLabel ?? "",
        point.experimentLabel,
        "細胞・ROI生データ",
        point.value,
        "",
        "",
      ]);
    });
    item.experimentPoints.forEach((point) => {
      rows.push([
        item.conditionLabel,
        item.timeLabel ?? "",
        point.experimentLabel,
        shape === "wb_ratio" ? "標的/reference比" : "実験単位平均",
        point.value,
        "",
        "",
      ]);
    });
  });
  return `\uFEFF${rows.map((row) => row.map(csvField).join(",")).join("\n")}\n`;
}

function serializeCompositionData(
  draft: ExperimentSetDraft,
  cells: ExperimentCellMap,
  readout: ReadoutDraft,
  conditionIds: readonly string[],
  timePointIds: readonly string[],
): string {
  const categories = readout.categories ?? [];
  const rows: Array<Array<string | number>> = [
    [
      "条件",
      "時点",
      "実験回",
      ...categories.map(({ label }) => `${label} count`),
      ...categories.map(({ label }) => `${label} %`),
    ],
  ];
  const times =
    draft.time.points.length > 0
      ? draft.time.points.filter(({ id }) => timePointIds.includes(id))
      : [undefined];
  draft.conditions
    .filter(({ id }) => conditionIds.includes(id))
    .forEach((condition) => {
      times.forEach((timePoint) => {
        draft.experiments.forEach((experiment) => {
          const cell =
            cells[
              experimentCellKey({
                experimentId: experiment.id,
                conditionId: condition.id,
                readoutId: readout.id,
                timePointId: timePoint?.id,
              })
            ];
          if (cell?.kind !== "categorical_counts" || categoricalTotal(cell) === null) return;
          rows.push([
            condition.label,
            timePoint ? `${timePoint.value} ${draft.time.unit}` : "",
            experiment.label,
            ...categories.map(({ id }) => cell.counts[id] ?? ""),
            ...categories.map(({ id }) => categoricalPercentage(cell, id) ?? ""),
          ]);
        });
      });
    });
  return `\uFEFF${rows.map((row) => row.map(csvField).join(",")).join("\n")}\n`;
}

function safeFileStem(value: string): string {
  return (
    value
      .trim()
      .replace(/[^\p{L}\p{N}._-]+/gu, "_")
      .slice(0, 80) || "graph"
  );
}

export function ExperimentGraphWorkbench({
  draft,
  cells,
  onClose,
  workspaceMode = "combined",
  analysisRunner = defaultAnalysisRunner,
  initialState,
  onStateChange,
}: ExperimentGraphWorkbenchProps) {
  const [selectedReadoutId, setSelectedReadoutId] = useState(
    initialState?.selectedReadoutId ?? draft.readouts[0]?.id ?? "",
  );
  const [selectedConditionIds, setSelectedConditionIds] = useState<string[]>(() =>
    initialState ? [...initialState.selectedConditionIds] : draft.conditions.map(({ id }) => id),
  );
  const [selectedTimePointIds, setSelectedTimePointIds] = useState<string[]>(() =>
    initialState ? [...initialState.selectedTimePointIds] : draft.time.points.map(({ id }) => id),
  );
  const [analysisTimePointId, setAnalysisTimePointId] = useState<string | null>(
    initialState?.analysisTimePointId ??
      (draft.time.points.length === 1 ? (draft.time.points[0]?.id ?? null) : null),
  );
  const [timeAnalysis, setTimeAnalysis] = useState<TimeAnalysisPlan>(
    initialState?.analysisMetric ?? { kind: "selected_timepoint" },
  );
  const [sourceMode, setSourceMode] = useState<"raw_readout" | "derived_metric">(
    initialState?.sourceMode ?? "raw_readout",
  );
  const [correlationMethod, setCorrelationMethod] = useState<"pearson" | "spearman" | undefined>(
    initialState?.analysis?.request.method === "pearson" ||
      initialState?.analysis?.request.method === "spearman"
      ? initialState.analysis.request.method
      : undefined,
  );
  const [selectedStatisticalMethod, setSelectedStatisticalMethod] = useState<
    AnalysisRecommendation["recommendedMethod"] | undefined
  >(initialState?.analysis?.request.method);
  const [contrastIntent, setContrastIntent] = useState<ContrastIntent>(() => {
    const request = initialState?.analysis?.request;
    return request?.protocolVersion === "0.2.0" ? request.contrastIntent : "all_pairs";
  });
  const [plannedContrastConditionIds, setPlannedContrastConditionIds] = useState<
    Array<readonly [string, string]>
  >(() => {
    const request = initialState?.analysis?.request;
    return request?.protocolVersion === "0.2.0"
      ? (request.plannedContrastConditionIds ?? []).map(([firstId, secondId]) => [
          firstId,
          secondId,
        ])
      : [];
  });
  const [layers, setLayers] = useState<LayerState>(initialState?.layers ?? DEFAULT_LAYERS);
  const [appearance, setAppearance] = useState<GraphAppearance>({
    ...DEFAULT_APPEARANCE,
    ...initialState?.appearance,
  });
  const [graphType, setGraphType] = useState<GraphType>(initialState?.graphType ?? "dot");
  const [axes, setAxes] = useState<AxisSettings>(
    initialState?.axes ?? {
      xSemantic: draft.time.points.length > 0 ? orderedAxisSemantic(draft.time) : "categorical",
      xTitle: draft.time.points.length > 0 ? orderedAxisTitle(draft.time) : "",
      xUnit: draft.time.points.length > 0 ? orderedAxisUnit(draft.time) : "",
      yTitle: defaultGraphYTitle(draft.readouts[0]),
      yRangeMode: "auto",
      yMin: null,
      yMax: null,
      yScale: "linear",
      showCategoryLabels: true,
      hierarchyOrder: draft.attributes.map(({ id }) => id),
      spacing: 1,
      yTickMode: "auto",
      yTickInterval: null,
    },
  );
  const [analysis, setAnalysis] = useState<WorkspaceGraphAnalysis | null>(
    initialState?.analysis ?? null,
  );
  const [statisticsAnnotation, setStatisticsAnnotation] = useState<StatisticsAnnotation>(
    initialState?.statisticsAnnotation ?? { mode: "hidden", testIndex: 0 },
  );
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget>(
    workspaceMode === "statistics" ? "statistics" : "data",
  );
  const [fitOverview, setFitOverview] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [benchmarkCaptureStatus, setBenchmarkCaptureStatus] = useState<string | null>(null);
  const benchmarkRun = useBenchmarkRun();
  const analysisResult = analysis?.result ?? null;
  const methodsText = useMemo(() => {
    if (!analysis || analysis.result.status !== "ok") return null;
    const design = createExperimentWorkspaceDesign(draft, analysis.result.completedAt);
    const recommendation =
      analysis.recommendation ?? createWorkspaceRecommendation(analysis.request, design);
    const base = generateMethodsText({
      design,
      recommendation: {
        ...recommendation,
        ...(analysis.recommendedMethod ? { recommendedMethod: analysis.recommendedMethod } : {}),
      },
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
    if (timeAnalysis.kind === "selected_timepoint" || timeAnalysis.kind === "full_time_course")
      return base;
    const window = `${timeAnalysis.windowStart ?? "最初"}～${timeAnalysis.windowEnd ?? "最後"} ${draft.time.unit}`;
    const baseline =
      timeAnalysis.kind === "change_from_baseline" || timeAnalysis.kind === "f_over_f0"
        ? `。baseline=${timeAnalysis.baselineTime ?? "最初の時点"} ${draft.time.unit}`
        : "";
    return `${base}\n時系列の派生値：${timeMetricLabel(timeAnalysis)}。解析window=${window}${baseline}。raw時系列と変換設定はプロジェクトに保持。`;
  }, [
    analysis,
    appearance.errorBar,
    axes.xSemantic,
    axes.xTitle,
    axes.xUnit,
    draft,
    layers.errorBar,
    selectedReadoutId,
    timeAnalysis,
  ]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const graphStateSnapshot = useMemo<Omit<WorkspaceGraphState, "id" | "displayName">>(
    () => ({
      selectedReadoutId,
      sourceMode,
      selectedConditionIds,
      selectedTimePointIds,
      analysisTimePointId,
      analysisMetric: timeAnalysis,
      graphType,
      layers,
      appearance,
      axes,
      statisticsAnnotation,
      analysisRunId: analysis ? (initialState?.analysisRunId ?? null) : null,
      analysis,
    }),
    [
      analysis,
      analysisTimePointId,
      appearance,
      axes,
      graphType,
      initialState?.analysisRunId,
      layers,
      selectedConditionIds,
      selectedReadoutId,
      selectedTimePointIds,
      sourceMode,
      statisticsAnnotation,
      timeAnalysis,
    ],
  );
  const benchmarkRenderedState = JSON.stringify({
    selectedReadoutId,
    sourceMode,
    selectedConditionIds,
    selectedTimePointIds,
    graphType,
    layers,
    appearance,
    axes,
    statisticsAnnotation,
    displayedDerivedMetric:
      sourceMode === "derived_metric" && isDerivedTimeMetric(timeAnalysis) ? timeAnalysis : null,
  });
  const benchmarkAnalysisState = JSON.stringify({
    selectedReadoutId,
    sourceMode,
    selectedConditionIds,
    selectedTimePointIds,
    analysisTimePointId,
    analysisMetric: timeAnalysis,
    selectedStatisticalMethod,
    correlationMethod: correlationMethod ?? null,
    contrastIntent,
    plannedContrastConditionIds,
    executedMethod: analysis?.request.method ?? null,
    executedProtocolVersion: analysis?.request.protocolVersion ?? null,
    executedCorrection: analysis?.request.options.multiplicityMethod ?? null,
  });

  useEffect(() => {
    setInspectorTarget(workspaceMode === "statistics" ? "statistics" : "data");
  }, [workspaceMode]);

  useEffect(() => {
    if (initialState?.analysis) return;
    setAnalysis(null);
    setStatisticsAnnotation({ mode: "hidden", testIndex: 0 });
  }, [initialState?.analysis]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    onStateChangeRef.current?.(graphStateSnapshot);
  }, [graphStateSnapshot]);

  const diagnosticGraphStateRef = useRef<string | null>(null);
  useEffect(() => {
    const fingerprint = diagnosticFingerprint(benchmarkRenderedState);
    if (diagnosticGraphStateRef.current === fingerprint) return;
    diagnosticGraphStateRef.current = fingerprint;
    recordDiagnosticEvent("graph_state_changed", { graphType, graphFingerprint: fingerprint });
  }, [benchmarkRenderedState, graphType]);

  const benchmarkStateLogRef = useRef<{
    identity: string;
    rendered: string;
    analysis: string;
  } | null>(null);
  useEffect(() => {
    if (!evaluationModeIsConfigured(evaluationMode) || !benchmarkRun.identity) return;
    const identity = `${benchmarkRun.identity.caseId}:${benchmarkRun.identity.track}:${benchmarkRun.identity.runId}`;
    const previous = benchmarkStateLogRef.current;
    benchmarkStateLogRef.current = {
      identity,
      rendered: benchmarkRenderedState,
      analysis: benchmarkAnalysisState,
    };
    if (!previous || previous.identity !== identity) {
      recordBenchmarkEvent("graph_workspace_opened", {
        selectedGraph: graphType,
        readoutId: selectedReadoutId,
      });
      return;
    }
    const renderedChanged = previous.rendered !== benchmarkRenderedState;
    const analysisChanged = previous.analysis !== benchmarkAnalysisState;
    if (!renderedChanged && !analysisChanged) return;
    recordBenchmarkEvent(
      renderedChanged ? "graph_configuration_changed" : "analysis_configuration_changed",
      {
        graphType,
        readoutId: selectedReadoutId,
        sourceMode,
        selectedConditions: selectedConditionIds.join("|"),
        selectedTimes: selectedTimePointIds.join("|"),
        timeMetric: timeAnalysis.kind,
        selectedMethod: selectedStatisticalMethod ?? null,
        annotationMode: statisticsAnnotation.mode,
        pointSize: appearance.pointSize,
        errorBar: appearance.errorBar,
        spacing: axes.spacing,
        legendPosition: appearance.legendPosition,
        palette: appearance.palette,
        fontFamily: appearance.fontFamily,
        graphTitleFontSize: appearance.graphTitleFontSize,
        axisTitleFontSize: appearance.axisTitleFontSize,
        tickFontSize: appearance.tickFontSize,
        hierarchyFontSize: appearance.hierarchyFontSize,
        legendFontSize: appearance.legendFontSize,
        axisTitle: axes.yTitle,
        axisRangeMode: axes.yRangeMode,
        axisMin: axes.yMin,
        axisMax: axes.yMax,
        axisScale: axes.yScale,
        axisTickMode: axes.yTickMode,
        axisTickInterval: axes.yTickInterval,
        rawLayer: layers.raw,
        distributionLayer: layers.distribution,
        boxLayer: layers.box,
        experimentLayer: layers.experiment,
        overallLayer: layers.overall,
        summaryLineWidth: appearance.summaryLineWidth,
        axisLineWidth: appearance.axisLineWidth,
        errorBarLineWidth: appearance.errorBarLineWidth,
        connectingLineWidth: appearance.connectingLineWidth,
        distributionLineWidth: appearance.distributionLineWidth,
      },
      renderedChanged && analysisChanged
        ? "both"
        : renderedChanged
          ? "rendered_graph"
          : "analysis_only",
    );
  }, [
    benchmarkAnalysisState,
    benchmarkRenderedState,
    benchmarkRun.identity,
    selectedReadoutId,
    graphType,
    selectedStatisticalMethod,
    statisticsAnnotation.mode,
  ]);

  const readout = draft.readouts.find((item) => item.id === selectedReadoutId) ?? draft.readouts[0];
  const activeReadoutId = readout?.id ?? "";
  const activeConditionIds = new Set(selectedConditionIds);
  const activeConditions = draft.conditions.filter((condition) =>
    activeConditionIds.has(condition.id),
  );
  const activeTimePoints = draft.time.points.filter((point) =>
    selectedTimePointIds.includes(point.id),
  );
  const timeLabel =
    sourceMode === "derived_metric" && isDerivedTimeMetric(timeAnalysis)
      ? `派生値：${timeMetricLabel(timeAnalysis)}`
      : activeTimePoints.length
        ? activeTimePoints.map((point) => `${point.value} ${draft.time.unit}`).join("、")
        : draft.time.sampling === "none"
          ? undefined
          : "時点未選択";

  const series = useMemo<readonly GraphSeries[]>(() => {
    if (!readout) return [];
    const showDerivedMetric = sourceMode === "derived_metric" && isDerivedTimeMetric(timeAnalysis);
    const timePoints = showDerivedMetric
      ? [undefined]
      : draft.time.points.length > 0
        ? activeTimePoints
        : [undefined];
    return activeConditions.flatMap((condition) =>
      timePoints.map((timePoint) => {
        const proportionPoints: ProportionPoint[] = [];
        const experimentPoints: ExperimentPoint[] = [];
        const rawPoints: RawPoint[] = [];
        draft.experiments.forEach((experiment) => {
          const pointUnitId =
            draft.conditionAssignment.kind === "matched"
              ? (experiment.stableUnitId ?? experiment.id)
              : `${experiment.stableUnitId ?? experiment.id}.${condition.id}`;
          if (showDerivedMetric) {
            const value = deriveTimeMetricValue({
              draft,
              cells,
              experimentId: experiment.id,
              conditionId: condition.id,
              readoutId: readout.id,
              plan: timeAnalysis,
            });
            if (value !== null && Number.isFinite(value)) {
              experimentPoints.push({
                experimentId: pointUnitId,
                experimentLabel: experiment.label,
                value,
              });
            }
            return;
          }
          const cell = getCell(cells, experiment.id, condition.id, readout.id, timePoint?.id);
          if (cellIsNotPlanned(cell)) return;
          if (readout.shape === "proportion" && isProportionCell(cell)) {
            const value = percentage(cell);
            if (
              value !== null &&
              Number.isFinite(value) &&
              cell.positive !== null &&
              cell.eligible !== null
            ) {
              proportionPoints.push({
                experimentId: pointUnitId,
                experimentLabel: experiment.label,
                value,
                positive: cell.positive,
                eligible: cell.eligible,
              });
            }
          }
          if (readout.shape === "nested_continuous" && isNestedCell(cell)) {
            const values = cell.rawValues.filter(Number.isFinite);
            values.forEach((value) =>
              rawPoints.push({
                experimentId: pointUnitId,
                experimentLabel: experiment.label,
                value,
                index: rawPoints.length,
              }),
            );
            const summary = continuousSummary(values);
            if (summary.mean !== null) {
              experimentPoints.push({
                experimentId: pointUnitId,
                experimentLabel: experiment.label,
                value: summary.mean,
              });
            }
          }
          if (readout.shape === "wb_ratio" && isWbRatioCell(cell)) {
            const valuesByCondition = Object.fromEntries(
              activeConditions.map(({ id }) => {
                const candidate = getCell(cells, experiment.id, id, readout.id, timePoint?.id);
                return [id, isWbRatioCell(candidate) ? wbRatio(candidate) : null];
              }),
            );
            const value = normalizeWithinExperiment(
              wbRatio(cell),
              valuesByCondition,
              condition.id,
              readout,
            );
            if (value !== null && Number.isFinite(value)) {
              experimentPoints.push({
                experimentId: pointUnitId,
                experimentLabel: experiment.label,
                value,
              });
            }
          }
        });
        const values =
          !showDerivedMetric && readout.shape === "proportion"
            ? proportionPoints.map((point) => point.value)
            : experimentPoints.map((point) => point.value);
        return {
          seriesKey: `${condition.id}::${timePoint?.id ?? "time.none"}`,
          conditionId: condition.id,
          conditionLabel: condition.label,
          timePointId: timePoint?.id,
          timeLabel: timePoint
            ? `${timePoint.value} ${axes.xUnit.trim() || draft.time.unit}`
            : undefined,
          proportionPoints,
          experimentPoints,
          rawPoints,
          summary: continuousSummary(values),
        };
      }),
    );
  }, [
    activeConditions,
    activeTimePoints,
    cells,
    draft.experiments,
    draft.time.points.length,
    draft.time.unit,
    axes.xUnit,
    readout,
    sourceMode,
    timeAnalysis,
  ]);

  const derivedLineageRows =
    sourceMode === "derived_metric" && isDerivedTimeMetric(timeAnalysis) && readout
      ? draft.experiments.flatMap((experiment) =>
          activeConditions.flatMap((condition) => {
            const value = deriveTimeMetricValue({
              draft,
              cells,
              experimentId: experiment.id,
              conditionId: condition.id,
              readoutId: readout.id,
              plan: timeAnalysis,
            });
            if (value === null) return [];
            const sourceTrace = draft.time.points
              .filter(
                ({ value: time }) =>
                  (timeAnalysis.windowStart === undefined || time >= timeAnalysis.windowStart) &&
                  (timeAnalysis.windowEnd === undefined || time <= timeAnalysis.windowEnd),
              )
              .flatMap((point) => {
                const sourceValue = graphCellValue(
                  getCell(cells, experiment.id, condition.id, readout.id, point.id),
                );
                return sourceValue === null ? [] : [`${point.value}: ${formatNumber(sourceValue)}`];
              });
            return [
              {
                id: `${experiment.id}:${condition.id}`,
                unit: experiment.label,
                condition: condition.label,
                value,
                sourceTrace,
              },
            ];
          }),
        )
      : [];

  const shape =
    sourceMode === "derived_metric" && isDerivedTimeMetric(timeAnalysis)
      ? "nested_continuous"
      : (readout?.shape ?? "proportion");
  const axisLabels = useMemo(() => {
    if (appearance.hierarchicalLabels)
      return buildConditionAxisLabels(draft, series, axes.hierarchyOrder);
    return series.map((item) => ({
      conditionId: item.conditionId,
      levels: [{ id: "condition", label: "条件", value: item.conditionLabel }],
      timeLabel: item.timeLabel ?? "",
    }));
  }, [appearance.hierarchicalLabels, axes.hierarchyOrder, draft, series]);
  const baseAnnotationContext = analysis
    ? graphAnnotationContext({
        request: analysis.request,
        timeAnalysis,
        analysisTimePointId,
        draft,
        axes,
      })
    : "selected analysis";
  const annotationContext = analysisResult?.tests[statisticsAnnotation.testIndex]
    ? analysisTestAnnotationLabel(
        analysisResult.tests[statisticsAnnotation.testIndex],
        draft,
        baseAnnotationContext,
      )
    : baseAnnotationContext;
  const compositionHasData =
    shape === "categorical_counts" &&
    Object.values(cells).some(
      (cell) => cell?.kind === "categorical_counts" && categoricalTotal(cell) !== null,
    );
  const hasData =
    compositionHasData ||
    series.some((item) =>
      sourceMode === "derived_metric"
        ? item.experimentPoints.length > 0
        : shape === "proportion"
          ? item.proportionPoints.length > 0
          : shape === "nested_continuous"
            ? item.rawPoints.length > 0
            : item.experimentPoints.length > 0,
    );
  const analysisAssessment = useMemo(
    () =>
      assessDraftGraphAnalysis({
        draft,
        cells,
        readoutId: activeReadoutId,
        conditionIds: selectedConditionIds,
        timePointId: analysisTimePointId ?? undefined,
        timeAnalysis,
        correlationMethod,
        selectedMethod: selectedStatisticalMethod,
        contrastIntent,
        plannedContrastConditionIds,
        withinFactor: {
          role: axes.xSemantic,
          title: axes.xTitle,
          unit: axes.xUnit,
        },
      }),
    [
      activeReadoutId,
      analysisTimePointId,
      cells,
      contrastIntent,
      correlationMethod,
      draft,
      selectedConditionIds,
      selectedStatisticalMethod,
      plannedContrastConditionIds,
      axes.xSemantic,
      axes.xTitle,
      axes.xUnit,
      timeAnalysis,
    ],
  );
  const analysisContextKey = JSON.stringify({
    readoutId: activeReadoutId,
    sourceMode,
    conditionIds: selectedConditionIds,
    displayedTimePointIds: selectedTimePointIds,
    analysisTimePointId,
    plannedContrastConditionIds,
    timeAnalysis,
    stableUnits: draft.experiments.map(({ id, sessionId, stableUnitId }) => ({
      id,
      sessionId: sessionId ?? id,
      stableUnitId: stableUnitId ?? id,
    })),
  });
  useLayoutEffect(() => {
    if (
      !evaluationModeIsConfigured(evaluationMode) ||
      !benchmarkRun.identity ||
      benchmarkRun.defaultGraphCapture ||
      !hasData ||
      workspaceMode === "statistics"
    )
      return;
    const svg = svgRef.current;
    if (!svg) return;
    const svgText = serializeGraphSvg(svg);
    const viewBox = svg.viewBox.baseVal;
    const capturedAt = new Date().toISOString();
    if (!beginDefaultGraphCapture(capturedAt)) return;
    void (async () => {
      try {
        const png = await svgToPngBlob(
          svgText,
          viewBox.width || svg.width.baseVal.value || 900,
          viewBox.height || svg.height.baseVal.value || 520,
        );
        const [svgSha256, pngSha256, analysisStateFingerprint] = await Promise.all([
          sha256Hex(svgText),
          sha256Hex(png),
          sha256Hex(benchmarkAnalysisState),
        ]);
        await writeBenchmarkArtifacts([
          { name: "default_graph.svg", content: svgText, mediaType: "image/svg+xml" },
          {
            name: "default_graph.png",
            content: await blobToBase64(png),
            encoding: "base64",
            mediaType: "image/png",
          },
        ]);
        completeDefaultGraphCapture({
          graphStateFingerprint: svgSha256,
          analysisStateFingerprint,
          svgSha256,
          pngSha256,
        });
        setBenchmarkCaptureStatus("Benchmarkの既定グラフを保存しました。");
      } catch (error) {
        recordDiagnosticError("GRAPH_EXPORT_FAILED", error);
        setBenchmarkCaptureStatus("既定グラフの評価artifactを保存できませんでした。");
      }
    })();
  }, [
    benchmarkAnalysisState,
    benchmarkRun.defaultGraphCapture,
    benchmarkRun.events.length,
    benchmarkRun.identity,
    hasData,
    workspaceMode,
  ]);
  const varyingStatisticalAttributes = draft.attributes.filter(
    (attribute) =>
      new Set(
        activeConditions
          .map((condition) => condition.attributes[attribute.id]?.trim())
          .filter(Boolean),
      ).size > 1,
  );
  const hasFactorByTimeStructure =
    draft.time.points.length > 1 && varyingStatisticalAttributes.length > 1;
  const handleConditionChange = (event: ChangeEvent<HTMLInputElement>) => {
    const conditionId = event.target.value;
    setSelectedConditionIds((current) =>
      event.target.checked
        ? [...current, conditionId]
        : current.filter((selectedId) => selectedId !== conditionId),
    );
    setAnalysis(null);
  };
  const handleTimePointChange = (event: ChangeEvent<HTMLInputElement>) => {
    const timePointId = event.target.value;
    setSelectedTimePointIds((current) =>
      event.target.checked
        ? [...current, timePointId]
        : current.filter((selectedId) => selectedId !== timePointId),
    );
    setAnalysis(null);
  };
  const applyPreset = (preset: "simple" | "publication" | "presentation" | "raw" | "replicate") => {
    const restrainedLayers = defaultLayersForGraphType(graphType, shape);
    if (preset === "raw") {
      setLayers({
        ...DEFAULT_LAYERS,
        raw: true,
        distribution: true,
        experiment: true,
        overall: false,
      });
      setAppearance((current) => ({ ...current, palette: "condition" }));
      return;
    }
    if (preset === "replicate") {
      setLayers({
        ...DEFAULT_LAYERS,
        raw: false,
        distribution: false,
        box: false,
        experiment: true,
        overall: true,
      });
      setAppearance(DEFAULT_APPEARANCE);
      return;
    }
    if (preset === "publication") {
      setLayers(restrainedLayers);
      setAppearance({ ...DEFAULT_APPEARANCE, pointSize: 6, axisLineWidth: 1.4 });
      return;
    }
    if (preset === "presentation") {
      setLayers(restrainedLayers);
      setAppearance({
        ...DEFAULT_APPEARANCE,
        palette: "condition",
        pointSize: 8,
        axisLineWidth: 2,
      });
      return;
    }
    setLayers(restrainedLayers);
    setAppearance(DEFAULT_APPEARANCE);
  };
  const graphTypeLabel: Record<GraphType, string> = {
    dot: "Dot",
    paired_dot: "Paired / matched dot",
    box: "Box",
    violin: "Violin",
    bar: "Bar",
    line: "Line / Time course",
    scatter: "Scatter",
    stacked: "Stacked count",
    stacked_100: "100% stacked",
    category_percentage: "Category percentage",
  };
  const activeLayerDescription = describeActiveGraphLayers({
    graphType,
    shape,
    layers,
    errorBar: appearance.errorBar,
    timeSampling: draft.time.sampling,
    matched: draft.conditionAssignment.kind === "matched",
  });
  const exportSvg = () => {
    if (!svgRef.current || !readout) return;
    downloadTextFile(
      serializeGraphSvg(svgRef.current),
      `${safeFileStem(readout.label)}.svg`,
      "image/svg+xml;charset=utf-8",
    );
  };
  const exportCsv = () => {
    if (!readout) return;
    downloadTextFile(
      readout.shape === "categorical_counts"
        ? serializeCompositionData(
            draft,
            cells,
            readout,
            selectedConditionIds,
            selectedTimePointIds,
          )
        : serializeVisibleGraphData(series, readout.shape),
      `${safeFileStem(readout.label)}-graph-data.csv`,
      "text/csv;charset=utf-8",
    );
  };
  const finalizeBenchmarkRun = async () => {
    const svg = svgRef.current;
    const run = currentBenchmarkRun();
    if (!svg || !run.identity || !run.supportStatus || !analysis || !methodsText) {
      setBenchmarkCaptureStatus(
        "完了前にBenchmark runを開始し、対応状況を選び、統計解析を実行してください。",
      );
      return;
    }
    setBenchmarkCaptureStatus("評価artifactを保存中…");
    try {
      const svgText = serializeGraphSvg(svg);
      const viewBox = svg.viewBox.baseVal;
      const png = await svgToPngBlob(
        svgText,
        viewBox.width || svg.width.baseVal.value || 900,
        viewBox.height || svg.height.baseVal.value || 520,
      );
      const capturedAt = new Date().toISOString();
      const [svgSha256, pngSha256, analysisStateFingerprint] = await Promise.all([
        sha256Hex(svgText),
        sha256Hex(png),
        sha256Hex(benchmarkAnalysisState),
      ]);
      recordFinalGraphCapture({
        capturedAt,
        graphStateFingerprint: svgSha256,
        analysisStateFingerprint,
        svgSha256,
        pngSha256,
      });
      setBenchmarkOutcome("completed");
      recordBenchmarkEvent("benchmark_run_finalized", {
        selectedGraph: graphType,
        selectedStatistics: analysis.request.method,
      });
      const finalRun = currentBenchmarkRun();
      const statisticsArtifact = {
        selectedReadoutId,
        selectedConditionIds,
        statisticalUnit: draft.conditionAssignment.unitLabel,
        recommendation:
          analysis.recommendation ??
          createWorkspaceRecommendation(
            analysis.request,
            createExperimentWorkspaceDesign(draft, analysis.result.completedAt),
          ),
        recommendedMethod:
          analysis.recommendation?.recommendedMethod ??
          analysis.recommendedMethod ??
          analysisAssessment.recommendedMethod,
        selectedMethod: analysis.request.method,
        recommendationDiffers:
          (analysis.recommendation?.recommendedMethod ??
            analysis.recommendedMethod ??
            analysisAssessment.recommendedMethod) !== analysis.request.method,
        contrast:
          analysis.request.protocolVersion === "0.1.0"
            ? analysis.request.contrastConditionIds
            : analysis.request.protocolVersion === "0.2.0"
              ? {
                  intent: analysis.request.contrastIntent,
                  controlConditionId: analysis.request.controlConditionId ?? null,
                  plannedConditionPairs: analysis.request.plannedContrastConditionIds ?? [],
                }
              : analysis.request.protocolVersion === "0.5.0"
                ? analysis.request.variableConditionIds
                : analysis.request.protocolVersion === "0.11.0"
                  ? {
                      rows: analysis.request.rowCategoryIds,
                      columns: analysis.request.columnCategoryIds,
                    }
                  : analysis.request.protocolVersion === "0.12.0"
                    ? analysis.request.conditionIds
                    : analysis.request.protocolVersion === "0.13.0"
                      ? { x: analysis.request.xLabel, y: analysis.request.yLabel }
                      : analysis.request.protocolVersion === "0.6.0" ||
                          analysis.request.protocolVersion === "0.7.0" ||
                          analysis.request.protocolVersion === "0.8.0" ||
                          analysis.request.protocolVersion === "0.10.0"
                        ? analysis.request.conditionIds
                        : analysis.request.protocolVersion === "0.9.0"
                          ? {
                              conditionId: analysis.request.conditionId,
                              referenceValue: analysis.request.nullValue,
                            }
                          : analysis.request.primaryContrastConditionIds,
        nByCondition: analysisAssessment.nByCondition,
        correction: analysis.request.options.multiplicityMethod,
        request: analysis.request,
        result: analysis.result,
        state: "current",
        applicationVersion: PRODUCT_IDENTITY.version,
      };
      await writeBenchmarkArtifacts(
        [
          {
            name: "run.json",
            content: JSON.stringify(
              {
                ...finalRun.identity,
                appVersion: PRODUCT_IDENTITY.version,
                sourceRevision: evaluationMode.sourceRevision,
                engineVersion: analysis.result.engine.version,
                startedAt: finalRun.startedAt,
                completedAt: new Date().toISOString(),
                outcome: finalRun.outcome,
                supportStatus: finalRun.supportStatus,
                artifactCompleteness: "complete",
                defaultGraphCaptured: finalRun.defaultGraphCaptured,
                captureProvenanceVersion: "1.1.0",
                defaultCapturedAt: finalRun.defaultGraphCapture?.capturedAt ?? null,
                defaultCapturedEventIndex: finalRun.defaultGraphCapture?.eventIndex ?? null,
                finalCapturedAt: finalRun.finalGraphCapture?.capturedAt ?? null,
                finalCapturedEventIndex: finalRun.finalGraphCapture?.eventIndex ?? null,
                defaultGraphStateFingerprint:
                  finalRun.defaultGraphCapture?.graphStateFingerprint ?? null,
                finalGraphStateFingerprint:
                  finalRun.finalGraphCapture?.graphStateFingerprint ?? null,
                defaultAnalysisStateFingerprint:
                  finalRun.defaultGraphCapture?.analysisStateFingerprint ?? null,
                finalAnalysisStateFingerprint:
                  finalRun.finalGraphCapture?.analysisStateFingerprint ?? null,
                defaultSvgSha256: finalRun.defaultGraphCapture?.svgSha256 ?? null,
                defaultPngSha256: finalRun.defaultGraphCapture?.pngSha256 ?? null,
                finalSvgSha256: finalRun.finalGraphCapture?.svgSha256 ?? null,
                finalPngSha256: finalRun.finalGraphCapture?.pngSha256 ?? null,
                interactionCount: finalRun.events.length,
                graphEditCount: finalRun.events.filter(
                  ({ type }) => type === "graph_configuration_changed",
                ).length,
                renderedGraphEditCount: finalRun.events.filter(
                  ({ effect }) => effect === "rendered_graph" || effect === "both",
                ).length,
                analysisEditCount: finalRun.events.filter(
                  ({ effect }) => effect === "analysis_only" || effect === "both",
                ).length,
              },
              null,
              2,
            ),
          },
          { name: "final_graph.svg", content: svgText, mediaType: "image/svg+xml" },
          {
            name: "final_graph.png",
            content: await blobToBase64(png),
            encoding: "base64",
            mediaType: "image/png",
          },
          { name: "statistics.json", content: JSON.stringify(statisticsArtifact, null, 2) },
          { name: "methods.txt", content: methodsText },
          { name: "graph_state.json", content: JSON.stringify(graphStateSnapshot, null, 2) },
          {
            name: "interaction_log.json",
            content: JSON.stringify(finalRun.events, null, 2),
          },
        ],
        { requiredArtifacts: COMPLETE_BENCHMARK_ARTIFACT_NAMES },
      );
      setBenchmarkCaptureStatus("Benchmark runのartifactを保存しました。");
    } catch (error) {
      recordDiagnosticError("GRAPH_EXPORT_FAILED", error);
      setBenchmarkOutcome("infrastructure_failure");
      setBenchmarkCaptureStatus("Benchmark runのartifactを保存できませんでした。");
    }
  };
  const copyGraph = async () => {
    if (!svgRef.current) return;
    setCopyStatus(null);
    try {
      const format = await copyGraphToClipboard(svgRef.current);
      setCopyStatus(
        format === "svg"
          ? "ベクター形式でコピーしました。"
          : format === "png"
            ? "透明背景のPNGでコピーしました。"
            : "SVGテキストでコピーしました。",
      );
    } catch (error) {
      recordDiagnosticError("GRAPH_EXPORT_FAILED", error);
      setCopyStatus(
        "この環境ではクリップボードへコピーできませんでした。SVG書き出しを利用してください。",
      );
    }
  };
  const inspectGraphPart = (target: InspectorTarget) => {
    if (workspaceMode === "graph" && target === "statistics") return;
    setInspectorTarget(target);
  };
  const moveHierarchy = (attributeId: string, direction: -1 | 1) => {
    setAxes((current) => {
      const order =
        current.hierarchyOrder.length > 0
          ? [...current.hierarchyOrder]
          : draft.attributes.map(({ id }) => id);
      const index = order.indexOf(attributeId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return current;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return { ...current, hierarchyOrder: order };
    });
  };

  return (
    <section
      className={`experiment-graph-workbench experiment-graph-workbench--${workspaceMode}`}
      aria-label={workspaceMode === "statistics" ? "統計ワークスペース" : "実験からグラフを作成"}
    >
      <header className="experiment-graph-workbench-header">
        <div>
          <p className="experiment-graph-overline">
            {workspaceMode === "statistics" ? "統計" : "グラフ作成"}
          </p>
          <h2>{readout?.label ?? "測定項目を選択"}</h2>
          <p className="experiment-graph-subtitle">
            {timeLabel ? `時点：${timeLabel}` : "実験単位ごとの値を比較"}
            {workspaceMode !== "statistics" ? " · 図の要素をクリックして設定" : ""}
          </p>
        </div>
        <button type="button" className="experiment-graph-close" onClick={onClose}>
          閉じる
        </button>
      </header>

      <div className="experiment-graph-workbench-layout">
        {workspaceMode !== "statistics" ? (
          <section className="experiment-graph-canvas-panel" aria-label="グラフプレビュー">
            <div className="experiment-graph-canvas-heading">
              <div>
                <p className="experiment-graph-overline">{graphTypeLabel[graphType]}</p>
                <h3 style={{ fontSize: appearance.graphTitleFontSize, color: "#000" }}>
                  {activeLayerDescription}
                </h3>
              </div>
              <div className="experiment-graph-export-actions" aria-label="グラフの書き出し">
                <button
                  type="button"
                  aria-label="グラフをコピー"
                  disabled={!hasData}
                  onClick={() => void copyGraph()}
                >
                  コピー
                </button>
                <button
                  type="button"
                  aria-label="SVGを書き出す"
                  disabled={!hasData}
                  onClick={exportSvg}
                >
                  SVG
                </button>
                <button
                  type="button"
                  aria-label="表示データCSV"
                  disabled={!hasData}
                  onClick={exportCsv}
                >
                  CSV
                </button>
                {evaluationModeIsConfigured(evaluationMode) ? (
                  <button
                    type="button"
                    aria-label="Benchmark runを完了"
                    disabled={
                      !hasData ||
                      !benchmarkRun.identity ||
                      !benchmarkRun.supportStatus ||
                      !benchmarkRun.defaultGraphCaptured ||
                      !analysis
                    }
                    onClick={() => void finalizeBenchmarkRun()}
                  >
                    Benchmark完了
                  </button>
                ) : null}
              </div>
            </div>
            {copyStatus ? (
              <p className="experiment-graph-copy-status" role="status">
                {copyStatus}
              </p>
            ) : null}
            {benchmarkCaptureStatus ? <p role="status">{benchmarkCaptureStatus}</p> : null}
            {hasData ? (
              <div className="experiment-graph-view-controls" role="group" aria-label="表示倍率">
                <button
                  className={!fitOverview ? "is-active" : ""}
                  type="button"
                  aria-pressed={!fitOverview}
                  onClick={() => setFitOverview(false)}
                >
                  読みやすい表示
                </button>
                <button
                  className={fitOverview ? "is-active" : ""}
                  type="button"
                  aria-pressed={fitOverview}
                  onClick={() => setFitOverview(true)}
                >
                  全体表示
                </button>
              </div>
            ) : null}
            {hasData && readout ? (
              <div
                className={`experiment-graph-stage experiment-graph-stage--${appearance.legendPosition}`}
              >
                <div
                  className={`experiment-graph-svg-scroll${fitOverview ? " is-fit-overview" : ""}`}
                  data-view-mode={fitOverview ? "fit" : "readable"}
                >
                  {shape === "categorical_counts" &&
                  (graphType === "stacked" ||
                    graphType === "stacked_100" ||
                    graphType === "category_percentage") ? (
                    <CompositionGraphSvg
                      draft={draft}
                      cells={cells}
                      readout={readout}
                      conditionIds={selectedConditionIds}
                      timePointIds={selectedTimePointIds}
                      graphType={graphType}
                      appearance={appearance}
                      svgRef={svgRef}
                    />
                  ) : graphType === "scatter" && draft.analysisIntent.kind === "correlation" ? (
                    <CorrelationGraphSvg
                      series={series}
                      appearance={appearance}
                      axes={axes}
                      svgRef={svgRef}
                      analysisResult={analysisResult}
                      statisticsAnnotation={statisticsAnnotation}
                      onInspect={inspectGraphPart}
                    />
                  ) : (
                    <ExperimentGraphSvg
                      shape={shape === "proportion" ? "proportion" : "nested_continuous"}
                      readoutLabel={readout.label}
                      readoutUnit={readout.unit}
                      timeSampling={draft.time.sampling}
                      conditionAssignment={draft.conditionAssignment}
                      axisLabels={axisLabels}
                      series={series}
                      layers={layers}
                      appearance={appearance}
                      graphType={graphType}
                      axes={axes}
                      svgRef={svgRef}
                      analysisResult={analysisResult}
                      statisticsAnnotation={statisticsAnnotation}
                      annotationContext={annotationContext}
                      layerDescription={activeLayerDescription}
                      onInspect={inspectGraphPart}
                      activeInspectorTarget={inspectorTarget}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="experiment-graph-empty" role="status">
                表示する条件と値を選択してください。
              </div>
            )}
            <p className="experiment-graph-caption">
              {shape === "categorical_counts"
                ? "カテゴリ別countを保持し、構成割合を自動計算しています。連続値として扱わず、カテゴリ構成の推論統計はまだ実行しません。"
                : draft.analysisIntent.kind === "correlation"
                  ? "各点は同じ実験単位から得たXとYの完全な1組です。行順や日付から対応を推測していません。"
                  : shape === "wb_ratio"
                    ? `各点は実験単位（Exp）ごとの${readout.label} / ${readout.referenceLabel ?? "reference"}です。標的とreferenceの生値は別々に保持しています。`
                    : shape === "proportion"
                      ? `現在の表示：${activeLayerDescription}。割合と要約は実験単位（Exp）から計算しています。`
                      : `現在の表示：${activeLayerDescription}。細胞・ROIなどの生データを表示しても、統計上のnは実験単位です。`}
            </p>
            <details className="experiment-graph-data-details">
              <summary>使用データの内訳を表示</summary>
              {shape === "proportion" ? (
                <ProportionSummary series={series} />
              ) : shape === "nested_continuous" ? (
                <NestedSummary series={series} />
              ) : shape === "wb_ratio" ? (
                <div className="experiment-graph-data-summary" aria-label="WB比の要約">
                  {series.map((item) => (
                    <div className="experiment-graph-summary-row" key={item.seriesKey}>
                      <strong>
                        {item.conditionLabel}
                        {item.timeLabel ? `・${item.timeLabel}` : ""}
                      </strong>
                      <span>実験単位 {item.experimentPoints.length}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>カテゴリ別のcountと自動計算した割合を使用しています。</p>
              )}
            </details>
          </section>
        ) : null}

        <aside
          className="experiment-graph-inspector"
          aria-label={workspaceMode === "statistics" ? "統計設定" : "グラフ設定"}
        >
          {workspaceMode !== "statistics" ? (
            <div className="experiment-graph-inspector-target">
              <label className="experiment-graph-field">
                <span>編集対象</span>
                <select
                  aria-label="編集対象"
                  value={inspectorTarget}
                  onChange={(event) => inspectGraphPart(event.target.value as InspectorTarget)}
                >
                  <option value="background">グラフ全体</option>
                  <option value="x-axis">X軸</option>
                  <option value="y-axis">Y軸</option>
                  <option value="data">データ</option>
                  <option value="raw-dots">生データの点</option>
                  <option value="experiment-summary">実験単位の要約</option>
                  <option value="violin">バイオリン</option>
                  <option value="box">箱ひげ</option>
                  <option value="error-bar">誤差線</option>
                  <option value="connecting-line">接続線</option>
                  <option value="legend">凡例</option>
                  {workspaceMode === "graph" && analysisResult?.status === "ok" ? (
                    <option value="annotation">統計注釈</option>
                  ) : null}
                  {workspaceMode === "combined" ? (
                    <option value="statistics">統計解析</option>
                  ) : null}
                </select>
              </label>
            </div>
          ) : (
            <section className="experiment-graph-inspector-section experiment-statistics-source">
              <h3>解析対象</h3>
              <label className="experiment-graph-field">
                <span>測定項目</span>
                <select
                  value={activeReadoutId}
                  disabled={draft.readouts.length <= 1}
                  aria-label="統計の測定項目"
                  onChange={(event) => {
                    setSelectedReadoutId(event.target.value);
                    setAnalysis(null);
                  }}
                >
                  {draft.readouts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="experiment-graph-condition-fieldset">
                <legend>条件</legend>
                {draft.conditions.map((condition) => (
                  <label className="experiment-graph-checkbox" key={condition.id}>
                    <input
                      type="checkbox"
                      value={condition.id}
                      checked={activeConditionIds.has(condition.id)}
                      disabled={draft.analysisIntent.kind === "correlation"}
                      aria-label={`統計の条件：${condition.label}`}
                      onChange={handleConditionChange}
                    />
                    <span>
                      {condition.label}
                      {condition.id === draft.controlConditionId ? "（対照群）" : ""}
                    </span>
                  </label>
                ))}
              </fieldset>
              <dl className="experiment-statistics-design-summary">
                <div>
                  <dt>統計上の単位</dt>
                  <dd>実験単位（Exp）</dd>
                </div>
                <div>
                  <dt>設計の解釈</dt>
                  <dd>
                    {draft.conditionAssignment.kind === "matched"
                      ? "同じ実験単位を条件間で比較"
                      : "条件ごとに別の実験単位"}
                  </dd>
                </div>
                <div>
                  <dt>対照群</dt>
                  <dd>
                    {draft.controlConditionId
                      ? (draft.conditions.find(({ id }) => id === draft.controlConditionId)
                          ?.label ?? "指定済み")
                      : "未指定（表示名からは推測しません）"}
                  </dd>
                </div>
              </dl>
            </section>
          )}
          {inspectorTarget === "data" ? (
            <section className="experiment-graph-inspector-section">
              <h3>表示するデータ</h3>
              <label className="experiment-graph-field">
                <span>測定項目</span>
                <select
                  value={activeReadoutId}
                  disabled={draft.readouts.length <= 1}
                  aria-label="測定項目"
                  onChange={(event) => {
                    const nextReadout = draft.readouts.find(({ id }) => id === event.target.value);
                    setSelectedReadoutId(event.target.value);
                    setAxes((current) => ({
                      ...current,
                      yTitle: defaultGraphYTitle(nextReadout),
                    }));
                    setAnalysis(null);
                  }}
                >
                  {draft.readouts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {draft.time.sampling === "longitudinal" && draft.time.points.length > 1 ? (
                <>
                  <label className="experiment-graph-field">
                    <span>グラフのデータソース</span>
                    <select
                      aria-label="グラフのデータソース"
                      value={sourceMode}
                      onChange={(event) => {
                        const mode = event.currentTarget.value as "raw_readout" | "derived_metric";
                        setSourceMode(mode);
                        if (mode === "derived_metric") {
                          const nextType =
                            draft.conditionAssignment.kind === "matched" ? "paired_dot" : "dot";
                          if (timeAnalysis.kind === "selected_timepoint") {
                            setTimeAnalysis({ kind: "auc" });
                          }
                          setGraphType(nextType);
                          setLayers(defaultLayersForGraphType(nextType, "nested_continuous"));
                        }
                        setAxes((current) => ({
                          ...current,
                          yTitle:
                            mode === "derived_metric"
                              ? `${readout?.label ?? "測定値"} — ${timeMetricLabel(
                                  timeAnalysis.kind === "selected_timepoint"
                                    ? { kind: "auc" }
                                    : timeAnalysis,
                                )}`
                              : defaultGraphYTitle(readout),
                        }));
                        setAnalysis(null);
                      }}
                    >
                      <option value="raw_readout">元の時系列</option>
                      <option value="derived_metric">各単位から求めた派生値</option>
                    </select>
                  </label>
                  {sourceMode === "derived_metric" ? (
                    <details>
                      <summary>派生値の計算根拠を確認</summary>
                      <p>
                        元の測定項目：{readout.label}。指標：{timeMetricLabel(timeAnalysis)}
                        。window：
                        {timeAnalysis.windowStart ?? "最初"}–{timeAnalysis.windowEnd ?? "最後"}
                        。時間単位：
                        {draft.time.unit}。
                        {timeAnalysis.kind === "auc"
                          ? "台形法で計算。"
                          : "元の時系列から単位ごとに計算。"}
                      </p>
                      <table aria-label="派生値のラインネージ">
                        <thead>
                          <tr>
                            <th scope="col">生物学的単位</th>
                            <th scope="col">条件</th>
                            <th scope="col">元のトレース（時間: 値）</th>
                            <th scope="col">派生値</th>
                          </tr>
                        </thead>
                        <tbody>
                          {derivedLineageRows.map((row) => (
                            <tr key={row.id}>
                              <th scope="row">{row.unit}</th>
                              <td>{row.condition}</td>
                              <td>{row.sourceTrace.join("、")}</td>
                              <td>{formatNumber(row.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  ) : null}
                </>
              ) : null}
              {draft.time.points.length > 0 && (
                <fieldset className="experiment-graph-condition-fieldset">
                  <legend>時点（複数選択可）</legend>
                  <label className="experiment-graph-checkbox">
                    <input
                      type="checkbox"
                      aria-label="すべての時点"
                      checked={selectedTimePointIds.length === draft.time.points.length}
                      onChange={(event) => {
                        setSelectedTimePointIds(
                          event.target.checked ? draft.time.points.map((point) => point.id) : [],
                        );
                        setAnalysis(null);
                      }}
                    />
                    <span>すべて</span>
                  </label>
                  <div className="experiment-graph-time-grid">
                    {draft.time.points.map((point) => (
                      <label className="experiment-graph-checkbox" key={point.id}>
                        <input
                          type="checkbox"
                          value={point.id}
                          checked={selectedTimePointIds.includes(point.id)}
                          aria-label={`${point.value} ${draft.time.unit}`}
                          onChange={handleTimePointChange}
                        />
                        <span>
                          {point.value} {draft.time.unit}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <fieldset className="experiment-graph-condition-fieldset">
                <legend>{draft.analysisIntent.kind === "correlation" ? "X / Y" : "条件"}</legend>
                {draft.conditions.map((condition) => (
                  <label className="experiment-graph-checkbox" key={condition.id}>
                    <input
                      type="checkbox"
                      value={condition.id}
                      checked={activeConditionIds.has(condition.id)}
                      disabled={draft.analysisIntent.kind === "correlation"}
                      aria-label={condition.label}
                      onChange={handleConditionChange}
                    />
                    <span>{condition.label}</span>
                  </label>
                ))}
              </fieldset>
            </section>
          ) : null}

          {inspectorTarget === "background" ? (
            <section className="experiment-graph-inspector-section">
              <h3>グラフの外観</h3>
              <label className="experiment-graph-field">
                <span>基本形</span>
                <select
                  aria-label="グラフの基本形"
                  value={graphType}
                  onChange={(event) => {
                    const nextType = event.target.value as GraphType;
                    setGraphType(nextType);
                    setLayers(defaultLayersForGraphType(nextType, shape));
                  }}
                >
                  {shape === "categorical_counts" ? (
                    <>
                      <option value="stacked">Stacked count</option>
                      <option value="stacked_100">100% stacked</option>
                      <option value="category_percentage">Category percentage</option>
                    </>
                  ) : draft.analysisIntent.kind === "correlation" ? (
                    <option value="scatter">Scatter</option>
                  ) : (
                    <>
                      <option value="dot">Dot</option>
                      <option value="box">Box</option>
                      <option value="violin">Violin</option>
                      <option value="bar">Bar</option>
                      <option value="line">Line / Time course</option>
                      <option
                        value="paired_dot"
                        disabled={
                          draft.conditionAssignment.kind !== "matched" &&
                          draft.time.sampling !== "longitudinal"
                        }
                      >
                        対応を線で結ぶ
                      </option>
                    </>
                  )}
                </select>
              </label>
              <label className="experiment-graph-field">
                <span>表示プリセット</span>
                <select
                  aria-label="表示プリセット"
                  defaultValue="simple"
                  onChange={(event) =>
                    applyPreset(
                      event.target.value as
                        "simple" | "publication" | "presentation" | "raw" | "replicate",
                    )
                  }
                >
                  <option value="simple">シンプル</option>
                  <option value="publication">論文</option>
                  <option value="presentation">発表</option>
                  {shape === "nested_continuous" ? (
                    <>
                      <option value="raw">生データ分布を重視</option>
                      <option value="replicate">実験単位だけを表示</option>
                    </>
                  ) : null}
                </select>
              </label>
              <label className="experiment-graph-field">
                <span>色</span>
                <select
                  aria-label="色の使い方"
                  value={appearance.palette}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      palette: event.target.value as PaletteMode,
                    }))
                  }
                >
                  <option value="single">抑えた単色</option>
                  <option value="condition">条件ごとに色分け</option>
                  <option value="publication">論文向け</option>
                  <option value="colorblind">色覚多様性対応</option>
                  <option value="grayscale">グレースケール</option>
                </select>
              </label>
              {appearance.palette !== "single" ? (
                <details className="experiment-graph-color-details">
                  <summary>条件ごとの色</summary>
                  {activeConditions.map((condition, index) => (
                    <label className="experiment-graph-color-field" key={condition.id}>
                      <span>{condition.label}</span>
                      <input
                        type="color"
                        aria-label={`${condition.label}の色`}
                        value={
                          appearance.seriesColors[condition.id] ??
                          PALETTES[appearance.palette][index % PALETTES[appearance.palette].length]
                        }
                        onChange={(event) =>
                          setAppearance((current) => ({
                            ...current,
                            seriesColors: {
                              ...current.seriesColors,
                              [condition.id]: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAppearance((current) => ({ ...current, seriesColors: {} }))}
                  >
                    パレット色に戻す
                  </button>
                </details>
              ) : null}
              <label className="experiment-graph-field">
                <span>フォント</span>
                <select
                  aria-label="グラフのフォント"
                  value={appearance.fontFamily}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      fontFamily: event.target.value as GraphAppearance["fontFamily"],
                    }))
                  }
                >
                  <option value="arial">Arial</option>
                  <option value="helvetica">Helvetica</option>
                  <option value="system">System Sans Serif</option>
                </select>
              </label>
              <label className="experiment-graph-field">
                <span>グラフタイトル：{appearance.graphTitleFontSize}px</span>
                <input
                  aria-label="グラフタイトルの文字サイズ"
                  type="range"
                  min="12"
                  max="32"
                  value={appearance.graphTitleFontSize}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      graphTitleFontSize: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="experiment-graph-field">
                <span>キャンバス</span>
                <select
                  aria-label="グラフの大きさ"
                  value={appearance.canvasPreset}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      canvasPreset: event.target.value as GraphAppearance["canvasPreset"],
                    }))
                  }
                >
                  <option value="compact">Compact</option>
                  <option value="standard">Standard</option>
                  <option value="wide">Wide</option>
                </select>
              </label>
              <label className="experiment-graph-field">
                <span>左右の余白：{appearance.sidePadding}px</span>
                <input
                  aria-label="グラフ左右の余白"
                  type="range"
                  min="56"
                  max="180"
                  step="4"
                  value={appearance.sidePadding}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      sidePadding: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="experiment-graph-field">
                <span>軸線：{appearance.axisLineWidth.toFixed(1)}px</span>
                <input
                  aria-label="軸線の太さ"
                  type="range"
                  min="0.8"
                  max="2.4"
                  step="0.2"
                  value={appearance.axisLineWidth}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      axisLineWidth: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <button
                type="button"
                className="experiment-graph-reset-layout"
                onClick={() => {
                  setAppearance((current) => ({
                    ...current,
                    canvasPreset: "standard",
                    sidePadding: 72,
                  }));
                  setAxes((current) => ({ ...current, spacing: 1 }));
                }}
              >
                レイアウトを自動設定に戻す
              </button>
            </section>
          ) : null}

          {inspectorTarget === "raw-dots" ? (
            <section className="experiment-graph-inspector-section">
              <h3>{shape === "nested_continuous" ? "細胞・ROIの生データ" : "実験単位の点"}</h3>
              <label className="experiment-graph-checkbox">
                <input
                  type="checkbox"
                  checked={shape === "nested_continuous" ? layers.raw : layers.experiment}
                  aria-label={
                    shape === "nested_continuous" ? "生データの点を表示" : "実験単位の点を表示"
                  }
                  onChange={(event) =>
                    setLayers((current) => ({
                      ...current,
                      [shape === "nested_continuous" ? "raw" : "experiment"]: event.target.checked,
                    }))
                  }
                />
                <span>
                  {shape === "nested_continuous" ? "細胞・ROIの生データ" : "実験単位の点"}
                </span>
              </label>
              <label className="experiment-graph-field">
                <span>点の大きさ：{appearance.pointSize}px</span>
                <input
                  aria-label="生データ点の大きさ"
                  type="range"
                  min="4"
                  max="10"
                  step="1"
                  value={appearance.pointSize}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      pointSize: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="experiment-graph-field">
                <span>横方向のばらし幅：{appearance.jitter}px</span>
                <input
                  aria-label="生データ点のjitter"
                  type="range"
                  min="0"
                  max="24"
                  step="1"
                  value={appearance.jitter}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      jitter: Number(event.target.value),
                    }))
                  }
                />
              </label>
              {shape === "nested_continuous" ? (
                <label className="experiment-graph-color-field">
                  <span>生データ点の色</span>
                  <input
                    type="color"
                    aria-label="生データ点の色"
                    value={appearance.rawPointColor}
                    onChange={(event) =>
                      setAppearance((current) => ({
                        ...current,
                        rawPointColor: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
              <p className="experiment-graph-help">
                細胞・ROIの点は観測分布の表示用で、統計上のnとしては扱いません。
              </p>
            </section>
          ) : null}

          {inspectorTarget === "experiment-summary" ? (
            <section className="experiment-graph-inspector-section">
              <h3>実験単位の要約</h3>
              <label className="experiment-graph-checkbox">
                <input
                  type="checkbox"
                  checked={layers.experiment}
                  aria-label="実験単位の点を表示"
                  onChange={(event) =>
                    setLayers((current) => ({ ...current, experiment: event.target.checked }))
                  }
                />
                <span>個々の生物学的反復を表示</span>
              </label>
              <label className="experiment-graph-checkbox">
                <input
                  type="checkbox"
                  checked={layers.overall}
                  aria-label="全体平均を表示"
                  onChange={(event) =>
                    setLayers((current) => ({ ...current, overall: event.target.checked }))
                  }
                />
                <span>全体平均を表示</span>
              </label>
              <label className="experiment-graph-field">
                <span>点の大きさ：{appearance.pointSize}px</span>
                <input
                  aria-label="実験単位点の大きさ"
                  type="range"
                  min="4"
                  max="10"
                  step="1"
                  value={appearance.pointSize}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      pointSize: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="experiment-graph-field">
                <span>平均線：{appearance.summaryLineWidth.toFixed(1)}px</span>
                <input
                  type="range"
                  min="0.6"
                  max="4"
                  step="0.1"
                  aria-label="平均線の太さ"
                  value={appearance.summaryLineWidth}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      summaryLineWidth: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="experiment-graph-color-field">
                <span>平均線の色</span>
                <input
                  type="color"
                  aria-label="平均線の色"
                  value={appearance.summaryColor}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      summaryColor: event.target.value,
                    }))
                  }
                />
              </label>
            </section>
          ) : null}

          {inspectorTarget === "violin" ? (
            <section className="experiment-graph-inspector-section">
              <h3>バイオリン分布</h3>
              <label className="experiment-graph-checkbox">
                <input
                  type="checkbox"
                  checked={layers.violin}
                  aria-label="バイオリンを表示"
                  onChange={(event) =>
                    setLayers((current) => ({ ...current, violin: event.target.checked }))
                  }
                />
                <span>観測値の分布を表示</span>
              </label>
              <p className="experiment-graph-help">
                バイオリンは細胞・ROIなど、十分な観測値がある場合の分布表示です。
              </p>
              <label className="experiment-graph-field">
                <span>輪郭線：{appearance.distributionLineWidth.toFixed(1)}px</span>
                <input
                  type="range"
                  min="0.6"
                  max="4"
                  step="0.1"
                  aria-label="分布輪郭線の太さ"
                  value={appearance.distributionLineWidth}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      distributionLineWidth: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </section>
          ) : null}

          {inspectorTarget === "box" ? (
            <section className="experiment-graph-inspector-section">
              <h3>箱ひげ</h3>
              <label className="experiment-graph-checkbox">
                <input
                  type="checkbox"
                  checked={
                    shape === "nested_continuous" ? layers.distribution || layers.box : layers.box
                  }
                  aria-label="箱ひげを表示"
                  onChange={(event) =>
                    setLayers((current) => ({
                      ...current,
                      distribution: event.target.checked,
                      box: event.target.checked,
                    }))
                  }
                />
                <span>中央値と四分位範囲を表示</span>
              </label>
              <label className="experiment-graph-field">
                <span>輪郭線：{appearance.distributionLineWidth.toFixed(1)}px</span>
                <input
                  type="range"
                  min="0.6"
                  max="4"
                  step="0.1"
                  aria-label="箱ひげ輪郭線の太さ"
                  value={appearance.distributionLineWidth}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      distributionLineWidth: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </section>
          ) : null}

          {inspectorTarget === "error-bar" ? (
            <section className="experiment-graph-inspector-section">
              <h3>誤差線</h3>
              <label className="experiment-graph-checkbox">
                <input
                  type="checkbox"
                  checked={layers.errorBar}
                  aria-label="誤差線を表示"
                  onChange={(event) =>
                    setLayers((current) => ({ ...current, errorBar: event.target.checked }))
                  }
                />
                <span>誤差線を表示</span>
              </label>
              <label className="experiment-graph-field">
                <span>要約方法</span>
                <select
                  aria-label="誤差線の要約方法"
                  value={appearance.errorBar}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      errorBar: event.target.value as ErrorBarMode,
                    }))
                  }
                >
                  <option value="sd">SD（標準偏差）</option>
                  <option value="sem">SEM（標準誤差）</option>
                  <option value="none">なし</option>
                </select>
              </label>
              <label className="experiment-graph-field">
                <span>線幅：{appearance.errorBarLineWidth.toFixed(1)}px</span>
                <input
                  type="range"
                  min="0.6"
                  max="4"
                  step="0.1"
                  aria-label="誤差線の太さ"
                  value={appearance.errorBarLineWidth}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      errorBarLineWidth: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="experiment-graph-color-field">
                <span>誤差線の色</span>
                <input
                  type="color"
                  aria-label="誤差線の色"
                  value={appearance.errorBarColor}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      errorBarColor: event.target.value,
                    }))
                  }
                />
              </label>
            </section>
          ) : null}

          {inspectorTarget === "connecting-line" ? (
            <section className="experiment-graph-inspector-section">
              <h3>接続線</h3>
              <label className="experiment-graph-checkbox">
                <input
                  type="checkbox"
                  checked={layers.connectingLine}
                  aria-label="接続線を表示"
                  onChange={(event) =>
                    setLayers((current) => ({ ...current, connectingLine: event.target.checked }))
                  }
                />
                <span>条件または時点の要約を線で結ぶ</span>
              </label>
              <label className="experiment-graph-field">
                <span>線幅：{appearance.connectingLineWidth.toFixed(1)}px</span>
                <input
                  type="range"
                  min="0.6"
                  max="4"
                  step="0.1"
                  aria-label="接続線の太さ"
                  value={appearance.connectingLineWidth}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      connectingLineWidth: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="experiment-graph-color-field">
                <span>接続線の色</span>
                <input
                  type="color"
                  aria-label="接続線の色"
                  value={appearance.connectingLineColor}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      connectingLineColor: event.target.value,
                    }))
                  }
                />
              </label>
            </section>
          ) : null}

          {inspectorTarget === "legend" ? (
            <section className="experiment-graph-inspector-section">
              <h3>凡例</h3>
              <label className="experiment-graph-field">
                <span>位置</span>
                <select
                  aria-label="凡例の位置"
                  value={appearance.legendPosition}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      legendPosition: event.target.value as GraphAppearance["legendPosition"],
                      palette:
                        event.target.value === "hidden" || current.palette !== "single"
                          ? current.palette
                          : "condition",
                    }))
                  }
                >
                  <option value="hidden">なし</option>
                  <option value="top">上</option>
                  <option value="right">右</option>
                  <option value="inside">内側</option>
                </select>
              </label>
              <label className="experiment-graph-field">
                <span>文字：{appearance.legendFontSize}px</span>
                <input
                  type="range"
                  min="9"
                  max="24"
                  aria-label="凡例の文字サイズ"
                  value={appearance.legendFontSize}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      legendFontSize: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </section>
          ) : null}

          {inspectorTarget === "annotation" && analysisResult?.status === "ok" ? (
            <section className="experiment-graph-statistics-section" aria-label="統計注釈">
              <h3>グラフ上の注釈</h3>
              <p className="experiment-graph-help">
                Statisticsで保存した解析結果から、表示する比較を選びます。ここでは再計算しません。
              </p>
              {analysisResult.tests.length > 1 ? (
                <label className="experiment-graph-field">
                  <span>比較結果</span>
                  <select
                    aria-label="統計注釈の比較"
                    value={statisticsAnnotation.testIndex}
                    onChange={(event) =>
                      setStatisticsAnnotation((current) => ({
                        ...current,
                        testIndex: Number(event.target.value),
                      }))
                    }
                  >
                    {analysisResult.tests.map((test, index) => (
                      <option key={`${test.name}:${index}`} value={index}>
                        {analysisTestAnnotationLabel(test, draft, baseAnnotationContext)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="experiment-graph-field">
                <span>表示</span>
                <select
                  aria-label="統計注釈の表示"
                  value={statisticsAnnotation.mode}
                  onChange={(event) =>
                    setStatisticsAnnotation((current) => ({
                      ...current,
                      mode: event.target.value as StatisticsAnnotation["mode"],
                    }))
                  }
                >
                  <option value="hidden">表示しない</option>
                  <option value="exact_p">正確なp値</option>
                  <option value="symbol">有意差記号</option>
                </select>
              </label>
              <p className="experiment-graph-help">
                表示内容：{annotationContext}
                。保存済みのこのグラフの解析結果にだけリンクします。派生値の注釈はそのmetric/windowだけを表し、曲線全体の推論を意味しません。データや比較対象を変更すると注釈も外れます。
              </p>
            </section>
          ) : null}

          {inspectorTarget === "x-axis" || inspectorTarget === "y-axis" ? (
            <section className="experiment-graph-inspector-section">
              <h3>{inspectorTarget === "y-axis" ? "Y軸" : "X軸"}</h3>
              {inspectorTarget === "y-axis" ? (
                <>
                  <label className="experiment-graph-field">
                    <span>軸タイトル</span>
                    <input
                      aria-label="Y軸タイトル"
                      type="text"
                      value={axes.yTitle}
                      onChange={(event) =>
                        setAxes((current) => ({ ...current, yTitle: event.target.value }))
                      }
                    />
                  </label>
                  <label className="experiment-graph-field">
                    <span>軸タイトル文字：{appearance.axisTitleFontSize}px</span>
                    <input
                      type="range"
                      min="10"
                      max="28"
                      aria-label="軸タイトルの文字サイズ"
                      value={appearance.axisTitleFontSize}
                      onChange={(event) =>
                        setAppearance((current) => ({
                          ...current,
                          axisTitleFontSize: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="experiment-graph-field">
                    <span>目盛文字：{appearance.tickFontSize}px</span>
                    <input
                      type="range"
                      min="9"
                      max="24"
                      aria-label="目盛ラベルの文字サイズ"
                      value={appearance.tickFontSize}
                      onChange={(event) =>
                        setAppearance((current) => ({
                          ...current,
                          tickFontSize: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="experiment-graph-field">
                    <span>範囲</span>
                    <select
                      aria-label="Y軸の範囲"
                      value={axes.yRangeMode}
                      onChange={(event) =>
                        setAxes((current) => ({
                          ...current,
                          yRangeMode: event.target.value as AxisSettings["yRangeMode"],
                        }))
                      }
                    >
                      <option value="auto">自動</option>
                      <option value="manual">手動</option>
                    </select>
                  </label>
                  {axes.yRangeMode === "manual" ? (
                    <div className="experiment-graph-range-grid">
                      <label className="experiment-graph-field">
                        <span>最小</span>
                        <input
                          aria-label="Y軸の最小値"
                          type="number"
                          value={axes.yMin ?? ""}
                          onChange={(event) =>
                            setAxes((current) => ({
                              ...current,
                              yMin: event.target.value === "" ? null : Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className="experiment-graph-field">
                        <span>最大</span>
                        <input
                          aria-label="Y軸の最大値"
                          type="number"
                          value={axes.yMax ?? ""}
                          onChange={(event) =>
                            setAxes((current) => ({
                              ...current,
                              yMax: event.target.value === "" ? null : Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                  <label className="experiment-graph-field">
                    <span>スケール</span>
                    <select
                      aria-label="Y軸スケール"
                      value={axes.yScale}
                      disabled={shape === "proportion"}
                      onChange={(event) =>
                        setAxes((current) => ({
                          ...current,
                          yScale: event.target.value as AxisSettings["yScale"],
                        }))
                      }
                    >
                      <option value="linear">Linear</option>
                      <option value="log10">Log10</option>
                    </select>
                  </label>
                  <label className="experiment-graph-field">
                    <span>目盛間隔</span>
                    <select
                      aria-label="Y軸の目盛間隔"
                      value={axes.yTickMode}
                      disabled={axes.yScale === "log10"}
                      onChange={(event) =>
                        setAxes((current) => ({
                          ...current,
                          yTickMode: event.target.value as AxisSettings["yTickMode"],
                        }))
                      }
                    >
                      <option value="auto">自動（丸い数値）</option>
                      <option value="manual">手動</option>
                    </select>
                  </label>
                  {axes.yTickMode === "manual" && axes.yScale === "linear" ? (
                    <label className="experiment-graph-field">
                      <span>目盛間隔の値</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label="Y軸目盛の間隔値"
                        value={axes.yTickInterval ?? ""}
                        onChange={(event) =>
                          setAxes((current) => ({
                            ...current,
                            yTickInterval:
                              event.target.value === "" ? null : Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </>
              ) : (
                <>
                  {draft.time.points.length > 0 ? (
                    <>
                      <label className="experiment-graph-field">
                        <span>X軸の意味</span>
                        <select
                          aria-label="X軸の意味"
                          value={axes.xSemantic}
                          onChange={(event) =>
                            setAxes((current) => ({
                              ...current,
                              xSemantic: event.target.value as AxisSettings["xSemantic"],
                              xTitle:
                                event.target.value === "time"
                                  ? "Time"
                                  : event.target.value === "numeric_covariate"
                                    ? "Covariate"
                                    : "",
                            }))
                          }
                        >
                          <option value="time">時間</option>
                          <option value="numeric_covariate">数値共変量</option>
                          <option value="categorical">カテゴリ</option>
                        </select>
                      </label>
                      <label className="experiment-graph-field">
                        <span>X軸タイトル</span>
                        <input
                          aria-label="X軸タイトル"
                          type="text"
                          value={axes.xTitle}
                          onChange={(event) =>
                            setAxes((current) => ({ ...current, xTitle: event.target.value }))
                          }
                        />
                      </label>
                      <label className="experiment-graph-field">
                        <span>X軸単位</span>
                        <input
                          aria-label="X軸単位"
                          type="text"
                          value={axes.xUnit}
                          onChange={(event) =>
                            setAxes((current) => ({ ...current, xUnit: event.target.value }))
                          }
                        />
                      </label>
                    </>
                  ) : null}
                  <label className="experiment-graph-checkbox">
                    <input
                      type="checkbox"
                      checked={appearance.hierarchicalLabels}
                      aria-label="条件属性を階層表示"
                      onChange={(event) =>
                        setAppearance((current) => ({
                          ...current,
                          hierarchicalLabels: event.target.checked,
                        }))
                      }
                    />
                    <span>条件属性を個別の階層として表示</span>
                  </label>
                  <label className="experiment-graph-checkbox">
                    <input
                      type="checkbox"
                      checked={axes.showCategoryLabels}
                      aria-label="カテゴリラベルを表示"
                      onChange={(event) =>
                        setAxes((current) => ({
                          ...current,
                          showCategoryLabels: event.target.checked,
                        }))
                      }
                    />
                    <span>カテゴリと階層ラベルを表示</span>
                  </label>
                  <label className="experiment-graph-field">
                    <span>カテゴリ間隔：{axes.spacing.toFixed(1)}</span>
                    <input
                      aria-label="カテゴリ間隔"
                      type="range"
                      min="0.7"
                      max="1.6"
                      step="0.1"
                      value={axes.spacing}
                      onChange={(event) =>
                        setAxes((current) => ({
                          ...current,
                          spacing: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="experiment-graph-field">
                    <span>階層ラベル文字：{appearance.hierarchyFontSize}px</span>
                    <input
                      type="range"
                      min="9"
                      max="24"
                      aria-label="階層ラベルの文字サイズ"
                      value={appearance.hierarchyFontSize}
                      onChange={(event) =>
                        setAppearance((current) => ({
                          ...current,
                          hierarchyFontSize: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <div className="experiment-graph-hierarchy-order">
                    <strong>階層の順序</strong>
                    {(axes.hierarchyOrder.length > 0
                      ? axes.hierarchyOrder
                      : draft.attributes.map(({ id }) => id)
                    ).map((attributeId, index, order) => {
                      const attribute = draft.attributes.find(({ id }) => id === attributeId);
                      if (!attribute) return null;
                      return (
                        <div key={attributeId}>
                          <span>{attribute.label}</span>
                          <button
                            type="button"
                            disabled={index === 0}
                            aria-label={`${attribute.label}を上へ`}
                            onClick={() => moveHierarchy(attributeId, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === order.length - 1}
                            aria-label={`${attribute.label}を下へ`}
                            onClick={() => moveHierarchy(attributeId, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          ) : null}

          {inspectorTarget === "statistics" ? (
            <>
              {draft.time.points.length > 1 ? (
                <section className="experiment-graph-statistics-section">
                  <h3>時系列から何を比較するか</h3>
                  <label className="experiment-graph-field">
                    <span>解析に使う値</span>
                    <select
                      aria-label="時系列の解析値"
                      value={timeAnalysis.kind}
                      onChange={(event) => {
                        const nextPlan = {
                          kind: event.target.value as TimeAnalysisPlan["kind"],
                        };
                        setTimeAnalysis(nextPlan);
                        if (nextPlan.kind === "full_time_course") setSourceMode("raw_readout");
                        if (sourceMode === "derived_metric") {
                          setAxes((current) => ({
                            ...current,
                            yTitle: `${readout?.label ?? "測定値"} — ${timeMetricLabel(nextPlan)}`,
                          }));
                        }
                        setAnalysis(null);
                      }}
                    >
                      <option value="selected_timepoint">選んだ時点の値</option>
                      <option value="full_time_course">
                        {draft.time.sampling === "longitudinal"
                          ? "条件×時間（反復測定の全体モデル）"
                          : "条件×時間（時点ごとに独立な全体モデル）"}
                      </option>
                      <option value="endpoint" disabled={draft.time.sampling !== "longitudinal"}>
                        最後の時点（endpoint）
                      </option>
                      <option value="maximum" disabled={draft.time.sampling !== "longitudinal"}>
                        最大値
                      </option>
                      <option value="minimum" disabled={draft.time.sampling !== "longitudinal"}>
                        最小値
                      </option>
                      <option value="auc" disabled={draft.time.sampling !== "longitudinal"}>
                        AUC（台形法）
                      </option>
                      <option
                        value="change_from_baseline"
                        disabled={draft.time.sampling !== "longitudinal"}
                      >
                        baselineからの変化量
                      </option>
                      <option value="f_over_f0" disabled={draft.time.sampling !== "longitudinal"}>
                        F/F0（最初の時点を基準）
                      </option>
                    </select>
                  </label>
                  {draft.time.sampling !== "longitudinal" ? (
                    <p className="experiment-graph-help">
                      時点ごとに別サンプルのため、AUCやbaseline変化は選べません。
                    </p>
                  ) : null}
                  {timeAnalysis.kind === "auc" ? (
                    <p className="experiment-graph-help">
                      AUCは時間曲線の下の面積です。選んだ範囲の応答の大きさと持続時間を1つの値にまとめます。単位は「測定値
                      ×{draft.time.unit}」で、時間経過の形や開始値の違いは別に確認が必要です。
                    </p>
                  ) : null}
                  {timeAnalysis.kind === "selected_timepoint" ? (
                    <label className="experiment-graph-field">
                      <span>グラフとは別に選択</span>
                      <select
                        aria-label="解析する時点"
                        value={analysisTimePointId ?? ""}
                        onChange={(event) => {
                          setAnalysisTimePointId(event.target.value || null);
                          setAnalysis(null);
                        }}
                      >
                        <option value="">時点を選択</option>
                        {draft.time.points.map((point) => (
                          <option key={point.id} value={point.id}>
                            {point.value} {draft.time.unit}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {isDerivedTimeMetric(timeAnalysis) ? (
                    <div className="experiment-graph-field-grid">
                      <label className="experiment-graph-field">
                        <span>解析windowの開始</span>
                        <select
                          aria-label="解析windowの開始"
                          value={timeAnalysis.windowStart ?? ""}
                          onChange={(event) => {
                            setTimeAnalysis((current) => ({
                              ...current,
                              ...(event.target.value === ""
                                ? { windowStart: undefined }
                                : { windowStart: Number(event.target.value) }),
                            }));
                            setAnalysis(null);
                          }}
                        >
                          <option value="">最初の時点</option>
                          {draft.time.points.map((point) => (
                            <option key={point.id} value={point.value}>
                              {point.value} {draft.time.unit}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="experiment-graph-field">
                        <span>解析windowの終了</span>
                        <select
                          aria-label="解析windowの終了"
                          value={timeAnalysis.windowEnd ?? ""}
                          onChange={(event) => {
                            setTimeAnalysis((current) => ({
                              ...current,
                              ...(event.target.value === ""
                                ? { windowEnd: undefined }
                                : { windowEnd: Number(event.target.value) }),
                            }));
                            setAnalysis(null);
                          }}
                        >
                          <option value="">最後の時点</option>
                          {draft.time.points.map((point) => (
                            <option key={point.id} value={point.value}>
                              {point.value} {draft.time.unit}
                            </option>
                          ))}
                        </select>
                      </label>
                      {timeAnalysis.kind === "change_from_baseline" ||
                      timeAnalysis.kind === "f_over_f0" ? (
                        <label className="experiment-graph-field">
                          <span>baseline時点</span>
                          <select
                            aria-label="baseline時点"
                            value={timeAnalysis.baselineTime ?? ""}
                            onChange={(event) => {
                              setTimeAnalysis((current) => ({
                                ...current,
                                ...(event.target.value === ""
                                  ? { baselineTime: undefined }
                                  : { baselineTime: Number(event.target.value) }),
                              }));
                              setAnalysis(null);
                            }}
                          >
                            <option value="">最初の時点</option>
                            {draft.time.points.map((point) => (
                              <option key={point.id} value={point.value}>
                                {point.value} {draft.time.unit}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                  {timeAnalysis.kind === "full_time_course" ? (
                    <p className="experiment-graph-help">
                      {draft.time.sampling === "longitudinal"
                        ? "全時点と実験単位identityを保持し、条件×時間の交互作用を最初に評価します。欠測のないbalanced設計に限定します。"
                        : "各条件×時点で別々の実験単位を使い、交互作用と両主効果を評価します。反復測定とは扱わず、欠測のないbalanced設計に限定します。"}
                    </p>
                  ) : null}
                  <p className="experiment-graph-help">
                    図には全時間を表示したまま、特定時点または各実験単位から求めた派生値を解析できます。
                  </p>
                </section>
              ) : null}
              {draft.time.points.length > 1 &&
              timeAnalysis.kind === "selected_timepoint" &&
              !analysisTimePointId ? (
                <section className="experiment-graph-statistics-section">
                  {hasFactorByTimeStructure ? (
                    <>
                      <h3>複数の処置と時間が含まれる実験です</h3>
                      <p>
                        現在の構造：
                        {varyingStatisticalAttributes.map(({ label }) => label).join("×")}
                        ×時間。現在のCoreは、この全体の交互作用を一度に検定する因子×時間モデルに未対応です。
                      </p>
                      <p>
                        時点を1つ選ぶと、その時点に限った処置因子の解析だけを実行します。これは実験全体の因子×時間交互作を検定するものではありません。
                      </p>
                    </>
                  ) : (
                    <p>
                      解析する時点を選ぶと、現在のデータに合う方法を確認できます。複数時点をまとめた反復・因子モデルへは自動変換しません。
                    </p>
                  )}
                </section>
              ) : (
                <>
                  {hasFactorByTimeStructure && analysisTimePointId ? (
                    <section className="experiment-graph-statistics-section" role="note">
                      <h3>今回に解析する範囲</h3>
                      <p>
                        因子候補：
                        {varyingStatisticalAttributes.map(({ label }) => label).join("、")}
                        。時間：
                        {draft.time.points.find(({ id }) => id === analysisTimePointId)?.value}
                        {draft.time.unit}
                        のみ。この結果は因子×時間の全体モデルではありません。条件説明用の属性を自動的にプールしません。
                      </p>
                    </section>
                  ) : null}
                  <GraphStatisticsPanel
                    assessment={analysisAssessment}
                    analysisRunner={analysisRunner}
                    initialAnalysis={initialState?.analysis}
                    onAnalysisChange={setAnalysis}
                    methodsText={methodsText}
                    correlationMethod={correlationMethod}
                    onCorrelationMethodChange={(method) => {
                      setCorrelationMethod(method);
                      setSelectedStatisticalMethod(method);
                      recordBenchmarkEvent(
                        "statistics_method_selected",
                        {
                          recommended: analysisAssessment.recommendedMethod ?? method,
                          selected: method,
                        },
                        "analysis_only",
                      );
                      setAnalysis(null);
                    }}
                    selectedMethod={selectedStatisticalMethod}
                    onSelectedMethodChange={(method) => {
                      setSelectedStatisticalMethod(method);
                      recordBenchmarkEvent(
                        "statistics_method_selected",
                        {
                          recommended: analysisAssessment.recommendedMethod ?? method,
                          selected: method,
                        },
                        "analysis_only",
                      );
                      setAnalysis(null);
                    }}
                    contrastIntent={contrastIntent}
                    conditionOptions={activeConditions.map(({ id, label }) => ({ id, label }))}
                    plannedContrastConditionIds={plannedContrastConditionIds}
                    onPlannedContrastConditionIdsChange={(pairs) => {
                      setPlannedContrastConditionIds([...pairs]);
                      recordBenchmarkEvent(
                        "statistics_planned_comparisons_selected",
                        {
                          pairs: pairs
                            .map(([firstId, secondId]) => `${firstId}:${secondId}`)
                            .join("|"),
                          count: pairs.length,
                        },
                        "analysis_only",
                      );
                      setAnalysis(null);
                    }}
                    onContrastIntentChange={(intent) => {
                      setContrastIntent(intent);
                      recordBenchmarkEvent(
                        "statistics_contrast_selected",
                        { intent },
                        "analysis_only",
                      );
                      if (intent === "all_pairs") setSelectedStatisticalMethod("welch_anova");
                      if (intent === "control_vs_many")
                        setSelectedStatisticalMethod("one_way_anova");
                      if (intent === "omnibus_only") setSelectedStatisticalMethod("kruskal_wallis");
                      if (intent === "planned_comparisons")
                        setSelectedStatisticalMethod("one_way_anova");
                      setAnalysis(null);
                    }}
                    analysisContextKey={analysisContextKey}
                  />
                </>
              )}
              {analysisResult?.status === "ok" ? (
                <section className="experiment-graph-statistics-section" aria-label="統計注釈">
                  <h3>グラフ上の注釈</h3>
                  {analysisResult.tests.length > 1 ? (
                    <label className="experiment-graph-field">
                      <span>比較結果</span>
                      <select
                        aria-label="統計注釈の比較"
                        value={statisticsAnnotation.testIndex}
                        onChange={(event) =>
                          setStatisticsAnnotation((current) => ({
                            ...current,
                            testIndex: Number(event.target.value),
                          }))
                        }
                      >
                        {analysisResult.tests.map((test, index) => (
                          <option key={`${test.name}:${index}`} value={index}>
                            {analysisTestAnnotationLabel(test, draft, baseAnnotationContext)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="experiment-graph-field">
                    <span>表示</span>
                    <select
                      aria-label="統計注釈の表示"
                      value={statisticsAnnotation.mode}
                      onChange={(event) =>
                        setStatisticsAnnotation((current) => ({
                          ...current,
                          mode: event.target.value as StatisticsAnnotation["mode"],
                        }))
                      }
                    >
                      <option value="hidden">表示しない</option>
                      <option value="exact_p">正確なp値</option>
                      <option value="symbol">有意差記号</option>
                    </select>
                  </label>
                  <p className="experiment-graph-help">
                    表示内容：{annotationContext}
                    。保存済みのこのグラフの解析結果にだけリンクします。派生値の注釈はそのmetric/windowだけを表し、曲線全体の推論を意味しません。データや比較対象を変更すると注釈も外れます。
                  </p>
                </section>
              ) : null}
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
