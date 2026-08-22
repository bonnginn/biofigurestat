import { useCallback, useEffect, useState } from "react";
import type { OpenedProject } from "./app/projectActions";
import { listen } from "@tauri-apps/api/event";

import { AppShell } from "./components/AppShell";
import { CollectionPage } from "./pages/CollectionPage";
import { HomePage } from "./pages/HomePage";
import { NewExperimentPage } from "./pages/NewExperimentPage";
import { OpenProjectPage } from "./pages/OpenProjectPage";
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

type AppProps = {
  projectActions?: ProjectActions;
};

const browserPreviewProjectActions: ProjectActions = {
  openProject: async () => {
    throw new Error("ブラウザUXプレビューではローカルプロジェクトを開けません。");
  },
  saveProject: async () => {
    throw new Error("ブラウザUXプレビューではプロジェクトを保存できません。");
  },
};

export default function App({ projectActions }: AppProps) {
  const browserPreview = projectActions === undefined && !isTauri();
  const evaluationPreview = browserPreview && evaluationModeIsConfigured(evaluationMode);
  const activeProjectActions =
    projectActions ?? (browserPreview ? browserPreviewProjectActions : defaultProjectActions);
  const [route, setRoute] = useState<AppRoute>(() => routeFromPath(window.location.pathname));
  const [activeProject, setActiveProject] = useState<OpenedProject | null>(null);
  const [systemOpenError, setSystemOpenError] = useState<string | null>(null);
  const [reusedDraft, setReusedDraft] = useState<ExperimentSetDraft | null>(null);
  const [favoriteDefaults, setFavoriteDefaults] = useState<readonly FavoriteGraphDefault[]>([]);
  const [favorites, setFavorites] = useState<FavoriteDesign[]>(loadFavoriteDesigns);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(loadRecentProjects);

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
      const saved = await activeProjectActions.saveProject(request, existingTarget);
      if (saved) recordRecentProject(saved);
      return saved;
    },
    [activeProjectActions, recordRecentProject],
  );

  useEffect(() => {
    const handlePopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    recordBenchmarkEvent("route_changed", {
      from: routeFromPath(window.location.pathname),
      to: nextRoute,
    });
    const nextPath = pathForRoute(nextRoute);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setRoute(nextRoute);
  }, []);
  const navigateAsFreshStart = useCallback(
    (nextRoute: AppRoute) => {
      setActiveProject(null);
      setSystemOpenError(null);
      if (nextRoute === "new-experiment") {
        setReusedDraft(null);
        setFavoriteDefaults([]);
      }
      navigate(nextRoute);
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
        navigate("open-project");
      } catch (error) {
        if (disposed) return;
        setActiveProject(null);
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

  const page = (() => {
    switch (route) {
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
            key={reusedDraft ? `reuse:${reusedDraft.name}` : "new"}
            onNavigate={navigate}
            saveProject={browserPreview ? undefined : saveProject}
            browserPreview={browserPreview}
            initialDraft={reusedDraft}
            favoriteGraphDefaults={favoriteDefaults}
            onSaveFavorite={(draft, graphs) => {
              saveFavoriteDesign(draft, graphs);
              setFavorites(loadFavoriteDesigns());
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
                  navigate("open-project");
                } catch (error) {
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
              if (project) recordRecentProject(project);
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
      browserPreview={browserPreview}
      evaluationPreview={evaluationPreview}
    >
      {page}
    </AppShell>
  );
}
