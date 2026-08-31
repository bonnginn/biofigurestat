import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent as ReactMouseEvent, RefObject } from "react";
import {
  requireAnalysisRequestRecommendation,
  type AnalysisEngineResult,
  type AnalysisRecommendation,
} from "@lsaa/analysis-contracts";
import { defaultAnalysisRunner, type AnalysisRunner } from "../../app/analysisClient";
import { layoutComparisonBrackets } from "@lsaa/graph-spec";

import {
  categoricalTotal,
  continuousSummary,
  cellIsNotPlanned,
  experimentCellKey,
  hasSharedSourceConditionUnits,
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
import {
  nestedIndependentSourceContext,
  type DraftAnalysisCorrection,
} from "../../app/draftAnalysisDiagnostics";
import { defaultGraphYTitle, defaultLayersForGraphType } from "../../app/graphDefaults";
import {
  createInitialGraphGrouping,
  normalizeGraphGroupingChannels,
  swapSingleXFactorAndSeries,
} from "../../app/graphGrouping";
import {
  createExperimentWorkspaceDesign,
  type WorkspaceGraphAnalysis,
  type WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";
import { createWorkspaceGraphStateSnapshot } from "../../app/experimentGraphStateSelectors";
import {
  copyGraphToClipboard,
  serializeGraphSvg,
  svgToPngBlob,
} from "../../app/graphExport";
import {
  saveGraphCsvExport,
  saveGraphPngExport,
  saveGraphSvgExport,
} from "../../app/graphExportController";
import { generateMethodsText } from "../../app/methodsText";
import { formatExactPValue } from "../../app/statisticalFormat";
import { localizedText, useAppLocale } from "../../app/appLocale";
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
import { routeFromPath } from "../../app/routes";
import { recordUsageGraphEdit } from "../../app/usageTelemetry";
import { GraphStatisticsPanel } from "./GraphStatisticsPanel";
import { CompositionGraphSvg } from "./CompositionGraphSvg";
import { CorrelationGraphSvg } from "./CorrelationGraphSvg";
import { ExperimentGraphAnnotationEditor } from "./ExperimentGraphAnnotationEditor";
import { ExperimentGraphAppearanceEditor } from "./ExperimentGraphAppearanceEditor";
import { ExperimentGraphConnectingLineEditor } from "./ExperimentGraphConnectingLineEditor";
import { ExperimentGraphErrorBarEditor } from "./ExperimentGraphErrorBarEditor";
import { ExperimentGraphLegendEditor } from "./ExperimentGraphLegendEditor";
import { ExperimentGraphRawDotsEditor } from "./ExperimentGraphRawDotsEditor";
import { ExperimentGraphXAxisEditor } from "./ExperimentGraphXAxisEditor";
import { ExperimentGraphYAxisEditor } from "./ExperimentGraphYAxisEditor";
import { GRAPH_PALETTES } from "./graphAppearance";
import {
  analysisTestAnnotationLabel,
  createAdjustedComparisonAnnotation,
  graphAnnotationContext,
  isPairwiseComparisonTest,
  timeMetricLabel,
} from "./experimentGraphAnnotations";
export {
  analysisTestAnnotationLabel,
  repeatedAxisAnnotationLabel,
} from "./experimentGraphAnnotations";
import {
  safeGraphFileStem,
  serializeCompositionData,
  serializeVisibleGraphData,
  type ExperimentPoint,
  type GraphSeries,
  type ProportionPoint,
  type RawPoint,
} from "./experimentGraphDataExport";
export { serializeVisibleGraphData } from "./experimentGraphDataExport";
import { createCategoryLayout, createNiceTicks } from "./graphLayout";
import {
  formatGraphNumber as formatNumber,
  formatGraphPercentage as formatPercentage,
  graphSignificanceSymbol as significanceSymbol,
} from "./graphValueFormatting";
import {
  buildHierarchyGroups,
  computeBoxWhiskerSummary,
  createMinorTicks,
  hierarchyLineAddsInformation,
  omitGenericCategoricalAxisTitle,
  resolveSeriesLinePresentation,
} from "./graphSemantics";
import { violinDensityPath } from "./graphGeometry";

import "./graph-workbench.css";

type LayerState = WorkspaceGraphState["layers"];

type InspectorTarget =
  | "background"
  | "x-axis"
  | "y-axis"
  | "data"
  | "raw-dots"
  | "experiment-summary"
  | "series-style"
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
type StatisticsAnnotationEntry = NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number];
type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

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
  analysisAvailable?: boolean;
  /** Render imported rows descriptively without declaring them biological n. */
  semanticReadiness?: "resolved" | "unresolved_descriptive";
  initialState?: Omit<WorkspaceGraphState, "id" | "displayName">;
  onStateChange?: (state: Omit<WorkspaceGraphState, "id" | "displayName">) => void;
  onAnalysisCorrection?: (correction: DraftAnalysisCorrection) => void;
}>;

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
  pointOpacity: 0.9,
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
  seriesStyles: {},
  distributionFill: "white",
  distributionFillColor: "#ffffff",
  distributionOutlineColor: "#111111",
  barWidth: 0.72,
  withinGroupSpacing: 0.72,
  betweenGroupSpacing: 1.35,
  barOutline: true,
  barMeanMarker: false,
  boxWhiskerMode: "tukey_1_5_iqr",
  uncertaintyStyle: "error_bars",
  ribbonOpacity: 0.18,
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
const CHART_MARGIN = { top: 38, right: 34, bottom: 96, left: 124 };
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

function pointMarkPath(
  style: "circle" | "square" | "triangle" | "diamond",
  x: number,
  y: number,
  radius: number,
): string {
  if (style === "square")
    return `M ${x - radius} ${y - radius} H ${x + radius} V ${y + radius} H ${x - radius} Z`;
  if (style === "triangle")
    return `M ${x} ${y - radius * 1.15} L ${x + radius} ${y + radius} L ${x - radius} ${y + radius} Z`;
  if (style === "diamond")
    return `M ${x} ${y - radius * 1.25} L ${x + radius} ${y} L ${x} ${y + radius * 1.25} L ${x - radius} ${y} Z`;
  return `M ${x - radius} ${y} A ${radius} ${radius} 0 1 0 ${x + radius} ${y} A ${radius} ${radius} 0 1 0 ${x - radius} ${y}`;
}

function SeriesPointMark(
  props: Readonly<{
    style: "circle" | "square" | "triangle" | "diamond";
    cx: number;
    cy: number;
    radius: number;
    fill: string;
    opacity: number;
    className: string;
    layer: string;
    inspectorTarget: InspectorTarget;
    selected: boolean;
    experimentId: string;
    value: number;
    ariaLabel: string;
    onInspect: (target: InspectorTarget) => void;
  }>,
) {
  const common = {
    fill: props.fill,
    opacity: props.opacity,
    className: props.className,
    "data-graph-layer": props.layer,
    "data-inspector-target": props.inspectorTarget,
    "data-selected": props.selected || undefined,
    "data-experiment-id": props.experimentId,
    "data-graph-value": props.value,
    "aria-label": props.ariaLabel,
    onDoubleClick: (event: ReactMouseEvent<SVGElement>) => {
      event.stopPropagation();
      props.onInspect(props.inspectorTarget);
    },
  };
  return props.style === "circle" ? (
    <circle cx={props.cx} cy={props.cy} r={props.radius} {...common} />
  ) : (
    <path d={pointMarkPath(props.style, props.cx, props.cy, props.radius)} {...common} />
  );
}

