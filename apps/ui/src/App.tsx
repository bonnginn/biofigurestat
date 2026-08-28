import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OpenedProject } from "./app/projectActions";
import { listen } from "@tauri-apps/api/event";

import { AppShell } from "./components/AppShell";
import { CollectionPage } from "./pages/CollectionPage";
import { HomePage } from "./pages/HomePage";
import { NewExperimentPage } from "./pages/NewExperimentPage";
import { OpenProjectPage } from "./pages/OpenProjectPage";
import { SpecializedCorePage } from "./pages/SpecializedCorePage";
import { CommonCoveragePage } from "./pages/CommonCoveragePage";
import { defaultProjectActions } from "./app/desktopProjectActions";
import type { ProjectActions } from "./app/projectActions";
import { pathForRoute, routeFromPath, type AppRoute } from "./app/routes";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { reuseExperimentDesign, type ExperimentSetDraft } from "./app/experimentDraft";
import {
  loadFavoriteDesigns,
  removeFavoriteDesign,
  saveFavoriteDesign,
  type FavoriteDesign,
  type FavoriteGraphDefault,
} from "./app/favoriteDesigns";
import {
  loadRecentProjects,
  rememberRecentProject,
  removeRecentProject,
  type RecentProject,
} from "./app/recentProjects";
import { evaluationModeIsConfigured, evaluationMode } from "./app/evaluationMode";
import { recordBenchmarkEvent } from "./app/benchmarkEvaluation";
import { recordDiagnosticError, recordDiagnosticEvent } from "./app/diagnostics";
import { researcherError } from "./app/errorCatalog";
import type { LiteratureExperimenterCase } from "./app/literatureBenchmark";
import type { AdaptiveInputSnapshot } from "@lsaa/domain";
import {
  scopedSpecializedDraft,
  type SpecializedAnalysisRoute,
  type SpecializedDraftByRoute,
  type SpecializedDraftStore,
} from "./app/specializedAnalysisDrafts";
import {
  dedicatedEntryHistoryState,
  dedicatedEntryIntentForRoute,
  dedicatedEntryIntentFromHistoryState,
  type DedicatedEntryIntent,
} from "./app/dedicatedEntryIntent";

type AppProps = {
  projectActions?: ProjectActions;
};

const PROJECT_IO_STAGE_LABELS: Record<string, string> = {
  checksum: "checksum検証",
  database_encode: "project database作成",
  container_begin: "保存先の準備",
  container_write: "project dataの書き込み",
  container_commit: "保存fileの確定",
  package_assembly: "project packageの組み立て",
};

export function projectIoStage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/PROJECT_IO_STAGE\[([^\]]+)\]/)?.[1] ?? null;
}

const browserPreviewProjectActions: ProjectActions = {
  openProject: async () => {
    throw new Error("ブラウザUXプレビューではローカルプロジェクトを開けません。");
  },
  saveProject: async () => {
    throw new Error("ブラウザUXプレビューではプロジェクトを保存できません。");
  },
};

function UnresolvedVisualizationPersistenceStop({ onBack }: Readonly<{ onBack: () => void }>) {
  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> 新しい実験へ戻る
      </button>
      <section className="empty-page" aria-labelledby="visualization-persistence-stop-heading">
        <span className="empty-icon empty-icon--orange" aria-hidden="true">
          !
        </span>
        <p className="overline">入力を開始する前に停止しました</p>
        <h1 id="visualization-persistence-stop-heading">Heatmapを開始できません</h1>
        <p role="alert">
          行列とGraphを保存・再開する接続がそろっていません。データ入力後に保存できない状態を避けるため、この環境では入力面を開きません。
        </p>
        <button className="primary-button" type="button" onClick={onBack}>
          入口へ戻る
        </button>
      </section>
    </div>
  );
}

