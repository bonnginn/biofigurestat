import { localizedText, useAppLocale } from "../../app/appLocale";
import type { ReadoutShape } from "../../app/experimentDraft";
import type { WorkspaceGraphState } from "../../app/experimentWorkspaceProject";
import type { GraphInspectorTarget } from "./useExperimentGraphWorkspaceEffects";

type Props = Readonly<{
  inspectorTarget: GraphInspectorTarget;
  layers: WorkspaceGraphState["layers"];
  shape: ReadoutShape;
  visualSeriesCount: number;
  allowAnnotation: boolean;
  allowStatistics: boolean;
  onInspect: (target: GraphInspectorTarget) => void;
  onLayersChange: (layers: WorkspaceGraphState["layers"]) => void;
}>;

export function ExperimentGraphInspectorTarget({
  inspectorTarget,
  layers,
  shape,
  visualSeriesCount,
  allowAnnotation,
  allowStatistics,
  onInspect,
  onLayersChange,
}: Props) {
  const locale = useAppLocale();
  const t = (ja: string, en: string) => localizedText(locale, ja, en);
  const toggleLayer = (layer: "raw" | "experiment" | "overall") =>
    onLayersChange({ ...layers, [layer]: !layers[layer] });

  return (
    <div className="experiment-graph-inspector-target">
      <label className="experiment-graph-field">
        <span>{t("編集対象", "Edit")}</span>
        <select
          aria-label={t("編集対象", "Edit target")}
          value={inspectorTarget}
          onChange={(event) => onInspect(event.target.value as GraphInspectorTarget)}
        >
          <option value="background">{t("グラフ全体", "Entire Graph")}</option>
          <option value="x-axis">{t("X軸", "X axis")}</option>
          <option value="y-axis">{t("Y軸", "Y axis")}</option>
          <option value="data">{t("データ", "Data")}</option>
          <option value="raw-dots">{t("生データの点", "Raw-data points")}</option>
          <option value="experiment-summary">
            {t("実験単位の要約", "Experimental-unit summary")}
          </option>
          <option value="series-style">
            {t("系列の色・線・点", "Series color, line, and symbol")}
          </option>
          <option value="violin">{t("バイオリン", "Violin")}</option>
          <option value="box">{t("箱ひげ", "Box plot")}</option>
          <option value="error-bar">{t("誤差線", "Error bars")}</option>
          <option value="connecting-line">{t("接続線", "Connecting lines")}</option>
          <option value="legend">{t("凡例", "Legend")}</option>
          {allowAnnotation ? (
            <option value="annotation">{t("統計注釈", "Statistical annotations")}</option>
          ) : null}
          {allowStatistics ? (
            <option value="statistics">{t("統計解析", "Statistical analysis")}</option>
          ) : null}
        </select>
      </label>
      <div
        className="experiment-graph-layer-shortcuts"
        aria-label={t("現在の表示レイヤー", "Visible layers")}
      >
        <span>{t("表示中", "Visible")}</span>
        {shape === "nested_continuous" ? (
          <button type="button" aria-pressed={layers.raw} onClick={() => toggleLayer("raw")}>
            {t("生データ", "Raw data")}
          </button>
        ) : null}
        <button
          type="button"
          aria-pressed={layers.experiment}
          onClick={() => toggleLayer("experiment")}
        >
          {t("実験単位の点", "Experimental-unit points")}
        </button>
        <button type="button" aria-pressed={layers.overall} onClick={() => toggleLayer("overall")}>
          {t("要約", "Summary")}
        </button>
        {visualSeriesCount > 1 ? (
          <button type="button" onClick={() => onInspect("series-style")}>
            {t("系列を編集", "Edit series")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
