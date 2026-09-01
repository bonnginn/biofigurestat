import { useMemo, useRef } from "react";
import { defaultAnalysisRunner, type AnalysisRunner } from "../../app/analysisClient";

import { type ExperimentCellMap, type ExperimentSetDraft } from "../../app/experimentDraft";
import { type DraftAnalysisCorrection } from "../../app/draftAnalysisDiagnostics";
import { type WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { localizedText, useAppLocale } from "../../app/appLocale";
import { ExperimentGraphCanvasCaption } from "./ExperimentGraphCanvasCaption";
import { ExperimentGraphCanvasToolbar } from "./ExperimentGraphCanvasToolbar";
import { ExperimentGraphDataEditor } from "./ExperimentGraphDataEditor";
import { ExperimentGraphDataSummary } from "./ExperimentGraphDataSummary";
import { ExperimentGraphInspectorTarget } from "./ExperimentGraphInspectorTarget";
import { ExperimentGraphCanvasRenderer } from "./ExperimentGraphCanvasRenderer";
import { ExperimentGraphAnnotationEditor } from "./ExperimentGraphAnnotationEditor";
import { ExperimentGraphAnalysisSetEditor } from "./ExperimentGraphAnalysisSetEditor";
import { ExperimentGraphAppearanceEditor } from "./ExperimentGraphAppearanceEditor";
import { createExperimentGraphDataTransitions } from "./experimentGraphDataTransitions";
import { createExperimentGraphPresentationTransitions } from "./experimentGraphPresentationTransitions";
import { describeActiveGraphLayers } from "./experimentGraphLayerDescription";
import { experimentGraphTypeLabel } from "./experimentGraphTypeLabel";
export { describeActiveGraphLayers } from "./experimentGraphLayerDescription";
import { selectExperimentGraphActiveScope } from "./experimentGraphActiveScope";
import { ExperimentGraphAxisInspector } from "./ExperimentGraphAxisInspector";
import { ExperimentGraphStatisticsInspector } from "./ExperimentGraphStatisticsInspector";
import { ExperimentGraphLayerInspector } from "./ExperimentGraphLayerInspector";
import {
  createGraphStatisticsRelationshipContext,
  createExperimentGraphMethodsText,
} from "./experimentGraphStatistics";
import {
  createBenchmarkAnalysisState,
  createBenchmarkRenderedState,
  createGraphUsageState,
} from "./experimentGraphInstrumentation";
import { useExperimentGraphDiagnosticEffects } from "./useExperimentGraphDiagnosticEffects";
import {
  useExperimentGraphWorkspaceEffects,
  type GraphInspectorTarget as InspectorTarget,
} from "./useExperimentGraphWorkspaceEffects";
import { useExperimentGraphStatisticsIntent } from "./useExperimentGraphStatisticsIntent";
import { useExperimentGraphAnalysisState } from "./useExperimentGraphAnalysisState";
import { useExperimentGraphStatisticsViewModel } from "./useExperimentGraphStatisticsViewModel";
import { useExperimentGraphStateSnapshot } from "./useExperimentGraphStateSnapshot";
import { useExperimentGraphPresentationState } from "./useExperimentGraphPresentationState";
import { useExperimentGraphDataSelectionState } from "./useExperimentGraphDataSelectionState";
import { useExperimentGraphDerivedData } from "./useExperimentGraphDerivedData";
import { useExperimentGraphUserActions } from "./useExperimentGraphUserActions";
import { useExperimentGraphEvaluationController } from "./useExperimentGraphEvaluationController";
import { analysisTestAnnotationLabel, graphAnnotationContext } from "./experimentGraphAnnotations";
export {
  analysisTestAnnotationLabel,
  repeatedAxisAnnotationLabel,
} from "./experimentGraphAnnotations";
export { serializeVisibleGraphData } from "./experimentGraphDataExport";
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
  const {
    sharedSourceTopology,
    independentNestedSource,
    matchedRelationship,
    relationshipAlreadyDeclared,
  } = createGraphStatisticsRelationshipContext(draft, selectedReadoutId);
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
    addSelectedComparisonAnnotation,
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
  const renderedState = createBenchmarkRenderedState({
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
  const evaluationAnalysisState = createBenchmarkAnalysisState({
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
    renderedState,
    graphType,
    usageGraphState,
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

  const { series, derivedLineageRows, shape, facetGroups, visualSeriesOptions, hasData } =
    useExperimentGraphDerivedData({
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
    });
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
  const {
    recommendationDesign,
    analysisAssessment,
    analysisContextKey,
    varyingStatisticalAttributes,
    hasFactorByTimeStructure,
    analysisScopePresentation,
  } = useExperimentGraphStatisticsViewModel({
    draft,
    cells,
    activeReadoutId,
    sourceMode,
    analysisConditionIds,
    selectedTimePointIds,
    analysisTimePointId,
    timeAnalysis,
    correlationMethod,
    selectedMethod: selectedStatisticalMethod,
    contrastIntent,
    plannedContrastConditionIds,
    axes,
  });
  const evaluationController = useExperimentGraphEvaluationController({
    svgRef,
    draft,
    analysis,
    analysisAssessment,
    methodsText,
    renderedState,
    analysisState: evaluationAnalysisState,
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
    graphType,
    selectedReadoutId,
    selectedConditionIds,
    analysisConditionIds,
    graphState: graphStateSnapshot,
    hasData,
    workspaceMode,
    readoutLabel: readout?.label ?? activeReadoutId,
    activeConditionLabels: activeConditions.map(({ label }) => label),
  });
  const dataTransitions = createExperimentGraphDataTransitions({
    draft,
    locale,
    selectedReadoutId,
    sourceMode,
    timeAnalysis,
    setSelectedReadoutId,
    setSelectedConditionIds,
    setAnalysisConditionIds,
    setSelectedTimePointIds,
    setAnalysisTimePointId,
    setSourceMode,
    setTimeAnalysis,
    setGraphType,
    setLayers,
    setAxes,
    setAnalysis,
    removeConditionFromPlannedContrasts,
  });
  const presentationTransitions = createExperimentGraphPresentationTransitions({
    graphType,
    shape,
    visualSeriesCount: visualSeriesOptions.length,
    appearance,
    timePointCount: draft.time.points.length,
    activeConditionCount: activeConditions.length,
    setGraphType,
    setLayers,
    setAppearance,
  });
  const activeLayerDescription = describeActiveGraphLayers(
    {
      graphType,
      shape,
      layers,
      errorBar: appearance.errorBar,
      timeSampling: draft.time.sampling,
      matched: draft.conditionAssignment.kind === "matched",
      semanticReadiness,
    },
    locale,
  );
  const {
    copyStatus,
    exportFeedback: pngExportFeedback,
    actions: userActions,
  } = useExperimentGraphUserActions({
    getSvg: () => svgRef.current,
    readout,
    draft,
    cells,
    selectedConditionIds,
    selectedTimePointIds,
    series,
    locale,
  });
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
              graphTypeLabel={experimentGraphTypeLabel(graphType, locale)}
              layerDescription={activeLayerDescription}
              graphTitleFontSize={appearance.graphTitleFontSize}
              hasData={hasData}
              copyStatus={copyStatus}
              exportFeedback={pngExportFeedback}
              evaluationStatus={evaluationController.status}
              fitOverview={fitOverview}
              evaluationActionLabel={evaluationController.actionLabel}
              evaluationActionDisabled={evaluationController.actionDisabled}
              onCopy={() => void userActions.copyGraph()}
              onExportSvg={() => void userActions.exportSvg()}
              onExportPng={() => void userActions.exportPng()}
              onExportCsv={() => void userActions.exportCsv()}
              onFinalizeEvaluation={() => void evaluationController.finalize()}
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
              onReadoutChange={dataTransitions.changeReadout}
              onConditionChange={dataTransitions.changeAnalysisCondition}
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
              onReadoutChange={dataTransitions.changeReadout}
              onSourceModeChange={dataTransitions.changeSourceMode}
              onAllTimePointsChange={dataTransitions.changeAllTimePoints}
              onTimePointChange={dataTransitions.changeTimePoint}
              onConditionChange={dataTransitions.changeDisplayedCondition}
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
              onGraphTypeChange={presentationTransitions.changeGraphType}
              onApplyPreset={presentationTransitions.applyPreset}
              setAxes={setAxes}
              setAppearance={setAppearance}
            />
          ) : null}

          <ExperimentGraphLayerInspector
            target={inspectorTarget}
            shape={shape}
            layers={layers}
            appearance={appearance}
            visualSeriesOptions={visualSeriesOptions}
            setLayers={setLayers}
            setAppearance={setAppearance}
          />

          {inspectorTarget === "annotation" && annotationEditorProps ? (
            <ExperimentGraphAnnotationEditor
              {...annotationEditorProps}
              onAddSelectedComparison={addSelectedComparisonAnnotation}
            />
          ) : null}

          {inspectorTarget === "x-axis" || inspectorTarget === "y-axis" ? (
            <ExperimentGraphAxisInspector
              target={inspectorTarget}
              xAxis={{
                axes,
                appearance,
                attributes: draft.attributes,
                hasOrderedAxis: draft.time.points.length > 0,
                groupingXSource: grouping.x.source,
                graphType,
                setAxes,
                setAppearance,
              }}
              yAxis={{
                axes,
                appearance,
                readoutShape: shape,
                setAxes,
                setAppearance,
              }}
            />
          ) : null}

          {inspectorTarget === "statistics" ? (
            <ExperimentGraphStatisticsInspector
              timeAnalysis={
                draft.time.points.length > 1
                  ? {
                      time: draft.time,
                      plan: timeAnalysis,
                      analysisTimePointId,
                      onKindChange: dataTransitions.changeTimeAnalysisKind,
                      onPlanChange: dataTransitions.changeTimeAnalysisPlan,
                      onAnalysisTimePointChange: dataTransitions.changeAnalysisTimePoint,
                    }
                  : null
              }
              scopeNotice={
                analysisScopePresentation.showNotice
                  ? {
                      time: draft.time,
                      plan: timeAnalysis,
                      analysisTimePointId,
                      hasFactorByTimeStructure,
                      varyingFactorLabels: varyingStatisticalAttributes.map(({ label }) => label),
                    }
                  : null
              }
              statisticsPanel={
                analysisScopePresentation.blockStatistics
                  ? null
                  : {
                      assessment: analysisAssessment,
                      design: recommendationDesign,
                      outcomeId: selectedReadoutId,
                      relationshipAlreadyDeclared,
                      independentNestedSourceContext: independentNestedSource,
                      onCorrectionRequested: onAnalysisCorrection,
                      matchedRelationship,
                      analysisRunner,
                      analysisAvailable,
                      initialAnalysis: initialState?.analysis,
                      onAnalysisChange: setAnalysis,
                      methodsText,
                      correlationMethod,
                      onCorrelationMethodChange: (method) =>
                        changeCorrelationMethod(
                          method,
                          analysisAssessment.recommendedMethod ?? method,
                        ),
                      selectedMethod: selectedStatisticalMethod,
                      onSelectedMethodChange: (method) =>
                        changeSelectedMethod(
                          method,
                          analysisAssessment.recommendedMethod ?? method,
                        ),
                      contrastIntent,
                      conditionOptions: activeAnalysisConditions.map(({ id, label }) => ({
                        id,
                        label,
                      })),
                      plannedContrastConditionIds,
                      onPlannedContrastConditionIdsChange: changePlannedContrastConditionIds,
                      onContrastIntentChange: changeContrastIntent,
                      analysisContextKey,
                    }
              }
              annotation={annotationEditorProps}
            />
          ) : null}
        </aside>
      </div>
    </section>
  );
}
