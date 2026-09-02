import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { AnalysisEngineResult } from "@lsaa/analysis-contracts";
import { layoutComparisonBrackets } from "@lsaa/graph-spec";

import type { ExperimentSetDraft } from "../../app/experimentDraft";
import { defaultGraphYTitle } from "../../app/graphDefaults";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { formatExactPValue } from "../../app/statisticalFormat";
import { localizedText, useAppLocale } from "../../app/appLocale";
import { GRAPH_PALETTES } from "./graphAppearance";
import { isPairwiseComparisonTest } from "./experimentGraphAnnotations";
import type { ExperimentPoint, GraphSeries } from "./experimentGraphDataExport";
import {
  createCategoryLayout,
  createNiceTicks,
  createPlotRectangle,
  estimateGraphTextWidth,
  yAxisTitlePosition,
} from "./graphLayout";
import {
  formatGraphNumber as formatNumber,
  formatGraphPercentage as formatPercentage,
  graphSignificanceSymbol as significanceSymbol,
} from "./graphValueFormatting";
import { violinDensityPath } from "./graphGeometry";
import {
  buildHierarchyGroups,
  computeBoxWhiskerSummary,
  createMinorTicks,
  hierarchyLineAddsInformation,
  omitGenericCategoricalAxisTitle,
  resolveSeriesLinePresentation,
} from "./graphSemantics";

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
type ConditionAxisLabel = Readonly<{
  conditionId: string;
  levels: readonly Readonly<{ id: string; label: string; value: string }>[];
  timeLabel: string;
}>;

const CHART_HEIGHT = 520;
const CHART_MARGIN = { top: 38, right: 34, bottom: 96, left: 124 };
const CATEGORY_LAYOUT_FONT_SIZE = 15;

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

