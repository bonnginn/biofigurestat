import { localizedText, useAppLocale } from "../../app/appLocale";
import type { GraphOnlyColumnIndex as ColumnIndex } from "../../app/graphOnlyVisualizationInput";
import type { GraphOnlyGraphType } from "../../app/graphOnlyVisualizationState";
import { experimentGraphTypeLabel } from "./experimentGraphTypeLabel";

const GRAPH_ONLY_GRAPH_TYPES: readonly GraphOnlyGraphType[] = [
  "dot",
  "box",
  "violin",
  "bar",
  "line",
];

type GraphOnlyColumnMappingPanelProps = Readonly<{
  headers: readonly string[];
  rowCount: number;
  xColumn: ColumnIndex;
  yColumn: ColumnIndex;
  seriesColumn: ColumnIndex;
  idColumn: ColumnIndex;
  preferredGraphType: GraphOnlyGraphType;
  duplicateMapping: boolean;
  finiteYCount: number;
  skippedYCount: number;
  seriesMappingLooksLikeId: boolean;
  allowUniqueSeries: boolean;
  onXColumnChange: (column: ColumnIndex) => void;
  onYColumnChange: (column: ColumnIndex) => void;
  onSeriesColumnChange: (column: ColumnIndex) => void;
  onIdColumnChange: (column: ColumnIndex) => void;
  onPreferredGraphTypeChange: (graphType: GraphOnlyGraphType) => void;
  onAllowUniqueSeriesChange: (allowed: boolean) => void;
}>;

function selectedColumn(value: string): ColumnIndex {
  return value === "" ? "" : Number(value);
}

