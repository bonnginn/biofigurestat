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
  {
    id: "survival",
    path: "/survival",
    title: "Survival解析",
    description: "Event/Censoredを保ったKaplan–Meier解析です。",
    japaneseDescription: "log-rank検定とnumber-at-riskを表示します。",
    eyebrow: "05",
    accent: "green",
  },
  {
    id: "heatmap",
    path: "/heatmap",
    title: "Heatmap",
    description: "行列データを明示変換つきで可視化します。",
    japaneseDescription: "欠損値と生の行列を保持します。",
    eyebrow: "06",
    accent: "violet",
  },
  {
    id: "contingency",
    path: "/contingency",
    title: "Categorical counts",
    description: "独立countまたは対応binaryを解析します。",
    japaneseDescription: "Fisher・Chi-square・McNemarを構造で分離します。",
    eyebrow: "07",
    accent: "orange",
  },
  {
    id: "repeated-nonparametric",
    path: "/repeated-nonparametric",
    title: "反復ノンパラメトリック",
    description: "対応IDを保持したrank解析です。",
    japaneseDescription: "Friedman + Holm-Wilcoxonを実行します。",
    eyebrow: "08",
    accent: "blue",
  },
  {
    id: "regression",
    path: "/regression",
    title: "単回帰",
    description: "相関とは別のOLS回帰です。",
    japaneseDescription: "回帰線・傾きCI・R²を表示します。",
    eyebrow: "09",
    accent: "green",
  },
  {
    id: "distribution",
    path: "/distribution",
    title: "分布Graph",
    description: "HistogramとECDFを作成します。",
    japaneseDescription: "元の個別値を保持し、検定を自動追加しません。",
    eyebrow: "10",
    accent: "violet",
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
