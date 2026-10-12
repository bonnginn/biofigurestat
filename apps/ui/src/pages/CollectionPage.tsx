import type { AppRoute } from "../app/routes";
import type { FavoriteDesign } from "../app/favoriteDesigns";
import type { RecentProject } from "../app/recentProjects";

type CollectionPageProps = {
  kind: "favorites" | "recent";
  onNavigate: (route: AppRoute) => void;
  favorites?: readonly FavoriteDesign[];
  onUseFavorite?: (favorite: FavoriteDesign) => void;
  onRemoveFavorite?: (id: string) => void;
  recentProjects?: readonly RecentProject[];
  onOpenRecent?: (project: RecentProject) => void;
  onRemoveRecent?: (target: string) => void;
};

export function CollectionPage({
  kind,
  onNavigate,
  favorites = [],
  onUseFavorite,
  onRemoveFavorite,
  recentProjects = [],
  onOpenRecent,
  onRemoveRecent,
}: CollectionPageProps) {
  const isFavorites = kind === "favorites";
  const title = isFavorites ? "お気に入り" : "最近のプロジェクト";
  const description = isFavorites
    ? "保存した実験デザインがここに表示されます。実験データは保存されません。"
    : "最近開いたローカルプロジェクトがここに表示されます。";

  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={() => onNavigate("home")}>
        <span aria-hidden="true">←</span> ワークスペースに戻る
      </button>
      <section className="empty-page" aria-labelledby={`${kind}-heading`}>
        <span className="empty-icon" aria-hidden="true">
          {isFavorites ? "☆" : "◷"}
        </span>
        <p className="overline">ワークスペース / {isFavorites ? "01" : "03"}</p>
        <h1 id={`${kind}-heading`}>{title}</h1>
        <p>{description}</p>
        {isFavorites && favorites.length > 0 ? (
          <ul className="collection-list" aria-label="保存した実験デザイン">
            {favorites.map((favorite) => (
              <li key={favorite.id}>
                <div>
                  <strong>{favorite.name}</strong>
                  <span>
                    {favorite.draft.conditions.length}条件・{favorite.draft.readouts.length}測定項目
                  </span>
                </div>
                <button type="button" onClick={() => onUseFavorite?.(favorite)}>
                  この設計から始める
                </button>
                <button type="button" onClick={() => onRemoveFavorite?.(favorite.id)}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {!isFavorites && recentProjects.length > 0 ? (
          <ul className="collection-list" aria-label="最近のローカルプロジェクト">
            {recentProjects.map((project) => (
              <li key={project.target}>
                <div>
                  <strong>{project.name}</strong>
                  <span>{new Date(project.lastOpenedAt).toLocaleString("ja-JP")}</span>
                </div>
                <button type="button" onClick={() => onOpenRecent?.(project)}>
                  開く
                </button>
                <button type="button" onClick={() => onRemoveRecent?.(project.target)}>
                  履歴から削除
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          className="secondary-button"
          type="button"
          onClick={() => onNavigate("new-experiment")}
        >
          新しい実験を始める <span aria-hidden="true">→</span>
        </button>
      </section>
    </div>
  );
}