export function describeActiveGraphLayers(
  input: Readonly<{
    graphType: GraphType;
    shape: ReadoutDraft["shape"];
    layers: LayerState;
    errorBar: GraphAppearance["errorBar"];
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
  grouping: GraphGrouping,
): readonly ConditionAxisLabel[] {
  const seriesFactorId = grouping.series.source === "factor" ? grouping.series.factorId : undefined;
  const orderedAttributes = [
    ...hierarchyOrder.flatMap((attributeId) => {
      const attribute = draft.attributes.find(({ id }) => id === attributeId);
      return attribute ? [attribute] : [];
    }),
    ...draft.attributes.filter(({ id }) => !hierarchyOrder.includes(id)),
  ].filter(({ id }) => id !== seriesFactorId);
  const normalizedGrouping = normalizeGraphGroupingChannels(grouping);
  const xFactorIds =
    normalizedGrouping.x.source === "factor"
      ? normalizedGrouping.x.factorIds?.length
        ? normalizedGrouping.x.factorIds
        : normalizedGrouping.x.factorId
          ? [normalizedGrouping.x.factorId]
          : []
      : [];
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
        normalizedGrouping.x.source === "factor" && xFactorIds.length > 0
          ? xFactorIds.map((factorId) => {
              const attribute = draft.attributes.find(({ id }) => id === factorId);
              return {
                id: factorId,
                label: attribute?.label ?? "条件",
                value: condition?.attributes[factorId]?.trim() || "—",
              };
            })
          : levels.length > 0
            ? levels
            : [{ id: "condition", label: "条件", value: condition?.label || item.conditionLabel }],
      timeLabel: grouping.series.source === "time" ? "" : (item.timeLabel ?? ""),
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

function ExperimentGraphSvg({
  shape,
  readoutLabel,
  readoutUnit,
  timeSampling,
  conditionAssignment,
  axisLabels,
  series: inputSeries,
  layers,
  appearance,
  graphType,
  axes,
  svgRef,
  analysisResult,
  statisticsAnnotation,
  statisticsAnnotations = [],
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
  statisticsAnnotations?: readonly StatisticsAnnotationEntry[];
  annotationContext: string;
  layerDescription: string;
  onInspect: (target: InspectorTarget) => void;
  activeInspectorTarget: InspectorTarget;
}) {
  const series = inputSeries.filter(
    ({ visualSeriesKey }) => appearance.seriesStyles[visualSeriesKey]?.visible !== false,
  );
  const continuousXValues = series
    .map((item) => item.xValue)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const continuousLine =
    graphType === "line" &&
    (axes.xSemantic === "time" || axes.xSemantic === "numeric_covariate") &&
    continuousXValues.length > 1;
  const gapWeights = axisLabels.slice(1).map((label, index) => {
    const previous = axisLabels[index];
    if (series[index]?.xGroupKey === series[index + 1]?.xGroupKey)
      return appearance.withinGroupSpacing;
    if (previous?.conditionId === label.conditionId) return appearance.withinGroupSpacing;
    if (label.levels.length <= 1) return 1;
    const commonPrefix = label.levels.findIndex(
      (level, levelIndex) => previous?.levels[levelIndex]?.value !== level.value,
    );
    const firstDifference = commonPrefix < 0 ? label.levels.length - 1 : commonPrefix;
    if (firstDifference >= label.levels.length - 1) return 1;
    return appearance.betweenGroupSpacing + (label.levels.length - 1 - firstDifference) * 0.55;
  });
  const denseGaps = series
    .slice(1)
    .map((item, index) => item.xGroupKey === series[index]?.xGroupKey);
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
    denseGaps,
    spacing: axes.spacing,
    sidePadding: appearance.sidePadding,
    canvasPreset: appearance.canvasPreset,
    requiredSlotWidths,
  });
  const legendConditions = series.filter(
    (item, index) =>
      series.findIndex((candidate) => candidate.visualSeriesKey === item.visualSeriesKey) === index,
  );
  const showLegend =
    appearance.legendPosition !== "hidden" &&
    legendConditions.length > 1 &&
    legendConditions.some(({ visualSeriesLabel }) => visualSeriesLabel);
  const conditionIds = [...new Set(series.map((item) => item.conditionId))];
  const activeStatisticsAnnotations: readonly StatisticsAnnotationEntry[] =
    statisticsAnnotations.length > 0
      ? statisticsAnnotations
      : statisticsAnnotation.mode === "hidden"
        ? []
        : [
            {
              id: "annotation.legacy",
              testIndex: statisticsAnnotation.testIndex,
              mode: statisticsAnnotation.mode,
              showNonSignificant: true,
            },
          ];
  const resolvedAnnotations = activeStatisticsAnnotations.flatMap((annotation, stackIndex) => {
    if (analysisResult?.status !== "ok") return [];
    const test = analysisResult.tests[annotation.testIndex];
    if (!test) return [];
    const pValue = test.adjustedPValue ?? test.pValue;
    if (!annotation.showNonSignificant && pValue >= 0.05) return [];
    const [, firstConditionId, secondConditionId] = test.name.split(":");
    const candidates = series
      .map((item, index) => ({ item, index }))
      .filter(({ item }) =>
        annotation.lineage?.timePointId
          ? item.timePointId === annotation.lineage.timePointId
          : true,
      );
    const defaultTwoGroupPair =
      axes.xSemantic === "categorical" && conditionIds.length === 2
        ? conditionIds
        : ([] as string[]);
    const requestedFirstConditionId =
      annotation.endpoints?.[0].conditionId ?? firstConditionId ?? defaultTwoGroupPair[0];
    const requestedSecondConditionId =
      annotation.endpoints?.[1].conditionId ?? secondConditionId ?? defaultTwoGroupPair[1];
    const firstIndex = requestedFirstConditionId
      ? candidates.find(({ item }) => item.conditionId === requestedFirstConditionId)?.index
      : undefined;
    const secondIndex = requestedSecondConditionId
      ? candidates.find(({ item }) => item.conditionId === requestedSecondConditionId)?.index
      : undefined;
    const pairwise =
      firstIndex !== undefined && secondIndex !== undefined
        ? ([Math.min(firstIndex, secondIndex), Math.max(firstIndex, secondIndex)] as const)
        : null;
    return [{ annotation, test, pValue, pairwise, symbolTargetIndex: firstIndex, stackIndex }];
  });
  const bracketLayout = layoutComparisonBrackets(
    resolvedAnnotations.flatMap(({ annotation, pairwise }) =>
      pairwise ? [{ id: annotation.id, start: pairwise[0], end: pairwise[1] }] : [],
    ),
  );
  const bracketLevelById = new Map(bracketLayout.map(({ id, level }) => [id, level]));
  const bracketRows = Math.max(0, ...bracketLayout.map(({ level }) => level + 1));
  const nonPairwiseRows = Math.max(
    0,
    ...resolvedAnnotations.flatMap(({ annotation, pairwise, stackIndex }) =>
      !pairwise && annotation.presentation !== "symbol_only" ? [stackIndex + 1] : [],
    ),
  );
  const annotationTopRows = Math.max(bracketRows, nonPairwiseRows);
  const topLegendRows =
    showLegend && appearance.legendPosition === "top" ? Math.ceil(legendConditions.length / 3) : 0;
  const topLegendHeight = topLegendRows * Math.max(34, appearance.legendFontSize * 2);
  const singleCategoricalFactorTitle =
    axes.xSemantic === "categorical" && (axisLabels[0]?.levels.length ?? 0) === 1
      ? axisLabels[0]?.levels[0]?.label?.trim()
      : "";
  const xAxisTitle =
    axes.xSemantic === "categorical"
      ? omitGenericCategoricalAxisTitle(axes.xTitle) ||
        (singleCategoricalFactorTitle === "条件" ? "" : singleCategoricalFactorTitle)
      : axes.xTitle.trim() || (axes.xSemantic === "time" ? "Time" : "Covariate");
  const renderedXAxisTitle = xAxisTitle
    ? `${xAxisTitle}${axes.xUnit.trim() ? ` (${axes.xUnit.trim()})` : ""}`
    : "";
  const hierarchyDepth =
    axes.showCategoryLabels && !continuousLine ? Math.max(0, axisLabels[0]?.levels.length ?? 0) : 0;
  const hierarchyHeadingWidth = Math.max(
    0,
    ...(axisLabels[0]?.levels ?? []).flatMap(({ label }, levelIndex) =>
      label &&
      !(levelIndex === 0 && label === "条件") &&
      !(levelIndex === 0 && label === singleCategoricalFactorTitle)
        ? [estimatedRenderedTextWidth(label, appearance.hierarchyFontSize)]
        : [],
    ),
  );
  const rightLegendWidth =
    showLegend && appearance.legendPosition === "right"
      ? Math.max(
          190,
          ...legendConditions.map((item) => {
            const label =
              appearance.seriesStyles[item.visualSeriesKey]?.legendLabel ?? item.visualSeriesLabel;
            return (
              Math.max(
                ...splitParentLabel(`${label}${item.auxiliaryReference ? " (reference)" : ""}`).map(
                  (line) => estimatedRenderedTextWidth(line, appearance.legendFontSize),
                ),
              ) + 54
            );
          }),
        )
      : 0;
  const annotationTopHeight = annotationTopRows * 24;
  const margin = {
    ...CHART_MARGIN,
    top: CHART_MARGIN.top + topLegendHeight + annotationTopHeight,
    right: CHART_MARGIN.right + rightLegendWidth,
    left: Math.max(CHART_MARGIN.left, Math.ceil(hierarchyHeadingWidth + 26)),
  };
  const graphInnerWidth = continuousLine ? 720 : categoryLayout.innerWidth;
  const width = margin.left + margin.right + graphInnerWidth;
  // Reserve separate horizontal bands for the Y title and tick labels. A fixed
  // 30 px offset allowed ordinary decimal ticks to overlap a long axis title.
  const yAxisTitleX = 24;
  const extraLabelHeight = Math.max(0, hierarchyDepth - 1) * 27;
  const xAxisTitleHeight = renderedXAxisTitle ? 34 : 0;
  const statisticsLegendLabels = [
    ...new Set(
      statisticsAnnotations.flatMap(({ presentation, legendLabel }) =>
        presentation === "symbol_only" && legendLabel ? [legendLabel] : [],
      ),
    ),
  ];
  const statisticsLegendHeight = statisticsLegendLabels.length
    ? statisticsLegendLabels.length * 20 + 12
    : 0;
  const baseBottomMargin = continuousLine ? 58 : CHART_MARGIN.bottom;
  const height =
    CHART_HEIGHT +
    extraLabelHeight +
    topLegendHeight +
    annotationTopHeight +
    xAxisTitleHeight +
    statisticsLegendHeight;
  margin.bottom = baseBottomMargin + extraLabelHeight + xAxisTitleHeight + statisticsLegendHeight;
  const plotHeight = height - margin.top - margin.bottom;
  const baseColors = GRAPH_PALETTES[appearance.palette];
  const visualSeriesKeys = [...new Set(series.map((item) => item.visualSeriesKey))];
  const colors = visualSeriesKeys.map(
    (seriesKey, index) =>
      appearance.seriesStyles[seriesKey]?.color ??
      appearance.seriesColors[seriesKey] ??
      baseColors[index % baseColors.length],
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
  const tickDirection = axes.tickDirection ?? "outside";
  const xTickDelta = tickDirection === "inside" ? -1 : 1;
  const yTickDelta = tickDirection === "inside" ? 1 : -1;
  const continuousXMin = continuousXValues.length ? Math.min(...continuousXValues) : 0;
  const continuousXMax = continuousXValues.length ? Math.max(...continuousXValues) : 1;
  const manualXRangeIsValid =
    axes.xRangeMode === "manual" &&
    axes.xMin !== null &&
    axes.xMin !== undefined &&
    axes.xMax !== null &&
    axes.xMax !== undefined &&
    axes.xMin < axes.xMax &&
    (axes.xScale !== "log10" || axes.xMin > 0);
  const continuousDomainMin = manualXRangeIsValid ? axes.xMin! : continuousXMin;
  const continuousDomainMax = manualXRangeIsValid ? axes.xMax! : continuousXMax;
  const continuousLogMin = Math.log10(Math.max(continuousDomainMin, Number.MIN_VALUE));
  const continuousLogMax = Math.log10(Math.max(continuousDomainMax, Number.MIN_VALUE));
  const continuousXRange = Math.max(continuousDomainMax - continuousDomainMin, Number.EPSILON);
  const xForContinuousValue = (value: number) => {
    const ratio =
      axes.xScale === "log10" && value > 0 && continuousLogMax > continuousLogMin
        ? (Math.log10(value) - continuousLogMin) / (continuousLogMax - continuousLogMin)
        : (value - continuousDomainMin) / continuousXRange;
    return margin.left + Math.max(0, Math.min(1, ratio)) * graphInnerWidth;
  };
  const xFor = (index: number) => {
    if (continuousLine) {
      const value = series[index]?.xValue ?? continuousDomainMin;
      return xForContinuousValue(value);
    }
    return margin.left + categoryLayout.sidePadding + (categoryLayout.offsets[index] ?? 0);
  };
  const continuousTickIndices = continuousLine
    ? (() => {
        const firstIndexByValue = new Map<number, number>();
        series.forEach((item, index) => {
          if (item.xValue !== undefined && !firstIndexByValue.has(item.xValue)) {
            firstIndexByValue.set(item.xValue, index);
          }
        });
        const ordered = [...firstIndexByValue.entries()].sort(([a], [b]) => a - b);
        const stride = Math.max(1, Math.ceil(ordered.length / 8));
        const selected = ordered
          .filter((_, index) => index % stride === 0)
          .map(([, index]) => index);
        const last = ordered.at(-1)?.[1];
        if (last !== undefined && !selected.includes(last)) selected.push(last);
        return new Set(selected);
      })()
    : null;
  const continuousTickFractionDigits = continuousLine
    ? (() => {
        const ordered = [...new Set(continuousXValues)].sort((a, b) => a - b);
        const minimumGap = ordered
          .slice(1)
          .reduce(
            (minimum, value, index) => Math.min(minimum, value - ordered[index]),
            Number.POSITIVE_INFINITY,
          );
        if (!Number.isFinite(minimumGap) || minimumGap >= 1) return 0;
        return Math.min(4, Math.max(1, Math.ceil(-Math.log10(minimumGap)) + 1));
      })()
    : 0;
  const continuousTickValues = continuousLine
    ? axes.xScale === "log10"
      ? Array.from(
          { length: Math.max(1, Math.floor(continuousLogMax) - Math.ceil(continuousLogMin) + 1) },
          (_, index) => 10 ** (Math.ceil(continuousLogMin) + index),
        )
      : [
          ...createNiceTicks(
            continuousDomainMin,
            continuousDomainMax,
            6,
            axes.xTickMode === "manual" ? (axes.xTickInterval ?? null) : null,
          ),
        ].reverse()
    : [];
  const continuousMinorTickValues =
    continuousLine && axes.xScale !== "log10" && (axes.showMinorTicks ?? true)
      ? createMinorTicks(continuousTickValues, continuousDomainMin, continuousDomainMax, 5)
      : [];
  const hierarchyGroups = buildHierarchyGroups(axisLabels).slice(0, hierarchyDepth);
  const categoryLabelRotationDegrees =
    axes.categoryLabelRotation === "minus_30"
      ? -30
      : axes.categoryLabelRotation === "minus_45"
        ? -45
        : axes.categoryLabelRotation === "minus_90"
          ? -90
          : 0;
  const hasTimeLabels = axisLabels.some(({ timeLabel }) => timeLabel);
  const xAxisTitleY =
    height - margin.bottom + (hasTimeLabels ? 88 : 70) + extraLabelHeight;
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
  const yTickFractionDigits = domainRange < 1 ? 2 : 1;
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
    timeSampling === "longitudinal" && layers.connectingLine
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
      data-category-slot-width={continuousLine ? 0 : categoryLayout.baseSlot}
      data-side-padding={categoryLayout.sidePadding}
      data-left-margin={margin.left}
      data-statistics-bracket-levels={bracketRows}
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
            const style = appearance.seriesStyles[item.visualSeriesKey];
            const linePresentation = resolveSeriesLinePresentation(
              style,
              appearance.summaryLineWidth,
            );
            const legendLabel = style?.legendLabel ?? item.visualSeriesLabel;
            const labelLines = splitParentLabel(
              `${legendLabel}${item.auxiliaryReference ? " (reference)" : ""}`,
            );
            return (
              <g key={item.visualSeriesKey} transform={`translate(${legendX} ${legendY})`}>
                <title>{legendLabel}</title>
                {graphType === "line" || layers.connectingLine ? (
                  <line
                    x1="-2"
                    y1="-4"
                    x2="12"
                    y2="-4"
                    stroke={colors[index % colors.length]}
                    strokeWidth={linePresentation.lineWidth}
                    strokeDasharray={linePresentation.dashArray}
                    data-legend-line-style={linePresentation.lineStyle}
                  />
                ) : null}
                <path
                  d={pointMarkPath(style?.pointStyle ?? "circle", 5, -4, 5)}
                  fill={colors[index % colors.length]}
                />
                <text
                  x="16"
                  y="0"
                  fill="#000"
                  fontSize={appearance.legendFontSize}
                  className="experiment-graph-svg-legend-label"
                >
                  {labelLines.map((line, lineIndex) => (
                    <tspan
                      key={`${item.visualSeriesKey}-${lineIndex}`}
                      x="16"
                      dy={lineIndex ? 17 : 0}
                    >
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
              x1={margin.left}
              x2={margin.left + yTickDelta * 5}
              y1={y}
              y2={y}
              className="experiment-graph-tick"
              data-axis-tick="y"
              data-tick-direction={tickDirection}
            />
            <text
              x={margin.left - 10}
              y={y + 5}
              textAnchor="end"
              className="experiment-graph-axis-label"
              style={{ fontSize: appearance.tickFontSize, fill: "#000" }}
            >
              {formatNumber(tick, yTickFractionDigits)}
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
      {!continuousLine
        ? axisLabels.map((label, index) =>
            continuousTickIndices && !continuousTickIndices.has(index) ? null : (
              <line
                key={`category-tick-${label.conditionId}-${label.timeLabel || "none"}-${index}`}
                x1={xFor(index)}
                x2={xFor(index)}
                y1={height - margin.bottom}
                y2={height - margin.bottom + xTickDelta * 6}
                className="experiment-graph-category-tick"
                data-inspector-target="x-axis"
                data-axis-tick="x"
                data-tick-direction={tickDirection}
              />
            ),
          )
        : [
            ...continuousMinorTickValues.map((value) => (
              <line
                key={`continuous-x-minor-tick-${value}`}
                x1={xForContinuousValue(value)}
                x2={xForContinuousValue(value)}
                y1={height - margin.bottom}
                y2={height - margin.bottom + xTickDelta * 3.5}
                className="experiment-graph-minor-tick"
                data-graph-layer="minor-tick"
                data-axis-tick="x-minor"
                data-tick-direction={tickDirection}
              />
            )),
            ...continuousTickValues.map((value: number) => (
              <g key={`continuous-x-tick-${value}`}>
                <line
                  x1={xForContinuousValue(value)}
                  x2={xForContinuousValue(value)}
                  y1={height - margin.bottom}
                  y2={height - margin.bottom + xTickDelta * 6}
                  className="experiment-graph-category-tick"
                  data-axis-tick="x"
                  data-tick-direction={tickDirection}
                />
                <text
                  x={xForContinuousValue(value)}
                  y={height - margin.bottom + 25}
                  textAnchor="middle"
                  className="experiment-graph-condition-attribute experiment-graph-time-label"
                  style={{ fontSize: appearance.tickFontSize, fill: "#000" }}
                >
                  {formatNumber(value, continuousTickFractionDigits)}
                </text>
              </g>
            )),
          ]}
      {!continuousLine && axes.showCategoryGroupSeparators
        ? (hierarchyGroups[0] ?? []).slice(0, -1).map((group, index) => {
            const nextGroup = hierarchyGroups[0]?.[index + 1];
            if (!nextGroup) return null;
            const separatorX = (xFor(group.end) + xFor(nextGroup.start)) / 2;
            return (
              <line
                key={`category-group-separator-${group.key}`}
                x1={separatorX}
                x2={separatorX}
                y1={height - margin.bottom}
                y2={height - margin.bottom + xTickDelta * 10}
                className="experiment-graph-category-group-separator"
                data-graph-layer="category-group-separator"
                data-tick-direction={tickDirection}
              />
            );
          })
        : null}
      <text
        x={yAxisTitleX}
        y={margin.top + plotHeight / 2}
        transform={`rotate(-90 ${yAxisTitleX} ${margin.top + plotHeight / 2})`}
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
          y={xAxisTitleY}
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
      {axes.referenceLines?.map((reference) => (
        <g key={reference.id} data-graph-layer="reference-line">
          <line
            x1={margin.left}
            x2={width - margin.right}
            y1={yFor(reference.value)}
            y2={yFor(reference.value)}
            stroke={reference.color}
            strokeWidth={1.2}
            strokeDasharray={
              reference.lineStyle === "dashed"
                ? "7 5"
                : reference.lineStyle === "dotted"
                  ? "2 4"
                  : undefined
            }
          />
          {reference.label ? (
            <text
              x={width - margin.right - 4}
              y={yFor(reference.value) - 5}
              textAnchor="end"
              className="experiment-graph-stat-label"
            >
              {reference.label}
            </text>
          ) : null}
        </g>
      ))}
      {resolvedAnnotations.map(
        ({ annotation, test, pValue, pairwise, symbolTargetIndex, stackIndex }) => {
          const annotationLevel = bracketLevelById.get(annotation.id) ?? stackIndex;
          if (annotation.presentation === "symbol_only") {
            const targetIndex = symbolTargetIndex;
            const target = targetIndex === undefined ? undefined : series[targetIndex];
            const targetValues = target
              ? shape === "proportion"
                ? target.proportionPoints.map(({ value }) => value)
                : [
                    ...target.rawPoints.map(({ value }) => value),
                    ...target.experimentPoints.map(({ value }) => value),
                  ]
              : [];
            if (targetIndex === undefined || targetValues.length === 0) return null;
            return (
              <text
                key={annotation.id}
                x={xFor(targetIndex)}
                y={Math.max(margin.top + 12, yFor(Math.max(...targetValues)) - 12)}
                textAnchor="middle"
                className="experiment-graph-stat-label"
                data-graph-layer="statistics-annotation"
                data-statistics-presentation="symbol-only"
              >
                {annotation.mode === "symbol"
                  ? significanceSymbol(pValue)
                  : `p = ${formatExactPValue(pValue)}`}
              </text>
            );
          }
          return pairwise ? (
            <g key={annotation.id} data-graph-layer="statistics-annotation">
              <line
                x1={xFor(pairwise[0])}
                x2={xFor(pairwise[1])}
                y1={margin.top - 10 - annotationLevel * 24}
                y2={margin.top - 10 - annotationLevel * 24}
                className="experiment-graph-stat-line"
              />
              <line
                x1={xFor(pairwise[0])}
                x2={xFor(pairwise[0])}
                y1={margin.top - 10 - annotationLevel * 24}
                y2={margin.top - 4 - annotationLevel * 24}
                className="experiment-graph-stat-line"
              />
              <line
                x1={xFor(pairwise[1])}
                x2={xFor(pairwise[1])}
                y1={margin.top - 10 - annotationLevel * 24}
                y2={margin.top - 4 - annotationLevel * 24}
                className="experiment-graph-stat-line"
              />
              <text
                x={(xFor(pairwise[0]) + xFor(pairwise[1])) / 2}
                y={margin.top - 14 - annotationLevel * 24}
                textAnchor="middle"
                className="experiment-graph-stat-label"
              >
                {annotation.mode === "symbol"
                  ? significanceSymbol(pValue)
                  : `p = ${formatExactPValue(pValue)}`}
              </text>
            </g>
          ) : (
            <text
              key={annotation.id}
              x={width - margin.right}
              y={margin.top - 10 - stackIndex * 22}
              textAnchor="end"
              className="experiment-graph-stat-label"
              data-graph-layer="statistics-annotation"
            >
              {`${test.name || annotationContext} · ${
                annotation.mode === "symbol"
                  ? significanceSymbol(pValue)
                  : `${
                      isPairwiseComparisonTest(test.name) ? "p" : "全体 p"
                    } = ${formatExactPValue(pValue)}`
              }`}
            </text>
          );
        },
      )}
      {statisticsLegendLabels.map((label, index) => (
        <text
          key={`statistics-legend-${label}`}
          x={margin.left}
          y={height - xAxisTitleHeight - statisticsLegendHeight + 20 + index * 20}
          textAnchor="start"
          className="experiment-graph-statistics-legend"
          data-graph-layer="statistics-legend"
        >
          {label}
        </text>
      ))}
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
        continuousLine &&
        layers.errorBar &&
        (appearance.uncertaintyStyle ?? "error_bars") === "ribbon" &&
        visualSeriesKeys.map((visualSeriesKey) => {
          const points = series
            .filter(
              (item) =>
                item.visualSeriesKey === visualSeriesKey &&
                item.xValue !== undefined &&
                item.summary.mean !== null &&
                item.summary.sd !== null,
            )
            .sort((first, second) => first.xValue! - second.xValue!);
          if (points.length < 2) return null;
          const interval = (item: GraphSeries) =>
            appearance.errorBar === "sem"
              ? item.summary.sd! / Math.sqrt(Math.max(item.summary.n, 1))
              : item.summary.sd!;
          const upper = points.map(
            (item) =>
              `${xForContinuousValue(item.xValue!)},${yFor(item.summary.mean! + interval(item))}`,
          );
          const lower = [...points]
            .reverse()
            .map(
              (item) =>
                `${xForContinuousValue(item.xValue!)},${yFor(item.summary.mean! - interval(item))}`,
            );
          const color =
            colors[Math.max(0, visualSeriesKeys.indexOf(visualSeriesKey)) % colors.length];
          return (
            <path
              key={`ribbon-${visualSeriesKey}`}
              d={`M ${upper[0]} L ${[...upper.slice(1), ...lower].join(" L ")} Z`}
              fill={color}
              opacity={appearance.ribbonOpacity ?? 0.18}
              stroke="none"
              className="experiment-graph-uncertainty-ribbon"
              data-graph-layer="uncertainty-ribbon"
              data-uncertainty={appearance.errorBar}
            />
          );
        })}
      {(graphType === "line" || layers.connectingLine) &&
        visualSeriesKeys.map((visualSeriesKey) => {
          const points = series.flatMap((item, index) =>
            item.visualSeriesKey === visualSeriesKey && item.summary.mean !== null
              ? [`${xFor(index)},${yFor(item.summary.mean)}`]
              : [],
          );
          if (points.length < 2) return null;
          const color =
            colors[Math.max(0, visualSeriesKeys.indexOf(visualSeriesKey)) % colors.length];
          const linePresentation = resolveSeriesLinePresentation(
            appearance.seriesStyles[visualSeriesKey],
            appearance.summaryLineWidth,
          );
          return (
            <polyline
              key={`line-${visualSeriesKey}`}
              points={points.join(" ")}
              fill="none"
              stroke={color}
              className="experiment-graph-connecting-line experiment-graph-summary-trend"
              style={{
                stroke: color,
                strokeWidth: linePresentation.lineWidth,
                strokeDasharray: linePresentation.dashArray,
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
              heading &&
              !(levelIndex === 0 && heading === "条件") &&
              !(levelIndex === 0 && heading === singleCategoricalFactorTitle) ? (
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
                    {hierarchyLineAddsInformation(groups, group) ? (
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
                      textAnchor={categoryLabelRotationDegrees ? "end" : "middle"}
                      transform={
                        categoryLabelRotationDegrees
                          ? `rotate(${categoryLabelRotationDegrees} ${center} ${rowY})`
                          : undefined
                      }
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
        const color =
          colors[Math.max(0, visualSeriesKeys.indexOf(item.visualSeriesKey)) % colors.length];
        const seriesStyle = appearance.seriesStyles[item.visualSeriesKey];
        const distributionFill = seriesStyle?.fill ?? appearance.distributionFill;
        const distributionFillColor =
          distributionFill === "none"
            ? "none"
            : distributionFill === "white"
              ? "#ffffff"
              : distributionFill === "custom"
                ? (seriesStyle?.fillColor ?? appearance.distributionFillColor)
                : color;
        const summary = item.summary;
        const violinValues =
          shape === "proportion"
            ? item.proportionPoints.map(({ value }) => value)
            : item.rawPoints.map(({ value }) => value);
        const boxValues =
          shape === "proportion"
            ? item.proportionPoints.map(({ value }) => value)
            : shape === "nested_continuous"
              ? item.rawPoints.map(({ value }) => value)
              : item.experimentPoints.map(({ value }) => value);
        const boxSummary = computeBoxWhiskerSummary(
          boxValues,
          appearance.boxWhiskerMode ?? "tukey_1_5_iqr",
        );
        const rawMinimum = boxSummary?.lowerWhisker ?? null;
        const rawQ1 = boxSummary?.q1 ?? null;
        const rawMedian = boxSummary?.median ?? null;
        const rawQ3 = boxSummary?.q3 ?? null;
        const rawMaximum = boxSummary?.upperWhisker ?? null;
        const mean = summary.mean;
        const sd = summary.sd;
        const meanY = mean === null ? null : yFor(mean);
        const error =
          appearance.errorBar === "none" || sd === null || summary.n <= 1
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
        const barLocalHalfWidth = Math.min(previousGap, nextGap, 84) / 2;
        const jitterWidth = Math.min(appearance.jitter, Math.max(4, localHalfWidth * 0.58));
        const distributionHalfWidth = Math.min(22, Math.max(8, localHalfWidth * 0.78));
        const barHalfWidth = Math.min(42, Math.max(8, barLocalHalfWidth * appearance.barWidth));
        const currentViolinPath = violinDensityPath(violinValues, x, yFor, distributionHalfWidth);
        const barBaselineValue = axes.yScale === "log10" ? domainMin : Math.max(0, domainMin);
        const barBaselineY = yFor(barBaselineValue);
        return (
          <g
            key={item.seriesKey}
            data-condition-index={seriesIndex}
            data-condition-parent={axisLabel.levels[0]?.value ?? item.conditionLabel}
          >
            {axes.showCategoryLabels &&
            !continuousLine &&
            (!continuousTickIndices || continuousTickIndices.has(seriesIndex)) ? (
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
                x={x - barHalfWidth}
                y={Math.min(meanY, barBaselineY)}
                width={barHalfWidth * 2}
                height={Math.max(1, Math.abs(barBaselineY - meanY))}
                fill={color}
                opacity={0.24}
                stroke={appearance.barOutline === false ? "none" : color}
                strokeWidth={appearance.barOutline === false ? 0 : appearance.distributionLineWidth}
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
                  fill={distributionFillColor}
                  className="experiment-graph-violin"
                  style={{
                    strokeWidth: appearance.distributionLineWidth,
                    stroke: appearance.distributionOutlineColor,
                  }}
                />
                <path
                  d={currentViolinPath}
                  fill="none"
                  stroke="none"
                  className="experiment-graph-violin-hit-target"
                />
              </g>
            ) : null}
            {shape === "proportion" &&
              layers.experiment &&
              item.proportionPoints.map((point, pointIndex) => (
                <SeriesPointMark
                  key={`${point.experimentId}-${pointIndex}`}
                  style={seriesStyle?.pointStyle ?? "circle"}
                  cx={x + (pointIndex - (item.proportionPoints.length - 1) / 2) * 12}
                  cy={yFor(point.value)}
                  radius={appearance.pointSize}
                  fill={color}
                  opacity={appearance.pointOpacity}
                  className="experiment-graph-point"
                  layer="proportion-experiment"
                  inspectorTarget="experiment-summary"
                  selected={activeInspectorTarget === "experiment-summary"}
                  experimentId={point.experimentId}
                  value={point.value}
                  ariaLabel={`${item.conditionLabel} ${point.experimentLabel}: ${formatPercentage(point.value)}（${point.positive}/${point.eligible}）`}
                  onInspect={onInspect}
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
                    fill="none"
                    stroke="none"
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
                  <line
                    x1={x - 10}
                    x2={x + 10}
                    y1={yFor(rawMaximum)}
                    y2={yFor(rawMaximum)}
                    className="experiment-graph-distribution-whisker-cap"
                    style={{ strokeWidth: appearance.distributionLineWidth }}
                  />
                  <line
                    x1={x - 10}
                    x2={x + 10}
                    y1={yFor(rawMinimum)}
                    y2={yFor(rawMinimum)}
                    className="experiment-graph-distribution-whisker-cap"
                    style={{ strokeWidth: appearance.distributionLineWidth }}
                  />
                  <rect
                    x={x - 22}
                    y={yFor(rawQ3)}
                    width={44}
                    height={Math.max(1, yFor(rawQ1) - yFor(rawQ3))}
                    fill={distributionFillColor}
                    className="experiment-graph-distribution-box"
                    style={{
                      strokeWidth: appearance.distributionLineWidth,
                      stroke: appearance.distributionOutlineColor,
                    }}
                  />
                  <line
                    x1={x - 22}
                    x2={x + 22}
                    y1={yFor(rawMedian)}
                    y2={yFor(rawMedian)}
                    className="experiment-graph-distribution-median"
                    style={{ strokeWidth: appearance.summaryLineWidth }}
                  />
                  {boxSummary?.outliers.map((value, outlierIndex) => (
                    <circle
                      key={`box-outlier-${outlierIndex}-${value}`}
                      cx={x}
                      cy={yFor(value)}
                      r={Math.max(2.2, appearance.pointSize * 0.42)}
                      fill="none"
                      stroke={appearance.distributionOutlineColor}
                      className="experiment-graph-distribution-outlier"
                      data-graph-layer="box-outlier"
                    />
                  ))}
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
                <SeriesPointMark
                  key={`${point.experimentId}-experiment-${pointIndex}`}
                  style={seriesStyle?.pointStyle ?? "circle"}
                  cx={x + (pointIndex - (item.experimentPoints.length - 1) / 2) * 8}
                  cy={yFor(point.value)}
                  radius={appearance.pointSize + 1}
                  fill={color}
                  opacity={appearance.pointOpacity}
                  className="experiment-graph-point experiment-graph-point--experiment"
                  layer="nested-experiment"
                  inspectorTarget="experiment-summary"
                  selected={activeInspectorTarget === "experiment-summary"}
                  experimentId={point.experimentId}
                  value={point.value}
                  ariaLabel={`${item.conditionLabel} ${point.experimentLabel}の実験単位平均: ${formatNumber(point.value)}`}
                  onInspect={onInspect}
                />
              ))}
            {layers.overall &&
              meanY !== null &&
              (graphType !== "bar" || appearance.barMeanMarker === true) && (
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
            {layers.overall &&
              layers.errorBar &&
              (appearance.uncertaintyStyle ?? "error_bars") === "error_bars" &&
              lowerY !== null &&
              upperY !== null && (
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
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  return (
    <div className="experiment-graph-data-summary" aria-label={t("階層データの要約", "Hierarchical-data summary")}>
      {series.map((item) => (
        <div className="experiment-graph-summary-row" key={item.seriesKey}>
          <strong>
            {item.conditionLabel}
            {item.timeLabel ? `・${item.timeLabel}` : ""}
          </strong>
          <span>
            {t(
              `実験単位 ${item.experimentPoints.length}、細胞・ROI ${item.rawPoints.length}`,
              `Experimental units ${item.experimentPoints.length}, cells/ROIs ${item.rawPoints.length}`,
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ExperimentGraphWorkbench({
  draft,
  cells,
  onClose,
  workspaceMode = "combined",
  analysisRunner = defaultAnalysisRunner,
  analysisAvailable = true,
  semanticReadiness = "resolved",
  initialState,
  onStateChange,
  onAnalysisCorrection,
}: ExperimentGraphWorkbenchProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const recommendationDesign = useMemo(() => {
    try {
      return createExperimentWorkspaceDesign(draft, "1970-01-01T00:00:00.000Z");
    } catch {
      // Legacy shared-source drafts can still be inspected and corrected, but
      // may not execute statistics until their adaptive contract is available.
      return null;
    }
  }, [draft]);
  const sharedSourceTopology =
    hasSharedSourceConditionUnits(draft) &&
    draft.conditionAssignment.matchedTopology?.kind === "distinct_condition_units_shared_source"
      ? draft.conditionAssignment.matchedTopology
      : null;
  const [selectedReadoutId, setSelectedReadoutId] = useState(
    initialState?.selectedReadoutId ?? draft.readouts[0]?.id ?? "",
  );
  const independentNestedSource = nestedIndependentSourceContext({
    draft,
    readoutId: selectedReadoutId,
  });
  const [selectedConditionIds, setSelectedConditionIds] = useState<string[]>(() =>
    initialState
      ? [
          ...(initialState.dataSets?.displaySet.conditionIds.length
            ? initialState.dataSets.displaySet.conditionIds
            : initialState.selectedConditionIds),
        ]
      : draft.conditions.map(({ id }) => id),
  );
  const [analysisConditionIds, setAnalysisConditionIds] = useState<string[]>(() =>
    initialState?.dataSets?.analysisSet.conditionIds.length
      ? [...initialState.dataSets.analysisSet.conditionIds]
      : initialState?.analysisConditionIds
        ? [...initialState.analysisConditionIds]
        : draft.conditions.filter(({ role }) => role !== "auxiliary_reference").map(({ id }) => id),
  );
  const [selectedTimePointIds, setSelectedTimePointIds] = useState<string[]>(() =>
    initialState
      ? [
          ...(initialState.dataSets?.displaySet.timePointIds.length
            ? initialState.dataSets.displaySet.timePointIds
            : initialState.selectedTimePointIds),
        ]
      : draft.time.points.map(({ id }) => id),
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
  const [layers, setLayers] = useState<LayerState>(() => {
    if (initialState?.layers) return initialState.layers;
    if (semanticReadiness !== "unresolved_descriptive") return DEFAULT_LAYERS;
    return {
      ...defaultLayersForGraphType("dot", draft.readouts[0]?.shape ?? "proportion"),
      // Summarizing unresolved rows can silently imply a statistical unit.
      // Start with the source rows only; the researcher may opt into a visual
      // summary without that changing Statistics readiness.
      overall: false,
      errorBar: false,
    };
  });
  const proposedInitialGrouping = useMemo(
    () =>
      normalizeGraphGroupingChannels(initialState?.grouping ?? createInitialGraphGrouping(draft)),
    [draft, initialState?.grouping],
  );
  const [appearance, setAppearance] = useState<GraphAppearance>({
    ...DEFAULT_APPEARANCE,
    ...(proposedInitialGrouping.series.source !== "none"
      ? { legendPosition: "right" as const, palette: "condition" as const }
      : {}),
    ...initialState?.appearance,
  });
  const [graphType, setGraphType] = useState<GraphType>(initialState?.graphType ?? "dot");
  const [grouping, setGrouping] = useState<GraphGrouping>(proposedInitialGrouping);
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
      showMinorTicks: true,
      tickDirection: "outside",
      showCategoryGroupSeparators: false,
    },
  );
  const [analysis, setAnalysis] = useState<WorkspaceGraphAnalysis | null>(
    initialState?.analysis ?? null,
  );
  const [statisticsAnnotation, setStatisticsAnnotation] = useState<StatisticsAnnotation>(
    initialState?.statisticsAnnotation ?? { mode: "hidden", testIndex: 0 },
  );
  const [statisticsAnnotations, setStatisticsAnnotations] = useState<StatisticsAnnotationEntry[]>(
    () => [...(initialState?.statisticsAnnotations ?? [])],
  );
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget>(
    workspaceMode === "statistics" ? "statistics" : "data",
  );
  const [fitOverview, setFitOverview] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [pngExportFeedback, setPngExportFeedback] = useState<Readonly<{
    kind: "success" | "error";
    text: string;
  }> | null>(null);
  const [benchmarkCaptureStatus, setBenchmarkCaptureStatus] = useState<string | null>(null);
  const benchmarkRun = useBenchmarkRun();
  const analysisResult = analysis?.result ?? null;
  const autoAnnotatedAnalysisRef = useRef(initialState?.analysis?.result.requestId ?? null);
  const adjustedComparisonAnnotations = useMemo(
    () =>
      analysisResult?.status === "ok"
        ? analysisResult.tests.flatMap((test, testIndex) => {
            const annotation = createAdjustedComparisonAnnotation({
              test,
              testIndex,
              requestId: analysisResult.requestId,
              sourceMode,
              timeAnalysis,
              analysisTimePointId,
            });
            return annotation ? [annotation] : [];
          })
        : [],
    [analysisResult, analysisTimePointId, sourceMode, timeAnalysis],
  );
  useEffect(() => {
    if (!analysisResult || analysisResult.status !== "ok") return;
    if (autoAnnotatedAnalysisRef.current === analysisResult.requestId) return;
    autoAnnotatedAnalysisRef.current = analysisResult.requestId;
    setStatisticsAnnotations(adjustedComparisonAnnotations);
  }, [adjustedComparisonAnnotations, analysisResult]);
  const methodsText = useMemo(() => {
    if (!analysis || analysis.result.status !== "ok") return null;
    const design = createExperimentWorkspaceDesign(draft, analysis.result.completedAt);
    const canonicalRecommendation = requireAnalysisRequestRecommendation(design, analysis.request, {
      outcomeId: selectedReadoutId,
    });
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
    if (timeAnalysis.kind === "selected_timepoint" || timeAnalysis.kind === "full_time_course")
      return graphMetadata ? `${base}\n${graphMetadata}` : base;
    const window = `${timeAnalysis.windowStart ?? "最初"}～${timeAnalysis.windowEnd ?? "最後"} ${draft.time.unit}`;
    const baseline =
      timeAnalysis.kind === "change_from_baseline" || timeAnalysis.kind === "f_over_f0"
        ? `。baseline=${timeAnalysis.baselineTime ?? "最初の時点"} ${draft.time.unit}`
        : "";
    return `${base}\n時系列の派生値：${timeMetricLabel(timeAnalysis)}。解析window=${window}${baseline}。raw時系列と変換設定はプロジェクトに保持。${graphMetadata ? ` ${graphMetadata}` : ""}`;
  }, [
    analysis,
    appearance.boxWhiskerMode,
    appearance.errorBar,
    appearance.ribbonOpacity,
    appearance.uncertaintyStyle,
    axes.xSemantic,
    axes.xTitle,
    axes.xUnit,
    draft,
    graphType,
    layers.errorBar,
    selectedReadoutId,
    timeAnalysis,
  ]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const graphStateSnapshot = useMemo<Omit<WorkspaceGraphState, "id" | "displayName">>(
    () =>
      createWorkspaceGraphStateSnapshot({
        selectedReadoutId,
        sourceMode,
        selectedConditionIds,
        analysisConditionIds,
        selectedTimePointIds,
        analysisTimePointId,
        analysisMetric: timeAnalysis,
        plannedContrastConditionIds,
        graphType,
        grouping,
        layers,
        appearance,
        axes,
        statisticsAnnotation,
        statisticsAnnotations,
        initialAnalysisRunId: initialState?.analysisRunId,
        analysis,
      }),
    [
      analysis,
      analysisTimePointId,
      appearance,
      axes,
      graphType,
      grouping,
      initialState?.analysisRunId,
      layers,
      analysisConditionIds,
      selectedConditionIds,
      selectedReadoutId,
      selectedTimePointIds,
      plannedContrastConditionIds,
      sourceMode,
      statisticsAnnotation,
      statisticsAnnotations,
      timeAnalysis,
    ],
  );
  const benchmarkRenderedState = JSON.stringify({
    selectedReadoutId,
    sourceMode,
    selectedConditionIds,
    analysisConditionIds,
    selectedTimePointIds,
    graphType,
    grouping,
    layers,
    appearance,
    axes,
    statisticsAnnotation,
    statisticsAnnotations,
    displayedDerivedMetric:
      sourceMode === "derived_metric" && isDerivedTimeMetric(timeAnalysis) ? timeAnalysis : null,
  });
  const benchmarkAnalysisState = JSON.stringify({
    selectedReadoutId,
    sourceMode,
    selectedConditionIds,
    analysisConditionIds,
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
    setStatisticsAnnotations([]);
  }, [initialState?.analysis]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useLayoutEffect(() => {
    onStateChangeRef.current?.(graphStateSnapshot);
  }, [graphStateSnapshot]);

  const diagnosticGraphStateRef = useRef<string | null>(null);
  useEffect(() => {
    const fingerprint = diagnosticFingerprint(benchmarkRenderedState);
    if (diagnosticGraphStateRef.current === fingerprint) return;
    diagnosticGraphStateRef.current = fingerprint;
    recordDiagnosticEvent("graph_state_changed", { graphType, graphFingerprint: fingerprint });
  }, [benchmarkRenderedState, graphType]);

  const usageGraphState = {
    graphType,
    series: JSON.stringify({
      selectedReadoutId,
      sourceMode,
      selectedConditionIds,
      selectedTimePointIds,
      grouping,
    }),
    axes: JSON.stringify(axes),
    layers: JSON.stringify(layers),
    appearance: JSON.stringify(appearance),
    annotation: JSON.stringify({ statisticsAnnotation, statisticsAnnotations }),
  };
  const usageGraphStateRef = useRef<typeof usageGraphState | null>(null);
  useEffect(() => {
    const previous = usageGraphStateRef.current;
    usageGraphStateRef.current = usageGraphState;
    if (!previous) return;
    const route = routeFromPath(window.location.pathname);
    if (previous.graphType !== usageGraphState.graphType) recordUsageGraphEdit(route, "graph_type");
    if (previous.series !== usageGraphState.series) recordUsageGraphEdit(route, "series_selection");
    if (previous.axes !== usageGraphState.axes) recordUsageGraphEdit(route, "axes");
    if (previous.layers !== usageGraphState.layers) recordUsageGraphEdit(route, "layers");
    if (previous.appearance !== usageGraphState.appearance)
      recordUsageGraphEdit(route, "appearance_layout");
    if (previous.annotation !== usageGraphState.annotation)
      recordUsageGraphEdit(route, "statistics_annotation");
  }, [usageGraphState]);

  const benchmarkStateLogRef = useRef<{
    identity: string;
    rendered: string;
    analysis: string;
  } | null>(null);
  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      !evaluationModeIsConfigured(evaluationMode) ||
      !benchmarkRun.identity
    )
      return;
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
        analysisConditions: analysisConditionIds.join("|"),
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
  const activeAnalysisConditionIds = new Set(analysisConditionIds);
  const activeAnalysisConditions = draft.conditions.filter((condition) =>
    activeAnalysisConditionIds.has(condition.id),
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
    const built = activeConditions.flatMap((condition) =>
      timePoints.map((timePoint) => {
        const normalizedGrouping = normalizeGraphGroupingChannels(grouping);
        const xFactorIds =
          normalizedGrouping.x.source === "factor"
            ? normalizedGrouping.x.factorIds?.length
              ? normalizedGrouping.x.factorIds
              : normalizedGrouping.x.factorId
                ? [normalizedGrouping.x.factorId]
                : []
            : [];
        const xLevels = xFactorIds.map((factorId) => condition.attributes[factorId] ?? "unknown");
        const xGroupKey = xFactorIds.length
          ? xFactorIds.map((factorId, index) => `${factorId}:${xLevels[index]}`).join("|")
          : condition.id;
        const xGroupLabel = xLevels.length ? xLevels.join(" / ") : condition.label;
        const seriesFactorId =
          grouping.series.source === "factor" ? grouping.series.factorId : undefined;
        const seriesFactor = draft.attributes.find(({ id }) => id === seriesFactorId);
        const seriesLevel = seriesFactorId ? condition.attributes[seriesFactorId] : undefined;
        const visualSeriesKey =
          grouping.series.source === "time"
            ? (timePoint?.id ?? "time.none")
            : seriesFactorId
              ? `${seriesFactorId}:${seriesLevel ?? "unknown"}`
              : condition.id;
        const visualSeriesLabel =
          grouping.series.source === "time"
            ? timePoint
              ? `${timePoint.value} ${axes.xUnit.trim() || draft.time.unit}`
              : "時点なし"
            : seriesFactor
              ? (seriesLevel ?? "—")
              : condition.label;
        const facetFactorId = grouping.facet?.factorId;
        const facetLevel = facetFactorId ? condition.attributes[facetFactorId] : undefined;
        const facetKey = facetFactorId
          ? `${facetFactorId}:${facetLevel ?? "unknown"}`
          : "facet.none";
        const facetLabel = facetFactorId ? (facetLevel ?? "—") : "";
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
          xGroupKey,
          xGroupLabel,
          visualSeriesKey,
          visualSeriesLabel,
          facetKey,
          facetLabel,
          auxiliaryReference: condition.role === "auxiliary_reference",
          timePointId: timePoint?.id,
          timeLabel: timePoint
            ? `${timePoint.value} ${axes.xUnit.trim() || draft.time.unit}`
            : undefined,
          xValue: timePoint?.value,
          proportionPoints,
          experimentPoints,
          rawPoints,
          summary: continuousSummary(values),
        };
      }),
    );
    const xOrder = new Map<string, number>();
    built.forEach(({ xGroupKey }) => {
      if (!xOrder.has(xGroupKey)) xOrder.set(xGroupKey, xOrder.size);
    });
    return built.sort((first, second) => {
      const groupDelta = (xOrder.get(first.xGroupKey) ?? 0) - (xOrder.get(second.xGroupKey) ?? 0);
      if (groupDelta !== 0) return groupDelta;
      return (
        (appearance.seriesStyles[first.visualSeriesKey]?.order ?? 0) -
        (appearance.seriesStyles[second.visualSeriesKey]?.order ?? 0)
      );
    });
  }, [
    activeConditions,
    activeTimePoints,
    cells,
    draft.experiments,
    draft.attributes,
    draft.time.points.length,
    draft.time.unit,
    axes.xUnit,
    appearance.seriesStyles,
    graphType,
    grouping,
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
      return buildConditionAxisLabels(draft, series, axes.hierarchyOrder, grouping);
    return series.map((item) => ({
      conditionId: item.conditionId,
      levels: [{ id: "condition", label: "条件", value: item.conditionLabel }],
      timeLabel: grouping.series.source === "time" ? "" : (item.timeLabel ?? ""),
    }));
  }, [appearance.hierarchicalLabels, axes.hierarchyOrder, draft, grouping, series]);
  const facetGroups = useMemo(() => {
    const grouped = new Map<
      string,
      { label: string; rows: GraphSeries[]; labels: ConditionAxisLabel[] }
    >();
    series.forEach((item, index) => {
      const current = grouped.get(item.facetKey) ?? {
        label: item.facetLabel,
        rows: [],
        labels: [],
      };
      current.rows.push(item);
      const label = axisLabels[index];
      if (label) current.labels.push(label);
      grouped.set(item.facetKey, current);
    });
    const requestedOrder = grouping.facet?.levelOrder ?? [];
    return [...grouped.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((first, second) => {
        const firstOrder = requestedOrder.indexOf(first.label);
        const secondOrder = requestedOrder.indexOf(second.label);
        if (firstOrder < 0 && secondOrder < 0) return 0;
        if (firstOrder < 0) return 1;
        if (secondOrder < 0) return -1;
        return firstOrder - secondOrder;
      });
  }, [axisLabels, grouping.facet?.levelOrder, series]);
  const visualSeriesOptions = useMemo(
    () =>
      series.filter(
        (item, index) =>
          series.findIndex(({ visualSeriesKey }) => visualSeriesKey === item.visualSeriesKey) ===
            index && item.visualSeriesLabel,
      ),
    [series],
  );
  const defaultPresentationAppearance: GraphAppearance = {
    ...DEFAULT_APPEARANCE,
    ...(visualSeriesOptions.length > 1 ? { legendPosition: "right", palette: "condition" } : {}),
  };
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
        conditionIds: analysisConditionIds,
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
      analysisConditionIds,
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
    conditionIds: analysisConditionIds,
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
      !import.meta.env.DEV ||
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
        activeAnalysisConditions
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
  };
  const handleAnalysisConditionChange = (event: ChangeEvent<HTMLInputElement>) => {
    const conditionId = event.target.value;
    setAnalysisConditionIds((current) =>
      event.target.checked
        ? [...current, conditionId]
        : current.filter((selectedId) => selectedId !== conditionId),
    );
    setPlannedContrastConditionIds((current) =>
      current.filter(([firstId, secondId]) => firstId !== conditionId && secondId !== conditionId),
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
      setAppearance(defaultPresentationAppearance);
      return;
    }
    if (preset === "publication") {
      setLayers(restrainedLayers);
      setAppearance({
        ...defaultPresentationAppearance,
        pointSize: 6,
        axisLineWidth: 1.4,
      });
      return;
    }
    if (preset === "presentation") {
      setLayers(restrainedLayers);
      setAppearance({
        ...defaultPresentationAppearance,
        palette: visualSeriesOptions.length > 1 ? "condition" : "publication",
        pointSize: 8,
        axisLineWidth: 2,
      });
      return;
    }
    setLayers(restrainedLayers);
    setAppearance(defaultPresentationAppearance);
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
  const resolvedLayerDescription = describeActiveGraphLayers({
    graphType,
    shape,
    layers,
    errorBar: appearance.errorBar,
    timeSampling: draft.time.sampling,
    matched: draft.conditionAssignment.kind === "matched",
  });
  const activeLayerDescription =
    semanticReadiness === "unresolved_descriptive"
      ? resolvedLayerDescription
          .replaceAll("Raw observations", "元表の行")
          .replaceAll("Experiment summaries", "元表の行")
          .replaceAll("Biological replicates", "元表の行")
      : resolvedLayerDescription;
  const exportSvg = async () => {
    if (!svgRef.current || !readout) return;
    setPngExportFeedback(null);
    const result = await saveGraphSvgExport(
      svgRef.current,
      `${safeGraphFileStem(readout.label)}.svg`,
    );
    if (result.status === "saved") {
      setPngExportFeedback({ kind: "success", text: "SVGを保存しました。" });
    } else if (result.status === "failed") {
      recordDiagnosticError("GRAPH_EXPORT_FAILED", result.error);
      setPngExportFeedback({
        kind: "error",
        text: "SVGを保存できませんでした。グラフは保持されています。",
      });
    }
  };
  const exportPng = async () => {
    if (!svgRef.current || !readout) return;
    setPngExportFeedback(null);
    const result = await saveGraphPngExport(
      svgRef.current,
      `${safeGraphFileStem(readout.label)}.png`,
    );
    if (result.status === "saved") {
      setPngExportFeedback({
        kind: "success",
        text: "現在のグラフを白背景のPNGで書き出しました。",
      });
    } else if (result.status === "failed") {
      recordDiagnosticError("GRAPH_EXPORT_FAILED", result.error);
      setPngExportFeedback({
        kind: "error",
        text: "PNGを書き出せませんでした。グラフは保持されています。SVG書き出しを利用してください。",
      });
    }
  };
  const exportCsv = async () => {
    if (!readout) return;
    setPngExportFeedback(null);
    const result = await saveGraphCsvExport(
      readout.shape === "categorical_counts"
        ? serializeCompositionData(
            draft,
            cells,
            readout,
            selectedConditionIds,
            selectedTimePointIds,
          )
        : serializeVisibleGraphData(series, readout),
      `${safeGraphFileStem(readout.label)}-graph-data.csv`,
    );
    if (result.status === "saved") {
      setPngExportFeedback({ kind: "success", text: "表示中のデータをCSVで保存しました。" });
    } else if (result.status === "failed") {
      recordDiagnosticError("GRAPH_EXPORT_FAILED", result.error);
      setPngExportFeedback({
        kind: "error",
        text: "CSVを保存できませんでした。グラフとデータは保持されています。",
      });
    }
  };
  const descriptiveBenchmarkRun = draft.analysisIntent.kind === "single_cohort";
  const descriptiveMethodsText = [
    "Descriptive Figure workflow (no inferential test).",
    `Readout: ${readout?.label ?? activeReadoutId}.`,
    `Displayed conditions: ${activeConditions.map(({ label }) => label).join(", ")}.`,
    `Statistical unit retained as: ${draft.conditionAssignment.unitLabel}.`,
    "Reason: the approved Gold brief specifies a descriptive panel and does not define an inferential comparator or null hypothesis.",
  ].join("\n");
  const finalizeBenchmarkRun = async () => {
    const svg = svgRef.current;
    const run = currentBenchmarkRun();
    if (
      !svg ||
      !run.identity ||
      !run.supportStatus ||
      (!analysis && !descriptiveBenchmarkRun) ||
      (analysis && !methodsText)
    ) {
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
        selectedStatistics: analysis?.request.method ?? "none_descriptive",
      });
      const finalRun = currentBenchmarkRun();
      const statisticsArtifact = analysis
        ? {
            selectedReadoutId,
            selectedConditionIds: analysisConditionIds,
            displayedConditionIds: selectedConditionIds,
            statisticalUnit: draft.conditionAssignment.unitLabel,
            recommendation: {
              ...requireAnalysisRequestRecommendation(
                createExperimentWorkspaceDesign(draft, analysis.result.completedAt),
                analysis.request,
                { outcomeId: selectedReadoutId },
              ),
              ...(analysis.recommendation?.decision
                ? { decision: analysis.recommendation.decision }
                : {}),
            },
            recommendedMethod: requireAnalysisRequestRecommendation(
              createExperimentWorkspaceDesign(draft, analysis.result.completedAt),
              analysis.request,
              { outcomeId: selectedReadoutId },
            ).recommendedMethod,
            selectedMethod: analysis.request.method,
            recommendationDiffers:
              requireAnalysisRequestRecommendation(
                createExperimentWorkspaceDesign(draft, analysis.result.completedAt),
                analysis.request,
                { outcomeId: selectedReadoutId },
              ).recommendedMethod !== analysis.request.method,
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
                          : analysis.request.protocolVersion === "0.14.0"
                            ? {
                                seriesIds: analysis.request.seriesIds,
                                modelId: analysis.request.modelId,
                              }
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
          }
        : {
            selectedReadoutId,
            selectedConditionIds,
            statisticalUnit: draft.conditionAssignment.unitLabel,
            selectedMethod: null,
            state: "not_performed",
            reason:
              "Approved Gold brief specifies a descriptive panel without an inferential comparator or null hypothesis.",
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
                engineVersion: analysis?.result.engine.version ?? "not_applicable",
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
          { name: "methods.txt", content: analysis ? methodsText! : descriptiveMethodsText },
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
  return (
    <section
      className={`experiment-graph-workbench experiment-graph-workbench--${workspaceMode}`}
      aria-label={
        workspaceMode === "statistics"
          ? t("統計ワークスペース", "Statistics workspace")
          : semanticReadiness === "unresolved_descriptive"
            ? t("表からグラフを作成", "Create a Graph from a table")
            : t("実験からグラフを作成", "Create a Graph from an experiment")
      }
    >
      <header className="experiment-graph-workbench-header">
        <div>
          <p className="experiment-graph-overline">
            {workspaceMode === "statistics" ? t("統計", "Statistics") : t("グラフ作成", "Graph editor")}
          </p>
          <h2>{readout?.label ?? t("測定項目を選択", "Select a readout")}</h2>
          <p className="experiment-graph-subtitle">
            {semanticReadiness === "unresolved_descriptive"
              ? t("表の行を記述的に表示（実験単位と統計的なnは未確認）", "Descriptive display of table rows (experimental unit and statistical n not confirmed)")
              : timeLabel
                ? t(`時点：${timeLabel}`, `Time point: ${timeLabel}`)
                : t("実験単位ごとの値を比較", "Compare values by experimental unit")}
            {workspaceMode !== "statistics" ? t(" · 図の要素をクリックして設定", " · Click a Graph element to edit it") : ""}
          </p>
        </div>
        <button type="button" className="experiment-graph-close" onClick={onClose}>
          {t("閉じる", "Close")}
        </button>
      </header>

      <div className="experiment-graph-workbench-layout">
        {workspaceMode !== "statistics" ? (
          <section className="experiment-graph-canvas-panel" aria-label={t("グラフプレビュー", "Graph preview")}>
            <div className="experiment-graph-canvas-heading">
              <div>
                <p className="experiment-graph-overline">{graphTypeLabel[graphType]}</p>
                <h3 style={{ fontSize: appearance.graphTitleFontSize, color: "#000" }}>
                  {activeLayerDescription}
                </h3>
              </div>
              <div className="experiment-graph-export-actions" aria-label={t("グラフの書き出し", "Graph export")}>
                <button
                  type="button"
                  aria-label={t("グラフをコピー", "Copy Graph")}
                  disabled={!hasData}
                  onClick={() => void copyGraph()}
                >
                  {t("コピー", "Copy")}
                </button>
                <button
                  type="button"
                  aria-label={t("SVGを書き出す", "Export SVG")}
                  disabled={!hasData}
                  onClick={() => void exportSvg()}
                >
                  SVG
                </button>
                <button
                  type="button"
                  aria-label={t("PNGを書き出す", "Export PNG")}
                  disabled={!hasData}
                  onClick={() => void exportPng()}
                >
                  PNG
                </button>
                <button
                  type="button"
                  aria-label={t("表示データCSV", "Export displayed data as CSV")}
                  disabled={!hasData}
                  onClick={() => void exportCsv()}
                >
                  CSV
                </button>
                {import.meta.env.DEV && evaluationModeIsConfigured(evaluationMode) ? (
                  <button
                    type="button"
                    aria-label="Benchmark runを完了"
                    disabled={
                      !hasData ||
                      !benchmarkRun.identity ||
                      !benchmarkRun.supportStatus ||
                      !benchmarkRun.defaultGraphCaptured ||
                      (!analysis && !descriptiveBenchmarkRun)
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
            {pngExportFeedback ? (
              <p
                className={`experiment-graph-copy-status${pngExportFeedback.kind === "error" ? " experiment-graph-copy-status--error" : ""}`}
                role={pngExportFeedback.kind === "error" ? "alert" : "status"}
              >
                {pngExportFeedback.text}
              </p>
            ) : null}
            {benchmarkCaptureStatus ? <p role="status">{benchmarkCaptureStatus}</p> : null}
            {hasData ? (
              <div
                className="experiment-graph-view-controls"
                role="group"
                aria-label={t("Graph表示サイズ", "Graph display size")}
              >
                <button
                  className={!fitOverview ? "is-active" : ""}
                  type="button"
                  aria-pressed={!fitOverview}
                  onClick={() => setFitOverview(false)}
                >
                  {t("実寸（横スクロール）", "Readable size (horizontal scroll)")}
                </button>
                <button
                  className={fitOverview ? "is-active" : ""}
                  type="button"
                  aria-pressed={fitOverview}
                  onClick={() => setFitOverview(true)}
                >
                  {t("画面に全体を収める", "Fit entire Graph")}
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
                      axes={axes}
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
                    <div
                      className={grouping.facet ? "experiment-graph-small-multiples" : undefined}
                      data-facet-axis-policy={grouping.facet?.axisPolicy ?? "shared"}
                    >
                      {facetGroups.map((facet) => (
                        <section className="experiment-graph-facet" key={facet.key}>
                          {grouping.facet ? (
                            <h3 className="experiment-graph-facet-title">{facet.label}</h3>
                          ) : null}
                          <ExperimentGraphSvg
                            shape={shape === "proportion" ? "proportion" : "nested_continuous"}
                            readoutLabel={readout.label}
                            readoutUnit={readout.unit}
                            timeSampling={draft.time.sampling}
                            conditionAssignment={draft.conditionAssignment}
                            axisLabels={facet.labels}
                            series={facet.rows}
                            layers={layers}
                            appearance={appearance}
                            graphType={graphType}
                            axes={axes}
                            svgRef={svgRef}
                            analysisResult={analysisResult}
                            statisticsAnnotation={statisticsAnnotation}
                            statisticsAnnotations={statisticsAnnotations}
                            annotationContext={annotationContext}
                            layerDescription={activeLayerDescription}
                            onInspect={inspectGraphPart}
                            activeInspectorTarget={inspectorTarget}
                          />
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="experiment-graph-empty" role="status">
                {t("表示する条件と値を選択してください。", "Select the conditions and values to display.")}
              </div>
            )}
            <p className="experiment-graph-caption">
              {semanticReadiness === "unresolved_descriptive"
                ? `現在の表示：${activeLayerDescription}。元の表の行を保持した記述的Graphです。行数をbiological nや対応関係とは解釈していません。`
                : sharedSourceTopology
                  ? `各点は条件別${draft.conditionAssignment.unitLabel}の値です。同じ${sharedSourceTopology.sourceUnitLabel}に由来する組は共有IDで対応づけていますが、条件別${draft.conditionAssignment.unitLabel}は別の実験単位として保持しています。`
                  : shape === "categorical_counts"
                    ? "カテゴリ別countを保持し、構成割合を自動計算しています。連続値として扱わず、カテゴリ構成の推論統計はまだ実行しません。"
                    : draft.analysisIntent.kind === "correlation"
                      ? "各点は同じ実験単位から得たXとYの完全な1組です。行順や日付から対応を推測していません。"
                      : shape === "wb_ratio"
                        ? `各点は実験単位（Exp）ごとの${readout.label} / ${readout.referenceLabel ?? "reference"}です。標的とreferenceの生値は別々に保持しています。`
                        : shape === "proportion"
                          ? `現在の表示：${activeLayerDescription}。割合と要約は実験単位（Exp）から計算しています。`
                          : t(
                              `現在の表示：${activeLayerDescription}。細胞・ROIなどの生データを表示しても、統計上のnは実験単位です。`,
                              `Current display: ${activeLayerDescription}. Showing raw cell or ROI data does not change statistical n, which remains the experimental unit.`,
                            )}
            </p>
            <details className="experiment-graph-data-details">
              <summary>{t("使用データの内訳を表示", "Show data used")}</summary>
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
          aria-label={workspaceMode === "statistics" ? t("統計設定", "Statistics settings") : t("グラフ設定", "Graph settings")}
        >
          {workspaceMode !== "statistics" ? (
            <div className="experiment-graph-inspector-target">
              <label className="experiment-graph-field">
                <span>{t("編集対象", "Edit")}</span>
                <select
                  aria-label={t("編集対象", "Edit target")}
                  value={inspectorTarget}
                  onChange={(event) => inspectGraphPart(event.target.value as InspectorTarget)}
                >
                  <option value="background">{t("グラフ全体", "Entire Graph")}</option>
                  <option value="x-axis">{t("X軸", "X axis")}</option>
                  <option value="y-axis">{t("Y軸", "Y axis")}</option>
                  <option value="data">{t("データ", "Data")}</option>
                  <option value="raw-dots">{t("生データの点", "Raw-data points")}</option>
                  <option value="experiment-summary">{t("実験単位の要約", "Experimental-unit summary")}</option>
                  <option value="series-style">{t("系列の色・線・点", "Series color, line, and symbol")}</option>
                  <option value="violin">{t("バイオリン", "Violin")}</option>
                  <option value="box">{t("箱ひげ", "Box plot")}</option>
                  <option value="error-bar">{t("誤差線", "Error bars")}</option>
                  <option value="connecting-line">{t("接続線", "Connecting lines")}</option>
                  <option value="legend">{t("凡例", "Legend")}</option>
                  {(workspaceMode === "graph" || workspaceMode === "combined") &&
                  analysisResult?.status === "ok" ? (
                    <option value="annotation">{t("統計注釈", "Statistical annotations")}</option>
                  ) : null}
                  {workspaceMode === "combined" ? (
                    <option value="statistics">{t("統計解析", "Statistical analysis")}</option>
                  ) : null}
                </select>
              </label>
              <div className="experiment-graph-layer-shortcuts" aria-label={t("現在の表示レイヤー", "Visible layers")}>
                <span>{t("表示中", "Visible")}</span>
                {shape === "nested_continuous" ? (
                  <button
                    type="button"
                    aria-pressed={layers.raw}
                    onClick={() => setLayers((current) => ({ ...current, raw: !current.raw }))}
                  >
                    {t("生データ", "Raw data")}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-pressed={layers.experiment}
                  onClick={() =>
                    setLayers((current) => ({ ...current, experiment: !current.experiment }))
                  }
                >
                  {t("実験単位の点", "Experimental-unit points")}
                </button>
                <button
                  type="button"
                  aria-pressed={layers.overall}
                  onClick={() =>
                    setLayers((current) => ({ ...current, overall: !current.overall }))
                  }
                >
                  {t("要約", "Summary")}
                </button>
                {visualSeriesOptions.length > 1 ? (
                  <button type="button" onClick={() => inspectGraphPart("series-style")}>
                    {t("系列を編集", "Edit series")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <section className="experiment-graph-inspector-section experiment-statistics-source">
              <h3>{t("解析対象", "Analysis set")}</h3>
              <label className="experiment-graph-field">
                <span>{t("測定項目", "Measured readout")}</span>
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
                <legend>統計に含める条件</legend>
                {draft.conditions.map((condition) => (
                  <label className="experiment-graph-checkbox" key={condition.id}>
                    <input
                      type="checkbox"
                      value={condition.id}
                      checked={activeAnalysisConditionIds.has(condition.id)}
                      disabled={draft.analysisIntent.kind === "correlation"}
                      aria-label={`統計の条件：${condition.label}`}
                      onChange={handleAnalysisConditionChange}
                    />
                    <span>
                      {condition.label}
                      {condition.id === draft.controlConditionId ? "（対照群）" : ""}
                      {condition.role === "auxiliary_reference" ? "（図のみのreference）" : ""}
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="experiment-graph-help">
                図に表示する条件とは独立して選べます。referenceを図に残したまま、事前に決めた比較だけを解析できます。
              </p>
              <dl className="experiment-statistics-design-summary">
                <div>
                  <dt>統計上の単位</dt>
                  <dd>
                    {sharedSourceTopology
                      ? `条件別${draft.conditionAssignment.unitLabel}`
                      : draft.conditionAssignment.unitLabel}
                  </dd>
                </div>
                <div>
                  <dt>設計の解釈</dt>
                  <dd>
                    {sharedSourceTopology
                      ? `同じ${sharedSourceTopology.sourceUnitLabel}に由来する条件別${draft.conditionAssignment.unitLabel}を対応づけて比較`
                      : draft.conditionAssignment.kind === "matched"
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
              <h3>{t("表示するデータ", "Data to display")}</h3>
              <label className="experiment-graph-field">
                <span>{t("測定項目", "Measured readout")}</span>
                <select
                  value={activeReadoutId}
                  disabled={draft.readouts.length <= 1}
                  aria-label={t("測定項目", "Measured readout")}
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
              {draft.analysisIntent.kind !== "correlation" ? (
                <fieldset className="experiment-graph-condition-fieldset">
                  <legend>{t("実験要因の表示割り当て", "Map experimental factors to the display")}</legend>
                  <label className="experiment-graph-field">
                    <span>{t("X軸", "X axis")}</span>
                    <select
                      aria-label={t("X軸に使う要因", "Factor used on the X axis")}
                      value={
                        axes.xSemantic !== "categorical"
                          ? "time"
                          : grouping.x.source === "factor"
                            ? `factor:${grouping.x.factorId ?? ""}`
                            : "condition"
                      }
                      disabled={axes.xSemantic !== "categorical"}
                      onChange={(event) => {
                        const value = event.target.value;
                        setGrouping((current) => ({
                          ...current,
                          x: value.startsWith("factor:")
                            ? {
                                source: "factor",
                                factorId: value.slice(7),
                                factorIds: [value.slice(7)],
                              }
                            : { source: "condition" },
                        }));
                      }}
                    >
                      {axes.xSemantic !== "categorical" || draft.time.points.length > 0 ? (
                        <option value="time">
                            {axes.xSemantic === "numeric_covariate"
                              ? axes.xTitle || t("数値X", "Numeric X")
                              : t("時間", "Time")}
                        </option>
                      ) : null}
                      <option value="condition">{t("条件の組み合わせ", "Condition combination")}</option>
                      {draft.attributes
                        .filter(
                          ({ id }) =>
                            id !==
                              (grouping.series.source === "factor"
                                ? grouping.series.factorId
                                : undefined) && id !== grouping.facet?.factorId,
                        )
                        .map((factor) => (
                          <option key={factor.id} value={`factor:${factor.id}`}>
                            {factor.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  {grouping.x.source === "factor" && draft.attributes.length > 1 ? (
                    <label className="experiment-graph-field">
                      <span>{t("X階層（複数選択可）", "X hierarchy (multiple selection allowed)")}</span>
                      <select
                        multiple
                        aria-label="X hierarchy factors"
                        value={
                          grouping.x.factorIds?.length
                            ? grouping.x.factorIds
                            : grouping.x.factorId
                              ? [grouping.x.factorId]
                              : []
                        }
                        onChange={(event) => {
                          const factorIds = [...event.target.selectedOptions].map(
                            ({ value }) => value,
                          );
                          setGrouping((current) => ({
                            ...current,
                            x: {
                              source: "factor",
                              factorId: factorIds[0],
                              factorIds,
                            },
                          }));
                        }}
                      >
                        {draft.attributes
                          .filter(
                            ({ id }) =>
                              id !==
                                (grouping.series.source === "factor"
                                  ? grouping.series.factorId
                                  : undefined) && id !== grouping.facet?.factorId,
                          )
                          .map((factor) => (
                            <option key={factor.id} value={factor.id}>
                              {factor.label || factor.id}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="experiment-graph-field">
                    <span>{t("系列（色・記号）", "Series (color and symbol)")}</span>
                    <select
                      aria-label={t("系列に使う要因", "Factor used for series")}
                      value={
                        axes.xSemantic !== "categorical"
                          ? "condition"
                          : grouping.series.source === "factor"
                            ? `factor:${grouping.series.factorId ?? ""}`
                            : grouping.series.source
                      }
                      disabled={axes.xSemantic !== "categorical"}
                      onChange={(event) => {
                        const value = event.target.value;
                        setGrouping((current) => {
                          const nextSeries = value.startsWith("factor:")
                            ? ({ source: "factor", factorId: value.slice(7) } as const)
                            : value === "time"
                              ? ({ source: "time" } as const)
                              : ({ source: "none" } as const);
                          return normalizeGraphGroupingChannels({
                            ...current,
                            series: nextSeries,
                            color: nextSeries,
                            shape: nextSeries,
                            facet:
                              nextSeries.source === "factor" &&
                              current.facet?.factorId === nextSeries.factorId
                                ? null
                                : current.facet,
                          });
                        });
                        if (value !== "none") {
                          setAppearance((current) => ({
                            ...current,
                            legendPosition:
                              current.legendPosition === "hidden"
                                ? "right"
                                : current.legendPosition,
                            palette: current.palette === "single" ? "condition" : current.palette,
                          }));
                        }
                      }}
                    >
                      {axes.xSemantic !== "categorical" ? (
                        <option value="condition">{t("条件の組み合わせ", "Condition combination")}</option>
                      ) : null}
                      <option value="none">{t("なし", "None")}</option>
                      {draft.time.points.length > 0 ? (
                        <option value="time">{t("時間 / numeric X", "Time / numeric X")}</option>
                      ) : null}
                      {draft.attributes
                        .filter(({ id }) => {
                          const xFactorIds =
                            grouping.x.source === "factor"
                              ? grouping.x.factorIds?.length
                                ? grouping.x.factorIds
                                : grouping.x.factorId
                                  ? [grouping.x.factorId]
                                  : []
                              : [];
                          return !xFactorIds.includes(id) && id !== grouping.facet?.factorId;
                        })
                        .map((factor) => (
                          <option key={factor.id} value={`factor:${factor.id}`}>
                            {factor.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  {axes.xSemantic === "categorical" && swapSingleXFactorAndSeries(grouping) ? (
                    <button
                      type="button"
                      className="experiment-graph-series-style-shortcut"
                      onClick={() =>
                        setGrouping((current) => swapSingleXFactorAndSeries(current) ?? current)
                      }
                    >
                      {t("X軸と系列を入れ替える", "Swap X axis and series")}
                    </button>
                  ) : null}
                  {axes.xSemantic !== "categorical" ? (
                    <p className="experiment-graph-help">
                      X軸は{axes.xSemantic === "time" ? "時間" : axes.xTitle || "数値"}
                      、各条件は色と記号で区別します。
                    </p>
                  ) : null}
                  <label className="experiment-graph-field">
                    <span>{t("パネル分割", "Panel split")}</span>
                    <select
                      aria-label={t("パネル分割に使う要因", "Factor used to split panels")}
                      value={grouping.facet?.factorId ?? "none"}
                      onChange={(event) =>
                        setGrouping((current) => ({
                          ...current,
                          facet:
                            event.target.value === "none"
                              ? null
                              : {
                                  source: "factor",
                                  factorId: event.target.value,
                                  axisPolicy: "shared",
                                  levelOrder: [],
                                },
                        }))
                      }
                    >
                      <option value="none">{t("なし", "None")}</option>
                      {draft.attributes
                        .filter(({ id }) => {
                          const xFactorIds =
                            grouping.x.source === "factor"
                              ? grouping.x.factorIds?.length
                                ? grouping.x.factorIds
                                : grouping.x.factorId
                                  ? [grouping.x.factorId]
                                  : []
                              : [];
                          const seriesFactorId =
                            grouping.series.source === "factor"
                              ? grouping.series.factorId
                              : undefined;
                          return !xFactorIds.includes(id) && id !== seriesFactorId;
                        })
                        .map((factor) => (
                          <option key={factor.id} value={factor.id}>
                            {factor.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p className="experiment-graph-help">
                    {t(
                      "見た目の系列・Facetは、paired / repeated / independentの統計的関係を変更しません。",
                      "Visual series and facets do not change the paired, repeated, or independent statistical relationship.",
                    )}
                  </p>
                </fieldset>
              ) : null}
              {visualSeriesOptions.length > 1 ? (
                <button
                  type="button"
                  className="experiment-graph-series-style-shortcut"
                  onClick={() => inspectGraphPart("series-style")}
                >
                  {t("系列の色・線・点を編集", "Edit series colors, lines, and points")}
                </button>
              ) : null}
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
                <legend>{draft.analysisIntent.kind === "correlation" ? "X / Y" : t("条件", "Conditions")}</legend>
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
                    <span>
                      {condition.label}
                      {condition.role === "auxiliary_reference" ? "（reference）" : ""}
                    </span>
                  </label>
                ))}
              </fieldset>
            </section>
          ) : null}

          {inspectorTarget === "background" ? (
            <ExperimentGraphAppearanceEditor
              graphType={graphType}
              appearance={appearance}
              readoutShape={shape}
              analysisIntentKind={draft.analysisIntent.kind}
              conditionAssignmentKind={draft.conditionAssignment.kind}
              timeSampling={draft.time.sampling}
              activeConditions={activeConditions}
              onGraphTypeChange={(nextType) => {
                setGraphType(nextType);
                setLayers(defaultLayersForGraphType(nextType, shape));
                if (
                  nextType === "line" &&
                  draft.time.points.length > 1 &&
                  activeConditions.length > 1
                ) {
                  setAppearance((current) => ({
                    ...current,
                    palette: current.palette === "single" ? "colorblind" : current.palette,
                    legendPosition:
                      current.legendPosition === "hidden" ? "right" : current.legendPosition,
                  }));
                }
              }}
              onApplyPreset={applyPreset}
              setAxes={setAxes}
              setAppearance={setAppearance}
            />
          ) : null}

          {inspectorTarget === "raw-dots" ? (
            <ExperimentGraphRawDotsEditor
              shape={shape}
              layers={layers}
              appearance={appearance}
              setLayers={setLayers}
              setAppearance={setAppearance}
            />
          ) : null}

          {inspectorTarget === "experiment-summary" || inspectorTarget === "series-style" ? (
            <section className="experiment-graph-inspector-section">
              <h3>{inspectorTarget === "series-style" ? "系列の色・線・点" : "実験単位の要約"}</h3>
              {inspectorTarget === "experiment-summary" ? (
                <>
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
                </>
              ) : (
                <p className="experiment-graph-help">
                  凡例に出る各系列の色、線種、線幅、点、表示順をまとめて編集します。
                </p>
              )}
              {inspectorTarget === "series-style"
                ? visualSeriesOptions.map((item, index) => {
                    const style = appearance.seriesStyles[item.visualSeriesKey] ?? {};
                    return (
                      <fieldset
                        className="experiment-graph-condition-fieldset"
                        key={item.visualSeriesKey}
                      >
                        <legend>{item.visualSeriesLabel}</legend>
                        <label className="experiment-graph-checkbox">
                          <input
                            type="checkbox"
                            checked={style.visible !== false}
                            onChange={(event) =>
                              setAppearance((current) => ({
                                ...current,
                                seriesStyles: {
                                  ...current.seriesStyles,
                                  [item.visualSeriesKey]: {
                                    ...current.seriesStyles[item.visualSeriesKey],
                                    visible: event.target.checked,
                                  },
                                },
                              }))
                            }
                          />
                          <span>表示</span>
                        </label>
                        <label className="experiment-graph-field">
                          <span>凡例ラベル</span>
                          <input
                            value={style.legendLabel ?? item.visualSeriesLabel}
                            onChange={(event) =>
                              setAppearance((current) => ({
                                ...current,
                                seriesStyles: {
                                  ...current.seriesStyles,
                                  [item.visualSeriesKey]: {
                                    ...current.seriesStyles[item.visualSeriesKey],
                                    legendLabel: event.target.value || item.visualSeriesLabel,
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="experiment-graph-field">
                          <span>色</span>
                          <input
                            type="color"
                            value={
                              style.color ??
                              GRAPH_PALETTES[appearance.palette][
                                index % GRAPH_PALETTES[appearance.palette].length
                              ]
                            }
                            onChange={(event) =>
                              setAppearance((current) => ({
                                ...current,
                                seriesStyles: {
                                  ...current.seriesStyles,
                                  [item.visualSeriesKey]: {
                                    ...current.seriesStyles[item.visualSeriesKey],
                                    color: event.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="experiment-graph-field">
                          <span>線</span>
                          <select
                            value={style.lineStyle ?? "solid"}
                            onChange={(event) =>
                              setAppearance((current) => ({
                                ...current,
                                seriesStyles: {
                                  ...current.seriesStyles,
                                  [item.visualSeriesKey]: {
                                    ...current.seriesStyles[item.visualSeriesKey],
                                    lineStyle: event.target.value as "solid" | "dashed" | "dotted",
                                  },
                                },
                              }))
                            }
                          >
                            <option value="solid">実線</option>
                            <option value="dashed">破線</option>
                            <option value="dotted">点線</option>
                          </select>
                        </label>
                        <label className="experiment-graph-field">
                          <span>
                            線幅：{(style.lineWidth ?? appearance.summaryLineWidth).toFixed(1)}
                          </span>
                          <input
                            aria-label={`${item.visualSeriesLabel}の線幅`}
                            type="range"
                            min="0.5"
                            max="8"
                            step="0.5"
                            value={style.lineWidth ?? appearance.summaryLineWidth}
                            onChange={(event) =>
                              setAppearance((current) => ({
                                ...current,
                                seriesStyles: {
                                  ...current.seriesStyles,
                                  [item.visualSeriesKey]: {
                                    ...current.seriesStyles[item.visualSeriesKey],
                                    lineWidth: Number(event.target.value),
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="experiment-graph-field">
                          <span>点</span>
                          <select
                            value={style.pointStyle ?? "circle"}
                            onChange={(event) =>
                              setAppearance((current) => ({
                                ...current,
                                seriesStyles: {
                                  ...current.seriesStyles,
                                  [item.visualSeriesKey]: {
                                    ...current.seriesStyles[item.visualSeriesKey],
                                    pointStyle: event.target.value as
                                      "circle" | "square" | "triangle" | "diamond",
                                  },
                                },
                              }))
                            }
                          >
                            <option value="circle">丸</option>
                            <option value="square">四角</option>
                            <option value="triangle">三角</option>
                            <option value="diamond">菱形</option>
                          </select>
                        </label>
                        <label className="experiment-graph-field">
                          <span>順序</span>
                          <input
                            type="number"
                            value={style.order ?? index}
                            onChange={(event) =>
                              setAppearance((current) => ({
                                ...current,
                                seriesStyles: {
                                  ...current.seriesStyles,
                                  [item.visualSeriesKey]: {
                                    ...current.seriesStyles[item.visualSeriesKey],
                                    order: Number(event.target.value),
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                      </fieldset>
                    );
                  })
                : null}
            </section>
          ) : null}

          {inspectorTarget === "violin" ? (
            <section className="experiment-graph-inspector-section">
              <h3>{t("バイオリン分布", "Violin distribution")}</h3>
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
                <span>塗り</span>
                <select
                  value={appearance.distributionFill}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      distributionFill: event.target.value as GraphAppearance["distributionFill"],
                    }))
                  }
                >
                  <option value="none">透明</option>
                  <option value="white">白</option>
                  <option value="series">系列色</option>
                  <option value="custom">指定色</option>
                </select>
              </label>
              {appearance.distributionFill === "custom" ? (
                <label className="experiment-graph-field">
                  <span>塗り色</span>
                  <input
                    type="color"
                    value={appearance.distributionFillColor}
                    onChange={(event) =>
                      setAppearance((current) => ({
                        ...current,
                        distributionFillColor: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
              <label className="experiment-graph-field">
                <span>ひげの定義</span>
                <select
                  aria-label="箱ひげの定義"
                  value={appearance.boxWhiskerMode ?? "tukey_1_5_iqr"}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      boxWhiskerMode: event.target.value as "tukey_1_5_iqr" | "min_max",
                    }))
                  }
                >
                  <option value="tukey_1_5_iqr">Tukey 1.5×IQR</option>
                  <option value="min_max">最小–最大</option>
                </select>
              </label>
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
              <h3>{t("箱ひげ", "Box plot")}</h3>
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
                <span>塗り</span>
                <select
                  value={appearance.distributionFill}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      distributionFill: event.target.value as GraphAppearance["distributionFill"],
                    }))
                  }
                >
                  <option value="none">透明</option>
                  <option value="white">白</option>
                  <option value="series">系列色</option>
                  <option value="custom">指定色</option>
                </select>
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
            <ExperimentGraphErrorBarEditor
              layers={layers}
              appearance={appearance}
              setLayers={setLayers}
              setAppearance={setAppearance}
            />
          ) : null}

          {inspectorTarget === "connecting-line" ? (
            <ExperimentGraphConnectingLineEditor
              layers={layers}
              appearance={appearance}
              setLayers={setLayers}
              setAppearance={setAppearance}
            />
          ) : null}

          {inspectorTarget === "legend" ? (
            <ExperimentGraphLegendEditor
              appearance={appearance}
              setAppearance={setAppearance}
            />
          ) : null}

          {inspectorTarget === "annotation" && analysisResult?.status === "ok" ? (
            <ExperimentGraphAnnotationEditor
              analysisResult={analysisResult}
              draft={draft}
              baseAnnotationContext={baseAnnotationContext}
              annotationContext={annotationContext}
              adjustedComparisonAnnotations={adjustedComparisonAnnotations}
              statisticsAnnotation={statisticsAnnotation}
              statisticsAnnotations={statisticsAnnotations}
              setStatisticsAnnotation={setStatisticsAnnotation}
              setStatisticsAnnotations={setStatisticsAnnotations}
              onAddSelectedComparison={() => {
                const test = analysisResult.tests[statisticsAnnotation.testIndex];
                if (!test) return;
                const [, firstConditionId, secondConditionId] = test.name.split(":");
                const next: StatisticsAnnotationEntry = {
                  id: `annotation.${statisticsAnnotation.testIndex}`,
                  analysisId: analysisResult.requestId,
                  comparisonId: test.name,
                  testIndex: statisticsAnnotation.testIndex,
                  mode:
                    statisticsAnnotation.mode === "hidden" ? "symbol" : statisticsAnnotation.mode,
                  showNonSignificant: true,
                  presentation: "bracket",
                  ...(firstConditionId && secondConditionId
                    ? {
                        endpoints: [
                          { conditionId: firstConditionId },
                          { conditionId: secondConditionId },
                        ] as const,
                      }
                    : {}),
                  pValueStatus: test.adjustedPValue === null ? "unadjusted" : "adjusted",
                  lineage: {
                    ...(sourceMode === "derived_metric"
                      ? { derivedMetric: timeAnalysis.kind }
                      : {}),
                    ...(analysisTimePointId ? { timePointId: analysisTimePointId } : {}),
                    ...(timeAnalysis.kind !== "selected_timepoint"
                      ? {
                          endpoint: timeAnalysis.kind,
                          ...(timeAnalysis.windowStart === undefined
                            ? {}
                            : { windowStart: timeAnalysis.windowStart }),
                          ...(timeAnalysis.windowEnd === undefined
                            ? {}
                            : { windowEnd: timeAnalysis.windowEnd }),
                        }
                      : {}),
                  },
                };
                setStatisticsAnnotations((current) => [
                  ...current.filter(({ testIndex }) => testIndex !== next.testIndex),
                  next,
                ]);
              }}
            />
          ) : null}

          {inspectorTarget === "x-axis" || inspectorTarget === "y-axis" ? (
            <section className="experiment-graph-inspector-section">
              <h3>{inspectorTarget === "y-axis" ? t("Y軸", "Y axis") : t("X軸", "X axis")}</h3>
              {inspectorTarget === "y-axis" ? (
                <ExperimentGraphYAxisEditor
                  axes={axes}
                  appearance={appearance}
                  readoutShape={shape}
                  setAxes={setAxes}
                  setAppearance={setAppearance}
                />
              ) : (
                <ExperimentGraphXAxisEditor
                  axes={axes}
                  appearance={appearance}
                  attributes={draft.attributes}
                  hasOrderedAxis={draft.time.points.length > 0}
                  groupingXSource={grouping.x.source}
                  graphType={graphType}
                  setAxes={setAxes}
                  setAppearance={setAppearance}
                />
              )}
            </section>
          ) : null}

          {inspectorTarget === "statistics" ? (
            <>
              {draft.time.points.length > 1 ? (
                <section className="experiment-graph-statistics-section">
                  <h3>{t("時系列から何を比較するか", "What to compare from the time series")}</h3>
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
                    design={recommendationDesign}
                    outcomeId={selectedReadoutId}
                    relationshipAlreadyDeclared={
                      (Boolean(draft.adaptiveInput) ||
                        draft.entryRoute === "simple_independent_groups") &&
                      !independentNestedSource
                    }
                    independentNestedSourceContext={independentNestedSource}
                    onCorrectionRequested={onAnalysisCorrection}
                    matchedRelationship={
                      draft.conditionAssignment.kind === "matched"
                        ? sharedSourceTopology
                          ? {
                              kind: "shared_source",
                              unitLabel: draft.conditionAssignment.unitLabel,
                              sourceLabel: sharedSourceTopology.sourceUnitLabel,
                            }
                          : {
                              kind: "same_entity",
                              unitLabel: draft.conditionAssignment.unitLabel,
                            }
                        : undefined
                    }
                    analysisRunner={analysisRunner}
                    analysisAvailable={analysisAvailable}
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
                    conditionOptions={activeAnalysisConditions.map(({ id, label }) => ({
                      id,
                      label,
                    }))}
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
                        title={
                          analysisResult.tests[statisticsAnnotation.testIndex]
                            ? analysisTestAnnotationLabel(
                                analysisResult.tests[statisticsAnnotation.testIndex]!,
                                draft,
                                baseAnnotationContext,
                              )
                            : undefined
                        }
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
