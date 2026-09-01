import { useMemo, useRef, useState } from "react";
import { defaultAnalysisRunner, type AnalysisRunner } from "../../app/analysisClient";

import {
  hasSharedSourceConditionUnits,
  orderedAxisSemantic,
  orderedAxisTitle,
  orderedAxisUnit,
  type ExperimentCellMap,
  type ExperimentSetDraft,
  type ReadoutDraft,
  type TimeAnalysisPlan,
} from "../../app/experimentDraft";
import { assessDraftGraphAnalysis, isDerivedTimeMetric } from "../../app/experimentDraftAnalysis";
import {
  nestedIndependentSourceContext,
  type DraftAnalysisCorrection,
} from "../../app/draftAnalysisDiagnostics";
import { defaultGraphYTitle, defaultLayersForGraphType } from "../../app/graphDefaults";
import {
  createInitialGraphGrouping,
  normalizeGraphGroupingChannels,
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
import { useBenchmarkRun } from "../../app/benchmarkEvaluation";
import { evaluationModeIsConfigured, evaluationMode } from "../../app/evaluationMode";
import { GraphStatisticsPanel } from "./GraphStatisticsPanel";
import { ExperimentGraphCanvasToolbar } from "./ExperimentGraphCanvasToolbar";
import { ExperimentGraphDataSummary } from "./ExperimentGraphDataSummary";
import { ExperimentGraphDistributionEditor } from "./ExperimentGraphDistributionEditor";
import { ExperimentGraphGroupingEditor } from "./ExperimentGraphGroupingEditor";
import { ExperimentGraphSelectionEditor } from "./ExperimentGraphSelectionEditor";
import { ExperimentGraphSeriesEditor } from "./ExperimentGraphSeriesEditor";
import { ExperimentGraphTimeAnalysisEditor } from "./ExperimentGraphTimeAnalysisEditor";
import { CompositionGraphSvg } from "./CompositionGraphSvg";
import { CorrelationGraphSvg } from "./CorrelationGraphSvg";
import { ExperimentGraphSvg } from "./GeneralExperimentGraphSvg";
import { ExperimentGraphAnnotationEditor } from "./ExperimentGraphAnnotationEditor";
import { ExperimentGraphAnalysisScopeNotice } from "./ExperimentGraphAnalysisScopeNotice";
import { ExperimentGraphAnalysisSetEditor } from "./ExperimentGraphAnalysisSetEditor";
import { ExperimentGraphAppearanceEditor } from "./ExperimentGraphAppearanceEditor";
import { ExperimentGraphConnectingLineEditor } from "./ExperimentGraphConnectingLineEditor";
import { ExperimentGraphErrorBarEditor } from "./ExperimentGraphErrorBarEditor";
import { ExperimentGraphLegendEditor } from "./ExperimentGraphLegendEditor";
import { ExperimentGraphRawDotsEditor } from "./ExperimentGraphRawDotsEditor";
import { ExperimentGraphXAxisEditor } from "./ExperimentGraphXAxisEditor";
import { ExperimentGraphYAxisEditor } from "./ExperimentGraphYAxisEditor";
import {
  createGraphAnalysisContextKey,
  createExperimentGraphMethodsText,
  varyingGraphAnalysisAttributes,
} from "./experimentGraphStatistics";
import {
  createBenchmarkAnalysisState,
  createBenchmarkRenderedState,
  createGraphUsageState,
} from "./experimentGraphInstrumentation";
import { useExperimentGraphDiagnosticEffects } from "./useExperimentGraphDiagnosticEffects";
import { useBenchmarkGraphConfigurationEffects } from "./useBenchmarkGraphConfigurationEffects";
import { useDefaultBenchmarkGraphCapture } from "./useDefaultBenchmarkGraphCapture";
import {
  useExperimentGraphWorkspaceEffects,
  type GraphInspectorTarget as InspectorTarget,
} from "./useExperimentGraphWorkspaceEffects";
import { useAdjustedStatisticsAnnotations } from "./useAdjustedStatisticsAnnotations";
import { useExperimentGraphStatisticsIntent } from "./useExperimentGraphStatisticsIntent";
import { finalizeBenchmarkGraphCapture } from "./finalizeBenchmarkGraphCapture";
import {
  runGraphClipboardCopy,
  runGraphUserExport,
  type GraphExportFeedback,
} from "./experimentGraphUserExports";
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
} from "./experimentGraphDataExport";
export { serializeVisibleGraphData } from "./experimentGraphDataExport";
import { buildDerivedGraphLineageRows, buildExperimentGraphSeries } from "./experimentGraphSeries";
import {
  buildConditionAxisLabels,
  buildGraphFacetGroups,
  hasVisibleGraphData,
  uniqueVisualSeriesOptions,
} from "./experimentGraphPresentation";
import "./graph-workbench.css";

