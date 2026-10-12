import type { AppRoute, PrimaryRouteId } from "../app/routes";

type RouteCardProps = {
  route: {
    id: PrimaryRouteId;
    title: string;
    description: string;
    japaneseDescription: string;
    eyebrow: string;
    accent: string;
  };
  onNavigate: (route: AppRoute) => void;
};

export function RouteCard({ route, onNavigate }: RouteCardProps) {
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
      <span className="route-card-title">{route.title}</span>
      <span className="route-card-description">{route.description}</span>
      <span className="route-card-japanese">{route.japaneseDescription}</span>
    </button>
  );
}
