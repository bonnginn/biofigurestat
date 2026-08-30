import type { AppRoute, PrimaryRouteId } from "../app/routes";
import { useAppLocale } from "../app/appLocale";

type RouteCardProps = {
  route: {
    id: PrimaryRouteId;
    title: string;
    titleEn: string;
    description: string;
    descriptionEn: string;
    japaneseDescription: string;
    englishDescription: string;
    eyebrow: string;
    accent: string;
  };
  onNavigate: (route: AppRoute) => void;
};

export function RouteCard({ route, onNavigate }: RouteCardProps) {
  const locale = useAppLocale();
  const title = locale === "ja" ? route.title : route.titleEn;
  return (
    <button
      className={`route-card route-card--${route.accent}`}
      type="button"
      data-primary-route={route.id}
      onClick={() => onNavigate(route.id)}
    >
      <span className="route-card-topline">
        <span className="route-card-eyebrow">{route.eyebrow}</span>
        <span className="route-card-arrow" aria-hidden="true">
          ↗
        </span>
      </span>
      <span className="route-card-title">{title}</span>
      <span className="route-card-description">
        {locale === "ja" ? route.description : route.descriptionEn}
      </span>
      <span className="route-card-japanese">
        {locale === "ja" ? route.japaneseDescription : route.englishDescription}
      </span>
    </button>
  );
}
