import type { AppRoute } from "../app/routes";
import type { FavoriteDesign } from "../app/favoriteDesigns";
import type { RecentProject } from "../app/recentProjects";
import { localizedText, useAppLocale } from "../app/appLocale";

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
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const isFavorites = kind === "favorites";
  const title = isFavorites ? t("お気に入り", "Favorites") : t("最近のプロジェクト", "Recent projects");
  const description = isFavorites
    ? t("保存した実験デザインがここに表示されます。実験データは保存されません。", "Saved experiment designs appear here. Measurement data are not included in favorites.")
    : t("最近開いたローカルプロジェクトがここに表示されます。", "Recently opened local projects appear here.");

  return (
    <div className="page-stack narrow-page">
      <button className="back-link" type="button" onClick={() => onNavigate("home")}>
        <span aria-hidden="true">←</span> {t("ワークスペースに戻る", "Back to workspace")}
      </button>
      <section className="empty-page" aria-labelledby={`${kind}-heading`}>
        <span className="empty-icon" aria-hidden="true">
          {isFavorites ? "☆" : "◷"}
        </span>
        <p className="overline">{t("ワークスペース", "Workspace")} / {isFavorites ? "01" : "03"}</p>
        <h1 id={`${kind}-heading`}>{title}</h1>
        <p>{description}</p>
        {isFavorites && favorites.length > 0 ? (
          <ul className="collection-list" aria-label={t("保存した実験デザイン", "Saved experiment designs")}>
            {favorites.map((favorite) => (
              <li key={favorite.id}>
                <div>
                  <strong>{favorite.name}</strong>
                  <span>
                    {locale === "ja"
                      ? `${favorite.draft.conditions.length}条件・${favorite.draft.readouts.length}測定項目`
                      : `${favorite.draft.conditions.length} conditions · ${favorite.draft.readouts.length} readouts`}
                  </span>
                </div>
                <button type="button" onClick={() => onUseFavorite?.(favorite)}>
                  {t("この設計から始める", "Use this design")}
                </button>
                <button type="button" onClick={() => onRemoveFavorite?.(favorite.id)}>
                  {t("削除", "Remove")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {!isFavorites && recentProjects.length > 0 ? (
          <ul className="collection-list" aria-label={t("最近のローカルプロジェクト", "Recent local projects")}>
            {recentProjects.map((project) => (
              <li key={project.target}>
                <div>
                  <strong>{project.name}</strong>
                  <span>{new Date(project.lastOpenedAt).toLocaleString(locale === "ja" ? "ja-JP" : "en-US")}</span>
                </div>
                <button type="button" onClick={() => onOpenRecent?.(project)}>
                  {t("開く", "Open")}
                </button>
                <button type="button" onClick={() => onRemoveRecent?.(project.target)}>
                  {t("履歴から削除", "Remove from history")}
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
          {t("新しい実験を始める", "Start a new experiment")} <span aria-hidden="true">→</span>
        </button>
      </section>
    </div>
  );
}
