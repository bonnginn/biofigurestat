import { primaryRoutes, type AppRoute } from "../app/routes";
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
            入口を選ぶと、実験の背景と行った操作を整理しながら、入力からグラフまで進めます。
          </p>
          <p className="hero-japanese">
            実験で行った操作を答えると、設計に合った入力画面へ進みます。
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
          <span className="section-hint">6つの入口</span>
        </div>
        <div className="route-grid">
          {primaryRoutes.map((route) => (
            <RouteCard key={route.id} route={route} onNavigate={onNavigate} />
          ))}
        </div>
      </section>

      <aside className="principle-callout" aria-label="実験の内容を整理する案内">
        <span className="callout-mark" aria-hidden="true">
          ◎
        </span>
        <div>
          <strong>実験の内容を先に整理</strong>
          <p>
            細胞・培養などの背景、測定項目、条件、時間、実験回を短い質問で整理してから入力を始めます。
          </p>
        </div>
      </aside>
    </div>
  );
}
