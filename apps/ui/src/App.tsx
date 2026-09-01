import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  actionErrorMessage,
  type OpenedAnyProject,
  type OpenedProject,
} from "./app/projectActions";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { AppShell } from "./components/AppShell";
import type { ProjectTab } from "./components/ProjectTabBar";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { CollectionPage } from "./pages/CollectionPage";
import { HomePage } from "./pages/HomePage";
import { defaultProjectActions } from "./app/desktopProjectActions";
import { ProjectIoError } from "./app/desktopProjectPackage";
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
import {
  recordDiagnosticError,
  recordDiagnosticEvent,
  type DiagnosticProjectIoStage,
  type DiagnosticProjectOpenSource,
} from "./app/diagnostics";
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
  defaultDedicatedEntryIntentForRoute,
  dedicatedEntryHistoryState,
  dedicatedEntryIntentForRoute,
  dedicatedEntryIntentFromHistoryState,
  type DedicatedEntryIntent,
} from "./app/dedicatedEntryIntent";
import { adaptiveInputFeatureEnabled } from "./app/adaptiveInputFeature";
import type {
  RegisterWorkspaceSaveHandler,
  RequestWorkspaceExit,
  WorkspaceExitRequest,
  WorkspaceLifecycleRegistration,
} from "./app/workspaceLifecycle";
import { recordUsageMilestone } from "./app/usageTelemetry";
import { resolveAnalysisRouteSwitcherAccess } from "./app/analysisRouteSwitcherAccess";
import { localizedText, useAppLocale } from "./app/appLocale";
import { projectPersistenceCapabilities } from "./app/projectPersistenceCapabilities";

const CommonCoveragePage = lazy(() =>
  import("./pages/CommonCoveragePage").then(({ CommonCoveragePage: Page }) => ({ default: Page })),
);

const NewExperimentPage = lazy(() =>
  import("./pages/NewExperimentPage").then(({ NewExperimentPage: Page }) => ({ default: Page })),
);

const OpenProjectPage = lazy(() =>
  import("./pages/OpenProjectPage").then(({ OpenProjectPage: Page }) => ({ default: Page })),
);

const SpecializedCorePage = lazy(() =>
  import("./pages/SpecializedCorePage").then(({ SpecializedCorePage: Page }) => ({ default: Page })),
);

type AppProps = {
  projectActions?: ProjectActions;
  /** Test/development audit seam. Ignored by production builds. */
  developmentAnalysisRouteSwitcher?: boolean;
};

const PROJECT_IO_STAGE_LABELS: Record<string, string> = {
  checksum: "checksum検証",
  database_encode: "project database作成",
  container_begin: "保存先の準備",
  container_write: "project dataの書き込み",
  container_commit: "保存fileの確定",
  package_assembly: "project packageの組み立て",
};

const PROJECT_IO_STAGE_LABELS_EN: Record<string, string> = {
  checksum: "checksum verification",
  database_encode: "project database creation",
  container_begin: "destination preparation",
  container_write: "project-data writing",
  container_commit: "saved-file finalization",
  package_assembly: "project-package assembly",
};

export function projectIoStage(
  error: unknown,
): Exclude<DiagnosticProjectIoStage, "unknown"> | null {
  if (error instanceof ProjectIoError) return error.stage;
  const message = error instanceof Error ? error.message : String(error);
  // Compatibility fallback for errors produced by an older desktop adapter.
  const stage = message.match(/PROJECT_IO_STAGE\[([^\]]+)\]/)?.[1];
  return stage && Object.hasOwn(PROJECT_IO_STAGE_LABELS, stage)
    ? (stage as Exclude<DiagnosticProjectIoStage, "unknown">)
    : null;
}

function routeWithAdaptiveInputPreference(path: string): string {
  const preference = new URLSearchParams(window.location.search).get("adaptiveInput");
  return preference === "0" || preference === "1" ? `${path}?adaptiveInput=${preference}` : path;
}

export function canonicalProjectTargetKey(target: string): string {
  const slashNormalized = target.trim().replaceAll("\\", "/");
  const normalized = slashNormalized.startsWith("//")
    ? `//${slashNormalized.slice(2).replace(/\/{2,}/g, "/")}`
    : slashNormalized.replace(/\/{2,}/g, "/");
  const withoutTrailingSlash = normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
  return /^[A-Za-z]:\//.test(withoutTrailingSlash) || withoutTrailingSlash.startsWith("//")
    ? withoutTrailingSlash.toLowerCase()
    : withoutTrailingSlash;
}

function retargetOpenedProject(opened: OpenedAnyProject, target: string): OpenedAnyProject {
  if (opened.kind === "experiment") {
    return { kind: opened.kind, project: { ...opened.project, target } };
  }
  if (opened.kind === "unresolved_visualization") {
    return { kind: opened.kind, project: { ...opened.project, target } };
  }
  return { kind: opened.kind, project: { ...opened.project, target } };
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
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> {t("新しい実験へ戻る", "Back to New Experiment")}
      </button>
      <section className="empty-page" aria-labelledby="visualization-persistence-stop-heading">
        <span className="empty-icon empty-icon--orange" aria-hidden="true">
          !
        </span>
        <p className="overline">
          {t("入力を開始する前に停止しました", "Stopped before data entry")}
        </p>
        <h1 id="visualization-persistence-stop-heading">
          {t("Heatmapを開始できません", "Heatmap cannot start")}
        </h1>
        <p role="alert">
          {t(
            "行列とGraphを保存・再開する接続がそろっていません。データ入力後に保存できない状態を避けるため、この環境では入力面を開きません。",
            "The connections required to save and reopen the matrix and Graph are unavailable. Data entry remains closed in this environment to prevent unsavable work.",
          )}
        </p>
        <button className="primary-button" type="button" onClick={onBack}>
          {t("入口へ戻る", "Back to entry options")}
        </button>
      </section>
    </div>
  );
}

