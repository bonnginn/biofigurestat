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
  type OpenedProject,
  type OpenProjectAction,
  type SaveProjectAction,
} from "../app/projectActions";
import type { AppRoute } from "../app/routes";
import type { ExperimentSetDraft } from "../app/experimentDraft";
import { rehydrateExperimentWorkspace } from "../app/experimentWorkspaceProject";
import { DataSheetPage } from "./DataSheetPage";
import { ExperimentWorkspace } from "./ExperimentWorkspace";
import { MultiConditionDataSheetPage } from "./MultiConditionDataSheetPage";
import { HeatmapGraph } from "../components/graph/HeatmapGraph";
import { SurvivalGraph } from "../components/graph/SurvivalGraph";
import { NonlinearFitGraph } from "../components/graph/NonlinearFitGraph";
import { generateMethodsText } from "../app/methodsText";
import { adaptiveSurvivalPaste } from "../app/adaptiveWorkspace";
import { SpecializedCorePage } from "./SpecializedCorePage";

type OpenProjectPageProps = {
  onNavigate: (route: AppRoute) => void;
  openProject: OpenProjectAction;
  openLegacyProject?: OpenProjectAction;
  persistedProject?: OpenedProject | null;
  onProjectOpened?: (project: OpenedProject) => void;
  saveProject?: SaveProjectAction;
  onReuseDesign?: (draft: ExperimentSetDraft) => void;
  onSaveFavorite?: Parameters<typeof ExperimentWorkspace>[0]["onSaveFavorite"];
  autoOpen?: boolean;
  initialError?: string | null;
};

function PersistedProjectView({
  project,
  saveProject,
  onBack,
  onReuseDesign,
  onSaveFavorite,
}: {
  project: OpenedProject;
  saveProject?: SaveProjectAction;
  onBack: () => void;
  onReuseDesign?: (draft: ExperimentSetDraft) => void;
  onSaveFavorite?: Parameters<typeof ExperimentWorkspace>[0]["onSaveFavorite"];
}) {
  const { state } = project;
  const workspace = rehydrateExperimentWorkspace(state);
  if (workspace) {
    return (
      <ExperimentWorkspace
        initialDraft={workspace.draft}
        initialCells={workspace.cells}
        initialGraphs={workspace.graphs}
        initialProject={project}
        saveProject={saveProject}
        onBack={onBack}
        onReuseDesign={onReuseDesign}
        onSaveFavorite={onSaveFavorite}
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
  const nonlinearRun = state.analysisRuns.find(
    (analysis) =>
      analysis.state === "current" &&
      analysis.request.protocolVersion === "0.14.0" &&
      analysis.result.status === "ok" &&
      analysis.result.nonlinearFit,
  );
  if (nonlinearRun?.request.protocolVersion === "0.14.0" && nonlinearRun.result.nonlinearFit) {
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
              {nonlinearRun.result.nonlinearFit.modelId} · model version{" "}
              {nonlinearRun.result.nonlinearFit.modelVersion}
            </p>
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
                      .map((parameter) => `${parameter.name}=${parameter.value.toPrecision(5)}`)
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
            .filter((observation) => observation.rawRevisionId === state.activeRawRevisionId && observation.outcomeId === outcome.id)
            .map((observation) => {
              if (observation.measurement.kind !== "time_to_event") throw new Error("Survival project contains a non-survival measurement");
              return { observationId: observation.id, experimentalUnitId: observation.unitInstanceId, conditionId: observation.conditionId, followUpTime: observation.measurement.followUpTime, eventObserved: observation.measurement.eventObserved };
            }),
        );
        return (
          <div className="page-stack">
            <button type="button" onClick={onBack}>← 戻る</button>
            <p role="alert">この旧Survival projectには編集に必要なStructureContract・mapping・raw lineageがありません。別のsupported designには変換せず、読み取り専用で表示します。</p>
            <SurvivalGraph model={model} timeLabel={outcome.unit ?? "Follow-up time"} />
          </div>
        );
      } catch (error) {
        return <p role="alert">Survival projectを復元できません：{error instanceof Error ? error.message : "不明なエラー"}</p>;
      }
    }
    return (
      <SpecializedCorePage
        mode="survival"
        onBack={onBack}
        saveProject={saveProject}
        initialProject={project}
        initialText={adaptiveSurvivalPaste(state.adaptiveInput)}
        adaptiveInput={state.adaptiveInput}
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
  openLegacyProject,
  persistedProject,
  onProjectOpened,
  saveProject,
  onReuseDesign,
  onSaveFavorite,
  autoOpen = false,
  initialError = null,
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
      const project = await openProject();
      if (project === null) {
        setStatus("idle");
        return;
      }
      setOpenedProject(project);
      onProjectOpened?.(project);
      setStatus("success");
      setMessage(`${project.state.metadata.projectName} を開き、整合性を確認しました。`);
    } catch (error) {
      setStatus("error");
      setMessage(
        actionErrorMessage(
          error,
          "プロジェクトを開けませんでした。現在のワークスペースは変更されていません。",
        ),
      );
    }
  }, [onProjectOpened, openProject]);

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