export default function App({ projectActions }: AppProps) {
  const browserPreview = projectActions === undefined && !isTauri();
  const evaluationPreview =
    import.meta.env.DEV && browserPreview && evaluationModeIsConfigured(evaluationMode);
  const activeProjectActions =
    projectActions ?? (browserPreview ? browserPreviewProjectActions : defaultProjectActions);
  const unresolvedVisualizationPersistence =
    !browserPreview &&
    activeProjectActions.saveUnresolvedVisualizationProject &&
    activeProjectActions.openUnresolvedVisualizationProject
      ? {
          save: activeProjectActions.saveUnresolvedVisualizationProject,
          open: activeProjectActions.openUnresolvedVisualizationProject,
        }
      : null;
  const [route, setRoute] = useState<AppRoute>(() => routeFromPath(window.location.pathname));
  const [activeProject, setActiveProject] = useState<OpenedProject | null>(null);
  const [systemOpenError, setSystemOpenError] = useState<string | null>(null);
  const [reusedDraft, setReusedDraft] = useState<ExperimentSetDraft | null>(null);
  const [favoriteDefaults, setFavoriteDefaults] = useState<readonly FavoriteGraphDefault[]>([]);
  const [favorites, setFavorites] = useState<FavoriteDesign[]>(loadFavoriteDesigns);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(loadRecentProjects);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const specializedDrafts = useRef<SpecializedDraftStore>({});
  const [newExperimentSession, setNewExperimentSession] = useState(0);
  const [adaptiveSurvivalHandoff, setAdaptiveSurvivalHandoff] = useState<{
    text: string;
    snapshot: AdaptiveInputSnapshot;
  } | null>(null);
  const [dedicatedEntryIntent, setDedicatedEntryIntent] = useState<DedicatedEntryIntent | null>(
    () => dedicatedEntryIntentFromHistoryState(window.history.state, route),
  );
  const analysisAvailable = !browserPreview || evaluationPreview;

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [route, newExperimentSession]);

  useEffect(() => {
    setDedicatedEntryIntent((current) => dedicatedEntryIntentForRoute(current, route));
    if (route !== "survival") setAdaptiveSurvivalHandoff(null);
  }, [route]);

  const recordRecentProject = useCallback((project: OpenedProject) => {
    setRecentProjects(
      rememberRecentProject({
        target: project.target,
        name: project.state.metadata.projectName,
      }),
    );
  }, []);

  const saveProject = useCallback<NonNullable<ProjectActions["saveProject"]>>(
    async (request, existingTarget) => {
      if (!activeProjectActions.saveProject) return null;
      try {
        const saved = await activeProjectActions.saveProject(request, existingTarget);
        if (saved) {
          recordRecentProject(saved);
          recordDiagnosticEvent("project_saved", { state: "success" });
        }
        return saved;
      } catch (error) {
        recordDiagnosticError("PROJECT_SAVE_FAILED", error);
        const failureStage = projectIoStage(error);
        recordDiagnosticEvent("project_save_failed", { stage: failureStage ?? "unknown" });
        const message = researcherError("PROJECT_SAVE_FAILED");
        const stageMessage = failureStage
          ? `失敗した処理：${PROJECT_IO_STAGE_LABELS[failureStage] ?? failureStage}。`
          : "";
        throw new Error(
          `${message.title}（${message.code}）。${stageMessage}${message.nextAction}`,
          {
            cause: error,
          },
        );
      }
    },
    [activeProjectActions, recordRecentProject],
  );

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const nextRoute = routeFromPath(window.location.pathname);
      setDedicatedEntryIntent(dedicatedEntryIntentFromHistoryState(event.state, nextRoute));
      setRoute(nextRoute);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute, historyState: unknown = {}) => {
    recordBenchmarkEvent("route_changed", {
      from: routeFromPath(window.location.pathname),
      to: nextRoute,
    });
    const nextPath = pathForRoute(nextRoute);
    const adaptiveQuery = new URLSearchParams(window.location.search).get("adaptiveInput");
    const nextUrl = adaptiveQuery === "1" ? `${nextPath}?adaptiveInput=1` : nextPath;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.pushState(historyState, "", nextUrl);
    }
    setRoute(nextRoute);
    recordDiagnosticEvent("route_changed", { route: nextRoute });
  }, []);
  const rememberSpecializedDraft = useCallback(function rememberSpecializedDraft<
    Route extends SpecializedAnalysisRoute,
  >(draftRoute: Route, draft: SpecializedDraftByRoute[Route]) {
    specializedDrafts.current = { ...specializedDrafts.current, [draftRoute]: draft };
  }, []);
  const navigateAsFreshStart = useCallback(
    (nextRoute: AppRoute) => {
      if (
        workspaceDirty &&
        !window.confirm("未保存の変更があります。現在の実験を閉じて破棄しますか？")
      ) {
        return;
      }
      setActiveProject(null);
      setSystemOpenError(null);
      setWorkspaceDirty(false);
      if (nextRoute === "new-experiment") {
        setReusedDraft(null);
        setFavoriteDefaults([]);
        specializedDrafts.current = {};
        setAdaptiveSurvivalHandoff(null);
        setDedicatedEntryIntent(null);
        setNewExperimentSession((session) => session + 1);
      }
      navigate(nextRoute);
    },
    [navigate, workspaceDirty],
  );
  const resetEvaluationCase = useCallback(() => {
    setActiveProject(null);
    setSystemOpenError(null);
    setReusedDraft(null);
    setFavoriteDefaults([]);
    specializedDrafts.current = {};
    setAdaptiveSurvivalHandoff(null);
    setDedicatedEntryIntent(null);
    navigate("home");
  }, [navigate]);
  const useLiteratureCase = useCallback(
    (source: LiteratureExperimenterCase) => {
      if (!import.meta.env.DEV) return;
      void import("./app/literatureBenchmark").then(({ createLiteratureExperimentDraft }) => {
        setActiveProject(null);
        setSystemOpenError(null);
        setFavoriteDefaults([]);
        specializedDrafts.current = {};
        setAdaptiveSurvivalHandoff(null);
        setDedicatedEntryIntent(null);
        setReusedDraft(createLiteratureExperimentDraft(source));
        navigate("new-experiment");
      });
    },
    [navigate],
  );

  useEffect(() => {
    const openProjectTarget = activeProjectActions.openProjectTarget;
    if (browserPreview || !isTauri() || !openProjectTarget) return;
    let disposed = false;
    let stopListening: (() => void) | undefined;
    const handledTargets = new Set<string>();
    const handleTargets = async (targets: readonly string[]) => {
      const target = [...targets].reverse().find((candidate) => !handledTargets.has(candidate));
      if (!target) return;
      handledTargets.add(target);
      try {
        const project = await openProjectTarget(target);
        if (disposed) return;
        setSystemOpenError(null);
        setActiveProject(project);
        recordRecentProject(project);
        recordDiagnosticEvent("project_opened", { state: "success", source: "system" });
        navigate("open-project");
      } catch (error) {
        if (disposed) return;
        setActiveProject(null);
        recordDiagnosticError("PROJECT_OPEN_FAILED", error);
        setSystemOpenError(
          error instanceof Error && error.message.trim()
            ? error.message
            : "指定されたプロジェクトを開けませんでした。",
        );
        navigate("open-project");
      }
    };
    void (async () => {
      stopListening = await listen<string[]>("project-open-request", (event) => {
        void handleTargets(event.payload);
      });
      const pending = await invoke<string[]>("take_pending_project_open");
      await handleTargets(pending);
    })();
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [activeProjectActions.openProjectTarget, browserPreview, navigate, recordRecentProject]);

  const orderedCurveIntent =
    dedicatedEntryIntent?.moduleId === "ordered_curve_kinetics" ? dedicatedEntryIntent : undefined;
  const timeToEventIntent =
    dedicatedEntryIntent?.moduleId === "time_to_event" ? dedicatedEntryIntent : undefined;
  const matrixVisualizationIntent =
    dedicatedEntryIntent?.moduleId === "matrix_visualization" ? dedicatedEntryIntent : undefined;
  const page = (() => {
    switch (route) {
      case "contingency":
      case "repeated-nonparametric":
      case "regression":
      case "nonlinear-fit":
      case "distribution":
        return (
          <CommonCoveragePage
            key={route}
            mode={route}
            onBack={() => navigate("new-experiment")}
            onNavigate={navigate}
            saveProject={browserPreview ? undefined : saveProject}
            analysisAvailable={analysisAvailable}
            initialDraft={scopedSpecializedDraft(
              specializedDrafts.current[route],
              route === "nonlinear-fit" ? orderedCurveIntent : undefined,
            )}
            onDraftChange={(draft) => rememberSpecializedDraft(route, draft)}
            entryIntent={route === "nonlinear-fit" ? orderedCurveIntent : undefined}
          />
        );
      case "survival":
        return (
          <SpecializedCorePage
            key={route}
            mode="survival"
            onBack={() => navigate("new-experiment")}
            onNavigate={navigate}
            saveProject={browserPreview ? undefined : saveProject}
            analysisAvailable={analysisAvailable}
            initialText={adaptiveSurvivalHandoff?.text}
            adaptiveInput={adaptiveSurvivalHandoff?.snapshot}
            initialDraft={
              adaptiveSurvivalHandoff
                ? undefined
                : scopedSpecializedDraft(specializedDrafts.current.survival, timeToEventIntent)
            }
            onDraftChange={(draft) => rememberSpecializedDraft("survival", draft)}
            entryIntent={timeToEventIntent}
          />
        );
      case "heatmap":
        if (!browserPreview && !unresolvedVisualizationPersistence) {
          return (
            <UnresolvedVisualizationPersistenceStop onBack={() => navigate("new-experiment")} />
          );
        }
        return (
          <SpecializedCorePage
            key={route}
            mode="heatmap"
            onBack={() => navigate("new-experiment")}
            onNavigate={navigate}
            saveProject={browserPreview ? undefined : saveProject}
            saveUnresolvedVisualizationProject={unresolvedVisualizationPersistence?.save}
            openUnresolvedVisualizationProject={unresolvedVisualizationPersistence?.open}
            initialDraft={specializedDrafts.current.heatmap}
            onDraftChange={(draft) => rememberSpecializedDraft("heatmap", draft)}
            entryIntent={matrixVisualizationIntent}
          />
        );
      case "favorites":
        return (
          <CollectionPage
            kind="favorites"
            favorites={favorites}
            onNavigate={navigateAsFreshStart}
            onUseFavorite={(favorite) => {
              setReusedDraft(reuseExperimentDesign(favorite.draft));
              setFavoriteDefaults(favorite.graphDefaults);
              navigate("new-experiment");
            }}
            onRemoveFavorite={(id) => {
              removeFavoriteDesign(id);
              setFavorites(loadFavoriteDesigns());
            }}
          />
        );
      case "new-experiment":
        return (
          <NewExperimentPage
            key={`${reusedDraft ? `reuse:${reusedDraft.name}` : "new"}:${newExperimentSession}`}
            onNavigate={navigate}
            saveProject={browserPreview ? undefined : saveProject}
            saveUnresolvedVisualizationProject={unresolvedVisualizationPersistence?.save}
            openUnresolvedVisualizationProject={unresolvedVisualizationPersistence?.open}
            browserPreview={browserPreview}
            analysisAvailable={analysisAvailable}
            initialDraft={reusedDraft}
            favoriteGraphDefaults={favoriteDefaults}
            onSaveFavorite={(draft, graphs) => {
              saveFavoriteDesign(draft, graphs);
              setFavorites(loadFavoriteDesigns());
            }}
            onDirtyChange={setWorkspaceDirty}
            onAdaptiveSurvivalReady={(text, snapshot) => {
              setDedicatedEntryIntent(null);
              setAdaptiveSurvivalHandoff({ text, snapshot });
              navigate("survival");
            }}
            onDedicatedEntryReady={(intent) => {
              setAdaptiveSurvivalHandoff(null);
              setDedicatedEntryIntent(intent);
              navigate(intent.destination, dedicatedEntryHistoryState(intent));
            }}
          />
        );
      case "recent":
        return (
          <CollectionPage
            kind="recent"
            recentProjects={recentProjects}
            onNavigate={navigateAsFreshStart}
            onOpenRecent={(recent) => {
              void (async () => {
                try {
                  if (!activeProjectActions.openProjectTarget) {
                    throw new Error("この環境では最近のファイルを直接開けません。");
                  }
                  const project = await activeProjectActions.openProjectTarget(recent.target);
                  setActiveProject(project);
                  setSystemOpenError(null);
                  recordRecentProject(project);
                  recordDiagnosticEvent("project_opened", {
                    state: "success",
                    source: "recent",
                  });
                  navigate("open-project");
                } catch (error) {
                  recordDiagnosticError("PROJECT_OPEN_FAILED", error);
                  setSystemOpenError(
                    error instanceof Error && error.message.trim()
                      ? error.message
                      : "最近のプロジェクトを開けませんでした。",
                  );
                  navigate("open-project");
                }
              })();
            }}
            onRemoveRecent={(target) => setRecentProjects(removeRecentProject(target))}
          />
        );
      case "open-project":
        return (
          <OpenProjectPage
            onNavigate={navigate}
            openProject={activeProjectActions.openProject}
            openLegacyProject={activeProjectActions.openLegacyProject}
            persistedProject={activeProject}
            onProjectOpened={(project) => {
              setActiveProject(project);
              if (project) {
                recordRecentProject(project);
                recordDiagnosticEvent("project_opened", {
                  state: "success",
                  source: "dialog",
                });
              }
            }}
            saveProject={browserPreview ? undefined : saveProject}
            onReuseDesign={(draft) => {
              setReusedDraft(reuseExperimentDesign(draft));
              setFavoriteDefaults([]);
              navigate("new-experiment");
            }}
            onSaveFavorite={(draft, graphs) => {
              saveFavoriteDesign(draft, graphs);
              setFavorites(loadFavoriteDesigns());
            }}
            autoOpen={!browserPreview && !systemOpenError}
            initialError={systemOpenError}
          />
        );
      case "home":
      default:
        return <HomePage onNavigate={navigateAsFreshStart} />;
    }
  })();

  return (
    <AppShell
      route={route}
      onNavigate={navigateAsFreshStart}
      onResetEvaluationCase={resetEvaluationCase}
      onUseLiteratureCase={useLiteratureCase}
      browserPreview={browserPreview}
      evaluationPreview={evaluationPreview}
      activeProject={activeProject?.state ?? null}
    >
      {page}
    </AppShell>
  );
}
