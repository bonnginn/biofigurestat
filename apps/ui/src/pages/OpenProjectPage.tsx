import { useCallback, useEffect, useRef, useState } from "react";

import {
  recommendD01OrD02,
  recommendD03,
  recommendD04,
  recommendD05,
  recommendD09,
} from "@lsaa/analysis-contracts";
import {
  rehydrateIndependentMultiConditionDataSheet,
  rehydrateRepeatedConditionDataSheet,
  rehydrateTwoConditionDataSheet,
} from "@lsaa/data-sheet";
import {
  createHeatmapModel,
  createKaplanMeierGraphModel,
  createNonlinearFitGraphModel,
} from "@lsaa/graph-spec";

import {
  actionErrorMessage,
  type OpenedAnyProject,
  type OpenedProject,
  type OpenAnyProjectAction,
  type OpenProjectAction,
  type SaveProjectAction,
} from "../app/projectActions";
import type { AppRoute } from "../app/routes";
import type { ExperimentSetDraft } from "../app/experimentDraft";
import { rehydrateExperimentWorkspace } from "../app/experimentWorkspaceProject";
import { DataSheetPage } from "./DataSheetPage";
import { CommonCoveragePage } from "./CommonCoveragePage";
import { ExperimentWorkspace } from "./ExperimentWorkspace";
import { MultiConditionDataSheetPage } from "./MultiConditionDataSheetPage";
import { HeatmapGraph } from "../components/graph/HeatmapGraph";
import { SurvivalGraph } from "../components/graph/SurvivalGraph";
import { NonlinearFitGraph } from "../components/graph/NonlinearFitGraph";
import { generateMethodsText } from "../app/methodsText";
import {
  DEFAULT_NONLINEAR_MODEL_ID,
  nonlinearModelDefinition,
  nonlinearModelLabel,
  nonlinearParameterLabel,
  type NonlinearModelId,
  type NonlinearParameterId,
} from "../app/nonlinearModelRegistry";
import { adaptiveSurvivalPaste } from "../app/adaptiveWorkspace";
import { SpecializedCorePage } from "./SpecializedCorePage";
import type { CommonCoverageDraft } from "../app/specializedAnalysisDrafts";
import type { DedicatedEntryIntent } from "../app/dedicatedEntryIntent";
import type {
  AxisMaterialRelationship,
  AxisPointParentRelationship,
  OrderedAxisMeaning,
  OrderedCurveSeriesMeaning,
  OrderedCurveSeriesParentRelationship,
} from "@lsaa/adaptive-input";
import type { RegisterWorkspaceSaveHandler, RequestWorkspaceExit } from "../app/workspaceLifecycle";

type OpenProjectPageProps = {
  onNavigate: (route: AppRoute) => void;
  openProject: OpenProjectAction;
  openAnyProject?: OpenAnyProjectAction;
  openLegacyProject?: OpenProjectAction;
  persistedProject?: OpenedProject | null;
  onProjectOpened?: (project: OpenedProject) => void;
  onAnyProjectOpened?: (project: OpenedAnyProject) => void;
  saveProject?: SaveProjectAction;
  onReuseDesign?: (draft: ExperimentSetDraft) => void;
  onSaveFavorite?: Parameters<typeof ExperimentWorkspace>[0]["onSaveFavorite"];
  autoOpen?: boolean;
  initialError?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onOpenProject?: () => void;
  onRequestExit?: RequestWorkspaceExit;
  onRegisterSaveHandler?: RegisterWorkspaceSaveHandler;
};