export function GraphOnlyColumnMappingPanel({
  headers,
  rowCount,
  xColumn,
  yColumn,
  seriesColumn,
  idColumn,
  preferredGraphType,
  duplicateMapping,
  finiteYCount,
  skippedYCount,
  seriesMappingLooksLikeId,
  allowUniqueSeries,
  onXColumnChange,
  onYColumnChange,
  onSeriesColumnChange,
  onIdColumnChange,
  onPreferredGraphTypeChange,
  onAllowUniqueSeriesChange,
}: GraphOnlyColumnMappingPanelProps) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const columns = headers.map((header, index) => (
    <option key={`${index}:${header}`} value={index}>
      {header}
    </option>
  ));

  return (
    <section className="graph-only__mapping" aria-labelledby="graph-only-mapping-heading">
      <h2 id="graph-only-mapping-heading">
        {t("2. Graphに使う列を指定する", "2. Map columns to the Graph")}
      </h2>
      <p className="graph-only__subtle">
        {t(
          "空の直接入力シートでは最初の2列だけをXとYへ対応付けています。見出しが変わる表の貼り付け・ファイル読込では列の意味を推測せず指定を解除するため、表を見て横軸・測定値・（必要なら）グループ列を選んでください。",
          "On a blank worksheet, only the first two columns are initially mapped to X and Y. When pasted or imported headers change, mappings are cleared instead of guessed. Review the table and select the X axis, measured value, and optional series column.",
        )}
      </p>
      <div className="graph-only__mapping-grid">
        <label className="experiment-start__field">
          <span>{t("横軸（カテゴリまたはX）", "X axis (category or numeric X)")}</span>
          <select
            aria-label={t("Graphの横軸", "Graph X axis")}
            value={xColumn}
            onChange={(event) => onXColumnChange(selectedColumn(event.target.value))}
          >
            <option value="">{t("列を選択", "Select a column")}</option>
            {columns}
          </select>
        </label>
        <label className="experiment-start__field">
          <span>{t("測定値（数値）", "Measured value (numeric)")}</span>
          <select
            aria-label={t("Graphの測定値", "Graph measured value")}
            value={yColumn}
            onChange={(event) => onYColumnChange(selectedColumn(event.target.value))}
          >
            <option value="">{t("列を選択", "Select a column")}</option>
            {columns}
          </select>
        </label>
        <label className="experiment-start__field">
          <span>{t("色・線で分ける系列（任意）", "Series for color or line (optional)")}</span>
          <select
            aria-label={t("Graphの系列", "Graph series")}
            value={seriesColumn}
            onChange={(event) => onSeriesColumnChange(selectedColumn(event.target.value))}
          >
            <option value="">{t("系列で分けない", "Do not split into series")}</option>
            {columns}
          </select>
          <small>
            {t(
              "薬剤の種類やgenotypeなど、同じ系列に複数の点がある列です。試料IDは右へ指定します。",
              "Use a column such as drug type or genotype, where each series contains multiple points. Specify sample IDs separately.",
            )}
          </small>
        </label>
        <label className="experiment-start__field">
          <span>{t("対象・試料ID（任意）", "Subject or sample ID (optional)")}</span>
          <select
            aria-label={t("Graph用データの対象ID", "Subject ID for Graph data")}
            value={idColumn}
            onChange={(event) => onIdColumnChange(selectedColumn(event.target.value))}
          >
            <option value="">{t("ID列を指定しない", "No ID column")}</option>
            {columns}
          </select>
          <small>
            {t(
              "dish ID・Animal IDなどです。IDは凡例や色分けには使いません。",
              "Examples include dish ID or animal ID. IDs are not used for legends or color grouping.",
            )}
          </small>
        </label>
        <label className="experiment-start__field">
          <span>{t("最初に表示するグラフ", "Initial Graph type")}</span>
          <select
            aria-label={t("最初に表示するグラフ", "Initial Graph type")}
            value={preferredGraphType}
            onChange={(event) =>
              onPreferredGraphTypeChange(event.target.value as GraphOnlyGraphType)
            }
          >
            {GRAPH_ONLY_GRAPH_TYPES.map((graphType) => (
              <option key={graphType} value={graphType}>
                {experimentGraphTypeLabel(graphType, locale)}
              </option>
            ))}
          </select>
          <small>
            {t(
              "Graph editorを開いた後も「グラフ全体」から変更できます。",
              "You can also change this under Entire Graph after opening the Graph editor.",
            )}
          </small>
        </label>
      </div>
      {duplicateMapping ? (
        <p className="graph-only__error" role="alert">
          {t(
            "同じ列を複数の役割には使えません。別の列を選んでください。",
            "A column cannot have more than one role. Select a different column.",
          )}
        </p>
      ) : null}
      {yColumn !== "" && finiteYCount === 0 && rowCount > 0 ? (
        <p className="graph-only__error" role="alert">
          {t(
            "測定値の列に数値がありません。数値列を指定してください。",
            "The measured-value column contains no numeric values. Select a numeric column.",
          )}
        </p>
      ) : null}
      {yColumn !== "" && finiteYCount > 0 && skippedYCount > 0 ? (
        <p className="graph-only__subtle">
          {t(
            `数値として読めない ${skippedYCount} 行はGraphに表示せず、元の表には残します。`,
            `${skippedYCount} row(s) that cannot be read as numbers are omitted from the Graph but retained in the source table.`,
          )}
        </p>
      ) : null}
      {seriesMappingLooksLikeId ? (
        <div className="graph-only__mapping-warning" role="alert">
          <strong>
            {t(
              "選んだ系列列は、各行で値がすべて異なります。",
              "Every row has a different value in the selected series column.",
            )}
          </strong>
          <p>
            {t(
              "試料IDの可能性があります。dish ID・Animal IDなどなら「対象・試料ID」へ移してください。",
              "This may be a sample ID. If it is a dish ID, animal ID, or similar identifier, move it to Subject or sample ID.",
            )}
          </p>
          <label>
            <input
              type="checkbox"
              checked={allowUniqueSeries}
              onChange={(event) => onAllowUniqueSeriesChange(event.target.checked)}
            />
            {t(
              "各行を別系列として表示する意図である",
              "I intend to display every row as a separate series",
            )}
          </label>
        </div>
      ) : null}
    </section>
  );
}
