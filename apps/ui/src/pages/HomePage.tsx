import { workspaceRoutes, type AppRoute } from "../app/routes";
import { RouteCard } from "../components/RouteCard";

type HomePageProps = {
  onNavigate: (route: AppRoute) => void;
};

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="page-stack">
      <section className="hero" aria-labelledby="home-heading">
        <div className="hero-copy">
          <p className="overline">研究ワークスペース / 01</p>
          <h1 id="home-heading">どの実験を整理しますか？</h1>
          <p className="hero-lead">
            新規作成、よく使う設計、保存済みプロジェクトから作業を始められます。
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
            <p className="overline">ここから開始</p>
            <h2 id="route-heading">ワークスペース</h2>
          </div>
          <span className="section-hint">4つの入口</span>
        </div>
        <div className="route-grid">
          {workspaceRoutes.map((route) => (
            <RouteCard key={route.id} route={route} onNavigate={onNavigate} />
          ))}
        </div>
      </section>

      <aside className="principle-callout" aria-label="実験の内容を整理する案内">
        <span className="callout-mark" aria-hidden="true">
          ◎
        </span>
        <div>
          <strong>実験から始めるか、専用シートへ直接進む</strong>
          <p>
            新しい実験では、処理・群分けと測定内容から入力表を作れます。生存時間、濃度–反応、ヒートマップは専用の入力形式を選べます。
          </p>
        </div>
      </aside>
    </div>
  );
}
