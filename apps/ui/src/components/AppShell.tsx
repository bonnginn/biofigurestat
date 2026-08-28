import { Suspense, lazy, useLayoutEffect, useRef, type PropsWithChildren } from "react";
import type { ProjectState } from "@lsaa/project";

import type { AppRoute } from "../app/routes";
import type { LiteratureExperimenterCase } from "../app/literatureBenchmark";
import { PRODUCT_IDENTITY } from "../app/productIdentity";
import { DiagnosticPanel } from "./DiagnosticPanel";
import { ContextualHelp } from "./ContextualHelp";
import { AboutPanel } from "./AboutPanel";
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
}: AppShellProps) {
  const mainContentRef = useRef<HTMLElement>(null);

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
          <span className="brand-mark" aria-hidden="true">
            {PRODUCT_IDENTITY.shortMark}
          </span>
          <span>
            <span className="brand-title">{PRODUCT_IDENTITY.displayNameJa}</span>
            <span className="brand-subtitle">ローカル研究ワークスペース</span>
          </span>
        </button>
        <nav className="topbar-nav" aria-label="ワークスペースのナビゲーション">
          <button
            className={route === "home" ? "is-active" : ""}
            type="button"
            aria-current={route === "home" ? "page" : undefined}
            onClick={() => onNavigate("home")}
          >
            <span aria-hidden="true">⌂</span> <span className="topbar-nav__label">ホーム</span>
          </button>
          <button
            className={route === "new-experiment" ? "is-active" : ""}
            type="button"
            aria-current={route === "new-experiment" ? "page" : undefined}
            onClick={() => onNavigate("new-experiment")}
          >
            <span aria-hidden="true">＋</span> <span className="topbar-nav__label">新しい実験</span>
          </button>
        </nav>
        <div className="topbar-status" aria-label="アプリケーションの状態">
          <span className="status-dot" aria-hidden="true" />
          <span>
            {import.meta.env.DEV && evaluationPreview
              ? "合成データ評価環境"
              : browserPreview
                ? "合成デモ・一時プレビュー"
                : "ローカルのみ"}
          </span>
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
    </div>
  );
}
