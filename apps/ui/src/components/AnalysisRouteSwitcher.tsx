import { specializedAnalysisRoutes, type AppRoute } from "../app/routes";
import type { AnalysisRouteSwitcherAccess } from "../app/analysisRouteSwitcherAccess";

export function AnalysisRouteSwitcher({
  access,
  current,
  onNavigate,
}: Readonly<{
  access?: AnalysisRouteSwitcherAccess;
  current: AppRoute;
  onNavigate?: (route: AppRoute) => void;
}>) {
  if (access !== "development_audit" || !onNavigate) return null;
  return (
    <nav className="analysis-route-switcher" aria-label="専門解析の切り替え">
      <span>専門解析</span>
      <select
        aria-label="専門解析を切り替える"
        value={current}
        onChange={(event) => onNavigate(event.target.value as AppRoute)}
      >
        {specializedAnalysisRoutes.map((route) => (
          <option key={route.id} value={route.id}>
            {route.title}
          </option>
        ))}
      </select>
      <small>入力途中の内容は解析ごとに一時保持します。プロジェクト保存とは別です。</small>
    </nav>
  );
}