function orderedCurveReopenState(
  state: OpenedProject["state"],
): Readonly<{ draft: CommonCoverageDraft; entryIntent: DedicatedEntryIntent }> | null {
  const snapshot = state.adaptiveInput;
  if (!snapshot) return null;
  const axisMeaning = snapshot.targetedConfirmations.find(
    ({ key }) => key === "ordered_axis_meaning",
  )?.answer as OrderedAxisMeaning | undefined;
  const materialRelationship = snapshot.targetedConfirmations.find(
    ({ key }) => key === "axis_material_relationship",
  )?.answer as AxisMaterialRelationship | undefined;
  const pointParentRelationship = snapshot.targetedConfirmations.find(
    ({ key }) => key === "axis_point_parent_relationship",
  )?.answer as AxisPointParentRelationship | undefined;
  const seriesMeaning = snapshot.targetedConfirmations.find(
    ({ key }) => key === "ordered_curve_series_meaning",
  )?.answer as OrderedCurveSeriesMeaning | undefined;
  const seriesParentRelationship = snapshot.targetedConfirmations.find(
    ({ key }) => key === "ordered_curve_series_parent_relationship",
  )?.answer as OrderedCurveSeriesParentRelationship | undefined;
  if (!axisMeaning || !materialRelationship) return null;
  const contract = snapshot.contract;
  const axis = contract.orderedAxes[0];
  const readout = contract.readouts[0];
  const unitLevel = contract.unitLevels.find(
    ({ key }) => key === contract.experimentalUnitLevelKey,
  );
  if (!axis || !readout || !unitLevel) return null;

  const nonlinearRun = state.analysisRuns.find(
    ({ state: runState, request }) =>
      runState === "current" && request.protocolVersion === "0.14.0",
  );
  const request = nonlinearRun?.request.protocolVersion === "0.14.0" ? nonlinearRun.request : null;
  const modelId = (request?.modelId ?? DEFAULT_NONLINEAR_MODEL_ID) as NonlinearModelId;
  const firstSeriesId = request?.seriesIds[0];
  const firstInitial = firstSeriesId ? request?.initialValues[firstSeriesId] : undefined;
  const firstBounds = firstSeriesId ? request?.bounds[firstSeriesId] : undefined;
  const parameterIds: readonly NonlinearParameterId[] = [
    "baseline",
    "plateau",
    "rate",
    "vmax",
    "km",
  ];
  const fitSettings = Object.fromEntries(
    parameterIds.map((parameter) => {
      const bounds = firstBounds?.[parameter];
      return [
        parameter,
        {
          initial: firstInitial?.[parameter] === undefined ? "" : String(firstInitial[parameter]),
          lower: bounds?.lower === undefined ? "" : String(bounds.lower),
          upper: bounds?.upper === undefined ? "" : String(bounds.upper),
        },
      ];
    }),
  ) as CommonCoverageDraft["fitSettings"];
  const readoutUnitDecision = state.designRevisions
    .find(({ id }) => id === state.activeDesignRevisionId)
    ?.design.wizardDecisions.find(
      ({ questionId }) => questionId === "ordered-curve.readout-unit",
    )?.answer;
  const entryModuleFacts = {
    orderedAxisMeaning: axisMeaning,
    axisMaterialRelationship: materialRelationship,
    ...(pointParentRelationship ? { axisPointParentRelationship: pointParentRelationship } : {}),
    ...(seriesMeaning ? { orderedCurveSeriesMeaning: seriesMeaning } : {}),
    ...(seriesParentRelationship
      ? { orderedCurveSeriesParentRelationship: seriesParentRelationship }
      : {}),
    orderedCurveSeriesCount: contract.factors[0]?.levels.length ?? 0,
    orderedAxisCount: contract.orderedAxes.length,
  };
  return {
    draft: {
      text: snapshot.rawLineage?.rawText ?? "",
      contingencyMethod: "fisher_exact",
      display: "count",
      includeIntercept: true,
      xLabel: axis.label,
      yLabel: readout.label,
      xUnit: axis.unit,
      yUnit: request?.yUnit ?? (typeof readoutUnitDecision === "string" ? readoutUnitDecision : ""),
      xScale: "linear",
      yScale: "linear",
      showBand: true,
      distributionType: "histogram",
      binCount: "",
      nonlinearModel: modelId,
      nonlinearModelExplicitlySelected: Boolean(request),
      modelRationale:
        request?.modelSelectionRationale ?? nonlinearModelDefinition(modelId).defaultRationale,
      fitSettings,
      entryModuleFacts,
    },
    entryIntent: {
      schemaVersion: "0.1.0",
      moduleId: "ordered_curve_kinetics",
      destination: "nonlinear-fit",
      sourceContext: "general_assay",
      entryRouteId: "reopened-adaptive-ordered-curve",
      experimentName: contract.experimentName,
      experimentDescription: contract.experimentDescription,
      subjectUnitLabel: unitLevel.label,
      facts: entryModuleFacts,
    },
  };
}

