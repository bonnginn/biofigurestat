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
import { localizedText, useAppLocale } from "../app/appLocale";
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
import type { CommonCoverageDraft, SpecializedDraftStore } from "../app/specializedAnalysisDrafts";
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
  restoredSpecializedDrafts?: SpecializedDraftStore;
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
  restoredSpecializedDrafts,
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
  restoredSpecializedDrafts?: SpecializedDraftStore;
}) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const { state } = project;
  const workspace = rehydrateExperimentWorkspace(state);
  if (workspace) {
    return (
      <ExperimentWorkspace
        initialDraft={workspace.draft}
        initialCells={workspace.cells}
        initialGraphs={workspace.graphs}
        initialDataViewMode={workspace.dataViewMode}
        initialCellDisplayTexts={workspace.cellDisplayTexts}
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
    return (
      <p role="alert">
        {t(
          "有効な実験デザインを復元できません。",
          "The active experiment design could not be restored.",
        )}
      </p>
    );
  }
  const matrixView = state.matrixViews?.at(-1);
  if (matrixView?.spec.heatmap) {
    const model = createHeatmapModel(matrixView.rawMatrix, matrixView.spec.heatmap.transform);
    return (
      <div className="page-stack">
        <button type="button" onClick={onBack}>
          {t("← 戻る", "← Back")}
        </button>
        <h1>{state.metadata.projectName}</h1>
        <p>
          {t("保存済みのraw matrixとtransform", "Restored the saved raw matrix and transform")}{" "}
          {matrixView.spec.heatmap.transform} ({matrixView.spec.heatmap.transformVersion})
          {locale === "ja" ? " を復元しました。" : "."}
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
  if (orderedCurveReopen) {
    return (
      <CommonCoveragePage
        mode="nonlinear-fit"
        onBack={onBack}
        saveProject={saveProject}
        initialDraft={restoredSpecializedDrafts?.["nonlinear-fit"] ?? orderedCurveReopen.draft}
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
      return (
        <p role="alert">
          {t(
            "保存済みD17結果に対応するGraph specificationがありません。",
            "No Graph specification corresponds to the saved D17 result.",
          )}
        </p>
      );
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
            {t("← 戻る", "← Back")}
          </button>
          <section className="workspace-panel nonlinear-opened-project">
            <p className="overline">Saved authoritative D17 result</p>
            <h1>{state.metadata.projectName}</h1>
            <p>
              {nonlinearModelLabel(nonlinearModelId)} · ID{" "}
              {nonlinearRun.result.nonlinearFit.modelId} · model version{" "}
              {nonlinearRun.result.nonlinearFit.modelVersion}
            </p>
            <NonlinearFitGraph
              model={model}
              xLabel={`${nonlinearRun.request.xLabel}${nonlinearRun.request.xUnit ? ` (${nonlinearRun.request.xUnit})` : ""}`}
              yLabel={`${nonlinearRun.request.yLabel}${nonlinearRun.request.yUnit ? ` (${nonlinearRun.request.yUnit})` : ""}`}
              seriesLabels={labels}
            />
            <div
              className="nonlinear-fit-results"
              aria-label={t("復元した非線形fit結果", "Restored nonlinear-fit result")}
            >
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
          {actionErrorMessage(
            error,
            t(
              "D17 projectの保存内容を安全に復元できません。元ファイルは変更されていません。",
              "The saved D17 project could not be restored safely. The source file was not changed.",
            ),
            locale,
          )}
        </p>
      );
    }
  }
  const outcome = design.outcomes[0];
  if (!outcome)
    return (
      <p role="alert">
        {t("解析項目を復元できません。", "The analysis outcome could not be restored.")}
      </p>
    );
  if (outcome.type === "time_to_event") {
    if (!state.adaptiveInput) {
      try {
        const savedSurvivalSpec = state.graphs.find(
          ({ state: graphState, spec }) =>
            graphState === "current" && spec.type === "survival_curve",
        )?.spec;
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
              {t("← 戻る", "← Back")}
            </button>
            <p role="alert">
              {t(
                "この旧Survival projectには編集に必要なStructureContract・mapping・raw lineageがありません。別のsupported designには変換せず、読み取り専用で表示します。",
                "This legacy Survival project lacks the StructureContract, mapping, and raw lineage required for editing. It is shown read-only without conversion to another supported design.",
              )}
            </p>
            <SurvivalGraph
              model={model}
              timeLabel={savedSurvivalSpec?.axes.xLabel || outcome.unit || "Follow-up time"}
              probabilityLabel={savedSurvivalSpec?.axes.yLabel || "Survival probability"}
              palette={savedSurvivalSpec?.appearance.palette}
              fontSize={savedSurvivalSpec?.appearance.fontSize}
              legendFontSize={savedSurvivalSpec?.appearance.legendFontSize}
              legendPosition={savedSurvivalSpec?.appearance.legendPosition}
              showMinorTicks={savedSurvivalSpec?.axes.showMinorTicks}
              tickDirection={savedSurvivalSpec?.axes.tickDirection}
            />
          </div>
        );
      } catch (error) {
        return (
          <p role="alert">
            {actionErrorMessage(
              error,
              t(
                "Survival projectの保存内容を安全に復元できません。元ファイルは変更されていません。",
                "The saved Survival project could not be restored safely. The source file was not changed.",
              ),
              locale,
            )}
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
        initialDraft={restoredSpecializedDrafts?.survival}
        onDirtyChange={onDirtyChange}
        onOpenProject={onOpenProject}
        onRequestExit={onRequestExit}
        onRegisterSaveHandler={onRegisterSaveHandler}
      />
    );
  }
  if (locale === "en") {
    return (
      <div className="page-stack">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <section className="workspace-panel" aria-labelledby="legacy-project-language-heading">
          <p className="overline">Legacy project editor</p>
          <h1 id="legacy-project-language-heading">This project uses a legacy data-sheet format</h1>
          <p role="note">
            The project file was opened and validated, but its legacy editor has not been
            translated. Switch the display language to Japanese to edit it. The file and its
            measurements remain unchanged.
          </p>
        </section>
      </div>
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
        throw new Error(
          t(
            "この実験デザインはD03/D04/D05編集画面の対象外です。",
            "This experiment design is not supported by the D03/D04/D05 editor.",
          ),
        );
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
    if (!match.matched)
      throw new Error(
        t(
          "この実験デザインはD01/D02編集画面の対象外です。",
          "This experiment design is not supported by the D01/D02 editor.",
        ),
      );
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
        {actionErrorMessage(
          error,
          t(
            "編集画面を安全に復元できません。元ファイルは変更されていません。",
            "The editor could not be restored safely. The source file was not changed.",
          ),
          locale,
        )}
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
  restoredSpecializedDrafts,
}: OpenProjectPageProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const [status, setStatus] = useState<"idle" | "opening" | "success" | "error">(
    initialError ? "error" : "idle",
  );
  const [message, setMessage] = useState<string | null>(initialError);
  const [openedProject, setOpenedProject] = useState<OpenedProject | null>(null);
  const autoOpenAttempted = useRef(false);

  useEffect(() => {
    if (!initialError) return;
    setStatus("error");
    setMessage(initialError);
  }, [initialError]);

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
          throw new Error(
            t(
              "この環境では、この入力途中projectの表示先がありません。",
              "This environment cannot display this in-progress project.",
            ),
          );
        }
        onAnyProjectOpened(opened);
        setStatus("success");
        setMessage(
          opened.kind === "unresolved_visualization"
            ? t(
                `${opened.project.state.metadata.projectName} を開き、入力表とGraph設定を復元しました。`,
                `Opened ${opened.project.state.metadata.projectName} and restored its data table and Graph settings.`,
              )
            : t(
                `${opened.project.state.metadata.projectName} を開き、入力途中の表と回答を復元しました。`,
                `Opened ${opened.project.state.metadata.projectName} and restored the in-progress table and answers.`,
              ),
        );
        return;
      }
      setOpenedProject(opened.project);
      onProjectOpened?.(opened.project);
      setStatus("success");
      setMessage(
        t(
          `${opened.project.state.metadata.projectName} を開き、整合性を確認しました。`,
          `Opened ${opened.project.state.metadata.projectName} and verified its integrity.`,
        ),
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        actionErrorMessage(
          error,
          t(
            "プロジェクトを開けませんでした。現在のワークスペースは変更されていません。",
            "The project could not be opened. The current workspace was not changed.",
          ),
          locale,
        ),
      );
    }
  }, [locale, onAnyProjectOpened, onProjectOpened, openAnyProject, openProject]);

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
        t(
          `${project.state.metadata.projectName} を開きました。次回の保存で1ファイル形式へ安全に変換します。`,
          `Opened ${project.state.metadata.projectName}. It will be safely converted to the single-file format the next time you save.`,
        ),
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        actionErrorMessage(
          error,
          t(
            "旧形式のprojectフォルダを取り込めませんでした。",
            "The legacy project folder could not be imported.",
          ),
          locale,
        ),
      );
    }
  }, [locale, onProjectOpened, openLegacyProject]);

  useEffect(() => {
    if (!autoOpen || autoOpenAttempted.current || persistedProject || openedProject) return;
    autoOpenAttempted.current = true;
    void handleOpen();
  }, [autoOpen, handleOpen, openedProject, persistedProject]);

  const projectToShow = persistedProject ?? openedProject;
  if (projectToShow) {
    return (
      <PersistedProjectView
        key={projectToShow.target}
        project={projectToShow}
        saveProject={saveProject}
        onBack={() => onNavigate("home")}
        onReuseDesign={onReuseDesign}
        onSaveFavorite={onSaveFavorite}
        onDirtyChange={onDirtyChange}
        onOpenProject={onOpenProject}
        onRequestExit={onRequestExit}
        onRegisterSaveHandler={onRegisterSaveHandler}
        restoredSpecializedDrafts={restoredSpecializedDrafts}
      />
    );
  }

  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={() => onNavigate("home")}>
        <span aria-hidden="true">←</span> {t("ワークスペースに戻る", "Back to workspace")}
      </button>
      <section className="empty-page" aria-labelledby="open-project-heading">
        <span className="empty-icon empty-icon--orange" aria-hidden="true">
          ↥
        </span>
        <p className="overline">{t("ワークスペース", "Workspace")} / 04</p>
        <h1 id="open-project-heading">{t("ローカルプロジェクトを開く", "Open a local project")}</h1>
        <p>
          {t(
            "このコンピューター上のプロジェクトパッケージを選びます。ファイル選択と検証の結果だけを表示します。",
            "Select a project package on this computer. BioFigureStat only displays the result of file selection and validation.",
          )}
        </p>
        <button
          className="primary-button primary-button--ready"
          type="button"
          disabled={status === "opening"}
          onClick={handleOpen}
        >
          {status === "opening"
            ? t("プロジェクトを開いています…", "Opening project…")
            : t("プロジェクトファイルを選ぶ", "Choose project file")}
          <span className="button-note">
            {t("ローカルのデスクトッププロジェクトを開きます", "Open a local desktop project")}
          </span>
        </button>
        {openLegacyProject ? (
          <button
            className="secondary-button"
            type="button"
            disabled={status === "opening"}
            onClick={() => void handleLegacyOpen()}
          >
            {t("旧形式のprojectフォルダを取り込む", "Import legacy project folder")}
          </button>
        ) : null}
        {status === "success" && message && (
          <p className="project-action-message project-action-message--success" role="status">
            {message}
          </p>
        )}
        {status === "error" && message && (
          <p className="project-action-message project-action-message--error" role="alert">
            {message}{" "}
            {t(
              "現在のワークスペースは変更されていません。",
              "The current workspace was not changed.",
            )}
          </p>
        )}
      </section>
    </div>
  );
}
