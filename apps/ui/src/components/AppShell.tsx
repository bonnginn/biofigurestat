import type { PropsWithChildren } from "react";

import type { AppRoute } from "../app/routes";
import { BenchmarkRunBar } from "./BenchmarkRunBar";

type AppShellProps = PropsWithChildren<{
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onResetEvaluationCase?: () => void;
  browserPreview?: boolean;
  evaluationPreview?: boolean;
}>;

export function AppShell({
  children,
  route,
  onNavigate,
  onResetEvaluationCase,
  browserPreview = false,
  evaluationPreview = false,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => onNavigate("home")}>
          <span className="brand-mark" aria-hidden="true">
            LS
          </span>
          <span>
            <span className="brand-title">ライフサイエンス解析</span>
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
            <span aria-hidden="true">⌂</span> ホーム
          </button>
          <button
            className={route === "new-experiment" ? "is-active" : ""}
            type="button"
            aria-current={route === "new-experiment" ? "page" : undefined}
            onClick={() => onNavigate("new-experiment")}
          >
            <span aria-hidden="true">＋</span> 新しい実験
          </button>
        </nav>
        <div className="topbar-status" aria-label="アプリケーションの状態">
          <span className="status-dot" aria-hidden="true" />
          <span>
            {evaluationPreview
              ? "合成データ評価環境"
              : browserPreview
                ? "合成デモ・一時プレビュー"
                : "ローカルのみ"}
          </span>
        </div>
      </header>

      {browserPreview ? (
        <div className="browser-preview-banner" role="status">
          <strong>
            {evaluationPreview ? "開発用Benchmark / Evaluation環境" : "ブラウザUXプレビュー"}
          </strong>
          <span>
            {evaluationPreview
              ? "合成benchmarkデータ専用です。ネイティブ版と同じ固定統計エンジンを使いますが、未発表データを入力しないでください。"
              : "合成デモデータ専用です。プロジェクトの保存・読込とローカル統計解析は無効です。"}
          </span>
        </div>
      ) : null}
      {evaluationPreview ? (
        <BenchmarkRunBar onNavigateHome={onResetEvaluationCase ?? (() => onNavigate("home"))} />
      ) : null}

      <div className="shell-body">
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