export function ExperimentGraphSvg({
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
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
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
      estimateGraphTextWidth(label.timeLabel, CATEGORY_LAYOUT_FONT_SIZE),
      ...label.levels.map((level) =>
        Math.max(
          ...splitParentLabel(level.value).map((line) =>
            estimateGraphTextWidth(line, CATEGORY_LAYOUT_FONT_SIZE),
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
        ? [estimateGraphTextWidth(label, appearance.hierarchyFontSize)]
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
                  (line) => estimateGraphTextWidth(line, appearance.legendFontSize),
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
  const plot = createPlotRectangle(width, height, margin);
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
      return plot.top + ((logMax - Math.log10(value)) / (logMax - logMin)) * plot.height;
    }
    return plot.top + ((domainMax - value) / domainRange) * plot.height;
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
    return plot.left + Math.max(0, Math.min(1, ratio)) * plot.width;
  };
  const xFor = (index: number) => {
    if (continuousLine) {
      const value = series[index]?.xValue ?? continuousDomainMin;
      return xForContinuousValue(value);
    }
    return plot.left + categoryLayout.sidePadding + (categoryLayout.offsets[index] ?? 0);
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
  const xAxisTitleY = plot.bottom + (hasTimeLabels ? 88 : 70) + extraLabelHeight;
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
  const yTickLabels = yTicks.map((tick) => formatNumber(tick, yTickFractionDigits));
  const yAxisTitleX = yAxisTitlePosition({
    axisX: plot.left,
    tickLabels: yTickLabels,
    tickFontSize: appearance.tickFontSize,
    titleFontSize: appearance.axisTitleFontSize,
    minimumX: 18,
  });
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
      aria-label={t(`${yLabel}の実験単位ごとのグラフ`, `${yLabel} Graph by experimental unit`)}
      data-graph-shape={shape}
      data-category-slot-width={continuousLine ? 0 : categoryLayout.baseSlot}
      data-side-padding={categoryLayout.sidePadding}
      data-left-margin={plot.left}
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
            ? t(
                "割合は実験単位ごとに計算しています。",
                "Proportions are calculated for each experimental unit.",
              )
            : t(
                "細胞・ROIなどの生データは統計上のnではなく、実験単位を別に保持しています。",
                "Raw cell or ROI values are not statistical n; experimental units are retained separately.",
              )
        }`}
      </desc>
      {showLegend ? (
        <g
          className="experiment-graph-svg-legend"
          data-graph-layer="legend"
          data-inspector-target="legend"
          data-selected={activeInspectorTarget === "legend" || undefined}
          aria-label={t("条件の色", "Condition colors")}
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
                ? plot.left + column * Math.max(130, categoryLayout.innerWidth / 3)
                : appearance.legendPosition === "right"
                  ? plot.right + 24
                  : plot.right - 165;
            const legendY =
              appearance.legendPosition === "top"
                ? 20 + row * Math.max(34, appearance.legendFontSize * 2)
                : plot.top + 14 + row * Math.max(30, appearance.legendFontSize * 1.8);
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
              x1={plot.left}
              x2={plot.left + yTickDelta * 5}
              y1={y}
              y2={y}
              className="experiment-graph-tick"
              data-axis-tick="y"
              data-tick-direction={tickDirection}
            />
            <text
              x={plot.left - 10}
              y={y + 5}
              textAnchor="end"
              className="experiment-graph-axis-label"
              style={{ fontSize: appearance.tickFontSize, fill: "#000" }}
            >
              {yTickLabels[index]}
            </text>
          </g>
        );
      })}
      <line
        x1={plot.left}
        x2={plot.left}
        y1={plot.top}
        y2={plot.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onInspect("y-axis");
        }}
      />
      <line
        x1={plot.left}
        x2={plot.left}
        y1={plot.top}
        y2={plot.bottom}
        className="experiment-graph-axis-hit-target"
        data-inspector-target="y-axis"
        data-selected={activeInspectorTarget === "y-axis" || undefined}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onInspect("y-axis");
        }}
      />
      <line
        x1={plot.left}
        x2={plot.right}
        y1={plot.bottom}
        y2={plot.bottom}
        className="experiment-graph-axis-line"
        style={{ strokeWidth: appearance.axisLineWidth }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onInspect("x-axis");
        }}
      />
      <line
        x1={plot.left}
        x2={plot.right}
        y1={plot.bottom}
        y2={plot.bottom}
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
                y1={plot.bottom}
                y2={plot.bottom + xTickDelta * 6}
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
                y1={plot.bottom}
                y2={plot.bottom + xTickDelta * 3.5}
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
                  y1={plot.bottom}
                  y2={plot.bottom + xTickDelta * 6}
                  className="experiment-graph-category-tick"
                  data-axis-tick="x"
                  data-tick-direction={tickDirection}
                />
                <text
                  x={xForContinuousValue(value)}
                  y={plot.bottom + 25}
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
                y1={plot.bottom}
                y2={plot.bottom + xTickDelta * 10}
                className="experiment-graph-category-group-separator"
                data-graph-layer="category-group-separator"
                data-tick-direction={tickDirection}
              />
            );
          })
        : null}
      <text
        x={yAxisTitleX}
        y={plot.top + plot.height / 2}
        transform={`rotate(-90 ${yAxisTitleX} ${plot.top + plot.height / 2})`}
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
          x={plot.left + plot.width / 2}
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
            x1={plot.left}
            x2={plot.right}
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
              x={plot.right - 4}
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
                y={Math.max(plot.top + 12, yFor(Math.max(...targetValues)) - 12)}
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
                y1={plot.top - 10 - annotationLevel * 24}
                y2={plot.top - 10 - annotationLevel * 24}
                className="experiment-graph-stat-line"
              />
              <line
                x1={xFor(pairwise[0])}
                x2={xFor(pairwise[0])}
                y1={plot.top - 10 - annotationLevel * 24}
                y2={plot.top - 4 - annotationLevel * 24}
                className="experiment-graph-stat-line"
              />
              <line
                x1={xFor(pairwise[1])}
                x2={xFor(pairwise[1])}
                y1={plot.top - 10 - annotationLevel * 24}
                y2={plot.top - 4 - annotationLevel * 24}
                className="experiment-graph-stat-line"
              />
              <text
                x={(xFor(pairwise[0]) + xFor(pairwise[1])) / 2}
                y={plot.top - 14 - annotationLevel * 24}
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
              x={plot.right}
              y={plot.top - 10 - stackIndex * 22}
              textAnchor="end"
              className="experiment-graph-stat-label"
              data-graph-layer="statistics-annotation"
            >
              {`${test.name || annotationContext} · ${
                annotation.mode === "symbol"
                  ? significanceSymbol(pValue)
                  : `${
                      isPairwiseComparisonTest(test.name) ? "p" : t("全体 p", "overall p")
                    } = ${formatExactPValue(pValue)}`
              }`}
            </text>
          );
        },
      )}
      {statisticsLegendLabels.map((label, index) => (
        <text
          key={`statistics-legend-${label}`}
          x={plot.left}
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
              plot.bottom + (hasTimeLabels ? 52 : 34) + (hierarchyDepth - 1 - levelIndex) * 27;
            const heading = axisLabels[0]?.levels[levelIndex]?.label;
            return [
              heading &&
              !(levelIndex === 0 && heading === "条件") &&
              !(levelIndex === 0 && heading === singleCategoricalFactorTitle) ? (
                <text
                  key={`heading-${levelIndex}`}
                  x={plot.left - 10}
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
                y={plot.bottom + 25}
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
                fillOpacity={0.24}
                style={{
                  // Keep this inline so both the live stylesheet and the SVG export stylesheet
                  // respect the researcher's explicit outline toggle.
                  stroke:
                    appearance.barOutline === false
                      ? "none"
                      : appearance.barOutlineMode === "black"
                        ? "#111111"
                        : appearance.barOutlineMode === "custom"
                          ? (appearance.barOutlineColor ?? "#111111")
                          : color,
                  strokeWidth:
                    appearance.barOutline === false
                      ? 0
                      : (appearance.barOutlineWidth ?? appearance.distributionLineWidth),
                }}
                className="experiment-graph-bar"
                data-graph-layer="bar"
                data-inspector-target="experiment-summary"
                data-selected={activeInspectorTarget === "experiment-summary" || undefined}
                data-summary-value={mean}
                aria-label={t(
                  `${item.conditionLabel}の平均を表す棒: ${formatNumber(mean)}`,
                  `Bar showing the mean for ${item.conditionLabel}: ${formatNumber(mean)}`,
                )}
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
                <title>
                  {t(
                    "バイオリン分布を編集（ダブルクリック）",
                    "Edit violin distribution (double-click)",
                  )}
                </title>
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
                  aria-label={t(
                    `${item.conditionLabel}の細胞・ROI分布（記述用）`,
                    `Descriptive cell or ROI distribution for ${item.conditionLabel}`,
                  )}
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
                  aria-label={t(
                    `${item.conditionLabel} ${point.experimentLabel}の生データ: ${formatNumber(point.value)}`,
                    `Raw value for ${item.conditionLabel}, ${point.experimentLabel}: ${formatNumber(point.value)}`,
                  )}
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
                  ariaLabel={t(
                    `${item.conditionLabel} ${point.experimentLabel}の実験単位平均: ${formatNumber(point.value)}`,
                    `Experimental-unit mean for ${item.conditionLabel}, ${point.experimentLabel}: ${formatNumber(point.value)}`,
                  )}
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