type LayerState = WorkspaceGraphState["layers"];

type GraphAppearance = WorkspaceGraphState["appearance"];
type AxisSettings = WorkspaceGraphState["axes"];
type GraphType = WorkspaceGraphState["graphType"];
type StatisticsAnnotation = NonNullable<WorkspaceGraphState["statisticsAnnotation"]>;
type StatisticsAnnotationEntry = NonNullable<WorkspaceGraphState["statisticsAnnotations"]>[number];
type GraphGrouping = NonNullable<WorkspaceGraphState["grouping"]>;

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
  const {
    correlationMethod,
    selectedMethod: selectedStatisticalMethod,
    contrastIntent,
    plannedContrastConditionIds,
    changeCorrelationMethod,
    changeSelectedMethod,
    changePlannedContrastConditionIds,
    removeConditionFromPlannedContrasts,
    changeContrastIntent,
  } = useExperimentGraphStatisticsIntent({
    initialAnalysis: initialState?.analysis,
    clearAnalysis: () => setAnalysis(null),
  });
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
  const [pngExportFeedback, setPngExportFeedback] = useState<GraphExportFeedback | null>(null);
  const [benchmarkCaptureStatus, setBenchmarkCaptureStatus] = useState<string | null>(null);
  const benchmarkRun = useBenchmarkRun();
  const analysisResult = analysis?.result ?? null;
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
  useAdjustedStatisticsAnnotations({
    initialRequestId: initialState?.analysis?.result.requestId ?? null,
    analysisResult,
    adjustedAnnotations: adjustedComparisonAnnotations,
    setStatisticsAnnotations,
  });
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

  useExperimentGraphWorkspaceEffects({
    workspaceMode,
    initialAnalysis: initialState?.analysis,
    graphStateSnapshot,
    onStateChange,
    setInspectorTarget,
    setAnalysis,
    setStatisticsAnnotation,
    setStatisticsAnnotations,
  });

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
  useExperimentGraphDiagnosticEffects({
    renderedState: benchmarkRenderedState,
    graphType,
    usageGraphState,
  });

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
      ? t("派生値：", "Derived value: ") + timeMetricLabel(timeAnalysis, locale)
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
      return buildConditionAxisLabels({
        draft,
        series,
        hierarchyOrder: axes.hierarchyOrder,
        grouping,
      });
    return series.map((item) => ({
      conditionId: item.conditionId,
      levels: [{ id: "condition", label: "条件", value: item.conditionLabel }],
      timeLabel: grouping.series.source === "time" ? "" : (item.timeLabel ?? ""),
    }));
  }, [appearance.hierarchicalLabels, axes.hierarchyOrder, draft, grouping, series]);
  const facetGroups = useMemo(
    () =>
      buildGraphFacetGroups({
        series,
        axisLabels,
        requestedOrder: grouping.facet?.levelOrder ?? [],
      }),
    [axisLabels, grouping.facet?.levelOrder, series],
  );
  const visualSeriesOptions = useMemo(() => uniqueVisualSeriesOptions(series), [series]);
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
  const hasData = hasVisibleGraphData({ shape, sourceMode, series, cells });
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
  const analysisContextKey = createGraphAnalysisContextKey({
    draft,
    readoutId: activeReadoutId,
    sourceMode,
    conditionIds: analysisConditionIds,
    displayedTimePointIds: selectedTimePointIds,
    analysisTimePointId,
    plannedContrastConditionIds,
    timeAnalysis,
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
  const varyingStatisticalAttributes = varyingGraphAnalysisAttributes(draft, analysisConditionIds);
  const hasFactorByTimeStructure =
    draft.time.points.length > 1 && varyingStatisticalAttributes.length > 1;
  const handleAnalysisConditionChange = (conditionId: string, checked: boolean) => {
    setAnalysisConditionIds((current) =>
      checked
        ? [...current, conditionId]
        : current.filter((selectedId) => selectedId !== conditionId),
    );
    removeConditionFromPlannedContrasts(conditionId);
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
    await runGraphUserExport(
      "svg",
      () => saveGraphSvgExport(svgRef.current!, `${safeGraphFileStem(readout.label)}.svg`),
      setPngExportFeedback,
    );
  };
  const exportPng = async () => {
    if (!svgRef.current || !readout) return;
    await runGraphUserExport(
      "png",
      () => saveGraphPngExport(svgRef.current!, `${safeGraphFileStem(readout.label)}.png`),
      setPngExportFeedback,
    );
  };
  const exportCsv = async () => {
    if (!readout) return;
    await runGraphUserExport(
      "csv",
      () =>
        saveGraphCsvExport(
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
        ),
      setPngExportFeedback,
    );
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
    await runGraphClipboardCopy(() => copyGraphToClipboard(svgRef.current!), setCopyStatus);
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
            {workspaceMode === "statistics"
              ? t("統計", "Statistics")
              : t("グラフ作成", "Graph editor")}
          </p>
          <h2>{readout?.label ?? t("測定項目を選択", "Select a readout")}</h2>
          <p className="experiment-graph-subtitle">
            {semanticReadiness === "unresolved_descriptive"
              ? t(
                  "表の行を記述的に表示（実験単位と統計的なnは未確認）",
                  "Descriptive display of table rows (experimental unit and statistical n not confirmed)",
                )
              : timeLabel
                ? t(`時点：${timeLabel}`, `Time point: ${timeLabel}`)
                : t("実験単位ごとの値を比較", "Compare values by experimental unit")}
            {workspaceMode !== "statistics"
              ? t(" · 図の要素をクリックして設定", " · Click a Graph element to edit it")
              : ""}
          </p>
        </div>
        <button type="button" className="experiment-graph-close" onClick={onClose}>
          {t("閉じる", "Close")}
        </button>
      </header>

      <div className="experiment-graph-workbench-layout">
        {workspaceMode !== "statistics" ? (
          <section
            className="experiment-graph-canvas-panel"
            aria-label={t("グラフプレビュー", "Graph preview")}
          >
            <ExperimentGraphCanvasToolbar
              graphTypeLabel={graphTypeLabel[graphType]}
              layerDescription={activeLayerDescription}
              graphTitleFontSize={appearance.graphTitleFontSize}
              hasData={hasData}
              copyStatus={copyStatus}
              exportFeedback={pngExportFeedback}
              benchmarkCaptureStatus={benchmarkCaptureStatus}
              fitOverview={fitOverview}
              showBenchmarkAction={
                import.meta.env.DEV && evaluationModeIsConfigured(evaluationMode)
              }
              benchmarkActionDisabled={
                !hasData ||
                !benchmarkRun.identity ||
                !benchmarkRun.supportStatus ||
                !benchmarkRun.defaultGraphCaptured ||
                (!analysis && !descriptiveBenchmarkRun)
              }
              onCopy={() => void copyGraph()}
              onExportSvg={() => void exportSvg()}
              onExportPng={() => void exportPng()}
              onExportCsv={() => void exportCsv()}
              onFinalizeBenchmark={() => void finalizeBenchmarkRun()}
              onFitOverviewChange={setFitOverview}
            />
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
                {t(
                  "表示する条件と値を選択してください。",
                  "Select the conditions and values to display.",
                )}
              </div>
            )}
            <p className="experiment-graph-caption">
              {semanticReadiness === "unresolved_descriptive"
                ? t(
                    `現在の表示：${activeLayerDescription}。元の表の行を保持した記述的Graphです。行数をbiological nや対応関係とは解釈していません。`,
                    `Current display: ${activeLayerDescription}. This descriptive Graph retains the source-table rows without interpreting row count as biological n or a matched relationship.`,
                  )
                : sharedSourceTopology
                  ? t(
                      `各点は条件別${draft.conditionAssignment.unitLabel}の値です。同じ${sharedSourceTopology.sourceUnitLabel}に由来する組は共有IDで対応づけていますが、条件別${draft.conditionAssignment.unitLabel}は別の実験単位として保持しています。`,
                      `Each point is a condition-specific ${draft.conditionAssignment.unitLabel} value. Units from the same ${sharedSourceTopology.sourceUnitLabel} are matched by a shared ID while remaining separate experimental units across conditions.`,
                    )
                  : shape === "categorical_counts"
                    ? t(
                        "カテゴリ別countを保持し、構成割合を自動計算しています。連続値として扱わず、カテゴリ構成の推論統計はまだ実行しません。",
                        "Category counts are retained and composition fractions are calculated automatically. They are not treated as continuous values, and inferential statistics for category composition are not run here.",
                      )
                    : draft.analysisIntent.kind === "correlation"
                      ? t(
                          "各点は同じ実験単位から得たXとYの完全な1組です。行順や日付から対応を推測していません。",
                          "Each point is one complete X/Y pair from the same experimental unit. Matching is not inferred from row order or dates.",
                        )
                      : shape === "wb_ratio"
                        ? t(
                            `各点は実験単位（Exp）ごとの${readout.label} / ${readout.referenceLabel ?? "reference"}です。標的とreferenceの生値は別々に保持しています。`,
                            `Each point is ${readout.label} / ${readout.referenceLabel ?? "reference"} for one experimental unit (Exp). Raw target and reference values are retained separately.`,
                          )
                        : shape === "proportion"
                          ? t(
                              `現在の表示：${activeLayerDescription}。割合と要約は実験単位（Exp）から計算しています。`,
                              `Current display: ${activeLayerDescription}. Proportions and summaries are calculated from experimental units (Exp).`,
                            )
                          : t(
                              `現在の表示：${activeLayerDescription}。細胞・ROIなどの生データを表示しても、統計上のnは実験単位です。`,
                              `Current display: ${activeLayerDescription}. Showing raw cell or ROI data does not change statistical n, which remains the experimental unit.`,
                            )}
            </p>
            <details className="experiment-graph-data-details">
              <summary>{t("使用データの内訳を表示", "Show data used")}</summary>
              <ExperimentGraphDataSummary shape={shape} series={series} />
            </details>
          </section>
        ) : null}

        <aside
          className="experiment-graph-inspector"
          aria-label={
            workspaceMode === "statistics"
              ? t("統計設定", "Statistics settings")
              : t("グラフ設定", "Graph settings")
          }
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
                  <option value="experiment-summary">
                    {t("実験単位の要約", "Experimental-unit summary")}
                  </option>
                  <option value="series-style">
                    {t("系列の色・線・点", "Series color, line, and symbol")}
                  </option>
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
              <div
                className="experiment-graph-layer-shortcuts"
                aria-label={t("現在の表示レイヤー", "Visible layers")}
              >
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
            <ExperimentGraphAnalysisSetEditor
              draft={draft}
              selectedReadoutId={activeReadoutId}
              selectedConditionIds={analysisConditionIds}
              onReadoutChange={(readoutId) => {
                setSelectedReadoutId(readoutId);
                setAnalysis(null);
              }}
              onConditionChange={handleAnalysisConditionChange}
            />
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
                <ExperimentGraphGroupingEditor
                  draft={draft}
                  axes={axes}
                  grouping={grouping}
                  setGrouping={setGrouping}
                  setAppearance={setAppearance}
                  visualSeriesCount={visualSeriesOptions.length}
                  onEditSeriesStyles={() => inspectGraphPart("series-style")}
                />
              ) : null}
              <ExperimentGraphSelectionEditor
                draft={draft}
                sourceMode={sourceMode}
                timeAnalysis={timeAnalysis}
                readoutLabel={readout.label}
                derivedLineageRows={derivedLineageRows}
                selectedTimePointIds={selectedTimePointIds}
                activeConditionIds={activeConditionIds}
                onSourceModeChange={(mode) => {
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
                        ? `${readout?.label ?? t("測定値", "Measured value")} — ${timeMetricLabel(
                            timeAnalysis.kind === "selected_timepoint"
                              ? { kind: "auc" }
                              : timeAnalysis,
                            locale,
                          )}`
                        : defaultGraphYTitle(readout),
                  }));
                  setAnalysis(null);
                }}
                onAllTimePointsChange={(checked) => {
                  setSelectedTimePointIds(
                    checked ? draft.time.points.map((point) => point.id) : [],
                  );
                  setAnalysis(null);
                }}
                onTimePointChange={(timePointId, checked) => {
                  setSelectedTimePointIds((current) =>
                    checked
                      ? [...current, timePointId]
                      : current.filter((selectedId) => selectedId !== timePointId),
                  );
                  setAnalysis(null);
                }}
                onConditionChange={(conditionId, checked) =>
                  setSelectedConditionIds((current) =>
                    checked
                      ? [...current, conditionId]
                      : current.filter((selectedId) => selectedId !== conditionId),
                  )
                }
              />
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
            <ExperimentGraphSeriesEditor
              mode={inspectorTarget}
              layers={layers}
              appearance={appearance}
              visualSeriesOptions={visualSeriesOptions}
              setLayers={setLayers}
              setAppearance={setAppearance}
            />
          ) : null}

          {inspectorTarget === "violin" || inspectorTarget === "box" ? (
            <ExperimentGraphDistributionEditor
              mode={inspectorTarget}
              shape={shape}
              layers={layers}
              appearance={appearance}
              setLayers={setLayers}
              setAppearance={setAppearance}
            />
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
            <ExperimentGraphLegendEditor appearance={appearance} setAppearance={setAppearance} />
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
                <ExperimentGraphTimeAnalysisEditor
                  time={draft.time}
                  plan={timeAnalysis}
                  analysisTimePointId={analysisTimePointId}
                  onKindChange={(kind) => {
                    const nextPlan = { kind };
                    setTimeAnalysis(nextPlan);
                    if (kind === "full_time_course") setSourceMode("raw_readout");
                    if (sourceMode === "derived_metric") {
                      setAxes((current) => ({
                        ...current,
                        yTitle: `${readout?.label ?? t("測定値", "Measured value")} — ${timeMetricLabel(nextPlan, locale)}`,
                      }));
                    }
                    setAnalysis(null);
                  }}
                  onPlanChange={(nextPlan) => {
                    setTimeAnalysis(nextPlan);
                    setAnalysis(null);
                  }}
                  onAnalysisTimePointChange={(timePointId) => {
                    setAnalysisTimePointId(timePointId);
                    setAnalysis(null);
                  }}
                />
              ) : null}
              {draft.time.points.length > 1 &&
              timeAnalysis.kind === "selected_timepoint" &&
              !analysisTimePointId ? (
                <ExperimentGraphAnalysisScopeNotice
                  time={draft.time}
                  plan={timeAnalysis}
                  analysisTimePointId={analysisTimePointId}
                  hasFactorByTimeStructure={hasFactorByTimeStructure}
                  varyingFactorLabels={varyingStatisticalAttributes.map(({ label }) => label)}
                />
              ) : (
                <>
                  {hasFactorByTimeStructure && analysisTimePointId ? (
                    <ExperimentGraphAnalysisScopeNotice
                      time={draft.time}
                      plan={timeAnalysis}
                      analysisTimePointId={analysisTimePointId}
                      hasFactorByTimeStructure={hasFactorByTimeStructure}
                      varyingFactorLabels={varyingStatisticalAttributes.map(({ label }) => label)}
                    />
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
                    onCorrelationMethodChange={(method) =>
                      changeCorrelationMethod(
                        method,
                        analysisAssessment.recommendedMethod ?? method,
                      )
                    }
                    selectedMethod={selectedStatisticalMethod}
                    onSelectedMethodChange={(method) =>
                      changeSelectedMethod(method, analysisAssessment.recommendedMethod ?? method)
                    }
                    contrastIntent={contrastIntent}
                    conditionOptions={activeAnalysisConditions.map(({ id, label }) => ({
                      id,
                      label,
                    }))}
                    plannedContrastConditionIds={plannedContrastConditionIds}
                    onPlannedContrastConditionIdsChange={changePlannedContrastConditionIds}
                    onContrastIntentChange={changeContrastIntent}
                    analysisContextKey={analysisContextKey}
                  />
                </>
              )}
              {analysisResult?.status === "ok" ? (
                <ExperimentGraphAnnotationEditor
                  variant="display-only"
                  analysisResult={analysisResult}
                  draft={draft}
                  baseAnnotationContext={baseAnnotationContext}
                  annotationContext={annotationContext}
                  adjustedComparisonAnnotations={adjustedComparisonAnnotations}
                  statisticsAnnotation={statisticsAnnotation}
                  statisticsAnnotations={statisticsAnnotations}
                  setStatisticsAnnotation={setStatisticsAnnotation}
                  setStatisticsAnnotations={setStatisticsAnnotations}
                />
              ) : null}
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
