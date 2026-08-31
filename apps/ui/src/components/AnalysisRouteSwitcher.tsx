import { specializedAnalysisRoutes, type AppRoute } from "../app/routes";
import type { AnalysisRouteSwitcherAccess } from "../app/analysisRouteSwitcherAccess";
import { localizedText, useAppLocale } from "../app/appLocale";

export function AnalysisRouteSwitcher({
  access,
  current,
  onNavigate,
}: Readonly<{
  access?: AnalysisRouteSwitcherAccess;
  current: AppRoute;
  onNavigate?: (route: AppRoute) => void;
}>) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  if (access !== "development_audit" || !onNavigate) return null;
  return (
    <nav className="analysis-route-switcher" aria-label={t("専門解析の切り替え", "Switch specialized analysis")}>
      <span>{t("専門解析", "Specialized analysis")}</span>
      <select
        aria-label={t("専門解析を切り替える", "Switch specialized analysis")}
        value={current}
        onChange={(event) => onNavigate(event.target.value as AppRoute)}
      >
        {specializedAnalysisRoutes.map((route) => (
          <option key={route.id} value={route.id}>
            {route.title}
          </option>
        ))}
      </select>
      <small>{t("入力途中の内容は解析ごとに一時保持します。プロジェクト保存とは別です。", "In-progress content is retained temporarily for each analysis. This is separate from project saving.")}</small>
    </nav>
  );
}
