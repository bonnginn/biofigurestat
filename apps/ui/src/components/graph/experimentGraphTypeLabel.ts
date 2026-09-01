import type { AppLocale } from "../../app/appLocale";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";

type GraphType = WorkspaceGraphState["graphType"];

const GRAPH_TYPE_LABELS: Record<GraphType, Readonly<{ ja: string; en: string }>> = {
  dot: { ja: "ドット", en: "Dot" },
  paired_dot: { ja: "対応を線で結ぶ", en: "Paired / matched dot" },
  box: { ja: "箱ひげ", en: "Box" },
  violin: { ja: "バイオリン", en: "Violin" },
  bar: { ja: "棒", en: "Bar" },
  line: { ja: "折れ線／経時変化", en: "Line / Time course" },
  scatter: { ja: "散布図", en: "Scatter" },
  stacked: { ja: "カテゴリ数の積み上げ", en: "Stacked count" },
  stacked_100: { ja: "100%積み上げ", en: "100% stacked" },
  category_percentage: { ja: "カテゴリの割合", en: "Category percentage" },
};

export function experimentGraphTypeLabel(graphType: GraphType, locale: AppLocale): string {
  return GRAPH_TYPE_LABELS[graphType][locale];
}
