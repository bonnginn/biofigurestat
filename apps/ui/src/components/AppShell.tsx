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
  const locale = useAppLocale();
  const ja = locale === "ja";

  useLayoutEffect(() => {
    const heading = mainContentRef.current?.querySelector<HTMLElement>("h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [route]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => onNavigate("home")}>
          <img className="brand-mark" src="/biofigurestat-icon.png" alt="" aria-hidden="true" />
          <span>
            <span className="brand-title">{PRODUCT_IDENTITY.displayNameJa}</span>
            <span className="brand-subtitle">
              {ja ? "ローカル研究ワークスペース" : "Local research workspace"}
            </span>
          </span>
        </button>
        <nav
          className="topbar-nav"
          aria-label={ja ? "ワークスペースのナビゲーション" : "Workspace navigation"}
        >
          <button
            className={route === "home" ? "is-active" : ""}
            type="button"
            aria-current={route === "home" ? "page" : undefined}
            onClick={() => onNavigate("home")}
          >
            <span aria-hidden="true">⌂</span>{" "}
            <span className="topbar-nav__label">{ja ? "ホーム" : "Home"}</span>
          </button>
          <button
            className={route === "new-experiment" ? "is-active" : ""}
            type="button"
            aria-current={route === "new-experiment" ? "page" : undefined}
            onClick={() => onNavigate("new-experiment")}
          >
            <span aria-hidden="true">＋</span>{" "}
            <span className="topbar-nav__label">{ja ? "新しい実験" : "New experiment"}</span>
          </button>
        </nav>
        <div
          className="topbar-status"
          aria-label={ja ? "アプリケーションの状態" : "Application status"}
        >
          <span className="status-dot" aria-hidden="true" />
          <span>
            {import.meta.env.DEV && evaluationPreview
              ? ja
                ? "合成データ評価環境"
                : "Synthetic-data evaluation"
              : browserPreview
                ? ja
                  ? "合成デモ・一時プレビュー"
                  : "Synthetic demo preview"
                : usageConsent === "opted_in"
                  ? ja
                    ? "研究データはローカル・利用情報収集ON"
                    : "Research data stay local · usage data ON"
                  : ja
                    ? "ローカルのみ"
                    : "Local only"}
          </span>
        </div>
        <div className="topbar-language" role="group" aria-label={ja ? "表示言語" : "Language"}>
          <button
            type="button"
            className={ja ? "is-active" : ""}
            aria-pressed={ja}
            aria-label={ja ? "日本語" : "Japanese"}
            onClick={() => setAppLocale("ja")}
          >
            JP
          </button>
          <button
            type="button"
            className={!ja ? "is-active" : ""}
            aria-pressed={!ja}
            aria-label="English"
            onClick={() => setAppLocale("en")}
          >
            EN
          </button>
        </div>
        <ContextualHelp
          context={{
            surface:
              route === "new-experiment" ? "design" : route === "open-project" ? "data" : "home",
          }}
        />
        <AboutPanel />
        <DiagnosticPanel route={route} project={activeProject} />
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
              ? ja
                ? "開発用Benchmark / Evaluation環境"
                : "Development benchmark / evaluation"
              : ja
                ? "ブラウザUXプレビュー"
                : "Browser UX preview"}
          </strong>
          <span>
            {import.meta.env.DEV && evaluationPreview
              ? ja
                ? "合成benchmarkデータ専用です。ネイティブ版と同じ固定統計エンジンを使いますが、未発表データを入力しないでください。"
                : "For synthetic benchmark data only. It uses the fixed native statistical engine; do not enter unpublished data."
              : ja
                ? "合成デモデータ専用です。プロジェクトの保存・読込とローカル統計解析は無効です。"
                : "For synthetic demo data only. Project save/open and local statistical analysis are disabled."}
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
