import { localizedText, useAppLocale } from "../../app/appLocale";
import type { GraphExportFeedback } from "./experimentGraphUserExports";

type Props = Readonly<{
  graphTypeLabel: string;
  layerDescription: string;
  graphTitleFontSize: number;
  hasData: boolean;
  reviewSetAvailable: boolean;
  copyStatus: string | null;
  exportFeedback: GraphExportFeedback | null;
  evaluationStatus: string | null;
  fitOverview: boolean;
  evaluationActionLabel: string | null;
  evaluationActionDisabled: boolean;
  onCopy: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportCsv: () => void;
  onExportReviewSet: () => void;
  onFinalizeEvaluation: () => void;
  onFitOverviewChange: (fit: boolean) => void;
}>;

export function ExperimentGraphCanvasToolbar({
  graphTypeLabel,
  layerDescription,
  graphTitleFontSize,
  hasData,
  reviewSetAvailable,
  copyStatus,
  exportFeedback,
  evaluationStatus,
  fitOverview,
  evaluationActionLabel,
  evaluationActionDisabled,
  onCopy,
  onExportSvg,
  onExportPng,
  onExportCsv,
  onExportReviewSet,
  onFinalizeEvaluation,
  onFitOverviewChange,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  return (
    <>
      <div className="experiment-graph-canvas-heading">
        <div>
          <p className="experiment-graph-overline">{graphTypeLabel}</p>
          <h3 style={{ fontSize: graphTitleFontSize, color: "#000" }}>{layerDescription}</h3>
        </div>
        <div
          className="experiment-graph-export-actions"
          aria-label={t("グラフの書き出し", "Graph export")}
        >
          <button
            type="button"
            aria-label={t("グラフをコピー", "Copy Graph")}
            disabled={!hasData}
            onClick={onCopy}
          >
            {t("コピー", "Copy")}
          </button>
          <button
            type="button"
            aria-label={t("SVGを書き出す", "Export SVG")}
            disabled={!hasData}
            onClick={onExportSvg}
          >
            SVG
          </button>
          <button
            type="button"
            aria-label={t("PNGを書き出す", "Export PNG")}
            disabled={!hasData}
            onClick={onExportPng}
          >
            PNG
          </button>
          <button
            type="button"
            aria-label={t("表示データCSV", "Export displayed data as CSV")}
            disabled={!hasData}
            onClick={onExportCsv}
          >
            CSV
          </button>
          <button
            type="button"
            aria-label={t("解析レビューセットを書き出す", "Export analysis review set")}
            disabled={!hasData || !reviewSetAvailable}
            onClick={onExportReviewSet}
            title={
              reviewSetAvailable
                ? undefined
                : t(
                    "解析を実行すると、Graph・結果・Methods・データを1つのHTMLにまとめられます",
                    "Run the analysis to combine the Graph, results, Methods, and data in one HTML file",
                  )
            }
          >
            {t("レビュー", "Review")}
          </button>
          {evaluationActionLabel ? (
            <button
              type="button"
              aria-label={evaluationActionLabel}
              disabled={evaluationActionDisabled}
              onClick={onFinalizeEvaluation}
            >
              {evaluationActionLabel}
            </button>
          ) : null}
        </div>
      </div>
      {copyStatus ? (
        <p className="experiment-graph-copy-status" role="status">
          {copyStatus}
        </p>
      ) : null}
      {exportFeedback ? (
        <p
          className={`experiment-graph-copy-status${exportFeedback.kind === "error" ? " experiment-graph-copy-status--error" : ""}`}
          role={exportFeedback.kind === "error" ? "alert" : "status"}
        >
          {exportFeedback.text}
        </p>
      ) : null}
      {evaluationStatus ? <p role="status">{evaluationStatus}</p> : null}
      {hasData ? (
        <div
          className="experiment-graph-view-controls"
          role="group"
          aria-label={t("Graph表示サイズ", "Graph display size")}
        >
          <button
            className={!fitOverview ? "is-active" : ""}
            type="button"
            aria-pressed={!fitOverview}
            onClick={() => onFitOverviewChange(false)}
          >
            {t("実寸（横スクロール）", "Readable size (horizontal scroll)")}
          </button>
          <button
            className={fitOverview ? "is-active" : ""}
            type="button"
            aria-pressed={fitOverview}
            onClick={() => onFitOverviewChange(true)}
          >
            {t("画面に全体を収める", "Fit entire Graph")}
          </button>
        </div>
      ) : null}
    </>
  );
}
