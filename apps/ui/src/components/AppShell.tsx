import { Suspense, lazy, useLayoutEffect, useRef, type PropsWithChildren } from "react";
import type { ProjectState } from "@lsaa/project";

import type { AppRoute } from "../app/routes";
import type { LiteratureExperimenterCase } from "../app/literatureBenchmark";
import { PRODUCT_IDENTITY } from "../app/productIdentity";
import { DiagnosticPanel } from "./DiagnosticPanel";
import { ContextualHelp } from "./ContextualHelp";
import { AboutPanel } from "./AboutPanel";
import { UsageTelemetryController } from "./UsageTelemetryController";
import { useUsageConsent } from "../app/usageTelemetry";
import { ProjectTabBar, type ProjectTab } from "./ProjectTabBar";
import { setAppLocale, useAppLocale } from "../app/appLocale";
import { WorkspaceIconButton } from "./WorkspaceIconButton";
import "./CompactWorkspace.css";
import "./DiagnosticPanel.css";
import "./AboutPanel.css";

const DevelopmentBenchmarkRunBar = import.meta.env.DEV
  ? lazy(() =>
      import("./BenchmarkRunBar").then(({ BenchmarkRunBar }) => ({ default: BenchmarkRunBar })),
    )
  : null;

type AppShellProps = PropsWithChildren<{
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onResetEvaluationCase?: () => void;
  onUseLiteratureCase?: (source: LiteratureExperimenterCase) => void;
  browserPreview?: boolean;
  evaluationPreview?: boolean;
  activeProject?: ProjectState | null;
  projectTabs?: readonly ProjectTab[];
  activeProjectTarget?: string | null;
  workspaceDirty?: boolean;
  onSelectProjectTab?: (target: string) => void;
  onCloseProjectTab?: (target: string) => void;
  onOpenProject?: () => void;
}>;

