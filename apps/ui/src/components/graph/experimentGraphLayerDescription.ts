import type { ExperimentSetDraft, ReadoutDraft } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import { localizedText, type AppLocale } from "../../app/appLocale";

export function describeActiveGraphLayers(
  input: Readonly<{
    graphType: WorkspaceGraphState["graphType"];
    shape: ReadoutDraft["shape"];
    layers: WorkspaceGraphState["layers"];
    errorBar: WorkspaceGraphState["appearance"]["errorBar"];
    timeSampling: ExperimentSetDraft["time"]["sampling"];
    matched: boolean;
    semanticReadiness?: "resolved" | "unresolved_descriptive";
  }>,
  locale: AppLocale = "en",
): string {
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const {
    graphType,
    shape,
    layers,
    errorBar,
    timeSampling,
    matched,
    semanticReadiness = "resolved",
  } = input;
  const rawObservationLabel =
    semanticReadiness === "unresolved_descriptive"
      ? t("元表の行", "Table rows")
      : t("生の観測値", "Raw observations");
  const experimentSummaryLabel =
    semanticReadiness === "unresolved_descriptive"
      ? t("元表の行", "Table rows")
      : shape === "nested_continuous"
        ? t("実験単位の要約", "Experiment summaries")
        : t("生物学的反復", "Biological replicates");
  if (shape === "categorical_counts") {
    if (graphType === "stacked") return t("カテゴリ数の積み上げ", "Stacked category counts");
    if (graphType === "category_percentage") return t("カテゴリの割合", "Category percentages");
    return t("100%積み上げ構成", "100% stacked composition");
  }
  if (graphType === "scatter") return t("対応するX–Y観測値", "Paired X–Y observations");
  if (graphType === "line") {
    const parts = [
      ...(timeSampling === "longitudinal" && matched
        ? [t("個体ごとの軌跡", "Individual trajectories")]
        : []),
      t("要約トレンド", "Summary trend"),
      ...(layers.experiment
        ? [experimentSummaryLabel]
        : []),
      ...(layers.overall && layers.errorBar && errorBar !== "none"
        ? [t(`${errorBar.toUpperCase()}エラーバー`, `${errorBar.toUpperCase()} error bars`)]
        : []),
    ];
    return parts.join(" + ");
  }
  if (graphType === "paired_dot") {
    return (
      [
        ...(layers.experiment ? [t("対応する観測値", "Paired observations")] : []),
        ...(layers.connectingLine ? [t("対応線", "Connecting lines")] : []),
        ...(layers.overall
          ? [
              layers.errorBar && errorBar !== "none"
                ? t(`平均 ± ${errorBar.toUpperCase()}`, `Mean ± ${errorBar.toUpperCase()}`)
                : t("平均", "Mean"),
            ]
          : []),
      ].join(" + ") || t("対応グラフ", "Paired Graph")
    );
  }

  const parts: string[] = [];
  const pushUnique = (label: string) => {
    if (!parts.includes(label)) parts.push(label);
  };
  if (graphType === "bar") parts.push(t("棒（平均）", "Bars (Mean)"));
  if (layers.violin) parts.push(t("分布", "Distribution"));
  if (layers.box || (shape === "nested_continuous" && layers.distribution)) {
    parts.push(t("箱ひげ図", "Box plot"));
  }
  if (shape === "nested_continuous" && layers.raw)
    pushUnique(rawObservationLabel);
  if (layers.experiment) {
    pushUnique(experimentSummaryLabel);
  }
  if (layers.overall && graphType !== "bar") {
    if (layers.errorBar && errorBar !== "none") {
      parts.push(
        graphType === "dot"
          ? t(`平均 ± ${errorBar.toUpperCase()}`, `Mean ± ${errorBar.toUpperCase()}`)
          : t(`${errorBar.toUpperCase()}エラーバー`, `${errorBar.toUpperCase()} error bars`),
      );
    } else {
      parts.push(t("平均", "Mean"));
    }
  } else if (graphType === "bar" && layers.overall && layers.errorBar && errorBar !== "none") {
    parts.push(t(`${errorBar.toUpperCase()}エラーバー`, `${errorBar.toUpperCase()} error bars`));
  }
  return parts.join(" + ") || t("表示レイヤーなし", "No data layers selected");
}
