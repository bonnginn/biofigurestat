import type { ReadoutDraft } from "../../app/experimentDraft";
import { localizedText, useAppLocale } from "../../app/appLocale";
import type { GraphSeries } from "./experimentGraphDataExport";

type ExperimentGraphDataSummaryProps = Readonly<{
  shape: ReadoutDraft["shape"];
  series: readonly GraphSeries[];
}>;

function SeriesLabel({ series }: { series: GraphSeries }) {
  const locale = useAppLocale();
  const separator = localizedText(locale, "・", " · ");
  return (
    <strong>
      {series.conditionLabel}
      {series.timeLabel ? `${separator}${series.timeLabel}` : ""}
    </strong>
  );
}

export function ExperimentGraphDataSummary({ shape, series }: ExperimentGraphDataSummaryProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  if (shape === "categorical_counts") {
    return (
      <p>
        {t(
          "カテゴリ別のcountと自動計算した割合を使用しています。",
          "Uses category counts and automatically calculated proportions.",
        )}
      </p>
    );
  }

  const ariaLabel =
    shape === "proportion"
      ? t("割合データの要約", "Proportion-data summary")
      : shape === "nested_continuous"
        ? t("階層データの要約", "Hierarchical-data summary")
        : t("WB比の要約", "Western blot ratio summary");

  return (
    <div className="experiment-graph-data-summary" aria-label={ariaLabel}>
      {series.map((item) => (
        <div className="experiment-graph-summary-row" key={item.seriesKey}>
          <SeriesLabel series={item} />
          <span>
            {shape === "proportion"
              ? t(
                  `${item.proportionPoints.length}実験単位・`,
                  `${item.proportionPoints.length} experimental units · `,
                ) +
                (item.proportionPoints
                  .map((point) => `${point.positive}/${point.eligible}`)
                  .join(t("、", ", ")) || t("有効値なし", "no valid values"))
              : shape === "nested_continuous"
                ? t(
                    `実験単位 ${item.experimentPoints.length}、細胞・ROI ${item.rawPoints.length}`,
                    `Experimental units ${item.experimentPoints.length}, cells/ROIs ${item.rawPoints.length}`,
                  )
                : t(
                    `実験単位 ${item.experimentPoints.length}`,
                    `Experimental units ${item.experimentPoints.length}`,
                  )}
          </span>
        </div>
      ))}
    </div>
  );
}
