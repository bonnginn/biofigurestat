import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ReadoutShape } from "../../app/experimentDraft";

type Props = Readonly<{
  semanticReadiness: "resolved" | "unresolved_descriptive";
  activeLayerDescription: string;
  shape: ReadoutShape;
  isCorrelation: boolean;
  conditionUnitLabel: string;
  sharedSourceUnitLabel?: string;
  readoutLabel: string;
  referenceLabel?: string;
}>;

export function ExperimentGraphCanvasCaption({
  semanticReadiness,
  activeLayerDescription,
  shape,
  isCorrelation,
  conditionUnitLabel,
  sharedSourceUnitLabel,
  readoutLabel,
  referenceLabel,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);

  let caption: string;
  if (semanticReadiness === "unresolved_descriptive") {
    caption = t(
      `現在の表示：${activeLayerDescription}。元の表の行を保持した記述的Graphです。行数をbiological nや対応関係とは解釈していません。`,
      `Current display: ${activeLayerDescription}. This descriptive Graph retains the source-table rows without interpreting row count as biological n or a matched relationship.`,
    );
  } else if (sharedSourceUnitLabel) {
    caption = t(
      `各点は条件別${conditionUnitLabel}の値です。同じ${sharedSourceUnitLabel}に由来する組は共有IDで対応づけていますが、条件別${conditionUnitLabel}は別の実験単位として保持しています。`,
      `Each point is a condition-specific ${conditionUnitLabel} value. Units from the same ${sharedSourceUnitLabel} are matched by a shared ID while remaining separate experimental units across conditions.`,
    );
  } else if (shape === "categorical_counts") {
    caption = t(
      "カテゴリ別countを保持し、構成割合を自動計算しています。連続値として扱わず、カテゴリ構成の推論統計はまだ実行しません。",
      "Category counts are retained and composition fractions are calculated automatically. They are not treated as continuous values, and inferential statistics for category composition are not run here.",
    );
  } else if (isCorrelation) {
    caption = t(
      "各点は同じ実験単位から得たXとYの完全な1組です。行順や日付から対応を推測していません。",
      "Each point is one complete X/Y pair from the same experimental unit. Matching is not inferred from row order or dates.",
    );
  } else if (shape === "wb_ratio") {
    caption = t(
      `各点は実験単位（Exp）ごとの${readoutLabel} / ${referenceLabel ?? "reference"}です。標的とreferenceの生値は別々に保持しています。`,
      `Each point is ${readoutLabel} / ${referenceLabel ?? "reference"} for one experimental unit (Exp). Raw target and reference values are retained separately.`,
    );
  } else if (shape === "proportion") {
    caption = t(
      `現在の表示：${activeLayerDescription}。割合と要約は実験単位（Exp）から計算しています。`,
      `Current display: ${activeLayerDescription}. Proportions and summaries are calculated from experimental units (Exp).`,
    );
  } else {
    caption = t(
      `現在の表示：${activeLayerDescription}。細胞・ROIなどの生データを表示しても、統計上のnは実験単位です。`,
      `Current display: ${activeLayerDescription}. Showing raw cell or ROI data does not change statistical n, which remains the experimental unit.`,
    );
  }

  return <p className="experiment-graph-caption">{caption}</p>;
}