function SpecializedEntryPersistenceStop({
  entryLabel,
  onBack,
}: Readonly<{ entryLabel: string; onBack: () => void }>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const headingId = "specialized-entry-persistence-stop-heading";
  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> {t("新しい実験へ戻る", "Back to New Experiment")}
      </button>
      <section className="empty-page" aria-labelledby={headingId}>
        <span className="empty-icon empty-icon--orange" aria-hidden="true">
          !
        </span>
        <p className="overline">
          {t("入力を開始する前に停止しました", "Stopped before data entry")}
        </p>
        <h1 id={headingId}>
          {locale === "ja" ? `${entryLabel}を開始できません` : `${entryLabel} cannot start`}
        </h1>
        <p role="alert">
          {t(
            "入力途中の専用データを保存・再開する接続がそろっていません。データ入力後に保存できない状態を避けるため、この環境では入力面を開きません。",
            "The connections required to save and reopen this specialized data are unavailable. Data entry remains closed in this environment to prevent unsavable work.",
          )}
        </p>
        <button className="primary-button" type="button" onClick={onBack}>
          {t("入口へ戻る", "Back to entry options")}
        </button>
      </section>
    </div>
  );
}

function LegacyAnalysisEntryStop({ onBack }: Readonly<{ onBack: () => void }>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> {t("新しい実験へ戻る", "Back to New Experiment")}
      </button>
      <section className="empty-page" aria-labelledby="legacy-analysis-entry-stop-heading">
        <span className="empty-icon empty-icon--orange" aria-hidden="true">
          !
        </span>
        <p className="overline">{t("以前の解析用入口", "Legacy analysis entry")}</p>
        <h1 id="legacy-analysis-entry-stop-heading">
          {t(
            "この入口は通常モードでは利用できません",
            "This entry is unavailable in standard mode",
          )}
        </h1>
        <p role="alert">
          {t(
            "実験構造を確認せず解析形式だけを選ぶ以前の入口です。通常は「新しい実験」から目的に合う入口を選んでください。別の解析へ自動変換はしません。",
            "This legacy entry selects an analysis format without confirming the experimental structure. Choose the appropriate task from New Experiment instead. The app will not convert it to another analysis automatically.",
          )}
        </p>
        <button className="primary-button" type="button" onClick={onBack}>
          {t("新しい実験へ戻る", "Back to New Experiment")}
        </button>
      </section>
    </div>
  );
}

function CompatibilityModeNotice() {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  return (
    <aside
      className="browser-preview-banner"
      role="status"
      aria-label={t("互換モード", "Compatibility mode")}
    >
      <strong>{t("互換モード（以前の入力方式）", "Compatibility mode (legacy entry)")}</strong>
      <span>
        {t(
          "この画面は通常のexperiment-first入口ではありません。",
          "This screen is not part of the standard experiment-first entry.",
        )}
      </span>
    </aside>
  );
}

