import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { AnalysisRecommendation } from "@lsaa/analysis-contracts";
import { defaultAnalysisRunner, type AnalysisRunner } from "../../app/analysisClient";

import {
  categoricalTotal,
  hasSharedSourceConditionUnits,
  orderedAxisSemantic,
  orderedAxisTitle,
  orderedAxisUnit,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type ReadoutDraft,
  type TimeAnalysisPlan,
} from "../../app/experimentDraft";
import {
  assessDraftGraphAnalysis,
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
import { copyGraphToClipboard } from "../../app/graphExport";
import {
  saveGraphCsvExport,
  saveGraphPngExport,
  saveGraphSvgExport,
} from "../../app/graphExportController";
import { localizedText, useAppLocale } from "../../app/appLocale";
import { recordBenchmarkEvent, useBenchmarkRun } from "../../app/benchmarkEvaluation";
import { recordDiagnosticError } from "../../app/diagnostics";
import { evaluationModeIsConfigured, evaluationMode } from "../../app/evaluationMode";
import { GraphStatisticsPanel } from "./GraphStatisticsPanel";
import { CompositionGraphSvg } from "./CompositionGraphSvg";
import { CorrelationGraphSvg } from "./CorrelationGraphSvg";
import { ExperimentGraphSvg } from "./GeneralExperimentGraphSvg";
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
  createExperimentGraphMethodsText,
  statisticalMethodForContrastIntent,
} from "./experimentGraphStatistics";
import {
  createBenchmarkAnalysisState,
  createBenchmarkRenderedState,
  createGraphUsageState,
} from "./experimentGraphInstrumentation";
import { useExperimentGraphDiagnosticEffects } from "./useExperimentGraphDiagnosticEffects";
import { useBenchmarkGraphConfigurationEffects } from "./useBenchmarkGraphConfigurationEffects";
import { useDefaultBenchmarkGraphCapture } from "./useDefaultBenchmarkGraphCapture";
import { finalizeBenchmarkGraphCapture } from "./finalizeBenchmarkGraphCapture";
import {
  analysisTestAnnotationLabel,
  createAdjustedComparisonAnnotation,
  graphAnnotationContext,
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
  type GraphSeries,
} from "./experimentGraphDataExport";
export { serializeVisibleGraphData } from "./experimentGraphDataExport";
import {
  buildDerivedGraphLineageRows,
  buildExperimentGraphSeries,
} from "./experimentGraphSeries";
import {
  formatGraphNumber as formatNumber,
} from "./graphValueFormatting";

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
  const methodsText = useMemo(
    () =>
      createExperimentGraphMethodsText({
        analysis,
        draft,
        selectedReadoutId,
        layers,
        appearance,
        axes,
        graphType,
        timeAnalysis,
      }),
    [analysis, appearance, axes, draft, graphType, layers, selectedReadoutId, timeAnalysis],
  );
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
  const benchmarkRenderedState = createBenchmarkRenderedState({
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
    timeAnalysis,
  });
  const benchmarkAnalysisState = createBenchmarkAnalysisState({
    selectedReadoutId,
    sourceMode,
    selectedConditionIds,
    analysisConditionIds,
    selectedTimePointIds,
    analysisTimePointId,
    timeAnalysis,
    selectedStatisticalMethod,
    correlationMethod,
    contrastIntent,
    plannedContrastConditionIds,
    analysis,
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

  const usageGraphState = createGraphUsageState({
    graphType,
    selectedReadoutId,
    sourceMode,
    selectedConditionIds,
    selectedTimePointIds,
    grouping,
    axes,
    layers,
    appearance,
    statisticsAnnotation,
    statisticsAnnotations,
  });
  useExperimentGraphDiagnosticEffects({ benchmarkRenderedState, graphType, usageGraphState });

  useBenchmarkGraphConfigurationEffects({
    identity: benchmarkRun.identity,
    renderedState: benchmarkRenderedState,
    analysisState: benchmarkAnalysisState,
    configuration: {
      graphType,
      selectedReadoutId,
      sourceMode,
      selectedConditionIds,
      analysisConditionIds,
      selectedTimePointIds,
      timeAnalysis,
      selectedStatisticalMethod,
      statisticsAnnotation,
      appearance,
      axes,
      layers,
    },
  });

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

  const series = useMemo(
    () =>
      buildExperimentGraphSeries({
        draft,
        cells,
        readout,
        activeConditions,
        activeTimePoints,
        axes,
        appearance,
        grouping,
        sourceMode,
        timeAnalysis,
      }),
    [
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
    ],
  );

  const derivedLineageRows = buildDerivedGraphLineageRows({
    draft,
    cells,
    readout,
    activeConditions,
    sourceMode,
    timeAnalysis,
  });

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
  useDefaultBenchmarkGraphCapture({
    svgRef,
    identity: benchmarkRun.identity,
    defaultGraphCapture: benchmarkRun.defaultGraphCapture,
    eventCount: benchmarkRun.events.length,
    hasData,
    workspaceMode,
    analysisState: benchmarkAnalysisState,
    setStatus: setBenchmarkCaptureStatus,
  });
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
    await finalizeBenchmarkGraphCapture({
      svg: svgRef.current,
      draft,
      analysis,
      analysisAssessment,
      descriptiveBenchmarkRun,
      methodsText,
      descriptiveMethodsText,
      benchmarkAnalysisState,
      graphType,
      selectedReadoutId,
      selectedConditionIds,
      analysisConditionIds,
      graphState: graphStateSnapshot,
      setStatus: setBenchmarkCaptureStatus,
    });
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
                      setSelectedStatisticalMethod(statisticalMethodForContrastIntent(intent));
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
