export const workspaceRoutes = [
  {
    id: "favorites",
    path: "/favorites",
    title: "お気に入り",
    titleEn: "Favorites",
    description: "保存した実験デザインをすぐに開きます。",
    descriptionEn: "Open a saved experiment design.",
    japaneseDescription: "実験デザインだけを保存し、データはコピーしません。",
    englishDescription: "Only the design is reused; experimental data are never copied.",
    eyebrow: "01",
    accent: "violet",
  },
  {
    id: "new-experiment",
    path: "/new-experiment",
    title: "新しい実験",
    titleEn: "New experiment",
    description: "実験の目的と構造から解析を始めます。",
    descriptionEn: "Start from the purpose and structure of your experiment.",
    japaneseDescription: "設計に合った入力画面を作成します。",
    englishDescription: "BioFigureStat creates a worksheet that matches the design.",
    eyebrow: "02",
    accent: "blue",
  },
  {
    id: "recent",
    path: "/recent",
    title: "最近のプロジェクト",
    titleEn: "Recent projects",
    description: "最近開いたプロジェクトを続きから開きます。",
    descriptionEn: "Continue working on a recently opened project.",
    japaneseDescription: "保存済みのデータと解析履歴を確認します。",
    englishDescription: "Review saved data and analysis history.",
    eyebrow: "03",
    accent: "green",
  },
  {
    id: "open-project",
    path: "/open-project",
    title: "プロジェクトを開く",
    titleEn: "Open project",
    description: "このコンピューター上のプロジェクトを開きます。",
    descriptionEn: "Open a project stored on this computer.",
    japaneseDescription: "プロジェクトの整合性を確認して復元します。",
    englishDescription: "Project integrity is checked before the workspace is restored.",
    eyebrow: "04",
    accent: "orange",
  },
] as const;

export const specializedAnalysisRoutes = [
  {
    id: "survival",
    path: "/survival",
    title: "生存時間解析",
    titleEn: "Survival analysis",
    description: "Event/Censoredを保ったKaplan–Meier解析です。",
    descriptionEn: "Kaplan–Meier analysis with explicit event and censoring status.",
    japaneseDescription: "log-rank検定とnumber-at-riskを表示します。",
    englishDescription: "Includes the log-rank test and number-at-risk table.",
    eyebrow: "05",
    accent: "green",
  },
  {
    id: "heatmap",
    path: "/heatmap",
    title: "ヒートマップ",
    titleEn: "Heatmap",
    description: "行列データを明示変換つきで可視化します。",
    descriptionEn: "Visualize matrix data with explicit transformations.",
    japaneseDescription: "欠損値と生の行列を保持します。",
    englishDescription: "Missing values and the original matrix are preserved.",
    eyebrow: "06",
    accent: "violet",
  },
  {
    id: "contingency",
    path: "/contingency",
    title: "カテゴリ集計",
    titleEn: "Categorical counts",
    description: "独立countまたは対応binaryを解析します。",
    descriptionEn: "Analyze independent counts or paired binary outcomes.",
    japaneseDescription: "Fisher・Chi-square・McNemarを構造で分離します。",
    englishDescription: "Fisher, chi-square, and McNemar are routed by design structure.",
    eyebrow: "07",
    accent: "orange",
  },
  {
    id: "repeated-nonparametric",
    path: "/repeated-nonparametric",
    title: "反復ノンパラメトリック",
    titleEn: "Repeated nonparametric",
    description: "対応IDを保持したrank解析です。",
    descriptionEn: "Rank-based analysis that preserves matched identity.",
    japaneseDescription: "Friedman + Holm-Wilcoxonを実行します。",
    englishDescription: "Runs Friedman with Holm-adjusted Wilcoxon comparisons.",
    eyebrow: "08",
    accent: "blue",
  },
  {
    id: "regression",
    path: "/regression",
    title: "単回帰",
    titleEn: "Simple regression",
    description: "相関とは別のOLS回帰です。",
    descriptionEn: "OLS regression, kept distinct from correlation.",
    japaneseDescription: "回帰線・傾きCI・R²を表示します。",
    englishDescription: "Shows the fitted line, slope CI, and R².",
    eyebrow: "09",
    accent: "green",
  },
  {
    id: "nonlinear-fit",
    path: "/nonlinear-fit",
    title: "濃度–反応・酵素反応",
    titleEn: "Dose-response and enzyme kinetics",
    description: "基質濃度–初速度、または時間–応答を、対応するmodelの選択後にfitします。",
    descriptionEn:
      "Fit substrate concentration–initial velocity or time–response data after selecting the appropriate model.",
    japaneseDescription:
      "観測点と保存済みfit curve、parameter、診断を分離して保持します。Michaelis–Mentenには計算済み初速度を入力します。",
    englishDescription:
      "Observed points, fitted curves, parameters, and diagnostics remain separate. Michaelis–Menten requires calculated initial velocities.",
    eyebrow: "10",
    accent: "blue",
  },
  {
    id: "distribution",
    path: "/distribution",
    title: "分布グラフ",
    titleEn: "Distribution graph",
    description: "HistogramとECDFを作成します。",
    descriptionEn: "Create histograms and empirical cumulative distribution functions.",
    japaneseDescription: "元の個別値を保持し、検定を自動追加しません。",
    englishDescription: "Original observations are preserved and no test is added automatically.",
    eyebrow: "11",
    accent: "violet",
  },
] as const;

export const primaryRoutes = [...workspaceRoutes, ...specializedAnalysisRoutes] as const;

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