function PersistedProjectView({
  project,
  saveProject,
  onBack,
  onReuseDesign,
  onSaveFavorite,
  onDirtyChange,
  onOpenProject,
  onRequestExit,
  onRegisterSaveHandler,
}: {
  project: OpenedProject;
  saveProject?: SaveProjectAction;
  onBack: () => void;
  onReuseDesign?: (draft: ExperimentSetDraft) => void;
  onSaveFavorite?: Parameters<typeof ExperimentWorkspace>[0]["onSaveFavorite"];
  onDirtyChange?: (dirty: boolean) => void;
  onOpenProject?: () => void;
  onRequestExit?: RequestWorkspaceExit;
  onRegisterSaveHandler?: RegisterWorkspaceSaveHandler;
}) {
  const { state } = project;
  const [editingOrderedCurve, setEditingOrderedCurve] = useState(false);
  const workspace = rehydrateExperimentWorkspace(state);
  if (workspace) {
    return (
      <ExperimentWorkspace
        initialDraft={workspace.draft}
        initialCells={workspace.cells}
        initialGraphs={workspace.graphs}
        initialDataViewMode={workspace.dataViewMode}
        initialProject={project}
        saveProject={saveProject}
        onBack={onBack}
        onReuseDesign={onReuseDesign}
        onSaveFavorite={onSaveFavorite}
        onDirtyChange={onDirtyChange}
        onOpenProject={onOpenProject}
        onRequestExit={onRequestExit}
        onRegisterSaveHandler={onRegisterSaveHandler}
      />
    );
  }
  const design = state.designRevisions.find(
    (revision) => revision.id === state.activeDesignRevisionId,
  )?.design;
  if (!design) {
    return <p role="alert">有効な実験デザインを復元できません。</p>;
  }
  const matrixView = state.matrixViews?.at(-1);
  if (matrixView?.spec.heatmap) {
    const model = createHeatmapModel(matrixView.rawMatrix, matrixView.spec.heatmap.transform);
    return (
      <div className="page-stack">
        <button type="button" onClick={onBack}>
          ← 戻る
        </button>
        <h1>{state.metadata.projectName}</h1>
        <p>
          保存済みのraw matrixとtransform {matrixView.spec.heatmap.transform} (
          {matrixView.spec.heatmap.transformVersion}) を復元しました。
        </p>
        <HeatmapGraph
          model={model}
          min={matrixView.spec.heatmap.min}
          max={matrixView.spec.heatmap.max}
          missingColor={matrixView.spec.heatmap.missingColor}
          showCellValues={matrixView.spec.heatmap.showCellValues}
        />
      </div>
    );
  }
  const orderedCurveReopen = orderedCurveReopenState(state);
  const nonlinearRun = state.analysisRuns.find(
    (analysis) =>
      analysis.state === "current" &&
      analysis.request.protocolVersion === "0.14.0" &&
      analysis.result.status === "ok" &&
      analysis.result.nonlinearFit,
  );
  if (orderedCurveReopen && (!nonlinearRun || editingOrderedCurve)) {
    return (
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={() => {
          if (nonlinearRun) setEditingOrderedCurve(false);
          else onBack();
        }}
        saveProject={saveProject}
        initialDraft={orderedCurveReopen.draft}
        entryIntent={orderedCurveReopen.entryIntent}
        initialProject={project}
        onDirtyChange={onDirtyChange}
        onOpenProject={onOpenProject}
        onRequestExit={onRequestExit}
        onRegisterSaveHandler={onRegisterSaveHandler}
      />
    );
  }
  if (nonlinearRun?.request.protocolVersion === "0.14.0" && nonlinearRun.result.nonlinearFit) {
    const nonlinearModelId = nonlinearRun.request.modelId as NonlinearModelId;
    const graphRecord = state.graphs.find(
      (graph) =>
        graph.state === "current" &&
        graph.sourceAnalysisRunId === nonlinearRun.id &&
        graph.spec.type === "nonlinear_xy",
    );
    if (!graphRecord) {
      return <p role="alert">保存済みD17結果に対応するGraph specificationがありません。</p>;
    }
    try {
      const labels = Object.fromEntries(
        design.conditions.map((condition) => [condition.id, condition.label]),
      );
      const model = createNonlinearFitGraphModel(
        graphRecord.spec,
        nonlinearRun.request.points,
        nonlinearRun.result,
      );
      const methods = generateMethodsText({
        design,
        recommendation: nonlinearRun.recommendation,
        request: nonlinearRun.request,
        result: nonlinearRun.result,
        graphSpec: graphRecord.spec,
        outcomeId: design.outcomes[0]?.id,
      });
      return (
        <div className="page-stack">
          <button type="button" onClick={onBack}>
            ← 戻る
          </button>
          <section className="workspace-panel nonlinear-opened-project">
            <p className="overline">Saved authoritative D17 result</p>
            <h1>{state.metadata.projectName}</h1>
            <p>
              {nonlinearModelLabel(nonlinearModelId)} · ID{" "}
              {nonlinearRun.result.nonlinearFit.modelId} · model version{" "}
              {nonlinearRun.result.nonlinearFit.modelVersion}
            </p>
            {orderedCurveReopen ? (
              <button type="button" onClick={() => setEditingOrderedCurve(true)}>
                入力を編集して再解析
              </button>
            ) : null}
            <NonlinearFitGraph
              model={model}
              xLabel={`${nonlinearRun.request.xLabel}${nonlinearRun.request.xUnit ? ` (${nonlinearRun.request.xUnit})` : ""}`}
              yLabel={`${nonlinearRun.request.yLabel}${nonlinearRun.request.yUnit ? ` (${nonlinearRun.request.yUnit})` : ""}`}
              seriesLabels={labels}
            />
            <div className="nonlinear-fit-results" aria-label="復元した非線形fit結果">
              {nonlinearRun.result.nonlinearFit.series.map((seriesFit) => (
                <section key={seriesFit.seriesId} className="nonlinear-fit-series-result">
                  <h2>{labels[seriesFit.seriesId] ?? seriesFit.seriesId}</h2>
                  <p>
                    {seriesFit.parameters
                      .map(
                        (parameter) =>
                          `${nonlinearParameterLabel(nonlinearModelId, parameter.name)}=${parameter.value.toPrecision(5)}`,
                      )
                      .join(" · ")}
                  </p>
                  <p>
                    R²={seriesFit.diagnostics.rSquared.toPrecision(4)} · RMSE=
                    {seriesFit.diagnostics.rmse.toPrecision(4)} · AIC=
                    {seriesFit.diagnostics.aic.toPrecision(5)}
                  </p>
                </section>
              ))}
            </div>
            <details>
              <summary>Methods / provenance</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{methods}</pre>
            </details>
          </section>
        </div>
      );
    } catch (error) {
      return (
        <p role="alert">
          D17 projectを復元できません：{error instanceof Error ? error.message : "不明なエラー"}
        </p>
      );
    }
  }
  const outcome = design.outcomes[0];
  if (!outcome) return <p role="alert">解析項目を復元できません。</p>;
  if (outcome.type === "time_to_event") {
    if (!state.adaptiveInput) {
      try {
        const model = createKaplanMeierGraphModel(
          design.conditions,
          state.observations
            .filter(
              (observation) =>
                observation.rawRevisionId === state.activeRawRevisionId &&
                observation.outcomeId === outcome.id,
            )
            .map((observation) => {
              if (observation.measurement.kind !== "time_to_event")
                throw new Error("Survival project contains a non-survival measurement");
              return {
                observationId: observation.id,
                experimentalUnitId: observation.unitInstanceId,
                conditionId: observation.conditionId,
                followUpTime: observation.measurement.followUpTime,
                eventObserved: observation.measurement.eventObserved,
              };
            }),
        );
        return (
          <div className="page-stack">
            <button type="button" onClick={onBack}>
              ← 戻る
            </button>
            <p role="alert">
              この旧Survival projectには編集に必要なStructureContract・mapping・raw
              lineageがありません。別のsupported designには変換せず、読み取り専用で表示します。
            </p>
            <SurvivalGraph model={model} timeLabel={outcome.unit ?? "Follow-up time"} />
          </div>
        );
      } catch (error) {
        return (
          <p role="alert">
            Survival projectを復元できません：
            {error instanceof Error ? error.message : "不明なエラー"}
          </p>
        );
      }
    }
    return (
      <SpecializedCorePage
        mode="survival"
        onBack={onBack}
        saveProject={saveProject}
        initialProject={project}
        initialText={
          state.adaptiveInput.rawLineage?.rawText ?? adaptiveSurvivalPaste(state.adaptiveInput)
        }
        adaptiveInput={state.adaptiveInput}
        onDirtyChange={onDirtyChange}
        onOpenProject={onOpenProject}
        onRequestExit={onRequestExit}
        onRegisterSaveHandler={onRegisterSaveHandler}
      />
    );
  }
  const activeDerivedRevision = state.derivedDatasetRevisions.find(
    (revision) =>
      revision.sourceRawRevisionId === state.activeRawRevisionId &&
      revision.outcomeId === outcome.id &&
      revision.state === "current",
  );
  const editableObservations = activeDerivedRevision
    ? state.derivedValues
        .filter((value) => value.derivedDatasetRevisionId === activeDerivedRevision.id)
        .map((value) => ({
          ...(() => {
            const sourceDates = new Set(
              state.observations
                .filter(
                  (observation) =>
                    observation.rawRevisionId === state.activeRawRevisionId &&
                    value.sourceObservationIds.includes(observation.id),
                )
                .map((observation) => observation.experimentDate)
                .filter((date): date is string => typeof date === "string"),
            );
            return sourceDates.size === 1 ? { experimentDate: [...sourceDates][0] } : {};
          })(),
          id: value.id,
          rawRevisionId: state.activeRawRevisionId,
          unitInstanceId: value.experimentalUnitId,
          conditionId: value.conditionId,
          outcomeId: value.outcomeId,
          measurement: { kind: "scalar" as const, value: value.value },
          sourceLocation: `derived:${activeDerivedRevision.id}`,
        }))
    : state.observations;
  try {
    if (design.conditions.length >= 3) {
      const multiMatch =
        design.factors.length === 2
          ? recommendD05(design)
          : design.pairing.kind === "independent"
            ? recommendD03(design)
            : recommendD04(design);
      if (!multiMatch.matched)
        throw new Error("この実験デザインはD03/D04/D05編集画面の対象外です。");
      const multiSheet =
        design.pairing.kind === "independent"
          ? rehydrateIndependentMultiConditionDataSheet(
              design,
              outcome.id,
              state.activeRawRevisionId,
              state.unitInstances,
              editableObservations,
              state.metadata.experimentDate,
            )
          : rehydrateRepeatedConditionDataSheet(
              design,
              outcome.id,
              state.activeRawRevisionId,
              state.unitInstances,
              editableObservations,
              state.metadata.experimentDate,
            );
      return (
        <MultiConditionDataSheetPage
          design={design}
          recommendation={multiMatch.recommendation}
          sheet={multiSheet}
          outcomeLabel={outcome.label}
          saveProject={saveProject}
          initialProject={project}
          onBack={onBack}
          onDirtyChange={onDirtyChange}
          onRequestExit={onRequestExit}
          onRegisterSaveHandler={onRegisterSaveHandler}
        />
      );
    }
    // D09 projects persist the relationship-form decision in the design. Keep
    // the normal two-condition D01/D02 route for all other projects.
    const isCorrelation = design.wizardDecisions.some(
      (decision) => decision.questionId === "correlation.relationship_form",
    );
    const match = isCorrelation ? recommendD09(design) : recommendD01OrD02(design);
    if (!match.matched) throw new Error("この実験デザインはD01/D02編集画面の対象外です。");
    const sheet = rehydrateTwoConditionDataSheet(
      design,
      outcome.id,
      state.activeRawRevisionId,
      state.unitInstances,
      editableObservations,
      state.metadata.experimentDate,
    );
    return (
      <DataSheetPage
        design={design}
        recommendation={match.recommendation}
        sheet={sheet}
        outcomeLabel={outcome.label}
        saveProject={saveProject}
        initialProject={project}
        onBack={onBack}
        onDirtyChange={onDirtyChange}
        onRequestExit={onRequestExit}
        onRegisterSaveHandler={onRegisterSaveHandler}
      />
    );
  } catch (error) {
    return (
      <p role="alert">
        編集画面を復元できません：
        {error instanceof Error ? error.message : "不明なエラー"}
      </p>
    );
  }
}

