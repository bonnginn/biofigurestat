export const primaryRoutes = [
  {
    id: "favorites",
    path: "/favorites",
    title: "お気に入り",
    description: "保存した実験デザインをすぐに開きます。",
    japaneseDescription: "実験デザインだけを保存し、データはコピーしません。",
    eyebrow: "01",
    accent: "violet",
  },
  {
    id: "new-experiment",
    path: "/new-experiment",
    title: "新しい実験",
    description: "実験の目的と構造から解析を始めます。",
    japaneseDescription: "設計に合った入力画面を作成します。",
    eyebrow: "02",
    accent: "blue",
  },
  {
    id: "recent",
    path: "/recent",
    title: "最近のプロジェクト",
    description: "最近開いたプロジェクトを続きから開きます。",
    japaneseDescription: "保存済みのデータと解析履歴を確認します。",
    eyebrow: "03",
    accent: "green",
  },
  {
    id: "open-project",
    path: "/open-project",
    title: "プロジェクトを開く",
    description: "このコンピューター上のプロジェクトを開きます。",
    japaneseDescription: "プロジェクトの整合性を確認して復元します。",
    eyebrow: "04",
    accent: "orange",
  },
] as const;

export type PrimaryRouteId = (typeof primaryRoutes)[number]["id"];
export type AppRoute = "home" | PrimaryRouteId;

export function routeFromPath(pathname: string): AppRoute {
  const route = primaryRoutes.find((candidate) => candidate.path === pathname);
  return route?.id ?? "home";
}

export function pathForRoute(route: AppRoute): string {
  if (route === "home") {
    return "/";
  }

  return primaryRoutes.find((candidate) => candidate.id === route)?.path ?? "/";
}
