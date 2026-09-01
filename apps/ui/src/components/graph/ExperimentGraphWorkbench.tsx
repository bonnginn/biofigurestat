import { useMemo, useRef, useState } from "react";
import { defaultAnalysisRunner, type AnalysisRunner } from "../../app/analysisClient";

import {
  hasSharedSourceConditionUnits,
  type ExperimentCellMap,
  type ExperimentSetDraft,
} from "../../app/experimentDraft";
import { isDerivedTimeMetric } from "../../app/experimentDraftAnalysis";
import {
  nestedIndependentSourceContext,
  type DraftAnalysisCorrection,
} from "../../app/draftAnalysisDiagnostics";
import { defaultGraphYTitle, defaultLayersForGraphType } from "../../app/graphDefaults";
import {
  createExperimentWorkspaceDesign,
  type WorkspaceGraphState,
} from "../../app/experimentWorkspaceProject";
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
import { ExperimentGraphCanvasCaption } from "./ExperimentGraphCanvasCaption";
import { ExperimentGraphCanvasToolbar } from "./ExperimentGraphCanvasToolbar";
import { ExperimentGraphDataEditor } from "./ExperimentGraphDataEditor";
import { ExperimentGraphDataSummary } from "./ExperimentGraphDataSummary";
import { ExperimentGraphInspectorTarget } from "./ExperimentGraphInspectorTarget";
import { ExperimentGraphDistributionEditor } from "./ExperimentGraphDistributionEditor";
import { ExperimentGraphSeriesEditor } from "./ExperimentGraphSeriesEditor";
import { ExperimentGraphTimeAnalysisEditor } from "./ExperimentGraphTimeAnalysisEditor";
import { ExperimentGraphCanvasRenderer } from "./ExperimentGraphCanvasRenderer";
import { ExperimentGraphAnnotationEditor } from "./ExperimentGraphAnnotationEditor";
import { ExperimentGraphAnalysisScopeNotice } from "./ExperimentGraphAnalysisScopeNotice";
import { ExperimentGraphAnalysisSetEditor } from "./ExperimentGraphAnalysisSetEditor";
import { ExperimentGraphAppearanceEditor } from "./ExperimentGraphAppearanceEditor";
import { graphPresentationForPreset } from "./experimentGraphPresets";
import { describeActiveGraphLayers } from "./experimentGraphLayerDescription";
import { experimentGraphTypeLabel } from "./experimentGraphTypeLabel";
export { describeActiveGraphLayers } from "./experimentGraphLayerDescription";
import { selectExperimentGraphActiveScope } from "./experimentGraphActiveScope";
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
import { useExperimentGraphStatisticsIntent } from "./useExperimentGraphStatisticsIntent";
import { useExperimentGraphAnalysisState } from "./useExperimentGraphAnalysisState";
import { useExperimentGraphAnalysisAssessment } from "./useExperimentGraphAnalysisAssessment";
import { useExperimentGraphStateSnapshot } from "./useExperimentGraphStateSnapshot";
import { useExperimentGraphPresentationState } from "./useExperimentGraphPresentationState";
import { useExperimentGraphDataSelectionState } from "./useExperimentGraphDataSelectionState";
import { finalizeBenchmarkGraphCapture } from "./finalizeBenchmarkGraphCapture";
import {
  runGraphClipboardCopy,
  runGraphUserExport,
  type GraphExportFeedback,
} from "./experimentGraphUserExports";
import {
  analysisTestAnnotationLabel,
  createSelectedComparisonAnnotation,
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
  const {
    selectedReadoutId,
    setSelectedReadoutId,
    selectedConditionIds,
    setSelectedConditionIds,
    analysisConditionIds,
    setAnalysisConditionIds,
    selectedTimePointIds,
    setSelectedTimePointIds,
    analysisTimePointId,
    setAnalysisTimePointId,
    timeAnalysis,
    setTimeAnalysis,
    sourceMode,
    setSourceMode,
  } = useExperimentGraphDataSelectionState({ draft, initialState });
  const independentNestedSource = nestedIndependentSourceContext({
    draft,
    readoutId: selectedReadoutId,
  });
  const {
    layers,
    setLayers,
    appearance,
    setAppearance,
    graphType,
    setGraphType,
    grouping,
    setGrouping,
    axes,
    setAxes,
    inspectorTarget,
    setInspectorTarget,
    fitOverview,
    setFitOverview,
  } = useExperimentGraphPresentationState({
    draft,
    initialState,
    semanticReadiness,
    workspaceMode,
  });
  const {
    analysis,
    setAnalysis,
    analysisResult,
    statisticsAnnotation,
    setStatisticsAnnotation,
    statisticsAnnotations,
    setStatisticsAnnotations,
    adjustedComparisonAnnotations,
  } = useExperimentGraphAnalysisState({
    initialState,
    sourceMode,
    timeAnalysis,
    analysisTimePointId,
  });
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
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [pngExportFeedback, setPngExportFeedback] = useState<GraphExportFeedback | null>(null);
  const [benchmarkCaptureStatus, setBenchmarkCaptureStatus] = useState<string | null>(null);
  const benchmarkRun = useBenchmarkRun();
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
  const graphStateSnapshot = useExperimentGraphStateSnapshot({
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
  });
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

  const {
    readout,
    activeReadoutId,
    activeConditionIds,
    activeConditions,
    activeAnalysisConditions,
    activeTimePoints,
    timeLabel,
  } = selectExperimentGraphActiveScope({
    draft,
    selectedReadoutId,
    selectedConditionIds,
    analysisConditionIds,
    selectedTimePointIds,
    sourceMode,
    timeAnalysis,
    locale,
  });

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
  const annotationEditorProps =
    analysisResult?.status === "ok"
      ? {
          analysisResult,
          draft,
          baseAnnotationContext,
          annotationContext,
          adjustedComparisonAnnotations,
          statisticsAnnotation,
          statisticsAnnotations,
          setStatisticsAnnotation,
          setStatisticsAnnotations,
        }
      : null;
  const hasData = hasVisibleGraphData({ shape, sourceMode, series, cells });
  const analysisAssessment = useExperimentGraphAnalysisAssessment({
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
  });
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
    const next = graphPresentationForPreset({
      preset,
      graphType,
      shape,
      visualSeriesCount: visualSeriesOptions.length,
      currentAppearance: appearance,
    });
    setLayers(next.layers);
    setAppearance(next.appearance);
  };
  const activeLayerDescription = describeActiveGraphLayers({
    graphType,
    shape,
    layers,
    errorBar: appearance.errorBar,
    timeSampling: draft.time.sampling,
    matched: draft.conditionAssignment.kind === "matched",
    semanticReadiness,
  }, locale);
  const exportSvg = async () => {
    if (!svgRef.current || !readout) return;
    await runGraphUserExport(
      "svg",
      locale,
      () => saveGraphSvgExport(svgRef.current!, `${safeGraphFileStem(readout.label)}.svg`),
      setPngExportFeedback,
    );
  };
  const exportPng = async () => {
    if (!svgRef.current || !readout) return;
    await runGraphUserExport(
      "png",
      locale,
      () => saveGraphPngExport(svgRef.current!, `${safeGraphFileStem(readout.label)}.png`),
      setPngExportFeedback,
    );
  };
  const exportCsv = async () => {
    if (!readout) return;
    await runGraphUserExport(
      "csv",
      locale,
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
    await runGraphClipboardCopy(locale, () => copyGraphToClipboard(svgRef.current!), setCopyStatus);
  };
  const inspectGraphPart = (target: InspectorTarget) => {
    if (workspaceMode === "graph" && target === "statistics") return;
    setInspectorTarget(target);
  };
  const addSelectedComparisonAnnotation = () => {
    if (!annotationEditorProps) return;
    const test = annotationEditorProps.analysisResult.tests[statisticsAnnotation.testIndex];
    if (!test) return;
    const next = createSelectedComparisonAnnotation({
      test,
      testIndex: statisticsAnnotation.testIndex,
      requestId: annotationEditorProps.analysisResult.requestId,
      mode: statisticsAnnotation.mode,
      sourceMode,
      timeAnalysis,
      analysisTimePointId,
    });
    setStatisticsAnnotations((current) => [
      ...current.filter(({ testIndex }) => testIndex !== next.testIndex),
      next,
    ]);
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
              graphTypeLabel={experimentGraphTypeLabel(graphType, locale)}
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
              <ExperimentGraphCanvasRenderer
                draft={draft}
                cells={cells}
                readout={readout}
                selectedConditionIds={selectedConditionIds}
                selectedTimePointIds={selectedTimePointIds}
                graphType={graphType}
                appearance={appearance}
                axes={axes}
                svgRef={svgRef}
                series={series}
                analysisResult={analysisResult}
                statisticsAnnotation={statisticsAnnotation}
                statisticsAnnotations={statisticsAnnotations}
                annotationContext={annotationContext}
                activeLayerDescription={activeLayerDescription}
                layers={layers}
                shape={shape}
                grouping={grouping}
                facetGroups={facetGroups}
                fitOverview={fitOverview}
                onInspect={inspectGraphPart}
                activeInspectorTarget={inspectorTarget}
              />
            ) : (
              <div className="experiment-graph-empty" role="status">
                {t(
                  "表示する条件と値を選択してください。",
                  "Select the conditions and values to display.",
                )}
              </div>
            )}
            <ExperimentGraphCanvasCaption
              semanticReadiness={semanticReadiness}
              activeLayerDescription={activeLayerDescription}
              shape={shape}
              isCorrelation={draft.analysisIntent.kind === "correlation"}
              conditionUnitLabel={draft.conditionAssignment.unitLabel}
              sharedSourceUnitLabel={sharedSourceTopology?.sourceUnitLabel}
              readoutLabel={readout.label}
              referenceLabel={readout.referenceLabel}
            />
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
            <ExperimentGraphInspectorTarget
              inspectorTarget={inspectorTarget}
              layers={layers}
              shape={shape}
              visualSeriesCount={visualSeriesOptions.length}
              allowAnnotation={analysisResult?.status === "ok"}
              allowStatistics={workspaceMode === "combined"}
              onInspect={inspectGraphPart}
              onLayersChange={setLayers}
            />
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
            <ExperimentGraphDataEditor
              draft={draft}
              activeReadoutId={activeReadoutId}
              axes={axes}
              grouping={grouping}
              setGrouping={setGrouping}
              setAppearance={setAppearance}
              visualSeriesCount={visualSeriesOptions.length}
              sourceMode={sourceMode}
              timeAnalysis={timeAnalysis}
              readoutLabel={readout.label}
              derivedLineageRows={derivedLineageRows}
              selectedTimePointIds={selectedTimePointIds}
              activeConditionIds={activeConditionIds}
              onReadoutChange={(readoutId) => {
                const nextReadout = draft.readouts.find(({ id }) => id === readoutId);
                setSelectedReadoutId(readoutId);
                setAxes((current) => ({
                  ...current,
                  yTitle: defaultGraphYTitle(nextReadout),
                }));
                setAnalysis(null);
              }}
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
              onEditSeriesStyles={() => inspectGraphPart("series-style")}
            />
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

          {inspectorTarget === "annotation" && annotationEditorProps ? (
            <ExperimentGraphAnnotationEditor
              {...annotationEditorProps}
              onAddSelectedComparison={addSelectedComparisonAnnotation}
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
              {annotationEditorProps ? (
                <ExperimentGraphAnnotationEditor
                  {...annotationEditorProps}
                  variant="display-only"
                />
              ) : null}
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