export function OpenProjectPage({
  onNavigate,
  openProject,
  openAnyProject,
  openLegacyProject,
  persistedProject,
  onProjectOpened,
  onAnyProjectOpened,
  saveProject,
  onReuseDesign,
  onSaveFavorite,
  autoOpen = false,
  initialError = null,
  onDirtyChange,
  onOpenProject,
  onRequestExit,
  onRegisterSaveHandler,
}: OpenProjectPageProps) {
  const [status, setStatus] = useState<"idle" | "opening" | "success" | "error">(
    initialError ? "error" : "idle",
  );
  const [message, setMessage] = useState<string | null>(initialError);
  const [openedProject, setOpenedProject] = useState<OpenedProject | null>(null);
  const autoOpenAttempted = useRef(false);

  const handleOpen = useCallback(async () => {
    setStatus("opening");
    setMessage(null);
    try {
      let opened: OpenedAnyProject | null;
      if (openAnyProject) {
        opened = await openAnyProject();
      } else {
        const project = await openProject();
        opened = project ? { kind: "experiment", project } : null;
      }
      if (opened === null) {
        setStatus("idle");
        return;
      }
      if (opened.kind !== "experiment") {
        if (!onAnyProjectOpened) {
          throw new Error("この環境では、この入力途中projectの表示先がありません。");
        }
        onAnyProjectOpened(opened);
        setStatus("success");
        setMessage(
          opened.kind === "unresolved_visualization"
            ? `${opened.project.state.metadata.projectName} を開き、入力表とGraph設定を復元しました。`
            : `${opened.project.state.metadata.projectName} を開き、入力途中の表と回答を復元しました。`,
        );
        return;
      }
      setOpenedProject(opened.project);
      onProjectOpened?.(opened.project);
      setStatus("success");
      setMessage(`${opened.project.state.metadata.projectName} を開き、整合性を確認しました。`);
    } catch (error) {
      setStatus("error");
      setMessage(
        actionErrorMessage(
          error,
          "プロジェクトを開けませんでした。現在のワークスペースは変更されていません。",
        ),
      );
    }
  }, [onAnyProjectOpened, onProjectOpened, openAnyProject, openProject]);

  const handleLegacyOpen = useCallback(async () => {
    if (!openLegacyProject) return;
    setStatus("opening");
    setMessage(null);
    try {
      const project = await openLegacyProject();
      if (project === null) {
        setStatus("idle");
        return;
      }
      setOpenedProject(project);
      onProjectOpened?.(project);
      setStatus("success");
      setMessage(
        `${project.state.metadata.projectName} を開きました。次回の保存で1ファイル形式へ安全に変換します。`,
      );
    } catch (error) {
      setStatus("error");
      setMessage(actionErrorMessage(error, "旧形式のprojectフォルダを取り込めませんでした。"));
    }
  }, [onProjectOpened, openLegacyProject]);

  useEffect(() => {
    if (!autoOpen || autoOpenAttempted.current || persistedProject || openedProject) return;
    autoOpenAttempted.current = true;
    void handleOpen();
  }, [autoOpen, handleOpen, openedProject, persistedProject]);

  const projectToShow = persistedProject ?? openedProject;
  if (projectToShow) {
    return (
      <PersistedProjectView
        project={projectToShow}
        saveProject={saveProject}
        onBack={() => onNavigate("home")}
        onReuseDesign={onReuseDesign}
        onSaveFavorite={onSaveFavorite}
        onDirtyChange={onDirtyChange}
        onOpenProject={onOpenProject}
        onRequestExit={onRequestExit}
        onRegisterSaveHandler={onRegisterSaveHandler}
      />
    );
  }

  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={() => onNavigate("home")}>
        <span aria-hidden="true">←</span> ワークスペースに戻る
      </button>
      <section className="empty-page" aria-labelledby="open-project-heading">
        <span className="empty-icon empty-icon--orange" aria-hidden="true">
          ↥
        </span>
        <p className="overline">ワークスペース / 04</p>
        <h1 id="open-project-heading">ローカルプロジェクトを開く</h1>
        <p>
          このコンピューター上のプロジェクトパッケージを選びます。ファイル選択と検証の結果だけを表示します。
        </p>
        <button
          className="primary-button primary-button--ready"
          type="button"
          disabled={status === "opening"}
          onClick={handleOpen}
        >
          {status === "opening" ? "プロジェクトを開いています…" : "プロジェクトファイルを選ぶ"}
          <span className="button-note">ローカルのデスクトッププロジェクトを開きます</span>
        </button>
        {openLegacyProject ? (
          <button
            className="secondary-button"
            type="button"
            disabled={status === "opening"}
            onClick={() => void handleLegacyOpen()}
          >
            旧形式のprojectフォルダを取り込む
          </button>
        ) : null}
        {status === "success" && message && (
          <p className="project-action-message project-action-message--success" role="status">
            {message}
          </p>
        )}
        {status === "error" && message && (
          <p className="project-action-message project-action-message--error" role="alert">
            {message} 現在のワークスペースは変更されていません。
          </p>
        )}
      </section>
    </div>
  );
}