export default function App({
  projectActions,
  developmentAnalysisRouteSwitcher = false,
}: AppProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const browserPreview = projectActions === undefined && !isTauri();
  const experimentFirstEntryEnabled = adaptiveInputFeatureEnabled();
  const evaluationPreview =
    import.meta.env.DEV && browserPreview && evaluationModeIsConfigured(evaluationMode);
  const analysisRouteSwitcherAccess = resolveAnalysisRouteSwitcherAccess({
    developmentBuild: import.meta.env.DEV,
    auditModeRequested:
      developmentAnalysisRouteSwitcher || evaluationModeIsConfigured(evaluationMode),
  });
  const activeProjectActions =
    projectActions ?? (browserPreview ? browserPreviewProjectActions : defaultProjectActions);
  const [route, setRoute] = useState<AppRoute>(() => routeFromPath(window.location.pathname));
  const [activeProject, setActiveProject] = useState<OpenedProject | null>(null);
  const [activeVisualizationProject, setActiveVisualizationProject] = useState<Extract<
    OpenedAnyProject,
    { kind: "unresolved_visualization" }
  > | null>(null);
  const [activeSpecializedEntryDraft, setActiveSpecializedEntryDraft] = useState<Extract<
    OpenedAnyProject,
    { kind: "specialized_entry_draft" }
  > | null>(null);
  const [systemOpenError, setSystemOpenError] = useState<string | null>(null);
  const [reusedDraft, setReusedDraft] = useState<ExperimentSetDraft | null>(null);
  const [favoriteDefaults, setFavoriteDefaults] = useState<readonly FavoriteGraphDefault[]>([]);
  const [favorites, setFavorites] = useState<FavoriteDesign[]>(loadFavoriteDesigns);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(loadRecentProjects);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [projectTabs, setProjectTabs] = useState<ProjectTab[]>([]);
  const [pendingTabCloseTarget, setPendingTabCloseTarget] = useState<string | null>(null);
  const [activeProjectTabTarget, setActiveProjectTabTarget] = useState<string | null>(null);
  const activeProjectTabTargetRef = useRef<string | null>(activeProjectTabTarget);
  const routeRef = useRef(route);
  const workspaceDirtyRef = useRef(workspaceDirty);
  const workspaceLifecycleRef = useRef<WorkspaceLifecycleRegistration | null>(null);
  const workspaceSessionCheckpointsRef = useRef(new Map<string, OpenedAnyProject>());
  const specializedDraftCheckpointsRef = useRef(new Map<string, SpecializedDraftStore>());
  const restoredDirtyTargetRef = useRef<string | null>(null);
  const [workspaceSaveAvailable, setWorkspaceSaveAvailable] = useState(false);
  const requestWorkspaceExitRef = useRef<RequestWorkspaceExit>(() => undefined);
  const approvedWorkspaceExitRef = useRef(false);
  const [pendingWorkspaceExit, setPendingWorkspaceExit] = useState<WorkspaceExitRequest | null>(
    null,
  );
  const [workspaceExitSaving, setWorkspaceExitSaving] = useState(false);
  const [workspaceExitError, setWorkspaceExitError] = useState<string | null>(null);
  const specializedDrafts = useRef<SpecializedDraftStore>({});
  const [newExperimentSession, setNewExperimentSession] = useState(0);
  const [adaptiveSurvivalHandoff, setAdaptiveSurvivalHandoff] = useState<{
    text: string;
    snapshot: AdaptiveInputSnapshot;
  } | null>(null);
  const [dedicatedEntryIntent, setDedicatedEntryIntent] = useState<DedicatedEntryIntent | null>(
    () =>
      dedicatedEntryIntentFromHistoryState(window.history.state, route) ??
      (experimentFirstEntryEnabled ? defaultDedicatedEntryIntentForRoute(route) : null),
  );
  const analysisAvailable = !browserPreview || evaluationPreview;
  const activeProjectTarget =
    activeProjectTabTarget ??
    activeProject?.target ??
    activeVisualizationProject?.project.target ??
    activeSpecializedEntryDraft?.project.target ??
    null;
  const updateWorkspaceDirty = useCallback((dirty: boolean) => {
    const target = activeProjectTabTargetRef.current;
    if (!dirty && !target) return;
    const effectiveDirty = dirty || restoredDirtyTargetRef.current !== null;
    workspaceDirtyRef.current = effectiveDirty;
    setWorkspaceDirty((current) => (current === effectiveDirty ? current : effectiveDirty));
    setProjectTabs((current) => {
      let changed = false;
      const next = current.map((tab) => {
        if (tab.target !== target || tab.dirty === effectiveDirty) return tab;
        changed = true;
        return { ...tab, dirty: effectiveDirty };
      });
      return changed ? next : current;
    });
  }, []);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  useEffect(() => {
    workspaceDirtyRef.current = workspaceDirty;
  }, [workspaceDirty]);
  useEffect(() => {
    activeProjectTabTargetRef.current = activeProjectTabTarget;
  }, [activeProjectTabTarget]);
  const registerWorkspaceSaveHandler = useCallback<RegisterWorkspaceSaveHandler>((handler) => {
    const registration = typeof handler === "function" ? { save: handler } : handler;
    workspaceLifecycleRef.current = registration;
    setWorkspaceSaveAvailable(registration !== null);
  }, []);
  const executeRegisteredWorkspaceSave = useCallback(async (saveAs = false) => {
    const saveCurrent = workspaceLifecycleRef.current?.save;
    if (!saveCurrent) return false;
    try {
      return await saveCurrent(saveAs);
    } catch (error) {
      recordDiagnosticError("PROJECT_SAVE_FAILED", error);
      return false;
    }
  }, []);
  useEffect(() => {
    if (browserPreview) return;

    const handleSaveShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      if (!workspaceLifecycleRef.current) return;
      event.preventDefault();
      void executeRegisteredWorkspaceSave(event.shiftKey);
    };
    window.addEventListener("keydown", handleSaveShortcut);

    let disposed = false;
    let stopListening: (() => void) | undefined;
    if (isTauri()) {
      void listen<boolean>("project-save-request", (event) => {
        void executeRegisteredWorkspaceSave(Boolean(event.payload));
      }).then((unlisten) => {
        if (disposed) unlisten();
        else stopListening = unlisten;
      });
    }

    return () => {
      disposed = true;
      window.removeEventListener("keydown", handleSaveShortcut);
      stopListening?.();
    };
  }, [browserPreview, executeRegisteredWorkspaceSave]);
  const requestWorkspaceExit = useCallback<RequestWorkspaceExit>((request) => {
    if (approvedWorkspaceExitRef.current || !workspaceDirtyRef.current) {
      void request.proceed();
      return;
    }
    setWorkspaceExitError(null);
    setPendingWorkspaceExit((current) => current ?? request);
  }, []);
  useEffect(() => {
    requestWorkspaceExitRef.current = requestWorkspaceExit;
  }, [requestWorkspaceExit]);
  useEffect(() => {
    if (!workspaceDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [workspaceDirty]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let stopListeningForClose: (() => void) | undefined;
    let stopListeningForAppExit: (() => void) | undefined;
    const appWindow = getCurrentWindow();
    const requestNativeApplicationExit = () => {
      requestWorkspaceExitRef.current({
        actionLabel: "アプリを終了する",
        proceed: async () => {
          await invoke("exit_application");
        },
      });
    };
    void appWindow
      .onCloseRequested((event) => {
        event.preventDefault();
        requestNativeApplicationExit();
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else stopListeningForClose = unlisten;
      });
    void listen("app-exit-request", requestNativeApplicationExit).then((unlisten) => {
      if (disposed) unlisten();
      else stopListeningForAppExit = unlisten;
    });
    return () => {
      disposed = true;
      stopListeningForClose?.();
      stopListeningForAppExit?.();
    };
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [route, newExperimentSession]);

  useEffect(() => {
    setDedicatedEntryIntent(
      (current) =>
        dedicatedEntryIntentForRoute(current, route) ??
        (experimentFirstEntryEnabled ? defaultDedicatedEntryIntentForRoute(route) : null),
    );
    if (route !== "survival") setAdaptiveSurvivalHandoff(null);
  }, [experimentFirstEntryEnabled, route]);

  const recordRecentProject = useCallback((project: OpenedProject) => {
    setRecentProjects(
      rememberRecentProject({
        target: project.target,
        name: project.state.metadata.projectName,
      }),
    );
  }, []);

  const rememberProjectTab = useCallback(
    (opened: OpenedAnyProject) => {
      const openedTargetKey = canonicalProjectTargetKey(opened.project.target);
      const existingTarget = projectTabs.find(
        (tab) => canonicalProjectTargetKey(tab.target) === openedTargetKey,
      )?.target;
      const next: ProjectTab = {
        target: existingTarget ?? opened.project.target,
        name: opened.project.state.metadata.projectName,
        kind: opened.kind,
        dirty: false,
      };
      setProjectTabs((current) => {
        const existing = current.findIndex(
          (tab) => canonicalProjectTargetKey(tab.target) === openedTargetKey,
        );
        if (existing < 0) return [...current, next];
        return current.map((tab, index) => (index === existing ? next : tab));
      });
      activeProjectTabTargetRef.current = next.target;
      setActiveProjectTabTarget(next.target);
    },
    [projectTabs],
  );

  const checkpointActiveWorkspace = useCallback(() => {
    if (!workspaceDirtyRef.current) return true;
    // A never-saved workspace has no durable tab target yet. Treating that as
    // a successful checkpoint would let Home/New/Open discard its data without
    // either preserving it in a tab or showing the save guard.
    if (!activeProjectTabTarget) return browserPreview;
    let checkpoint: OpenedAnyProject | null = null;
    try {
      checkpoint = workspaceLifecycleRef.current?.checkpoint?.() ?? null;
    } catch (error) {
      recordDiagnosticError("UNEXPECTED_APPLICATION_ERROR", error);
      return false;
    }
    if (!checkpoint || checkpoint.project.target !== activeProjectTabTarget) return false;
    workspaceSessionCheckpointsRef.current.set(activeProjectTabTarget, checkpoint);
    specializedDraftCheckpointsRef.current.set(activeProjectTabTarget, {
      ...specializedDrafts.current,
    });
    setProjectTabs((current) =>
      current.map((tab) => (tab.target === activeProjectTabTarget ? { ...tab, dirty: true } : tab)),
    );
    return true;
  }, [activeProjectTabTarget, browserPreview]);

  const saveProject = useCallback<NonNullable<ProjectActions["saveProject"]>>(
    async (request, existingTarget) => {
      if (!activeProjectActions.saveProject) return null;
      try {
        const saved = await activeProjectActions.saveProject(request, existingTarget);
        if (saved) {
          restoredDirtyTargetRef.current = null;
          workspaceSessionCheckpointsRef.current.delete(saved.target);
          specializedDraftCheckpointsRef.current.delete(saved.target);
          recordRecentProject(saved);
          rememberProjectTab({ kind: "experiment", project: saved });
          recordDiagnosticEvent("project_saved", { state: "success" });
          recordUsageMilestone(routeRef.current, "project_saved");
        }
        return saved;
      } catch (error) {
        recordDiagnosticError("PROJECT_SAVE_FAILED", error);
        const failureStage = projectIoStage(error);
        recordDiagnosticEvent("project_save_failed", { stage: failureStage ?? "unknown" });
        const message = researcherError("PROJECT_SAVE_FAILED", locale);
        const stageMessage = failureStage
          ? t(
              `失敗した処理：${PROJECT_IO_STAGE_LABELS[failureStage] ?? failureStage}。`,
              `Failed stage: ${PROJECT_IO_STAGE_LABELS_EN[failureStage] ?? failureStage}. `,
            )
          : "";
        throw new Error(
          `${message.title}${t(`（${message.code}）。`, ` (${message.code}). `)}${stageMessage}${message.nextAction}`,
          {
            cause: error,
          },
        );
      }
    },
    [activeProjectActions, locale, recordRecentProject, rememberProjectTab],
  );

  const saveUnresolvedVisualizationProject = useCallback(
    async (
      ...args: Parameters<NonNullable<ProjectActions["saveUnresolvedVisualizationProject"]>>
    ) => {
      const action = activeProjectActions.saveUnresolvedVisualizationProject;
      if (!action) return null;
      const saved = await action(...args);
      if (saved) {
        restoredDirtyTargetRef.current = null;
        workspaceSessionCheckpointsRef.current.delete(saved.target);
        specializedDraftCheckpointsRef.current.delete(saved.target);
        rememberProjectTab({ kind: "unresolved_visualization", project: saved });
      }
      return saved;
    },
    [activeProjectActions.saveUnresolvedVisualizationProject, rememberProjectTab],
  );

  const saveSpecializedEntryDraftProject = useCallback(
    async (
      ...args: Parameters<NonNullable<ProjectActions["saveSpecializedEntryDraftProject"]>>
    ) => {
      const action = activeProjectActions.saveSpecializedEntryDraftProject;
      if (!action) return null;
      const saved = await action(...args);
      if (saved) {
        restoredDirtyTargetRef.current = null;
        workspaceSessionCheckpointsRef.current.delete(saved.target);
        specializedDraftCheckpointsRef.current.delete(saved.target);
        rememberProjectTab({ kind: "specialized_entry_draft", project: saved });
      }
      return saved;
    },
    [activeProjectActions.saveSpecializedEntryDraftProject, rememberProjectTab],
  );

  const persistenceCapabilities = projectPersistenceCapabilities(activeProjectActions);
  const unresolvedVisualizationPersistence =
    !browserPreview && persistenceCapabilities.unresolvedVisualization
      ? {
          save: saveUnresolvedVisualizationProject,
          open: activeProjectActions.openUnresolvedVisualizationProject!,
        }
      : null;
  const specializedEntryDraftPersistence =
    !browserPreview && persistenceCapabilities.specializedEntryDraft
      ? { save: saveSpecializedEntryDraftProject }
      : null;
  const specializedEntryAvailable = browserPreview || Boolean(specializedEntryDraftPersistence);

  const navigate = useCallback((nextRoute: AppRoute, historyState: unknown = {}) => {
    recordBenchmarkEvent("route_changed", {
      from: routeFromPath(window.location.pathname),
      to: nextRoute,
    });
    const nextPath = pathForRoute(nextRoute);
    const nextUrl = routeWithAdaptiveInputPreference(nextPath);
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.pushState(historyState, "", nextUrl);
    }
    setRoute(nextRoute);
    recordDiagnosticEvent("route_changed", { route: nextRoute });
    if (
      nextRoute === "new-experiment" ||
      nextRoute === "survival" ||
      nextRoute === "nonlinear-fit" ||
      nextRoute === "heatmap"
    ) {
      recordUsageMilestone(nextRoute, "entry_started");
    }
  }, []);

  const handleOpenedAnyProject = useCallback(
    (
      opened: OpenedAnyProject,
      source: DiagnosticProjectOpenSource,
      options: Readonly<{ restoreDirty?: boolean }> = {},
    ) => {
      const restoreDirty = Boolean(options.restoreDirty);
      restoredDirtyTargetRef.current = restoreDirty ? opened.project.target : null;
      workspaceDirtyRef.current = restoreDirty;
      setWorkspaceDirty(restoreDirty);
      setSystemOpenError(null);
      setReusedDraft(null);
      setFavoriteDefaults([]);
      specializedDrafts.current = restoreDirty
        ? { ...(specializedDraftCheckpointsRef.current.get(opened.project.target) ?? {}) }
        : {};
      setAdaptiveSurvivalHandoff(null);
      setDedicatedEntryIntent(null);
      setRecentProjects(
        rememberRecentProject({
          target: opened.project.target,
          name: opened.project.state.metadata.projectName,
        }),
      );
      recordDiagnosticEvent("project_opened", { state: "success", source });
      recordUsageMilestone("open-project", "project_opened");
      rememberProjectTab(opened);
      if (restoreDirty) {
        setProjectTabs((current) =>
          current.map((tab) =>
            tab.target === opened.project.target ? { ...tab, dirty: true } : tab,
          ),
        );
      }

      if (opened.kind === "experiment") {
        setActiveVisualizationProject(null);
        setActiveSpecializedEntryDraft(null);
        setActiveProject(opened.project);
        navigate("open-project");
        return;
      }

      if (opened.kind === "unresolved_visualization") {
        setActiveProject(null);
        setActiveSpecializedEntryDraft(null);
        setActiveVisualizationProject(opened);
        setNewExperimentSession((session) => session + 1);
        navigate(opened.project.state.entryIntent === "graph_only" ? "new-experiment" : "heatmap");
        return;
      }

      setActiveProject(null);
      setActiveVisualizationProject(null);
      setActiveSpecializedEntryDraft(opened);
      setDedicatedEntryIntent(opened.project.state.entryIntent);
      setNewExperimentSession((session) => session + 1);
      navigate(
        opened.project.state.route,
        dedicatedEntryHistoryState(opened.project.state.entryIntent),
      );
    },
    [navigate, rememberProjectTab],
  );
  const activateOpenedProject = useCallback(
    (opened: OpenedAnyProject, source: DiagnosticProjectOpenSource) => {
      const openedTargetKey = canonicalProjectTargetKey(opened.project.target);
      const existingTab = projectTabs.find(
        (tab) => canonicalProjectTargetKey(tab.target) === openedTargetKey,
      );
      if (!existingTab) {
        handleOpenedAnyProject(opened, source);
        return;
      }
      if (
        activeProjectTarget &&
        canonicalProjectTargetKey(activeProjectTarget) ===
          canonicalProjectTargetKey(existingTab.target)
      ) {
        return;
      }
      const checkpoint = workspaceSessionCheckpointsRef.current.get(existingTab.target);
      handleOpenedAnyProject(
        checkpoint ?? retargetOpenedProject(opened, existingTab.target),
        source,
        { restoreDirty: Boolean(checkpoint) },
      );
    },
    [activeProjectTarget, handleOpenedAnyProject, projectTabs],
  );
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const nextRoute = routeFromPath(window.location.pathname);
      const requestedState = event.state;
      if (!workspaceDirtyRef.current || checkpointActiveWorkspace()) {
        setDedicatedEntryIntent(
          dedicatedEntryIntentFromHistoryState(requestedState, nextRoute) ??
            (experimentFirstEntryEnabled ? defaultDedicatedEntryIntentForRoute(nextRoute) : null),
        );
        setRoute(nextRoute);
        return;
      }

      const currentPath = pathForRoute(routeRef.current);
      window.history.pushState({}, "", routeWithAdaptiveInputPreference(currentPath));
      requestWorkspaceExit({
        actionLabel: "前の画面に戻る",
        proceed: () => {
          workspaceDirtyRef.current = false;
          setWorkspaceDirty(false);
          specializedDrafts.current = {};
          navigate(nextRoute, requestedState);
        },
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [checkpointActiveWorkspace, experimentFirstEntryEnabled, navigate, requestWorkspaceExit]);
  const rememberSpecializedDraft = useCallback(function rememberSpecializedDraft<
    Route extends SpecializedAnalysisRoute,
  >(draftRoute: Route, draft: SpecializedDraftByRoute[Route]) {
    specializedDrafts.current = { ...specializedDrafts.current, [draftRoute]: draft };
  }, []);
  const navigateAsFreshStart = useCallback(
    (nextRoute: AppRoute) => {
      const request: WorkspaceExitRequest = {
        actionLabel:
          nextRoute === "home"
            ? "ホームへ移動する"
            : nextRoute === "new-experiment"
              ? "新しい実験を始める"
              : "別の画面へ移動する",
        proceed: () => {
          restoredDirtyTargetRef.current = null;
          workspaceDirtyRef.current = false;
          setActiveProject(null);
          setActiveVisualizationProject(null);
          setActiveSpecializedEntryDraft(null);
          setActiveProjectTabTarget(null);
          activeProjectTabTargetRef.current = null;
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
      };
      if (
        (nextRoute === "home" || nextRoute === "new-experiment") &&
        (!workspaceDirtyRef.current || checkpointActiveWorkspace())
      ) {
        void request.proceed();
        return;
      }
      requestWorkspaceExit(request);
    },
    [checkpointActiveWorkspace, navigate, requestWorkspaceExit],
  );
  const saveAndContinueWorkspaceExit = useCallback(async () => {
    const request = pendingWorkspaceExit;
    const saveCurrent = workspaceLifecycleRef.current?.save;
    if (!request || !saveCurrent) {
      setWorkspaceExitError(
        "この画面から保存を開始できません。キャンセルしてFileメニューから保存してください。",
      );
      return;
    }
    setWorkspaceExitSaving(true);
    setWorkspaceExitError(null);
    try {
      const saved = await saveCurrent();
      if (!saved) {
        setWorkspaceExitError(
          "保存は完了していません。保存先の選択をキャンセルしたか、保存に失敗しました。入力内容は保持されています。",
        );
        return;
      }
      workspaceDirtyRef.current = false;
      setWorkspaceDirty(false);
      setPendingWorkspaceExit(null);
      await request.proceed();
    } finally {
      setWorkspaceExitSaving(false);
    }
  }, [pendingWorkspaceExit]);
  const discardAndContinueWorkspaceExit = useCallback(() => {
    const request = pendingWorkspaceExit;
    if (!request) return;
    setPendingWorkspaceExit(null);
    setWorkspaceExitError(null);
    approvedWorkspaceExitRef.current = true;
    const restoreAfterFailure = () => {
      if (!workspaceDirtyRef.current) return;
      setWorkspaceExitError(
        "操作を完了できませんでした。入力内容は保持されています。キャンセルしてもう一度お試しください。",
      );
      setPendingWorkspaceExit(request);
    };
    try {
      const result = request.proceed();
      void Promise.resolve(result)
        .catch(() => {
          restoreAfterFailure();
        })
        .finally(() => {
          approvedWorkspaceExitRef.current = false;
        });
    } catch {
      approvedWorkspaceExitRef.current = false;
      restoreAfterFailure();
    }
  }, [pendingWorkspaceExit]);
  const cancelWorkspaceExit = useCallback(() => {
    if (workspaceExitSaving) return;
    setPendingWorkspaceExit(null);
    setWorkspaceExitError(null);
  }, [workspaceExitSaving]);

  const openProjectFromWorkspace = useCallback(() => {
    const request: WorkspaceExitRequest = {
      actionLabel: "別のプロジェクトを開く",
      proceed: async () => {
        try {
          const opened = activeProjectActions.openAnyProject
            ? await activeProjectActions.openAnyProject()
            : await activeProjectActions
                .openProject()
                .then((project) => (project ? { kind: "experiment" as const, project } : null));
          if (!opened) return;
          activateOpenedProject(opened, "workspace_file_menu");
        } catch (error) {
          recordDiagnosticError("PROJECT_OPEN_FAILED", error);
          setSystemOpenError(
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
      },
    };
    if (!workspaceDirtyRef.current || checkpointActiveWorkspace()) {
      void request.proceed();
      return;
    }
    requestWorkspaceExit(request);
  }, [
    activeProjectActions,
    checkpointActiveWorkspace,
    activateOpenedProject,
    requestWorkspaceExit,
  ]);

  const openProjectTabTarget = useCallback(
    async (target: string) => {
      const openTarget =
        activeProjectActions.openAnyProjectTarget ?? activeProjectActions.openProjectTarget;
      if (!openTarget) throw new Error("この環境では保存済みプロジェクトを開けません。");
      const opened = await openTarget(target).then((project) =>
        "kind" in project ? project : { kind: "experiment" as const, project },
      );
      handleOpenedAnyProject(opened, "workspace_file_menu");
    },
    [activeProjectActions, handleOpenedAnyProject],
  );

  const selectProjectTab = useCallback(
    (target: string) => {
      if (target === activeProjectTarget) return;
      const request: WorkspaceExitRequest = {
        actionLabel: "別のプロジェクトへ切り替える",
        proceed: async () => {
          try {
            const checkpoint = workspaceSessionCheckpointsRef.current.get(target);
            if (checkpoint) {
              handleOpenedAnyProject(checkpoint, "workspace_file_menu", { restoreDirty: true });
            } else {
              await openProjectTabTarget(target);
            }
          } catch (error) {
            recordDiagnosticError("PROJECT_OPEN_FAILED", error);
            setSystemOpenError(
              actionErrorMessage(
                error,
                t("プロジェクトタブを開けませんでした。", "The project tab could not be opened."),
                locale,
              ),
            );
          }
        },
      };
      if (!workspaceDirtyRef.current || checkpointActiveWorkspace()) {
        void request.proceed();
        return;
      }
      requestWorkspaceExit(request);
    },
    [
      activeProjectTarget,
      checkpointActiveWorkspace,
      handleOpenedAnyProject,
      openProjectTabTarget,
      requestWorkspaceExit,
    ],
  );

  const closeProjectTab = useCallback(
    (target: string) => {
      const closingIndex = projectTabs.findIndex((tab) => tab.target === target);
      if (closingIndex < 0) return;
      if (target !== activeProjectTarget) {
        if (projectTabs[closingIndex]?.dirty) {
          setPendingTabCloseTarget(target);
          selectProjectTab(target);
          return;
        }
        workspaceSessionCheckpointsRef.current.delete(target);
        specializedDraftCheckpointsRef.current.delete(target);
        setProjectTabs((current) => current.filter((tab) => tab.target !== target));
        return;
      }
      const remaining = projectTabs.filter((tab) => tab.target !== target);
      const next = remaining[Math.min(closingIndex, remaining.length - 1)];
      requestWorkspaceExit({
        actionLabel: "現在のプロジェクトタブを閉じる",
        proceed: async () => {
          if (next) {
            try {
              const checkpoint = workspaceSessionCheckpointsRef.current.get(next.target);
              if (checkpoint) {
                handleOpenedAnyProject(checkpoint, "workspace_file_menu", {
                  restoreDirty: true,
                });
              } else {
                await openProjectTabTarget(next.target);
              }
              workspaceSessionCheckpointsRef.current.delete(target);
              specializedDraftCheckpointsRef.current.delete(target);
              setProjectTabs(remaining);
            } catch (error) {
              recordDiagnosticError("PROJECT_OPEN_FAILED", error);
              setSystemOpenError(
                actionErrorMessage(
                  error,
                  t(
                    "次のプロジェクトタブを開けなかったため、現在のタブは閉じていません。",
                    "The current tab was not closed because the next project tab could not be opened.",
                  ),
                  locale,
                ),
              );
            }
            return;
          }
          workspaceSessionCheckpointsRef.current.delete(target);
          specializedDraftCheckpointsRef.current.delete(target);
          setProjectTabs(remaining);
          workspaceDirtyRef.current = false;
          setWorkspaceDirty(false);
          setActiveProject(null);
          setActiveVisualizationProject(null);
          setActiveSpecializedEntryDraft(null);
          setActiveProjectTabTarget(null);
          navigate("home");
        },
      });
    },
    [
      activeProjectTarget,
      handleOpenedAnyProject,
      navigate,
      openProjectTabTarget,
      projectTabs,
      requestWorkspaceExit,
      selectProjectTab,
    ],
  );
  useEffect(() => {
    if (
      !pendingTabCloseTarget ||
      pendingTabCloseTarget !== activeProjectTarget ||
      !workspaceSaveAvailable
    ) {
      return;
    }
    const target = pendingTabCloseTarget;
    setPendingTabCloseTarget(null);
    closeProjectTab(target);
  }, [activeProjectTarget, closeProjectTab, pendingTabCloseTarget, workspaceSaveAvailable]);
  useEffect(() => {
    if (browserPreview || !isTauri()) return;
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen("project-open-menu-request", () => {
      openProjectFromWorkspace();
    }).then((unlisten) => {
      if (disposed) unlisten();
      else stopListening = unlisten;
    });
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [browserPreview, openProjectFromWorkspace]);
  const resetEvaluationCase = useCallback(() => {
    setActiveProject(null);
    setActiveVisualizationProject(null);
    setActiveSpecializedEntryDraft(null);
    setActiveProjectTabTarget(null);
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
        setActiveVisualizationProject(null);
        setActiveSpecializedEntryDraft(null);
        setActiveProjectTabTarget(null);
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
    const openProjectTarget =
      activeProjectActions.openAnyProjectTarget ?? activeProjectActions.openProjectTarget;
    if (browserPreview || !isTauri() || !openProjectTarget) return;
    let disposed = false;
    let stopListening: (() => void) | undefined;
    const inFlightTargets = new Set<string>();
    const handleTargets = async (targets: readonly string[]) => {
      const target = [...targets].reverse().find((candidate) => !inFlightTargets.has(candidate));
      if (!target) return;
      const openTarget = async () => {
        inFlightTargets.add(target);
        try {
          const opened = await openProjectTarget(target).then((project) =>
            "kind" in project ? project : { kind: "experiment" as const, project },
          );
          if (disposed) return;
          activateOpenedProject(opened, "system");
        } catch (error) {
          if (disposed) return;
          recordDiagnosticError("PROJECT_OPEN_FAILED", error);
          setSystemOpenError(
            actionErrorMessage(
              error,
              t("指定されたプロジェクトを開けませんでした。", "The selected project could not be opened."),
              locale,
            ),
          );
        } finally {
          inFlightTargets.delete(target);
        }
      };
      if (!workspaceDirtyRef.current || checkpointActiveWorkspace()) {
        await openTarget();
        return;
      }
      requestWorkspaceExit({ actionLabel: "指定されたプロジェクトを開く", proceed: openTarget });
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
  }, [
    activeProjectActions.openAnyProjectTarget,
    activeProjectActions.openProjectTarget,
    browserPreview,
    checkpointActiveWorkspace,
    activateOpenedProject,
    requestWorkspaceExit,
  ]);

  const orderedCurveIntent =
    dedicatedEntryIntent?.moduleId === "ordered_curve_kinetics" ? dedicatedEntryIntent : undefined;
  const timeToEventIntent =
    !adaptiveSurvivalHandoff && dedicatedEntryIntent?.moduleId === "time_to_event"
      ? dedicatedEntryIntent
      : undefined;
  const matrixVisualizationIntent =
    dedicatedEntryIntent?.moduleId === "matrix_visualization" ? dedicatedEntryIntent : undefined;
  const page = (() => {
    switch (route) {
      case "contingency":
      case "repeated-nonparametric":
      case "regression":
      case "nonlinear-fit":
      case "distribution":
        if (route !== "nonlinear-fit" && experimentFirstEntryEnabled) {
          return <LegacyAnalysisEntryStop onBack={() => navigate("new-experiment")} />;
        }
        if (
          route === "nonlinear-fit" &&
          !specializedEntryAvailable &&
          activeSpecializedEntryDraft?.project.state.route !== "nonlinear-fit"
        ) {
          return (
            <SpecializedEntryPersistenceStop
              entryLabel={t("濃度–反応・酵素反応", "Concentration–response / enzyme kinetics")}
              onBack={() => navigate("new-experiment")}
            />
          );
        }
        return (
          <>
            {route !== "nonlinear-fit" && !experimentFirstEntryEnabled ? (
              <CompatibilityModeNotice />
            ) : null}
            <CommonCoveragePage
              key={`${route}:${activeSpecializedEntryDraft?.project.target ?? "none"}`}
              mode={route}
              onBack={() => navigateAsFreshStart("new-experiment")}
              onNavigate={analysisRouteSwitcherAccess ? navigate : undefined}
              analysisRouteSwitcherAccess={analysisRouteSwitcherAccess ?? undefined}
              onOpenProject={browserPreview ? undefined : openProjectFromWorkspace}
              saveProject={browserPreview ? undefined : saveProject}
              saveSpecializedEntryDraftProject={specializedEntryDraftPersistence?.save}
              initialSpecializedEntryDraft={
                route === "nonlinear-fit" &&
                activeSpecializedEntryDraft?.project.state.route === "nonlinear-fit"
                  ? activeSpecializedEntryDraft.project
                  : undefined
              }
              analysisAvailable={analysisAvailable}
              initialDraft={scopedSpecializedDraft(
                specializedDrafts.current[route],
                route === "nonlinear-fit" ? orderedCurveIntent : undefined,
              )}
              onDraftChange={(draft) => rememberSpecializedDraft(route, draft)}
              entryIntent={route === "nonlinear-fit" ? orderedCurveIntent : undefined}
              onDirtyChange={updateWorkspaceDirty}
              onRequestExit={requestWorkspaceExit}
              onRegisterSaveHandler={browserPreview ? undefined : registerWorkspaceSaveHandler}
            />
          </>
        );
      case "survival":
        if (
          !specializedEntryAvailable &&
          activeSpecializedEntryDraft?.project.state.route !== "survival"
        ) {
          return (
            <SpecializedEntryPersistenceStop
              entryLabel={t("生存時間", "Survival")}
              onBack={() => navigate("new-experiment")}
            />
          );
        }
        return (
          <SpecializedCorePage
            key={`${route}:${activeSpecializedEntryDraft?.project.target ?? "none"}`}
            mode="survival"
            onBack={() => navigateAsFreshStart("new-experiment")}
            onNavigate={analysisRouteSwitcherAccess ? navigate : undefined}
            analysisRouteSwitcherAccess={analysisRouteSwitcherAccess ?? undefined}
            onOpenProject={browserPreview ? undefined : openProjectFromWorkspace}
            saveProject={browserPreview ? undefined : saveProject}
            saveSpecializedEntryDraftProject={specializedEntryDraftPersistence?.save}
            initialSpecializedEntryDraft={
              activeSpecializedEntryDraft?.project.state.route === "survival"
                ? activeSpecializedEntryDraft.project
                : undefined
            }
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
            onDirtyChange={updateWorkspaceDirty}
            onRequestExit={requestWorkspaceExit}
            onRegisterSaveHandler={browserPreview ? undefined : registerWorkspaceSaveHandler}
          />
        );
      case "heatmap":
        if (
          !browserPreview &&
          !unresolvedVisualizationPersistence &&
          activeVisualizationProject?.project.state.entryIntent !== "matrix_visualization"
        ) {
          return (
            <UnresolvedVisualizationPersistenceStop onBack={() => navigate("new-experiment")} />
          );
        }
        return (
          <SpecializedCorePage
            key={`${route}:${activeVisualizationProject?.project.target ?? "none"}:${newExperimentSession}`}
            mode="heatmap"
            onBack={() => navigateAsFreshStart("new-experiment")}
            onNavigate={analysisRouteSwitcherAccess ? navigate : undefined}
            analysisRouteSwitcherAccess={analysisRouteSwitcherAccess ?? undefined}
            onOpenProject={browserPreview ? undefined : openProjectFromWorkspace}
            saveProject={browserPreview ? undefined : saveProject}
            saveUnresolvedVisualizationProject={unresolvedVisualizationPersistence?.save}
            openUnresolvedVisualizationProject={unresolvedVisualizationPersistence?.open}
            initialVisualizationProject={
              activeVisualizationProject?.project.state.entryIntent === "matrix_visualization"
                ? activeVisualizationProject.project
                : undefined
            }
            initialDraft={specializedDrafts.current.heatmap}
            onDraftChange={(draft) => rememberSpecializedDraft("heatmap", draft)}
            entryIntent={matrixVisualizationIntent}
            onDirtyChange={updateWorkspaceDirty}
            onRequestExit={requestWorkspaceExit}
            onRegisterSaveHandler={browserPreview ? undefined : registerWorkspaceSaveHandler}
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
            key={`${reusedDraft ? `reuse:${reusedDraft.name}` : "new"}:${newExperimentSession}:${activeVisualizationProject?.project.target ?? "none"}`}
            onNavigate={navigate}
            saveProject={browserPreview ? undefined : saveProject}
            saveUnresolvedVisualizationProject={unresolvedVisualizationPersistence?.save}
            openUnresolvedVisualizationProject={unresolvedVisualizationPersistence?.open}
            initialGraphOnlyState={
              activeVisualizationProject?.project.state.entryIntent === "graph_only"
                ? activeVisualizationProject.project.state
                : null
            }
            initialGraphOnlyTarget={
              activeVisualizationProject?.project.state.entryIntent === "graph_only"
                ? activeVisualizationProject.project.target
                : undefined
            }
            specializedEntryAvailable={specializedEntryAvailable}
            browserPreview={browserPreview}
            analysisAvailable={analysisAvailable}
            initialDraft={reusedDraft}
            favoriteGraphDefaults={favoriteDefaults}
            onSaveFavorite={(draft, graphs) => {
              saveFavoriteDesign(draft, graphs);
              setFavorites(loadFavoriteDesigns());
            }}
            onDirtyChange={updateWorkspaceDirty}
            onOpenProject={browserPreview ? undefined : openProjectFromWorkspace}
            onRequestExit={requestWorkspaceExit}
            onRegisterSaveHandler={browserPreview ? undefined : registerWorkspaceSaveHandler}
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
              requestWorkspaceExit({
                actionLabel: "最近のプロジェクトを開く",
                proceed: async () => {
                  try {
                    await openProjectTabTarget(recent.target);
                  } catch (error) {
                    recordDiagnosticError("PROJECT_OPEN_FAILED", error);
                    setSystemOpenError(
                      actionErrorMessage(
                        error,
                        t("最近のプロジェクトを開けませんでした。", "The recent project could not be opened."),
                        locale,
                      ),
                    );
                    navigate("open-project");
                  }
                },
              });
            }}
            onRemoveRecent={(target) => setRecentProjects(removeRecentProject(target))}
          />
        );
      case "open-project":
        return (
          <OpenProjectPage
            onNavigate={navigate}
            openProject={activeProjectActions.openProject}
            openAnyProject={activeProjectActions.openAnyProject}
            openLegacyProject={activeProjectActions.openLegacyProject}
            persistedProject={activeProject}
            onProjectOpened={(project) => {
              if (project) activateOpenedProject({ kind: "experiment", project }, "dialog");
            }}
            onAnyProjectOpened={(opened) => activateOpenedProject(opened, "dialog")}
            saveProject={browserPreview ? undefined : saveProject}
            onReuseDesign={(draft) => {
              requestWorkspaceExit({
                actionLabel: "設計を使って新しい実験を始める",
                proceed: () => {
                  setWorkspaceDirty(false);
                  setReusedDraft(reuseExperimentDesign(draft));
                  setFavoriteDefaults([]);
                  navigate("new-experiment");
                },
              });
            }}
            onSaveFavorite={(draft, graphs) => {
              saveFavoriteDesign(draft, graphs);
              setFavorites(loadFavoriteDesigns());
            }}
            autoOpen={!browserPreview && !systemOpenError}
            initialError={systemOpenError}
            onDirtyChange={updateWorkspaceDirty}
            onOpenProject={browserPreview ? undefined : openProjectFromWorkspace}
            onRequestExit={requestWorkspaceExit}
            onRegisterSaveHandler={browserPreview ? undefined : registerWorkspaceSaveHandler}
            restoredSpecializedDrafts={specializedDrafts.current}
          />
        );
      case "home":
      default:
        return <HomePage onNavigate={navigateAsFreshStart} />;
    }
  })();

  return (
    <>
      <AppShell
        route={route}
        onNavigate={navigateAsFreshStart}
        onResetEvaluationCase={resetEvaluationCase}
        onUseLiteratureCase={useLiteratureCase}
        browserPreview={browserPreview}
        evaluationPreview={evaluationPreview}
        activeProject={activeProject?.state ?? null}
        projectTabs={projectTabs}
        activeProjectTarget={activeProjectTarget}
        workspaceDirty={workspaceDirty}
        onSelectProjectTab={browserPreview ? undefined : selectProjectTab}
        onCloseProjectTab={browserPreview ? undefined : closeProjectTab}
        onOpenProject={browserPreview ? undefined : openProjectFromWorkspace}
      >
        {systemOpenError &&
        (activeProject || activeVisualizationProject || activeSpecializedEntryDraft) ? (
          <div className="app-system-alert" role="alert">
            <span>
              {locale === "ja"
                ? systemOpenError
                : "The operation could not be completed. The current workspace was retained."}
            </span>
            <button type="button" onClick={() => setSystemOpenError(null)}>
              {t("閉じる", "Close")}
            </button>
          </div>
        ) : null}
        <Suspense
          fallback={
            <p className="app-route-loading" role="status">
              {t("画面を読み込んでいます…", "Loading this workspace…")}
            </p>
          }
        >
          {page}
        </Suspense>
      </AppShell>
      {pendingWorkspaceExit ? (
        <UnsavedChangesDialog
          actionLabel={pendingWorkspaceExit.actionLabel}
          canSave={workspaceSaveAvailable}
          saving={workspaceExitSaving}
          error={workspaceExitError}
          onSaveAndContinue={() => void saveAndContinueWorkspaceExit()}
          onDiscard={discardAndContinueWorkspaceExit}
          onCancel={cancelWorkspaceExit}
        />
      ) : null}
    </>
  );
}
