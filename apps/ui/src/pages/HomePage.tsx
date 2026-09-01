import { workspaceRoutes, type AppRoute } from "../app/routes";
import { RouteCard } from "../components/RouteCard";
import { useAppLocale } from "../app/appLocale";

type HomePageProps = {
  onNavigate: (route: AppRoute) => void;
  onStartFiveMinuteGuide: () => void;
};

export function HomePage({ onNavigate, onStartFiveMinuteGuide }: HomePageProps) {
  const locale = useAppLocale();
  const text = locale === "ja";
  return (
    <div className="page-stack">
      <section className="hero" aria-labelledby="home-heading">
        <div className="hero-copy">
          <p className="overline">{text ? "研究ワークスペース / 01" : "Research workspace / 01"}</p>
          <h1 id="home-heading">{text ? "どの実験を整理しますか？" : "Which experiment are you working on?"}</h1>
          <p className="hero-lead">
            {text
              ? "新規作成、よく使う設計、保存済みプロジェクトから作業を始められます。"
              : "Start a new experiment, reuse a saved design, or continue a saved project."}
          </p>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <span className="orbit-dot" />
          <span className="hero-initials">LS</span>
        </div>
      </section>

      <section className="route-section" aria-labelledby="route-heading">
        <div className="section-heading-row">
          <div>
            <p className="overline">{text ? "ここから開始" : "Start here"}</p>
            <h2 id="route-heading">{text ? "ワークスペース" : "Workspace"}</h2>
          </div>
          <span className="section-hint">{text ? "4つの入口" : "4 entry points"}</span>
        </div>
        <div className="route-grid">
          {workspaceRoutes.map((route) => (
            <RouteCard key={route.id} route={route} onNavigate={onNavigate} />
          ))}
        </div>
      </section>

      <aside className="principle-callout" aria-label={text ? "5分ガイド" : "Five-minute guide"}>
        <span className="callout-mark" aria-hidden="true">5</span>
        <div>
          <strong>{text ? "初めての方：5分で一連の流れを試す" : "New here? Try the complete workflow in five minutes"}</strong>
          <p>
            {text
              ? "人工データを使い、Data → Graph → Statistics → Methodsを1本の案内で確認します。実測データやファイルは使いません。"
              : "Use artificial data to follow one guided Data → Graph → Statistics → Methods workflow. No measured data or files are used."}
          </p>
          <button type="button" onClick={onStartFiveMinuteGuide}>
            {text ? "5分ガイドを開始" : "Start the five-minute guide"}
          </button>
        </div>
      </aside>

      <aside
        className="principle-callout"
        aria-label={text ? "実験の内容を整理する案内" : "How to organize an experiment"}
      >
        <span className="callout-mark" aria-hidden="true">
          ◎
        </span>
        <div>
          <strong>
            {text
              ? "実験から始めるか、専用シートへ直接進む"
              : "Start from the experiment or open a dedicated worksheet"}
          </strong>
          <p>
            {text
              ? "新しい実験では、処理・群分けと測定内容から入力表を作れます。生存時間、濃度–反応、ヒートマップは専用の入力形式を選べます。"
              : "New experiment builds a worksheet from treatments, groups, and readouts. Survival, dose-response, and heatmap data also have dedicated formats."}
          </p>
        </div>
      </aside>
    </div>
  );
}