export function AppShell({
  children,
  route,
  onNavigate,
  onResetEvaluationCase,
  onUseLiteratureCase,
  browserPreview = false,
  evaluationPreview = false,
  activeProject = null,
  projectTabs = [],
  activeProjectTarget = null,
  workspaceDirty = false,
  onSelectProjectTab,
  onCloseProjectTab,
  onOpenProject,
}: AppShellProps) {
  const mainContentRef = useRef<HTMLElement>(null);
  const usageConsent = useUsageConsent();
  const shellRef = useRef<HTMLDivElement>(null);
  const locale = useAppLocale();
  const ja = locale === "ja";
  const hasProjectTabs = projectTabs.length > 0;
  const showProjectTabs = Boolean(onSelectProjectTab && onCloseProjectTab && onOpenProject);
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const chrome = [
      ...shell.querySelectorAll<HTMLElement>(":scope > .topbar, :scope > .project-tabs"),
    ];
    const updateInset = () =>
      shell.style.setProperty(
        "--app-sticky-chrome-inset",
        `${chrome.reduce((height, node) => height + node.getBoundingClientRect().height, 0)}px`,
      );
    updateInset();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateInset);
    chrome.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [hasProjectTabs, showProjectTabs]);

  useLayoutEffect(() => {
    const heading = mainContentRef.current?.querySelector<HTMLElement>("h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [route]);

  return (
    <div className="app-shell app-shell--compact" ref={shellRef}>
      <header className="topbar">
        <button
          className="brand"
          type="button"
          title={ja ? "BioFigureStat — ホーム" : "BioFigureStat — Home"}
          onClick={() => onNavigate("home")}
        >
          <img className="brand-mark" src="/biofigurestat-icon.png" alt="" aria-hidden="true" />
          <span className="brand-title">{PRODUCT_IDENTITY.displayNameJa}</span>
        </button>
        <nav
          className="topbar-nav"
          aria-label={ja ? "ワークスペースのナビゲーション" : "Workspace navigation"}
        >
          <WorkspaceIconButton
            action="home"
            label={ja ? "ホーム" : "Home"}
            aria-current={route === "home" ? "page" : undefined}
            onClick={() => onNavigate("home")}
          />
          <WorkspaceIconButton
            action="new"
            label={ja ? "新しい実験" : "New experiment"}
            aria-current={route === "new-experiment" ? "page" : undefined}
            onClick={() => onNavigate("new-experiment")}
          />
          {onOpenProject && !showProjectTabs ? (
            <WorkspaceIconButton
              action="open"
              label={ja ? "プロジェクトを開く" : "Open project"}
              onClick={onOpenProject}
            />
          ) : null}
        </nav>
        <details
          className="workspace-utilities"
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              !event.defaultPrevented &&
              !event.nativeEvent.isComposing &&
              !(event.target as Element).closest("dialog[open], [role=dialog]") &&
              event.currentTarget.contains(event.target as Node)
            ) {
              event.preventDefault();
              event.currentTarget.open = false;
              event.currentTarget.querySelector<HTMLElement>("summary")?.focus();
            }
          }}
        >
          <summary
            title={
              ja ? "ヘルプ・表示言語・アプリ情報" : "Help, language, and application information"
            }
          >
            {ja ? "ヘルプ・設定" : "Help & settings"}
          </summary>
          <div className="workspace-utilities__panel">
            <div
              className="topbar-status"
              aria-label={ja ? "アプリケーションの状態" : "Application status"}
            >
              <span className="status-dot" aria-hidden="true" />
              <span>
                {import.meta.env.DEV && evaluationPreview
                  ? ja
                    ? "合成データ評価環境"
                    : "Synthetic evaluation environment"
                  : browserPreview
                    ? ja
                      ? "合成デモ・一時プレビュー"
                      : "Temporary demo preview"
                    : usageConsent === "opted_in"
                      ? ja
                        ? "研究データはローカル・利用情報収集ON"
                        : "Research data stays local · usage collection ON"
                      : ja
                        ? "ローカルのみ"
                        : "Local only"}
              </span>
            </div>
            <div className="topbar-language" role="group" aria-label={ja ? "表示言語" : "Language"}>
              <button
                type="button"
                aria-pressed={ja}
                aria-label={ja ? "日本語" : "Japanese"}
                className={ja ? "is-active" : ""}
                onClick={() => setAppLocale("ja")}
              >
                JP
              </button>
              <button
                type="button"
                aria-pressed={!ja}
                aria-label="English"
                className={!ja ? "is-active" : ""}
                onClick={() => setAppLocale("en")}
              >
                EN
              </button>
            </div>
            <ContextualHelp
              context={{
                surface:
                  route === "new-experiment"
                    ? "design"
                    : route === "open-project"
                      ? "data"
                      : "home",
              }}
            />
            <AboutPanel />
            <DiagnosticPanel route={route} project={activeProject} />
          </div>
        </details>
      </header>

      {onSelectProjectTab && onCloseProjectTab && onOpenProject ? (
        <ProjectTabBar
          tabs={projectTabs}
          activeTarget={activeProjectTarget}
          activeDirty={workspaceDirty}
          onSelect={onSelectProjectTab}
          onClose={onCloseProjectTab}
          onOpen={onOpenProject}
        />
      ) : null}

      {browserPreview ? (
        <div className="browser-preview-banner" role="status">
          <strong>
            {import.meta.env.DEV && evaluationPreview
              ? "開発用Benchmark / Evaluation環境"
              : "ブラウザUXプレビュー"}
          </strong>
          <span>
            {import.meta.env.DEV && evaluationPreview
              ? "合成benchmarkデータ専用です。ネイティブ版と同じ固定統計エンジンを使いますが、未発表データを入力しないでください。"
              : "合成デモデータ専用です。プロジェクトの保存・読込とローカル統計解析は無効です。"}
          </span>
        </div>
      ) : null}
      {import.meta.env.DEV && evaluationPreview && DevelopmentBenchmarkRunBar ? (
        <Suspense fallback={null}>
          <DevelopmentBenchmarkRunBar
            onNavigateHome={onResetEvaluationCase ?? (() => onNavigate("home"))}
            onUseLiteratureCase={onUseLiteratureCase}
          />
        </Suspense>
      ) : null}

      <div className="shell-body">
        <main className="main-content" ref={mainContentRef}>
          {children}
        </main>
      </div>
      <UsageTelemetryController route={route} />
    </div>
  );
}
